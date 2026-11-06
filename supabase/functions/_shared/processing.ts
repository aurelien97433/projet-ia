// Accès à la base pour le traitement, avec la clé service_role (AD-2), par fetch sans SDK comme
// _shared/ai.ts. Seule process-document utilise ce module.
import { readEnv } from "./config.ts";

// Durée de vie d'une tentative, identique à l'expiration de la vue documents_list (AD-6).
const ATTEMPT_LIFETIME_MS = 3 * 60 * 1000;
// Marge sous les 5 s accordées par Next.js pour répondre.
const DB_TIMEOUT_MS = 4_000;

export type Attempt = { documentId: string; attemptId: string };

function restRequest(path: string, init?: RequestInit): Promise<Response> {
  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Configuration Supabase absente");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(DB_TIMEOUT_MS),
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
  if (!response.ok) throw new Error(`Lecture de la tentative impossible (${response.status})`);
  const rows = (await response.json()) as { processing_started_at: string }[];
  if (rows.length === 0) return false;
  return Date.now() - new Date(rows[0].processing_started_at).getTime() < ATTEMPT_LIFETIME_MS;
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
  if (!response.ok) throw new Error(`fail_processing impossible (${response.status})`);
  return (await response.json()) === true;
}
