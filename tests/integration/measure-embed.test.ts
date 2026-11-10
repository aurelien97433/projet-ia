import { describe, expect, it } from "vitest";
import { localSupabase } from "../support/local-supabase";

// Fonction locale measure-embed (story 4.2), servie par Supabase local : seuls les refus sont testés,
// car un appel accepté vectorise réellement (clé OpenAI locale) et n'a lieu que dans measure:search.
const endpoint = () => `${localSupabase().url}/functions/v1/measure-embed`;

const call = (body: unknown, authorization?: string) =>
  fetch(endpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body),
  });

describe("measure-embed sur Supabase local", () => {
  it("sans clé service_role (aucune, clé publique) : 401", async () => {
    for (const authorization of [undefined, `Bearer ${localSupabase().publishableKey}`]) {
      const response = await call({ texts: ["congés"] }, authorization);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED", retryable: false } });
    }
  });

  it("Requêtes invalides : 400, rejetées avant toute vectorisation", async () => {
    for (const body of [{ texts: [] }, { texts: ["  "] }, { texts: ["a".repeat(501)] }, {}]) {
      const response = await call(body, `Bearer ${localSupabase().serviceRoleKey}`);
      expect(response.status, JSON.stringify(body).slice(0, 40)).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    }
  });
});
