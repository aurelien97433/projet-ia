// Recherche sémantique (story 4.1a, FR-14, FR-15). Appelée par Next.js seulement, avec le jeton du
// Collaborateur (verify_jwt = true dans supabase/config.toml). La base est interrogée avec ce jeton,
// jamais avec service_role : la RLS s'applique dans match_passages (Documents prêts seulement).
// Réponse : 5 Documents au plus, chacun avec son meilleur Passage, sans score ni texte rédigé.
import { type AiDeps, embed } from "../_shared/ai.ts";
import {
  EMBEDDING_MODEL,
  EMBEDDING_VERSION,
  readEnv,
  SEARCH_MAX_DOCUMENTS,
  SEARCH_PASSAGES_PER_DOCUMENT,
  SEARCH_TIMEOUT_MS,
} from "../_shared/config.ts";
import { AiError, type ErrorCode, errorResponse, logEvent, logInfo } from "../_shared/errors.ts";
import { parseSearchQuery, searchVectorization, toSearchResponse } from "../_shared/search.ts";

// Textes du catalogue (src/lib/texts.ts) : les Edge Functions n'importent rien de src/.
const FAILURE_MESSAGE = "La Recherche n'a pas pu aboutir.";
const SESSION_MESSAGE = "Votre session a expiré. Reconnectez-vous pour continuer.";

// Échec hors IA, avec le code AD-19 et le statut à renvoyer. La cause va aux journaux seulement.
class SearchError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly retryable: boolean,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "SearchError";
  }
}

type Target = { url: string; apikey: string; token: string };

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  return token || null;
}

// Clé publique pour l'API Supabase : la clé publiable reçue de Next.js, ou la clé anon du projet.
// Une autre clé reçue (secrète) est ignorée : la Recherche ne passe jamais par service_role.
function publicKey(request: Request): string | undefined {
  const received = request.headers.get("apikey") ?? "";
  return received.startsWith("sb_publishable_") ? received : readEnv("SUPABASE_ANON_KEY");
}

function headers({ apikey, token }: Target): Record<string, string> {
  return { apikey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// Session du Collaborateur, vérifiée par le serveur Auth : jeton expiré, révoqué ou étranger → 401.
async function verifySession(target: Target, signal: AbortSignal): Promise<void> {
  const response = await fetch(`${target.url}/auth/v1/user`, { headers: headers(target), signal });
  await response.body?.cancel().catch(() => {});
  if (response.status === 401 || response.status === 403) {
    throw new SearchError("UNAUTHENTICATED", 401, false, `session_${response.status}`);
  }
  if (!response.ok) throw new SearchError("INTERNAL", 500, true, `auth_http_${response.status}`);
}

async function matchPassages(target: Target, vector: number[], minSimilarity: number, signal: AbortSignal) {
  const response = await fetch(`${target.url}/rest/v1/rpc/match_passages`, {
    method: "POST",
    headers: headers(target),
    body: JSON.stringify({
      query_embedding: JSON.stringify(vector),
      min_similarity: minSimilarity,
      max_passages: SEARCH_MAX_DOCUMENTS * SEARCH_PASSAGES_PER_DOCUMENT,
      max_per_document: SEARCH_PASSAGES_PER_DOCUMENT,
      embedding_model: EMBEDDING_MODEL,
      embedding_version: EMBEDDING_VERSION,
    }),
    signal,
  });
  if (response.status === 401) throw new SearchError("UNAUTHENTICATED", 401, false, "rpc_http_401");
  if (!response.ok) throw new SearchError("INTERNAL", 500, true, `rpc_http_${response.status}`);
  const results = toSearchResponse(await response.json());
  if (!results) throw new SearchError("INTERNAL", 500, true, "rpc_invalid_rows");
  return results;
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
    const expire = () => reject(new AiError("AI_TIMEOUT", true, "délai de la Recherche dépassé"));
    if (signal.aborted) expire();
    else signal.addEventListener("abort", expire, { once: true });
  });
}

function failure(error: unknown, timedOut: boolean): { code: ErrorCode; status: number; retryable: boolean; cause: string } {
  if (error instanceof SearchError) {
    if (timedOut && error.code === "INTERNAL") return { code: "AI_TIMEOUT", status: 504, retryable: true, cause: "timeout" };
    return { code: error.code, status: error.status, retryable: error.retryable, cause: error.reason };
  }
  if (error instanceof AiError) {
    if (error.code === "AI_TIMEOUT") return { code: "AI_TIMEOUT", status: 504, retryable: true, cause: error.code };
    if (error.code === "AI_BUDGET_EXHAUSTED") return { code: "AI_BUDGET_EXHAUSTED", status: 503, retryable: false, cause: error.code };
    return { code: "AI_UNAVAILABLE", status: 503, retryable: error.code === "AI_UNAVAILABLE" ? error.retryable : true, cause: error.code };
  }
  if (timedOut) return { code: "AI_TIMEOUT", status: 504, retryable: true, cause: "timeout" };
  return { code: "INTERNAL", status: 500, retryable: true, cause: error instanceof Error ? error.name : "unknown" };
}

export type HandleOptions = { timeoutMs?: number };

export async function handle(request: Request, options: HandleOptions = {}): Promise<Response> {
  if (request.method !== "POST") return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 405);

  const token = bearerToken(request);
  if (!token) return errorResponse("UNAUTHENTICATED", SESSION_MESSAGE, false, 401);

  const url = readEnv("SUPABASE_URL");
  const apikey = publicKey(request);
  if (!url || !apikey) {
    logEvent("semantic_search_not_configured", {});
    return errorResponse("INTERNAL", FAILURE_MESSAGE, true, 500);
  }
  const target = { url, apikey, token };

  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let stage = "session";
  try {
    await verifySession(target, controller.signal);

    stage = "validation";
    const query = parseSearchQuery(await request.json().catch(() => undefined));
    if (!query) return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 400);

    stage = "embed";
    const { deps, simulated, minSimilarity } = searchVectorization();
    const remaining = Math.max(1, timeoutMs - (Date.now() - started));
    const embedStarted = Date.now();
    // Le délai peut expirer après la vectorisation, pendant la requête en base : son rejet est alors
    // déjà sans lecteur, et ne doit pas devenir un rejet non géré.
    const expired = deadline(controller.signal);
    expired.catch(() => {});
    const { vectors } = await Promise.race([
      embed([query], { deps: withSignal(deps, controller.signal), timeoutMs: remaining }),
      expired,
    ]);

    stage = "match";
    const matchStarted = Date.now();
    const body = await matchPassages(target, vectors[0], minSimilarity, controller.signal);

    const finished = Date.now();
    logInfo("semantic_search_done", {
      results: body.results.length,
      simulated,
      embed_ms: matchStarted - embedStarted,
      match_ms: finished - matchStarted,
      duration_ms: finished - started,
    });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const { code, status, retryable, cause } = failure(error, controller.signal.aborted);
    logEvent("semantic_search_failed", { code, cause, stage, duration_ms: Date.now() - started });
    return errorResponse(code, code === "UNAUTHENTICATED" ? SESSION_MESSAGE : FAILURE_MESSAGE, retryable, status);
  } finally {
    clearTimeout(timer);
  }
}

(globalThis as { Deno?: { serve(handler: (request: Request) => Promise<Response>): unknown } }).Deno?.serve((request) =>
  handle(request),
);
