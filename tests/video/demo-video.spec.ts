import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { loadUj2Journey, openLiveSession, parseEnvLines, readDailyUsage, readLiveAppUrl, readSeedFile } from "../e2e/support/uj2";
import { VIDEO_DIR } from "./video-dir";

// Vidéo de secours (story 7.5) : UJ-1 à UJ-3 sur la production, Compte de démo A, en moins de 5 min.
// Lancé par npm run demo:video (scripts/demo-video.ts), jamais par la suite e2e ni par Vitest.
// - Mot de passe : jamais tapé (la vidéo montrerait la frappe), jamais journalisé ; posé dans le
//   champ masqué par le navigateur, en une fois. L'e-mail du Compte A est visible, comme dans la
//   démonstration en direct.
// - Unités du Compte A : 7 (q1, c1, h1, question d'UJ-2, Résumé, deux questions d'UJ-3) ; contrôle du
//   quota avant tout appel facturé. Conversations conservées dans l'Historique de A (aucune
//   suppression possible), la Note d'UJ-2 supprimée.
// - Nettoyage garanti de la Note d'UJ-2, même en cas d'échec : par son identifiant, avec la session du
//   Compte A (jamais service_role), et au départ toute Note restante de A au titre exact d'UJ-2.
// - Contenu des réponses vérifié sans arrêter le tournage (expect.soft) : un écart est signalé à la fin,
//   pour décider de garder la vidéo ou de la refaire.

const UNITS = 7;
const PAUSE_MS = 2_000;
const MAX_DURATION_MS = 5 * 60_000;

// Questions du Jeu : q1 dans questions, h1 dans outOfBase, c1 dans contradiction.
type Entry = { id: string; question: string };
const set = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "demo", "jeu-demonstration.json"), "utf8")) as {
  questions: Entry[];
  outOfBase: Entry[];
  contradiction: Entry & { forbiddenTerms: string[] };
};
const question = (list: Entry[], id: string) => {
  const found = list.find((entry) => entry.id === id);
  if (!found) throw new Error(`Question ${id} absente du Jeu.`);
  return found.question;
};
const Q1 = question(set.questions, "q1");
const C1 = question([set.contradiction], "c1");
const H1 = question(set.outOfBase, "h1");
const UJ3_QUERY = "organisation des congés";
const UJ3_FIRST = "Comment poser mes congés ?";
const UJ3_FOLLOW_UP = "Et si je pose moins de 3 jours ?";
const UJ2_TITLE = "Compte rendu client : Pharmacies Dorval";

const t = texts.assistant;
const pause = (page: Page, ms = PAUSE_MS) => page.waitForTimeout(ms);
const field = (page: Page) => page.getByRole("textbox", { name: t.fieldLabel });
const thread = (page: Page) => page.getByRole("list", { name: t.threadLabel });
const replies = (page: Page) => thread(page).locator("[data-answer], [data-refusal]");
const sourceChip = (page: Page, title: string) => page.locator("[data-source-chip] button").filter({ hasText: title }).first();
const lastReply = (page: Page) => replies(page).last();
const navLink = (page: Page, name: string) =>
  page.getByRole("navigation", { name: texts.shell.navigationLabel }).getByRole("link", { name, exact: true }).first();

function demoAccount() {
  const env = parseEnvLines(readSeedFile());
  const missing = ["DEMO_ACCOUNT_A_EMAIL", "DEMO_ACCOUNT_A_PASSWORD"].filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`variables absentes de .env.seed : ${missing.join(", ")}.`);
  return { appUrl: readLiveAppUrl(readSeedFile()), email: env.DEMO_ACCOUNT_A_EMAIL, password: env.DEMO_ACCOUNT_A_PASSWORD };
}

