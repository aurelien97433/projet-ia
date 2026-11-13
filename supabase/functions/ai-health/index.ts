// Contrôle de l'accès à l'IA (story 2.1), en local uniquement : exclue de deploy:supabase.
// Entrée fixe, aucun texte libre ; réservée à la clé service_role, comparée dans la fonction
// (verify_jwt = false dans supabase/config.toml, pour accepter aussi les nouvelles clés).
import { checkModelAccess, embed, generateAnswer } from "../_shared/ai.ts";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL, GENERATION_SAMPLING, generationModel, readEnv } from "../_shared/config.ts";
import { AiError, errorResponse, logEvent } from "../_shared/errors.ts";
import { hasBearerSecret } from "../_shared/secret.ts";

const PROBE_TEXT = "Bonjour";

// Génération d'essai (story 5.2a-1) : entrée fixe, quelques dizaines de tokens. Elle vérifie que le
// modèle accepte les paramètres de GENERATION_SAMPLING ; un refus renvoie le code du fournisseur
// (jamais son message ni la clé), sans faire échouer le reste du contrôle.
const GENERATION_PROBE = [
  { role: "system" as const, content: "Répondez uniquement par le mot OK." },
  { role: "user" as const, content: "Êtes-vous disponible ?" },
];

export async function probeGeneration(modelAccessible: boolean) {
  // Modèle inaccessible : aucun appel, voué à l'échec et payant.
  if (!modelAccessible) return { ok: false, sampling: GENERATION_SAMPLING, code: "MODEL_INACCESSIBLE", providerCode: null, providerParam: null };
  try {
    const { model, usage } = await generateAnswer(GENERATION_PROBE);
    return { ok: true, model, sampling: GENERATION_SAMPLING, outputTokens: usage.outputTokens };
  } catch (error) {
    if (error instanceof AiError) {
      return {
        ok: false,
        sampling: GENERATION_SAMPLING,
        code: error.code,
        providerCode: error.providerCode ?? null,
        providerParam: error.providerParam ?? null,
      };
    }
    logEvent("ai_health_generation_failed", { code: "INTERNAL" });
    return { ok: false, sampling: GENERATION_SAMPLING, code: "INTERNAL", providerCode: null, providerParam: null };
  }
}

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
        generation: await probeGeneration(models[generationModel()] === true),
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
