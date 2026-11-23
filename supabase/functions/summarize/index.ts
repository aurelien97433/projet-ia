// Fonction summarize (story 6.1, FR-8, FR-23, AD-14, AD-16, AD-18). Appelée par Next.js seulement, avec
// le jeton du Collaborateur (verify_jwt = true dans supabase/config.toml, session revérifiée auprès
// d'Auth). Réponse JSON d'un bloc (pas de flux : 5 points courts), relayée par la route
// POST /api/documents/[id]/summary.
//
// Ordre : validation → session → lecture du Document avec le jeton (RLS ; inexistant ou inaccessible :
// 404 NOT_FOUND) → Statut autre que « prêt » : 409 DOCUMENT_NOT_READY → Résumé à jour
// (summary_text_version = text_version) : renvoyé tel quel, sans réservation ni appel → reserve_ai_call
// avec le jeton (quota refusé : 429 QUOTA_EXCEEDED ou 503 AI_DAILY_CAP_REACHED, avec resetAt) → un seul
// appel au modèle sur le texte entier (_shared/ai.ts › summarize) → store_summary (écriture
// conditionnelle, AD-18) → réponse. Aucun appel au fournisseur sans réservation. Correctif de revue R1 = A :
// verrou de demande par Document (begin_summary, jeton du Collaborateur) entre « Résumé à jour ? » et la
// réservation ; pris → 409 REQUEST_IN_PROGRESS sans réservation ; libéré en fin de traitement (end_summary).
//
// Clé service_role (exception datée à AD-2, décision de l'utilisateur du 2026-11-20, Q2 corrigée) :
// lue dans les secrets de la fonction et utilisée pour le SEUL appel de store_summary (EXECUTE à
// service_role seul). Jamais pour lire le Document, réserver ou rendre le quota.
//
// Quota (AD-14, AD-18) : Résumé généré et enregistré → 1 unité ; écriture perdue (Résumé concurrent,
// texte changé) → unité rendue et Résumé stocké renvoyé ; panne sans réponse du fournisseur (réseau, 5xx,
// délai avant envoi, plafond AI_BUDGET_EXHAUSTED) → rendue ; réponse reçue inexploitable ou délai après
// envoi → consommée ; échec de l'enregistrement après une génération → consommée. Délai (AD-16) : 120 s
// au plus, toutes étapes comprises. Ni le texte du Document, ni le titre, ni les points ne sont journalisés.
import { summarize } from "../_shared/ai.ts";
import { type GenerationState, isReleasable, parseReservation } from "../_shared/chat.ts";
import { readEnv, SUMMARY_CLEANUP_TIMEOUT_MS, SUMMARY_TIMEOUT_MS } from "../_shared/config.ts";
import { AiError, type ErrorCode, errorResponse, logEvent, logInfo } from "../_shared/errors.ts";
import { generationDeps } from "../_shared/fake-generation.ts";
import { buildSummaryMessages } from "../_shared/rag/prompt.ts";
import {
  parseStoreResult,
  parseSummaryDocument,
  parseSummaryRequest,
  type StoredSummary,
  type SummaryDocument,
} from "../_shared/summary.ts";

// Textes du catalogue (src/lib/texts.ts) : les Edge Functions n'importent rien de src/. Le relais
// Next.js remplace le message par le texte du catalogue correspondant au code ; un test vérifie
// l'égalité. QUOTA_MESSAGE n'a pas de {moment} (fuseau du navigateur inconnu ici).
export const FAILURE_MESSAGE = "Le Résumé n'a pas pu être généré.";
export const NOT_READY_MESSAGE = "Le Résumé sera disponible quand le Document sera prêt.";
export const SESSION_MESSAGE = "Votre session a expiré. Reconnectez-vous pour continuer.";
export const NOT_FOUND_MESSAGE = "Cette page n'existe pas ou ne vous est pas accessible.";
export const BUDGET_MESSAGE = "Le service d'IA est momentanément indisponible. Réessayez plus tard.";
export const QUOTA_MESSAGE = "Vous avez atteint votre limite quotidienne de questions et de Résumés.";
// Verrou de demande par Document déjà pris (correctif de revue R1 = A).
export const IN_PROGRESS_MESSAGE = "Un Résumé de ce Document est déjà en cours de génération. Réessayez dans un instant.";

