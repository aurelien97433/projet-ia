// Traitement asynchrone d'un Document (AD-5). Appelée par Next.js seulement, avec
// PROCESS_DOCUMENT_SECRET (verify_jwt = false dans supabase/config.toml : seul ce secret fait foi).
// La fonction contrôle l'appel, lance le travail en arrière-plan et répond aussitôt 202.
import { embed } from "../_shared/ai.ts";
import { readEnv } from "../_shared/config.ts";
import { AiError, errorResponse, logEvent, logInfo } from "../_shared/errors.ts";
import { embeddingDeps } from "../_shared/fake-embeddings.ts";
import {
  type Attempt,
  completeProcessing,
  DbError,
  failProcessing,
  isCurrentAttempt,
  readDocumentText,
} from "../_shared/processing.ts";
import { chunkText } from "../_shared/rag/chunk.ts";
import { normalizeText } from "../_shared/rag/normalize.ts";
import { hasBearerSecret } from "../_shared/secret.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAILURE_MESSAGE = "Le traitement n'a pas pu aboutir. Vous pouvez le relancer.";
const NO_TEXT_MESSAGE = "Ce fichier ne contient aucun texte exploitable. Il ne peut pas être interrogé.";
// Story 2.6b : messages identiques au catalogue (src/lib/texts.ts, documentStatus), vérifiés par un test.
const ENCODING_MESSAGE = "Le texte de ce fichier n'a pas pu être lu (encodage non pris en charge).";
const TOO_LARGE_MESSAGE = "Une fois converti, le texte de ce fichier dépasse 1 Mo, la taille maximale. Il ne peut pas être interrogé.";
// Même limite que la contrainte documents_content_size : 1 000 000 octets UTF-8 de texte canonique.
const MAX_TEXT_BYTES = 1_000_000;

type Work = (attempt: Attempt) => Promise<void>;

// Traitement d'une tentative : texte canonique, Passages, vecteurs, puis fin atomique (AD-5). Le texte
// normalisé est l'unique référence pour l'affichage, le découpage et les positions (AD-8).
const processDocument: Work = async (attempt) => {
  const started = Date.now();
  const ids = { document_id: attempt.documentId, attempt_id: attempt.attemptId };

  const source = await readDocumentText(attempt);
  if (!source) {
    logInfo("process_document_attempt_superseded", ids);
    return;
  }

  // Texte inexploitable : erreur no_text définitive (sans relance), jamais une erreur temporaire.
  const noText = async (message: string, cause: string) => {
    const recorded = await failProcessing(attempt, "no_text", message);
    if (recorded) logInfo("process_document_no_text", { ...ids, cause });
    else logEvent("fail_processing_refused", ids);
  };

  if (source.unreadable) return noText(ENCODING_MESSAGE, "encoding");

  const text = normalizeText(source.text);
  // Texte converti (Windows-1252 riche en accents, NFC) au-delà de la limite : complete_processing
  // échouerait sur la contrainte de taille, en erreur temporaire relançable sans fin.
  if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) return noText(TOO_LARGE_MESSAGE, "too_large");

  const chunks = chunkText(text);
  if (chunks.length === 0) return noText(NO_TEXT_MESSAGE, "empty");

  const embedStarted = Date.now();
  const { vectors, model, version } = await embed(
    chunks.map((chunk) => chunk.content),
    { deps: embeddingDeps(attempt.documentId) },
  );
  const completeStarted = Date.now();
  const completed = await completeProcessing(attempt, {
    text,
    textVersion: source.textVersion,
    embeddingModel: model,
    embeddingVersion: version,
    passages: chunks.map((chunk, ordinal) => ({ ordinal, ...chunk, embedding: vectors[ordinal] })),
  });

  const finished = Date.now();
  const details = {
    ...ids,
    passages: chunks.length,
    embed_ms: completeStarted - embedStarted,
    complete_ms: finished - completeStarted,
    duration_ms: finished - started,
  };
  if (completed) logInfo("process_document_work_done", details);
  else logEvent("complete_processing_refused", details);
};

// Cause d'un échec pour les journaux : le code de l'IA ou le nom de l'erreur, jamais son message,
// qui pourrait citer du texte de Document.
function causeOf(error: unknown): string {
  if (error instanceof AiError || error instanceof DbError) return error.code;
  return error instanceof Error ? error.name : "unknown";
}

async function runAttempt(attempt: Attempt, work: Work): Promise<void> {
  const ids = { document_id: attempt.documentId, attempt_id: attempt.attemptId };
  const started = Date.now();
  try {
    await work(attempt);
  } catch (error) {
    logEvent("process_document_work_failed", { ...ids, code: causeOf(error), duration_ms: Date.now() - started });
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

export async function handle(request: Request, work: Work = processDocument): Promise<Response> {
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
    logEvent("process_document_attempt_check_failed", { document_id: attempt.documentId, code: causeOf(error) });
    return errorResponse("INTERNAL", "Le traitement n'a pas pu démarrer.", true, 500);
  }

  logInfo("process_document_accepted", { document_id: attempt.documentId, attempt_id: attempt.attemptId });
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
