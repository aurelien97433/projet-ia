"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorAlert } from "@/components/forms/error-alert";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";

// Lecture des 5 dernières Conversations en échec (story 5.6), confinée à la liste (EXPERIENCE.md, E3 :
// « Cette liste n'a pas pu être chargée. »). « Réessayer » relit la route dans une transition, sans
// recharger la page ; le bouton reste focalisable et passe en aria-disabled pendant la relecture.
export function RecentConversationsError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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
