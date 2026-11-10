// Configuration de l'IA, définie une seule fois (AD-3, AD-4). Modules en TypeScript pur, sans type
// Deno : ils sont importés par les Edge Functions et testés par Vitest.

// Vectorisation (AD-4) : changer de modèle impose de re-vectoriser tous les Documents, et la
// version active ne change qu'une fois la re-vectorisation terminée.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSION = 1536;
export const EMBEDDING_VERSION = 1;
export const EMBEDDING_BATCH_SIZE = 96;

// Découpage en Passages (architecture §4), en unités de code JavaScript.
export const CHUNK_TARGET_LENGTH = 800;
export const CHUNK_MAX_LENGTH = 1200;

// Génération : remplaçable par le secret Supabase GENERATION_MODEL, sans changer le code.
export const DEFAULT_GENERATION_MODEL = "gpt-5.4-mini";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

// Nouvelles tentatives sur 429 (hors plafond) et 5xx, appels non diffusés uniquement (AD-16).
export const AI_MAX_RETRIES = 2;
export const AI_RETRY_BASE_DELAY_MS = 500;
// Délai par requête de vectorisation ; l'appelant peut le réduire (semantic-search : 10 s au total).
// Le temps restant de la Recherche est passé en timeoutMs à embed.
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

// Recherche sémantique (story 4.1a, FR-14) : 5 Documents au plus, 1 Passage chacun.
export const SEARCH_MAX_DOCUMENTS = 5;
export const SEARCH_PASSAGES_PER_DOCUMENT = 1;
// Requête de 1 à 500 caractères après suppression des espaces, revalidée par chaque étage.
export const SEARCH_QUERY_MAX_LENGTH = 500;
// Délai total de la Recherche : vectorisation de la Requête et requête en base (AD-16).
export const SEARCH_TIMEOUT_MS = 10_000;

// Seuil de pertinence commun à la Recherche et à l'Assistant (hypothèse, calibrée en 4.2),
// remplaçable par le secret Supabase RAG_MIN_SIMILARITY (valeur entre 0 et 1, sinon ce défaut).
export const RAG_MIN_SIMILARITY = 0.4;
// Seuil de la vectorisation simulée (décision Q1 du 2026-11-10) : les vecteurs lexicaux de la pile
// locale sont moins proches que de vrais vecteurs. Jamais appliqué ailleurs : voir ragMinSimilarity.
export const SIMULATED_MIN_SIMILARITY = 0.2;

// Seuil actif. simulated n'est vrai que si embeddingDeps a retenu la vectorisation simulée, donc
// sur la pile locale seulement (simulation activée et hôte kong, _shared/fake-embeddings.ts).
export function ragMinSimilarity(simulated: boolean): number {
  if (simulated) return SIMULATED_MIN_SIMILARITY;
  const raw = readEnv("RAG_MIN_SIMILARITY")?.trim();
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : RAG_MIN_SIMILARITY;
}
