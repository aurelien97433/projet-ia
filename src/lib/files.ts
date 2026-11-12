import { MAX_TEXT_BYTES, MAX_TITLE_LENGTH } from "@/lib/documents";

// Fichiers importables (story 2.6a, AD-7) : .txt et .md, 1 000 000 octets au plus, même valeur que
// le bucket, la route de dépôt et la fonction SQL d'import.
export const FILE_EXTENSIONS = ["txt", "md"] as const;
export type FileExtension = (typeof FILE_EXTENSIONS)[number];
export const MAX_FILE_BYTES = MAX_TEXT_BYTES;
export const STORAGE_BUCKET = "documents";
// Attribut accept du sélecteur : simple confort, le contrôle réel est checkFile.
export const FILE_ACCEPT = ".txt,.md";

// Extension finale, en minuscules, parmi celles acceptées ; null sinon (aucune, ou autre).
export function fileExtension(name: string): FileExtension | null {
  const match = /\.([^./\\]+)$/.exec(name);
  const extension = match?.[1].toLowerCase() ?? "";
  return (FILE_EXTENSIONS as readonly string[]).includes(extension) ? (extension as FileExtension) : null;
}

export type FileRejection = "format" | "size";

// Contrôle avant tout envoi (FR-7) : format d'abord, puis taille en octets.
export function checkFile(file: { name: string; size: number }): FileRejection | null {
  if (!fileExtension(file.name)) return "format";
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) return "size";
  return null;
}

// Titre prérempli : nom du fichier sans sa dernière extension, espaces retirés, 200 unités au plus
// (mesure du schéma), sans couper un caractère en deux.
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/^.*[/\\]/, "")
    .replace(/\.[^.]*$/, "")
    .trim();
  let title = "";
  for (const character of base) {
    if (title.length + character.length > MAX_TITLE_LENGTH) break;
    title += character;
  }
  return title.trim();
}

// upload_id = {uuid}.{txt|md} : l'extension validée à la demande de dépôt fait partie du nom de l'objet.
// Motif ancré, minuscules : ni « .. », ni barre oblique, ni autre caractère (même règle qu'en SQL).
export const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(txt|md)$/;

export const isUploadId = (value: unknown): value is string => typeof value === "string" && UPLOAD_ID_PATTERN.test(value);

export const newUploadId = (extension: FileExtension) => `${crypto.randomUUID().toLowerCase()}.${extension}`;

// Chemin de l'objet dans le bucket : {author_id}/uploads/{upload_id}.
export const uploadPath = (authorId: string, uploadId: string) => `${authorId}/uploads/${uploadId}`;

// Type MIME déduit de l'extension (jamais celui déclaré par le navigateur), comme la fonction SQL.
export const mimeForExtension = (extension: FileExtension) => (extension === "md" ? "text/markdown" : "text/plain");
