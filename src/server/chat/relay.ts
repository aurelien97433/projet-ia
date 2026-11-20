import "server-only";
import { appError, type AppError, ERROR_CODES, type ErrorCode, logEvent, logInfo } from "@/lib/errors";
import { formatResetMoment } from "@/lib/reset-moment";
import { type ChatRequest, type ChatResponse, chatResponseSchema } from "@/lib/schemas/chat";
import { texts } from "@/lib/texts";

// Délai du relais JSON : l'échéance de chat en mode JSON (60 s) plus l'enregistrement de l'échec et la
// marge du réseau et du démarrage (story 5.2a-2). maxDuration de la route : 120 s.
export const CHAT_RELAY_TIMEOUT_MS = 70_000;
// Relais du flux (story 5.5, AD-16) : 25 s jusqu'aux en-têtes de chat (envoyés dès la demande acceptée,
// démarrage à froid compris) ; le corps n'est pas borné ici : chat s'arrête à 85 s, le navigateur à
// 90 s, la route à maxDuration (120 s). Story 5.8 (garde-fou des 17 s, AD-16) : chat envoie ses
// en-têtes, ou une réponse JSON 504 AI_TIMEOUT relayée telle quelle, au plus 17 s après la réception,
// reformulation et écritures en base comprises (elles continuent en tâche de fond) : marge d'au moins
// 8 s sur ces 25 s.
export const CHAT_STREAM_HEADERS_TIMEOUT_MS = 25_000;

// En-têtes du flux : variante de base validée en 5.0 (docs/mesures/flux-vercel.md). B1 (plan B d'AD-16,
// prêt mais inactif) : recopie morceau par morceau, X-Accel-Buffering: no, sans compression. Elle ne
// s'active qu'en changeant CHAT_STREAM_VARIANT, après une mesure en échec et sur décision de
// l'utilisateur.
export type StreamVariant = "base" | "b1";
export const CHAT_STREAM_VARIANT: StreamVariant = "base";
export const STREAM_HEADERS = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" };
export const B1_STREAM_HEADERS = { ...STREAM_HEADERS, "X-Accel-Buffering": "no", "Content-Encoding": "identity" };

export type ChatTarget = { url: string; apikey: string | undefined };

function defaultTarget(): ChatTarget {
  return {
    url: new URL("/functions/v1/chat", process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export type ChatRelayResult = { status: number; body: ChatResponse | AppError };

const isErrorCode = (value: unknown): value is ErrorCode => ERROR_CODES.includes(value as ErrorCode);

// Moment du rétablissement : le fuseau du navigateur est inconnu ici, l'heure est donnée en UTC. Story
// 5.10 : texte de repli seulement (client sans resetAt) ; la page recalcule le moment en heure locale à
// partir de resetAt, relayé avec le refus.
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
    // Conversation absente ou d'un autre Compte (story 5.6, S3) : même texte neutre que la page E9.
    case "NOT_FOUND":
      return texts.notFound.text;
    // Demande refusée par chat (corps illisible, identifiant invalide, 405) : saisie invalide, pas une
    // panne (story 5.2b, report g). La route a déjà refusé une question vide ou trop longue.
    case "VALIDATION_FAILED":
      return texts.assistant.invalidRequest;
    default:
      return texts.assistant.failed;
  }
}

// Corps envoyé à chat : la Conversation poursuivie seulement si elle est fournie (story 5.6).
const requestBody = ({ question, clientRequestId, conversationId }: ChatRequest) =>
  JSON.stringify(conversationId ? { question, clientRequestId, conversationId } : { question, clientRequestId });

const failed = (code: ErrorCode, retryable: boolean, status: number, resetAt?: string, conversationId?: string): ChatRelayResult => ({
  status,
  body: appError(code, chatMessage(code, resetAt), retryable, resetAt, conversationId),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Story 5.9 : Conversation de la question déjà en cours, relayée avec le 409 REQUEST_IN_PROGRESS seulement.
const validConversationId = (code: ErrorCode, value: unknown): string | undefined =>
  code === "REQUEST_IN_PROGRESS" && typeof value === "string" && UUID.test(value) ? value.toLowerCase() : undefined;

const unavailable = (): ChatRelayResult => failed("AI_UNAVAILABLE", true, 503);

const validResetAt = (value: unknown): string | undefined =>
  typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : undefined;

// Relaie la question vers l'Edge Function chat avec le jeton d'accès du Collaborateur (jamais
// service_role). Mode JSON (réponse d'un bloc), gardé pour une page antérieure au flux (story 5.5,
// onglet ouvert pendant le push) ; le flux passe par relayChatStream. Les codes AD-19 de la fonction sont
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
      body: requestBody(request),
      cache: "no-store",
      signal,
    });
    body = await response.json().catch(() => undefined);
  } catch {
    const cause = timeout.aborted ? "timeout" : clientSignal?.aborted ? "client_aborted" : "network";
    logEvent("chat_relay_failed", { cause, duration_ms: Date.now() - started });
    return cause === "timeout" ? failed("AI_TIMEOUT", true, 504) : unavailable();
  }
  return readJsonResult(response, body, Date.now() - started);
}

