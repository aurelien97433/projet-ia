import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DocumentCategory, DocumentErrorKind, DocumentStatus } from "@/lib/documents";
import { logEvent } from "@/lib/errors";
import { type StoredSummary, storedSummarySchema } from "@/lib/schemas/summary";
import { processingElapsedMs } from "./get-document-status";

export type DocumentView = {
  id: string;
  title: string;
  category: DocumentCategory;
  authorId: string;
  authorName: string;
  createdAt: string;
  effectiveStatus: DocumentStatus;
  effectiveErrorKind: DocumentErrorKind | null;
  effectiveErrorMessage: string | null;
  processingElapsedMs: number;
  // Version du texte (story 5.7), lue dans la même ligne que le texte : le panneau Source n'applique les
  // positions d'une Source que si elle correspond à la version enregistrée avec elle (Q2 = A).
  textVersion: number;
  content: string;
  // Story 6.1 (AD-18) : Résumé à jour (summary_text_version = text_version), sinon null. Un Résumé
  // obsolète n'est jamais affiché (P1).
  summary: StoredSummary | null;
};

// Résumé stocké, relu strictement : à jour et bien formé, sinon null.
export function currentSummary(row: {
  text_version: number;
  summary_points?: unknown;
  summary_text_version?: unknown;
  summary_generated_at?: unknown;
}): StoredSummary | null {
  if (row.summary_text_version !== row.text_version || typeof row.summary_generated_at !== "string") return null;
  const generatedAt = new Date(row.summary_generated_at);
  if (Number.isNaN(generatedAt.getTime())) return null;
  const parsed = storedSummarySchema.safeParse({
    points: row.summary_points,
    generatedAt: generatedAt.toISOString(),
    textVersion: row.text_version,
  });
  return parsed.success ? parsed.data : null;
}

type Db = Pick<SupabaseClient, "from">;

// Document pour la page E7, lu avec le jeton du Collaborateur (RLS). Identifiant invalide ou
// Document absent : null, et la page affiche E9. Statut effectif (expiration à 3 min) par la vue.
export async function getDocument(id: string, db: Db): Promise<DocumentView | null> {
  if (!z.uuid().safeParse(id).success) return null;

  const [meta, body] = await Promise.all([
    db
      .from("documents_list")
      .select(
        "id, title, category, author_id, author_name, created_at, effective_status, effective_error_kind, effective_error_message, processing_started_at, server_now",
      )
      .eq("id", id)
      .maybeSingle(),
    db
      .from("documents")
      .select("content_text, text_version, summary_points, summary_text_version, summary_generated_at")
      .eq("id", id)
      .maybeSingle(),
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
    effectiveErrorMessage: meta.data.effective_error_message,
    processingElapsedMs: processingElapsedMs(meta.data.server_now, meta.data.processing_started_at),
    textVersion: body.data.text_version,
    content: body.data.content_text ?? "",
    summary: currentSummary(body.data),
  };
}
