// Fonction chat (story 5.2a-2, FR-16, FR-17, AD-14, AD-16, AD-17). Appelée par Next.js seulement, avec
// le jeton du Collaborateur (verify_jwt = true dans supabase/config.toml, session revérifiée auprès
// d'Auth). La base est interrogée avec ce jeton, jamais avec service_role. Réponse JSON non diffusée
// (la diffusion arrive en 5.5).
//
// Ordre : validation ; rejeu (même clientRequestId, avant toute réservation) ; réservation du quota
// du Compte et du plafond global (avant tout appel à OpenAI) ; Conversation et question ;
// vectorisation, match_passages, relecture des Documents ; aucun Passage → refus enregistré sans
// appel ; consignes et génération ; citations ; enregistrement atomique. Tout échec après la
// réservation est enregistré (kind = failure). L'unité n'est rendue que si aucun appel facturable
// n'a abouti (règle de libération du 2026-11-13). Aucun texte de question, de Passage ni de réponse
// n'est journalisé.
import { type AiDeps, embed, generateAnswer } from "../_shared/ai.ts";
import {
  type GenerationState,
  conversationTitle,
  type DocumentRow,
  isDocumentRow,
  isReleasable,
  parseChatRequest,
  parseReservation,
  retainPassages,
  sourcesToSave,
} from "../_shared/chat.ts";
import {
  CHAT_CLEANUP_TIMEOUT_MS,
  CHAT_GENERATION_MAX_TIMEOUT_MS,
  CHAT_MAX_PASSAGES,
  CHAT_PASSAGES_PER_DOCUMENT,
  CHAT_TIMEOUT_MS,
  EMBEDDING_MODEL,
  EMBEDDING_VERSION,
  readEnv,
} from "../_shared/config.ts";
import { AiError, type ErrorCode, errorResponse, logEvent, logInfo } from "../_shared/errors.ts";
import { generationDeps } from "../_shared/fake-generation.ts";
import { readCitations } from "../_shared/rag/citations.ts";
import { buildChatMessages } from "../_shared/rag/prompt.ts";
import { isMatchRow, type MatchRow, searchVectorization } from "../_shared/search.ts";

// Textes du catalogue (src/lib/texts.ts) : les Edge Functions n'importent rien de src/. Le relais
// Next.js remplace le message d'erreur par le texte du catalogue correspondant au code. Un test vérifie
// l'égalité avec le catalogue. Exception : QUOTA_MESSAGE et CAP_MESSAGE n'ont pas de {moment} (fuseau du
// navigateur inconnu ici) ; le relais les remplace par le texte complet construit à partir de resetAt.
export const FAILURE_MESSAGE = "Le service d'IA ne répond pas pour le moment. Votre question est conservée.";
export const SESSION_MESSAGE = "Votre session a expiré. Reconnectez-vous pour continuer.";
export const UNVERIFIABLE_MESSAGE = "Je n'ai pas pu vérifier cette réponse à partir des Documents. Veuillez réessayer.";
export const BUDGET_MESSAGE = "Le service d'IA est momentanément indisponible. Réessayez plus tard.";
export const QUOTA_MESSAGE = "Vous avez atteint votre limite quotidienne de questions et de Résumés. La Recherche reste disponible.";
export const CAP_MESSAGE = "L'Assistant a atteint sa limite d'utilisation pour aujourd'hui. La Recherche reste disponible.";
export const IN_PROGRESS_MESSAGE = "Cette question est déjà en cours de traitement.";
// EXPERIENCE.md, « Information absente » : texte enregistré comme refus (sans appel à OpenAI).
export const REFUSAL_INFO_ABSENTE =
  "Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.";

