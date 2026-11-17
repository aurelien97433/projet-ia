import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Locator, Page, Request } from "@playwright/test";
import { EMBEDDING_MODEL, EMBEDDING_VERSION } from "../../supabase/functions/_shared/config.ts";
import { fakeVector } from "../../supabase/functions/_shared/fake-embeddings.ts";
import {
  FAKE_HORS_CADRE_MARKER,
  FAKE_INFO_ABSENTE_MARKER,
  FAKE_INVALID_CITATION_MARKER,
  FAKE_INVALID_MARKER,
  FAKE_SLOW_STREAM_MARKER,
} from "../../supabase/functions/_shared/fake-generation.ts";
import { texts } from "../../src/lib/texts";
import { expect, isDesktop, test, type Account } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Page Assistant (story 5.2b), sur le build de production et Supabase local, avec la vectorisation et
// la génération simulées de la pile locale (aucun appel à OpenAI). Parcours réel : un Document prêt
// est créé avec un Passage dont le vecteur simulé est celui de la question (similarité 1), puis
// supprimé. Pannes et quota : POST /api/chat intercepté. Les compteurs du garde-fou sont remis à zéro
// par la préparation des tests (global-setup.ts).
test.use({ storageState: async ({ authState }, provide) => provide(authState) });

const t = texts.assistant;
const root = process.cwd();
const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

const inserted: string[] = [];
test.afterEach(async () => {
  if (inserted.length > 0) await admin().from("documents").delete().in("id", inserted.splice(0));
});

const tag = () => crypto.randomUUID().slice(0, 8);

type Seeded = { id: string; title: string; question: string };

// Document prêt « Procédure de facturation {marqueur} » ; son Passage a pour vecteur celui de la question.
async function seedDocument(account: Account, marker = tag()): Promise<Seeded> {
  const title = `Procédure de facturation ${marker}`;
  const question = `Sous quel délai une facture ${marker} doit-elle être émise après la livraison ?`;
  const passage = `Une facture est émise sous 5 jours ouvrés après la livraison (${marker}).`;
  const { data, error } = await admin()
    .from("documents")
    .insert({
      author_id: account.id,
      title,
      category: "procedure",
      content_text: passage,
      status: "ready",
      client_request_id: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  inserted.push(data.id);
  const insert = await admin().from("passages").insert({
    document_id: data.id,
    text_version: 1,
    ordinal: 0,
    start_offset: 0,
    end_offset: passage.length,
    content: passage,
    embedding: JSON.stringify(fakeVector(question)),
    embedding_model: EMBEDDING_MODEL,
    embedding_version: EMBEDDING_VERSION,
  });
  if (insert.error) throw new Error(`Création du Passage de test impossible : ${insert.error.message}`);
  return { id: data.id, title, question };
}

// Question sans aucun mot commun avec les Documents : aucun Passage au-dessus du seuil simulé.
const outOfBase = () => `zorglub${tag()} quintessor${tag()} vrombaxe${tag()}`;

// Toutes les requêtes du navigateur, pour vérifier la frontière (AR-21, NFR-2).
function collectRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  return requests;
}

function expectBoundary(requests: Request[]) {
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.url()).not.toContain("/functions/v1/");
    expect(request.url()).not.toContain("api.openai.com");
  }
}

const chatCalls = (requests: Request[]) =>
  requests.filter((request) => new URL(request.url()).pathname === "/api/chat" && request.method() === "POST");

const field = (page: Page) => page.getByRole("textbox", { name: t.fieldLabel });
const sendButton = (page: Page) => page.getByRole("button", { name: t.submit, exact: true });
const thread = (page: Page) => page.getByRole("list", { name: t.threadLabel });
// Région d'annonce (masquée tant qu'elle est vide : getByRole l'ignorerait).
const answerStatus = (page: Page) => thread(page).locator('[role="status"]');
// Texte lu par un lecteur d'écran (parties aria-hidden exclues, texte masqué compris) : puces de
// Source (story 5.4), dont les points médians sont masqués.
const spokenText = (locator: Locator) =>
  locator.evaluate((element) => {
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
    return clone.textContent;
  });
