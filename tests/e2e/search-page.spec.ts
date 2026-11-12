import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { EMBEDDING_MODEL, EMBEDDING_VERSION } from "../../supabase/functions/_shared/config.ts";
import { fakeVector } from "../../supabase/functions/_shared/fake-embeddings.ts";
import { texts } from "../../src/lib/texts";
import { expect, isDesktop, test, type Account } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Page Recherche et champ du Tableau de bord (story 4.1b), sur le build de production et Supabase
// local. Parcours réel : un Document prêt est créé avec un Passage dont le vecteur simulé est celui de
// la Requête (similarité 1, rang 1 garanti avec la vectorisation simulée), puis supprimé. Les états
// vide, erreur et chargement sont obtenus en interceptant POST /api/search.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });

const t = texts.search;
// Playwright charge les specs en CommonJS (pas d'import.meta) et tourne depuis la racine du projet.
const root = process.cwd();
const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

const inserted: string[] = [];
test.afterEach(async () => {
  if (inserted.length > 0) await admin().from("documents").delete().in("id", inserted.splice(0));
});

const tag = () => crypto.randomUUID().slice(0, 8);

type Seeded = { id: string; title: string; query: string; passage: string; start: number; end: number };

// Document prêt « Procédure congés et absences {marqueur} » ; son Passage (au milieu du texte) a
// pour vecteur celui de la Requête.
async function seedDocument(account: Account, marker = tag()): Promise<Seeded> {
  const title = `Procédure congés et absences ${marker}`;
  const query = `organisation des congés ${marker}`;
  const passage = `Les demandes de congés (${query}) sont posées au moins deux semaines à l'avance.`;
  const before = `${"Introduction de la procédure. ".repeat(80)}\n\n`;
  const content = `${before}${passage}\n\n${"Suite du texte. ".repeat(40)}`;
  const { data, error } = await admin()
    .from("documents")
    .insert({
      author_id: account.id,
      title,
      category: "procedure",
      content_text: content,
      status: "ready",
      client_request_id: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  inserted.push(data.id);
  const start = before.length;
  const end = start + passage.length;
  const insert = await admin().from("passages").insert({
    document_id: data.id,
    text_version: 1,
    ordinal: 0,
    start_offset: start,
    end_offset: end,
    content: passage,
    embedding: JSON.stringify(fakeVector(query)),
    embedding_model: EMBEDDING_MODEL,
    embedding_version: EMBEDDING_VERSION,
  });
  if (insert.error) throw new Error(`Création du Passage de test impossible : ${insert.error.message}`);
  return { id: data.id, title, query, passage, start, end };
}

const field = (page: Page) => page.getByRole("searchbox", { name: t.fieldLabel });
const announcement = (page: Page) => page.getByRole("status").filter({ hasText: /pertinent|Aucun Document/ });
const cards = (page: Page) => page.getByRole("list", { name: t.resultsLabel }).getByRole("article");
const dashboardField = (page: Page) => page.getByRole("searchbox", { name: texts.dashboard.searchLabel });

async function openDashboardByNavigation(page: Page) {
  await page.goto("/bibliotheque");
  await expect(page.getByRole("heading", { level: 1, name: texts.titles.library })).toBeVisible();
  // Lien hydraté (gestionnaire React posé) : sinon le clic ferait un chargement complet, où aucun
  // élément ne reçoit le focus (règle du lien d'évitement), et le test vérifierait autre chose.
  const hydrated = () =>
    page.waitForFunction(() =>
      [...document.querySelectorAll('a[href="/"]')].some((a) => Object.keys(a).some((k) => k.startsWith("__reactProps"))),
    );
  await hydrated();
  if (!isDesktop(page)) await page.getByRole("button", { name: texts.shell.openMenu }).click();
  await page.getByRole("link", { name: texts.nav.dashboard, exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

const fulfill = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

test("parcours réel au clavier : Tableau de bord → /recherche?q=… → annonce → carte → Document « Passage pertinent »", async ({
  page,
  account,
}) => {
  const seeded = await seedDocument(account);
  await openDashboardByNavigation(page);
  // Changement d'écran : le champ de Recherche du Tableau de bord a le focus (pas le titre).
  if (isDesktop(page)) await expect(dashboardField(page)).toBeFocused();
  else {
    // Navigation depuis le menu mobile : le focus revient d'abord sur ☰ (règle de la story 1.2).
    await expect(page.getByRole("button", { name: texts.shell.openMenu })).toBeFocused();
    await dashboardField(page).click();
  }
  await page.keyboard.type(seeded.query);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL((url) => url.pathname === "/recherche" && url.searchParams.get("q") === seeded.query);
  await expect(field(page)).toHaveValue(seeded.query);
  const count = announcement(page);
  await expect(count).toHaveText(/^\d+ Documents? pertinents?$/);
  await expect(count.locator("p")).toBeFocused();

  const card = cards(page).filter({ hasText: seeded.title });
  await expect(card).toHaveCount(1);
  await expect(cards(page).first()).toContainText(seeded.title);
  await expect(card.locator("mark.passage-highlight")).toHaveText(seeded.passage);
  await expect(card).toContainText(texts.categories.procedure);
  await expect(card).toContainText(texts.reader.relevantPassageLabel);
  await expect(page.locator("main")).not.toContainText(/similarit|score/i);
  await expect(card.getByRole("link")).toHaveCount(1);
  expect(await card.getByRole("link").getAttribute("href")).toBe(
    `/documents/${seeded.id}?passages=${seeded.start}-${seeded.end}&actif=0&depuis=recherche`,
  );

  // Tab depuis l'annonce jusqu'à la première carte, puis Entrée.
  await page.keyboard.press("Tab");
  await expect(cards(page).first().getByRole("link")).toBeFocused();
  await card.getByRole("link").focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`/documents/${seeded.id}\\?`));
  await expect(page.getByRole("heading", { level: 1, name: seeded.title })).toBeVisible();
  const mark = page.locator("mark.passage-highlight");
  await expect(mark).toHaveText(seeded.passage);
  await expect(mark).toBeFocused();
  await expect(mark).toBeInViewport();
  await expect(page.getByText(texts.reader.relevantPassageLabel, { exact: true })).toBeVisible();
  await expect(page.getByText(texts.reader.relevantPassagePosition(1, 1))).toBeAttached();
  await expect(page.getByText(texts.reader.activePassageLabel, { exact: true })).toHaveCount(0);
});

test("page Document : depuis=… autre que « recherche » est ignoré (« Passage utilisé »)", async ({ page, account }) => {
  const seeded = await seedDocument(account);
  for (const depuis of ["Recherche", "assistant", "recherche%20"]) {
    await page.goto(`/documents/${seeded.id}?passages=${seeded.start}-${seeded.end}&actif=0&depuis=${depuis}`);
    await expect(page.locator("mark.passage-highlight")).toHaveText(seeded.passage);
    await expect(page.getByText(texts.reader.activePassageLabel, { exact: true })).toBeVisible();
    await expect(page.getByText(texts.reader.relevantPassageLabel, { exact: true })).toHaveCount(0);
  }
});

test("état initial : phrase d'aide, trois exemples ; un exemple lance la Recherche", async ({ page }) => {
  await page.route("**/api/search", (route) => route.fulfill(fulfill({ results: [] })));
  await page.goto("/recherche");
  await expect(page.getByText(t.help, { exact: true }).first()).toBeVisible();
  const examples = page.getByRole("list", { name: t.examplesLabel }).getByRole("link");
  await expect(examples).toHaveText([...t.examples]);
  await examples.first().click();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === t.examples[0]);
  await expect(announcement(page)).toHaveText(t.noResults);
});

test("chargement : trois cartes squelettes ; sans résultat : message FR-15, sans liste ni bouton vers l'Assistant", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/search", async (route) => {
    await gate;
    await route.fulfill(fulfill({ results: [] }));
  });
  await page.goto("/recherche");
  await field(page).fill("recette de la tarte aux pommes");
  await field(page).press("Enter");
  await expect(page.locator("[data-search-skeleton] > div")).toHaveCount(3);
  release();
  await expect(announcement(page)).toHaveText(t.noResults);
  await expect(announcement(page).locator("p")).toBeFocused();
  await expect(page.getByRole("list", { name: t.resultsLabel })).toHaveCount(0);
  await expect(page.getByText(/Poser la question/)).toHaveCount(0);
  await expect(page.locator("[data-search-skeleton]")).toHaveCount(0);
});

