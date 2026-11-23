import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { createAccount, deleteAccount, isDesktop } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";
import {
  chooseOptionByTyping,
  cleanupMarkedDocuments,
  liveCredentials,
  loadUj2Journey,
  localNoteAndQuestion,
  openLiveSession,
  pasteInto,
  press,
  readDailyUsage,
  typeInto,
  uj2EmptyFileTitle,
  uj2Stamp,
  uj2Title,
} from "./support/uj2";

// Parcours UJ-2 de bout en bout (story 6.2), au clavier seul (focus posé puis Tab, Entrée, Espace,
// Échap, flèches ; aucun clic) : connexion → ajout de la Note Dorval → prêt → question → Source →
// page complète → Résumé → compteur +2 → suppression → .txt vide en erreur → suppression.
// Deux modes, même fichier :
// - local (npm run test:e2e, deux largeurs) : pile locale, vectorisation et génération simulées,
//   Compte temporaire ; seule la Source de la réponse est vérifiée (réponse simulée) ;
// - production (npm run test:uj2:live, playwright.live.config.ts) : vraie IA, Compte de mesure 1 de
//   .env.seed, question u1 du Jeu ; trace, vidéo et captures désactivées.
// Nettoyage garanti, avec la session du Compte (jamais service_role) : tout Document du Compte dont le
// titre contient « — test UJ-2 », après chaque exécution, à la fin du worker et en cas d'échec.

type Uj2Session = {
  live: boolean;
  email: string;
  password: string;
  userId: string;
  client: SupabaseClient;
  supabaseHost: string | null;
};

const test = base.extend<object, { uj2: Uj2Session }>({
  uj2: [
    async ({}, provide, workerInfo) => {
      const live = workerInfo.config.metadata?.uj2Live === true;
      let session: Uj2Session;
      let release: () => Promise<void>;
      if (live) {
        const credentials = liveCredentials();
        const opened = await openLiveSession(credentials);
        console.log(`test:uj2:live — projet Supabase : ${opened.target.host}`);
        session = {
          live,
          email: credentials.email,
          password: credentials.password,
          userId: opened.userId,
          client: opened.client,
          supabaseHost: opened.target.host,
        };
        release = async () => {
          await opened.client.auth.signOut().catch(() => {});
        };
      } else {
        const account = await createAccount("e2e-uj2");
        const { url, publishableKey } = localSupabase();
        const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const signIn = await client.auth.signInWithPassword({ email: account.email, password: account.password });
        if (signIn.error) throw new Error(`Session du Compte temporaire refusée (${signIn.error.code}).`);
        session = { live, email: account.email, password: account.password, userId: account.id, client, supabaseHost: null };
        release = async () => {
          await deleteAccount(account);
        };
      }
      try {
        await provide(session);
      } finally {
        // Nettoyage en fin de worker, y compris après un échec.
        const remaining = await cleanupMarkedDocuments(session.client, session.userId);
        await release();
        if (remaining !== 0) throw new Error(`${remaining} Document(s) « — test UJ-2 » restant(s) après nettoyage.`);
      }
    },
    { scope: "worker", timeout: 120_000 },
  ],
});

// Nettoyage après chaque exécution (réussie ou non) et à la fin, puis contrôle : aucun Document marqué.
async function cleanupAndCheck(uj2: Uj2Session) {
  expect(await cleanupMarkedDocuments(uj2.client, uj2.userId)).toBe(0);
}
test.afterEach(async ({ uj2 }) => cleanupAndCheck(uj2));
test.afterAll(async ({ uj2 }) => cleanupAndCheck(uj2));

const DOCUMENT_URL = /\/documents\/([0-9a-f-]{36})$/;
const a = texts.addDocument;
const s = texts.summary;
const d = texts.deleteDocument;

const addLink = (page: Page) => page.locator('a[href="/ajouter"]:visible').first();
const metadata = (page: Page) => page.locator("main dl");
const banner = (page: Page) => page.locator('main article > [role="status"]');
const documentActions = (page: Page) => page.getByRole("group", { name: texts.document.actionsLabel });
const thread = (page: Page) => page.getByRole("list", { name: texts.assistant.threadLabel });
const answerRegion = (page: Page) => thread(page).locator('[role="status"]');
const sourceChip = (page: Page, title: string) => page.locator("[data-source-chip] button").filter({ hasText: title }).first();
const sourcePanel = (page: Page, title: string): Locator =>
  isDesktop(page) ? page.getByRole("complementary", { name: title }) : page.getByRole("dialog", { name: title });
const summaryBlock = (page: Page) => page.locator("[data-summary-block]");

function expectNoForbiddenTerm(text: string, terms: string[]) {
  for (const term of terms) expect(text, `terme interdit « ${term} »`).not.toContain(term);
}