// Pose le mot de passe dans le champ masqué sans frappe visible ni valeur dans un message d'erreur :
// valeur passée au navigateur, puis événement input (formulaire contrôlé par React).
async function setPassword(page: Page, password: string) {
  await page.locator("#password").evaluate((input, value) => {
    const element = input as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, password);
}

async function ask(page: Page, text: string) {
  const before = await replies(page).count();
  await field(page).click();
  await page.keyboard.type(text, { delay: 25 });
  await pause(page, 600);
  await page.keyboard.press("Enter");
  await expect(replies(page)).toHaveCount(before + 1, { timeout: 90_000 });
  await pause(page);
}

async function newConversation(page: Page) {
  await navLink(page, texts.nav.assistant).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page.getByRole("heading", { level: 1, name: texts.titles.assistantEmpty })).toBeVisible();
}

test("vidéo de secours : UJ-1, UJ-2, UJ-3 sur la production, Compte de démo A", async ({ page }) => {
  const account = demoAccount();
  const session = await openLiveSession(account);
  const journey = loadUj2Journey();
  const started = Date.now();
  let createdId: string | null = null;
  let used: number | null = null;

  const removeUj2Notes = async () => {
    // Seulement les Notes de A : celle créée par ce passage, et un reste éventuel au titre exact.
    if (createdId) await session.client.from("documents").delete().eq("author_id", session.userId).eq("id", createdId);
    await session.client.from("documents").delete().eq("author_id", session.userId).eq("title", UJ2_TITLE);
    const { data } = await session.client.from("documents").select("id").eq("author_id", session.userId).eq("title", UJ2_TITLE);
    return (data ?? []).length;
  };

  try {
    // Avant tout appel facturé : aucun reste d'un passage précédent, quota suffisant.
    expect(await removeUj2Notes(), "Note d'UJ-2 restante d'un passage précédent").toBe(0);
    used = await readDailyUsage(session.client, session.userId);
    if (used + UNITS > 60) throw new Error(`quota du Compte A insuffisant : ${used} unités déjà utilisées aujourd'hui (UTC), ${UNITS} nécessaires.`);

    await test.step("UJ-1 : connexion, Tableau de bord, Assistant, Source, contradiction, refus", async () => {
      await page.goto("/connexion");
      await page.waitForLoadState("networkidle");
      await page.locator("#email").click();
      await page.keyboard.type(account.email, { delay: 20 });
      await setPassword(page, account.password);
      await page.locator("#password").press("Enter");
      await expect(page).not.toHaveURL(/\/connexion/, { timeout: 30_000 });
      await expect(page.getByRole("heading", { level: 1, name: texts.titles.dashboard })).toBeVisible();
      await pause(page, 3_000);

      await newConversation(page);
      await ask(page, Q1);
      expect.soft(await sourceChip(page, "Procédure de facturation").isVisible(), "q1 : Source « Procédure de facturation »").toBe(true);
      await sourceChip(page, "Procédure de facturation").click();
      await expect(page.getByRole("complementary", { name: "Procédure de facturation" })).toBeVisible();
      await pause(page, 3_000);
      await page.keyboard.press("Escape");
      await pause(page, 800);

      await newConversation(page);
      await ask(page, C1);
      expect.soft(await sourceChip(page, "FAQ comptabilité").isVisible(), "c1 : Source « FAQ comptabilité »").toBe(true);
      expect.soft(await sourceChip(page, "Note de réunion : finance de mars").isVisible(), "c1 : Source « Note de réunion »").toBe(true);
      await pause(page, 1_500);

      await newConversation(page);
      await ask(page, H1);
      expect.soft(await lastReply(page).getAttribute("data-refusal"), "h1 : refus").not.toBeNull();
    });

    await test.step("UJ-2 : ajout de la Note Dorval, prêt, question, Résumé, suppression", async () => {
      await navLink(page, texts.nav.dashboard).click();
      await page.locator('a[href="/ajouter"]:visible').first().click();
      await expect(page).toHaveURL(/\/ajouter$/);
      await page.locator("#title").click();
      await page.keyboard.type(UJ2_TITLE, { delay: 15 });
      await page.locator("#category").selectOption(journey.category);
      await page.locator("#content").fill(journey.note);
      await pause(page);
      await page.getByRole("button", { name: texts.addDocument.submit, exact: true }).click();
      await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/, { timeout: 30_000 });
      createdId = new URL(page.url()).pathname.split("/").at(-1)!;
      const documentPath = new URL(page.url()).pathname;
      await expect(page.locator("main dl").getByText(texts.status.ready)).toBeVisible({ timeout: 120_000 });
      await pause(page);

      await page.getByRole("group", { name: texts.document.actionsLabel }).getByRole("link", { name: t.askQuestion }).click();
      await expect(page).toHaveURL(/\/assistant$/);
      await ask(page, journey.u1.question);
      expect.soft(await sourceChip(page, UJ2_TITLE).isVisible(), "UJ-2 : Source = la Note ajoutée").toBe(true);
      expect.soft((await lastReply(page).textContent()) ?? "", "UJ-2 : « 72 heures »").toContain(journey.u1.expected);

      await page.goto(documentPath);
      await page.getByRole("button", { name: texts.summary.generate, exact: true }).click();
      const points = page.locator("[data-summary-block]").getByRole("listitem");
      await expect(points.first()).toBeVisible({ timeout: 135_000 });
      const summary = (await points.allTextContents()).join("\n");
      for (const term of set.contradiction.forbiddenTerms) expect.soft(summary, `Résumé sans « ${term} »`).not.toContain(term);
      await pause(page, 3_500);

      await page.getByRole("group", { name: texts.document.actionsLabel }).getByRole("button", { name: texts.deleteDocument.action, exact: true }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await pause(page, 1_200);
      await dialog.getByRole("button", { name: texts.deleteDocument.confirm, exact: true }).click();
      await expect(page).toHaveURL(/\/bibliotheque$/, { timeout: 30_000 });
      await expect(page.getByText(texts.deleteDocument.done)).toBeVisible();
      createdId = null;
      await pause(page);
    });

    await test.step("UJ-3 : Recherche, Assistant avec question de suivi, Historique", async () => {
      await navLink(page, texts.nav.dashboard).click();
      const search = page.getByRole("searchbox", { name: texts.dashboard.searchLabel });
      await search.click();
      await page.keyboard.type(UJ3_QUERY, { delay: 30 });
      await page.keyboard.press("Enter");
      const results = page.getByRole("list", { name: texts.search.resultsLabel }).getByRole("article");
      await expect(results.first()).toBeVisible({ timeout: 30_000 });
      expect.soft(await results.filter({ hasText: "Procédure congés et absences" }).count(), "Recherche : Procédure congés").toBeGreaterThan(0);
      await pause(page, 3_000);

      await newConversation(page);
      await ask(page, UJ3_FIRST);
      await ask(page, UJ3_FOLLOW_UP);
      expect.soft((await lastReply(page).textContent()) ?? "", "suivi : « 5 jours »").toContain("5 jours");

      await page.getByRole("button", { name: texts.history.open, exact: true }).click();
      await expect(page.getByRole("dialog", { name: texts.history.title })).toBeVisible();
      await pause(page, 3_500);
      await page.keyboard.press("Escape");
    });
  } finally {
    const duration = Date.now() - started;
    const remaining = await removeUj2Notes();
    const after = await readDailyUsage(session.client, session.userId).catch(() => null);
    await session.client.auth.signOut().catch(() => {});
    const units = used === null || after === null ? "inconnues" : String(after - used);
    console.log(`demo:video — durée ${Math.round(duration / 1000)} s ; unités consommées : ${units} (${UNITS} prévues) ; Note d'UJ-2 restante : ${remaining}`);
    expect(remaining, "Note d'UJ-2 restante après nettoyage").toBe(0);
    expect.soft(duration, "durée totale de moins de 5 minutes").toBeLessThan(MAX_DURATION_MS);
    // Vidéo copiée hors du dépôt, nommée par l'horodatage (le dossier de travail est vidé à chaque passage).
    const video = page.video();
    await page.close();
    if (video) {
      mkdirSync(VIDEO_DIR, { recursive: true });
      const target = path.join(VIDEO_DIR, `nexamind-demo-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`);
      await video.saveAs(target);
      console.log(`demo:video — vidéo : ${target}`);
    }
  }
});
