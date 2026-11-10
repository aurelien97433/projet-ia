import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { createAccount, deleteAccount, expect, signInThroughForm, test, type Account } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Bibliothèque (E6), contre Supabase local. La base est partagée entre workers et fichiers : chaque
// test marque ses titres d'un repère unique et filtre sur lui. Chaque test tourne aux deux largeurs.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });

const t = texts.library;
const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

type Insert = { title: string; category?: string; status?: "ready" | "processing" | "error"; content?: string; at?: Date };

async function insertDocument(account: Account, values: Insert): Promise<string> {
  const { data, error } = await admin()
    .from("documents")
    .insert({
      author_id: account.id,
      title: values.title,
      category: values.category ?? "faq",
      content_text: values.content ?? "Texte du Document.",
      status: values.status ?? "ready",
      error_kind: values.status === "error" ? "temporary" : null,
      error_message: values.status === "error" ? "Raison." : null,
      ...(values.at ? { created_at: values.at.toISOString() } : {}),
      client_request_id: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  return data.id;
}

const tag = () => `bib${crypto.randomUUID().slice(0, 8)}`;
const rows = (page: Page) => page.locator("main tbody tr");
const search = (page: Page) => page.getByLabel(t.searchLabel);
// Session vide : sans elle, un contexte créé dans un test reprend la session du worker (test.use).
const NO_SESSION = { cookies: [], origins: [] };
const alert = (page: Page) => page.getByRole("main").getByRole("alert");
const isListRequest = (url: URL) => url.pathname === "/api/documents";

async function openFiltered(page: Page, marker: string) {
  await page.goto("/bibliotheque");
  await expect(page.getByRole("heading", { level: 1, name: texts.titles.library })).toBeVisible();
  await search(page).fill(marker);
}

test("ouverture : chaque ligne a son titre en lien, Catégorie, Auteur, date et badge, plus récents d'abord", async ({
  page,
  account,
}) => {
  const other = await createAccount("e2e-bib-autre");
  const marker = tag();
  const secret = `CONTENU-${marker}`;
  try {
    const old = await insertDocument(account, { title: `${marker} ancien`, category: "procedure", content: secret, at: new Date(Date.now() - 60_000) });
    const recent = await insertDocument(other, { title: `${marker} récent`, status: "processing", content: secret });
    const failed = await insertDocument(account, { title: `${marker} erreur`, status: "error", content: secret, at: new Date(Date.now() - 30_000) });

    // Toutes les réponses reçues par la page : aucune ne contient le texte d'un Document.
    const bodies: string[] = [];
    page.on("response", async (response) => {
      const type = response.headers()["content-type"] ?? "";
      if (!/json|html|text|rsc/.test(type)) return;
      bodies.push(await response.text().catch(() => ""));
    });

    await page.goto("/bibliotheque");
    // Première liste rendue par le serveur : la ligne la plus récente du repère est présente.
    await expect(page.getByRole("link", { name: `${marker} récent` })).toBeVisible();
    await expect(page.getByText(/^\d+ Documents?$/)).toBeVisible();

    await search(page).fill(marker);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByText("3 Documents", { exact: true })).toBeVisible();
    const ids = await rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-document-id")));
    expect(ids).toEqual([recent, failed, old]);

    const first = rows(page).nth(0);
    await expect(first.getByRole("link")).toHaveCount(1);
    await expect(first.getByRole("link")).toHaveAttribute("href", `/documents/${recent}`);
    await expect(first).toContainText(texts.categories.faq);
    await expect(first).toContainText(other.email.split("@")[0]);
    await expect(first).toContainText(texts.status.processing);
    await expect(first.locator("time:visible")).toHaveCount(1);
    await expect(rows(page).nth(1)).toContainText(texts.status.error);
    await expect(rows(page).nth(2)).toContainText(texts.status.ready);
    await expect(rows(page).nth(2)).toContainText(texts.categories.procedure);

    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toContain("content_text");
      expect(body).not.toContain(secret);
    }

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  } finally {
    await deleteAccount(other);
  }
});

