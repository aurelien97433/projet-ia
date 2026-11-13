"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { retryProcessingAction } from "@/app/(app)/documents/[id]/actions";
import { Button } from "@/components/ui/button";
import { DeleteDocumentButton } from "@/components/documents/delete-document-button";
import { useDocumentStatus } from "@/components/documents/document-status-provider";
import { texts } from "@/lib/texts";

const LONG_PROCESSING_MS = 60_000;

const t = texts.documentStatus;

// Bandeau de Statut de la page Document (E7) : il affiche l'état du fournisseur et porte la relance.
// « Actualiser » apparaît après trois échecs consécutifs de l'interrogation, jusqu'au premier succès.
// Document supprimé pendant la consultation (story 3.4) : ce seul message, avec le retour à la
// Bibliothèque, sans « Réessayer ».
export function StatusBanner({ documentId, title, isAuthor }: { documentId: string; title: string; isAuthor: boolean }) {
  const router = useRouter();
  const { status, justReady, pollFailing, serverStatusKey, pollNow, applyStatus, deleted, markDeleted } = useDocumentStatus();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  // Sans réponse reçue, le même identifiant est réutilisé : le serveur reconnaît alors le rejeu.
  const retryRequestId = useRef<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  // Incrémenté à la fin d'une action de l'utilisateur seulement, jamais par le suivi automatique.
  const [focusCheck, setFocusCheck] = useState(0);

  // Le serveur a resynchronisé le Statut : un échec de relance affiché n'a plus lieu d'être.
  const [lastServerStatusKey, setLastServerStatusKey] = useState(serverStatusKey);
  if (serverStatusKey !== lastServerStatusKey) {
    setLastServerStatusKey(serverStatusKey);
    setRetryError(null);
  }

  const processing = !deleted && status.effectiveStatus === "processing";
  const temporaryError = !deleted && status.effectiveStatus === "error" && status.effectiveErrorKind === "temporary";
  const noTextError = !deleted && status.effectiveStatus === "error" && status.effectiveErrorKind === "no_text";

  // Le bouton activé a disparu : le focus retomberait sur la page, il passe au bandeau.
  useEffect(() => {
    if (focusCheck > 0 && document.activeElement === document.body) bannerRef.current?.focus();
  }, [focusCheck]);

  async function refreshNow() {
    await pollNow();
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
        if (result.error.code === "NOT_FOUND") {
          markDeleted();
          return;
        }
        setRetryError(result.error.message);
        if (result.error.code === "UNAUTHENTICATED") router.refresh();
        return;
      }
      applyStatus(result.view);
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
      {deleted ? (
        <div className="rounded-lg bg-destructive-soft p-4 text-sm text-foreground">
          <p className="font-semibold text-destructive">
            <span aria-hidden="true">▲ </span>
            {t.deleted}
          </p>
          <div className="mt-3">
            <Button asChild variant="outline">
              <Link href="/bibliotheque">{t.backToLibrary}</Link>
            </Button>
          </div>
        </div>
      ) : null}

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

      {justReady && !deleted ? (
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
          <p id="no-text-reason" className="font-semibold text-destructive">
            <span aria-hidden="true">▲ </span>
            {status.effectiveErrorMessage ?? t.noText}
          </p>
          {isAuthor ? (
            <div className="mt-3">
              <DeleteDocumentButton documentId={documentId} title={title} describedBy="no-text-reason" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
