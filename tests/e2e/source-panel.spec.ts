import { createClient } from "@supabase/supabase-js";
import type { Locator, Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { expect, isDesktop, test, type Account } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Panneau Source (story 5.7, E4a), sur le build de production et Supabase local, aux deux largeurs.
// Quatre parcours (comme la 5.6) : ouvrir une Source au clavier puis Échap ; deux Passages avec
// « Suivant » ; forme du panneau selon la largeur (aside non modal, ou Sheet plein écran à 375 px avec
// « ← Retour à la Conversation »), sans défilement horizontal ; « Ouvrir la page complète » vers E7 avec
// les mêmes Passages. Document supprimé avant ou pendant l'ouverture, Passage introuvable et texte
// modifié : tests unitaires. Conversations et Documents écrits par service_role (jeu de données).
test.use({ storageState: async ({ authState }, provide) => provide(authState) });

const t = texts.sourcePanel;
const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

const documents: string[] = [];
const conversations: string[] = [];
test.afterEach(async () => {
  if (conversations.length > 0) await admin().from("conversations").delete().in("id", conversations.splice(0));
  if (documents.length > 0) await admin().from("documents").delete().in("id", documents.splice(0));
});

const tag = () => crypto.randomUUID().slice(0, 8);

// Texte long : le premier Passage est loin du début, le second plus loin encore (défilement nécessaire).
function documentText(marker: string) {
  const filler = (label: string) =>
    Array.from({ length: 40 }, (_, index) => `${label} ${index + 1} : paragraphe de contexte sans rapport avec la question.`).join("\n");
  const first = `Une facture est émise sous 5 jours ouvrés après la livraison (${marker}).`;
  const second = `Un client qui n'a pas payé est relancé à 15 jours (${marker}).`;
  const text = `${filler("Préambule")}\n${first}\n${filler("Suite")}\n${second}\n${filler("Annexe")}`;
  const p1 = { start: text.indexOf(first), end: text.indexOf(first) + first.length };
  const p2 = { start: text.indexOf(second), end: text.indexOf(second) + second.length };
  return { text, first, second, p1, p2 };
}

type Position = { start: number; end: number };

// Document prêt (version 1) et Conversation avec une réponse dont la Source cite `passages`.
async function seed(account: Account, passages: (marker: string, doc: ReturnType<typeof documentText>) => Position[]) {
  const marker = tag();
  const doc = documentText(marker);
  const title = `Procédure de facturation ${marker}`;
  const { data: document, error } = await admin()
    .from("documents")
    .insert({ author_id: account.id, title, category: "procedure", content_text: doc.text, status: "ready", client_request_id: crypto.randomUUID() })
    .select("id")
    .single();
  if (error || !document) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  documents.push(document.id);

  const at = new Date();
  const { data: conversation, error: conversationError } = await admin()
    .from("conversations")
    .insert({ owner_id: account.id, title: `Factures ${marker}`, created_at: new Date(at.getTime() - 3_000).toISOString(), last_message_at: at.toISOString() })
    .select("id")
    .single();
  if (conversationError || !conversation) throw new Error(`Création de la Conversation impossible : ${conversationError?.code}`);
  conversations.push(conversation.id);
  const base = { conversation_id: conversation.id, owner_id: account.id };
  const requestId = crypto.randomUUID();
  const question = await admin()
    .from("messages")
    .insert({ ...base, role: "user", kind: "question", content: "Délai de facture ?", client_request_id: requestId, created_at: new Date(at.getTime() - 2_000).toISOString() });
  if (question.error) throw new Error(`Création de la question impossible : ${question.error.message}`);
  const answer = await admin()
    .from("messages")
    .insert({ ...base, role: "assistant", kind: "answer", content: "Une facture est émise sous 5 jours ouvrés[S1].", client_request_id: requestId, created_at: new Date(at.getTime() - 1_000).toISOString() })
    .select("id")
    .single();
  if (answer.error || !answer.data) throw new Error(`Création de la réponse impossible : ${answer.error?.message}`);
  const positions = passages(marker, doc);
  const source = await admin()
    .from("message_sources")
    .insert({
      message_id: answer.data.id,
      owner_id: account.id,
      ordinal: 1,
      document_id: document.id,
      document_title: title,
      text_version: 1,
      passages: positions.map((position) => ({ passage_id: crypto.randomUUID(), ...position })),
    });
  if (source.error) throw new Error(`Création de la Source impossible : ${source.error.message}`);
  return { documentId: document.id, conversationId: conversation.id, title, doc };
}

// Sélecteur CSS : sous 1024 px, le Sheet modal rend le fil inerte (aria-hidden), hors de l'arbre d'accessibilité.
const chip = (page: Page) => page.locator("[data-source-chip] button");
// Panneau : aside non modal (≥ 1024 px) ou Sheet modal (en dessous).
const panel = (page: Page, title: string): Locator =>
  isDesktop(page) ? page.getByRole("complementary", { name: title }) : page.getByRole("dialog", { name: title });

// Conversation rouverte : le focus dans le champ signale une page hydratée (puces actives).
async function open(page: Page, conversationId: string) {
  await page.goto(`/assistant/${conversationId}`);
  await expect(page.getByRole("textbox", { name: texts.assistant.fieldLabel })).toBeFocused();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("ouvrir une Source au clavier : focus sur le titre, puce sélectionnée, défilement jusqu'au Passage ; Échap rend le focus à la puce", async ({
  page,
  account,
}) => {
  const seeded = await seed(account, (_, doc) => [doc.p1]);
  await open(page, seeded.conversationId);
  const button = chip(page);
  await expect(button).toHaveAccessibleName(`Source 1 : ${seeded.title}`);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.focus();
  await page.keyboard.press("Enter");

  const opened = panel(page, seeded.title);
  await expect(opened).toBeVisible();
  await expect(opened.getByRole("heading", { name: seeded.title })).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(button).toHaveAttribute("data-selected", "true");
  const mark = opened.locator("mark.passage-highlight");
  await expect(mark).toHaveText(seeded.doc.first);
  await expect(mark).toBeInViewport();
  await expect(opened).toContainText(texts.categories.procedure);
  await expect(opened).toContainText(texts.status.ready);

  await page.keyboard.press("Escape");
  await expect(opened).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

test("deux Passages : « Passage 1 sur 2 », « Suivant » fait défiler jusqu'au second et l'annonce, focus gardé sur le bouton", async ({
  page,
  account,
}) => {
  const seeded = await seed(account, (_, doc) => [doc.p1, doc.p2]);
  await open(page, seeded.conversationId);
  await expect(chip(page)).toHaveAccessibleName(`Source 1 : ${seeded.title}, 2 Passages`);
  await chip(page).click();

  const opened = panel(page, seeded.title);
  const position = opened.locator("[data-source-position]");
  await expect(position).toHaveText(t.position(1, 2));
  await expect(position).toHaveAttribute("aria-live", "polite");
  const previous = opened.getByRole("button", { name: t.previous });
  const next = opened.getByRole("button", { name: t.next });
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  await expect(opened.locator("mark")).toHaveCount(2);

  await next.focus();
  await page.keyboard.press("Enter");
  await expect(position).toHaveText(t.position(2, 2));
  const active = opened.locator("mark.passage-highlight");
  await expect(active).toHaveText(seeded.doc.second);
  await expect(active).toBeInViewport();
  await expect(next).toBeFocused();
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(previous).not.toHaveAttribute("aria-disabled", "true");
});

test("forme du panneau selon la largeur : aside non modal (Conversation utilisable) ou Sheet plein écran avec « ← Retour à la Conversation » ; sans défilement horizontal", async ({
  page,
  account,
}) => {
  const seeded = await seed(account, (_, doc) => [doc.p1]);
  await open(page, seeded.conversationId);
  const button = chip(page);
  await button.click();
  const opened = panel(page, seeded.title);
  await expect(opened.locator("mark")).toHaveCount(1);
  await expectNoHorizontalScroll(page);

  if (isDesktop(page)) {
    // Non modal : aucun dialogue, le champ reste visible et utilisable à côté du panneau.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const field = page.getByRole("textbox", { name: texts.assistant.fieldLabel });
    await expect(field).toBeInViewport();
    await field.fill("Encore une question");
    await expect(field).toHaveValue("Encore une question");
    await expect(opened).toBeVisible();
    const box = (await opened.boundingBox())!;
    const fieldBox = (await field.boundingBox())!;
    expect(box.x).toBeGreaterThan(fieldBox.x + fieldBox.width - 1);
    await opened.getByRole("button", { name: t.close }).click();
  } else {
    // Sheet modal plein écran à 375 px.
    const box = (await opened.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(374);
    const width = await opened.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(width).toBeLessThanOrEqual(0);
    await opened.getByRole("button", { name: t.back }).click();
  }
  await expect(opened).toHaveCount(0);
  await expect(button).toBeFocused();
});

test("« Ouvrir la page complète » : la page Document met en évidence les mêmes Passages, Passage actif conservé", async ({ page, account }) => {
  const seeded = await seed(account, (_, doc) => [doc.p1, doc.p2]);
  await open(page, seeded.conversationId);
  await chip(page).click();
  const opened = panel(page, seeded.title);
  await opened.getByRole("button", { name: t.next }).click();
  await expect(opened.locator("[data-source-position]")).toHaveText(t.position(2, 2));

  await opened.getByRole("link", { name: t.openFullPage }).click();
  await expect(page).toHaveURL(new RegExp(`/documents/${seeded.documentId}\\?passages=`));
  const url = new URL(page.url());
  expect(url.searchParams.get("passages")).toBe(`${seeded.doc.p1.start}-${seeded.doc.p1.end},${seeded.doc.p2.start}-${seeded.doc.p2.end}`);
  expect(url.searchParams.get("actif")).toBe("1");
  await expect(page.getByRole("heading", { level: 1, name: seeded.title })).toBeVisible();
  // Navigation côté client : la page Assistant quittée reste montée, masquée (Cache Components).
  const marks = page.locator("main mark:visible");
  await expect(marks).toHaveCount(2);
  await expect(page.locator("main mark.passage-highlight:visible")).toHaveText(seeded.doc.second);
  await expect(page.locator("main mark.passage-highlight:visible")).toBeInViewport();
});