test("erreur : alerte et « Réessayer », Requête conservée ; « Réessayer » relance la même Requête", async ({ page, account }) => {
  const seeded = await seedDocument(account);
  const bodies: string[] = [];
  let calls = 0;
  await page.route("**/api/search", async (route) => {
    bodies.push(route.request().postData() ?? "");
    calls += 1;
    if (calls === 1) await route.fulfill(fulfill({ error: { code: "AI_UNAVAILABLE", message: "x", retryable: true } }, 503));
    else await route.continue();
  });
  await page.goto("/recherche");
  await field(page).fill(seeded.query);
  await field(page).press("Enter");
  const alert = page.getByRole("alert").filter({ hasText: t.failed });
  await expect(alert).toBeFocused();
  await expect(field(page)).toHaveValue(seeded.query);
  await alert.getByRole("button", { name: t.retry }).press("Enter");
  await expect(cards(page).filter({ hasText: seeded.title })).toHaveCount(1);
  await expect(announcement(page).locator("p")).toBeFocused();
  expect(bodies.map((body) => JSON.parse(body))).toEqual([{ query: seeded.query }, { query: seeded.query }]);
});

test("premier chargement complet de /recherche?q=… : focus non déplacé, « Aller au contenu » reste le premier arrêt", async ({
  page,
}) => {
  await page.route("**/api/search", (route) => route.fulfill(fulfill({ results: [] })));
  await page.goto(`/recherche?q=${encodeURIComponent("organisation des congés")}`);
  await expect(announcement(page)).toHaveText(t.noResults);
  await expect(field(page)).toHaveValue("organisation des congés");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: texts.shell.skipLink })).toBeFocused();
});

