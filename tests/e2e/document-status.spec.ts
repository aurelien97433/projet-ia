import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { request as playwrightRequest, type Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { createAccount, deleteAccount, expect, test } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Suivi du Statut sur la page Document (E7), contre Supabase local. Le travail se réduisant à une
// journalisation (story 2.3), les changements de Statut sont posés directement en base.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });
test.describe.configure({ timeout: 60_000 });

const t = texts.documentStatus;
const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

async function insertDocument(authorId: string): Promise<string> {
  const { data, error } = await admin()
    .from("documents")
    .insert({
      author_id: authorId,
      title: `Note suivie ${crypto.randomUUID()}`,
      category: "procedure",
      content_text: "Texte de la Note.",
      client_request_id: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  return data.id;
}

async function updateDocument(id: string, values: Record<string, unknown>) {
  const { error } = await admin().from("documents").update(values).eq("id", id);
  expect(error).toBeNull();
}

const temporaryError = { status: "error", error_kind: "temporary", error_message: t.temporaryReason };

// Instants des requêtes de Statut envoyées par la page.
function recordStatusRequests(page: Page) {
  const times: number[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/status")) times.push(Date.now());
  });
  return times;
}

const banner = (page: Page) => page.locator("main").getByRole("status");
const badge = (page: Page) => page.locator("main dl");

test("en cours : bandeau, interrogation toutes les 3 s, arrêt au changement, sans rechargement", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  const requests = recordStatusRequests(page);
  let loads = 0;
  page.on("load", () => (loads += 1));

  await page.goto(`/documents/${id}`);
  await expect(banner(page)).toContainText(t.processingTitle);
  await expect(banner(page)).toContainText(t.processingText);
  await expect(banner(page).getByRole("button")).toHaveCount(0);

  // Cadence mesurée entre deux requêtes : le délai repart à la fin de la précédente, d'où la marge.
  await expect.poll(() => requests.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  for (const [index, time] of requests.slice(1).entries()) {
    const gap = time - requests[index];
    expect(gap).toBeGreaterThanOrEqual(2_900);
    expect(gap).toBeLessThan(6_000);
  }

  await updateDocument(id, { status: "ready" });
  await expect(badge(page).getByText(texts.status.ready)).toBeVisible({ timeout: 8_000 });
  await expect(banner(page)).toBeEmpty();

  const afterChange = requests.length;
  await page.waitForTimeout(4_000);
  expect(requests.length).toBe(afterChange);
  expect(loads).toBe(1);
});

test("une requête lente ne s'empile pas sur la suivante", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  await page.route(`**/api/documents/${id}/status`, async (route) => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    active -= 1;
    await route.continue();
  });
  await page.goto(`/documents/${id}`);
  await expect.poll(() => calls, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  expect(maxActive).toBe(1);
});

test.describe("session expirée ou Document inaccessible", () => {
  for (const status of [401, 404]) {
    test(`réponse ${status} : le suivi s'arrête`, async ({ page, account }) => {
      const id = await insertDocument(account.id);
      let calls = 0;
      await page.route(`**/api/documents/${id}/status`, async (route) => {
        calls += 1;
        await route.fulfill({ status, json: { error: { code: "NOT_FOUND", message: "", retryable: false } } });
      });
      await page.goto(`/documents/${id}`);
      await expect.poll(() => calls, { timeout: 8_000 }).toBe(1);
      await page.waitForTimeout(4_000);
      expect(calls).toBe(1);
    });
  }
});

test("erreur sans texte exploitable : aucune proposition de relance", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await updateDocument(id, { status: "error", error_kind: "no_text", error_message: "Sans texte." });
  await page.goto(`/documents/${id}`);
  await expect(badge(page).getByText(texts.status.error)).toBeVisible();
  await expect(banner(page)).toBeEmpty();
  await expect(page.getByRole("button", { name: t.retry })).toHaveCount(0);
});

