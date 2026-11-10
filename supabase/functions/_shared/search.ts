// Recherche sémantique (story 4.1a) : validation de la Requête et mise en forme des résultats.
// Fonctions pures, sans type Deno : importées par semantic-search et testées par Vitest.
import type { AiDeps } from "./ai.ts";
import { ragMinSimilarity, SEARCH_MAX_DOCUMENTS, SEARCH_QUERY_MAX_LENGTH } from "./config.ts";
import { embeddingDeps } from "./fake-embeddings.ts";

// Vectorisation de la Requête et seuil actif, choisis ensemble (décision Q1 du 2026-11-10) : le
// seuil simulé de 0,20 n'est retenu que si embeddingDeps a retenu la vectorisation simulée, donc
// seulement sur la pile locale avec la simulation activée (hôte kong, fake-embeddings.ts). Partout
// ailleurs : vectorisation
// réelle et RAG_MIN_SIMILARITY (0,40 par défaut, ou le secret Supabase).
export type SearchVectorization = { deps: Partial<AiDeps> | undefined; simulated: boolean; minSimilarity: number };

export function searchVectorization(): SearchVectorization {
  const deps = embeddingDeps("semantic-search");
  const simulated = deps !== undefined;
  return { deps, simulated, minSimilarity: ragMinSimilarity(simulated) };
}

// Requête reçue dans { query } : chaîne de 1 à 500 caractères après suppression des espaces.
// Renvoie la Requête sans ses espaces de début et de fin, ou null si elle est invalide.
export function parseSearchQuery(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const query = (body as { query?: unknown }).query;
  if (typeof query !== "string") return null;
  const trimmed = query.trim();
  return trimmed.length >= 1 && trimmed.length <= SEARCH_QUERY_MAX_LENGTH ? trimmed : null;
}

// Ligne renvoyée par la fonction SQL match_passages.
export type MatchRow = {
  document_id: string;
  title: string;
  category: string;
  passage_id: string;
  start_offset: number;
  end_offset: number;
  content: string;
  similarity: number;
};

export type SearchResult = {
  documentId: string;
  title: string;
  category: string;
  passage: { id: string; start: number; end: number; content: string };
};

export type SearchResponse = { results: SearchResult[] };

function isMatchRow(value: unknown): value is MatchRow {
  const row = value as Record<string, unknown> | null;
  return (
    typeof row === "object" &&
    row !== null &&
    typeof row.document_id === "string" &&
    typeof row.title === "string" &&
    typeof row.category === "string" &&
    typeof row.passage_id === "string" &&
    Number.isInteger(row.start_offset) &&
    Number.isInteger(row.end_offset) &&
    typeof row.content === "string"
  );
}

// Résultats de la Recherche, dans l'ordre de match_passages (pertinence décroissante) : un Document
// une seule fois, avec son meilleur Passage, 5 au plus. Champs choisis un à un : jamais la
// similarité ni le texte complet du Document. Null si la réponse de la base est illisible.
export function toSearchResponse(rows: unknown): SearchResponse | null {
  if (!Array.isArray(rows) || !rows.every(isMatchRow)) return null;
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const row of rows) {
    if (seen.has(row.document_id)) continue;
    seen.add(row.document_id);
    results.push({
      documentId: row.document_id,
      title: row.title,
      category: row.category,
      passage: { id: row.passage_id, start: row.start_offset, end: row.end_offset, content: row.content },
    });
    if (results.length === SEARCH_MAX_DOCUMENTS) break;
  }
  return { results };
}
