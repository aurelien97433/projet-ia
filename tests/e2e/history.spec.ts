import { createClient } from "@supabase/supabase-js";
import type { Page, Request } from "@playwright/test";
import { EMBEDDING_MODEL, EMBEDDING_VERSION } from "../../supabase/functions/_shared/config.ts";
import { fakeVector } from "../../supabase/functions/_shared/fake-embeddings.ts";
import { texts } from "../../src/lib/texts";
import { createAccount, deleteAccount, expect, test, type Account } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Conversations et Historique (story 5.6), sur le build de production et Supabase local, aux deux
// largeurs. Quatre parcours retenus (décision de l'utilisateur du 2026-11-19) : rouvrir puis poursuivre,
// S4 (Conversation d'un autre Compte → E9 identique à un identifiant inexistant), Historique au clavier
// sans défilement horizontal, 5 dernières sur le Tableau de bord. États vide et erreur, déconnexion et
// question en cours : tests unitaires. Les Conversations sont écrites par service_role (jeu de données)
// ; la poursuite passe par le vrai /api/chat et la génération simulée de la pile locale. Chaque
// Compte de worker est propre à son projet : les listes ne sont jamais partagées entre workers.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });

const t = texts.assistant;
const h = texts.history;
const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

const documents: string[] = [];
const conversations: string[] = [];
test.afterEach(async () => {
  if (conversations.length > 0) await admin().from("conversations").delete().in("id", conversations.splice(0));
  if (documents.length > 0) await admin().from("documents").delete().in("id", documents.splice(0));
});

const tag = () => crypto.randomUUID().slice(0, 8);
const MINUTE = 60_000;

// Document prêt dont le Passage a pour vecteur celui de la question (similarité 1 en génération simulée).
async function seedDocument(account: Account, marker: string) {
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
  documents.push(data.id);
  const inserted = await admin()
    .from("passages")
    .insert({
      document_id: data.id,
      text_version: 1,
      ordinal: 0,
      start_offset: 0,
      end_offset: passage.length,
      content: passage,
      embedding: JSON.stringify(fakeVector(question)),
      embedding_model: EMBEDDING_MODEL,
      embedding_version: EMBEDDING_VERSION,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) throw new Error(`Création du Passage impossible : ${inserted.error?.message}`);
  return { id: data.id, title, question, passageId: inserted.data.id as string, passageLength: passage.length };
}

type Exchange = {
  question: string;
  // Réponse enregistrée (avec une Source facultative) ou échec ; absent : question sans réponse.
  answer?: { content: string; source?: { documentId: string; title: string; passageId: string; end: number } };
  failure?: string;
};

// Conversation enregistrée, datée de `at` (dernier échange) : une question puis la réponse ou l'échec,
// une seconde plus tard, pour chaque échange.
async function seedConversation(account: Account, title: string, at: Date, exchanges: Exchange[]): Promise<string> {
  const start = new Date(at.getTime() - exchanges.length * 2_000);
  const { data, error } = await admin()
    .from("conversations")
    .insert({ owner_id: account.id, title, created_at: start.toISOString(), last_message_at: at.toISOString() })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création de la Conversation impossible : ${error?.code}`);
  conversations.push(data.id);
  for (const [index, exchange] of exchanges.entries()) {
    const askedAt = new Date(start.getTime() + index * 2_000);
    const repliedAt = new Date(askedAt.getTime() + 1_000);
    const base = { conversation_id: data.id, owner_id: account.id };
    const question = await admin().from("messages").insert({
      ...base,
      role: "user",
      kind: "question",
      content: exchange.question,
      client_request_id: crypto.randomUUID(),
      created_at: askedAt.toISOString(),
    });
    if (question.error) throw new Error(`Création de la question impossible : ${question.error.message}`);
    if (exchange.answer) {
      const answer = await admin()
        .from("messages")
        .insert({ ...base, role: "assistant", kind: "answer", content: exchange.answer.content, created_at: repliedAt.toISOString() })
        .select("id")
        .single();
      if (answer.error || !answer.data) throw new Error(`Création de la réponse impossible : ${answer.error?.message}`);
      const source = exchange.answer.source;
      if (source) {
        const inserted = await admin()
          .from("message_sources")
          .insert({
            message_id: answer.data.id,
            owner_id: account.id,
            ordinal: 1,
            document_id: source.documentId,
            document_title: source.title,
            text_version: 1,
            passages: [{ passage_id: source.passageId, start: 0, end: source.end }],
          });
        if (inserted.error) throw new Error(`Création de la Source impossible : ${inserted.error.message}`);
      }
    }
    if (exchange.failure) {
      const failure = await admin()
        .from("messages")
        .insert({ ...base, role: "assistant", kind: "failure", error_code: exchange.failure, created_at: repliedAt.toISOString() });
      if (failure.error) throw new Error(`Création de l'échec impossible : ${failure.error.message}`);
    }
  }
  return data.id;
}

