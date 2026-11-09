import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page, Request } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { createAccount, deleteAccount, expect, test, type Account } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Page Document complète (E7), contre Supabase local : Passages de l'URL, focus, message collant,
// paramètres hostiles, E9, autre Auteur, 375 px et chargement. Chaque test tourne aux deux largeurs.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });

const t = texts.reader;
const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

// Assez long pour que le Passage ne soit visible qu'après défilement, aux deux largeurs.
const LINES = Array.from({ length: 400 }, (_, index) => `Ligne ${index} du Document de démonstration.`);
const TEXT = LINES.join("\n");

function rangeOf(line: number): string {
  const start = TEXT.indexOf(LINES[line]);
  return `${start}-${start + LINES[line].length}`;
}

async function insertDocument(account: Account, content = TEXT): Promise<string> {
  const { data, error } = await admin()
    .from("documents")
    .insert({
      author_id: account.id,
      title: `Page ${crypto.randomUUID()}`,
      category: "faq",
      content_text: content,
      status: "ready",
      client_request_id: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  return data.id;
}

const activeMark = (page: Page) => page.locator("mark.passage-highlight");
const reader = (page: Page) => page.getByRole("region", { name: texts.document.textLabel });
const notice = (page: Page) => reader(page).getByRole("status");
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const routerPush = (page: Page, url: string) =>
  page.evaluate((target) => (window as unknown as { next: { router: { push(url: string): void } } }).next.router.push(target), url);

// Bas de la barre du haut (absente à partir de 1 024 px).
const topBarBottom = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>("header.sticky");
    return bar && bar.offsetParent !== null ? bar.getBoundingClientRect().bottom : 0;
  });

// Entièrement visible, sous la barre du haut, et réellement au premier plan à cet endroit.
async function expectFullyVisible(page: Page) {
  const barBottom = await topBarBottom(page);
  const { top, bottom, viewport, onTop } = await activeMark(page).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight, onTop: hit === element };
  });
  expect(top).toBeGreaterThanOrEqual(barBottom);
  expect(bottom).toBeLessThanOrEqual(viewport);
  expect(onTop).toBe(true);
}

