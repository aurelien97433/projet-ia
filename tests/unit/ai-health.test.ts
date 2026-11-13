import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERATION_SAMPLING } from "../../supabase/functions/_shared/config.ts";
import { probeGeneration } from "../../supabase/functions/ai-health/index.ts";

// Génération d'essai de ai-health (story 5.2a-1, fonction locale) avec un fournisseur simulé : le refus
// d'un paramètre est rendu par son code et son nom, jamais par le message du fournisseur ; un modèle
// inaccessible ne déclenche aucun appel ; une erreur inattendue est journalisée.
const SECRET_TEXT = "Message détaillé du fournisseur";
const env: Record<string, string> = {};

beforeEach(() => {
  env.OPENAI_API_KEY = ["cle", "de", "test", "simulee"].join("-");
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("probeGeneration", () => {
  it("paramètre refusé : ok false, code et paramètre du fournisseur, message jamais rendu", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { error: { message: SECRET_TEXT, type: "invalid_request_error", code: "unsupported_parameter", param: "seed" } },
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await probeGeneration(true);
    expect(result).toEqual({
      ok: false,
      sampling: GENERATION_SAMPLING,
      code: "AI_UNAVAILABLE",
      providerCode: "unsupported_parameter",
      providerParam: "seed",
    });
    expect(JSON.stringify(result)).not.toContain(SECRET_TEXT);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("succès : modèle, échantillonnage et tokens produits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          model: "gpt-5.4-mini-2026-03-17",
          choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 20, completion_tokens: 1 },
        }),
      ),
    );
    expect(await probeGeneration(true)).toEqual({ ok: true, model: "gpt-5.4-mini-2026-03-17", sampling: GENERATION_SAMPLING, outputTokens: 1 });
  });

  it("modèle inaccessible : aucun appel", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await probeGeneration(false)).toMatchObject({ ok: false, code: "MODEL_INACCESSIBLE" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("erreur inattendue : INTERNAL, journalisée", async () => {
    vi.stubGlobal("Deno", { env: { get: () => { throw new Error("inattendue"); } } });
    expect(await probeGeneration(true)).toMatchObject({ ok: false, code: "INTERNAL" });
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("ai_health_generation_failed");
  });
});
