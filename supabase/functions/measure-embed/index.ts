// Vectorisation des Requêtes de mesure (story 4.2), en local uniquement : exclue de deploy:supabase,
// comme ai-health. Réservée à la clé service_role locale, comparée dans la fonction (verify_jwt =
// false dans supabase/config.toml). Vectorisation toujours réelle (clé OpenAI locale), jamais simulée :
// les vecteurs sont comparés aux Passages du projet distant, vectorisés avec le même modèle.
// Les textes reçus ne sont jamais journalisés.
import { embed } from "../_shared/ai.ts";
import { EMBEDDING_DIMENSION, readEnv } from "../_shared/config.ts";
import { AiError, errorResponse, logEvent, logInfo } from "../_shared/errors.ts";
import { parseSearchQuery } from "../_shared/search.ts";
import { hasBearerSecret } from "../_shared/secret.ts";

export const MEASURE_MAX_TEXTS = 20;
const FAILURE_MESSAGE = "La vectorisation de mesure a échoué.";

// { texts } : 1 à 20 Requêtes, chacune valide comme une Requête de la Recherche (1 à 500 caractères
// après suppression des espaces). Renvoie les Requêtes nettoyées, ou null.
export function parseMeasureTexts(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const texts = (body as { texts?: unknown }).texts;
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > MEASURE_MAX_TEXTS) return null;
  const parsed = texts.map((query) => parseSearchQuery({ query }));
  return parsed.every((query): query is string => query !== null) ? parsed : null;
}

export async function handle(request: Request): Promise<Response> {
  if (!hasBearerSecret(request, readEnv("SUPABASE_SERVICE_ROLE_KEY"))) {
    return errorResponse("UNAUTHENTICATED", "Accès refusé.", false, 401);
  }
  if (request.method !== "POST") return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 405);
  const texts = parseMeasureTexts(await request.json().catch(() => undefined));
  if (!texts) return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 400);

  const started = Date.now();
  try {
    const { vectors, model, version } = await embed(texts);
    logInfo("measure_embed_done", { count: vectors.length, duration_ms: Date.now() - started });
    return new Response(
      JSON.stringify({ model, version, dimension: vectors[0].length, expectedDimension: EMBEDDING_DIMENSION, vectors }),
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (error) {
    if (error instanceof AiError) return errorResponse(error.code, FAILURE_MESSAGE, error.retryable, 502);
    logEvent("measure_embed_failed", { code: "INTERNAL" });
    return errorResponse("INTERNAL", FAILURE_MESSAGE, true, 500);
  }
}

(globalThis as { Deno?: { serve(handler: (request: Request) => Promise<Response>): unknown } }).Deno?.serve(handle);