const counter = (page: Page) => page.locator("[data-counter]");
const fulfill = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

// Lien hydraté (gestionnaire React posé) : sinon le clic ferait un chargement complet, où le focus
// n'est jamais déplacé (règle du lien d'évitement).
async function waitForHydratedLink(page: Page, href: string) {
  await page.waitForFunction(
    (target) =>
      [...document.querySelectorAll(`a[href="${target}"]`)].some((a) => Object.keys(a).some((k) => k.startsWith("__reactProps"))),
    href,
  );
}

async function openAssistant(page: Page) {
  await page.goto("/assistant");
  // Le champ n'existe qu'après l'hydratation (vue cliente sous Suspense).
  await expect(field(page)).toBeVisible();
}

test("nominal (génération simulée) : question, état neutre, réponse d'un bloc et puce de Source ; seul /api/chat est appelé", async ({
  page,
  account,
}) => {
  const seeded = await seedDocument(account);
  const requests = collectRequests(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/chat", async (route) => {
    await gate;
    await route.continue();
  });

  await openAssistant(page);
  await field(page).fill(seeded.question);
  await field(page).press("Enter");

  await expect(thread(page).locator("[data-question-bubble]")).toContainText(seeded.question);
  const pending = page.getByText(t.pending);
  // État neutre annoncé dans la région (rendue même vide), puis remplacé par la réponse.
  await expect(pending).toBeVisible();
  await expect(answerStatus(page)).toHaveText(t.pending);
  await expect(sendButton(page)).toHaveAttribute("aria-disabled", "true");
  release();

  // Réponse simulée citant [P1] : renvoi ¹ lu « Source 1 » (story 5.4), aucun repère brut.
  const text = answerStatus(page).locator("[data-answer] p").first();
  await expect(text).toHaveText(/^Réponse simulée à partir des Documents Source 1\./);
  await expect(text).not.toContainText("[P");
  await expect(text).not.toContainText("[S");
  await expect(text.locator("sup").first()).toHaveText("Source 1");
  await expect(pending).toHaveCount(0);
  const chips = answerStatus(page).getByRole("list", { name: t.sourcesLabel }).getByRole("listitem");
  await expect(chips.filter({ hasText: seeded.title })).toHaveCount(1);
  expect(await spokenText(chips.first())).toBe(`Source 1 : ${seeded.title}`);
  await expect(answerStatus(page).getByRole("button")).toHaveCount(0);
  await expect(answerStatus(page).getByRole("link")).toHaveCount(0);
  await expect(sendButton(page)).not.toHaveAttribute("aria-disabled", "true");
  await expect(field(page)).toBeFocused();

  expect(chatCalls(requests)).toHaveLength(1);
  const body = chatCalls(requests)[0].postDataJSON() as { question: string; clientRequestId: string };
  expect(body.question).toBe(seeded.question);
  expect(body.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
  expectBoundary(requests);
});

