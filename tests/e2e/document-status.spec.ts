import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { request as playwrightRequest, type Page, type Route } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { createAccount, deleteAccount, expect, test } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Suivi du Statut sur la page Document (E7), contre Supabase local. Pour maîtriser l'instant du
// changement, ces Documents sont insérés sans déclencher le traitement : leur Statut est posé en base.
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

const temporaryError = { status: "error", error_kind: "temporary", error_message: t.temporaryAuthor };

// Rafraîchit la page sans la recharger : seul le Statut reçu du serveur change pour le bandeau.
const routerRefresh = (page: Page) =>
  page.evaluate(() => (window as unknown as { next: { router: { refresh(): void } } }).next.router.refresh());

// Requêtes POST de la page Document : Server Action de relance.
const retryActionUrl = (id: string) => (url: URL) => url.pathname === `/documents/${id}`;

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
  await expect(banner(page)).toHaveText(new RegExp(t.ready));
  await expect(banner(page)).not.toContainText(t.processingTitle);

  const afterChange = requests.length;
  await page.waitForTimeout(4_000);
  expect(requests.length).toBe(afterChange);
  expect(loads).toBe(1);
});

test("« prêt » pour un autre Collaborateur : message sans « Votre »", async ({ page }) => {
  const other = await createAccount("e2e-auteur-pret");
  try {
    const id = await insertDocument(other.id);
    await page.goto(`/documents/${id}`);
    await updateDocument(id, { status: "ready" });
    await expect(banner(page)).toContainText(t.readyOther, { timeout: 8_000 });
    await expect(banner(page)).not.toContainText(t.ready);
  } finally {
    await deleteAccount(other);
  }
});

test("« prêt » n'est annoncé qu'au changement : après un rechargement, badge seul", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await page.goto(`/documents/${id}`);
  await updateDocument(id, { status: "ready" });
  await expect(banner(page)).toContainText(t.ready, { timeout: 8_000 });

  await page.reload();
  await expect(badge(page).getByText(texts.status.ready)).toBeVisible();
  await expect(banner(page)).toBeEmpty();
});

test("rafraîchissement périmé : le badge finit par suivre le bandeau", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  let stale = 0;
  // Premier router.refresh() : le serveur répond avec l'ancien Statut, puis la base redevient à jour.
  await page.route(`**/documents/${id}**`, async (route) => {
    if (!route.request().headers().rsc || stale > 0) return route.continue();
    stale += 1;
    await updateDocument(id, { status: "processing" });
    const response = await route.fetch();
    await updateDocument(id, { status: "ready" });
    await route.fulfill({ response });
  });
  await page.goto(`/documents/${id}`);
  await updateDocument(id, { status: "ready" });
  await expect(banner(page)).toContainText(t.ready, { timeout: 8_000 });
  await expect.poll(() => stale, { timeout: 5_000 }).toBe(1);
  await expect(badge(page).getByText(texts.status.ready)).toBeVisible({ timeout: 8_000 });
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

test("erreur sans texte exploitable : raison lue en base, ni relance ni suppression", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await updateDocument(id, { status: "error", error_kind: "no_text", error_message: "Raison enregistrée en base." });
  await page.goto(`/documents/${id}`);
  await expect(badge(page).getByText(texts.status.error)).toBeVisible();
  await expect(banner(page)).toContainText("Raison enregistrée en base.");
  await expect(banner(page).getByRole("button")).toHaveCount(0);
});

test("sans texte exploitable, autre Collaborateur : même raison, sans action", async ({ page }) => {
  const other = await createAccount("e2e-auteur-sans-texte");
  try {
    const id = await insertDocument(other.id);
    await updateDocument(id, { status: "error", error_kind: "no_text", error_message: t.noText });
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.noText);
    await expect(banner(page).getByRole("button")).toHaveCount(0);
  } finally {
    await deleteAccount(other);
  }
});

