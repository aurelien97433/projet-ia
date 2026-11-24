import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page, type Request } from "@playwright/test";
import { EMBEDDING_MODEL, EMBEDDING_VERSION } from "../../../supabase/functions/_shared/config.ts";
import { fakeVector } from "../../../supabase/functions/_shared/fake-embeddings.ts";
import { localSupabase } from "../../support/local-supabase";

// Parcours UJ-1 et UJ-3 (story 7.3), mode local seulement (pile locale, génération simulée) : outils
// communs. Les Documents de test sont écrits par service_role sur la pile locale (jeu de données du
// test, comme assistant.spec.ts et history.spec.ts), jamais sur le projet distant.

const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

export const journeyTag = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

// Section d'un Document de test. vectorOf : texte dont le vecteur simulé est donné au Passage (la
// question ou la Requête du parcours : similarité 1, rang garanti avec la vectorisation simulée) ;
// absent, le vecteur du Passage lui-même.
export type SeedSection = { text: string; vectorOf?: string };
export type SeededPassage = { text: string; start: number; end: number };
export type SeededDocument = { id: string; title: string; passages: SeededPassage[] };

// Document prêt, un Passage par section (texte séparé par une ligne vide), Auteur : le Compte donné.
export async function seedReadyDocument(
  authorId: string,
  input: { title: string; category: string; sections: SeedSection[] },
): Promise<SeededDocument> {
  const passages: SeededPassage[] = [];
  let content = "";
  for (const section of input.sections) {
    if (content) content += "\n\n";
    passages.push({ text: section.text, start: content.length, end: content.length + section.text.length });
    content += section.text;
  }
  const { data, error } = await admin()
    .from("documents")
    .insert({
      author_id: authorId,
      title: input.title,
      category: input.category,
      content_text: content,
      status: "ready",
      client_request_id: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  const rows = input.sections.map((section, ordinal) => ({
    document_id: data.id,
    text_version: 1,
    ordinal,
    start_offset: passages[ordinal].start,
    end_offset: passages[ordinal].end,
    content: section.text,
    embedding: JSON.stringify(fakeVector(section.vectorOf ?? section.text)),
    embedding_model: EMBEDDING_MODEL,
    embedding_version: EMBEDDING_VERSION,
  }));
  const inserted = await admin().from("passages").insert(rows);
  if (inserted.error) {
    await admin().from("documents").delete().eq("id", data.id);
    throw new Error(`Création des Passages de test impossible : ${inserted.error.message}`);
  }
  return { id: data.id as string, title: input.title, passages };
}

export async function deleteDocuments(ids: string[]): Promise<void> {
  if (ids.length > 0) await admin().from("documents").delete().in("id", ids);
}

// Compte créé par /inscription (UJ-3) : retrouvé par son e-mail (profil créé par le déclencheur).
export async function profileIdByEmail(email: string): Promise<string | null> {
  const { data } = await admin().from("profiles").select("id").eq("email", email).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

// Suppression de ce Compte ; ses Conversations partent avec lui (cascade). Renvoie l'identifiant, ou null.
export async function deleteAccountByEmail(email: string): Promise<string | null> {
  const id = await profileIdByEmail(email);
  if (id) await admin().auth.admin.deleteUser(id);
  return id;
}

// Relevé réseau du navigateur (AR-21, NFR-2) : toutes les requêtes de la page.
export function collectRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  return requests;
}

// Aucune requête du navigateur vers OpenAI ni vers les Edge Functions de Supabase.
export function expectBrowserBoundary(requests: Request[]): void {
  expect(requests.length).toBeGreaterThan(0);
  const forbidden = requests.map((request) => request.url()).filter((url) => url.includes("api.openai.com") || url.includes("/functions/v1/"));
  expect(forbidden).toEqual([]);
}

// Aucun défilement horizontal de la page (scrollWidth ≤ clientWidth).
export async function expectNoHorizontalScroll(page: Page, screen: string): Promise<void> {
  const sizes = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(sizes.scroll, `défilement horizontal sur ${screen}`).toBeLessThanOrEqual(sizes.client);
}

// axe, règles WCAG 2 A et AA, sans violation (indicateur de développement de Next.js exclu).
export async function expectNoAxeViolation(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("nextjs-portal").analyze();
  expect(
    results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    `violations axe sur ${screen}`,
  ).toEqual([]);
}

// Lien hydraté (gestionnaire React posé) : sinon Entrée ferait un chargement complet de la page, où le
// focus n'est jamais déplacé (règle du lien d'évitement).
export async function waitForHydratedLink(page: Page, href: string): Promise<void> {
  await page.waitForFunction(
    (target) =>
      [...document.querySelectorAll(`a[href="${target}"]`)].some((a) => Object.keys(a).some((k) => k.startsWith("__reactProps"))),
    href,
  );
}

// Verrou entre workers : tests/e2e/support/journey-lock.ts (sans dépendance à Playwright, importé par
// global-setup.ts).
export { acquireJourneyLock, LOCK_WAIT_MAX_MS, removeJourneyLocks } from "./journey-lock";

// Assistant vide ouvert par la navigation, au clavier (focus posé puis Entrée) : entrée « Assistant » de
// la barre latérale sur ordinateur ; sous 1 024 px, bouton ☰ puis entrée du menu.
export async function openAssistantByNavigation(page: Page, labels: { assistant: string; openMenu: string; menuTitle: string }): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await waitForHydratedLink(page, "/assistant");
    const link = page.locator("aside nav").getByRole("link", { name: labels.assistant, exact: true });
    await link.focus();
    await page.keyboard.press("Enter");
  } else {
    const menu = page.getByRole("button", { name: labels.openMenu });
    await page.waitForFunction(
      (label) => {
        const button = document.querySelector(`button[aria-label="${label}"]`);
        return !!button && Object.keys(button).some((k) => k.startsWith("__reactProps"));
      },
      labels.openMenu,
    );
    await menu.focus();
    await page.keyboard.press("Enter");
    const link = page.getByRole("dialog", { name: labels.menuTitle }).getByRole("link", { name: labels.assistant, exact: true });
    await link.focus();
    await page.keyboard.press("Enter");
  }
  await page.waitForURL((url) => url.pathname === "/assistant");
}