test("hors base : bloc de refus distinct, sans zone Sources ; une seconde question remplace l'échange", async ({ page, account }) => {
  const seeded = await seedDocument(account);
  const requests = collectRequests(page);
  await openAssistant(page);
  const question = outOfBase();
  await field(page).fill(question);
  await field(page).press("Enter");

  // Appel court simulé : information absente (story 5.3), bloc d'un seul tenant avec trois suites.
  // Un seul bloc ; la région d'annonce ne contient que le texte du refus, sans bouton ni lien
  // (décision du 2026-11-17).
  const refusal = thread(page).locator('[data-refusal="info_absente"]');
  await expect(answerStatus(page)).toHaveText(t.refusalInfoAbsente);
  await expect(answerStatus(page).locator("svg")).toHaveCount(1);
  await expect(answerStatus(page).getByRole("button")).toHaveCount(0);
  await expect(answerStatus(page).getByRole("link")).toHaveCount(0);
  await expect(refusal.locator('[role="status"]')).toHaveCount(1);
  await expect(answerStatus(page).locator("[data-answer]")).toHaveCount(0);
  await expect(page.getByRole("list", { name: t.sourcesLabel })).toHaveCount(0);
  await expect(refusal.getByRole("button")).toHaveText([t.reformulate]);
  await expect(refusal.getByRole("link")).toHaveText([t.searchDocuments, t.addDocument]);
  await expect(thread(page).getByRole("alert")).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  // Bloc visuellement distinct d'une réponse : bordure et fond propres.
  const style = await refusal.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { border: computed.borderTopWidth, background: computed.backgroundColor };
  });
  expect(style.border).not.toBe("0px");
  expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  // Seconde question : seul le nouvel échange est affiché.
  await field(page).fill(seeded.question);
  await field(page).press("Enter");
  await expect(answerStatus(page).locator("[data-answer]")).toBeVisible();
  await expect(page.locator("[data-question-bubble]")).toHaveCount(1);
  await expect(page.locator("[data-question-bubble]")).toContainText(seeded.question);
  await expect(page.getByText(question)).toHaveCount(0);
  await expect(page.locator("[data-refusal]")).toHaveCount(0);

  const ids = chatCalls(requests).map((request) => (request.postDataJSON() as { clientRequestId: string }).clientRequestId);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
  expectBoundary(requests);
});

test("refus « information absente » (story 5.3) : « Reformuler » remet la question dans le champ, curseur à la fin ; « Rechercher » ouvre la Recherche avec la question", async ({
  page,
}) => {
  const requests = collectRequests(page);
  await openAssistant(page);
  const question = outOfBase();
  await field(page).fill(question);
  await field(page).press("Enter");
  const refusal = thread(page).locator('[data-refusal="info_absente"]');
  await expect(refusal).toBeVisible();
  await expect(field(page)).toHaveValue("");

  await refusal.getByRole("button", { name: t.reformulate }).click();
  await expect(field(page)).toHaveValue(question);
  await expect(field(page)).toBeFocused();
  const selection = await field(page).evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd]);
  expect(selection).toEqual([question.length, question.length]);
  // Aucun envoi : le refus reste affiché, une seule requête.
  await expect(refusal).toBeVisible();
  expect(chatCalls(requests)).toHaveLength(1);

  await expect(refusal.getByRole("link", { name: t.addDocument })).toHaveAttribute("href", "/ajouter");
  const href = `/recherche?${new URLSearchParams({ q: question }).toString()}`;
  await expect(refusal.getByRole("link", { name: t.searchDocuments })).toHaveAttribute("href", href);
  await waitForHydratedLink(page, href);
  await refusal.getByRole("link", { name: t.searchDocuments }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/recherche" && url.searchParams.get("q") === question);
  expectBoundary(requests);
});

test("refus « hors cadre » (story 5.3, appel court simulé) : texte du catalogue, « Reformuler la question » seulement ; axe sans violation", async ({
  page,
}) => {
  const requests = collectRequests(page);
  await openAssistant(page);
  const question = `${outOfBase()} ${FAKE_HORS_CADRE_MARKER}`;
  await field(page).fill(question);
  await field(page).press("Enter");
  const refusal = thread(page).locator('[data-refusal="hors_cadre"]');
  await expect(answerStatus(page)).toHaveText(t.refusalHorsCadre);
  await expect(answerStatus(page).getByRole("button")).toHaveCount(0);
  await expect(refusal.getByRole("button")).toHaveText([t.reformulate]);
  await expect(refusal.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("list", { name: t.sourcesLabel })).toHaveCount(0);
  await expect(thread(page).getByRole("alert")).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  await refusal.getByRole("button", { name: t.reformulate }).click();
  await expect(field(page)).toHaveValue(question);
  await expect(field(page)).toBeFocused();
  expectBoundary(requests);
});