test("sans paramètre : Lecteur sans Passage, aucun message, aucun défilement", async ({ page, account }) => {
  const id = await insertDocument(account);
  await page.goto(`/documents/${id}`);
  await expect(reader(page)).toContainText(LINES[399]);
  await expect(reader(page).locator("mark")).toHaveCount(0);
  await expect(notice(page)).toBeEmpty();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("URL valide : Passages surlignés, le second actif, focalisé et entièrement visible", async ({ page, account }) => {
  const id = await insertDocument(account);
  await page.goto(`/documents/${id}?passages=${rangeOf(5)},${rangeOf(250)}&actif=1`);
  await expect(reader(page).locator("mark")).toHaveCount(2);
  await expect(activeMark(page)).toHaveText(LINES[250]);
  await expect(activeMark(page)).toBeFocused();
  await expect(reader(page)).toContainText("Passage utilisé 2 sur 2");
  await expect(notice(page)).toBeEmpty();
  await expectFullyVisible(page);
  await expect(heading(page)).not.toBeFocused();
});

test("Passage plus haut que l'écran : son début reste visible sous la barre", async ({ page, account }) => {
  const id = await insertDocument(account);
  const start = TEXT.indexOf(LINES[100]);
  const end = TEXT.indexOf(LINES[300]);
  await page.goto(`/documents/${id}?passages=${start}-${end}`);
  await expect(activeMark(page)).toBeFocused();
  const barBottom = await topBarBottom(page);
  const top = await activeMark(page).evaluate((element) => element.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(barBottom);
  expect(top).toBeLessThan(await page.evaluate(() => window.innerHeight));
});

test("arrivée par navigation interne : le focus va au Passage, jamais au titre", async ({ page, account }) => {
  const id = await insertDocument(account);
  await page.goto("/bibliotheque");
  await routerPush(page, `/documents/${id}?passages=${rangeOf(250)}`);
  await expect(activeMark(page)).toBeFocused({ timeout: 15_000 });
  await expectFullyVisible(page);
});

test("arrivée par navigation interne sans Passage : le focus va au titre", async ({ page, account }) => {
  const id = await insertDocument(account);
  await page.goto("/bibliotheque");
  // Un premier écran monté : le premier chargement est décompté, le suivant est un changement d'écran.
  await routerPush(page, "/recherche");
  await expect(page.getByRole("heading", { level: 1, name: texts.titles.search })).toBeVisible({ timeout: 15_000 });
  await routerPush(page, `/documents/${id}`);
  await expect(reader(page)).toBeVisible({ timeout: 15_000 });
  await expect(heading(page)).toBeFocused();
});

test("élément invalide : message en tête, collant, relié au Passage actif, qui reste visible", async ({ page, account }) => {
  const id = await insertDocument(account);
  await page.goto(`/documents/${id}?passages=abc,${rangeOf(250)}&actif=1`);
  await expect(activeMark(page)).toHaveText(LINES[250]);
  await expect(activeMark(page)).toBeFocused();
  await expect(reader(page).locator("mark")).toHaveCount(1);
  await expect(reader(page)).toContainText("Passage utilisé 1 sur 1");
  await expect(notice(page)).toHaveText(t.somePassagesMissing);
  await expect(activeMark(page)).toHaveAccessibleDescription(t.somePassagesMissing);

  const barBottom = await topBarBottom(page);
  const noticeBox = async () => notice(page).evaluate((element) => element.getBoundingClientRect().toJSON() as DOMRect);
  await expectFullyVisible(page);
  expect((await noticeBox()).top).toBeCloseTo(barBottom, 0);
  const markTop = await activeMark(page).evaluate((element) => element.getBoundingClientRect().top);
  expect(markTop).toBeGreaterThanOrEqual((await noticeBox()).bottom);

  await page.mouse.wheel(0, 400);
  await expect.poll(async () => (await noticeBox()).top).toBeCloseTo(barBottom, 0);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("Passage au-dessus d'un long texte, Passage suivant manquant : le début reste sous le message", async ({ page, account }) => {
  const id = await insertDocument(account);
  const start = TEXT.indexOf(LINES[100]);
  const end = TEXT.indexOf(LINES[300]);
  await page.goto(`/documents/${id}?passages=abc,${start}-${end}&actif=1`);
  await expect(activeMark(page)).toBeFocused();
  const noticeBottom = await notice(page).evaluate((element) => element.getBoundingClientRect().bottom);
  const top = await activeMark(page).evaluate((element) => element.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(noticeBottom);
});

test.describe("paramètres hostiles : texte seul, message, focus jamais sur un Passage", () => {
  const tooMany = Array.from({ length: 21 }, (_, index) => `${index * 2}-${index * 2 + 1}`).join(",");
  for (const [label, query] of [
    ["position hors du texte", "passages=9999999-9999999"],
    ["21 éléments", `passages=${tooMany}`],
    ["paramètre répété", "passages=a&passages=b"],
    ["balisage", `passages=${encodeURIComponent("<script>window.__piege=1</script>")}`],
    ["trop de chiffres", "passages=12345678-12345679"],
  ] as const) {
    test(label, async ({ page, account }) => {
      const dialogs: string[] = [];
      page.on("dialog", async (dialog) => {
        dialogs.push(dialog.message());
        await dialog.dismiss();
      });
      const id = await insertDocument(account);
      await page.goto(`/documents/${id}?${query}`);
      await expect(notice(page)).toHaveText(t.allPassagesMissing);
      await expect(reader(page).locator("mark")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("__piege");
      expect(await page.evaluate(() => "__piege" in window)).toBe(false);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("MARK");
      expect(dialogs).toEqual([]);
    });
  }
});

test.describe("actif invalide : premier Passage retrouvé actif", () => {
  for (const actif of ["x", "-1", "99"]) {
    test(`actif=${actif}`, async ({ page, account }) => {
      const id = await insertDocument(account);
      await page.goto(`/documents/${id}?passages=${rangeOf(10)},${rangeOf(20)}&actif=${actif}`);
      await expect(activeMark(page)).toHaveText(LINES[10]);
      await expect(activeMark(page)).toBeFocused();
      await expect(notice(page)).toBeEmpty();
    });
  }
});

test("Document inconnu ou mal formé : même page E9, Passages ignorés", async ({ page }) => {
  const contents: string[] = [];
  for (const id of ["abc", crypto.randomUUID()]) {
    await page.goto(`/documents/${id}?passages=0-10&actif=0`);
    await expect(page.getByRole("heading", { level: 1, name: texts.notFound.title })).toBeVisible();
    await expect(page.locator("mark")).toHaveCount(0);
    contents.push(await page.locator("body").innerText());
  }
  expect(contents[0]).toBe(contents[1]);
});

test("autre Auteur : informations et Lecteur, aucune action d'Auteur", async ({ page }) => {
  const other = await createAccount("e2e-auteur-page");
  try {
    const id = await insertDocument(other, "Texte du Document de l'autre Auteur.");
    const { data } = await admin().from("documents_list").select("title, author_name").eq("id", id).single();

    await page.goto(`/documents/${id}`);
    await expect(heading(page)).toHaveText(data?.title ?? "");
    const metadata = page.locator("main dl");
    await expect(metadata).toContainText(texts.categories.faq);
    await expect(metadata).toContainText(data?.author_name ?? "");
    await expect(metadata).toContainText(texts.document.addedOnLabel);
    await expect(metadata.getByText(texts.status.ready)).toBeVisible();
    await expect(page.locator('main article > [role="status"]')).toBeEmpty();
    await expect(reader(page)).toContainText("Texte du Document de l'autre Auteur.");
    await expect(page.locator("main article").getByRole("button")).toHaveCount(0);
  } finally {
    await deleteAccount(other);
  }
});

test.describe("à 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("métadonnées empilées, aucun défilement horizontal, y compris avec le message", async ({ page, account }) => {
    const id = await insertDocument(account);
    await page.goto(`/documents/${id}?passages=abc,${rangeOf(250)}&actif=1`);
    await expect(activeMark(page)).toBeFocused();

    const items = await page.locator("main dl > div").evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, bottom: rect.bottom };
      }),
    );
    expect(items).toHaveLength(4);
    for (const [index, item] of items.slice(1).entries()) {
      expect(item.left).toBe(items[index].left);
      expect(item.top).toBeGreaterThanOrEqual(items[index].bottom);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});

test("chargement lent : squelette, puis message à 10 s, et « Réessayer » recharge la page", async ({ page, account }) => {
  test.setTimeout(60_000);
  const id = await insertDocument(account);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  // Seule la requête de navigation est retenue : le préchargement fournit le squelette.
  await page.route(`**/documents/${id}**`, async (route) => {
    const headers = route.request().headers();
    if (headers.rsc && !headers["next-router-prefetch"]) await held;
    await route.continue();
  });
  let loads = 0;
  page.on("load", () => (loads += 1));

  await page.goto("/bibliotheque");
  // Préchargement terminé : au moins une requête du Document vue, plus aucune en cours depuis 500 ms.
  let documentPrefetched = false;
  let prefetching = 0;
  let lastActivity = Date.now();
  const isPrefetch = (request: Request) => "next-router-prefetch" in request.headers();
  page.on("request", (request) => {
    if (!isPrefetch(request)) return;
    prefetching += 1;
    lastActivity = Date.now();
    documentPrefetched ||= request.url().includes(id);
  });
  const prefetchEnded = (request: Request) => {
    if (!isPrefetch(request)) return;
    prefetching -= 1;
    lastActivity = Date.now();
  };
  page.on("requestfinished", prefetchEnded);
  page.on("requestfailed", prefetchEnded);
  await page.evaluate(
    (target) => (window as unknown as { next: { router: { prefetch(url: string): void } } }).next.router.prefetch(target),
    `/documents/${id}`,
  );
  await expect.poll(() => documentPrefetched && prefetching === 0 && Date.now() - lastActivity > 500).toBe(true);
  const startedAt = Date.now();
  await routerPush(page, `/documents/${id}`);

  await expect(page.locator("main .animate-pulse")).toBeVisible();
  const slow = page.getByText(texts.document.loadingSlow);
  await expect(slow).toBeHidden();
  await expect(slow).toBeVisible({ timeout: 12_000 });
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(9_500);
  const retry = page.getByRole("link", { name: texts.document.loadingRetry });

  // Le squelette n'a pas encore de titre : état transitoire, seule cette règle est écartée.
  const results = await new AxeBuilder({ page }).disableRules(["page-has-heading-one"]).analyze();
  expect(results.violations).toEqual([]);

  await retry.click();
  await expect(heading(page)).toBeVisible();
  await expect(reader(page)).toContainText(LINES[0]);
  // L'événement « load » suit la fin du flux, après l'affichage du Lecteur.
  await expect.poll(() => loads).toBe(2);
  release();
});