test("combinaison : Procédure, Mes Documents, recherche partielle sans casse, plus anciens d'abord, nombre annoncé", async ({
  page,
  account,
}) => {
  const other = await createAccount("e2e-bib-comb");
  const marker = tag();
  try {
    const first = await insertDocument(account, { title: `Procédure de facturation-${marker}`, category: "procedure", at: new Date(Date.now() - 60_000) });
    const second = await insertDocument(account, { title: `Fournisseurs, facturation-${marker}`, category: "procedure" });
    await insertDocument(account, { title: `FAQ facturation-${marker}`, category: "faq" });
    await insertDocument(other, { title: `Facturation autre-${marker}`, category: "procedure" });
    await insertDocument(account, { title: `Procédure de paie-${marker}`, category: "procedure" });

    await page.goto("/bibliotheque");
    await page.getByLabel(t.categoryLabel).selectOption({ label: texts.categories.procedure });
    const mine = page.getByRole("switch", { name: t.mine });
    await mine.click();
    await expect(mine).toHaveAttribute("aria-checked", "true");
    await search(page).fill(`FACTURATION-${marker.toUpperCase()}`);
    await page.getByLabel(t.sortLabel).selectOption({ label: t.sortOldest });

    await expect(rows(page)).toHaveCount(2);
    const ids = await rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-document-id")));
    expect(ids).toEqual([first, second]);
    const count = page.getByText("2 Documents", { exact: true });
    await expect(count).toBeVisible();
    await expect(page.locator("[aria-live='polite']").filter({ has: count })).toHaveCount(1);
  } finally {
    await deleteAccount(other);
  }
});

test("aucun résultat : message, puis « Réinitialiser les filtres » remet la liste complète", async ({ page, account }) => {
  // Un Document à soi : la base partagée peut être vidée par un autre worker.
  const id = await insertDocument(account, { title: `${tag()} réinitialisation` });
  await page.goto("/bibliotheque");
  await expect(page.locator(`tr[data-document-id="${id}"]`)).toBeVisible();
  await page.getByLabel(t.categoryLabel).selectOption({ label: texts.categories.client_report });
  await search(page).fill(crypto.randomUUID());
  await expect(page.getByText(t.noResults)).toBeVisible();
  await expect(page.getByText("Aucun Document", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: t.resetFilters }).click();
  await expect(search(page)).toHaveValue("");
  await expect(page.getByLabel(t.categoryLabel)).toHaveValue("all");
  await expect(page.getByLabel(t.categoryLabel)).toBeFocused();
  await expect(page.locator(`tr[data-document-id="${id}"]`)).toBeVisible();
});

test("« Mes Documents » d'un nouveau Collaborateur : invitation à ajouter un Document", async ({ browser }, testInfo) => {
  const fresh = await createAccount("e2e-bib-neuf");
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport, storageState: NO_SESSION });
  try {
    const page = await context.newPage();
    await signInThroughForm(page, fresh);
    await page.goto("/bibliotheque");
    await page.getByRole("switch", { name: t.mine }).click();
    await expect(page.getByText(t.emptyMine)).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: t.addDocument, exact: true })).toHaveAttribute("href", "/ajouter");
    await expect(page.getByText("Aucun Document", { exact: true })).toBeVisible();
  } finally {
    await context.close();
    await deleteAccount(fresh);
  }
});

test("erreur de chargement : alerte, filtres conservés, « Réessayer » reprend les mêmes filtres", async ({ page, account }) => {
  const marker = tag();
  await insertDocument(account, { title: `${marker} FAQ`, category: "faq" });
  await openFiltered(page, marker);
  await expect(rows(page)).toHaveCount(1);

  let failing = true;
  const requested: string[] = [];
  await page.route(isListRequest, async (route) => {
    requested.push(route.request().url());
    if (failing) await route.fulfill({ status: 500, json: { error: { code: "INTERNAL", message: "", retryable: true } } });
    else await route.continue();
  });

  await page.getByLabel(t.categoryLabel).selectOption({ label: texts.categories.faq });
  await expect(alert(page)).toContainText(t.loadFailed);
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByLabel(t.categoryLabel)).toHaveValue("faq");
  await expect(search(page)).toHaveValue(marker);

  failing = false;
  await page.getByRole("button", { name: t.retry }).click();
  await expect(alert(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
  expect(new Set(requested.map((url) => new URL(url).search))).toEqual(new Set([`?category=faq&search=${marker}`]));
});

test("paramètre hostile envoyé directement : 400 neutre", async ({ page }) => {
  for (const query of ["category=x", "sort=y", `search=${"a".repeat(201)}`]) {
    const response = await page.request.get(`/api/documents?${query}`);
    expect(response.status()).toBe(400);
    const body = await response.text();
    expect(body).not.toContain("aaaa");
    expect(JSON.parse(body).error.code).toBe("VALIDATION_FAILED");
  }
});

test("sans session : les deux routes répondent 401", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL, storageState: NO_SESSION });
  try {
    expect((await anonymous.get("/api/documents")).status()).toBe(401);
    expect((await anonymous.get(`/api/documents/statuses?ids=${crypto.randomUUID()}`)).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});

