import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appError, logEvent, type AppError } from "@/lib/errors";
import { fileExtension, newUploadId, STORAGE_BUCKET, uploadPath } from "@/lib/files";
import { uploadRequestSchema } from "@/lib/schemas/uploads";
import { texts } from "@/lib/texts";

const errors = texts.addDocument.errors;

export type CreateUploadResult =
  | { status: "created"; uploadId: string; signedUrl: string }
  | ({ status: "invalid" } & AppError)
  | ({ status: "error" } & AppError);

type Storage = Pick<SupabaseClient, "storage">;

// URL de dépôt signée (AD-7, étape 2) pour {author_id}/uploads/{upload_id}, créée avec le client du
// Collaborateur : les politiques Storage (son dossier seulement) s'appliquent dès la signature.
// L'upload_id est choisi ici ; le navigateur ne fournit que le nom (pour l'extension) et la taille.
// Journaux : codes et identifiants seulement, jamais le nom du fichier.
export async function createUpload(body: unknown, userId: string, db: Storage): Promise<CreateUploadResult> {
  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    const sizeIssue = parsed.error.issues.find((issue) => issue.path[0] === "size");
    const formatIssue = parsed.error.issues.find((issue) => issue.path[0] === "fileName");
    return formatIssue || !sizeIssue
      ? { status: "invalid", ...appError("FILE_TYPE_UNSUPPORTED", errors.fileFormat, false) }
      : { status: "invalid", ...appError("FILE_TOO_LARGE", errors.fileTooLarge, false) };
  }

  const uploadId = newUploadId(fileExtension(parsed.data.fileName)!);
  try {
    const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUploadUrl(uploadPath(userId, uploadId));
    if (error || !data) {
      logEvent("create_upload_failed", { user_id: userId, code: error?.name ?? "no_data" });
      return { status: "error", ...appError("INTERNAL", errors.uploadFailed, true) };
    }
    return { status: "created", uploadId, signedUrl: data.signedUrl };
  } catch {
    logEvent("create_upload_failed", { user_id: userId, code: "exception" });
    return { status: "error", ...appError("INTERNAL", errors.uploadFailed, true) };
  }
}
