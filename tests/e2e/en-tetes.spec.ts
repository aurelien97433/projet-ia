import { expect, test } from "../support/e2e-auth";

// Story 7.8 (R9) : en-têtes de sécurité sur les pages, les redirections et les Route Handlers. Les
// parcours qui pourraient en souffrir (Source, Lecteur, flux de l'Assistant) restent couverts par
// source-panel, document-reader et assistant, lancés avec ces en-têtes.
const EXPECTED = {
  "content-security-policy": "frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const expectSecurityHeaders = (headers: Record<string, string>, label: string) => {
  for (const [name, value] of Object.entries(EXPECTED)) expect(headers[name], `${label} : ${name}`).toBe(value);
};

test("page publique, page protégée (redirection) et Route Handler : en-têtes de sécurité", async ({ request }) => {
  const page = await request.get("/connexion");
  expect(page.status()).toBe(200);
  expectSecurityHeaders(page.headers(), "/connexion");

  const redirect = await request.get("/bibliotheque", { maxRedirects: 0 });
  expect(redirect.status()).toBeGreaterThanOrEqual(300);
  expect(redirect.status()).toBeLessThan(400);
  expectSecurityHeaders(redirect.headers(), "/bibliotheque sans session");

  const api = await request.post("/api/chat", { data: {} });
  expect(api.status()).toBe(401);
  expectSecurityHeaders(api.headers(), "/api/chat sans session");
});