const field = (page: Page) => page.getByRole("textbox", { name: t.fieldLabel });
const thread = (page: Page) => page.getByRole("list", { name: t.threadLabel });
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const historyButton = (page: Page) => page.getByRole("button", { name: h.open, exact: true });
const panel = (page: Page) => page.getByRole("dialog", { name: h.title });
const panelRows = (page: Page) => panel(page).getByRole("list", { name: h.title }).getByRole("listitem");
const rowIds = (rows: ReturnType<typeof panelRows>) =>
  rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-conversation-id")));

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("rouvrir puis poursuivre : fil enregistré sans [P{n}], puce de Source, focus dans le champ ; la question s'ajoute et la Conversation remonte en tête", async ({
  page,
  account,
}) => {
  const marker = tag();
  const seeded = await seedDocument(account, marker);
  const firstQuestion = `Quel est le délai de facturation ${marker} ?`;
  const title = `Délai de facturation ${marker}`;
  // Réponse enregistrée avant la story 5.4 : repère brut [P2] (texte réel de la 5.2b).
  const reopened = await seedConversation(account, title, new Date(Date.now() - 24 * 60 * MINUTE), [
    {
      question: firstQuestion,
      answer: {
        content: "Une facture est émise sous 5 jours ouvrés [P2].",
        source: { documentId: seeded.id, title: seeded.title, passageId: seeded.passageId, end: seeded.passageLength },
      },
    },
  ]);
  // Conversation plus récente : la Conversation rouverte n'est pas en tête avant la poursuite.
  const recent = await seedConversation(account, `Plus récente ${marker}`, new Date(Date.now() - 60 * MINUTE), [
    { question: `Question plus récente ${marker} ?`, answer: { content: "Réponse plus récente." } },
  ]);
  const before = await admin().from("conversations").select("last_message_at").eq("id", reopened).single();

  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  await page.goto(`/assistant/${reopened}`);
  await expect(heading(page)).toHaveText(title);
  await expect(field(page)).toBeFocused();
  await expect(page.locator("[data-question-bubble]")).toHaveCount(1);
  await expect(page.locator("[data-question-bubble]")).toContainText(firstQuestion);
  const oldAnswer = thread(page).locator("[data-answer]");
  await expect(oldAnswer).toHaveCount(1);
  await expect(oldAnswer).toContainText("5 jours ouvrés.");
  await expect(thread(page)).not.toContainText("[P");
  await expect(page.getByRole("list", { name: t.sourcesLabel })).toContainText(seeded.title);

  // Poursuivre : question envoyée avec l'identifiant de la Conversation, réponse ajoutée au fil.
  await field(page).fill(seeded.question);
  await field(page).press("Enter");
  await expect(thread(page).locator("[data-answer]")).toHaveCount(2);
  await expect(page.locator("[data-question-bubble]")).toHaveCount(2);
  await expect(page.locator("[data-question-bubble]").nth(1)).toContainText(seeded.question);
  await expect(page).toHaveURL(new RegExp(`/assistant/${reopened}$`));
  const chat = requests.filter((request) => new URL(request.url()).pathname === "/api/chat" && request.method() === "POST");
  expect(chat).toHaveLength(1);
  expect((chat[0].postDataJSON() as { conversationId?: string }).conversationId).toBe(reopened);
  for (const request of requests) expect(request.url()).not.toContain("/functions/v1/");

  // En base : même Conversation, deux questions, date du dernier échange avancée.
  const questions = await admin().from("messages").select("id").eq("conversation_id", reopened).eq("kind", "question");
  expect(questions.data).toHaveLength(2);
  const after = await admin().from("conversations").select("last_message_at").eq("id", reopened).single();
  expect(new Date(after.data!.last_message_at).getTime()).toBeGreaterThan(new Date(before.data!.last_message_at).getTime());

  // Historique : la Conversation poursuivie est en tête, devant la plus récente avant la poursuite.
  await historyButton(page).click();
  await expect(panelRows(page).first()).toBeVisible();
  const ids = await rowIds(panelRows(page));
  expect(ids.indexOf(reopened)).toBe(0);
  expect(ids.indexOf(recent)).toBeGreaterThan(0);

  // Rechargement : adresse stable, les deux échanges sont relus.
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(heading(page)).toHaveText(title);
  await expect(page.locator("[data-question-bubble]")).toHaveCount(2);
});

