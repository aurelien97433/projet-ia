"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { retryProcessingAction } from "@/app/(app)/documents/[id]/actions";
import { Button } from "@/components/ui/button";
import type { DocumentErrorKind, DocumentStatus } from "@/lib/documents";
import { texts } from "@/lib/texts";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5_000;
const REFRESH_RETRY_MS = 2_000;
const MAX_REFRESH_RETRIES = 5;
const MAX_POLL_FAILURES = 3;
const LONG_PROCESSING_MS = 60_000;

type Status = {
  effectiveStatus: DocumentStatus;
  effectiveErrorKind: DocumentErrorKind | null;
  effectiveErrorMessage: string | null;
  processingElapsedMs: number;
};

type StatusBannerProps = Status & { documentId: string; isAuthor: boolean };

const t = texts.documentStatus;

// Résultat d'une interrogation : le Statut, « gone » si la session a expiré ou si le Document n'est
// plus accessible (401, 404), null pour une panne passagère.
async function fetchStatus(documentId: string): Promise<Status | "gone" | null> {
  try {
    const response = await fetch(`/api/documents/${documentId}/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 404) return "gone";
    return response.ok ? ((await response.json()) as Status) : null;
  } catch {
    return null;
  }
}

// Bandeau de Statut de la page Document (E7). Tant que le Statut est « en cours », il l'interroge
// toutes les 3 s : chaque requête attend la fin de la précédente. Une panne passagère n'interrompt
// pas le suivi ; après trois échecs consécutifs, un message et « Actualiser » s'affichent jusqu'au
// premier succès. Session expirée ou Document inaccessible : le suivi s'arrête et le serveur décide
// de la page à afficher.
export function StatusBanner({
  documentId,
  isAuthor,
  effectiveStatus,
  effectiveErrorKind,
  effectiveErrorMessage,
  processingElapsedMs,
}: StatusBannerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({
    effectiveStatus,
    effectiveErrorKind,
    effectiveErrorMessage,
    processingElapsedMs,
  });
  // Dernier Statut non « prêt » connu à l'ouverture ou reçu du serveur : « prêt » n'est annoncé que
  // s'il vient de changer d'état (E7).
  const [openedStatus, setOpenedStatus] = useState(effectiveStatus);
  const [pollFailing, setPollFailing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  // Sans réponse reçue, le même identifiant est réutilisé : le serveur reconnaît alors le rejeu.
  const retryRequestId = useRef<string | null>(null);
  const pollNow = useRef<(() => Promise<void>) | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  // Incrémenté à la fin d'une action de l'utilisateur seulement, jamais par le suivi automatique.
  const [focusCheck, setFocusCheck] = useState(0);

  // Le Statut reçu du serveur a changé (relance depuis un autre onglet, retour sur la page) : le
  // bandeau s'aligne et, s'il repasse « en cours », le suivi reprend. Seul un changement de la
  // propriété compte : une réponse périmée identique à la précédente est ignorée. Un rafraîchissement
  // tardif peut en revanche ramener « en cours » après un Statut final, le temps d'un cycle (3 s au
  // plus) : l'interrogation qui repart corrige. Pas de garde ici : elle casserait « prêt puis en cours ».
  const serverStatusKey = `${effectiveStatus}:${effectiveErrorKind}`;
  const [lastServerStatusKey, setLastServerStatusKey] = useState(serverStatusKey);
  if (serverStatusKey !== lastServerStatusKey) {
    setLastServerStatusKey(serverStatusKey);
    setStatus({ effectiveStatus, effectiveErrorKind, effectiveErrorMessage, processingElapsedMs });
    setPollFailing(false);
    setRetryError(null);
    if (effectiveStatus !== "ready") setOpenedStatus(effectiveStatus);
  }

  const processing = status.effectiveStatus === "processing";
  const justReady = status.effectiveStatus === "ready" && openedStatus !== "ready";
  const temporaryError = status.effectiveStatus === "error" && status.effectiveErrorKind === "temporary";
  const noTextError = status.effectiveStatus === "error" && status.effectiveErrorKind === "no_text";

  useEffect(() => {
    if (!processing) return;
    let cancelled = false;
    let inFlight: Promise<void> | null = null;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      clearTimeout(timer);
      const next = await fetchStatus(documentId);
      if (cancelled) return;
      if (next === "gone") {
        router.refresh();
        return;
      }
      if (next) {
        failures = 0;
        setPollFailing(false);
        setStatus(next);
        if (next.effectiveStatus !== "processing") return;
      } else {
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) setPollFailing(true);
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    // Jamais deux requêtes à la fois : « Actualiser » rejoint celle qui est en cours.
    const poll = () => {
      inFlight ??= check().finally(() => {
        inFlight = null;
      });
      return inFlight;
    };
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    pollNow.current = poll;

    return () => {
      cancelled = true;
      clearTimeout(timer);
      pollNow.current = null;
    };
  }, [documentId, processing, router]);

  // Le reste de la page (badge) vient du serveur : un rafraîchissement peut renvoyer un état périmé.
  // Tant que le serveur n'a pas rattrapé le Statut suivi, on recommence, dans une limite fixe.
  useEffect(() => {
    if (status.effectiveStatus === effectiveStatus) return;
    router.refresh();
    let retries = 0;
    const timer = setInterval(() => {
      retries += 1;
      router.refresh();
      if (retries >= MAX_REFRESH_RETRIES) clearInterval(timer);
    }, REFRESH_RETRY_MS);
    return () => clearInterval(timer);
  }, [status.effectiveStatus, effectiveStatus, router]);

  // Le bouton activé a disparu : le focus retomberait sur la page, il passe au bandeau.
  useEffect(() => {
    if (focusCheck > 0 && document.activeElement === document.body) bannerRef.current?.focus();
  }, [focusCheck]);

  async function refreshNow() {
    await pollNow.current?.();
    setFocusCheck((count) => count + 1);
  }

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    setRetryError(null);
    retryRequestId.current ??= crypto.randomUUID();
    try {
      const result = await retryProcessingAction(documentId, retryRequestId.current);
      retryRequestId.current = null;
      if (result.status === "error") {
        setRetryError(result.error.message);
        if (result.error.code === "UNAUTHENTICATED" || result.error.code === "NOT_FOUND") router.refresh();
        return;
      }
      setStatus(result.view);
      // Déclenchement refusé : la tentative est abandonnée, le Document reste en erreur temporaire.
      if (result.view.effectiveStatus === "error" && result.view.effectiveErrorKind === "temporary") {
        setRetryError(t.retryFailed);
      }
    } catch {
      setRetryError(t.retryFailed);
    } finally {
      setRetrying(false);
      setFocusCheck((count) => count + 1);
    }
  }

  // Zone toujours présente : un lecteur d'écran n'annonce que les changements d'une zone déjà là.
  // Vide, elle ne doit pas ajouter d'espace : la marge négative annule l'écart de la page.
  return (
    <div ref={bannerRef} tabIndex={-1} role="status" className="empty:-mb-6">
      {processing ? (
        <div className="rounded-lg bg-pending-soft p-4 text-sm text-foreground">
          <p className="font-semibold text-pending">
            <span aria-hidden="true">◔ </span>
            {t.processingTitle}
          </p>
          <p className="mt-1">{status.processingElapsedMs > LONG_PROCESSING_MS ? t.processingLong : t.processingText}</p>
          {pollFailing ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p>{t.statusUnavailable}</p>
              <Button type="button" variant="outline" onClick={refreshNow}>
                {t.refresh}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {justReady ? (
        <div className="rounded-lg bg-success-soft p-4 text-sm font-semibold text-success">
          <span aria-hidden="true">● </span>
          {isAuthor ? t.ready : t.readyOther}
        </div>
      ) : null}

      {temporaryError ? (
        <div className="rounded-lg bg-destructive-soft p-4 text-sm text-foreground">
          <p id="processing-error-reason" className="font-semibold text-destructive">
            <span aria-hidden="true">▲ </span>
            {isAuthor ? t.temporaryAuthor : t.temporaryOther}
          </p>
          {isAuthor ? (
            <div className="mt-3 flex flex-col items-start gap-2">
              <Button
                type="button"
                variant="outline"
                aria-disabled={retrying || undefined}
                aria-describedby="processing-error-reason"
                className={retrying ? "cursor-not-allowed opacity-70" : undefined}
                onClick={retry}
              >
                {retrying ? t.retrying : t.retry}
              </Button>
              {retryError ? <p>{retryError}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {noTextError ? (
        <div className="rounded-lg bg-destructive-soft p-4 text-sm text-foreground">
          <p className="font-semibold text-destructive">
            <span aria-hidden="true">▲ </span>
            {status.effectiveErrorMessage ?? t.noText}
          </p>
        </div>
      ) : null}
    </div>
  );
}
