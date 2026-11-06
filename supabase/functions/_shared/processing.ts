// Accès à la base pour le traitement, avec la clé service_role (AD-2), par fetch sans SDK comme
// _shared/ai.ts. Seule process-document utilise ce module.
import { readEnv } from "./config.ts";

// Durée de vie d'une tentative, identique à l'expiration de la vue documents_list (AD-6).
const ATTEMPT_LIFETIME_MS = 3 * 60 * 1000;
// Marge sous les 5 s accordées par Next.js pour répondre.
const DB_TIMEOUT_MS = 4_000;
// Écriture finale : tous les Passages et leurs vecteurs en une seule transaction.
const COMPLETE_TIMEOUT_MS = 30_000;

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

export type DocumentSource = { text: string; textVersion: number };

// Texte du Document, si cette tentative est encore la tentative courante ; sinon null.
export async function readDocumentText({ documentId, attemptId }: Attempt): Promise<DocumentSource | null> {
  const query = new URLSearchParams({
    id: `eq.${documentId}`,
    attempt_id: `eq.${attemptId}`,
    status: "eq.processing",
    select: "content_text,text_version",
  });
  const response = await restRequest(`documents?${query}`);
  if (!response.ok) throw new DbError("Lecture du texte", response.status);
  const rows = (await response.json()) as { content_text: string | null; text_version: number }[];
  return rows[0] ? { text: rows[0].content_text ?? "", textVersion: rows[0].text_version } : null;
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
