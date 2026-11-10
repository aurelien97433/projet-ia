"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentStatusItem } from "@/server/documents/list-documents";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5_000;
const MAX_POLL_FAILURES = 3;

// Résultat d'une interrogation groupée : les Statuts, « unauthenticated » pour une session expirée
// (401), null pour une panne passagère.
async function fetchStatuses(ids: string): Promise<DocumentStatusItem[] | "unauthenticated" | null> {
  try {
    const response = await fetch(`/api/documents/statuses?ids=${ids}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    if (response.status === 401) return "unauthenticated";
    if (!response.ok) return null;
    const body = (await response.json()) as { statuses: DocumentStatusItem[] };
    return body.statuses;
  } catch {
    return null;
  }
}

// Suivi des badges de la Bibliothèque (AD-6) : toutes les 3 s tant qu'une ligne affichée est *en
// cours*, une seule requête groupée pour toutes ces lignes, jamais deux à la fois. Après trois échecs
// consécutifs, `failing` reste vrai jusqu'au premier succès. Session expirée : le serveur décide de
// la page (router.refresh). Les Statuts reçus sont confiés à `apply`, qui ne touche ni au focus ni
// au défilement.
export function useLibraryStatuses(processingIds: readonly string[], apply: (items: DocumentStatusItem[]) => void) {
  const router = useRouter();
  const [failing, setFailing] = useState(false);
  const pollRef = useRef<(() => Promise<void>) | null>(null);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  // Clé stable : le suivi ne redémarre que si l'ensemble des lignes *en cours* change.
  const key = [...processingIds].sort().join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let inFlight: Promise<void> | null = null;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      clearTimeout(timer);
      const result = await fetchStatuses(key);
      if (cancelled) return;
      if (result === "unauthenticated") {
        router.refresh();
        return;
      }
      if (result) {
        failures = 0;
        setFailing(false);
        applyRef.current(result);
      } else {
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) setFailing(true);
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    // « Actualiser » rejoint la requête en cours plutôt que d'en lancer une seconde.
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
  }, [key, router]);

  const refreshNow = useCallback(async () => {
    await pollRef.current?.();
  }, []);

  // Plus aucune ligne *en cours* : rien n'est suivi, le message n'a plus lieu d'être.
  return { failing: failing && key !== "", refreshNow };
}
