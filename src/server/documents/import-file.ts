import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appError, logEvent, logInfo, type AppError } from "@/lib/errors";
import { importFileSchema } from "@/lib/schemas/uploads";
import { texts } from "@/lib/texts";

const errors = texts.addDocument.errors;

export type FileFieldErrors = { title?: string; category?: string; file?: string };

// attemptToStart : tentative à déclencher ; null pour un rejeu, déjà déclenché par le premier envoi.
export type ImportFileResult =
  | { status: "created"; id: string; attemptToStart: string | null }
  | { status: "invalid"; fieldErrors: FileFieldErrors }
  | ({ status: "error" } & AppError);

type Db = Pick<SupabaseClient, "rpc">;

// Refus de import_file_document qui portent sur le fichier déposé : le dépôt est à refaire.
const FILE_REFUSALS = new Set(["invalid_upload_id", "upload_not_found", "file_too_large"]);

function unexpected(): ImportFileResult {
  return { status: "error", ...appError("INTERNAL", errors.saveFailed, true) };
}

// Import d'un fichier déposé (« Importer », AD-7 étapes 3 et 4) : la fonction SQL, appelée avec le
// jeton du Collaborateur, vérifie l'objet (chemin exact, propriétaire, taille), déduit le MIME de
// l'extension et crée le Document dans la même transaction. Idempotente (AD-16).
// Journaux : codes et identifiants seulement, jamais le titre ni le nom du fichier.
export async function importFile(
  input: { title: unknown; category: unknown; uploadId: unknown; clientRequestId: unknown },
  userId: string,
  db: Db,
): Promise<ImportFileResult> {
  const parsed = importFileSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: FileFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === "uploadId" ? "file" : issue.path[0];
      if ((field === "title" || field === "category" || field === "file") && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    if (Object.keys(fieldErrors).length === 0) {
      logEvent("import_file_invalid_request", { user_id: userId });
      return unexpected();
    }
    return { status: "invalid", fieldErrors };
  }

  const { title, category, uploadId, clientRequestId } = parsed.data;
  try {
    const { data, error } = await db.rpc("import_file_document", {
      p_title: title,
      p_category: category,
      p_upload_id: uploadId,
      p_client_request_id: clientRequestId,
    });
    const row = (data as { document_id: string | null; attempt_to_start: string | null }[] | null)?.[0];
    if (!error && row?.document_id) {
      if (!row.attempt_to_start) logInfo("import_file_replayed", { user_id: userId, document_id: row.document_id });
      return { status: "created", id: row.document_id, attemptToStart: row.attempt_to_start };
    }
    // Session expirée entre la vérification et l'appel : même réponse qu'une action sans session.
    if (error?.message === "unauthenticated") {
      return { status: "error", ...appError("UNAUTHENTICATED", texts.session.expired, false) };
    }
    if (error && FILE_REFUSALS.has(error.message)) {
      logInfo("import_file_refused", { user_id: userId, code: error.message });
      return { status: "invalid", fieldErrors: { file: errors.uploadFailed } };
    }
    logEvent("import_file_failed", { user_id: userId, code: error?.code ?? "no_data" });
    return unexpected();
  } catch {
    logEvent("import_file_failed", { user_id: userId, code: "exception" });
    return unexpected();
  }
}
