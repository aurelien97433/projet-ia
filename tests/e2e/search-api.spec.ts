import { texts } from "../../src/lib/texts";
import { expect, test } from "../support/e2e-auth";

// POST /api/search (story 4.1a) sur le build de production et Supabase local : le Route Handler
// vérifie la session, revalide la Requête et relaie vers semantic-search avec le jeton de la session.
// La page Recherche arrive en 4.1b : seule la route est testée ici. Un projet suffit (aucun rendu).
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "ordinateur", "Route seule : un projet suffit"));

test.describe("sans session", () => {
  test("401 UNAUTHENTICATED, réponse jamais en cache", async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL });
    const response = await request.post("/api/search", { data: { query: "organisation des congés" }, maxRedirects: 0 });
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    await request.dispose();
  });
});

test.describe("avec session", () => {
  test.use({ storageState: async ({ authState }, provide) => provide(authState) });

  test("Requête valide : 200, 5 Documents au plus, chacun une fois, sans score ni texte complet", async ({ page }) => {
    const response = await page.request.post("/api/search", { data: { query: "organisation des congés" } });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const text = await response.text();
    expect(text).not.toMatch(/similarity|content_text/);
    const { results } = JSON.parse(text) as { results: { documentId: string; passage: { start: number; end: number } }[] };
    expect(results.length).toBeLessThanOrEqual(5);
    expect(new Set(results.map((result) => result.documentId)).size).toBe(results.length);
    for (const { passage } of results) expect(passage.end).toBeGreaterThan(passage.start);
  });

  test("Requête invalide : 400 VALIDATION_FAILED, texte du catalogue", async ({ page }) => {
    for (const data of [{ query: "   " }, { query: "a".repeat(501) }, {}]) {
      const response = await page.request.post("/api/search", { data });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: "VALIDATION_FAILED", message: texts.search.failed, retryable: false },
      });
    }
  });
});
