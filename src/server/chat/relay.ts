import "server-only";
import { appError, type AppError, ERROR_CODES, type ErrorCode, logEvent, logInfo } from "@/lib/errors";
import { formatResetMoment } from "@/lib/reset-moment";
import { type ChatRequest, type ChatResponse, chatResponseSchema } from "@/lib/schemas/chat";
import { texts } from "@/lib/texts";

// Délai du relais : l'échéance de chat (60 s) plus l'enregistrement de l'échec et la marge du réseau
// et du démarrage (story 5.2a-2). maxDuration de la route : 120 s.
export const CHAT_RELAY_TIMEOUT_MS = 70_000;

export type ChatTarget = { url: string; apikey: string | undefined };

function defaultTarget(): ChatTarget {
  return {
    url: new URL("/functions/v1/chat", process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export type ChatRelayResult = { status: number; body: ChatResponse | AppError };

const isErrorCode = (value: unknown): value is ErrorCode => ERROR_CODES.includes(value as ErrorCode);

// Moment du rétablissement : le fuseau du navigateur est inconnu ici, l'heure est donnée en UTC.
const moment = (resetAt: string) => `${formatResetMoment(resetAt, new Date(), "UTC")} (UTC)`;

// Texte du catalogue pour chaque code renvoyé par chat.
export function chatMessage(code: ErrorCode, resetAt?: string): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return texts.session.expired;
    case "QUOTA_EXCEEDED":
      return texts.assistant.quotaExceeded(resetAt ? moment(resetAt) : "demain");
    case "AI_DAILY_CAP_REACHED":
      return texts.assistant.dailyCapReached(resetAt ? moment(resetAt) : "demain");
    case "AI_CITATIONS_INVALID":
      return texts.assistant.unverifiable;
    case "AI_BUDGET_EXHAUSTED":
      return texts.assistant.budgetExhausted;
    case "REQUEST_IN_PROGRESS":
      return texts.assistant.inProgress;
    // Demande refusée par chat (corps illisible, identifiant invalide, 405) : saisie invalide, pas une
    // panne (story 5.2b, report g). La route a déjà refusé une question vide ou trop longue.
    case "VALIDATION_FAILED":
      return texts.assistant.invalidRequest;
    default:
      return texts.assistant.failed;
  }
}

const failed = (code: ErrorCode, retryable: boolean, status: number, resetAt?: string): ChatRelayResult => ({
  status,
  body: appError(code, chatMessage(code, resetAt), retryable, resetAt),
});

const unavailable = (): ChatRelayResult => failed("AI_UNAVAILABLE", true, 503);

const validResetAt = (value: unknown): string | undefined =>
  typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : undefined;

// Relaie la question vers l'Edge Function chat avec le jeton d'accès du Collaborateur (jamais
// service_role). Réponse JSON, non diffusée (diffusion : 5.5). Les codes AD-19 de la fonction sont
// relayés tels quels, avec le texte du catalogue et resetAt ; la réponse est relue par
// chatResponseSchema. L'abandon du navigateur est propagé : la fonction termine et enregistre son
// travail de son côté (AD-17). Ne lève jamais d'exception ; journaux sans question, réponse ni jeton.
export async function relayChat(
  request: ChatRequest,
  accessToken: string,
  clientSignal?: AbortSignal,
  target: ChatTarget = defaultTarget(),
  timeoutMs = CHAT_RELAY_TIMEOUT_MS,
): Promise<ChatRelayResult> {
  const started = Date.now();
  if (!target.apikey) {
    logEvent("chat_relay_failed", { cause: "not_configured" });
    return unavailable();
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = clientSignal ? AbortSignal.any([timeout, clientSignal]) : timeout;
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(target.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, apikey: target.apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ question: request.question, clientRequestId: request.clientRequestId }),
      cache: "no-store",
      signal,
    });
    body = await response.json().catch(() => undefined);
  } catch {
    const cause = timeout.aborted ? "timeout" : clientSignal?.aborted ? "client_aborted" : "network";
    logEvent("chat_relay_failed", { cause, duration_ms: Date.now() - started });
    return cause === "timeout" ? failed("AI_TIMEOUT", true, 504) : unavailable();
  }
  const duration_ms = Date.now() - started;

  if (response.ok) {
    const parsed = chatResponseSchema.safeParse(body);
    if (!parsed.success) {
      logEvent("chat_relay_failed", { cause: "invalid_body", status: response.status, duration_ms });
      return unavailable();
    }
    logInfo("chat_relayed", { kind: parsed.data.message.kind, sources: parsed.data.message.sources.length, duration_ms });
    return { status: 200, body: parsed.data };
  }

  // La passerelle Supabase refuse un jeton invalide avant la fonction, avec son propre corps.
  if (response.status === 401) return failed("UNAUTHENTICATED", false, 401);

  const error = (body as { error?: { code?: unknown; retryable?: unknown; resetAt?: unknown } } | undefined)?.error;
  if (!isErrorCode(error?.code) || response.status < 400) {
    logEvent("chat_relay_failed", { cause: "unexpected_error", status: response.status, duration_ms });
    return unavailable();
  }
  logEvent("chat_relay_refused", { code: error.code, status: response.status, duration_ms });
  return failed(error.code, error.retryable === true, response.status, validResetAt(error.resetAt));
}
