// Contrôle de l'accès à l'IA (story 2.1), en local uniquement : exclue de deploy:supabase.
// Entrée fixe, aucun texte libre ; réservée à la clé service_role, comparée dans la fonction
// (verify_jwt = false dans supabase/config.toml, pour accepter aussi les nouvelles clés).
import { checkModelAccess, embed } from "../_shared/ai.ts";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL, generationModel, readEnv } from "../_shared/config.ts";
import { AiError, errorResponse, logEvent } from "../_shared/errors.ts";
import { hasBearerSecret } from "../_shared/secret.ts";

const PROBE_TEXT = "Bonjour";

export async function handle(request: Request): Promise<Response> {
  if (!hasBearerSecret(request, readEnv("SUPABASE_SERVICE_ROLE_KEY"))) return errorResponse("UNAUTHENTICATED", "Accès refusé.", false, 401);

  try {
    const models = await checkModelAccess([EMBEDDING_MODEL, generationModel()]);
    const { vectors, model, version } = await embed([PROBE_TEXT]);
    return new Response(
      JSON.stringify({
        embeddingModel: model,
        embeddingVersion: version,
        dimension: vectors[0].length,
        expectedDimension: EMBEDDING_DIMENSION,
        models,
      }),
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (error) {
    if (error instanceof AiError) {
      return errorResponse(error.code, "Le contrôle de l'IA a échoué.", error.retryable, 502);
    }
    logEvent("ai_health_failed", { code: "INTERNAL" });
    return errorResponse("INTERNAL", "Le contrôle de l'IA a échoué.", true, 500);
  }
}

(globalThis as { Deno?: { serve(handler: (request: Request) => Promise<Response>): unknown } }).Deno?.serve(handle);
