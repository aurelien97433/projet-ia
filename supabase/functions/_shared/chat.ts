// Fonction chat (story 5.2a-2) : validation de la demande, titre de la Conversation, Passages retenus
// et Sources à enregistrer. Fonctions pures, sans type Deno : importées par chat et testées par Vitest.
import {
  CHAT_HISTORY_ANSWER_MAX_LENGTH,
  CHAT_HISTORY_EXCHANGES,
  CHAT_MAX_PASSAGES,
  CHAT_MAX_QUESTION_LENGTH,
  CHAT_TITLE_MAX_LENGTH,
} from "./config.ts";
import type { CitedSource } from "./rag/citations.ts";
import type { ChatPassage, HistoryExchange } from "./rag/prompt.ts";
import type { MatchRow } from "./search.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// conversationId (story 5.6) : Conversation à poursuivre ; absent, une nouvelle Conversation est créée.
export type ChatRequest = { question: string; clientRequestId: string; conversationId?: string };

// Demande reçue dans { question, clientRequestId, conversationId? } : question de 1 à 2 000 caractères
// (unités de code JavaScript, plus strict que le décompte de la base) après suppression des espaces de
// début et de fin, non vide ; identifiant de demande UUID ; Conversation facultative, UUID si elle est
// fournie (null ou absente : nouvelle Conversation). Null si la demande est invalide.
export function parseChatRequest(body: unknown): ChatRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { question, clientRequestId, conversationId } = body as {
    question?: unknown;
    clientRequestId?: unknown;
    conversationId?: unknown;
  };
  if (typeof question !== "string" || typeof clientRequestId !== "string") return null;
  const trimmed = question.trim();
  if (trimmed.length < 1 || trimmed.length > CHAT_MAX_QUESTION_LENGTH) return null;
  if (!UUID.test(clientRequestId)) return null;
  const request: ChatRequest = { question: trimmed, clientRequestId: clientRequestId.toLowerCase() };
  if (conversationId === undefined || conversationId === null) return request;
  if (typeof conversationId !== "string" || !UUID.test(conversationId)) return null;
  return { ...request, conversationId: conversationId.toLowerCase() };
}

// Titre de la Conversation : la question sur une ligne, 120 caractères au plus (sans couper un
// caractère hors du plan de base).
export function conversationTitle(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return Array.from(oneLine).slice(0, CHAT_TITLE_MAX_LENGTH).join("").trim();
}

export type Reservation =
  | { ok: true; reservationId: string; resetAt: string }
  | { ok: false; reason: "user" | "global"; resetAt: string };

// Réponse de reserve_ai_call, ou null si elle est illisible.
export function parseReservation(value: unknown): Reservation | null {
  const row = value as { ok?: unknown; reason?: unknown; reset_at?: unknown; reservation_id?: unknown } | null;
  if (typeof row !== "object" || row === null || typeof row.reset_at !== "string") return null;
  const resetAt = new Date(row.reset_at);
  if (Number.isNaN(resetAt.getTime())) return null;
  if (row.ok === true && typeof row.reservation_id === "string" && UUID.test(row.reservation_id)) {
    return { ok: true, reservationId: row.reservation_id, resetAt: resetAt.toISOString() };
  }
  if (row.ok === false && (row.reason === "user" || row.reason === "global")) {
    return { ok: false, reason: row.reason, resetAt: resetAt.toISOString() };
  }
  return null;
}

// Document relu dans documents avec le jeton du Collaborateur : titre et version courants.
export type DocumentRow = { id: string; title: string; text_version: number };

export function isDocumentRow(value: unknown): value is DocumentRow {
  const row = value as Record<string, unknown> | null;
  return (
    typeof row === "object" &&
    row !== null &&
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    Number.isInteger(row.text_version)
  );
}

export type PassageRef = { passage_id: string; start: number; end: number };

// Passage retenu : ce qui est transmis aux consignes (ChatPassage) et ce qui est enregistré dans la
// Source (identifiant et positions, jamais d'extrait), dans le même ordre.
export type RetainedPassage = { chat: ChatPassage; ref: PassageRef; textVersion: number };

// Passages de match_passages (ordre de pertinence), 8 au plus, avec le titre et la version relus
// dans documents : jamais ceux du modèle ni du navigateur. Un Document disparu entre-temps (absent de
// la relecture) est écarté avec ses Passages.
export function retainPassages(rows: MatchRow[], documents: DocumentRow[]): RetainedPassage[] {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const retained: RetainedPassage[] = [];
  for (const row of rows) {
    const document = byId.get(row.document_id);
    if (!document) continue;
    retained.push({
      chat: { documentId: row.document_id, documentTitle: document.title, content: row.content },
      ref: { passage_id: row.passage_id, start: row.start_offset, end: row.end_offset },
      textVersion: document.text_version,
    });
    if (retained.length === CHAT_MAX_PASSAGES) break;
  }
  return retained;
}

