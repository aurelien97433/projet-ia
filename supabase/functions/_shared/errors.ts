// Forme unique des erreurs (AD-19), côté Edge Functions. Les fonctions n'importent rien de src/ :
// la liste des codes reprend celle de src/lib/errors.ts, et un test vérifie qu'elles sont identiques.
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

// Échec d'un appel à l'IA, traduit en code de la liste. Le message reste technique et ne quitte
// jamais le serveur : la réponse au navigateur porte le texte du catalogue (AD-19).
export class AiError extends Error {
  constructor(
    readonly code: Extract<ErrorCode, `AI_${string}` | "VALIDATION_FAILED">,
    readonly retryable: boolean,
    message: string,
    // Code renvoyé par le fournisseur (ex. unsupported_parameter), pour le diagnostic : jamais son
    // message, qui pourrait citer la requête.
    readonly providerCode?: string,
    // Paramètre refusé par le fournisseur (ex. temperature), nom de champ seulement.
    readonly providerParam?: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export function errorResponse(code: ErrorCode, message: string, retryable: boolean, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message, retryable } }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

type LogDetails = Record<string, string | number | boolean | undefined>;

// Journalisation structurée (§6) : jamais de secret, de jeton, ni de texte de Document.
// logEvent : un échec ou un refus, au niveau Error. logInfo : un événement normal, au niveau Info.
export function logEvent(event: string, details: LogDetails): void {
  console.error(JSON.stringify({ event, ...details }));
}

export function logInfo(event: string, details: LogDetails): void {
  console.log(JSON.stringify({ event, ...details }));
}
