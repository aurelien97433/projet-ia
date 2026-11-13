"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/require-user";
import { deleteDocument, type DeleteDocumentResult } from "@/server/documents/delete-document";
import { retryProcessing, type RetryProcessingResult } from "@/server/documents/retry-processing";

// Server Actions de la page Document. La session est vérifiée ici même : une action peut être
// appelée sans passer par la page. Les identifiants viennent du navigateur et sont validés par les
// modules serveur ; la RLS reste la barrière finale.

// Relance d'un traitement (FR-7, FR-13).
export async function retryProcessingAction(documentId: unknown, clientRequestId: unknown): Promise<RetryProcessingResult> {
  const auth = await requireUser();
  if (!auth.user) return { status: "error", error: auth.error };
  return retryProcessing({ documentId, clientRequestId }, auth.user.id, await createClient());
}

// Suppression d'un Document par son Auteur (FR-12, FR-13, story 3.4).
export async function deleteDocumentAction(documentId: unknown): Promise<DeleteDocumentResult> {
  const auth = await requireUser();
  if (!auth.user) return { status: "error", error: auth.error };
  return deleteDocument({ documentId }, auth.user.id, await createClient());
}
