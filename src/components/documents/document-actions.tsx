"use client";

import type { ReactNode } from "react";
import { useDocumentStatus } from "@/components/documents/document-status-provider";
import { texts } from "@/lib/texts";

// Barre d'actions de la page Document (E7), préparée sans bouton : la story 3.4 ajoute « Supprimer »
// aux actions d'Auteur, les stories 5.2b et 6.1 « Poser une question » et « Générer le Résumé » aux
// actions d'un Document prêt. Sans action, rien n'est rendu.
const authorActions: ReactNode[] = [];
const readyActions: ReactNode[] = [];

export function DocumentActions({ isAuthor }: { isAuthor: boolean }) {
  const { status } = useDocumentStatus();
  const actions = [...(status.effectiveStatus === "ready" ? readyActions : []), ...(isAuthor ? authorActions : [])];
  if (actions.length === 0) return null;

  return (
    <div role="group" aria-label={texts.document.actionsLabel} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {actions}
    </div>
  );
}
