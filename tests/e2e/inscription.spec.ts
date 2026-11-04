import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { localSupabase, uniqueEmail } from "../support/local-supabase";

// Création de Compte (E2, FR-1) contre Supabase local.
const PASSWORD = ["Mot", "de", "passe", "e2e", "2026"].join("-");
const created: string[] = [];

const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

// Nettoyage par auth.users (et non par profiles) : les Comptes sont supprimés même si le
// déclencheur n'a pas créé leur profil.
test.afterAll(async () => {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  for (const user of data?.users ?? []) {
    if (user.email && created.includes(user.email)) await admin().auth.admin.deleteUser(user.id);
  }
});

async function profileCount(email: string): Promise<number> {
  const { count, error } = await admin().from("profiles").select("id", { count: "exact", head: true }).eq("email", email);
  expect(error).toBeNull();
  return count ?? -1;
}

async function fill(page: Page, email: string, password: string) {
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
}

const isServerAction = (method: string, headers: Record<string, string>) =>
  method === "POST" && "next-action" in headers;

test("crée le Compte sans confirmation par e-mail et ouvre le Tableau de bord connecté", async ({ page, context }) => {
  const email = uniqueEmail("e2e-creation");
  created.push(email);
  await page.goto("/inscription");
  await expect(page.locator("#email")).toBeFocused();
  await fill(page, email, PASSWORD);
  await page.getByRole("button", { name: texts.signUp.submit }).click();

  // La première exécution de la Server Action est compilée à la demande en développement.
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: texts.titles.dashboard })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))).toBe(true);
  expect(page.url()).not.toContain(PASSWORD);

  const { data } = await admin().from("profiles").select("display_name").eq("email", email).single();
  expect(data?.display_name).toBe(email.split("@")[0]);
});

for (const { label, email, password, field, message } of [
  { label: "e-mail mal formé", email: "camille@", password: PASSWORD, field: "#email", message: texts.signUp.errors.invalidEmail },
  { label: "mot de passe de 7 caractères", email: uniqueEmail("e2e-court"), password: "1234567", field: "#password", message: texts.signUp.errors.passwordTooShort },
  { label: "mot de passe de 73 caractères", email: uniqueEmail("e2e-long"), password: "a".repeat(73), field: "#password", message: texts.signUp.errors.passwordTooLong },
]) {
  test(`refuse un ${label} : message sous le champ, saisie conservée, aucun Compte`, async ({ page }) => {
    await page.goto("/inscription");
    await fill(page, email, password);
    await page.getByRole("button", { name: texts.signUp.submit }).click();

    const input = page.locator(field);
    await expect(page.getByText(message)).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await expect(input).toBeFocused();
    await expect(page.locator("#email")).toHaveValue(email);
    await expect(page.locator("#password")).toHaveValue(password);
    await expect(page).toHaveURL(/\/inscription$/);
    expect(await profileCount(email)).toBe(0);
  });
}

test("refuse un e-mail déjà utilisé avec le message de FR-1 et le lien « Se connecter »", async ({ page }) => {
  const email = uniqueEmail("e2e-doublon");
  created.push(email);
  const seeded = await createClient(localSupabase().url, localSupabase().publishableKey, {
    auth: { persistSession: false },
  }).auth.signUp({ email, password: PASSWORD });
  expect(seeded.error).toBeNull();

  await page.goto("/inscription");
  await fill(page, email, PASSWORD);
  await page.getByRole("button", { name: texts.signUp.submit }).click();

  await expect(page.getByText(texts.signUp.errors.emailTaken)).toBeVisible();
  await expect(page.getByRole("link", { name: texts.auth.signInLink })).toHaveAttribute("href", "/connexion");
  await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
  expect(await profileCount(email)).toBe(1);
});

test("double clic : une seule requête, bouton « Création… » en aria-disabled", async ({ page }) => {
  let requests = 0;
  // Ralentit l'envoi pour observer l'état occupé et tenter un second envoi pendant l'attente.
  await page.route("**/inscription", async (route) => {
    const request = route.request();
    if (isServerAction(request.method(), request.headers())) {
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });

  await page.goto("/inscription");
  await fill(page, "camille@", PASSWORD);
  const button = page.getByRole("button", { name: texts.signUp.submit });
  await button.dblclick();

  const busy = page.getByRole("button", { name: texts.signUp.submitting });
  await expect(busy).toHaveAttribute("aria-disabled", "true");
  // force : Playwright attendrait sinon que le bouton redevienne actif, ce qui serait un nouvel envoi.
  await busy.click({ force: true });
  await expect(page.getByText(texts.signUp.errors.invalidEmail)).toBeVisible();
  expect(requests).toBe(1);
});

test("double clic avec une saisie valide : un seul Compte créé", async ({ page }) => {
  let requests = 0;
  await page.route("**/inscription", async (route) => {
    const request = route.request();
    if (isServerAction(request.method(), request.headers())) {
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });
  const email = uniqueEmail("e2e-double");
  created.push(email);

  await page.goto("/inscription");
  await fill(page, email, PASSWORD);
  await page.getByRole("button", { name: texts.signUp.submit }).dblclick();
  await page.getByRole("button", { name: texts.signUp.submitting }).click({ force: true });

  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  expect(requests).toBe(1);
  expect(await profileCount(email)).toBe(1);
});

test("erreur inattendue (requête coupée) : alerte du catalogue, saisie conservée", async ({ page }) => {
  await page.route("**/inscription", (route) =>
    isServerAction(route.request().method(), route.request().headers()) ? route.abort("failed") : route.continue(),
  );
  const email = uniqueEmail("e2e-panne");
  await page.goto("/inscription");
  await fill(page, email, PASSWORD);
  await page.getByRole("button", { name: texts.signUp.submit }).click();

  const alert = page.getByRole("alert").filter({ hasText: texts.signUp.errors.unexpectedTitle });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(texts.signUp.errors.unexpectedText);
  await expect(page.locator("#email")).toHaveValue(email);
  await expect(page.getByRole("button", { name: texts.signUp.submit })).not.toHaveAttribute("aria-disabled", "true");
});

test("afficher puis masquer le mot de passe", async ({ page }) => {
  await page.goto("/inscription");
  const password = page.locator("#password");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: texts.auth.showPassword }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: texts.auth.hidePassword }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("page en français, axe sans violation, sans défilement horizontal", async ({ page }) => {
  await page.goto("/inscription");
  await expect(page.getByRole("heading", { level: 1, name: texts.signUp.pageTitle })).toBeVisible();
  await expect(page.getByText(texts.signUp.passwordHelp)).toBeVisible();
  await expect(page.getByRole("link", { name: texts.signUp.alreadyHaveAccount })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