test("en cours puis prêt : le badge change sans rechargement, sans déplacer le focus", async ({ page, account }) => {
  const marker = tag();
  const id = await insertDocument(account, { title: `${marker} en cours`, status: "processing" });
  await openFiltered(page, marker);
  const row = page.locator(`tr[data-document-id="${id}"]`);
  // Résultat de la recherche affiché : le Statut suivi est bien celui du suivi, pas d'une nouvelle liste.
  await expect(rows(page)).toHaveCount(1);
  await expect(row).toContainText(texts.status.processing);
  await page.evaluate(() => ((window as unknown as { __sansRechargement: boolean }).__sansRechargement = true));
  await expect(search(page)).toBeFocused();

  const { error } = await admin().from("documents").update({ status: "ready" }).eq("id", id);
  expect(error).toBeNull();
  await expect(row).toContainText(texts.status.ready, { timeout: 15_000 });
  expect(await page.evaluate(() => (window as unknown as { __sansRechargement?: boolean }).__sansRechargement)).toBe(true);
  await expect(search(page)).toBeFocused();
  await expect(page.getByText(t.statusChanged(`${marker} en cours`, texts.status.ready))).toBeAttached();
});

test("ouvrir un Document : lien au clavier, ou clic n'importe où sur la ligne", async ({ page, account }) => {
  const marker = tag();
  const id = await insertDocument(account, { title: `${marker} à ouvrir` });
  await openFiltered(page, marker);
  await expect(rows(page)).toHaveCount(1);

  const link = page.getByRole("link", { name: `${marker} à ouvrir` });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/documents/${id}$`));
  await expect(page.getByRole("heading", { level: 1, name: `${marker} à ouvrir` })).toBeVisible();

  await openFiltered(page, marker);
  await expect(rows(page)).toHaveCount(1);
  // Clic sur la cellule du Statut, hors du lien : la zone du lien couvre toute la ligne.
  const box = await rows(page).first().locator("td").last().boundingBox();
  if (!box) throw new Error("Cellule du Statut invisible");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(new RegExp(`/documents/${id}$`));
});

test("titres longs et mots sans espace : tableau lisible, aucun défilement horizontal", async ({ page, account }) => {
  const marker = tag();
  await insertDocument(account, { title: `${marker}${"Motsansespace".repeat(14)}`, category: "client_report" });
  await insertDocument(account, {
    title: `${marker} https://exemple.test/${"chemin/".repeat(20)}`,
    category: "business_resource",
    status: "processing",
  });
  await openFiltered(page, marker);
  await expect(rows(page)).toHaveCount(2);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  const width = page.viewportSize()?.width ?? 0;
  const headers = await page.locator("main thead th").evaluateAll((elements) =>
    elements.filter((element) => element.getBoundingClientRect().width > 0).map((element) => element.textContent),
  );
  const c = t.columns;
  if (width >= 1024) expect(headers).toEqual([c.title, c.category, c.author, c.addedOn, c.status]);
  else if (width >= 768) expect(headers).toEqual([c.title, c.category, c.addedOn, c.status]);
  else {
    expect(headers).toEqual([c.title, c.status]);
    await expect(rows(page).first()).toContainText(`${texts.categories.business_resource} · `);
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test.describe("à 768 px", () => {
  test.use({ viewport: { width: 800, height: 900 } });

  test("Auteur reporté sous le titre", async ({ page, account }) => {
    const marker = tag();
    await insertDocument(account, { title: `${marker} tablette` });
    await openFiltered(page, marker);
    await expect(rows(page)).toHaveCount(1);
    const headers = await page.locator("main thead th:visible").allTextContents();
    expect(headers).not.toContain(t.columns.author);
    await expect(rows(page).first().locator("td").first()).toContainText(account.email.split("@")[0]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});
