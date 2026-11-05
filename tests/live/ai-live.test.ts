import { describe, expect, it } from "vitest";
import { localSupabase } from "../support/local-supabase";

// Seul test réel de l'IA (story 2.1), lancé à la demande par `npm run test:ai`, jamais par `npm test`.
// Il appelle la fonction locale ai-health, qui lit la clé dans supabase/functions/.env : ce test ne
// reçoit jamais la clé OpenAI. Coût : un embedding de « Bonjour » ; l'accès aux modèles est gratuit.
const endpoint = () => `${localSupabase().url}/functions/v1/ai-health`;

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

  it("vecteur de 1 536 dimensions avec text-embedding-3-small ; accès à gpt-5.4-mini et text-embedding-3-small", async () => {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: { Authorization: `Bearer ${localSupabase().serviceRoleKey}` },
    });
    const body = await response.json();
    // En cas d'échec, seul le code d'erreur AD-19 est affiché : la réponse ne contient jamais la clé.
    expect(response.status, JSON.stringify(body?.error ?? {})).toBe(200);
    expect(body).toEqual({
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: 1,
      dimension: 1536,
      expectedDimension: 1536,
      models: { "text-embedding-3-small": true, "gpt-5.4-mini": true },
    });
  });
});
