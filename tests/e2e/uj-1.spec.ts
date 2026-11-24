import { expect, test, type Locator, type Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { createAccount, deleteAccount, isDesktop, type Account } from "../support/e2e-auth";
import {
  acquireJourneyLock,
  collectRequests,
  deleteDocuments,
  expectBrowserBoundary,
  expectNoAxeViolation,
  expectNoHorizontalScroll,
  journeyTag,
  LOCK_WAIT_MAX_MS,
  openAssistantByNavigation,
  seedReadyDocument,
  waitForHydratedLink,
} from "./support/journeys";
import { press, typeInto } from "./support/uj2";

// Parcours UJ-1 de bout en bout (story 7.3, PRD §2 : relance d'une facture), au clavier seul (focus
// posé puis Entrée, Tab, Échap, frappe ; aucun clic), aux deux largeurs, en mode local : pile locale,
// vectorisation et génération simulées, Compte temporaire. Les Documents « Procédure de facturation »
// et « FAQ comptabilité » sont préchargés pour le test (titres suivis d'un repère ; un seul exemplaire
// du parcours à la fois, par un verrou entre workers). Le Passage de relance a pour vecteur simulé celui
// de la question (similarité 1). Sur chaque écran : axe (WCAG 2 A et AA) ; sur la lecture d'un
// Document et la Conversation : aucun défilement horizontal ; tout le parcours : aucune requête du navigateur vers OpenAI ni /functions/v1/.
// Nettoyage : Documents puis Compte temporaire (ses Conversations partent avec lui), même en cas d'échec.

const QUESTION = "comment je relance un client qui n'a pas payé ?";
const OUT_OF_BASE = "quel est le budget marketing 2027 ?";

const t = texts.assistant;
const h = texts.history;

const field = (page: Page) => page.getByRole("textbox", { name: t.fieldLabel });
const thread = (page: Page) => page.getByRole("list", { name: t.threadLabel });
const answerRegion = (page: Page) => thread(page).locator('[role="status"]');
const sourceChip = (page: Page, title: string) => page.locator("[data-source-chip] button").filter({ hasText: title }).first();
const sourcePanel = (page: Page, title: string): Locator =>
  isDesktop(page) ? page.getByRole("complementary", { name: title }) : page.getByRole("dialog", { name: title });
const historyButton = (page: Page) => page.getByRole("button", { name: h.open, exact: true });
const historyPanel = (page: Page) => page.getByRole("dialog", { name: h.title });

let account: Account | null = null;
const documents: string[] = [];
let releaseLock: (() => void) | null = null;

test.afterEach(async () => {
  try {
    await deleteDocuments(documents.splice(0));
    if (account) await deleteAccount(account);
    account = null;
  } finally {
    releaseLock?.();
    releaseLock = null;
  }
});

test("UJ-1 au clavier : question de relance sourcée, Source ouverte au Passage, Conversation dans l'Historique ; budget 2027 refusé sans Source", async ({
  page,
}) => {
  // Attente du verrou comprise : elle s'ajoute au parcours, sans allonger le délai de ses étapes.
  test.setTimeout(120_000 + LOCK_WAIT_MAX_MS);
  // Verrou partagé avec uj-2.spec.ts (Note Dorval proche de la question du cas limite, étape 5).
  releaseLock = await acquireJourneyLock("uj-1-uj-2");
  account = await createAccount("e2e-uj1");
  const marker = journeyTag();
  const relance =
    "Relance d'un client qui n'a pas payé : envoyer un premier rappel courtois par e-mail sept jours après l'échéance, puis appeler le client à quinze jours.";
  const billing = await seedReadyDocument(account.id, {
    title: `Procédure de facturation ${marker}`,
    category: "procedure",
    sections: [
      // Aucun mot commun avec la question du cas limite (« quel », « est », « le »…) : sous le seuil simulé.
      { text: "Chaque facture part sous cinq jours ouvrés après la livraison, avec son numéro de commande." },
      { text: relance, vectorOf: QUESTION },
    ],
  });
  documents.push(billing.id);
  const faq = await seedReadyDocument(account.id, {
    title: `FAQ comptabilité ${marker}`,
    category: "faq",
    sections: [{ text: "Les notes de frais sont remboursées avec la paie du mois suivant, justificatifs joints." }],
  });
  documents.push(faq.id);
  const requests = collectRequests(page);
  let conversationId = "";

  await test.step("1. Connexion", async () => {
    await page.goto("/connexion");
    await expectNoAxeViolation(page, "la connexion");
    await typeInto(page, page.locator("#email"), account!.email);
    await typeInto(page, page.locator("#password"), account!.password);
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(/\/connexion/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: texts.titles.dashboard })).toBeVisible();
    await expectNoAxeViolation(page, "le Tableau de bord");
  });

  await test.step("2. Nouvelle Conversation depuis le Tableau de bord, question de relance", async () => {
    const ask = page.locator("[data-action-band]").getByRole("link", { name: t.askQuestion, exact: true });
    await waitForHydratedLink(page, "/assistant");
    await press(page, ask);
    await expect(page).toHaveURL(/\/assistant$/);
    await typeInto(page, field(page), QUESTION);
    await page.keyboard.press("Enter");
    await expect(sourceChip(page, billing.title)).toBeVisible({ timeout: 30_000 });
    await expect(answerRegion(page).getByRole("list", { name: t.sourcesLabel })).toContainText(billing.title);
    await expect(answerRegion(page).locator("[data-answer]")).toBeVisible();
    await expect(page).toHaveURL(/\/assistant\/[0-9a-f-]{36}$/);
    conversationId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expectNoAxeViolation(page, "la Conversation");
    await expectNoHorizontalScroll(page, "la Conversation");
  });

  await test.step("3. Source ouverte au clavier, puis page du Document au Passage concerné", async () => {
    const chip = sourceChip(page, billing.title);
    await press(page, chip);
    const panel = sourcePanel(page, billing.title);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: billing.title })).toBeFocused();
    await expect(panel.locator("mark.passage-highlight")).toContainText(relance);
    await expectNoAxeViolation(page, "le panneau Source");
    await press(page, panel.getByRole("link", { name: texts.sourcePanel.openFullPage }));
    await expect(page).toHaveURL(new RegExp(`/documents/${billing.id}\\?passages=`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: billing.title })).toBeVisible();
    await expect(page.locator("main mark.passage-highlight:visible")).toContainText(relance);
    await expectNoAxeViolation(page, "la lecture du Document");
    await expectNoHorizontalScroll(page, "la lecture du Document");
  });

  await test.step("4. Conversation présente dans l'Historique", async () => {
    await openAssistantByNavigation(page, { assistant: texts.nav.assistant, openMenu: texts.shell.openMenu, menuTitle: texts.shell.menuTitle });
    await expect(field(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: texts.titles.assistantEmpty })).toBeVisible();
    await expectNoAxeViolation(page, "l'Assistant vide");
    await press(page, historyButton(page));
    await expect(historyPanel(page)).toBeVisible();
    const row = historyPanel(page).locator(`[data-conversation-id="${conversationId}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link")).toBeVisible();
    await expectNoAxeViolation(page, "l'Historique");
    await expectNoHorizontalScroll(page, "l'Historique");
    await page.keyboard.press("Escape");
    await expect(historyPanel(page)).toHaveCount(0);
    await expect(historyButton(page)).toBeFocused();
  });

  await test.step("5. Cas limite : budget marketing 2027, refus « information absente », aucune Source", async () => {
    // Question exacte de la spec (sans repère) : le refus suppose qu'aucun Passage de la pile locale
    // n'atteint le seuil simulé (0,2) avec elle. Relevé le 2026-11-24 pendant une passe de la suite e2e : seule la
    // Note Dorval d'uj-2.spec.ts l'atteint (0,212), d'où le verrou partagé. Faux aussi si le mini Jeu
    // de démonstration est chargé en même temps (tests d'intégration Vitest lancés en parallèle de la
    // suite e2e) : lancer les deux suites l'une après l'autre.
    await typeInto(page, field(page), OUT_OF_BASE);
    await page.keyboard.press("Enter");
    const refusal = thread(page).locator('[data-refusal="info_absente"]');
    await expect(refusal).toBeVisible({ timeout: 30_000 });
    await expect(answerRegion(page)).toHaveText(t.refusalInfoAbsente);
    await expect(page.getByRole("list", { name: t.sourcesLabel })).toHaveCount(0);
    await expect(thread(page).locator("[data-source-chip]")).toHaveCount(0);
    await expect(answerRegion(page).locator("[data-answer]")).toHaveCount(0);
    await expectNoAxeViolation(page, "le refus");
    await expectNoHorizontalScroll(page, "le refus");
  });

  expectBrowserBoundary(requests);
});
