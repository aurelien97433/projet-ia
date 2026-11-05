// Contrôle de l'accès à l'IA (story 2.1), en local uniquement : exclue de deploy:supabase.
// Entrée fixe, aucun texte libre ; réservée à la clé service_role, comparée dans la fonction
// (verify_jwt = false dans supabase/config.toml, pour accepter aussi les nouvelles clés).
import { checkModelAccess, embed } from "../_shared/ai.ts";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL, generationModel, readEnv } from "../_shared/config.ts";
import { AiError, errorResponse, logEvent } from "../_shared/errors.ts";

const PROBE_TEXT = "Bonjour";

// Comparaison à durée constante, pour ne rien révéler de la clé attendue.
function sameSecret(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

function isServiceRole(request: Request): boolean {
  const expected = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return Boolean(expected) && token !== "" && sameSecret(token, expected!);
}

export async function handle(request: Request): Promise<Response> {
  if (!isServiceRole(request)) return errorResponse("UNAUTHENTICATED", "Accès refusé.", false, 401);

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
