"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DocumentErrorKind, DocumentStatus } from "@/lib/documents";
import { texts } from "@/lib/texts";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5_000;

type Status = { effectiveStatus: DocumentStatus; effectiveErrorKind: DocumentErrorKind | null };

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
// pas le suivi. Au changement, router.refresh() met à jour le reste de la page (badge). Session
// expirée ou Document inaccessible : le suivi s'arrête et le serveur décide de la page à afficher.
export function StatusBanner({ documentId, isAuthor, effectiveStatus, effectiveErrorKind }: StatusBannerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ effectiveStatus, effectiveErrorKind });
  const processing = status.effectiveStatus === "processing";

  useEffect(() => {
    if (!processing) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(async () => {
        const next = await fetchStatus(documentId);
        if (cancelled) return;
        if (next === "gone") {
          router.refresh();
          return;
        }
        if (next && next.effectiveStatus !== "processing") {
          setStatus(next);
          router.refresh();
          return;
        }
        schedule();
      }, POLL_INTERVAL_MS);
    };
    schedule();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [documentId, processing, router]);

  // Zone toujours présente : un lecteur d'écran n'annonce que les changements d'une zone déjà là.
  // Vide, elle ne doit pas ajouter d'espace : la marge négative annule l'écart de la page.
  return (
    <div role="status" className="empty:-mb-6">
      {processing ? (
        <div className="rounded-lg bg-pending-soft p-4 text-sm text-foreground">
          <p className="font-semibold text-pending">
            <span aria-hidden="true">◔ </span>
            {t.processingTitle}
          </p>
          <p className="mt-1">{t.processingText}</p>
        </div>
      ) : null}

      {status.effectiveStatus === "error" && status.effectiveErrorKind === "temporary" ? (
        <div className="rounded-lg bg-destructive-soft p-4 text-sm text-foreground">
          <p id="processing-error-reason" className="font-semibold text-destructive">
            <span aria-hidden="true">▲ </span>
            {isAuthor ? t.temporaryAuthor : t.temporaryOther}
          </p>
          {isAuthor ? (
            // Relance branchée en story 2.5 : le message annonce qu'elle n'est pas encore disponible.
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                aria-disabled="true"
                aria-describedby="processing-error-reason"
                className="cursor-not-allowed opacity-70"
              >
                {t.retry}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
