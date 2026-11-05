import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page, Request } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { expect, test } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// E8 Ajouter (onglet Note) et E7 minimale, contre Supabase local, avec la session du worker.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });
// Première compilation de la page Document et de la Server Action en développement : plusieurs secondes.
test.describe.configure({ timeout: 60_000 });

const t = texts.addDocument;
const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

const uniqueTitle = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function countByTitle(title: string): Promise<number> {
  const { count, error } = await admin().from("documents").select("id", { count: "exact", head: true }).eq("title", title);
  expect(error).toBeNull();
  return count ?? -1;
}

async function fillNote(page: Page, title: string, content = "Texte de la Note.\nDeuxième ligne.") {
  await page.locator("#title").fill(title);
  await page.locator("#category").selectOption("procedure");
  if (content.length < 10_000) {
    await page.locator("#content").fill(content);
    return;
  }
  // Texte de l'ordre du mégaoctet : valeur posée d'un coup, avec l'événement que React écoute
  // (fill() la transmettrait trop lentement).
  await page.locator("#content").evaluate((element, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, content);
}

const isCreateAction = (request: Request) =>
  request.method() === "POST" && "next-action" in request.headers() && new URL(request.url()).pathname === "/ajouter";

// Texte de n octets UTF-8 exactement, en lignes de « é » (2 octets) : environ n/2 caractères.
// Des lignes courtes, comme un vrai texte : un mot unique d'un mégaoctet bloquerait la mise en page.
function textOfBytes(n: number): string {
  const line = `${"é".repeat(99)}\n`; // 199 octets
  const lines = Math.floor(n / 199);
  return line.repeat(lines) + "a".repeat(n - lines * 199);
}

const DOCUMENT_URL = /\/documents\/[0-9a-f-]{36}\?ajoute=1$/;

test("crée une Note : page du Document, notification, badge « en cours de traitement », texte brut", async ({ page, account }) => {
  const title = uniqueTitle("Procédure de facturation");
  await page.goto("/ajouter");
  await expect(page.getByRole("tab", { name: t.noteTab })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#title")).toBeFocused();
  await fillNote(page, title, "Ligne 1\n<b>pas du HTML</b>");
  await page.getByRole("button", { name: t.submit }).click();

  await expect(page).toHaveURL(DOCUMENT_URL, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: texts.document.added })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const metadata = page.locator("main dl");
  await expect(metadata.getByText(texts.status.processing)).toBeVisible();
  await expect(metadata.getByText("◔")).toBeVisible();
  await expect(metadata.getByText(texts.categories.procedure, { exact: true })).toBeVisible();
  await expect(page.locator("main article").getByText("<b>pas du HTML</b>")).toBeVisible();
  await expect(page.locator("main b")).toHaveCount(0);

  const { data } = await admin().from("documents").select("author_id, status, attempt_id").eq("title", title).single();
  expect(data?.status).toBe("processing");
  expect(data?.attempt_id).toBeTruthy();
  expect(data?.author_id).toBe(account.id);
});

test("champs manquants : aucun envoi, focus sur le premier champ manquant, message sous le champ", async ({ page }) => {
  let requests = 0;
  page.on("request", (request) => {
    if (isCreateAction(request)) requests += 1;
  });
  await page.goto("/ajouter");
  const submit = page.getByRole("button", { name: t.submit });

  await submit.click();
  await expect(page.locator("#title")).toBeFocused();
  for (const [field, message] of [
    ["#title", t.errors.titleMissing],
    ["#category", t.errors.categoryMissing],
    ["#content", t.errors.textMissing],
  ]) {
    await expect(page.locator(field)).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(field)).toHaveAccessibleDescription(message);
  }

  await page.locator("#title").fill("Un titre");
  await submit.click();
  await expect(page.locator("#category")).toBeFocused();
  await page.locator("#category").selectOption("faq");
  await submit.click();
  await expect(page.locator("#content")).toBeFocused();
  expect(requests).toBe(0);
});

test("texte de plus de 1 000 000 octets : message sous « Texte », saisie conservée, aucun Document", async ({ page }) => {
  const title = uniqueTitle("Trop long");
  await page.goto("/ajouter");
  // Environ 500 000 caractères pour 1 000 001 octets UTF-8 : la limite est comptée en octets.
  await fillNote(page, title, textOfBytes(1_000_001));
  await page.getByRole("button", { name: t.submit }).click();
  await expect(page.locator("#content")).toHaveAccessibleDescription(t.errors.textTooLarge);
  await expect(page.locator("#content")).toBeFocused();
  expect(await page.locator("#content").evaluate((el) => (el as HTMLTextAreaElement).value.length)).toBe(502_526);
  await expect(page).toHaveURL(/\/ajouter$/);
  expect(await countByTitle(title)).toBe(0);
});

test("texte de 1 000 000 octets exactement : Document créé (limite des Server Actions relevée à 2 Mo)", async ({ page }) => {
  const title = uniqueTitle("À la limite");
  await page.goto("/ajouter");
  await fillNote(page, title, textOfBytes(1_000_000));
  await page.getByRole("button", { name: t.submit }).click();
  await expect(page).toHaveURL(DOCUMENT_URL, { timeout: 60_000 });
  const { data } = await admin().from("documents").select("content_text").eq("title", title).single();
  expect(new TextEncoder().encode(data?.content_text ?? "").length).toBe(1_000_000);
});

