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

// Génération de la réponse (story 5.2a-1, non diffusée ; la diffusion arrive en 5.5). Délai par
// tentative ; sortie bornée (une réponse est limitée à 20 000 caractères en base, story 5.1).
export const GENERATION_TIMEOUT_MS = 45_000;
export const GENERATION_MAX_COMPLETION_TOKENS = 1_500;
// Échantillonnage, pour limiter le non-déterminisme (critère 3 sur 3 de la 5.2a-2). La documentation
// d'OpenAI ne confirme pas que gpt-5.4-mini accepte temperature et seed (lue le 2026-11-13) : la
// génération d'essai de `npm run test:ai` le vérifie ; un paramètre refusé est retiré d'ici.
export const GENERATION_SAMPLING: Readonly<{ temperature?: number; seed?: number }> = { temperature: 0, seed: 20261113 };
// Raisonnement désactivé : valeur par défaut de gpt-5.4-mini, envoyée explicitement.
export const GENERATION_REASONING_EFFORT = "none";

// Consignes de l'Assistant (AD-9, AD-13) : 8 Passages au plus ; titre neutralisé, 200 caractères au plus.
export const CHAT_MAX_PASSAGES = 8;
// Question de 2 000 caractères au plus (NFR-8, même limite que messages en base, story 5.1).
export const CHAT_MAX_QUESTION_LENGTH = 2_000;
export const PASSAGE_TITLE_MAX_LENGTH = 200;

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