// Suppression depuis le bouton donné : dialogue de confirmation, focus sur « Annuler », confirmation
// au clavier, retour à la Bibliothèque sans le Document ; son URL affiche E9.
async function deleteThroughDialog(page: Page, trigger: Locator, title: string, documentPath: string) {
  await press(page, trigger);
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(d.title(title));
  await expect(dialog.getByRole("button", { name: d.cancel })).toBeFocused();
  await press(page, dialog.getByRole("button", { name: d.confirm, exact: true }));
  await expect(page).toHaveURL(/\/bibliotheque$/, { timeout: 30_000 });
  await expect(page.getByText(d.done)).toBeVisible();
  await expect(page.locator("main").getByRole("link", { name: title })).toHaveCount(0);
  await page.goto(documentPath);
  await expect(page.getByRole("heading", { level: 1, name: texts.notFound.title })).toBeVisible();
}

test("UJ-2 au clavier : Note Dorval prête, question sourcée, Source, page complète, Résumé, compteur +2, suppression ; .txt vide en erreur puis supprimé", async ({
  page,
  uj2,
}, testInfo) => {
  test.setTimeout(uj2.live ? 300_000 : 120_000);
  const journey = loadUj2Journey();
  const stamp = uj2Stamp();
  const title = uj2Title(stamp);
  const marker = `uj2${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const local = localNoteAndQuestion(journey.note, marker);
  const note = uj2.live ? journey.note : local.note;
  const question = uj2.live ? journey.u1.question : local.question;
  const categoryLabel = texts.categories[journey.category as keyof typeof texts.categories];

  const before = await readDailyUsage(uj2.client, uj2.userId);
  const measures: Record<string, unknown> = { before, after: null, processingSeen: null, supabaseHost: uj2.supabaseHost };
  let documentPath = "";

  try {
    await test.step("1. Connexion", async () => {
      await page.goto("/connexion");
      await page.waitForLoadState("networkidle");
      await typeInto(page, page.locator("#email"), uj2.email);
      const password = page.locator("#password");
      await typeInto(page, password, uj2.password);
      await page.keyboard.press("Enter");
      try {
        await expect(page).not.toHaveURL(/\/connexion/, { timeout: 30_000 });
      } catch (error) {
        // Connexion refusée : champ vidé avant l'instantané de la page joint à l'échec (error-context).
        await password.clear().catch(() => {});
        throw error;
      }
      await expect(page.getByRole("heading", { level: 1, name: texts.titles.dashboard })).toBeVisible();
    });

    await test.step("2. Ajout de la Note", async () => {
      await press(page, addLink(page));
      await expect(page).toHaveURL(/\/ajouter$/);
      await expect(page.getByRole("tab", { name: a.noteTab })).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#title")).toBeFocused();
      await page.keyboard.type(title);
      await chooseOptionByTyping(page, page.locator("#category"), categoryLabel);
      await expect(page.locator("#category")).toHaveValue(journey.category);
      await pasteInto(page, page.locator("#content"), note);
      await press(page, page.getByRole("button", { name: a.submit, exact: true }));

      await expect(page).toHaveURL(DOCUMENT_URL, { timeout: 30_000 });
      documentPath = new URL(page.url()).pathname;
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(metadata(page).getByText(categoryLabel, { exact: true })).toBeVisible();
      const { data: profile, error } = await uj2.client.from("profiles").select("display_name").eq("id", uj2.userId).single();
      expect(error).toBeNull();
      await expect(metadata(page).getByText(String(profile?.display_name), { exact: true })).toBeVisible();
    });

    await test.step("3. Traitement jusqu'à « prêt »", async () => {
      // Badge et bandeau lus ensemble : le traitement réel peut finir avant toute observation.
      const snapshot = await page.evaluate(() => ({
        badge: document.querySelector("main dl")?.textContent ?? "",
        banner: document.querySelector('main article > [role="status"]')?.textContent ?? "",
      }));
      const processingSeen = snapshot.badge.includes(texts.status.processing);
      measures.processingSeen = processingSeen;
      if (processingSeen) expect(snapshot.banner).toContain(texts.documentStatus.processingTitle);
      await expect(metadata(page).getByText(texts.status.ready)).toBeVisible({ timeout: 60_000 });
      await expect(metadata(page)).not.toContainText(texts.status.error);
      await expect(banner(page)).not.toContainText(texts.documentStatus.temporaryAuthor);
      await expect(page.getByText(texts.documentStatus.retry)).toHaveCount(0);
    });

    await test.step("4. Question à l'Assistant", async () => {
      // Nouvelle Conversation depuis la page du Document (« Poser une question »).
      await press(page, documentActions(page).getByRole("link", { name: texts.assistant.askQuestion }));
      await expect(page).toHaveURL(/\/assistant$/);
      const field = page.getByRole("textbox", { name: texts.assistant.fieldLabel });
      await expect(field).toBeFocused();
      await page.keyboard.type(question);
      await page.keyboard.press("Enter");
      await expect(sourceChip(page, title)).toBeVisible({ timeout: uj2.live ? 90_000 : 30_000 });
      await expect(answerRegion(page).getByRole("list", { name: texts.assistant.sourcesLabel })).toContainText(title);
      if (uj2.live) {
        const answer = answerRegion(page).locator("[data-answer]");
        await expect(answer).toContainText(journey.u1.expected);
        expectNoForbiddenTerm((await answer.textContent()) ?? "", journey.forbiddenTerms);
      }
    });

    await test.step("5. Source et page complète", async () => {
      const chip = sourceChip(page, title);
      await press(page, chip);
      const panel = sourcePanel(page, title);
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("heading", { name: title })).toBeFocused();
      await expect(panel.locator("mark.passage-highlight")).toContainText(journey.u1.expected);
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(chip).toBeFocused();

      await page.keyboard.press("Enter");
      await expect(sourcePanel(page, title)).toBeVisible();
      await press(page, sourcePanel(page, title).getByRole("link", { name: texts.sourcePanel.openFullPage }));
      await expect(page).toHaveURL(new RegExp(`${documentPath}\\?passages=`), { timeout: 30_000 });
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.locator("main mark.passage-highlight:visible")).toContainText(journey.u1.expected);
    });

    await test.step("6. Résumé", async () => {
      // Demande retenue le temps d'observer « Génération du Résumé… » (simulation locale instantanée).
      let releaseSummary!: () => void;
      const gate = new Promise<void>((resolve) => (releaseSummary = resolve));
      await page.route("**/api/documents/*/summary", async (route) => {
        await gate;
        await route.continue();
      });
      await press(page, page.getByRole("button", { name: s.generate, exact: true }));
      const busy = page.getByRole("button", { name: s.generating, exact: true });
      await expect(busy).toBeVisible();
      await expect(busy).toHaveAttribute("aria-disabled", "true");
      releaseSummary();

      const points = summaryBlock(page).getByRole("listitem");
      await expect(points.first()).toBeVisible({ timeout: uj2.live ? 135_000 : 30_000 });
      const count = await points.count();
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(5);
      await expect(summaryBlock(page)).toContainText(s.mention("").replace(/ · $/, ""));
      await expect(page.locator('p[role="status"].sr-only', { hasText: s.generated })).toHaveText(s.generated);
      if (uj2.live) expectNoForbiddenTerm((await points.allTextContents()).join("\n"), journey.forbiddenTerms);
      await page.unroute("**/api/documents/*/summary");
    });

    await test.step("7. Compteur du jour", async () => {
      const after = await readDailyUsage(uj2.client, uj2.userId);
      measures.after = after;
      // Une question et un Résumé : +2 exactement.
      expect(after - before).toBe(2);
    });

    await test.step("8. Suppression du Document", async () => {
      await deleteThroughDialog(page, documentActions(page).getByRole("button", { name: d.action, exact: true }), title, documentPath);
    });

    await test.step("9. Cas limite : .txt vide", async () => {
      const emptyTitle = uj2EmptyFileTitle(stamp);
      await page.goto("/bibliotheque");
      await press(page, addLink(page));
      await expect(page).toHaveURL(/\/ajouter$/);
      await expect(page.locator("#title")).toBeFocused();
      await press(page, page.getByRole("tab", { name: a.noteTab }), "ArrowRight");
      await expect(page.getByRole("tab", { name: a.fileTab })).toHaveAttribute("aria-selected", "true");
      const chooser = page.waitForEvent("filechooser");
      await press(page, page.getByRole("button", { name: a.chooseFile }));
      await (await chooser).setFiles(journey.emptyFile);
      await expect(page.locator("#file-message")).toHaveText(a.uploaded("vide.txt"), { timeout: 30_000 });
      await typeInto(page, page.locator("#file-title"), emptyTitle);
      await chooseOptionByTyping(page, page.locator("#file-category"), categoryLabel);
      await expect(page.locator("#file-category")).toHaveValue(journey.category);
      await press(page, page.getByRole("button", { name: a.importSubmit, exact: true }));

      await expect(page).toHaveURL(DOCUMENT_URL, { timeout: 30_000 });
      const emptyPath = new URL(page.url()).pathname;
      await expect(page.getByRole("heading", { level: 1, name: emptyTitle })).toBeVisible();
      await expect(banner(page)).toContainText(texts.documentStatus.noText, { timeout: 60_000 });
      await expect(metadata(page).getByText(texts.status.error)).toBeVisible();
      await deleteThroughDialog(page, banner(page).getByRole("button", { name: d.action, exact: true }), emptyTitle, emptyPath);
    });
  } finally {
    await testInfo.attach("uj2-mesures", { body: JSON.stringify(measures), contentType: "application/json" });
  }
});
