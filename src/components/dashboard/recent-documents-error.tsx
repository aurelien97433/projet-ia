"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { ErrorAlert } from "@/components/forms/error-alert";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";
import { RECENT_DOCUMENTS_HEADING_ID } from "./constants";

// Erreur de lecture de « Derniers Documents », confinée à la liste. « Réessayer » relit la route
// (router.refresh) dans une transition : seule la liste change, sans recharger la page ni démonter la
// bande d'actions. Le bouton reste focalisable et passe en aria-disabled pendant la relecture.
export function RecentDocumentsError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Relecture réussie : l'alerte et son bouton disparaissent ; le focus, retombé sur la page, passe
  // au titre de la section.
  useEffect(
    () => () => {
      if (document.activeElement === document.body) document.getElementById(RECENT_DOCUMENTS_HEADING_ID)?.focus();
    },
    [],
  );

  return (
    <ErrorAlert
      title={texts.library.loadFailed}
      action={
        <Button
          type="button"
          variant="outline"
          aria-disabled={pending || undefined}
          className={pending ? "cursor-not-allowed opacity-70" : undefined}
          onClick={() => {
            if (pending) return;
            startTransition(() => router.refresh());
          }}
        >
          {texts.library.retry}
        </Button>
      }
    />
  );
}