test.describe("traitement long, compté depuis l'horodatage serveur", () => {
  test("plus de 60 s : le message remplace le texte, à l'ouverture et après rechargement", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, { processing_started_at: new Date(Date.now() - 65_000).toISOString() });
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.processingLong);
    await expect(banner(page)).not.toContainText(t.processingText);

    await page.reload();
    await expect(banner(page)).toContainText(t.processingLong);
  });

  test("le seuil est franchi pendant le suivi, selon la durée renvoyée par le serveur", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.processingText);

    await updateDocument(id, { processing_started_at: new Date(Date.now() - 65_000).toISOString() });
    await expect(banner(page)).toContainText(t.processingLong, { timeout: 8_000 });
  });

  test("moins de 60 s : texte habituel, même si l'horloge du poste est décalée", async ({ page, account }) => {
    await page.clock.install({ time: new Date(Date.now() + 3_600_000) });
    const id = await insertDocument(account.id);
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.processingText);
    await expect(banner(page)).not.toContainText(t.processingLong);
  });
});

test.describe("trois échecs consécutifs de l'interrogation", () => {
  for (const [label, fail] of [
    ["réseau", (route: Route) => route.abort()],
    ["5xx", (route: Route) => route.fulfill({ status: 503, body: "" })],
  ] as const) {
    test(`${label} : message après le troisième, retiré au retour, sans rechargement`, async ({ page, account }) => {
      const id = await insertDocument(account.id);
      let failing = true;
      let calls = 0;
      let loads = 0;
      page.on("load", () => (loads += 1));
      await page.route(`**/api/documents/${id}/status`, async (route) => {
        if (!failing) return route.continue();
        calls += 1;
        await fail(route);
      });

      await page.goto(`/documents/${id}`);
      await expect.poll(() => calls, { timeout: 12_000 }).toBeGreaterThanOrEqual(2);
      await expect(banner(page)).not.toContainText(t.statusUnavailable);
      await expect(banner(page)).toContainText(t.statusUnavailable, { timeout: 8_000 });
      await expect(banner(page).getByRole("button", { name: t.refresh })).toBeVisible();
      expect(calls).toBe(3);

      // Le suivi continue pendant la panne.
      await expect.poll(() => calls, { timeout: 8_000 }).toBeGreaterThanOrEqual(4);

      failing = false;
      await expect(banner(page)).not.toContainText(t.statusUnavailable, { timeout: 8_000 });
      await expect(banner(page)).toContainText(t.processingTitle);
      expect(loads).toBe(1);
    });
  }

  test("« Actualiser » interroge aussitôt, sans recharger la page", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    let failing = true;
    let calls = 0;
    let loads = 0;
    let rscRequests = 0;
    page.on("load", () => (loads += 1));
    page.on("request", (request) => {
      if (request.headers().rsc) rscRequests += 1;
    });
    await page.route(`**/api/documents/${id}/status`, async (route) => {
      calls += 1;
      if (failing) return route.abort();
      return route.continue();
    });

    await page.goto(`/documents/${id}`);
    const refresh = banner(page).getByRole("button", { name: t.refresh });
    await expect(refresh).toBeVisible({ timeout: 15_000 });

    failing = false;
    const before = calls;
    const rscBefore = rscRequests;
    await refresh.click();
    await expect.poll(() => calls, { timeout: 1_500 }).toBeGreaterThan(before);
    await expect(banner(page)).not.toContainText(t.statusUnavailable, { timeout: 2_000 });
    expect(rscRequests).toBe(rscBefore);
    expect(loads).toBe(1);
  });

  test("le troisième échec n'est atteint que consécutivement", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    let calls = 0;
    await page.route(`**/api/documents/${id}/status`, async (route) => {
      calls += 1;
      if (calls % 3 === 0) return route.continue();
      return route.abort();
    });
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.processingTitle);
    // Observateur posé avant le premier échec : il retient une apparition, même brève, du message.
    await page.evaluate((message) => {
      const zone = document.querySelector('main [role="status"]')!;
      const seen = window as unknown as { unavailableSeen: boolean };
      const look = () => {
        seen.unavailableSeen ||= zone.textContent.includes(message);
      };
      look();
      new MutationObserver(look).observe(zone, { childList: true, subtree: true, characterData: true });
    }, t.statusUnavailable);
    expect(calls).toBeLessThan(3);

    await expect.poll(() => calls, { timeout: 25_000 }).toBeGreaterThanOrEqual(6);
    expect(await page.evaluate(() => (window as unknown as { unavailableSeen: boolean }).unavailableSeen)).toBe(false);
  });

  test("accessibilité : panne de l'interrogation, sans violation", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await page.route(`**/api/documents/${id}/status`, (route) => route.abort());
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.statusUnavailable, { timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("resynchronisation sur le Statut reçu du serveur", () => {
  test("erreur puis en cours : le suivi reprend et « prêt » est annoncé", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, temporaryError);
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.temporaryAuthor);

    await updateDocument(id, {
      status: "processing",
      error_kind: null,
      error_message: null,
      processing_started_at: new Date().toISOString(),
    });
    await routerRefresh(page);
    await expect(banner(page)).toContainText(t.processingTitle, { timeout: 8_000 });

    await updateDocument(id, { status: "ready", error_kind: null });
    await expect(banner(page)).toContainText(t.ready, { timeout: 8_000 });
  });

  test("prêt à l'ouverture puis en cours : « prêt » est de nouveau annoncé", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, { status: "ready" });
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toBeEmpty();

    await updateDocument(id, { status: "processing", processing_started_at: new Date().toISOString() });
    await routerRefresh(page);
    await expect(banner(page)).toContainText(t.processingTitle, { timeout: 8_000 });

    await updateDocument(id, { status: "ready" });
    await expect(banner(page)).toContainText(t.ready, { timeout: 8_000 });
  });
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

