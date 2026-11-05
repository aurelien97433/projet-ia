// Configuration de l'IA, définie une seule fois (AD-3, AD-4). Modules en TypeScript pur, sans type
// Deno : ils sont importés par les Edge Functions et testés par Vitest.

// Vectorisation (AD-4) : changer de modèle impose de re-vectoriser tous les Documents, et la
// version active ne change qu'une fois la re-vectorisation terminée.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSION = 1536;
export const EMBEDDING_VERSION = 1;
export const EMBEDDING_BATCH_SIZE = 96;

// Génération : remplaçable par le secret Supabase GENERATION_MODEL, sans changer le code.
export const DEFAULT_GENERATION_MODEL = "gpt-5.4-mini";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

// Nouvelles tentatives sur 429 (hors plafond) et 5xx, appels non diffusés uniquement (AD-16).
export const AI_MAX_RETRIES = 2;
export const AI_RETRY_BASE_DELAY_MS = 500;
// Délai par requête de vectorisation ; l'appelant peut le réduire (semantic-search : 10 s au total).
export const EMBEDDING_TIMEOUT_MS = 15_000;
export const MODEL_CHECK_TIMEOUT_MS = 10_000;

// Variable d'environnement de l'Edge Function, ou undefined (hors Deno, par exemple sous Vitest).
export function readEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno;
  const value = deno?.env.get(name);
  return value ? value : undefined;
}

export function generationModel(): string {
  return readEnv("GENERATION_MODEL") ?? DEFAULT_GENERATION_MODEL;
}
