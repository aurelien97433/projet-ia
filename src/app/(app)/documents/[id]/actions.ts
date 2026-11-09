"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/require-user";
import { retryProcessing, type RetryProcessingResult } from "@/server/documents/retry-processing";

// Server Action de relance d'un traitement (FR-7, FR-13). La session est vérifiée ici même : une
// action peut être appelée sans passer par la page. Les identifiants viennent du navigateur et sont
// validés par retryProcessing.
export async function retryProcessingAction(documentId: unknown, clientRequestId: unknown): Promise<RetryProcessingResult> {
  const auth = await requireUser();
  if (!auth.user) return { status: "error", error: auth.error };
  return retryProcessing({ documentId, clientRequestId }, auth.user.id, await createClient());
}
