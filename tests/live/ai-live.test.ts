import { beforeAll, describe, expect, it } from "vitest";
import { localSupabase } from "../support/local-supabase";

// Seul test réel de l'IA (story 2.1), lancé à la demande par `npm run test:ai`, jamais par `npm test`.
// Il appelle la fonction locale ai-health, qui lit la clé dans supabase/functions/.env : ce test ne
// reçoit jamais la clé OpenAI. Un seul appel à ai-health, partagé : un embedding de « Bonjour » et une
// génération d'essai de quelques dizaines de tokens (story 5.2a-1, < 0,001 $) ; l'accès aux modèles
// est gratuit.
const endpoint = () => `${localSupabase().url}/functions/v1/ai-health`;

type Health = { status: number; body: Record<string, unknown> & { error?: unknown; generation?: Record<string, unknown> } };
let health: Health;

beforeAll(async () => {
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: { Authorization: `Bearer ${localSupabase().serviceRoleKey}` },
  });
  health = { status: response.status, body: await response.json() };
  // Ligne à recopier dans le compte rendu : ni clé, ni texte, seulement le résultat de l'essai.
  console.log(`Génération d'essai : ${JSON.stringify(health.body.generation ?? null)}`);
}, 60_000);

describe("accès réel à l'IA (fonction locale ai-health)", () => {
  it("refuse un appel sans la clé service_role", async () => {
    for (const authorization of [undefined, `Bearer ${localSupabase().publishableKey}`]) {
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: authorization ? { Authorization: authorization } : {},
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED", retryable: false } });
    }
  });

  it("vecteur de 1 536 dimensions avec text-embedding-3-small ; accès à gpt-5.4-mini et text-embedding-3-small", () => {
    // En cas d'échec, seul le code d'erreur AD-19 est affiché : la réponse ne contient jamais la clé.
    expect(health.status, JSON.stringify(health.body.error ?? {})).toBe(200);
    expect(health.body).toEqual({
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: 1,
      dimension: 1536,
      expectedDimension: 1536,
      models: { "text-embedding-3-small": true, "gpt-5.4-mini": true },
      generation: expect.any(Object),
    });
  });

  // Story 5.2a-1 : la documentation d'OpenAI ne confirme pas que gpt-5.4-mini accepte temperature et
  // seed. generateAnswer ne réussit qu'avec un texte non vide et finish_reason « stop ». En cas de
  // refus, la ligne affichée donne le code du fournisseur (ex. unsupported_parameter) et le paramètre.
  it("génération d'essai acceptée avec l'échantillonnage retenu (temperature, seed, reasoning_effort none)", () => {
    const generation = health.body.generation;
    expect(generation, JSON.stringify(generation)).toEqual({
      ok: true,
      model: expect.stringMatching(/^gpt-5\.4-mini/),
      sampling: expect.any(Object),
      outputTokens: expect.any(Number),
    });
    expect(generation?.outputTokens).toBeGreaterThan(0);
  });
});