test("marqueur invalide (génération simulée) : alerte de panne avec « Réessayer », sans texte du modèle", async ({ page, account }) => {
  const seeded = await seedDocument(account, `${tag()} ${FAKE_INVALID_MARKER}`);
  const requests = collectRequests(page);
  await openAssistant(page);
  await field(page).fill(seeded.question);
  await field(page).press("Enter");
  const alert = thread(page).getByRole("alert").filter({ hasText: t.failedTitle });
  await expect(alert).toContainText(t.failed);
  await expect(alert.getByRole("button", { name: t.retry })).toBeVisible();
  await expect(page.getByText(/REPONSE|réponse simulée/)).toHaveCount(0);
  await expect(page.locator("[data-refusal]")).toHaveCount(0);
  expectBoundary(requests);
});

test("citation invalide (story 5.4, génération simulée) : retirée sans message ; renvoi ¹ et puce « 1 · {titre} » ; axe sans violation", async ({
  page,
  account,
}) => {
  const seeded = await seedDocument(account, `${tag()} ${FAKE_INVALID_CITATION_MARKER}`);
  const requests = collectRequests(page);
  await openAssistant(page);
  await field(page).fill(seeded.question);
  await field(page).press("Enter");
  const text = answerStatus(page).locator("[data-answer] p").first();
  await expect(text).toHaveText(/^Réponse simulée à partir des Documents Source 1\. Point simulé sans Passage\.$/);
  await expect(text.locator("sup")).toHaveCount(1);
  await expect(thread(page).getByRole("alert")).toHaveCount(0);
  const chip = answerStatus(page).getByRole("list", { name: t.sourcesLabel }).getByRole("listitem").first();
  expect(await spokenText(chip)).toBe(`Source 1 : ${seeded.title}`);
  await expect(chip.locator('[aria-hidden="true"]')).toHaveText(`1 · ${seeded.title}`);
  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  expectBoundary(requests);
});

test("panne : alerte et « Réessayer », focus sur l'alerte ; « Réessayer » : même question, nouveau clientRequestId, une seule bulle", async ({
  page,
  account,
}) => {
  const seeded = await seedDocument(account);
  const requests = collectRequests(page);
  let calls = 0;
  await page.route("**/api/chat", async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill(fulfill({ error: { code: "AI_UNAVAILABLE", message: t.failed, retryable: true } }, 503));
    } else await route.continue();
  });
  await openAssistant(page);
  await field(page).fill(seeded.question);
  await field(page).press("Enter");

  const alert = thread(page).getByRole("alert").filter({ hasText: t.failedTitle });
  await expect(alert).toContainText(t.failed);
  await expect(alert).toBeFocused();
  await expect(page.locator("[data-question-bubble]")).toContainText(seeded.question);

  await alert.getByRole("button", { name: t.retry }).press("Enter");
  await expect(answerStatus(page).locator("[data-answer]")).toBeVisible();
  await expect(thread(page).getByRole("alert")).toHaveCount(0);
  await expect(page.locator("[data-question-bubble]")).toHaveCount(1);
  await expect(field(page)).toBeFocused();

  const bodies = chatCalls(requests).map((request) => request.postDataJSON() as { question: string; clientRequestId: string });
  expect(bodies).toHaveLength(2);
  expect(bodies[1].question).toBe(bodies[0].question);
  expect(bodies[1].clientRequestId).not.toBe(bodies[0].clientRequestId);
  expectBoundary(requests);
});

test("quota et plafond simulés : texte du catalogue avec l'heure UTC, sans « Réessayer » ; double envoi (409) : sans « Réessayer »", async ({
  page,
}) => {
  const requests = collectRequests(page);
  const responses = [
    fulfill(
      { error: { code: "QUOTA_EXCEEDED", message: t.quotaExceeded("demain à 0 h 00 (UTC)"), retryable: false, resetAt: "2026-11-17T00:00:00.000Z" } },
      429,
    ),
    fulfill(
      {
        error: { code: "AI_DAILY_CAP_REACHED", message: t.dailyCapReached("demain à 0 h 00 (UTC)"), retryable: false, resetAt: "2026-11-17T00:00:00.000Z" },
      },
      503,
    ),
    fulfill({ error: { code: "REQUEST_IN_PROGRESS", message: t.inProgress, retryable: false } }, 409),
  ];
  const expected = [t.quotaExceeded("demain à 0 h 00 (UTC)"), t.dailyCapReached("demain à 0 h 00 (UTC)"), t.inProgress];
  let index = 0;
  await page.route("**/api/chat", (route) => route.fulfill(responses[index++]));
  await openAssistant(page);
  for (const message of expected) {
    await field(page).fill(`Question ${message.slice(0, 12)}`);
    await field(page).press("Enter");
    const alert = thread(page).getByRole("alert");
    await expect(alert).toHaveText(message);
    await expect(alert).toBeFocused();
    await expect(alert.getByRole("button")).toHaveCount(0);
    await field(page).focus();
  }
  expectBoundary(requests);
});