export type SourceToSave = {
  document_id: string;
  document_title: string;
  text_version: number;
  passages: PassageRef[];
  passageNumbers: number[];
};

// Sources à enregistrer, dans l'ordre de première citation (readCitations), avec les Passages cités.
export function sourcesToSave(cited: CitedSource[], passages: RetainedPassage[]): SourceToSave[] {
  return cited.map(({ documentId, passageNumbers }) => {
    const first = passages[passageNumbers[0] - 1];
    return {
      document_id: documentId,
      document_title: first.chat.documentTitle,
      text_version: first.textVersion,
      passages: passageNumbers.map((n) => passages[n - 1].ref),
      passageNumbers,
    };
  });
}

// État de la génération pour la règle de libération (décision du 2026-11-13) : l'unité n'est rendue
// que si aucun appel facturable n'a abouti, soit aucune génération envoyée (« not_sent »), soit une
// génération sans réponse reçue (« no_response » : réseau, 5xx, refus, plafond). « billed » : réponse
// reçue (même rejetée ensuite) ou délai dépassé après envoi : l'unité est consommée.
export type GenerationState = "not_sent" | "no_response" | "billed";

export function isReleasable(state: GenerationState): boolean {
  return state !== "billed";
}

// Questions de suivi (story 5.8, Q2 = A). Message de la Conversation relu avec le jeton (RLS).
export type HistoryRow = {
  role: "user" | "assistant";
  kind: string;
  content: string | null;
  client_request_id: string | null;
  created_at: string;
};

export function isHistoryRow(value: unknown): value is HistoryRow {
  const row = value as Record<string, unknown> | null;
  return (
    typeof row === "object" &&
    row !== null &&
    (row.role === "user" || row.role === "assistant") &&
    typeof row.kind === "string" &&
    (row.content === null || typeof row.content === "string") &&
    (row.client_request_id === null || typeof row.client_request_id === "string") &&
    typeof row.created_at === "string"
  );
}

// Renvois [S{n}] (5.4) et repères bruts [P…] des réponses d'avant la 5.4 (mêmes formes que
// CITATION_LIKE et RENVOI_LIKE de citations.ts), retirés avec les espaces qui les précèdent.
const HISTORY_MARK_CANDIDATE = /[^\S\n]*(\[[PS][^[\]\n]{0,40}\])/g;
const HISTORY_MARK = /^\[(?:P[\sP\d,;\-–]*|S[\sS\d,;\-–]*)\]$/;

export function cleanHistoryAnswer(content: string): string {
  const stripped = content.replace(HISTORY_MARK_CANDIDATE, (match, token: string) => (HISTORY_MARK.test(token) ? "" : match)).trim();
  return Array.from(stripped).slice(0, CHAT_HISTORY_ANSWER_MAX_LENGTH).join("");
}

export type RefusalTexts = { refusal_info_absente: string; refusal_hors_cadre: string };

// Les 3 derniers échanges réglés (réponse ou refus enregistré), dans l'ordre : question puis réponse
// nettoyée et tronquée, ou texte standard du refus ; échecs et questions sans issue exclus. Rattachement
// d'un message de l'Assistant à sa question : même client_request_id ; sinon (messages d'avant la 5.6)
// dernière question qui le précède (mêmes règles que le fil, src/lib/conversation-thread.ts). Une
// réponse ou un refus l'emporte sur un échec ; le plus récent l'emporte. rows : dans l'ordre de created_at.
export function buildHistory(rows: HistoryRow[], refusals: RefusalTexts): HistoryExchange[] {
  type Group = { question: string; settled: HistoryRow | null };
  const groups: Group[] = [];
  const byRequest = new Map<string, Group>();
  for (const row of rows) {
    if (row.role === "user") {
      const group: Group = { question: row.content ?? "", settled: null };
      groups.push(group);
      if (row.client_request_id) byRequest.set(row.client_request_id, group);
      continue;
    }
    const target = (row.client_request_id ? byRequest.get(row.client_request_id) : undefined) ?? groups.at(-1);
    if (!target || row.kind === "failure" || row.kind === "question") continue;
    target.settled = row;
  }
  const exchanges: HistoryExchange[] = [];
  for (const { question, settled } of groups) {
    if (!settled || question.trim() === "") continue;
    let answer: string;
    if (settled.kind === "refusal_info_absente") answer = refusals.refusal_info_absente;
    else if (settled.kind === "refusal_hors_cadre") answer = refusals.refusal_hors_cadre;
    else if (settled.kind === "answer") answer = cleanHistoryAnswer(settled.content ?? "");
    else continue;
    if (answer === "") continue;
    exchanges.push({ question, answer });
  }
  return exchanges.slice(-CHAT_HISTORY_EXCHANGES);
}
