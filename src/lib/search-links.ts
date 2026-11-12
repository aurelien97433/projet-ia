import { SEARCH_QUERY_MAX_LENGTH, type SearchResult } from "@/lib/schemas/search";

// Passage des paramètres de la Recherche (story 4.1b). Fonctions pures : la Requête ne sort de l'URL
// que validée, et un lien de résultat n'est construit qu'à partir de valeurs contrôlées.

export const SEARCH_PATH = "/recherche";

export type SearchQueryParam = {
  // Requête à lancer, ou null (état initial : absente, vide ou trop longue).
  query: string | null;
  // Valeur à placer dans le champ.
  fieldValue: string;
};

// `?q=` : espaces retirés aux extrémités ; vide → état initial ; plus de 500 caractères → état
// initial, champ pré-rempli des 500 premiers (aucun appel).
export function parseSearchQueryParam(raw: string | null): SearchQueryParam {
  const value = (raw ?? "").trim();
  if (value.length === 0) return { query: null, fieldValue: "" };
  if (value.length > SEARCH_QUERY_MAX_LENGTH) return { query: null, fieldValue: value.slice(0, SEARCH_QUERY_MAX_LENGTH) };
  return { query: value, fieldValue: value };
}

// Requête saisie → adresse de la page Recherche, ou null si la Requête est vide.
export function searchHref(input: string): string | null {
  const query = input.trim();
  if (query.length === 0) return null;
  return `${SEARCH_PATH}?${new URLSearchParams({ q: query.slice(0, SEARCH_QUERY_MAX_LENGTH) })}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lien d'un résultat vers la page Document au Passage (`?passages=…&actif=0&depuis=recherche`), ou
// null si l'identifiant n'est pas un UUID ou si les positions ne sont pas des entiers ordonnés.
export function resultHref(result: Pick<SearchResult, "documentId" | "passage">): string | null {
  const { documentId, passage } = result;
  const { start, end } = passage;
  if (!UUID_PATTERN.test(documentId)) return null;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) return null;
  const params = new URLSearchParams({ passages: `${start}-${end}`, actif: "0", depuis: "recherche" });
  return `/documents/${documentId}?${params}`;
}
