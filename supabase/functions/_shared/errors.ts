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
  // Plafond global du projet atteint pour la journée (story 5.2a-2, distinct du quota personnel).
  "AI_DAILY_CAP_REACHED",
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

// Issue d'un appel au fournisseur, pour la règle de libération du quota (story 5.2a-2) :
// - « no_response » : aucune réponse exploitable reçue (réseau, 5xx, 429, refus 4xx, plafond) : rien
//   n'a été facturé ;
// - « response_received » : réponse 200 reçue (donc facturée), mais inexploitable ;
// - « timeout » : délai dépassé après envoi : le fournisseur peut l'avoir produite et facturée.
export type ProviderOutcome = "no_response" | "response_received" | "timeout";

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
    // Issue de l'appel (voir ProviderOutcome) ; absente si l'erreur ne vient pas d'un appel.
    readonly outcome?: ProviderOutcome,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  retryable: boolean,
  status: number,
  resetAt?: string,
): Response {
  const error = resetAt ? { code, message, retryable, resetAt } : { code, message, retryable };
  return new Response(JSON.stringify({ error }), {
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
