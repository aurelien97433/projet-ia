import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { FAKE_SUMMARY_FAILURE_MARKER, FAKE_SUMMARY_SLOW_MARKER } from "../../supabase/functions/_shared/fake-generation";
import { createAccount, deleteAccount, expect, test, type Account } from "../support/e2e-auth";
import { localSqlRows, localSupabase } from "../support/local-supabase";

// Résumé de la page Document (story 6.1, E7), contre Supabase local avec la génération simulée (fonction
// summarize servie par l'edge runtime local) : génération au clavier, état « Génération du Résumé… »,
// Résumé au-dessus du texte avec la mention, annonce, rechargement sans bouton, autre Collaborateur sans
// appel ni quota, Document non prêt, quota atteint au chargement, panne avec « Réessayer » ; axe sans
// violation. Chaque test tourne aux deux largeurs (1 280 px et 375 px).
test.use({ storageState: async ({ authState }, provide) => provide(authState), timezoneId: "Europe/Paris" });

const t = texts.summary;
const admin = () => createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });
const DAY = "(now() at time zone 'utc')::date";

async function insertDocument(account: Account, content: string, status = "ready"): Promise<string> {
  const { data, error } = await admin()
    .from("documents")
    .insert({
      author_id: account.id,
      title: `Résumé ${crypto.randomUUID()}`,
      category: "procedure",
      content_text: content,
      status,
      client_request_id: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  return data.id;
}

const usage = (accountId: string): number =>
  Number(Object.values(localSqlRows(`select coalesce((select count from public.ai_usage where user_id = '${accountId}' and day_utc = ${DAY}), 0) as value`)[0] ?? { v: 0 })[0] ?? 0);
const setUsage = (accountId: string, count: number) =>
  localSqlRows(
    `insert into public.ai_usage (user_id, day_utc, count) values ('${accountId}', ${DAY}, ${count}) on conflict (user_id, day_utc) do update set count = ${count}`,
  );

const generateButton = (page: Page) => page.getByRole("button", { name: new RegExp(`^(${t.generate}|${t.generating})$`) });
const summaryBlock = (page: Page) => page.locator("[data-summary-block]");
const announcer = (page: Page) => page.locator('p[role="status"].sr-only');
const reader = (page: Page) => page.getByRole("region", { name: texts.document.textLabel });

async function expectNoAxeViolation(page: Page) {
  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations).toEqual([]);
}

test("Document prêt : « Générer le Résumé » au clavier, « Génération du Résumé… » en aria-disabled, Résumé au-dessus du texte avec la mention, annonce, compteur +1 ; rechargement : même Résumé, sans bouton ; axe", async ({
  page,
  account,
}) => {
  const id = await insertDocument(account, `La procédure prévoit une validation par le responsable. ${FAKE_SUMMARY_SLOW_MARKER}`);
  const before = usage(account.id);
  await page.goto(`/documents/${id}`);
  await expect(generateButton(page)).toHaveText(t.generate);
  await expectNoAxeViolation(page);

  await generateButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(generateButton(page)).toHaveText(t.generating);
  await expect(generateButton(page)).toHaveAttribute("aria-disabled", "true");

  await expect(summaryBlock(page)).toBeVisible({ timeout: 30_000 });
  await expect(summaryBlock(page).getByRole("listitem")).toHaveCount(3);
  await expect(summaryBlock(page)).toContainText(t.mention(new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })));
  await expect(announcer(page)).toHaveText(t.generated);
  await expect(page.getByRole("button", { name: t.generate })).toHaveCount(0);
  // Focus passé au bloc Résumé (le bouton a disparu).
  await expect(summaryBlock(page)).toBeFocused();
  // Au-dessus du texte du Document.
  const blockBottom = (await summaryBlock(page).boundingBox())!.y;
  const readerTop = (await reader(page).boundingBox())!.y;
  expect(blockBottom).toBeLessThan(readerTop);
  // Aucun défilement horizontal à 375 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(usage(account.id)).toBe(before + 1);
  await expectNoAxeViolation(page);

  const points = await summaryBlock(page).getByRole("listitem").allTextContents();
  await page.reload();
  await expect(summaryBlock(page).getByRole("listitem")).toHaveText(points);
  await expect(page.getByRole("button", { name: t.generate })).toHaveCount(0);
  expect(usage(account.id)).toBe(before + 1);
});

test("Résumé déjà généré par un autre Collaborateur : affiché d'emblée, sans bouton, sans appel ni quota", async ({ page, account }) => {
  const author = await createAccount("e2e-resume-auteur");
  try {
    const id = await insertDocument(author, "La FAQ indique un remboursement sous 10 jours ouvrés.");
    const { error } = await admin().rpc("store_summary", {
      p_document_id: id,
      p_text_version: 1,
      p_points: ["La FAQ indique un remboursement sous 10 jours ouvrés."],
    });
    expect(error).toBeNull();
    const before = usage(account.id);
    const calls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/summary")) calls.push(request.url());
    });
    await page.goto(`/documents/${id}`);
    await expect(summaryBlock(page).getByRole("listitem")).toHaveText(["La FAQ indique un remboursement sous 10 jours ouvrés."]);
    await expect(page.getByRole("button", { name: t.generate })).toHaveCount(0);
    expect(calls).toEqual([]);
    expect(usage(account.id)).toBe(before);
  } finally {
    await deleteAccount(author);
  }
});

test("Document en cours de traitement : pas de bouton, « Le Résumé sera disponible quand le Document sera prêt. »", async ({ page, account }) => {
  const id = await insertDocument(account, "Texte en cours de traitement.", "processing");
  await page.goto(`/documents/${id}`);
  await expect(page.getByText(t.notReady)).toBeVisible();
  await expect(page.getByRole("button", { name: t.generate })).toHaveCount(0);
});

test("quota atteint au chargement : bloc neutre avec l'heure locale, bouton en aria-disabled décrit par le bloc, aucun appel ; axe", async ({
  page,
  account,
}) => {
  const id = await insertDocument(account, "Texte d'un Document prêt.");
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/summary")) calls.push(request.url());
  });
  setUsage(account.id, 60);
  try {
    await page.goto(`/documents/${id}`);
    const block = page.locator("[data-summary-quota]");
    await expect(block).toContainText("Vous avez atteint votre limite quotidienne de questions et de Résumés. Elle sera rétablie");
    await expect(block).not.toContainText("(UTC)");
    await expect(generateButton(page)).toHaveAttribute("aria-disabled", "true");
    const describedBy = await generateButton(page).getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(await block.innerText());
    await generateButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(generateButton(page)).toBeFocused();
    expect(calls).toEqual([]);
    await expectNoAxeViolation(page);
  } finally {
    setUsage(account.id, 0);
  }
});

test("panne du fournisseur simulée : « Le Résumé n'a pas pu être généré. » avec « Réessayer », focus sur l'alerte, unité rendue", async ({
  page,
  account,
}) => {
  const id = await insertDocument(account, `Texte du Document. ${FAKE_SUMMARY_FAILURE_MARKER}`);
  const before = usage(account.id);
  await page.goto(`/documents/${id}`);
  await generateButton(page).focus();
  await page.keyboard.press("Enter");
  const alert = page.locator("[data-error-alert]");
  await expect(alert).toContainText(t.failed, { timeout: 30_000 });
  await expect(alert).toBeFocused();
  await expect(alert.getByRole("button", { name: t.retry })).toBeVisible();
  expect(usage(account.id)).toBe(before);
  await expectNoAxeViolation(page);
});