// Réponse JSON de chat (mode JSON, ou refus avant le flux) : succès relu par chatResponseSchema, codes
// AD-19 relayés avec le texte du catalogue et resetAt.
function readJsonResult(response: Response, body: unknown, duration_ms: number): ChatRelayResult {
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

  const error = (body as { error?: { code?: unknown; retryable?: unknown; resetAt?: unknown; conversationId?: unknown } } | undefined)?.error;
  if (!isErrorCode(error?.code) || response.status < 400) {
    logEvent("chat_relay_failed", { cause: "unexpected_error", status: response.status, duration_ms });
    return unavailable();
  }
  logEvent("chat_relay_refused", { code: error.code, status: response.status, duration_ms });
  return failed(error.code, error.retryable === true, response.status, validResetAt(error.resetAt), validConversationId(error.code, error.conversationId));
}

const jsonResponse = ({ status, body }: ChatRelayResult) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// B1 : recopie morceau par morceau dans un nouveau ReadableStream, sans transformation (story 5.0).
export function copyStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

// Relais du flux (story 5.5) : la question part vers chat avec « Accept: text/event-stream » et le
// jeton d'accès du Collaborateur (jamais service_role). Flux reçu : corps relayé tel quel (variante de
// base de la 5.0), sans lecture ni transformation. Réponse JSON (refus avant le flux : session, saisie,
// rejeu, quota, plafond ; ou chat encore en mode JSON) : même traitement que relayChat. 25 s au plus
// jusqu'aux en-têtes ; l'abandon du navigateur interrompt l'envoi, chat termine et enregistre son travail
// de son côté (AD-17). Ne lève jamais d'exception ; journaux sans question, texte ni jeton.
export async function relayChatStream(
  request: ChatRequest,
  accessToken: string,
  clientSignal?: AbortSignal,
  target: ChatTarget = defaultTarget(),
  headersTimeoutMs = CHAT_STREAM_HEADERS_TIMEOUT_MS,
  variant: StreamVariant = CHAT_STREAM_VARIANT,
): Promise<Response> {
  const started = Date.now();
  if (!target.apikey) {
    logEvent("chat_relay_failed", { cause: "not_configured", mode: "stream" });
    return jsonResponse(unavailable());
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, headersTimeoutMs);
  const abort = () => controller.abort();
  clientSignal?.addEventListener("abort", abort, { once: true });
  if (clientSignal?.aborted) abort();

  let response: Response;
  try {
    response = await fetch(target.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: target.apikey,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: requestBody(request),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    clientSignal?.removeEventListener("abort", abort);
    const cause = timedOut ? "timeout" : clientSignal?.aborted ? "client_aborted" : "network";
    logEvent("chat_relay_failed", { cause, mode: "stream", duration_ms: Date.now() - started });
    return jsonResponse(cause === "timeout" ? failed("AI_TIMEOUT", true, 504) : unavailable());
  } finally {
    clearTimeout(timer);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok && response.body && contentType.includes("text/event-stream")) {
    logInfo("chat_stream_opened", { variant, duration_ms: Date.now() - started });
    return variant === "b1"
      ? new Response(copyStream(response.body), { status: 200, headers: B1_STREAM_HEADERS })
      : new Response(response.body, { status: 200, headers: STREAM_HEADERS });
  }

  clientSignal?.removeEventListener("abort", abort);
  const body: unknown = await response.json().catch(() => undefined);
  return jsonResponse(readJsonResult(response, body, Date.now() - started));
}