test("clavier : Maj+Entrée va à la ligne, compteur ; vide ou trop longue : message, aucune requête", async ({ page }) => {
  const requests = collectRequests(page);
  await openAssistant(page);
  await expect(counter(page)).toHaveText("0 / 2 000");
  await field(page).click();
  await page.keyboard.type("Première ligne");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Seconde");
  await expect(field(page)).toHaveValue("Première ligne\nSeconde");
  await expect(counter(page)).toHaveText(`${"Première ligne\nSeconde".length} / 2 000`);

  await field(page).fill("    ");
  await field(page).press("Enter");
  await expect(page.getByText(t.questionEmpty)).toBeVisible();
  await expect(field(page)).toBeFocused();
  await sendButton(page).click();
  await expect(page.getByText(t.questionEmpty)).toBeVisible();

  await field(page).fill("a".repeat(2_001));
  await expect(counter(page)).toHaveText("2 001 / 2 000");
  await expect(page.getByText(t.questionTooLong)).toBeVisible();
  await field(page).press("Enter");
  await sendButton(page).click();
  await expect(page.locator("[data-question-bubble]")).toHaveCount(0);
  expect(chatCalls(requests)).toHaveLength(0);
  expectBoundary(requests);
});

test("entrées : Tableau de bord et page d'un Document prêt → « Poser une question » ouvre /assistant, focus dans le champ", async ({
  page,
  account,
}) => {
  const requests = collectRequests(page);
  const seeded = await seedDocument(account);
  await page.goto("/");
  await waitForHydratedLink(page, "/assistant");
  await page.getByRole("main").getByRole("link", { name: t.askQuestion, exact: true }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue("");

  await page.goto(`/documents/${seeded.id}`);
  const actions = page.getByRole("group", { name: texts.document.actionsLabel });
  await expect(actions.getByRole("link", { name: t.askQuestion })).toBeVisible();
  await waitForHydratedLink(page, "/assistant");
  await actions.getByRole("link", { name: t.askQuestion }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(field(page)).toBeFocused();
  expectBoundary(requests);
});

test("Recherche sans résultat : phrase FR-15 complète et bouton ; l'Assistant s'ouvre avec la Requête, rien d'envoyé", async ({ page }) => {
  const requests = collectRequests(page);
  const query = outOfBase();
  await page.goto(`/recherche?q=${encodeURIComponent(query)}`);
  await expect(page.getByRole("status").filter({ hasText: /Aucun Document/ })).toHaveText(
    "Aucun Document ne correspond suffisamment à votre recherche. Essayez d'autres mots ou posez la question à l'Assistant.",
  );
  const ask = page.getByRole("link", { name: texts.search.askAssistant });
  await expect(ask).toBeVisible();
  const href = `/assistant?${new URLSearchParams({ question: query }).toString()}`;
  await expect(ask).toHaveAttribute("href", href);
  await waitForHydratedLink(page, href);
  await ask.click();
  await expect(page).toHaveURL((url) => url.pathname === "/assistant" && url.searchParams.get("question") === query);
  await expect(field(page)).toHaveValue(query);
  await expect(field(page)).toBeFocused();
  await expect(page.locator("[data-question-bubble]")).toHaveCount(0);
  // Laisse le temps à un éventuel envoi d'office de partir.
  await page.waitForLoadState("networkidle");
  expect(chatCalls(requests)).toHaveLength(0);
  expectBoundary(requests);
});

test("axe sans violation, sans défilement horizontal, avec une réponse et ses Sources", async ({ page, account }) => {
  const requests = collectRequests(page);
  const seeded = await seedDocument(account);
  const long = `${"Motsansespace".repeat(14)} https://exemple.test/${"chemin/".repeat(20)}`;
  await page.route("**/api/chat", (route) =>
    route.fulfill(
      fulfill({
        conversationId: crypto.randomUUID(),
        message: {
          kind: "answer",
          content: `${long}[S1][S2]`,
          sources: [
            { documentId: seeded.id, title: `${seeded.title} ${long}`, passageNumbers: [1, 2] },
            { documentId: null, title: "Ancienne FAQ", passageNumbers: [3] },
          ],
        },
      }),
    ),
  );
  await openAssistant(page);
  await field(page).fill(long);
  await field(page).press("Enter");
  await expect(answerStatus(page).getByRole("listitem")).toHaveCount(2);
  await expect(answerStatus(page)).toContainText("Ancienne FAQ — Document supprimé");
  // Story 5.4 : renvois ¹ ², puces numérotées ; Source supprimée : numéro gardé.
  await expect(answerStatus(page).locator("[data-answer] sup")).toHaveText(["Source 1", "Source 2"]);
  const chips = answerStatus(page).getByRole("listitem");
  expect(await spokenText(chips.nth(0))).toBe(`Source 1 : ${seeded.title} ${long}, 2 Passages`);
  expect(await spokenText(chips.nth(1))).toBe("Source 2 : Ancienne FAQ — Document supprimé");
  await expect(chips.nth(1).locator('[aria-hidden="true"]')).toHaveText("2 · Ancienne FAQ — Document supprimé");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  if (!isDesktop(page)) {
    const input = await field(page).boundingBox();
    const button = await sendButton(page).boundingBox();
    if (!input || !button) throw new Error("Champ ou bouton invisible");
    expect(button.y).toBeGreaterThanOrEqual(input.y + input.height);
  }
  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  expectBoundary(requests);
});

test("page prérendue /assistant : ni question, ni réponse", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "ordinateur", "fichiers du build : un projet suffit");
  const html = readFileSync(path.join(root, process.env.NEXT_DIST_DIR || ".next-e2e", "server", "app", "assistant.html"), "utf8");
  expect(html.length).toBeGreaterThan(0);
  expect(html).not.toContain("data-question-bubble");
  expect(html).not.toContain("data-answer");
  expect(html).not.toContain(t.pending);
});

