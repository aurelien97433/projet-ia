// Forme unique des erreurs renvoyées au navigateur (AD-19) : un code de la liste ci-dessous,
// un message français du catalogue, l'indication « réessayable » et, pour le quota, resetAt.
// Le détail technique reste dans les journaux, jamais dans la réponse.
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "FORBIDDEN",
  "FILE_TYPE_UNSUPPORTED",
  "FILE_TOO_LARGE",
  "QUOTA_EXCEEDED",
  "REQUEST_IN_PROGRESS",
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_BUDGET_EXHAUSTED",
  "AI_OUTPUT_INVALID",
  "AI_CITATIONS_INVALID",
  "PROCESSING_NO_TEXT",
  "PROCESSING_TEMPORARY",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type AppError = {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    resetAt?: string;
  };
};

export function appError(code: ErrorCode, message: string, retryable: boolean, resetAt?: string): AppError {
  return { error: resetAt ? { code, message, retryable, resetAt } : { code, message, retryable } };
}

type LogDetails = Record<string, string | number | boolean | undefined>;

// Journalisation structurée (§6) : jamais de secret, de jeton, de mot de passe ni d'e-mail.
// logEvent : un échec ou un refus, au niveau Error de Vercel. logInfo : un événement normal, au
// niveau Info.
export function logEvent(event: string, details: LogDetails): void {
  console.error(JSON.stringify({ event, ...details }));
}

export function logInfo(event: string, details: LogDetails): void {
  console.log(JSON.stringify({ event, ...details }));
}
