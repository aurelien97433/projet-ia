import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/errors";

const TRIGGER_TIMEOUT_MS = 5_000;
const ABANDON_TIMEOUT_MS = 2_000;

type Db = Pick<SupabaseClient, "rpc">;

type Target = { url: string; secret: string | undefined };

function defaultTarget(): Target {
  return {
    url: new URL("/functions/v1/process-document", process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
    secret: process.env.PROCESS_DOCUMENT_SECRET,
  };
}

// Appelle process-document et attend son accusé (AD-5). Renvoie null si le traitement est accepté,
// sinon la cause de l'échec, pour le journal. Jamais de secret dans cette cause.
async function callFunction(documentId: string, attemptId: string, { url, secret }: Target): Promise<string | null> {
  if (!secret) return "not_configured";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: documentId, attempt_id: attemptId }),
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    });
    // Seul le code compte : un corps illisible ne doit pas faire abandonner une tentative acceptée.
    await response.body?.cancel().catch(() => {});
    return response.status === 202 ? null : `http_${response.status}`;
  } catch (error) {
    return error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network";
  }
}

// Déclenche le traitement d'un Document, côté serveur uniquement. db est le client du Collaborateur :
// sans accusé 202 en 5 s, abandon_processing s'exécute avec son jeton, jamais avec service_role
// (AD-20). Ne lève jamais d'exception : si l'abandon échoue aussi, l'expiration de 3 min prend le
// relais (AD-6), et la page du Document s'affiche dans tous les cas.
export async function triggerProcessing(
  documentId: string,
  attemptId: string,
  db: Db,
  target: Target = defaultTarget(),
): Promise<void> {
  const startedAt = Date.now();
  const failure = await callFunction(documentId, attemptId, target);
  const duration_ms = Date.now() - startedAt;
  if (!failure) {
    logEvent("process_document_accepted", { document_id: documentId, duration_ms });
    return;
  }

  logEvent("process_document_call_failed", { document_id: documentId, code: failure, duration_ms });
  try {
    const { data, error } = await db
      .rpc("abandon_processing", { p_document_id: documentId, p_attempt_id: attemptId })
      .abortSignal(AbortSignal.timeout(ABANDON_TIMEOUT_MS));
    if (error) logEvent("abandon_processing_failed", { document_id: documentId, code: error.code });
    else if (data !== true) logEvent("abandon_processing_refused", { document_id: documentId });
  } catch {
    logEvent("abandon_processing_failed", { document_id: documentId, code: "exception" });
  }
}
