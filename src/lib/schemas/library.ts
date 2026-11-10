import { z } from "zod";
import { DOCUMENT_CATEGORIES, MAX_TITLE_LENGTH, type DocumentCategory } from "@/lib/documents";

// Filtres de la Bibliothèque (FR-9), validés côté serveur. L'Auteur de « Mes Documents » vient
// toujours de la session, jamais du client : `mine` n'est qu'un booléen.
export const LIBRARY_SORTS = ["recent", "oldest"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export const ALL_CATEGORIES = "all";
export type LibraryCategory = DocumentCategory | typeof ALL_CATEGORIES;

// Recherche par titre de 0 à 200 caractères, la longueur maximale d'un titre.
export const MAX_SEARCH_LENGTH = MAX_TITLE_LENGTH;
// Lignes renvoyées au plus (Q2 du 2026-11-10) ; le nombre affiché reste le total exact.
export const MAX_LIBRARY_ROWS = 200;

export type LibraryFilters = {
  category: LibraryCategory;
  mine: boolean;
  search: string;
  sort: LibrarySort;
};

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = { category: ALL_CATEGORIES, mine: false, search: "", sort: "recent" };

export const libraryFiltersSchema = z.object({
  category: z.enum([ALL_CATEGORIES, ...DOCUMENT_CATEGORIES]).default(ALL_CATEGORIES),
  mine: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Longueur contrôlée avant de retirer les espaces : une valeur trop longue est refusée, jamais coupée.
  search: z
    .string()
    .max(MAX_SEARCH_LENGTH)
    .default("")
    .transform((value) => value.trim()),
  sort: z.enum(LIBRARY_SORTS).default("recent"),
});

const QUERY_KEYS = ["category", "mine", "search", "sort"] as const;

// Paramètres de GET /api/documents. Un paramètre répété est refusé (valeur ambiguë) ; une clé
// inconnue est ignorée. Valeur invalide : null, et la route répond 400 sans reprendre la valeur.
export function parseLibraryQuery(params: URLSearchParams): LibraryFilters | null {
  const raw: Record<string, string> = {};
  for (const key of QUERY_KEYS) {
    const values = params.getAll(key);
    if (values.length > 1) return null;
    if (values.length === 1) raw[key] = values[0];
  }
  const parsed = libraryFiltersSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// Paramètres envoyés par la Bibliothèque : seules les valeurs différentes du défaut figurent dans l'URL.
export function libraryQueryString(filters: LibraryFilters): string {
  const params = new URLSearchParams();
  if (filters.category !== ALL_CATEGORIES) params.set("category", filters.category);
  if (filters.mine) params.set("mine", "true");
  const search = filters.search.trim();
  if (search) params.set("search", search);
  if (filters.sort !== "recent") params.set("sort", filters.sort);
  return params.toString();
}

// Motif `ilike` : `\`, `%` et `_` sont échappés (caractère d'échappement par défaut de Postgres),
// la valeur ne peut donc jamais servir de joker.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// PostgREST traduit tout « * » d'un motif `like`/`ilike` en « % », sans échappement possible. Une
// recherche qui en contient passe donc aussi par une expression régulière (`imatch`, sans casse),
// où chaque caractère spécial est échappé : « * » n'y est plus qu'un caractère.
export function escapeRegex(value: string): string {
  return value.replace(/[\\^$.|?*+()[\]{}]/g, (character) => `\\${character}`);
}

// Identifiants pour GET /api/documents/statuses : liste séparée par des virgules, UUID valides
// seulement, MAX_LIBRARY_ROWS au plus (une ligne affichée = un identifiant au plus).
export function parseStatusIds(params: URLSearchParams): string[] | null {
  const values = params.getAll("ids");
  if (values.length !== 1 || values[0] === "") return null;
  const ids = values[0].split(",");
  if (ids.length > MAX_LIBRARY_ROWS) return null;
  if (!ids.every((id) => z.uuid().safeParse(id).success)) return null;
  return [...new Set(ids.map((id) => id.toLowerCase()))];
}
