import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DocumentCategory, DocumentErrorKind, DocumentStatus } from "@/lib/documents";
import { logEvent } from "@/lib/errors";

export type DocumentView = {
  id: string;
  title: string;
  category: DocumentCategory;
  authorId: string;
  authorName: string;
  createdAt: string;
  effectiveStatus: DocumentStatus;
  effectiveErrorKind: DocumentErrorKind | null;
  content: string;
};

type Db = Pick<SupabaseClient, "from">;

// Document pour la page E7, lu avec le jeton du Collaborateur (RLS). Identifiant invalide ou
// Document absent : null, et la page affiche E9. Statut effectif (expiration à 3 min) par la vue.
export async function getDocument(id: string, db: Db): Promise<DocumentView | null> {
  if (!z.uuid().safeParse(id).success) return null;

  const [meta, body] = await Promise.all([
    db
      .from("documents_list")
      .select("id, title, category, author_id, author_name, created_at, effective_status, effective_error_kind")
      .eq("id", id)
      .maybeSingle(),
    db.from("documents").select("content_text").eq("id", id).maybeSingle(),
  ]);
  if (meta.error || body.error) {
    logEvent("get_document_failed", { document_id: id, code: meta.error?.code ?? body.error?.code });
    throw new Error("Lecture du Document impossible");
  }
  if (!meta.data || !body.data) return null;

  return {
    id: meta.data.id,
    title: meta.data.title,
    category: meta.data.category,
    authorId: meta.data.author_id,
    authorName: meta.data.author_name ?? "",
    createdAt: meta.data.created_at,
    effectiveStatus: meta.data.effective_status,
    effectiveErrorKind: meta.data.effective_error_kind,
    content: body.data.content_text ?? "",
  };
}
