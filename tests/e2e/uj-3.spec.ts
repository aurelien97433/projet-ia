import { expect, test, type Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { uniqueEmail } from "../support/local-supabase";
import {
  acquireJourneyLock,
  collectRequests,
  deleteAccountByEmail,
  deleteDocuments,
  expectBrowserBoundary,
  expectNoAxeViolation,
  expectNoHorizontalScroll,
  journeyTag,
  LOCK_WAIT_MAX_MS,
  openAssistantByNavigation,
  profileIdByEmail,
  seedReadyDocument,
  waitForHydratedLink,
} from "./support/journeys";
import { press, typeInto } from "./support/uj2";

// Parcours UJ-3 de bout en bout (story 7.3, PRD §2 : nouvel arrivant), au clavier seul (focus posé
// puis Entrée, Tab, Échap, frappe ; aucun clic), aux deux largeurs, en mode local : pile locale,
// vectorisation et génération simulées. Le Compte est créé par /inscription. La « Procédure congés et
// absences » est préchargée pour le test (titre suivi d'un repère ; un seul exemplaire du parcours à
// la fois, par un verrou entre workers) ; ses Passages ont pour vecteurs simulés ceux de la Requête
// et de la première question.
// Sur chaque écran : axe (WCAG 2 A et AA) ; sur la Recherche, la lecture du Document et la
// Conversation : aucun défilement horizontal ; tout le parcours : aucune requête du navigateur vers
// OpenAI ni /functions/v1/. Nettoyage : Document puis Compte créé (ses Conversations partent avec lui),
// même en cas d'échec.

const QUERY = "organisation des congés";
const FIRST = "comment poser mes congés ?";
const FOLLOW_UP = "et si je pose moins de 3 jours ?";
// Question autonome de la reformulation simulée du suivi (fakeRewrite : question précédente puis
// nouvelle question) : vecteur du Passage « moins de 3 jours », pour une réponse sourcée déterministe.
const FOLLOW_UP_STANDALONE = `${FIRST} ${FOLLOW_UP}`;
const REOPENED = "à qui dois-je envoyer ma demande de congés ?";
const PASSWORD = ["Mot", "de", "passe", "uj3", "2026"].join("-");

const t = texts.assistant;
const h = texts.history;

const field = (page: Page) => page.getByRole("textbox", { name: t.fieldLabel });
const thread = (page: Page) => page.getByRole("list", { name: t.threadLabel });
// Fil visible seulement : Next.js garde masqué (Activity) l'écran Assistant quitté, avec ses bulles.
const bubbles = (page: Page) => thread(page).locator("[data-question-bubble]");
// Réponses du fil : réponse sourcée ou refus (génération simulée : le suivi reformulé peut ne
// retrouver aucun Passage).
const replies = (page: Page) => thread(page).locator("[data-answer], [data-refusal]");
const historyButton = (page: Page) => page.getByRole("button", { name: h.open, exact: true });
const historyPanel = (page: Page) => page.getByRole("dialog", { name: h.title });
const dashboardField = (page: Page) => page.getByRole("searchbox", { name: texts.dashboard.searchLabel });
const cards = (page: Page) => page.getByRole("list", { name: texts.search.resultsLabel }).getByRole("article");

let email: string | null = null;
const documents: string[] = [];
let releaseLock: (() => void) | null = null;

test.afterEach(async () => {
  try {
    await deleteDocuments(documents.splice(0));
    if (email) await deleteAccountByEmail(email);
    email = null;
  } finally {
    releaseLock?.();
    releaseLock = null;
  }
});

test("UJ-3 au clavier : inscription, Recherche « organisation des congés », Procédure ouverte, question et suivi dans la même Conversation, réouverture depuis l'Historique", async ({
  page,
}) => {
  // Attente du verrou comprise : elle s'ajoute au parcours, sans allonger le délai de ses étapes.
  test.setTimeout(120_000 + LOCK_WAIT_MAX_MS);
  releaseLock = await acquireJourneyLock("uj-3");
  const requests = collectRequests(page);
  const marker = journeyTag();
  const organisation =
    "Organisation des congés : chaque demande de congés est posée dans l'outil RH au moins deux semaines avant le départ.";
  const shortLeave = "Pour poser mes congés : demande dans l'outil RH, validée par le responsable ; moins de 3 jours, 5 jours avant suffisent.";
  let conversationId = "";
  let documentId = "";
  let title = "";

  await test.step("1. Création du Compte par /inscription", async () => {
    email = uniqueEmail("e2e-uj3");
    await page.goto("/inscription");
    await expect(page.locator("#email")).toBeFocused();
    await expectNoAxeViolation(page, "l'inscription");
    await page.keyboard.type(email);
    await typeInto(page, page.locator("#password"), PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: texts.titles.dashboard })).toBeVisible();
    await expectNoAxeViolation(page, "le Tableau de bord");

    // Document préchargé après la création du Compte (Auteur : le nouveau Compte).
    const authorId = await profileIdByEmail(email);
    if (!authorId) throw new Error("Profil du Compte créé introuvable.");
    const seeded = await seedReadyDocument(authorId, {
      title: `Procédure congés et absences ${marker}`,
      category: "procedure",
      sections: [
        { text: organisation, vectorOf: QUERY },
        // Vecteur de la question autonome du suivi ; les 4 mots de la première question en font partie
        // (similarité ≈ 0,6) : ce Passage reste cité pour elle aussi.
        { text: shortLeave, vectorOf: FOLLOW_UP_STANDALONE },
      ],
    });
    documents.push(seeded.id);
    documentId = seeded.id;
    title = seeded.title;
  });

  await test.step("2. Recherche depuis le Tableau de bord : Passage mis en avant", async () => {
    await typeInto(page, dashboardField(page), QUERY);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL((url) => url.pathname === "/recherche" && url.searchParams.get("q") === QUERY);
    const card = cards(page).filter({ hasText: title });
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card.locator("mark.passage-highlight")).toHaveText(organisation);
    await expect(card).toContainText(texts.reader.relevantPassageLabel);
    await expectNoAxeViolation(page, "la Recherche");
    await expectNoHorizontalScroll(page, "la Recherche");

    await press(page, card.getByRole("link"));
    await expect(page).toHaveURL(new RegExp(`/documents/${documentId}\\?`));
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.locator("main mark.passage-highlight:visible")).toHaveText(organisation);
    await expectNoAxeViolation(page, "la lecture du Document");
    await expectNoHorizontalScroll(page, "la lecture du Document");
  });

  await test.step("3. Nouvelle Conversation, puis suivi dans la même Conversation", async () => {
    const ask = page.getByRole("group", { name: texts.document.actionsLabel }).getByRole("link", { name: t.askQuestion });
    await waitForHydratedLink(page, "/assistant");
    await press(page, ask);
    await expect(page).toHaveURL(/\/assistant$/);
    await typeInto(page, field(page), FIRST);
    await page.keyboard.press("Enter");
    await expect(thread(page).locator("[data-source-chip] button").filter({ hasText: title }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/assistant\/[0-9a-f-]{36}$/);
    conversationId = new URL(page.url()).pathname.split("/").at(-1)!;

    await typeInto(page, field(page), FOLLOW_UP);
    await page.keyboard.press("Enter");
    await expect(bubbles(page)).toHaveCount(2);
    await expect(bubbles(page).nth(1)).toContainText(FOLLOW_UP);
    await expect(replies(page)).toHaveCount(2, { timeout: 30_000 });
    // Le suivi reçoit une réponse sourcée par la Procédure congés (jamais un refus).
    const followUpReply = thread(page).locator("li", { has: page.locator("[data-answer]") }).nth(1);
    await expect(followUpReply.locator("[data-answer]")).toBeVisible();
    await expect(followUpReply.getByRole("list", { name: t.sourcesLabel })).toContainText(title);
    await expect(page).toHaveURL(new RegExp(`/assistant/${conversationId}$`));
    await expectNoAxeViolation(page, "la Conversation");
    await expectNoHorizontalScroll(page, "la Conversation");
  });

  await test.step("4. Réouverture depuis l'Historique, nouvelle question dans la même Conversation", async () => {
    await openAssistantByNavigation(page, { assistant: texts.nav.assistant, openMenu: texts.shell.openMenu, menuTitle: texts.shell.menuTitle });
    await expect(field(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: texts.titles.assistantEmpty })).toBeVisible();
    await expectNoAxeViolation(page, "l'Assistant vide");
    await press(page, historyButton(page));
    await expect(historyPanel(page)).toBeVisible();
    const row = historyPanel(page).locator(`[data-conversation-id="${conversationId}"] a`);
    await expect(row).toBeVisible();
    await expectNoAxeViolation(page, "l'Historique");
    await press(page, row);
    await expect(page).toHaveURL(new RegExp(`/assistant/${conversationId}$`));
    await expect(historyPanel(page)).toHaveCount(0);
    await expect(bubbles(page)).toHaveCount(2);
    await expect(field(page)).toBeFocused();

    await page.keyboard.type(REOPENED);
    await page.keyboard.press("Enter");
    await expect(bubbles(page)).toHaveCount(3);
    await expect(bubbles(page).nth(2)).toContainText(REOPENED);
    await expect(replies(page)).toHaveCount(3, { timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/assistant/${conversationId}$`));
    await expectNoAxeViolation(page, "la Conversation rouverte");
    await expectNoHorizontalScroll(page, "la Conversation rouverte");
  });

  expectBrowserBoundary(requests);
});