// Échec hors IA, avec le code AD-19 et le statut à renvoyer. La cause va aux journaux seulement ;
// pgCode : code Postgres renvoyé par l'API (ex. 23505), jamais son message.
class ChatError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly retryable: boolean,
    readonly reason: string,
    readonly pgCode?: string,
  ) {
    super(reason);
    this.name = "ChatError";
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

function headers({ apikey, token }: Target): Record<string, string> {
  return { apikey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function verifySession(target: Target, signal: AbortSignal): Promise<void> {
  const response = await fetch(`${target.url}/auth/v1/user`, { headers: headers(target), signal });
  await response.body?.cancel().catch(() => {});
  if (response.status === 401 || response.status === 403) {
    throw new ChatError("UNAUTHENTICATED", 401, false, `session_${response.status}`);
  }
  if (!response.ok) throw new ChatError("INTERNAL", 500, true, `auth_http_${response.status}`);
}

async function failed(response: Response, name: string): Promise<ChatError> {
  if (response.status === 401) {
    await response.body?.cancel().catch(() => {});
    return new ChatError("UNAUTHENTICATED", 401, false, `${name}_http_401`);
  }
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
  const pgCode = typeof body?.code === "string" && /^[0-9A-Z]{5}$/.test(body.code) ? body.code : undefined;
  return new ChatError("INTERNAL", 500, true, `${name}_http_${response.status}`, pgCode);
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
    throw new ChatError("INTERNAL", 500, true, `${name}_invalid_body`);
  });
}

async function get(target: Target, path: string, name: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${target.url}/rest/v1/${path}`, { headers: headers(target), signal });
  if (!response.ok) throw await failed(response, name);
  return await response.json().catch(() => {
    throw new ChatError("INTERNAL", 500, true, `${name}_invalid_body`);
  });
}

// Rejeu minimal (AD-16, le rejeu complet est la 5.9) : une question de ce Compte (RLS) avec ce
// clientRequestId existe déjà.
async function questionExists(target: Target, clientRequestId: string, signal: AbortSignal): Promise<boolean> {
  const rows = await get(
    target,
    `messages?select=id&role=eq.user&client_request_id=eq.${clientRequestId}&limit=1`,
    "replay",
    signal,
  );
  if (!Array.isArray(rows)) throw new ChatError("INTERNAL", 500, true, "replay_invalid_rows");
  return rows.length > 0;
}

async function matchPassages(target: Target, vector: number[], minSimilarity: number, signal: AbortSignal): Promise<MatchRow[]> {
  const rows = await rpc(
    target,
    "match_passages",
    {
      query_embedding: JSON.stringify(vector),
      min_similarity: minSimilarity,
      max_passages: CHAT_MAX_PASSAGES,
      max_per_document: CHAT_PASSAGES_PER_DOCUMENT,
      embedding_model: EMBEDDING_MODEL,
      embedding_version: EMBEDDING_VERSION,
    },
    signal,
  );
  if (!Array.isArray(rows) || !rows.every(isMatchRow)) throw new ChatError("INTERNAL", 500, true, "match_invalid_rows");
  return rows;
}

// Titre et version relus dans documents avec le jeton : jamais du modèle ni du navigateur.
async function readDocuments(target: Target, ids: string[], signal: AbortSignal): Promise<DocumentRow[]> {
  if (ids.length === 0) return [];
  const rows = await get(target, `documents?select=id,title,text_version&id=in.(${ids.join(",")})`, "documents", signal);
  if (!Array.isArray(rows) || !rows.every(isDocumentRow)) throw new ChatError("INTERNAL", 500, true, "documents_invalid_rows");
  return rows;
}

// Le délai commun interrompt aussi l'appel au fournisseur en cours.
function withSignal(deps: Partial<AiDeps> | undefined, signal: AbortSignal): Partial<AiDeps> {
  const base = deps?.fetch ?? ((input, init) => fetch(input, init));
  return {
    ...deps,
    fetch: (input, init) =>
      base(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal }),
  };
}

// Rejette dès l'expiration du délai commun, même pendant une attente entre deux tentatives.
function deadline(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const expire = () => reject(new AiError("AI_TIMEOUT", true, "délai de chat dépassé"));
    if (signal.aborted) expire();
    else signal.addEventListener("abort", expire, { once: true });
  });
}

type Failure = { code: ErrorCode; status: number; retryable: boolean; cause: string };

function failure(error: unknown, timedOut: boolean): Failure {
  if (error instanceof ChatError) {
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
        return { code: "AI_OUTPUT_INVALID", status: 502, retryable: error.retryable, cause: error.code };
      case "AI_CITATIONS_INVALID":
        return { code: "AI_CITATIONS_INVALID", status: 502, retryable: true, cause: error.code };
      case "AI_UNAVAILABLE":
        return { code: "AI_UNAVAILABLE", status: 503, retryable: error.retryable, cause: error.code };
      default:
        return { code: "INTERNAL", status: 500, retryable: true, cause: error.code };
    }
  }
  if (timedOut) return { code: "AI_TIMEOUT", status: 504, retryable: true, cause: "timeout" };
  return { code: "INTERNAL", status: 500, retryable: true, cause: error instanceof Error ? error.name : "unknown" };
}

function messageFor(code: ErrorCode): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return SESSION_MESSAGE;
    case "AI_CITATIONS_INVALID":
      return UNVERIFIABLE_MESSAGE;
    case "AI_BUDGET_EXHAUSTED":
      return BUDGET_MESSAGE;
    case "REQUEST_IN_PROGRESS":
      return IN_PROGRESS_MESSAGE;
    default:
      return FAILURE_MESSAGE;
  }
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export type HandleOptions = { timeoutMs?: number; generationTimeoutMs?: number; cleanupTimeoutMs?: number };

export async function handle(request: Request, options: HandleOptions = {}): Promise<Response> {
  if (request.method !== "POST") return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 405);

  const token = bearerToken(request);
  if (!token) return errorResponse("UNAUTHENTICATED", SESSION_MESSAGE, false, 401);

  const url = readEnv("SUPABASE_URL");
  const apikey = publicKey(request);
  if (!url || !apikey) {
    logEvent("chat_not_configured", {});
    return errorResponse("INTERNAL", FAILURE_MESSAGE, true, 500);
  }
  const target = { url, apikey, token };

  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_MS;
  const generationMaxMs = options.generationTimeoutMs ?? CHAT_GENERATION_MAX_TIMEOUT_MS;
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Le délai peut expirer pendant une étape sans lecteur : son rejet ne doit jamais rester non géré.
  const expired = deadline(signal);
  expired.catch(() => {});
  const within = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, expired]);
  const remaining = () => Math.max(1, timeoutMs - (Date.now() - started));

  let stage = "session";
  let reservationId: string | null = null;
  let conversationId: string | null = null;
  let generation: GenerationState = "not_sent";

  // Rend l'unité réservée, avec son propre délai (le délai commun peut être expiré). Jamais de levée.
  const release = async (): Promise<boolean> => {
    if (!reservationId) return false;
    const id = reservationId;
    reservationId = null;
    try {
      const cleanup = AbortSignal.timeout(options.cleanupTimeoutMs ?? CHAT_CLEANUP_TIMEOUT_MS);
      return (await rpc(target, "release_ai_call", { p_reservation_id: id }, cleanup)) === true;
    } catch (error) {
      logEvent("chat_release_failed", { cause: error instanceof ChatError ? error.reason : "network" });
      return false;
    }
  };

  try {
    await within(verifySession(target, signal));

    stage = "validation";
    const input = parseChatRequest(await request.json().catch(() => undefined));
    if (!input) return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 400);

    stage = "replay";
    if (await within(questionExists(target, input.clientRequestId, signal))) {
      logInfo("chat_replay_refused", {});
      return errorResponse("REQUEST_IN_PROGRESS", IN_PROGRESS_MESSAGE, false, 409);
    }

    stage = "reserve";
    const reservation = parseReservation(await within(rpc(target, "reserve_ai_call", {}, signal)));
    if (!reservation) throw new ChatError("INTERNAL", 500, true, "reserve_invalid_body");
    if (!reservation.ok) {
      logInfo("chat_quota_refused", { reason: reservation.reason });
      return reservation.reason === "global"
        ? errorResponse("AI_DAILY_CAP_REACHED", CAP_MESSAGE, false, 503, reservation.resetAt)
        : errorResponse("QUOTA_EXCEEDED", QUOTA_MESSAGE, false, 429, reservation.resetAt);
    }
    reservationId = reservation.reservationId;

    stage = "conversation";
    let startedConversation: unknown;
    try {
      startedConversation = await within(
        rpc(
          target,
          "start_conversation",
          { p_title: conversationTitle(input.question), p_question: input.question, p_client_request_id: input.clientRequestId },
          signal,
        ),
      );
    } catch (error) {
      if (error instanceof ChatError && error.pgCode === "23505") {
        // Même clientRequestId arrivé en concurrence : aucune Conversation de plus, unité rendue.
        await release();
        logInfo("chat_replay_refused", { concurrent: true });
        return errorResponse("REQUEST_IN_PROGRESS", IN_PROGRESS_MESSAGE, false, 409);
      }
      throw error;
    }
    const conversation = (startedConversation as { conversation_id?: unknown } | null)?.conversation_id;
    if (typeof conversation !== "string") throw new ChatError("INTERNAL", 500, true, "conversation_invalid_body");
    conversationId = conversation;

    stage = "embed";
    const vectorization = searchVectorization("chat");
    const embedStarted = Date.now();
    const { vectors } = await within(
      embed([input.question], { deps: withSignal(vectorization.deps, signal), timeoutMs: remaining() }),
    );

    stage = "match";
    const matchStarted = Date.now();
    const rows = await within(matchPassages(target, vectors[0], vectorization.minSimilarity, signal));

    stage = "documents";
    const documents = await within(readDocuments(target, [...new Set(rows.map((row) => row.document_id))], signal));
    const passages = retainPassages(rows, documents);

    if (passages.length === 0) {
      // Aucun Passage : refus enregistré, sans appel à OpenAI ; l'unité est rendue (aucun appel
      // facturable). L'appel court qui départage les deux refus arrive en 5.3.
      stage = "refusal";
      await within(
        rpc(
          target,
          "save_assistant_answer",
          { p_conversation_id: conversationId, p_kind: "refusal_info_absente", p_content: REFUSAL_INFO_ABSENTE, p_sources: [] },
          signal,
        ),
      );
      const released = await release();
      logInfo("chat_done", {
        kind: "refusal_info_absente",
        passages: 0,
        simulated: vectorization.simulated,
        released,
        duration_ms: Date.now() - started,
      });
      return json({ conversationId, message: { kind: "refusal_info_absente", content: REFUSAL_INFO_ABSENTE, sources: [] } });
    }

    stage = "generate";
    const messages = buildChatMessages({ question: input.question, passages: passages.map((passage) => passage.chat) });
    const fakeGeneration = generationDeps();
    const generateStarted = Date.now();
    generation = "billed";
    let generated: Awaited<ReturnType<typeof generateAnswer>>;
    try {
      generated = await within(
        generateAnswer(messages, {
          deps: withSignal(fakeGeneration, signal),
          timeoutMs: Math.min(generationMaxMs, remaining()),
        }),
      );
    } catch (error) {
      // Seule une génération sans aucune réponse reçue (réseau, 5xx, refus, plafond), hors délai
      // commun dépassé, laisse l'unité rendable ; délai après envoi et réponse reçue la consomment.
      // Une AiError sans issue a été levée avant tout envoi (ex. clé absente) ; celle du délai commun
      // (signal abandonné) reste « billed ».
      if (error instanceof AiError && (error.outcome === "no_response" || error.outcome === undefined) && !signal.aborted) {
        generation = "no_response";
      }
      throw error;
    }

    stage = "citations";
    const reading = readCitations(generated.text, passages.map((passage) => passage.chat));
    if (reading.cited.length === 0) {
      // Génération reçue et facturée : unité consommée (retrait des citations invalides : 5.4).
      logEvent("chat_citations_invalid", { unknown: reading.unknown.length });
      throw new AiError("AI_CITATIONS_INVALID", true, "aucune citation valide", undefined, undefined, "response_received");
    }
    const sources = sourcesToSave(reading.sources, passages);

    stage = "save";
    const saveStarted = Date.now();
    const saved = (await within(
      rpc(
        target,
        "save_assistant_answer",
        {
          p_conversation_id: conversationId,
          p_kind: "answer",
          p_content: generated.text,
          p_sources: sources.map(({ document_id, document_title, text_version, passages }) => ({
            document_id,
            document_title,
            text_version,
            passages,
          })),
        },
        signal,
      ),
    )) as { sources?: { ordinal?: unknown; document_id?: unknown }[] } | null;
    const savedSources = Array.isArray(saved?.sources) ? saved.sources : null;
    if (!savedSources || savedSources.length !== sources.length) throw new ChatError("INTERNAL", 500, true, "save_invalid_body");

    const finished = Date.now();
    logInfo("chat_done", {
      kind: "answer",
      passages: passages.length,
      sources: sources.length,
      cited: reading.cited.length,
      unknown_citations: reading.unknown.length,
      simulated: vectorization.simulated,
      generation_simulated: fakeGeneration !== undefined,
      model: generated.model,
      input_tokens: generated.usage.inputTokens,
      output_tokens: generated.usage.outputTokens,
      embed_ms: matchStarted - embedStarted,
      generate_ms: saveStarted - generateStarted,
      duration_ms: finished - started,
    });
    return json({
      conversationId,
      message: {
        kind: "answer",
        content: generated.text,
        sources: sources.map((source, index) => ({
          // Null si le Document a été supprimé entre la Recherche et l'enregistrement (FR-12).
          documentId: typeof savedSources[index].document_id === "string" ? savedSources[index].document_id : null,
          title: source.document_title,
          passageNumbers: source.passageNumbers,
        })),
      },
    });
  } catch (error) {
    const { code, status, retryable, cause } = failure(error, signal.aborted);
    // Échec enregistré (AD-17), même si le navigateur s'est déconnecté, avec son propre délai.
    let recorded = false;
    if (conversationId) {
      try {
        const cleanup = AbortSignal.timeout(options.cleanupTimeoutMs ?? CHAT_CLEANUP_TIMEOUT_MS);
        await rpc(target, "record_assistant_failure", { p_conversation_id: conversationId, p_error_code: code }, cleanup);
        recorded = true;
      } catch (recordError) {
        logEvent("chat_failure_not_recorded", { cause: recordError instanceof ChatError ? recordError.reason : "network" });
      }
    }
    const released = reservationId !== null && isReleasable(generation) ? await release() : false;
    logEvent("chat_failed", {
      code,
      cause,
      stage,
      generation,
      recorded,
      released,
      duration_ms: Date.now() - started,
    });
    return errorResponse(code, messageFor(code), retryable, status);
  } finally {
    clearTimeout(timer);
  }
}

// Le travail continue jusqu'à son terme même si le relais se déconnecte (AD-17) : la promesse est
// confiée à EdgeRuntime.waitUntil quand il existe.
const runtime = globalThis as {
  Deno?: { serve(handler: (request: Request) => Promise<Response>): unknown };
  EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
};
runtime.Deno?.serve((request) => {
  const work = handle(request);
  runtime.EdgeRuntime?.waitUntil(work.catch(() => {}));
  return work;
});