test.describe("relance", () => {
  test("Auteur : « Relance… » pendant l'action, second clic sans effet, en cours puis prêt sans rechargement", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, temporaryError);
    let loads = 0;
    let actions = 0;
    page.on("load", () => (loads += 1));
    await page.route(retryActionUrl(id), async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      actions += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.continue();
    });

    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.temporaryAuthor);
    const retry = banner(page).getByRole("button", { name: t.retry });
    await expect(retry).not.toHaveAttribute("aria-disabled", "true");
    await expect(retry).toHaveAccessibleDescription(new RegExp(t.temporaryAuthor));

    await retry.click();
    const busy = banner(page).getByRole("button", { name: t.retrying });
    await expect(busy).toHaveAttribute("aria-disabled", "true");
    // force : Playwright attend sinon qu'un bouton aria-disabled redevienne actif.
    await busy.click({ force: true });

    await expect(banner(page)).toContainText(t.ready, { timeout: 20_000 });
    await expect(badge(page).getByText(texts.status.ready)).toBeVisible({ timeout: 8_000 });
    expect(actions).toBe(1);
    expect(loads).toBe(1);
  });

  test("clavier : relance à la touche Entrée, le focus passe au bandeau quand le bouton disparaît", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, temporaryError);
    await page.goto(`/documents/${id}`);
    const retry = banner(page).getByRole("button", { name: t.retry });
    await retry.focus();
    await page.keyboard.press("Enter");

    await expect(retry).toHaveCount(0, { timeout: 20_000 });
    await expect(banner(page)).toBeFocused();
  });

  test("session expirée au moment du clic : retour à la connexion", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, temporaryError);
    await page.goto(`/documents/${id}`);
    const retry = banner(page).getByRole("button", { name: t.retry });
    await expect(retry).toBeVisible();

    await page.context().clearCookies();
    await retry.click();
    await expect(page).toHaveURL(/\/connexion/, { timeout: 15_000 });
  });

  test("Document supprimé au moment du clic : page E9", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, temporaryError);
    await page.goto(`/documents/${id}`);
    const retry = banner(page).getByRole("button", { name: t.retry });
    await expect(retry).toBeVisible();

    const { error } = await admin().from("documents").delete().eq("id", id);
    expect(error).toBeNull();
    await retry.click();
    await expect(page.getByText(texts.notFound.title)).toBeVisible({ timeout: 15_000 });
  });

  test("Document expiré : l'Auteur relance jusqu'à « prêt »", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, { processing_started_at: new Date(Date.now() - 181_000).toISOString() });
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.temporaryAuthor);
    await banner(page).getByRole("button", { name: t.retry }).click();
    await expect(banner(page)).toContainText(t.ready, { timeout: 20_000 });
  });

  test("Document expiré, autre Collaborateur : « Seul l'Auteur… », sans bouton", async ({ page }) => {
    const other = await createAccount("e2e-auteur-expire");
    try {
      const id = await insertDocument(other.id);
      await updateDocument(id, { processing_started_at: new Date(Date.now() - 181_000).toISOString() });
      await page.goto(`/documents/${id}`);
      await expect(banner(page)).toContainText(t.temporaryOther);
      await expect(banner(page).getByRole("button")).toHaveCount(0);
    } finally {
      await deleteAccount(other);
    }
  });

  test("échec de l'action : message, bouton de nouveau proposé, même identifiant au nouvel essai", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, temporaryError);
    const bodies: (string | null)[] = [];
    await page.route(retryActionUrl(id), async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      bodies.push(route.request().postData());
      if (bodies.length === 1) return route.abort();
      return route.continue();
    });

    await page.goto(`/documents/${id}`);
    await banner(page).getByRole("button", { name: t.retry }).click();
    await expect(banner(page)).toContainText(t.retryFailed);
    await expect(banner(page).getByRole("button", { name: t.retry })).not.toHaveAttribute("aria-disabled", "true");

    await banner(page).getByRole("button", { name: t.retry }).click();
    await expect(banner(page)).toContainText(t.ready, { timeout: 20_000 });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
  });

  test("Statut déjà « en cours » côté serveur : le bandeau s'aligne, sans message d'échec", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, temporaryError);
    await page.goto(`/documents/${id}`);
    const retry = banner(page).getByRole("button", { name: t.retry });
    await expect(retry).toBeVisible();

    await updateDocument(id, {
      status: "processing",
      error_kind: null,
      error_message: null,
      processing_started_at: new Date().toISOString(),
    });
    await retry.click();
    await expect(banner(page)).toContainText(t.processingTitle, { timeout: 8_000 });
    await expect(banner(page)).not.toContainText(t.retryFailed);
  });

  test("le déclenchement porte un nouvel identifiant après une réponse reçue", async ({ page, account }) => {
    const id = await insertDocument(account.id);
    await updateDocument(id, temporaryError);
    const bodies: (string | null)[] = [];
    await page.route(retryActionUrl(id), async (route) => {
      if (route.request().method() === "POST") bodies.push(route.request().postData());
      await route.continue();
    });

    await page.goto(`/documents/${id}`);
    await banner(page).getByRole("button", { name: t.retry }).click();
    await expect(banner(page)).toContainText(t.ready, { timeout: 20_000 });
    // Le badge vient du serveur : attendre qu'il ait rattrapé le bandeau avant de changer le Statut.
    await expect(badge(page).getByText(texts.status.ready)).toBeVisible({ timeout: 8_000 });
    await updateDocument(id, temporaryError);
    await routerRefresh(page);
    await expect(banner(page).getByRole("button", { name: t.retry })).toBeVisible({ timeout: 8_000 });

    await banner(page).getByRole("button", { name: t.retry }).click();
    await expect(banner(page)).toContainText(t.ready, { timeout: 20_000 });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).not.toBe(bodies[0]);
  });
});

test("autre Collaborateur : raison adaptée, sans bouton", async ({ page }) => {
  const other = await createAccount("e2e-autre-auteur");
  try {
    const id = await insertDocument(other.id);
    await updateDocument(id, temporaryError);
    await page.goto(`/documents/${id}`);
    await expect(banner(page)).toContainText(t.temporaryOther);
    await expect(page.getByRole("button", { name: t.retry })).toHaveCount(0);
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
  expect(await known.json()).toEqual({
    effectiveStatus: "processing",
    effectiveErrorKind: null,
    effectiveErrorMessage: null,
    processingElapsedMs: expect.any(Number),
  });
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

test("accessibilité : bandeau sans texte exploitable, sans violation", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await updateDocument(id, { status: "error", error_kind: "no_text", error_message: t.noText });
  await page.goto(`/documents/${id}`);
  await expect(banner(page)).toContainText(t.noText);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("accessibilité : bandeau prêt, sans violation", async ({ page, account }) => {
  const id = await insertDocument(account.id);
  await page.goto(`/documents/${id}`);
  await updateDocument(id, { status: "ready" });
  await expect(banner(page)).toContainText(t.ready, { timeout: 8_000 });
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
