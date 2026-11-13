import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { appError, logEvent, logInfo, type AppError } from "@/lib/errors";
import { texts } from "@/lib/texts";

export type DeleteDocumentResult = { status: "ok" } | ({ status: "error" } & AppError);

type Db = Pick<SupabaseClient, "from" | "storage">;

const BUCKET = "documents";

const t = texts.deleteDocument;

const inputSchema = z.object({ documentId: z.uuid() });

const failure = (code: AppError["error"]["code"], message: string, retryable: boolean): DeleteDocumentResult => ({
  status: "error",
  ...appError(code, message, retryable),
});

// Supprime un Document avec le client du Collaborateur (FR-12, FR-13, AD-2, AD-7) : la RLS réserve la
// suppression à l'Auteur, les Passages suivent en cascade. L'objet Storage d'un fichier importé est
// retiré ensuite : la politique Storage ne l'autorise qu'une fois plus aucun Document ne le référence.
// Un objet resté en place n'annule rien : le Document est déjà supprimé (orphelin, nettoyage différé).
// Journaux : codes et identifiants seulement.
export async function deleteDocument(input: { documentId: unknown }, userId: string, db: Db): Promise<DeleteDocumentResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    logEvent("delete_document_invalid_request", { user_id: userId });
    return failure("VALIDATION_FAILED", t.failed, false);
  }
  const { documentId } = parsed.data;

  let storagePath: string | null;
  try {
    const { data, error } = await db.from("documents").delete().eq("id", documentId).select("storage_path");
    if (error) {
      logEvent("delete_document_failed", { document_id: documentId, user_id: userId, code: error.code });
      return failure("INTERNAL", t.failed, true);
    }
    const rows = (data ?? []) as { storage_path: string | null }[];
    if (rows.length === 0) return await refusal(documentId, userId, db);
    storagePath = rows[0].storage_path;
  } catch {
    logEvent("delete_document_failed", { document_id: documentId, user_id: userId, code: "exception" });
    return failure("INTERNAL", t.failed, true);
  }

  if (storagePath) await removeFile(documentId, userId, storagePath, db);
  logInfo("document_deleted", { document_id: documentId, user_id: userId, file: storagePath !== null });
  return { status: "ok" };
}

// Aucune ligne supprimée : le Document existe encore (il appartient à un autre Auteur) ou n'existe plus.
async function refusal(documentId: string, userId: string, db: Db): Promise<DeleteDocumentResult> {
  const { data, error } = await db.from("documents").select("id").eq("id", documentId).maybeSingle();
  if (error) {
    logEvent("delete_document_failed", { document_id: documentId, user_id: userId, code: error.code });
    return failure("INTERNAL", t.failed, true);
  }
  if (data) {
    logEvent("delete_document_refused", { document_id: documentId, user_id: userId });
    return failure("FORBIDDEN", t.forbidden, false);
  }
  logInfo("delete_document_not_found", { document_id: documentId, user_id: userId });
  return failure("NOT_FOUND", texts.documentStatus.deleted, false);
}

// L'API Storage ne signale pas d'erreur quand la politique écarte l'objet : elle renvoie une liste vide.
async function removeFile(documentId: string, userId: string, path: string, db: Db): Promise<void> {
  try {
    const { data, error } = await db.storage.from(BUCKET).remove([path]);
    if (error) {
      logEvent("delete_document_file_failed", { document_id: documentId, user_id: userId, code: error.name });
    } else if (!data || data.length === 0) {
      logEvent("delete_document_file_failed", { document_id: documentId, user_id: userId, code: "not_removed" });
    }
  } catch {
    logEvent("delete_document_file_failed", { document_id: documentId, user_id: userId, code: "exception" });
  }
}