test("S4 : la Conversation d'un autre Compte donne E9, identique (statut et contenu) à un identifiant inexistant ; rien n'est révélé", async ({
  page,
}) => {
  const owner = await createAccount("e2e-conv-a");
  try {
    const marker = `SECRET-${tag()}`;
    const foreign = await seedConversation(owner, `Conversation de A ${marker}`, new Date(), [
      { question: `Question privée ${marker} ?`, answer: { content: `Réponse privée ${marker}.` } },
    ]);

    const pages: { status: number | undefined; text: string; html: string }[] = [];
    for (const id of [foreign, crypto.randomUUID(), "abc"]) {
      const response = await page.goto(`/assistant/${id}`);
      await expect(page.getByRole("heading", { level: 1, name: texts.notFound.title })).toBeVisible();
      await expect(field(page)).toHaveCount(0);
      // Page non indexée dans les trois cas.
      await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
      pages.push({ status: response?.status(), text: await page.locator("body").innerText(), html: await page.content() });
    }
    // Statut identique dans les trois cas. Avec Cache Components, la coquille statique part avant la
    // lecture : notFound() garde le statut 200 et ajoute noindex (doc Next.js, not-found.md, « Status
    // codes ») ; le 404 de la spec n'est pas atteignable sans contrôle dans le Proxy (écart consigné).
    expect(pages[1].status).toBe(pages[0].status);
    expect(pages[2].status).toBe(pages[0].status);
    expect(pages[0].text).toBe(pages[1].text);
    expect(pages[0].text).toBe(pages[2].text);
    expect(pages[0].html).not.toContain(marker);

    // La Conversation de A n'apparaît pas dans l'Historique de B.
    const listed = await page.request.get("/api/conversations?limit=100");
    expect(listed.status()).toBe(200);
    expect(JSON.stringify(await listed.json())).not.toContain(foreign);
  } finally {
    await deleteAccount(owner);
  }
});

