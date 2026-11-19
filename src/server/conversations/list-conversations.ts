import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/errors";
import { CONVERSATIONS_MAX_LIMIT, type ConversationListItem } from "@/lib/schemas/chat";

type Db = Pick<SupabaseClient, "from">;

type ConversationRow = { id: string; title: string; last_message_at: string; unanswered: boolean };

// Conversations du Collaborateur connecté (story 5.6), de la plus récente à la plus ancienne (date du
// dernier échange, départagée par l'identifiant), lues dans la vue conversation_list avec son jeton
// (security_invoker = true : RLS des tables). limit ramenée dans [1, 100]. Lecture impossible :
// exception journalisée.
export async function listConversations(db: Db, limit: number = CONVERSATIONS_MAX_LIMIT): Promise<ConversationListItem[]> {
  const rowLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), CONVERSATIONS_MAX_LIMIT) : CONVERSATIONS_MAX_LIMIT;
  const { data, error } = await db
    .from("conversation_list")
    .select("id, title, last_message_at, unanswered")
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(rowLimit);
  if (error) {
    logEvent("list_conversations_failed", { code: error.code });
    throw new Error("Lecture des Conversations impossible");
  }
  return ((data ?? []) as ConversationRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    lastMessageAt: new Date(row.last_message_at).toISOString(),
    unanswered: row.unanswered === true,
  }));
}
