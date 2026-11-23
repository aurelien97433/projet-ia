"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ASSISTANT_HREF } from "@/components/assistant/constants";
import { DeleteDocumentButton } from "@/components/documents/delete-document-button";
import { useDocumentStatus } from "@/components/documents/document-status-provider";
import { GenerateSummaryButton } from "@/components/documents/document-summary";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";

// Barre d'actions de la page Document (E7). « Supprimer » (story 3.4) est une action d'Auteur,
// disponible quel que soit le Statut, traitement compris ; dans une erreur no_text, elle est portée
// par le bandeau, et n'est donc pas répétée ici. « Poser une question » (story 5.2b) n'apparaît que
// pour un Document prêt ; « Générer le Résumé » (story 6.1) aussi, tant qu'aucun Résumé à jour n'existe
// (GenerateSummaryButton ne rend rien sinon, ni hors de DocumentSummaryProvider). Document supprimé
// pendant la consultation : plus aucune action. Sans action, rien n'est rendu.
const readyActions: ReactNode[] = [
  // Nouvelle Conversation, focus dans le champ de question (PageTitle de l'Assistant).
  <Button key="ask" asChild>
    <Link href={ASSISTANT_HREF}>{texts.assistant.askQuestion}</Link>
  </Button>,
  <GenerateSummaryButton key="summary" />,
];

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
