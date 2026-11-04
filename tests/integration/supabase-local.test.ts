import { describe, expect, it } from "vitest";

// Les tests d'intégration s'exécutent sur Supabase local (npx supabase start). Ce test échoue
// clairement si la pile locale n'est pas démarrée, au lieu de laisser croire qu'elle l'est.
const API_URL = process.env.SUPABASE_LOCAL_API_URL ?? "http://127.0.0.1:54321";

describe("Supabase local", () => {
  it("répond sur l'API REST", async () => {
    let status: number;
    try {
      status = (await fetch(`${API_URL}/rest/v1/`)).status;
    } catch {
      throw new Error(`Supabase local ne répond pas sur ${API_URL} : lancez npx supabase start.`);
    }
    expect(status).toBe(200);
  });
});
