// Traitement asynchrone d'un Document (AD-5). Appelée par Next.js seulement, avec
// PROCESS_DOCUMENT_SECRET (verify_jwt = false dans supabase/config.toml : seul ce secret fait foi).
// La fonction contrôle l'appel, lance le travail en arrière-plan et répond aussitôt 202.
import { readEnv } from "../_shared/config.ts";
import { errorResponse, logEvent } from "../_shared/errors.ts";
import { type Attempt, failProcessing, isCurrentAttempt } from "../_shared/processing.ts";
import { hasBearerSecret } from "../_shared/secret.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAILURE_MESSAGE = "Le traitement n'a pas pu aboutir. Vous pouvez le relancer.";
const WORK_DELAY_MS = 200;

type Work = (attempt: Attempt) => Promise<void>;

// Story 2.3 : le travail se réduit à une journalisation, après une courte attente qui le fait finir
// après la réponse 202 : les journaux prouvent ainsi qu'il survit à la requête. La story 2.4 le remplace.
const logOnlyWork: Work = async ({ documentId, attemptId }) => {
  await new Promise((resolve) => setTimeout(resolve, WORK_DELAY_MS));
  logEvent("process_document_work_done", { document_id: documentId, attempt_id: attemptId });
};

// Cause d'un échec pour les journaux : le nom de l'erreur, jamais son message, qui pourrait citer
// du texte de Document.
const causeOf = (error: unknown) => (error instanceof Error ? error.name : "unknown");

async function runAttempt(attempt: Attempt, work: Work): Promise<void> {
  const ids = { document_id: attempt.documentId, attempt_id: attempt.attemptId };
  try {
    await work(attempt);
  } catch (error) {
    logEvent("process_document_work_failed", { ...ids, code: causeOf(error) });
    try {
      const recorded = await failProcessing(attempt, "temporary", FAILURE_MESSAGE);
      if (!recorded) logEvent("fail_processing_refused", ids);
    } catch (failure) {
      // L'expiration de 3 min prend le relais (AD-6).
      logEvent("fail_processing_failed", { ...ids, code: causeOf(failure) });
    }
  }
}

async function readAttempt(request: Request): Promise<Attempt | null> {
  try {
    const body = (await request.json()) as { document_id?: unknown; attempt_id?: unknown } | null;
    const documentId = body?.document_id;
    const attemptId = body?.attempt_id;
    if (typeof documentId !== "string" || typeof attemptId !== "string") return null;
    return UUID.test(documentId) && UUID.test(attemptId) ? { documentId, attemptId } : null;
  } catch {
    return null;
  }
}

export async function handle(request: Request, work: Work = logOnlyWork): Promise<Response> {
  if (request.method !== "POST") return errorResponse("VALIDATION_FAILED", "Méthode non autorisée.", false, 405);

  const expected = readEnv("PROCESS_DOCUMENT_SECRET");
  if (!expected) logEvent("process_document_not_configured", {});
  if (!hasBearerSecret(request, expected)) return errorResponse("UNAUTHENTICATED", "Accès refusé.", false, 401);

  const attempt = await readAttempt(request);
  if (!attempt) return errorResponse("VALIDATION_FAILED", "Demande invalide.", false, 400);

  try {
    if (!(await isCurrentAttempt(attempt))) {
      logEvent("process_document_attempt_refused", { document_id: attempt.documentId, attempt_id: attempt.attemptId });
      return errorResponse("NOT_FOUND", "Tentative inconnue.", false, 404);
    }
  } catch (error) {
    logEvent("process_document_attempt_check_failed", {
      document_id: attempt.documentId,
      // Message écrit par _shared/processing.ts (code HTTP de la base), sans donnée de Document.
      code: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("INTERNAL", "Le traitement n'a pas pu démarrer.", true, 500);
  }

  logEvent("process_document_accepted", { document_id: attempt.documentId, attempt_id: attempt.attemptId });
  // Le travail continue après la réponse (AD-5) ; en local, policy = "per_worker" est requis.
  (globalThis as unknown as { EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } }).EdgeRuntime.waitUntil(
    runAttempt(attempt, work),
  );
  return new Response(JSON.stringify({ accepted: true }), {
    status: 202,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

(globalThis as { Deno?: { serve(handler: (request: Request) => Promise<Response>): unknown } }).Deno?.serve((request) =>
  handle(request),
);
