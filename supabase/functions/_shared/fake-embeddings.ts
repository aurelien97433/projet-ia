// Vectorisation simulée de la pile locale : aucun appel à OpenAI dans les tests automatiques. Elle
// passe par embed (_shared/ai.ts), dont les contrôles restent appliqués, avec un fetch simulé.
// Rejetée hors de la pile locale : la vectorisation réelle s'applique alors, et l'écart est journalisé.
import type { AiDeps } from "./ai.ts";
import { EMBEDDING_DIMENSION, readEnv } from "./config.ts";
import { logEvent, logInfo } from "./errors.ts";

// Hôte interne de l'API Supabase vu par les Edge Functions de la pile locale.
const LOCAL_SUPABASE_HOST = "kong";
const POSITIONS_PER_WORD = 4;

function hash(text: string, seed: number): number {
  let value = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return value;
}

// Vecteur déterministe de norme 1. Chaque mot pèse sur quelques positions fixes : deux textes qui
// partagent des mots restent proches, ce qui rend les futurs tests de recherche reproductibles.
export function fakeVector(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [text];
  for (const word of words) {
    for (let seed = 0; seed < POSITIONS_PER_WORD; seed += 1) {
      const value = hash(word, seed);
      vector[value % EMBEDDING_DIMENSION] += value & 0x80000000 ? -1 : 1;
    }
  }

  const norm = Math.sqrt(vector.reduce((sum, component) => sum + component * component, 0));
  if (norm === 0) {
    vector[hash(text, 0) % EMBEDDING_DIMENSION] = 1;
    return vector;
  }
  return vector.map((component) => component / norm);
}

const fakeFetch: typeof fetch = (_input, init) => {
  const { input } = JSON.parse(String(init?.body)) as { input: string[] };
  const data = input.map((text, index) => ({ index, embedding: fakeVector(text) }));
  return Promise.resolve(Response.json({ data }));
};

function isLocalStack(): boolean {
  try {
    return new URL(readEnv("SUPABASE_URL") ?? "").hostname === LOCAL_SUPABASE_HOST;
  } catch {
    return false;
  }
}

// Dépendances de embed : simulées seulement si EMBEDDINGS_FAKE=1 sur la pile locale.
export function embeddingDeps(documentId: string): Partial<AiDeps> | undefined {
  if (readEnv("EMBEDDINGS_FAKE") !== "1") return undefined;
  if (!isLocalStack()) {
    logEvent("embeddings_fake_rejected", { document_id: documentId, reason: "not_local_stack" });
    return undefined;
  }
  logInfo("embeddings_fake_active", { document_id: documentId, host: LOCAL_SUPABASE_HOST });
  return { fetch: fakeFetch, apiKey: "simulation" };
}
