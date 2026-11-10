import { z } from "zod";

// Recherche sémantique (story 4.1a). Mêmes règles que supabase/functions/_shared/search.ts et
// _shared/config.ts (les Edge Functions n'importent rien de src/ : un test vérifie l'égalité).
export const SEARCH_QUERY_MAX_LENGTH = 500;
export const SEARCH_MAX_DOCUMENTS = 5;

// Requête de 1 à 500 caractères après suppression des espaces.
export const searchRequestSchema = z.object({
  query: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(SEARCH_QUERY_MAX_LENGTH)),
});

export function parseSearchRequest(body: unknown): string | null {
  const parsed = searchRequestSchema.safeParse(body);
  return parsed.success ? parsed.data.query : null;
}

// Réponse relayée au navigateur. Les objets zod retirent toute clé non déclarée : ni score, ni texte
// complet du Document ne peuvent passer, même si l'Edge Function en renvoyait.
export const searchResponseSchema = z.object({
  results: z
    .array(
      z.object({
        documentId: z.string(),
        title: z.string(),
        category: z.string(),
        passage: z.object({
          id: z.string(),
          start: z.number().int().nonnegative(),
          end: z.number().int().positive(),
          content: z.string(),
        }),
      }),
    )
    .max(SEARCH_MAX_DOCUMENTS),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type SearchResult = SearchResponse["results"][number];
