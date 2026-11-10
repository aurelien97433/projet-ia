import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { createAccount, deleteAccount, expect, test, type Account } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Tableau de bord (E3), contre Supabase local. La liste montre les 5 derniers Documents de toute la
// Base commune, partagée entre workers : les Documents de ces tests sont datés loin dans le futur pour
// rester en tête, et supprimés à la fin de chaque test. Pour que deux tests de ce fichier ne se
// disputent jamais la tête de liste, ils tournent seulement dans le projet « ordinateur », en série ;
// la vérification à 375 px redimensionne la fenêtre.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });
test.describe.configure({ mode: "serial" });
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "ordinateur", "Base commune : un seul projet"));

const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

type Insert = { title: string; category?: string; status?: "ready" | "processing" | "error"; content?: string; at: Date };

const inserted: string[] = [];

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
      created_at: values.at.toISOString(),
      client_request_id: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  inserted.push(data.id);
  return data.id;
}

test.afterEach(async () => {
  if (inserted.length > 0) await admin().from("documents").delete().in("id", inserted.splice(0));
});

// Dates futures croissantes, au-delà de tout Document créé par les autres fichiers.
let tick = 0;
const future = () => new Date(Date.UTC(2999, 0, 1) + Date.now() + tick++ * 60_000);

const tag = () => `tdb${crypto.randomUUID().slice(0, 8)}`;
const section = (page: Page) => page.getByRole("region", { name: texts.dashboard.recentDocuments });
const items = (page: Page) => section(page).getByRole("listitem");
const ids = (page: Page) => items(page).evaluateAll((elements) => elements.map((e) => e.getAttribute("data-document-id")));
const addAction = (page: Page) => page.getByRole("main").getByRole("link", { name: texts.library.addDocument, exact: true });

test("ouverture : 5 derniers Documents de A et B, badge et lien, « Voir la Bibliothèque », sans « Poser une question »", async ({
  page,
  account,
}) => {
  const other = await createAccount("e2e-tdb-autre");
  const marker = tag();
  const secret = `CONTENU-${marker}`;
  try {
    const statuses = ["ready", "processing", "error", "ready", "ready", "error", "ready"] as const;
    const created: string[] = [];
    for (const [index, status] of statuses.entries()) {
      const author = index % 2 === 0 ? account : other;
      created.push(await insertDocument(author, { title: `${marker} n°${index}`, status, content: secret, at: future() }));
    }

    const bodies: string[] = [];
    page.on("response", async (response) => {
      const type = response.headers()["content-type"] ?? "";
      if (!/json|html|text|rsc/.test(type)) return;
      bodies.push(await response.text().catch(() => ""));
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: texts.titles.dashboard })).toBeVisible();
    await expect(section(page).getByRole("heading", { level: 2, name: texts.dashboard.recentDocuments })).toBeVisible();
    await expect(items(page)).toHaveCount(5);
    // Plus récent en tête : les 5 derniers créés, dans l'ordre inverse de création.
    expect(await ids(page)).toEqual(created.slice(2).reverse());

    const first = items(page).nth(0);
    await expect(first.getByRole("link")).toHaveCount(1);
    await expect(first.getByRole("link")).toHaveText(`${marker} n°6`);
    await expect(first.getByRole("link")).toHaveAttribute("href", `/documents/${created[6]}`);
    await expect(first).toContainText(`${texts.categories.faq} · ${account.email.split("@")[0]}`);
    await expect(first).toContainText(texts.status.ready);
    await expect(items(page).nth(1)).toContainText(`· ${other.email.split("@")[0]}`);
    await expect(items(page).nth(1)).toContainText(texts.status.error);
    await expect(items(page).nth(4)).toContainText(texts.status.error);
    for (let index = 0; index < 5; index += 1) await expect(items(page).nth(index).getByRole("link")).toHaveCount(1);

    await expect(addAction(page)).toHaveAttribute("href", "/ajouter");
    await expect(section(page).getByRole("link", { name: texts.dashboard.seeLibrary })).toHaveAttribute("href", "/bibliotheque");
    await expect(page.getByRole("main").getByRole("button", { name: /poser une question/i })).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("link", { name: /poser une question/i })).toHaveCount(0);

    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toContain("content_text");
      expect(body).not.toContain(secret);
    }

    const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
    expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  } finally {
    await deleteAccount(other);
  }
});

