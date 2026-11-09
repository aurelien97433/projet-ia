import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DocumentErrorKind, DocumentStatus } from "@/lib/documents";
import { logEvent } from "@/lib/errors";

export type DocumentStatusView = {
  effectiveStatus: DocumentStatus;
  effectiveErrorKind: DocumentErrorKind | null;
  effectiveErrorMessage: string | null;
  processingElapsedMs: number;
};

type Db = Pick<SupabaseClient, "from">;

// Durée du traitement selon la seule horloge de la base, valable après un rechargement et pour tous
// les Collaborateurs.
export function processingElapsedMs(serverNow: string, processingStartedAt: string): number {
  return Math.max(0, Date.parse(serverNow) - Date.parse(processingStartedAt));
}

// Statut effectif d'un Document (AD-6), lu avec le jeton du Collaborateur (RLS). Identifiant invalide
// ou Document absent : null. Lecture impossible : exception.
export async function getDocumentStatus(id: string, db: Db): Promise<DocumentStatusView | null> {
  if (!z.uuid().safeParse(id).success) return null;

  const { data, error } = await db
    .from("documents_list")
    .select("effective_status, effective_error_kind, effective_error_message, processing_started_at, server_now")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logEvent("get_document_status_failed", { document_id: id, code: error.code });
    throw new Error("Lecture du Statut impossible");
  }
  if (!data) return null;
  return {
    effectiveStatus: data.effective_status,
    effectiveErrorKind: data.effective_error_kind,
    effectiveErrorMessage: data.effective_error_message,
    processingElapsedMs: processingElapsedMs(data.server_now, data.processing_started_at),
  };
}
