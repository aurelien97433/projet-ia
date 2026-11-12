// Accès à la base pour le traitement, avec la clé service_role (AD-2), par fetch sans SDK comme
// _shared/ai.ts. Seule process-document utilise ce module.
import { readEnv } from "./config.ts";
import { decodeFileText } from "./rag/extract.ts";

// Durée de vie d'une tentative, identique à l'expiration de la vue documents_list (AD-6).
const ATTEMPT_LIFETIME_MS = 3 * 60 * 1000;
// Marge sous les 5 s accordées par Next.js pour répondre.
const DB_TIMEOUT_MS = 4_000;
// Écriture finale : tous les Passages et leurs vecteurs en une seule transaction.
const COMPLETE_TIMEOUT_MS = 30_000;
// Téléchargement d'un fichier importé (1 Mo au plus).
const DOWNLOAD_TIMEOUT_MS = 15_000;
const STORAGE_BUCKET = "documents";

export type Attempt = { documentId: string; attemptId: string };

// Échec d'un appel à la base. Le code (http_413…) va aux journaux : il ne contient aucune donnée.
export class DbError extends Error {
  readonly code: string;

  constructor(operation: string, status: number) {
    super(`${operation} impossible (${status})`);
    this.name = "DbError";
    this.code = `http_${status}`;
  }
}

function restRequest(path: string, init?: RequestInit, timeoutMs = DB_TIMEOUT_MS): Promise<Response> {
  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Configuration Supabase absente");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// Vrai si cette tentative est la tentative courante d'un Document en cours et non expiré.
export async function isCurrentAttempt({ documentId, attemptId }: Attempt): Promise<boolean> {
  const query = new URLSearchParams({
    id: `eq.${documentId}`,
    attempt_id: `eq.${attemptId}`,
    status: "eq.processing",
    select: "processing_started_at",
  });
  const response = await restRequest(`documents?${query}`);
  if (!response.ok) throw new DbError("Lecture de la tentative", response.status);
  const rows = (await response.json()) as { processing_started_at: string }[];
  if (rows.length === 0) return false;
  return Date.now() - new Date(rows[0].processing_started_at).getTime() < ATTEMPT_LIFETIME_MS;
}

// unreadable : fichier importé dont le texte n'a pas pu être lu (encodage, story 2.6b) ; erreur no_text.
export type DocumentSource = { text: string; textVersion: number; unreadable?: "encoding" };

type SourceRow = { content_text: string | null; text_version: number; kind: "note" | "file"; storage_path: string | null };

// Contenu d'un objet du bucket privé, lu avec service_role (AD-2). Chaque segment du chemin est encodé.
export async function downloadFile(path: string): Promise<Uint8Array> {
  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Configuration Supabase absente");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${url}/storage/v1/object/${STORAGE_BUCKET}/${encoded}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new DbError("Lecture du fichier", response.status);
  return new Uint8Array(await response.arrayBuffer());
}

// Texte du Document, si cette tentative est encore la tentative courante ; sinon null. Fichier
// importé dont le texte n'est pas encore extrait : téléchargé puis décodé (UTF-8 strict, repli
// Windows-1252, contrôle des caractères ; story 2.6b).
export async function readDocumentText(
  { documentId, attemptId }: Attempt,
  download: (path: string) => Promise<Uint8Array> = downloadFile,
): Promise<DocumentSource | null> {
  const query = new URLSearchParams({
    id: `eq.${documentId}`,
    attempt_id: `eq.${attemptId}`,
    status: "eq.processing",
    select: "content_text,text_version,kind,storage_path",
  });
  const response = await restRequest(`documents?${query}`);
  if (!response.ok) throw new DbError("Lecture du texte", response.status);
  const rows = (await response.json()) as SourceRow[];
  const row = rows[0];
  if (!row) return null;
  if (row.kind === "file" && row.content_text === null) {
    if (!row.storage_path) throw new Error("Fichier sans chemin");
    const decoded = decodeFileText(await download(row.storage_path));
    return decoded.ok
      ? { text: decoded.text, textVersion: row.text_version }
      : { text: "", textVersion: row.text_version, unreadable: decoded.reason };
  }
  return { text: row.content_text ?? "", textVersion: row.text_version };
}

export type PassageRow = { ordinal: number; start: number; end: number; content: string; embedding: number[] };

export type Completion = {
  text: string;
  textVersion: number;
  embeddingModel: string;
  embeddingVersion: number;
  passages: PassageRow[];
};

// Remplace les Passages et passe le Document à ready, en une seule opération (AD-5) ; false si la
// tentative n'est plus courante (rien n'est écrit).
export async function completeProcessing({ documentId, attemptId }: Attempt, completion: Completion): Promise<boolean> {
  const response = await restRequest(
    "rpc/complete_processing",
    {
      method: "POST",
      body: JSON.stringify({
        p_document_id: documentId,
        p_attempt_id: attemptId,
        p_content_text: completion.text,
        p_text_version: completion.textVersion,
        p_embedding_model: completion.embeddingModel,
        p_embedding_version: completion.embeddingVersion,
        p_passages: completion.passages,
      }),
    },
    COMPLETE_TIMEOUT_MS,
  );
  if (!response.ok) throw new DbError("complete_processing", response.status);
  return (await response.json()) === true;
}

// Enregistre l'échec de la tentative ; false si elle n'est plus courante (rien n'est écrit).
export async function failProcessing(
  { documentId, attemptId }: Attempt,
  kind: "temporary" | "no_text",
  message: string,
): Promise<boolean> {
  const response = await restRequest("rpc/fail_processing", {
    method: "POST",
    body: JSON.stringify({ p_document_id: documentId, p_attempt_id: attemptId, p_kind: kind, p_message: message }),
  });
  if (!response.ok) throw new DbError("fail_processing", response.status);
  return (await response.json()) === true;
}
