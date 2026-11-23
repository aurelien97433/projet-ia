import "server-only";
import { appError, type AppError, ERROR_CODES, type ErrorCode, logEvent, logInfo } from "@/lib/errors";
import { formatResetMoment } from "@/lib/reset-moment";
import { type SummaryResponse, summaryResponseSchema } from "@/lib/schemas/summary";
import { texts } from "@/lib/texts";

// Délai du relais (story 6.1, AD-16) : summarize s'arrête au plus tard à 120 s, enregistrement ou
// libération compris ; 5 s de marge pour le réseau et le démarrage. Chaîne : summarize 120 s < relais
// 125 s < page 130 s < maxDuration 150 s.
export const SUMMARY_RELAY_TIMEOUT_MS = 125_000;

export type SummaryTarget = { url: string; apikey: string | undefined };

function defaultTarget(): SummaryTarget {
  return {
    url: new URL("/functions/v1/summarize", process.env.NEXT_PUBLIC_SUPABASE_URL).toString(),
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export type SummaryRelayResult = { status: number; body: SummaryResponse | AppError };

const isErrorCode = (value: unknown): value is ErrorCode => ERROR_CODES.includes(value as ErrorCode);

// Moment du rétablissement : fuseau du navigateur inconnu ici, texte de repli en UTC ; la page le
// recalcule en heure locale à partir de resetAt (même règle que l'Assistant, story 5.10).
const moment = (resetAt: string) => `${formatResetMoment(resetAt, new Date(), "UTC")} (UTC)`;

// Texte du catalogue pour chaque code renvoyé par summarize.
export function summaryMessage(code: ErrorCode, resetAt?: string): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return texts.session.expired;
    case "NOT_FOUND":
      return texts.notFound.text;
    case "DOCUMENT_NOT_READY":
      return texts.summary.notReady;
    case "REQUEST_IN_PROGRESS":
      return texts.summary.inProgress;
    case "QUOTA_EXCEEDED":
      return texts.summary.quotaExceeded(resetAt ? moment(resetAt) : "demain");
    case "AI_DAILY_CAP_REACHED":
      return texts.summary.dailyCapReached(resetAt ? moment(resetAt) : "demain");
    case "AI_BUDGET_EXHAUSTED":
      return texts.assistant.budgetExhausted;
    default:
      return texts.summary.failed;
  }
}

const failed = (code: ErrorCode, retryable: boolean, status: number, resetAt?: string): SummaryRelayResult => ({
  status,
  body: appError(code, summaryMessage(code, resetAt), retryable, resetAt),
});

const unavailable = (): SummaryRelayResult => failed("AI_UNAVAILABLE", true, 503);

const validResetAt = (value: unknown): string | undefined =>
  typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : undefined;

// Relaie la demande de Résumé vers l'Edge Function summarize avec le jeton d'accès du Collaborateur
// (jamais service_role : la clé n'existe pas côté Next.js). Réponse JSON d'un bloc (pas de flux) : succès
// relu par summaryResponseSchema, codes AD-19 relayés avec le texte du catalogue et resetAt. L'abandon du
// navigateur est propagé ; summarize va à son terme de son côté. Ne lève jamais d'exception ; journaux
// sans texte, points ni jeton.
export async function relaySummary(
  documentId: string,
  accessToken: string,
  clientSignal?: AbortSignal,
  target: SummaryTarget = defaultTarget(),
  timeoutMs = SUMMARY_RELAY_TIMEOUT_MS,
): Promise<SummaryRelayResult> {
  const started = Date.now();
  if (!target.apikey) {
    logEvent("summary_relay_failed", { cause: "not_configured" });
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
      body: JSON.stringify({ documentId }),
      cache: "no-store",
      signal,
    });
    body = await response.json().catch(() => undefined);
  } catch {
    const cause = timeout.aborted ? "timeout" : clientSignal?.aborted ? "client_aborted" : "network";
    logEvent("summary_relay_failed", { cause, duration_ms: Date.now() - started });
    return cause === "timeout" ? failed("AI_TIMEOUT", true, 504) : unavailable();
  }
  const duration_ms = Date.now() - started;

  if (response.ok) {
    const parsed = summaryResponseSchema.safeParse(body);
    if (!parsed.success) {
      logEvent("summary_relay_failed", { cause: "invalid_body", status: response.status, duration_ms });
      return unavailable();
    }
    logInfo("summary_relayed", { generated: parsed.data.generated, points: parsed.data.summary.points.length, duration_ms });
    return { status: 200, body: parsed.data };
  }

  // La passerelle Supabase refuse un jeton invalide avant la fonction, avec son propre corps.
  if (response.status === 401) return failed("UNAUTHENTICATED", false, 401);

  const error = (body as { error?: { code?: unknown; retryable?: unknown; resetAt?: unknown } } | undefined)?.error;
  if (!isErrorCode(error?.code) || response.status < 400) {
    logEvent("summary_relay_failed", { cause: "unexpected_error", status: response.status, duration_ms });
    return unavailable();
  }
  logEvent("summary_relay_refused", { code: error.code, status: response.status, duration_ms });
  return failed(error.code, error.retryable === true, response.status, validResetAt(error.resetAt));
}
