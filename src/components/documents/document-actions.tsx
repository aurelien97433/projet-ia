"use client";

import type { ReactNode } from "react";
import { DeleteDocumentButton } from "@/components/documents/delete-document-button";
import { useDocumentStatus } from "@/components/documents/document-status-provider";
import { texts } from "@/lib/texts";

// Barre d'actions de la page Document (E7). « Supprimer » (story 3.4) est une action d'Auteur,
// disponible quel que soit le Statut, traitement compris ; dans une erreur no_text, elle est portée
// par le bandeau, et n'est donc pas répétée ici. Les stories 5.2b et 6.1 ajouteront « Poser une
// question » et « Générer le Résumé » aux actions d'un Document prêt. Document supprimé pendant la
// consultation : plus aucune action. Sans action, rien n'est rendu.
const readyActions: ReactNode[] = [];

export function DocumentActions({ documentId, title, isAuthor }: { documentId: string; title: string; isAuthor: boolean }) {
  const { status, deleted } = useDocumentStatus();
  if (deleted) return null;
  const noTextError = status.effectiveStatus === "error" && status.effectiveErrorKind === "no_text";
  const actions = [
    ...(status.effectiveStatus === "ready" ? readyActions : []),
    ...(isAuthor && !noTextError ? [<DeleteDocumentButton key="delete" documentId={documentId} title={title} />] : []),
  ];
  if (actions.length === 0) return null;

  return (
    <div role="group" aria-label={texts.document.actionsLabel} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {actions}
    </div>
  );
}