test("Historique au clavier : focus sur l'active, Tab puis Entrée ouvre une autre Conversation (focus dans le champ), Échap rend le focus ; « Sans réponse » ; sans défilement horizontal", async ({
  page,
  account,
}) => {
  const marker = tag();
  // Titre long sans espace : il doit passer à la ligne à 375 px.
  const longTitle = `Conversation${"-tres-longue".repeat(8)}-${marker}`;
  const other = await seedConversation(account, longTitle, new Date(Date.now() + 2 * MINUTE), [
    { question: `Question restée sans réponse ${marker} ?`, failure: "AI_TIMEOUT" },
  ]);
  const active = await seedConversation(account, `Conversation active ${marker}`, new Date(Date.now() + MINUTE), [
    { question: `Question active ${marker} ?`, answer: { content: "Réponse active." } },
  ]);

  await page.goto(`/assistant/${active}`);
  await expect(field(page)).toBeFocused();
  await historyButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeVisible();
  const activeRow = panel(page).locator(`[data-conversation-id="${active}"] a`);
  await expect(activeRow).toBeFocused();
  await expect(activeRow).toHaveAttribute("aria-current", "page");
  const ids = await rowIds(panelRows(page));
  expect(ids.slice(0, 2)).toEqual([other, active]);
  await expect(panel(page).locator(`[data-conversation-id="${other}"]`)).toContainText(h.unanswered);
  await expect(panel(page).locator(`[data-conversation-id="${active}"]`)).not.toContainText(h.unanswered);
  // Plein écran sous 768 px ; jamais de défilement horizontal, ni de la page ni du panneau.
  const box = await panel(page).boundingBox();
  const width = page.viewportSize()!.width;
  if (width < 768) expect(Math.round(box!.width)).toBe(width);
  else expect(box!.width).toBeLessThan(width / 2);
  const panelOverflow = await panel(page).evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(panelOverflow).toBeLessThanOrEqual(0);
  await expectNoHorizontalScroll(page);

  // Échap : panneau fermé, focus rendu à « Historique ».
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(historyButton(page)).toBeFocused();

  // Clavier seul : la ligne précédente (plus récente) est atteinte par Maj+Tab, ouverte par Entrée.
  await page.keyboard.press("Enter");
  await expect(activeRow).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(panel(page).locator(`[data-conversation-id="${other}"] a`)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/assistant/${other}$`));
  await expect(panel(page)).toHaveCount(0);
  await expect(heading(page)).toHaveText(longTitle);
  await expect(field(page)).toBeFocused();
  // Échec seul sur le dernier échange : alerte de panne et « Réessayer ».
  await expect(thread(page).getByRole("alert")).toBeVisible();
  await expect(thread(page).getByRole("button", { name: t.retry })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("Tableau de bord : « Mes dernières Conversations », les 5 plus récentes avec « Sans réponse » ; « Voir tout l'Historique » ouvre le panneau", async ({
  page,
  account,
}) => {
  const marker = tag();
  // Six Conversations datées dans le futur : elles passent devant celles des autres tests du worker.
  const created: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const at = new Date(Date.UTC(2999, 0, 1) + index * MINUTE);
    const exchange: Exchange =
      index === 4
        ? { question: `Question ${marker} n°${index} ?`, failure: "AI_UNAVAILABLE" }
        : { question: `Question ${marker} n°${index} ?`, answer: { content: `Réponse n°${index}.` } };
    created.push(await seedConversation(account, `${marker} n°${index}`, at, [exchange]));
  }

  await page.goto("/");
  const section = page.getByRole("region", { name: h.recentTitle });
  await expect(section).toBeVisible();
  const rows = section.getByRole("list", { name: h.recentTitle }).getByRole("listitem");
  await expect(rows).toHaveCount(5);
  expect(await rowIds(rows)).toEqual(created.slice(1).reverse());
  await expect(section.locator(`[data-conversation-id="${created[4]}"]`)).toContainText(h.unanswered);
  await expect(section.locator("[data-unanswered]")).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  // 375 px : les Conversations viennent avant les Documents (H10).
  if (page.viewportSize()!.width < 1024) {
    const order = await page.evaluate(() => {
      const conversationsSection = document.querySelector("[data-recent-conversations]");
      const documentsHeading = [...document.querySelectorAll("h2")].find((element) => element.textContent?.includes("Documents"));
      if (!conversationsSection || !documentsHeading) return null;
      return conversationsSection.compareDocumentPosition(documentsHeading) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(order).toBeTruthy();
  }

  // Une ligne ouvre la Conversation.
  await section.getByRole("link", { name: `${marker} n°5` }).click();
  await expect(page).toHaveURL(new RegExp(`/assistant/${created[5]}$`));
  await expect(heading(page)).toHaveText(`${marker} n°5`);

  // « Voir tout l'Historique » : /assistant?historique=1, panneau ouvert sur la première ligne.
  await page.goto("/");
  await section.getByRole("link", { name: h.seeAll }).click();
  await expect(page).toHaveURL(/\/assistant\?historique=1$/);
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator(`[data-conversation-id="${created[5]}"] a`)).toBeFocused();
});
