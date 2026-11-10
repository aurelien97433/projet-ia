import "server-only";
import { appError, type AppError, ERROR_CODES, type ErrorCode, logEvent, logInfo } from "@/lib/errors";
import { type SearchResponse, searchResponseSchema } from "@/lib/schemas/search";
import { texts } from "@/lib/texts";

// Délai du relais : celui de semantic-search (10 s) plus la marge du réseau et du démarrage.
export const SEARCH_RELAY_TIMEOUT_MS = 12_000;

export type SearchTarget = { url: string; apikey: string | undefined };

function defaultTarget(): SearchTarget {
  return {
    url: new URL("/functions/v1/semantic-search", process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export type RelayResult = { status: number; body: SearchResponse | AppError };

const isErrorCode = (value: unknown): value is ErrorCode => ERROR_CODES.includes(value as ErrorCode);

const failed = (code: ErrorCode, retryable: boolean, status: number): RelayResult => ({
  status,
  body: appError(code, code === "UNAUTHENTICATED" ? texts.session.expired : texts.search.failed, retryable),
});

// Panne du relais (réseau, délai, réponse illisible) : AI_UNAVAILABLE, sans détail technique.
const unavailable = (): RelayResult => failed("AI_UNAVAILABLE", true, 503);

// Relaie la Recherche vers l'Edge Function semantic-search avec le jeton d'accès du Collaborateur
// (jamais service_role) : la base est interrogée avec ses droits. Les codes AD-19 de la fonction
// sont relayés tels quels, avec le texte du catalogue ; la réponse est relue par searchResponseSchema,
// qui ne laisse passer aucune clé non déclarée (ni score, ni texte complet du Document).
// Ne lève jamais d'exception. Les journaux ne portent ni la Requête ni le jeton.
export async function relaySearch(
  query: string,
  accessToken: string,
  target: SearchTarget = defaultTarget(),
  timeoutMs = SEARCH_RELAY_TIMEOUT_MS,
): Promise<RelayResult> {
  const started = Date.now();
  if (!target.apikey) {
    logEvent("semantic_search_relay_failed", { cause: "not_configured" });
    return unavailable();
  }

  let response: Response;
  let body: unknown;
  try {
    response = await fetch(target.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, apikey: target.apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    body = await response.json().catch(() => undefined);
  } catch (error) {
    const cause = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network";
    logEvent("semantic_search_relay_failed", { cause, duration_ms: Date.now() - started });
    return unavailable();
  }
  const duration_ms = Date.now() - started;

  if (response.ok) {
    const parsed = searchResponseSchema.safeParse(body);
    if (!parsed.success) {
      logEvent("semantic_search_relay_failed", { cause: "invalid_body", status: response.status, duration_ms });
      return unavailable();
    }
    logInfo("semantic_search_relayed", { results: parsed.data.results.length, duration_ms });
    return { status: 200, body: parsed.data };
  }

  // La passerelle Supabase refuse un jeton invalide avant la fonction, avec son propre corps.
  if (response.status === 401) return failed("UNAUTHENTICATED", false, 401);

  const error = (body as { error?: { code?: unknown; retryable?: unknown } } | undefined)?.error;
  if (!isErrorCode(error?.code) || response.status < 400) {
    logEvent("semantic_search_relay_failed", { cause: "unexpected_error", status: response.status, duration_ms });
    return unavailable();
  }
  logEvent("semantic_search_relay_refused", { code: error.code, status: response.status, duration_ms });
  return failed(error.code, error.retryable === true, response.status);
}