// Échec hors IA, avec le code AD-19 et le statut à renvoyer. La cause va aux journaux seulement.
class SummaryError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly retryable: boolean,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "SummaryError";
  }
}

type Target = { url: string; apikey: string; token: string };

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  return token || null;
}

// Clé publique : la clé publiable reçue de Next.js, ou la clé anon du projet ; jamais une autre clé.
function publicKey(request: Request): string | undefined {
  const received = request.headers.get("apikey") ?? "";
  return received.startsWith("sb_publishable_") ? received : readEnv("SUPABASE_ANON_KEY");
}

const headers = ({ apikey, token }: Target): Record<string, string> => ({
  apikey,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

async function failed(response: Response, name: string): Promise<SummaryError> {
  await response.body?.cancel().catch(() => {});
  if (response.status === 401) return new SummaryError("UNAUTHENTICATED", 401, false, `${name}_http_401`);
  return new SummaryError("INTERNAL", 500, true, `${name}_http_${response.status}`);
}

async function verifySession(target: Target, signal: AbortSignal): Promise<void> {
  const response = await fetch(`${target.url}/auth/v1/user`, { headers: headers(target), signal });
  await response.body?.cancel().catch(() => {});
  if (response.status === 401 || response.status === 403) {
    throw new SummaryError("UNAUTHENTICATED", 401, false, `session_${response.status}`);
  }
  if (!response.ok) throw new SummaryError("INTERNAL", 500, true, `auth_http_${response.status}`);
}

// Document lu avec le jeton du Collaborateur (RLS : tout Collaborateur lit tout Document). Absent : null.
async function readDocument(target: Target, documentId: string, signal: AbortSignal): Promise<SummaryDocument | null> {
  const columns = "id,title,status,text_version,content_text,summary_points,summary_text_version,summary_generated_at";
  const response = await fetch(`${target.url}/rest/v1/documents?select=${columns}&id=eq.${documentId}&limit=1`, {
    headers: headers(target),
    signal,
  });
  if (!response.ok) throw await failed(response, "document");
  const rows: unknown = await response.json().catch(() => null);
  if (!Array.isArray(rows)) throw new SummaryError("INTERNAL", 500, true, "document_invalid_body");
  if (rows.length === 0) return null;
  const document = parseSummaryDocument(rows[0]);
  if (!document) throw new SummaryError("INTERNAL", 500, true, "document_invalid_row");
  return document;
}

async function rpc(target: Target, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${target.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(target),
    body: JSON.stringify(args),
    signal,
  });
  if (!response.ok) throw await failed(response, name);
  return await response.json().catch(() => {
    throw new SummaryError("INTERNAL", 500, true, `${name}_invalid_body`);
  });
}

// Seul usage de la clé service_role : appel de store_summary (EXECUTE à service_role seul), avec les
// points générés et la version lue avant la génération.
async function storeSummary(
  url: string,
  serviceKey: string,
  args: { documentId: string; textVersion: number; points: string[] },
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${url}/rest/v1/rpc/store_summary`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_document_id: args.documentId, p_text_version: args.textVersion, p_points: args.points }),
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new SummaryError("INTERNAL", 500, true, `store_summary_http_${response.status}`);
  }
  return await response.json().catch(() => {
    throw new SummaryError("INTERNAL", 500, true, "store_summary_invalid_body");
  });
}

function messageFor(code: ErrorCode): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return SESSION_MESSAGE;
    case "NOT_FOUND":
      return NOT_FOUND_MESSAGE;
    case "DOCUMENT_NOT_READY":
      return NOT_READY_MESSAGE;
    case "AI_BUDGET_EXHAUSTED":
      return BUDGET_MESSAGE;
    case "REQUEST_IN_PROGRESS":
      return IN_PROGRESS_MESSAGE;
    case "QUOTA_EXCEEDED":
    case "AI_DAILY_CAP_REACHED":
      return QUOTA_MESSAGE;
    default:
      return FAILURE_MESSAGE;
  }
}

type Failure = { code: ErrorCode; status: number; retryable: boolean; cause: string };

function failure(error: unknown, timedOut: boolean): Failure {
  if (error instanceof SummaryError) {
    if (timedOut && error.code === "INTERNAL") return { code: "AI_TIMEOUT", status: 504, retryable: true, cause: "timeout" };
    return { code: error.code, status: error.status, retryable: error.retryable, cause: error.reason };
  }
  if (error instanceof AiError) {
    switch (error.code) {
      case "AI_TIMEOUT":
        return { code: "AI_TIMEOUT", status: 504, retryable: true, cause: error.code };
      case "AI_BUDGET_EXHAUSTED":
        return { code: "AI_BUDGET_EXHAUSTED", status: 503, retryable: false, cause: error.code };
      case "AI_OUTPUT_INVALID":
        return { code: "AI_OUTPUT_INVALID", status: 502, retryable: true, cause: error.code };
      case "AI_UNAVAILABLE":
        return { code: "AI_UNAVAILABLE", status: 503, retryable: true, cause: error.code };
      default:
        return { code: "INTERNAL", status: 500, retryable: true, cause: error.code };
    }
  }
  if (timedOut) return { code: "AI_TIMEOUT", status: 504, retryable: true, cause: "timeout" };
  return { code: "INTERNAL", status: 500, retryable: true, cause: error instanceof Error ? error.name : "unknown" };
}

// Réponse réussie : Résumé (points, date ISO, version), generated = vrai seulement si CETTE demande l'a
// généré et enregistré (une unité consommée).
const summaryResponse = (summary: StoredSummary, generated: boolean) =>
  new Response(JSON.stringify({ summary, generated }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

// Le délai commun rejette dès son expiration, même pendant une étape sans lecteur.
function deadline(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const expire = () => reject(new AiError("AI_TIMEOUT", true, "délai du Résumé dépassé"));
    if (signal.aborted) expire();
    else signal.addEventListener("abort", expire, { once: true });
  });
}

export type HandleOptions = { timeoutMs?: number; cleanupTimeoutMs?: number };

export async function handle(request: Request, options: HandleOptions = {}): Promise<Response> {
  if (request.method !== "POST") return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 405);

  const token = bearerToken(request);
  if (!token) return errorResponse("UNAUTHENTICATED", SESSION_MESSAGE, false, 401);

  const url = readEnv("SUPABASE_URL");
  const apikey = publicKey(request);
  if (!url || !apikey) {
    logEvent("summarize_not_configured", { cause: "public" });
    return errorResponse("INTERNAL", FAILURE_MESSAGE, true, 500);
  }
  const target: Target = { url, apikey, token };

  const input = parseSummaryRequest(await request.json().catch(() => undefined));
  if (!input) return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 400);
  const documentId = input.documentId;

  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? SUMMARY_TIMEOUT_MS;
  const cleanupMs = options.cleanupTimeoutMs ?? SUMMARY_CLEANUP_TIMEOUT_MS;
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const expired = deadline(signal);
  expired.catch(() => {});
  const within = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, expired]);
  const remaining = () => Math.max(1, timeoutMs - (Date.now() - started));
  // Temps laissé au modèle : échéance commune moins le délai réservé à l'enregistrement ou à la libération.
  const generationLeft = () => Math.max(1, timeoutMs - (Date.now() - started) - cleanupMs);

  let stage = "session";
  let reservationId: string | null = null;
  let generation: GenerationState = "not_sent";
  // Verrou de demande du Document pris par cette demande (begin_summary a répondu vrai).
  let locked = false;

  // Rend l'unité réservée, avec son propre délai (le délai commun peut être expiré). Jamais de levée.
  const release = async (): Promise<boolean> => {
    if (!reservationId) return false;
    const id = reservationId;
    reservationId = null;
    try {
      return (await rpc(target, "release_ai_call", { p_reservation_id: id }, AbortSignal.timeout(cleanupMs))) === true;
    } catch (error) {
      logEvent("summarize_release_failed", { cause: error instanceof SummaryError ? error.reason : "network" });
      return false;
    }
  };

  // Libère le verrou du Document (end_summary, jeton du Collaborateur), avec son propre délai. Jamais de
  // levée : en cas d'échec, le verrou expire après 130 s.
  const unlock = async (): Promise<void> => {
    if (!locked) return;
    locked = false;
    try {
      await rpc(target, "end_summary", { p_document_id: documentId }, AbortSignal.timeout(cleanupMs));
    } catch (error) {
      logEvent("summarize_unlock_failed", { cause: error instanceof SummaryError ? error.reason : "network" });
    }
  };

  try {
    await within(verifySession(target, signal));

    stage = "document";
    const document = await within(readDocument(target, documentId, signal));
    if (!document) {
      logInfo("summarize_document_not_found", {});
      return errorResponse("NOT_FOUND", NOT_FOUND_MESSAGE, false, 404);
    }
    if (document.status !== "ready") {
      logInfo("summarize_document_not_ready", { document_id: documentId, status: document.status });
      return errorResponse("DOCUMENT_NOT_READY", NOT_READY_MESSAGE, false, 409);
    }
    // Résumé à jour (AD-18, FR-23) : renvoyé tel quel, sans réservation ni appel au fournisseur.
    if (document.summary) {
      logInfo("summarize_replayed", { document_id: documentId, points: document.summary.points.length });
      return summaryResponse(document.summary, false);
    }
    if (document.text.trim() === "") throw new SummaryError("INTERNAL", 500, true, "document_empty");
    // Clé lue avant la réservation : sans elle, l'enregistrement est impossible et rien n'est réservé.
    const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      logEvent("summarize_not_configured", { cause: "store" });
      throw new SummaryError("INTERNAL", 500, true, "store_key_missing");
    }

    // Verrou de demande par Document (correctif de revue R1 = A), avec le jeton du Collaborateur, avant
    // toute réservation : une seule génération à la fois par Document ; refusé → 409, sans réservation
    // ni appel au fournisseur. Réponse inconnue (échéance) : le verrou éventuel expire après 130 s.
    stage = "lock";
    locked = (await within(rpc(target, "begin_summary", { p_document_id: documentId }, signal))) === true;
    if (!locked) {
      logInfo("summarize_in_progress", { document_id: documentId });
      return errorResponse("REQUEST_IN_PROGRESS", IN_PROGRESS_MESSAGE, false, 409);
    }

    stage = "reserve";
    // Comme chat (story 5.10) : réponse de reserve_ai_call lue avec le temps restant plus le délai de
    // nettoyage, pour que l'identifiant de réservation soit toujours connu ; échéance tombée pendant la
    // réservation → unité rendue (rien n'a été envoyé au fournisseur), AI_TIMEOUT.
    if (signal.aborted) throw new AiError("AI_TIMEOUT", true, "délai du Résumé dépassé avant la réservation");
    const reservation = parseReservation(await rpc(target, "reserve_ai_call", {}, AbortSignal.timeout(remaining() + cleanupMs)));
    if (!reservation) throw new SummaryError("INTERNAL", 500, true, "reserve_invalid_body");
    if (reservation.ok && signal.aborted) {
      reservationId = reservation.reservationId;
      throw new AiError("AI_TIMEOUT", true, "délai du Résumé dépassé pendant la réservation");
    }
    if (!reservation.ok) {
      logInfo("summarize_quota_refused", { reason: reservation.reason });
      return reservation.reason === "global"
        ? errorResponse("AI_DAILY_CAP_REACHED", QUOTA_MESSAGE, false, 503, reservation.resetAt)
        : errorResponse("QUOTA_EXCEEDED", QUOTA_MESSAGE, false, 429, reservation.resetAt);
    }
    reservationId = reservation.reservationId;

    // Un seul appel sur le texte entier (pas de découpage). Sa propre échéance (temps restant moins le
    // délai de nettoyage) fixe l'issue : aucune requête envoyée ou sans réponse → unité rendable ;
    // réponse reçue ou délai après envoi → consommée.
    stage = "generate";
    const generateStarted = Date.now();
    generation = "billed";
    const fakeGeneration = generationDeps();
    let result: Awaited<ReturnType<typeof summarize>>;
    try {
      result = await summarize(buildSummaryMessages({ title: document.title, text: document.text }), {
        deps: fakeGeneration,
        timeoutMs: generationLeft(),
      });
    } catch (error) {
      if (error instanceof AiError && (error.outcome === "no_response" || error.outcome === undefined)) generation = "no_response";
      throw error;
    }
    const generateMs = Date.now() - generateStarted;

    // Écriture conditionnelle (AD-18), avec son propre délai : sa réponse est toujours lue. Échec : unité
    // consommée (génération reçue).
    stage = "store";
    const stored = parseStoreResult(
      await storeSummary(url, serviceKey, { documentId, textVersion: document.textVersion, points: result.points }, AbortSignal.timeout(cleanupMs)),
    );
    if (!stored) throw new SummaryError("INTERNAL", 500, true, "store_summary_invalid_result");
    const logged = {
      document_id: documentId,
      model: result.model,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      generation_simulated: fakeGeneration !== undefined,
      generate_ms: generateMs,
    };
    if (stored.stored && stored.summary) {
      reservationId = null;
      logInfo("summarize_done", { ...logged, points: stored.summary.points.length, stored: true, duration_ms: Date.now() - started });
      return summaryResponse(stored.summary, true);
    }

    // Écriture perdue (Résumé concurrent, texte changé, Document plus prêt ou supprimé) : unité rendue.
    const released = await release();
    logInfo("summarize_store_lost", {
      ...logged,
      released,
      found: stored.found,
      current_summary: stored.summary !== null,
      duration_ms: Date.now() - started,
    });
    if (stored.summary) return summaryResponse(stored.summary, false);
    if (!stored.found) return errorResponse("NOT_FOUND", NOT_FOUND_MESSAGE, false, 404);
    if (stored.status !== "ready") return errorResponse("DOCUMENT_NOT_READY", NOT_READY_MESSAGE, false, 409);
    // Texte changé pendant la génération, sans Résumé à jour : un nouvel essai résume la nouvelle version.
    return errorResponse("INTERNAL", FAILURE_MESSAGE, true, 500);
  } catch (error) {
    const { code, status, retryable, cause } = failure(error, signal.aborted);
    const released = reservationId !== null && isReleasable(generation) ? await release() : false;
    logEvent("summarize_failed", {
      code,
      cause,
      stage,
      generation,
      released,
      duration_ms: Date.now() - started,
    });
    return errorResponse(code, messageFor(code), retryable, status);
  } finally {
    await unlock();
    clearTimeout(timer);
  }
}

// Le travail va à son terme même si le relais se déconnecte (unité consommée ou rendue, Résumé enregistré).
const runtime = globalThis as {
  Deno?: { serve(handler: (request: Request) => Promise<Response>): unknown };
  EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
};
runtime.Deno?.serve((request) => {
  const work = handle(request);
  runtime.EdgeRuntime?.waitUntil(work.catch(() => {}));
  return work;
});