// Story 5.5 : réponse progressive. Génération simulée lente (morceaux espacés de 400 ms) pour observer
// le texte provisoire ; pannes et délais : flux de /api/chat simulé.
const sse = (events: [string, unknown][]) => ({
  status: 200,
  contentType: "text/event-stream; charset=utf-8",
  body: events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(""),
});

// Enregistre, dans la page, chaque texte provisoire affiché (même bref) et s'il a été annoncé.
async function watchProvisional(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __provisional: string[] }).__provisional = seen;
    new MutationObserver(() => {
      const node = document.querySelector("[data-provisional]");
      if (node?.textContent) seen.push(node.textContent);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
const provisionalSeen = (page: Page) => page.evaluate(() => (window as unknown as { __provisional: string[] }).__provisional);

test("réponse progressive (story 5.5) : texte provisoire aria-busy, hors de la région d'annonce, sans repère ; puis réponse validée avec renvoi ; seul /api/chat est appelé", async ({
  page,
  account,
}) => {
  const seeded = await seedDocument(account, `${tag()} ${FAKE_SLOW_STREAM_MARKER}`);
  const requests = collectRequests(page);
  await openAssistant(page);
  await watchProvisional(page);
  await field(page).fill(seeded.question);
  await field(page).press("Enter");

  const provisional = thread(page).locator("[data-provisional]");
  await expect(provisional).toBeVisible();
  await expect(provisional).toHaveAttribute("aria-busy", "true");
  await expect(answerStatus(page).locator("[data-provisional]")).toHaveCount(0);
  await expect(sendButton(page)).toHaveAttribute("aria-disabled", "true");

  const text = answerStatus(page).locator("[data-answer] p").first();
  await expect(text).toHaveText(/^Réponse simulée à partir des Documents Source 1\./);
  await expect(provisional).toHaveCount(0);
  const seen = await provisionalSeen(page);
  expect(seen.length).toBeGreaterThan(0);
  for (const value of seen) expect(value).not.toMatch(/\[[PS]|REPONSE/);
  await expect(sendButton(page)).not.toHaveAttribute("aria-disabled", "true");
  expect(chatCalls(requests)).toHaveLength(1);
  expect(chatCalls(requests)[0].headers()["accept"]).toContain("text/event-stream");
  expectBoundary(requests);
});

test("refus en flux (story 5.5) : bloc de refus d'un coup, jamais de texte provisoire", async ({ page, account }) => {
  const seeded = await seedDocument(account, `${tag()} ${FAKE_SLOW_STREAM_MARKER} ${FAKE_INFO_ABSENTE_MARKER}`);
  await openAssistant(page);
  await watchProvisional(page);
  await field(page).fill(seeded.question);
  await field(page).press("Enter");
  await expect(page.locator("[data-refusal]")).toBeVisible();
  await expect(answerStatus(page)).toHaveText(t.refusalInfoAbsente);
  expect(await provisionalSeen(page)).toEqual([]);
});

test("panne après le texte provisoire (story 5.5) : texte provisoire retiré, alerte et « Réessayer », question conservée", async ({ page }) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill(
      sse([
        ["delta", { text: "Texte provisoire" }],
        ["error", { code: "AI_CITATIONS_INVALID", message: t.unverifiable, retryable: true }],
      ]),
    ),
  );
  await openAssistant(page);
  await field(page).fill("Question en panne");
  await field(page).press("Enter");
  const alert = thread(page).getByRole("alert");
  await expect(alert).toContainText(t.unverifiable);
  await expect(alert.getByRole("button", { name: t.retry })).toBeVisible();
  await expect(thread(page).locator("[data-provisional]")).toHaveCount(0);
  await expect(page.getByText("Texte provisoire")).toHaveCount(0);
  await expect(page.locator("[data-question-bubble]")).toContainText("Question en panne");
});

test("20 s sans premier affichage (story 5.5) : alerte de panne et « Réessayer », question conservée", async ({ page }) => {
  await page.clock.install();
  // Aucune réponse de /api/chat : la requête reste en attente jusqu'à l'abandon par la page.
  await page.route("**/api/chat", () => new Promise(() => {}));
  await openAssistant(page);
  await field(page).fill("Question sans réponse");
  await field(page).press("Enter");
  await expect(page.getByText(t.pending)).toBeVisible();
  await page.clock.fastForward(19_000);
  await expect(thread(page).getByRole("alert")).toHaveCount(0);
  await page.clock.fastForward(1_500);
  const alert = thread(page).getByRole("alert");
  await expect(alert).toContainText(t.failedTitle);
  await expect(alert.getByRole("button", { name: t.retry })).toBeVisible();
  await expect(page.locator("[data-question-bubble]")).toContainText("Question sans réponse");
});

test("mesure du flux (?mesure=1, story 5.5) : instrument visible et résultat sans identifiant ; absent sans le paramètre", async ({ page, account }) => {
  await openAssistant(page);
  await expect(page.locator("[data-measure]")).toHaveCount(0);
  const seeded = await seedDocument(account);
  await page.goto("/assistant?mesure=1");
  await expect(field(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: t.measureTitle })).toBeVisible();
  await field(page).fill(seeded.question);
  await field(page).press("Enter");
  await expect(answerStatus(page).locator("[data-answer]")).toBeVisible();
  await expect(page.locator("[data-measure-count]")).toHaveText(t.measureCount(1));
  const result = await page.locator("[data-measure-result]").textContent();
  expect(result).toContain("(hors mini Jeu, texte non repris)");
  expect(result).not.toContain(seeded.question);
  expect(result).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|@|::/);
});
