import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildThread, type MessageKind, type StoredMessage, type ThreadExchange } from "@/lib/conversation-thread";
import { logEvent } from "@/lib/errors";

export type ConversationView = { id: string; title: string; exchanges: ThreadExchange[] };

type Db = Pick<SupabaseClient, "from">;

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  kind: MessageKind;
  content: string | null;
  error_code: string | null;
  created_at: string;
  client_request_id: string | null;
};

type SourceRow = {
  message_id: string;
  ordinal: number;
  document_id: string | null;
  document_title: string;
  passages: unknown;
};

// Conversation pour la page /assistant/[id] (story 5.6), lue avec le jeton du Collaborateur (RLS),
// jamais avec service_role. Identifiant invalide, Conversation absente ou d'un autre Compte : null, et
// la page affiche E9 sans distinction (FR-22, exigence S4). Messages triés par created_at, Sources par
// ordinal ; règles d'affichage de chaque échange appliquées à l'heure nowMs. Lecture impossible :
// exception journalisée (sans texte de message).
export async function getConversation(id: string, db: Db, nowMs: number = Date.now()): Promise<ConversationView | null> {
  if (!z.uuid().safeParse(id).success) return null;

  const [conversation, messages] = await Promise.all([
    db.from("conversations").select("id, title").eq("id", id).maybeSingle(),
    db
      .from("messages")
      .select("id, role, kind, content, error_code, created_at, client_request_id")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  if (conversation.error || messages.error) {
    logEvent("get_conversation_failed", { code: conversation.error?.code ?? messages.error?.code });
    throw new Error("Lecture de la Conversation impossible");
  }
  if (!conversation.data) return null;

  const rows = (messages.data ?? []) as MessageRow[];
  const answerIds = rows.filter((row) => row.kind === "answer").map((row) => row.id);
  const sourcesByMessage = new Map<string, SourceRow[]>();
  if (answerIds.length > 0) {
    const sources = await db
      .from("message_sources")
      .select("message_id, ordinal, document_id, document_title, passages")
      .in("message_id", answerIds)
      .order("ordinal", { ascending: true });
    if (sources.error) {
      logEvent("get_conversation_failed", { code: sources.error.code, stage: "sources" });
      throw new Error("Lecture des Sources impossible");
    }
    for (const source of (sources.data ?? []) as SourceRow[]) {
      const list = sourcesByMessage.get(source.message_id) ?? [];
      list.push(source);
      sourcesByMessage.set(source.message_id, list);
    }
  }

  const stored: StoredMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role,
    kind: row.kind,
    content: row.content,
    errorCode: row.error_code,
    createdAt: row.created_at,
    clientRequestId: row.client_request_id,
    sources: (sourcesByMessage.get(row.id) ?? []).map((source) => ({
      documentId: source.document_id,
      title: source.document_title,
      passageCount: Array.isArray(source.passages) ? source.passages.length : 1,
    })),
  }));

  return { id: conversation.data.id, title: conversation.data.title, exchanges: buildThread(stored, nowMs) };
}