test("ajout d'un collègue : son Document passe en tête au prochain affichage", async ({ page, account }) => {
  const other = await createAccount("e2e-tdb-collegue");
  const marker = tag();
  try {
    const mine = await insertDocument(account, { title: `${marker} le mien`, at: future() });
    await page.goto("/");
    await expect(items(page).first()).toHaveAttribute("data-document-id", mine);

    const theirs = await insertDocument(other, { title: `${marker} du collègue`, category: "procedure", at: future() });
    await page.goto("/");
    await expect(items(page).first()).toHaveAttribute("data-document-id", theirs);
    await expect(items(page).first()).toContainText(texts.categories.procedure);
    await expect(items(page).nth(1)).toHaveAttribute("data-document-id", mine);
  } finally {
    await deleteAccount(other);
  }
});

test("activer un élément ouvre le Document ; « Voir la Bibliothèque » ouvre la Bibliothèque", async ({ page, account }) => {
  const marker = tag();
  const id = await insertDocument(account, { title: `${marker} à ouvrir`, at: future() });
  await page.goto("/");
  const link = items(page).first().getByRole("link", { name: `${marker} à ouvrir` });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/documents/${id}$`));
  await expect(page.getByRole("heading", { level: 1, name: `${marker} à ouvrir` })).toBeVisible();

  await page.goto("/");
  // Clic sur le badge, hors du lien : la zone du lien couvre tout l'élément.
  const badge = await items(page).first().getByText(texts.status.ready).boundingBox();
  if (!badge) throw new Error("Badge invisible");
  await page.mouse.click(badge.x + badge.width / 2, badge.y + badge.height / 2);
  await expect(page).toHaveURL(new RegExp(`/documents/${id}$`));

  await page.goto("/");
  await section(page).getByRole("link", { name: texts.dashboard.seeLibrary }).click();
  await expect(page).toHaveURL(/\/bibliotheque$/);
  await expect(page.getByRole("heading", { level: 1, name: texts.titles.library })).toBeVisible();
});

test("bande d'actions hors de la frontière de la liste : envoyée avant le squelette, « Ajouter un Document » utilisable", async ({
  page,
  account,
}) => {
  await insertDocument(account, { title: `${tag()} flux`, at: future() });
  // Réponse HTML brute : la liste, lue à la requête, arrive après coup ; la bande d'actions la précède,
  // hors du contenu de repli de la frontière Suspense de la liste.
  const html = await (await page.request.get("/")).text();
  const band = html.indexOf("data-action-band");
  const skeleton = html.indexOf("data-skeleton-rows");
  expect(band).toBeGreaterThan(-1);
  expect(skeleton).toBeGreaterThan(band);
  expect(html.slice(band, skeleton)).not.toContain("/documents/");

  await page.goto("/");
  await addAction(page).click();
  await expect(page).toHaveURL(/\/ajouter$/);
});

test("375 px : bande empilée, bouton pleine largeur, titres longs sans défilement horizontal", async ({ page, account }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const marker = tag();
  await insertDocument(account, { title: `${marker}${"Motsansespace".repeat(14)}`, category: "client_report", at: future() });
  await insertDocument(account, {
    title: `${marker} https://exemple.test/${"chemin/".repeat(20)}`,
    category: "business_resource",
    status: "processing",
    at: future(),
  });
  await page.goto("/");
  await expect(items(page)).toHaveCount(5);
  await expect(items(page).first()).toContainText(marker);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  const button = await addAction(page).boundingBox();
  const band = await page.locator("[data-action-band]").boundingBox();
  if (!button || !band) throw new Error("Bande d'actions invisible");
  expect(Math.round(button.width)).toBe(Math.round(band.width));

  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