test("premier chargement du Tableau de bord : le champ ne vole pas le focus au lien d'évitement", async ({ page }) => {
  await page.goto("/");
  await expect(dashboardField(page)).toBeVisible();
  await expect(dashboardField(page)).not.toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: texts.shell.skipLink })).toBeFocused();
});

test("Tableau de bord : Requête vide sans effet ; Requête spéciale encodée dans ?q=", async ({ page }) => {
  await page.route("**/api/search", (route) => route.fulfill(fulfill({ results: [] })));
  await page.goto("/");
  await dashboardField(page).fill("   ");
  await dashboardField(page).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  const special = "congés & absences #1 ?/";
  await dashboardField(page).fill(special);
  await dashboardField(page).press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === "/recherche" && url.searchParams.get("q") === special);
  await expect(field(page)).toHaveValue(special);
});

test("375 px : champ et bouton empilés, cartes pleine largeur, aucun défilement horizontal ; axe sans violation", async ({
  page,
  account,
}) => {
  test.skip(isDesktop(page), "vue mobile uniquement");
  const seeded = await seedDocument(account);
  const long = `${"Motsansespace".repeat(14)} https://exemple.test/${"chemin/".repeat(20)}`;
  await page.route("**/api/search", (route) =>
    route.fulfill(
      fulfill({
        results: [
          { documentId: seeded.id, title: `${seeded.title} ${long}`, category: "procedure", passage: { id: "p1", start: seeded.start, end: seeded.end, content: long } },
          { documentId: crypto.randomUUID(), title: "Deuxième", category: "faq", passage: { id: "p2", start: 0, end: 10, content: "| a | b | c | d | e |" } },
        ],
      }),
    ),
  );
  await page.goto(`/recherche?q=${encodeURIComponent(seeded.query)}`);
  await expect(cards(page)).toHaveCount(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);

  const input = await field(page).boundingBox();
  const button = await page.getByRole("button", { name: t.submit, exact: true }).boundingBox();
  if (!input || !button) throw new Error("Champ ou bouton invisible");
  expect(button.y).toBeGreaterThanOrEqual(input.y + input.height);
  const list = await page.getByRole("list", { name: t.resultsLabel }).boundingBox();
  const first = await cards(page).first().boundingBox();
  if (!list || !first) throw new Error("Liste invisible");
  expect(Math.round(first.width)).toBe(Math.round(list.width));

  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  await page.goto("/");
  const dashboardOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(dashboardOverflow).toBe(0);
});

test("ordinateur : axe sans violation sur les résultats", async ({ page, account }) => {
  test.skip(!isDesktop(page), "vue ordinateur uniquement");
  const seeded = await seedDocument(account);
  await page.goto(`/recherche?q=${encodeURIComponent(seeded.query)}`);
  await expect(cards(page).filter({ hasText: seeded.title })).toHaveCount(1);
  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("pages prérendues (/recherche, Tableau de bord) : ni résultat, ni Passage, ni annonce", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "ordinateur", "fichiers du build : un projet suffit");
  const dir = path.join(root, process.env.NEXT_DIST_DIR || ".next-e2e", "server", "app");
  for (const file of ["recherche.html", "index.html"]) {
    const html = readFileSync(path.join(dir, file), "utf8");
    expect(html.length).toBeGreaterThan(0);
    expect(html).not.toMatch(/<mark|passage-highlight|Documents? pertinents?|Aucun Document ne correspond/);
    expect(html).not.toContain(t.resultsLabel);
    expect(html).not.toContain("data-document-id");
  }
  expect(readFileSync(path.join(dir, "recherche.html"), "utf8")).toContain(texts.titles.search);
});