test("double clic : une seule requête, « Enregistrement… » en aria-disabled, un seul Document", async ({ page }) => {
  let requests = 0;
  await page.route(
    (url) => url.pathname === "/ajouter",
    async (route) => {
      if (isCreateAction(route.request())) {
        requests += 1;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      await route.continue();
    },
  );
  const title = uniqueTitle("Double clic");
  await page.goto("/ajouter");
  await fillNote(page, title);
  await page.getByRole("button", { name: t.submit }).dblclick();
  const busy = page.getByRole("button", { name: t.submitting });
  await expect(busy).toHaveAttribute("aria-disabled", "true");
  await busy.click({ force: true });
  await expect(page).toHaveURL(DOCUMENT_URL, { timeout: 30_000 });
  expect(requests).toBe(1);
  expect(await countByTitle(title)).toBe(1);
});

test("réponse perdue après la création, puis « Réessayer » : même identifiant de demande, un seul Document", async ({ page }) => {
  let attempts = 0;
  const requestIds: string[] = [];
  await page.route(
    (url) => url.pathname === "/ajouter",
    async (route) => {
      const request = route.request();
      if (!isCreateAction(request)) return route.continue();
      attempts += 1;
      requestIds.push(request.postData()?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0] ?? "");
      if (attempts === 1) {
        // Le serveur crée le Document, mais le navigateur ne reçoit pas la réponse.
        await route.fetch();
        return route.abort("failed");
      }
      return route.continue();
    },
  );
  const title = uniqueTitle("Réponse perdue");
  await page.goto("/ajouter");
  await fillNote(page, title);
  await page.getByRole("button", { name: t.submit }).click();

  const alert = page.getByRole("alert").filter({ hasText: t.errors.saveFailed });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert).toBeFocused();
  await expect(page.locator("#title")).toHaveValue(title);
  await alert.getByRole("button", { name: t.retry }).click();

  await expect(page).toHaveURL(DOCUMENT_URL, { timeout: 30_000 });
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBe(requestIds[1]);
  expect(await countByTitle(title)).toBe(1);
});

test("Annuler avec une saisie : « Abandonner ce Document ? » ; « Continuer la saisie » conserve tout", async ({ page }) => {
  await page.goto("/ajouter");
  await fillNote(page, "Brouillon");
  await page.getByRole("button", { name: t.cancel }).click();
  const dialog = page.getByRole("alertdialog", { name: t.abandon.title });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(t.abandon.text);
  await dialog.getByRole("button", { name: t.abandon.keep }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#title")).toHaveValue("Brouillon");
  await expect(page.locator("#category")).toHaveValue("procedure");
  await expect(page.locator("#content")).toHaveValue("Texte de la Note.\nDeuxième ligne.");

  await page.getByRole("button", { name: t.cancel }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: t.abandon.confirm }).click();
  await expect(page).not.toHaveURL(/\/ajouter$/);
});

test("Annuler sans saisie : retour à l'écran précédent, sans dialogue", async ({ page }) => {
  await page.goto("/bibliotheque");
  await page.goto("/ajouter");
  await page.getByRole("button", { name: t.cancel }).click();
  await expect(page).toHaveURL(/\/bibliotheque$/);
});

test("session absente au moment de l'envoi : aucun Document créé", async ({ page, context }) => {
  const title = uniqueTitle("Sans session");
  await page.goto("/ajouter");
  await fillNote(page, title);
  await context.clearCookies();
  await page.getByRole("button", { name: t.submit }).click();
  const alert = page.getByRole("alert").filter({ hasText: texts.session.expired });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert.getByRole("button", { name: t.retry })).toHaveCount(0);
  expect(await countByTitle(title)).toBe(0);
});

for (const id of ["abc", "00000000-0000-4000-8000-000000000000"]) {
  // La coquille est envoyée en flux avant la lecture du Document : notFound() garde alors le statut
  // 200 et ajoute <meta name="robots" content="noindex"> (documentation de Next.js 16).
  test(`Document inconnu (${id}) : « Page introuvable » (E9), non indexée`, async ({ page }) => {
    await page.goto(`/documents/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: texts.notFound.title })).toBeVisible();
    await expect(page.getByText(texts.notFound.text)).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
  });
}

test("E8 et E7 : axe sans violation, sans défilement horizontal (texte sans espaces)", async ({ page }) => {
  await page.goto("/ajouter");
  for (const target of ["E8"]) {
    const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
    expect(results.violations.map((v) => `${target} ${v.id}`)).toEqual([]);
  }
  await fillNote(page, uniqueTitle("Largeur"), `https://exemple.test/${"x".repeat(400)}`);
  await page.getByRole("button", { name: t.submit }).click();
  await expect(page).toHaveURL(DOCUMENT_URL, { timeout: 30_000 });
  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => `E7 ${v.id}`)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
