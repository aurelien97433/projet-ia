// Fil d'une Conversation enregistrée (story 5.6) : règles d'affichage d'un échange et retrait des
// repères bruts des anciennes réponses. Module pur, partagé par la lecture serveur et la page.
import { ERROR_CODES, type ErrorCode } from "@/lib/errors";
import { texts } from "@/lib/texts";

// Question sans message de l'Assistant (AD-16) : en cours pendant 90 s, la page se rechargeant toutes
// les 5 s ; au-delà, traitée comme un échec AI_TIMEOUT. Même seuil que la vue conversation_list.
export const PENDING_LIMIT_MS = 90_000;
export const PENDING_REFRESH_MS = 5_000;

export type MessageKind = "question" | "answer" | "refusal_info_absente" | "refusal_hors_cadre" | "failure";

// Source enregistrée d'une réponse, dans l'ordre (ordinal) ; documentId null : Document supprimé.
export type ThreadSource = { documentId: string | null; title: string; passageCount: number };

// Message tel qu'il est lu en base (messages et message_sources), dans l'ordre de created_at.
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  kind: MessageKind;
  content: string | null;
  errorCode: string | null;
  createdAt: string;
  // Identifiant de la demande : celui de la question et, depuis la story 5.6, celui de la réponse, du
  // refus ou de l'échec qui lui répond (null sur les messages de l'Assistant plus anciens).
  clientRequestId: string | null;
  sources: ThreadSource[];
};

export type RefusalVariant = "info_absente" | "hors_cadre";

export type ThreadReply =
  | { kind: "answer"; content: string; sources: ThreadSource[] }
  | { kind: "refusal"; variant: RefusalVariant }
  | { kind: "failure"; code: ErrorCode }
  | { kind: "pending" };

// Un échange : une question et l'issue retenue parmi les messages de l'Assistant qui la suivent.
export type ThreadExchange = { id: string; question: string; reply: ThreadReply };

const asErrorCode = (value: string | null): ErrorCode =>
  ERROR_CODES.includes(value as ErrorCode) ? (value as ErrorCode) : "INTERNAL";

// Issue d'un échange :
// 1. une réponse ou un refus enregistré l'emporte sur un échec de la même question (le plus récent) ;
// 2. échec seul → échec, avec son code ;
// 3. aucun message de l'Assistant : en cours pendant 90 s après la question, puis échec AI_TIMEOUT.
export function exchangeReply(questionCreatedAt: string, replies: StoredMessage[], nowMs: number): ThreadReply {
  const settled = replies.filter((message) => message.kind !== "failure" && message.kind !== "question").at(-1);
  if (settled) {
    if (settled.kind === "refusal_info_absente") return { kind: "refusal", variant: "info_absente" };
    if (settled.kind === "refusal_hors_cadre") return { kind: "refusal", variant: "hors_cadre" };
    return { kind: "answer", content: settled.content ?? "", sources: settled.sources };
  }
  const failure = replies.filter((message) => message.kind === "failure").at(-1);
  if (failure) return { kind: "failure", code: asErrorCode(failure.errorCode) };
  const age = nowMs - Date.parse(questionCreatedAt);
  return age < PENDING_LIMIT_MS ? { kind: "pending" } : { kind: "failure", code: "AI_TIMEOUT" };
}

// Fil : chaque question ouvre un échange (messages triés par created_at). Un message de l'Assistant se
// rattache à la question qui porte le même clientRequestId (story 5.6 : deux questions d'une même
// Conversation peuvent être traitées en même temps, leurs issues arrivant dans le désordre) ; sans
// identifiant (messages d'avant la 5.6) ou sans question correspondante, à la dernière question qui le
// précède. Un message de l'Assistant sans question avant lui est ignoré. Même règle que la vue
// conversation_list.
type Group = { question: StoredMessage; replies: StoredMessage[] };

export function buildThread(messages: StoredMessage[], nowMs: number): ThreadExchange[] {
  const groups: Group[] = [];
  const byRequest = new Map<string, Group>();
  for (const message of messages) {
    if (message.role === "user") {
      const group: Group = { question: message, replies: [] };
      groups.push(group);
      if (message.clientRequestId) byRequest.set(message.clientRequestId, group);
      continue;
    }
    const target = (message.clientRequestId ? byRequest.get(message.clientRequestId) : undefined) ?? groups.at(-1);
    target?.replies.push(message);
  }
  return groups.map(({ question, replies }) => ({
    id: question.id,
    question: question.content ?? "",
    reply: exchangeReply(question.createdAt, replies, nowMs),
  }));
}

// Dernier échange encore en cours : la page se recharge toutes les 5 s jusqu'à son issue.
export const hasPendingExchange = (exchanges: ThreadExchange[]) => exchanges.at(-1)?.reply.kind === "pending";

// Texte du catalogue pour un échec enregistré, selon son code (mêmes textes que le relais de chat).
export function failureMessage(code: ErrorCode): string {
  switch (code) {
    case "AI_CITATIONS_INVALID":
      return texts.assistant.unverifiable;
    case "AI_BUDGET_EXHAUSTED":
      return texts.assistant.budgetExhausted;
    default:
      return texts.assistant.failed;
  }
}

// Plafond du fournisseur : pas de « Réessayer » (même règle que la réponse de chat).
export const failureRetryable = (code: ErrorCode) => code !== "AI_BUDGET_EXHAUSTED";

// Report de la 5.4 : les réponses enregistrées avant elle portent les repères bruts du modèle ([P2],
// [P1, P2], [P]…, toute forme reconnue par CITATION_LIKE de _shared/rag/citations.ts). Ils sont retirés
// à l'affichage seulement, avec les espaces qui les précèdent (en début de ligne : celles qui les
// suivent), sans renvoi ; aucune ligne n'est modifiée. « [Procédure] » et les renvois [S{n}] de la 5.4
// ne sont pas touchés.
const RAW_CANDIDATE = /[^\S\n]*(\[P[^[\]\n]{0,40}\])/g;
const LINE_START_CANDIDATE = /(^|\n)[^\S\n]*(\[P[^[\]\n]{0,40}\])[^\S\n]*/g;
const CITATION_LIKE = /^\[P[\sP\d,;\-–]*\]$/;

export function stripRawCitations(content: string): string {
  // Repères en début de ligne, éventuellement plusieurs à la suite : retirés avec les espaces qui suivent.
  let text = content;
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(LINE_START_CANDIDATE, (match, start: string, token: string) => (CITATION_LIKE.test(token) ? start : match));
  }
  return text.replace(RAW_CANDIDATE, (match, token: string) => (CITATION_LIKE.test(token) ? "" : match));
}
