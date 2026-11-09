import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { appError, logEvent, logInfo, type AppError } from "@/lib/errors";
import { texts } from "@/lib/texts";
import { getDocumentStatus, type DocumentStatusView } from "./get-document-status";
import { triggerProcessing } from "./trigger-processing";

export type RetryProcessingResult = { status: "ok"; view: DocumentStatusView } | ({ status: "error" } & AppError);

type Db = Pick<SupabaseClient, "from" | "rpc">;

const FORBIDDEN = "42501";
const NOT_FOUND = "P0002";
const NOT_RETRYABLE = "55000";

const t = texts.documentStatus;

const inputSchema = z.object({ documentId: z.uuid(), clientRequestId: z.uuid() });

const failure = (code: AppError["error"]["code"], message: string, retryable: boolean): RetryProcessingResult => ({
  status: "error",
  ...appError(code, message, retryable),
});

// Une relance acceptée a démarré : si la relecture échoue, on suppose « en cours », l'interrogation
// du bandeau corrigera.
const ASSUMED_PROCESSING: DocumentStatusView = {
  effectiveStatus: "processing",
  effectiveErrorKind: null,
  effectiveErrorMessage: null,
  processingElapsedMs: 0,
};

async function readStatus(documentId: string, db: Db): Promise<DocumentStatusView | null> {
  try {
    return await getDocumentStatus(documentId, db);
  } catch {
    return null;
  }
}

// Relance un traitement avec le client du Collaborateur (AD-5, AD-16). Le déclenchement est attendu :
// sans accusé, triggerProcessing abandonne la tentative, et le Statut relu le montre. Un rejeu ne
// déclenche rien. Journaux : codes et identifiants seulement.
export async function retryProcessing(
  input: { documentId: unknown; clientRequestId: unknown },
  userId: string,
  db: Db,
): Promise<RetryProcessingResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    logEvent("retry_processing_invalid_request", { user_id: userId });
    return failure("VALIDATION_FAILED", t.retryFailed, false);
  }
  const { documentId, clientRequestId } = parsed.data;

  let attemptId: string | null;
  try {
    const { data, error } = await db.rpc("retry_processing", {
      p_document_id: documentId,
      p_client_request_id: clientRequestId,
    });
    if (error) {
      if (error.code === NOT_RETRYABLE) {
        // Cas attendu : le bandeau était périmé (Document déjà relancé, par exemple). Il s'aligne sur
        // le Statut relu.
        logInfo("retry_processing_not_retryable", { document_id: documentId, user_id: userId });
        const view = await readStatus(documentId, db);
        return view ? { status: "ok", view } : failure("INTERNAL", t.retryFailed, true);
      }
      logEvent("retry_processing_refused", { document_id: documentId, user_id: userId, code: error.code });
      if (error.code === FORBIDDEN) return failure("FORBIDDEN", t.forbidden, false);
      if (error.code === NOT_FOUND) return failure("NOT_FOUND", texts.notFound.text, false);
      return failure("INTERNAL", t.retryFailed, true);
    }
    attemptId = data as string | null;
  } catch {
    logEvent("retry_processing_failed", { document_id: documentId, user_id: userId, code: "exception" });
    return failure("INTERNAL", t.retryFailed, true);
  }

  if (attemptId) {
    logInfo("retry_processing_started", { document_id: documentId, user_id: userId, attempt_id: attemptId });
    await triggerProcessing(documentId, attemptId, db);
  } else {
    logInfo("retry_processing_replayed", { document_id: documentId, user_id: userId });
  }
  return { status: "ok", view: (await readStatus(documentId, db)) ?? ASSUMED_PROCESSING };
}
