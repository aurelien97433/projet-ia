import { z } from "zod";
import { DOCUMENT_CATEGORIES, MAX_TITLE_LENGTH } from "@/lib/documents";
import { fileExtension, MAX_FILE_BYTES, UPLOAD_ID_PATTERN } from "@/lib/files";
import { texts } from "@/lib/texts";

const errors = texts.addDocument.errors;

// Demande d'URL de dépôt (POST /api/uploads) : nom (pour l'extension) et taille annoncée. Le bucket
// refuse de toute façon un objet de plus de 100 000 octets.
export const uploadRequestSchema = z.object({
  fileName: z
    .string({ error: errors.fileFormat })
    .min(1, { error: errors.fileFormat })
    .max(1_000, { error: errors.fileFormat })
    .refine((name) => fileExtension(name) !== null, { error: errors.fileFormat }),
  size: z
    .number({ error: errors.fileTooLarge })
    .int({ error: errors.fileTooLarge })
    .min(0, { error: errors.fileTooLarge })
    .max(MAX_FILE_BYTES, { error: errors.fileTooLarge }),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

// Import d'un fichier déposé (« Importer ») : mêmes règles de titre et de Catégorie qu'une Note.
export const importFileSchema = z.object({
  title: z
    .string({ error: errors.titleMissing })
    .trim()
    .min(1, { error: errors.titleMissing })
    .max(MAX_TITLE_LENGTH, { error: errors.titleTooLong }),
  category: z.enum(DOCUMENT_CATEGORIES, { error: errors.categoryMissing }),
  uploadId: z.string({ error: errors.fileMissing }).regex(UPLOAD_ID_PATTERN, { error: errors.fileMissing }),
  clientRequestId: z.uuid(),
});

export type ImportFileInput = z.infer<typeof importFileSchema>;