test("une panne de l'interrogation n'interrompt pas le suivi", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  let failures = 0;
  await page.route(`**/api/documents/${id}/status`, async (route) => {
    if (failures < 1) {
      failures += 1;
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto(`/documents/${id}`);
  await expect.poll(() => failures, { timeout: 8_000 }).toBe(1);
  await updateDocument(id, { status: "ready" });
  await expect(badge(page).getByText(texts.status.ready)).toBeVisible({ timeout: 8_000 });
});

test("expiration : le Statut effectif passe en erreur et le bandeau remplace l'ancien message", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await page.goto(`/documents/${id}`);
  await expect(banner(page)).toContainText(t.processingTitle);

  await updateDocument(id, { processing_started_at: new Date(Date.now() - 181_000).toISOString() });
  await expect(banner(page)).toContainText(t.temporaryAuthor, { timeout: 8_000 });
  await expect(banner(page)).not.toContainText(t.processingTitle);
  await expect(badge(page).getByText(texts.status.error)).toBeVisible();
});

test("Auteur en erreur temporaire : raison et bouton inactif, expliqué, sans effet", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await updateDocument(id, temporaryError);
  const requests = recordStatusRequests(page);

  await page.goto(`/documents/${id}`);
  await expect(banner(page)).toContainText(t.temporaryAuthor);
  const retry = banner(page).getByRole("button", { name: t.retry });
  await expect(retry).toHaveAttribute("aria-disabled", "true");
  await expect(retry).toHaveAccessibleDescription(new RegExp(t.temporaryAuthor));
  await expect(page.getByText("Vous pouvez le relancer")).toHaveCount(0);

  await retry.click({ force: true });
  await expect(banner(page)).toContainText(t.temporaryAuthor);
  await page.waitForTimeout(3_500);
  expect(requests).toEqual([]);
});

test("autre Collaborateur : raison adaptée, sans bouton", async ({ page }) => {
  const other = await createAccount("e2e-autre-auteur");
  try {
    const id = await insertDocument(other.id);
    await updateDocument(id, temporaryError);
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.temporaryOther);
    await expect(page.getByRole("button", { name: t.retry })).toHaveCount(0);
    await expect(page.getByText("La relance sera bientôt disponible")).toHaveCount(0);
  } finally {
    await deleteAccount(other);
  }
});

test("Document prêt à l'ouverture : badge seul, aucune interrogation", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await updateDocument(id, { status: "ready" });
  const requests = recordStatusRequests(page);
  await page.goto(`/documents/${id}`);
  await expect(badge(page).getByText(texts.status.ready)).toBeVisible();
  await expect(banner(page)).toBeEmpty();
  await page.waitForTimeout(3_500);
  expect(requests).toEqual([]);
});

test("route de Statut : session, Document inconnu, identifiant invalide, cache", async ({ page, account, baseURL }) => {
  const id = await insertDocument(account.id);
  await page.goto("/ajouter");

  const known = await page.request.get(`/api/documents/${id}/status`);
  expect(known.status()).toBe(200);
  expect(await known.json()).toEqual({ effectiveStatus: "processing", effectiveErrorKind: null });
  expect(known.headers()["cache-control"]).toContain("no-store");

  const unknown = await page.request.get(`/api/documents/${crypto.randomUUID()}/status`);
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).error.code).toBe("NOT_FOUND");
  expect((await page.request.get("/api/documents/abc/status")).status()).toBe(404);

  const anonymous = await playwrightRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const refused = await anonymous.get(`/api/documents/${id}/status`, { maxRedirects: 0 });
  expect(refused.status()).toBe(401);
  expect((await refused.json()).error.code).toBe("UNAUTHENTICATED");
  await anonymous.dispose();
});

test("l'ancienne notification ne s'affiche plus, même avec ?ajoute=1", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await page.goto(`/documents/${id}?ajoute=1`);
  await expect(banner(page)).toContainText(t.processingTitle);
  await expect(page.getByText("Document ajouté.")).toHaveCount(0);
});

test("accessibilité : bandeau en erreur, sans violation", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await updateDocument(id, temporaryError);
  await page.goto(`/documents/${id}`);
  await expect(banner(page)).toContainText(t.temporaryAuthor);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("accessibilité : bandeau en cours, sans violation", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await page.goto(`/documents/${id}`);
  await expect(banner(page)).toContainText(t.processingTitle);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
