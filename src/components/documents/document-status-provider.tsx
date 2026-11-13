"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { DocumentErrorKind, DocumentStatus } from "@/lib/documents";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5_000;
const REFRESH_RETRY_MS = 2_000;
const MAX_REFRESH_RETRIES = 5;
const MAX_POLL_FAILURES = 3;

export type Status = {
  effectiveStatus: DocumentStatus;
  effectiveErrorKind: DocumentErrorKind | null;
  effectiveErrorMessage: string | null;
  processingElapsedMs: number;
};

type DocumentStatusContextValue = {
  status: Status;
  // « prêt » n'est annoncé que s'il vient de changer d'état (E7).
  justReady: boolean;
  pollFailing: boolean;
  // Dernier Statut reçu du serveur : il change quand le serveur a resynchronisé la page.
  serverStatusKey: string;
  pollNow: () => Promise<void>;
  // Statut renvoyé par une action de l'utilisateur (relance).
  applyStatus: (next: Status) => void;
  // Document supprimé pendant la consultation (story 3.4) : l'état est définitif sur cette page.
  deleted: boolean;
  markDeleted: () => void;
};

const DocumentStatusContext = createContext<DocumentStatusContextValue | null>(null);

export function useDocumentStatus(): DocumentStatusContextValue {
  const value = useContext(DocumentStatusContext);
  if (!value) throw new Error("useDocumentStatus doit être appelé sous DocumentStatusProvider");
  return value;
}

// Résultat d'une interrogation : le Statut, « gone » si la session a expiré (401), « deleted » si le
// Document n'existe plus (404 : supprimé pendant la consultation), null pour une panne passagère.
async function fetchStatus(documentId: string): Promise<Status | "gone" | "deleted" | null> {
  try {
    const response = await fetch(`/api/documents/${documentId}/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    if (response.status === 401) return "gone";
    if (response.status === 404) return "deleted";
    return response.ok ? ((await response.json()) as Status) : null;
  } catch {
    return null;
  }
}

// Source unique du Statut sur la page Document : badge, bandeau et actions lisent cet état et changent
// donc au même rendu. Tant que le Statut est « en cours », il est interrogé toutes les 3 s : chaque
// requête attend la fin de la précédente. Une panne passagère n'interrompt pas le suivi ; après trois
// échecs consécutifs, `pollFailing` reste vrai jusqu'au premier succès. Session expirée ou Document
// supprimé : le suivi s'arrête ; le serveur décide de la page dans le premier cas, la page affiche
// « Ce Document a été supprimé. » dans le second (un rechargement complet mène ensuite à E9).
export function DocumentStatusProvider({
  documentId,
  effectiveStatus,
  effectiveErrorKind,
  effectiveErrorMessage,
  processingElapsedMs,
  children,
}: Status & { documentId: string; children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({
    effectiveStatus,
    effectiveErrorKind,
    effectiveErrorMessage,
    processingElapsedMs,
  });
  // Dernier Statut non « prêt » connu à l'ouverture ou reçu du serveur.
  const [openedStatus, setOpenedStatus] = useState(effectiveStatus);
  const [pollFailing, setPollFailing] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const pollRef = useRef<(() => Promise<void>) | null>(null);

  // Le Statut reçu du serveur a changé (relance depuis un autre onglet, retour sur la page) : l'état
  // s'aligne et, s'il repasse « en cours », le suivi reprend. Seul un changement de la propriété
  // compte : une réponse périmée identique à la précédente est ignorée. Un rafraîchissement tardif
  // peut en revanche ramener « en cours » après un Statut final, le temps d'un cycle (3 s au plus) :
  // l'interrogation qui repart corrige. Pas de garde ici : elle casserait « prêt puis en cours ».
  const serverStatusKey = `${effectiveStatus}:${effectiveErrorKind}`;
  const [lastServerStatusKey, setLastServerStatusKey] = useState(serverStatusKey);
  if (serverStatusKey !== lastServerStatusKey) {
    setLastServerStatusKey(serverStatusKey);
    setStatus({ effectiveStatus, effectiveErrorKind, effectiveErrorMessage, processingElapsedMs });
    setPollFailing(false);
    if (effectiveStatus !== "ready") setOpenedStatus(effectiveStatus);
  }

  const processing = status.effectiveStatus === "processing" && !deleted;

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
      if (next === "deleted") {
        setDeleted(true);
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
    pollRef.current = poll;

    return () => {
      cancelled = true;
      clearTimeout(timer);
      pollRef.current = null;
    };
  }, [documentId, processing, router]);

  // Les données serveur de la page peuvent être périmées : tant que le serveur n'a pas rattrapé le
  // Statut suivi, on recommence, dans une limite fixe.
  // Document supprimé : rien à rattraper, un rafraîchissement mènerait à E9.
  useEffect(() => {
    if (deleted || status.effectiveStatus === effectiveStatus) return;
    router.refresh();
    let retries = 0;
    const timer = setInterval(() => {
      retries += 1;
      router.refresh();
      if (retries >= MAX_REFRESH_RETRIES) clearInterval(timer);
    }, REFRESH_RETRY_MS);
    return () => clearInterval(timer);
  }, [deleted, status.effectiveStatus, effectiveStatus, router]);

  const markDeleted = useCallback(() => setDeleted(true), []);

  const pollNow = useCallback(async () => {
    await pollRef.current?.();
  }, []);

  return (
    <DocumentStatusContext
      value={{
        status,
        justReady: status.effectiveStatus === "ready" && openedStatus !== "ready",
        pollFailing,
        serverStatusKey,
        pollNow,
        applyStatus: setStatus,
        deleted,
        markDeleted,
      }}
    >
      {children}
    </DocumentStatusContext>
  );
}
