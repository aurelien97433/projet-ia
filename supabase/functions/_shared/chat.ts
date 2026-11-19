// Fonction chat (story 5.2a-2) : validation de la demande, titre de la Conversation, Passages retenus
// et Sources à enregistrer. Fonctions pures, sans type Deno : importées par chat et testées par Vitest.
import { CHAT_MAX_PASSAGES, CHAT_MAX_QUESTION_LENGTH, CHAT_TITLE_MAX_LENGTH } from "./config.ts";
import type { CitedSource } from "./rag/citations.ts";
import type { ChatPassage } from "./rag/prompt.ts";
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
