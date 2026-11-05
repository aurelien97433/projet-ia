import AxeBuilder from "@axe-core/playwright";
import type { Page, Request } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { accountArea, expect, signInThroughForm, test } from "../support/e2e-auth";

// Connexion, déconnexion et protection des pages (E1, E9, FR-2) contre Supabase local.
const isSignInAction = (request: Request) =>
  request.method() === "POST" && "next-action" in request.headers() && new URL(request.url()).pathname === "/connexion";

async function fill(page: Page, email: string, password: string) {
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
}

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("connexion", () => {
  test("bons identifiants : Tableau de bord, e-mail affiché, session persistante", async ({ page, account, browser }) => {
    await page.goto("/connexion");
    await expect(page.locator("#email")).toBeFocused();
    await signInThroughForm(page, account);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: texts.titles.dashboard })).toBeVisible();
    await expect((await accountArea(page)).getByText(account.email)).toBeVisible();

    // Cookie de session persistant (date d'expiration), pas un cookie de session du navigateur.
    const authCookies = (await page.context().cookies()).filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    expect(authCookies.length).toBeGreaterThan(0);
    for (const cookie of authCookies) expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 7 * 24 * 3600);

    // « Fermeture et réouverture du navigateur » : nouveau contexte avec les seuls cookies conservés.
    const reopened = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      storageState: await page.context().storageState(),
      viewport: page.viewportSize(),
    });
    const again = await reopened.newPage();
    await again.goto("/bibliotheque");
    await expect(again).toHaveURL(/\/bibliotheque$/);
    await expect(again.getByRole("heading", { level: 1, name: texts.titles.library })).toBeVisible();
    await reopened.close();
  });

  test("page demandée interne : retour sur cette page, requête comprise", async ({ page, account }) => {
    await page.goto("/bibliotheque?categorie=rh");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fbibliotheque%3Fcategorie%3Drh$/);
    await fill(page, account.email, account.password);
    await page.getByRole("button", { name: texts.signIn.submit }).click();
    await expect(page).toHaveURL(/\/bibliotheque\?categorie=rh$/, { timeout: 30_000 });
  });

  for (const suite of [
    "https://exemple.com",
    "//exemple.com",
    "%2F%2Fexemple.com",
    "/%5Cexemple.com",
    "/%252F%252Fexemple.com",
    "javascript:alert(1)",
  ]) {
    test(`page demandée externe (${suite}) : refusée, arrivée sur le Tableau de bord`, async ({ page, account }) => {
      await signInThroughForm(page, account, `/connexion?suite=${encodeURIComponent(suite)}`);
      await expect(page).toHaveURL(new URL("/", test.info().project.use.baseURL).toString());
      await expect(page.getByRole("heading", { level: 1, name: texts.titles.dashboard })).toBeVisible();
    });
  }

  for (const { label, email, password } of [
    { label: "mot de passe erroné", email: null, password: "mauvais-mot-de-passe" },
    { label: "e-mail inconnu", email: "inconnu@exemple.test", password: null },
    { label: "e-mail mal formé", email: "camille@", password: null },
  ]) {
    test(`${label} : message unique sans champ désigné, focus sur le message, saisie conservée`, async ({ page, account }) => {
      const typedEmail = email ?? account.email;
      const typedPassword = password ?? account.password;
      await page.goto("/connexion");
      await fill(page, typedEmail, typedPassword);
      await page.getByRole("button", { name: texts.signIn.submit }).click();

      const alert = page.getByRole("alert").filter({ hasText: texts.signIn.errors.invalidCredentials });
      await expect(alert).toBeVisible();
      await expect(alert).toBeFocused();
      for (const field of ["#email", "#password"]) {
        await expect(page.locator(field)).not.toHaveAttribute("aria-invalid", "true");
      }
      await expect(page.locator("#email")).toHaveValue(typedEmail);
      await expect(page.locator("#password")).toHaveValue(typedPassword);
      await expect(page).toHaveURL(/\/connexion$/);
      expect(page.url()).not.toContain(typedPassword);
    });
  }

  test("double clic : une seule requête, bouton « Connexion… » en aria-disabled", async ({ page, account }) => {
    let requests = 0;
    await page.route(
      (url) => url.pathname === "/connexion",
      async (route) => {
        if (isSignInAction(route.request())) {
          requests += 1;
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        await route.continue();
      },
    );
    await page.goto("/connexion");
    await fill(page, account.email, "mauvais-mot-de-passe");
    await page.getByRole("button", { name: texts.signIn.submit }).dblclick();
    const busy = page.getByRole("button", { name: texts.signIn.submitting });
    await expect(busy).toHaveAttribute("aria-disabled", "true");
    await busy.click({ force: true });
    await expect(page.getByText(texts.signIn.errors.invalidCredentials)).toBeVisible();
    expect(requests).toBe(1);
  });

  test("réseau coupé : « Connexion perdue » + « Réessayer », qui reconnecte", async ({ page, account }) => {
    let cut = true;
    await page.route(
      (url) => url.pathname === "/connexion",
      (route) => (cut && isSignInAction(route.request()) ? route.abort("failed") : route.continue()),
    );
    await page.goto("/connexion");
    await fill(page, account.email, account.password);
    await page.getByRole("button", { name: texts.signIn.submit }).click();

    const alert = page.getByRole("alert").filter({ hasText: texts.signIn.errors.networkLost });
    await expect(alert).toBeVisible();
    await expect(alert).toBeFocused();
    await expect(page.locator("#email")).toHaveValue(account.email);
    cut = false;
    await alert.getByRole("button", { name: texts.signIn.retry }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  });

  test("afficher puis masquer le mot de passe ; lien « Créer un compte »", async ({ page }) => {
    await page.goto("/connexion");
    const password = page.locator("#password");
    await page.getByRole("button", { name: texts.auth.showPassword }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: texts.auth.hidePassword }).click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(page.getByRole("link", { name: texts.signIn.createAccount })).toHaveAttribute("href", "/inscription");
  });

  test("page E1 : français, titre, axe sans violation, sans défilement horizontal", async ({ page }) => {
    await page.goto("/connexion");
    await expect(page.getByRole("heading", { level: 1, name: texts.signIn.pageTitle })).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("protection des pages", () => {
  for (const { path, expected } of [
    { path: "/bibliotheque", expected: "/connexion?suite=%2Fbibliotheque" },
    { path: "/assistant", expected: "/connexion?suite=%2Fassistant" },
    { path: "/", expected: "/connexion" },
    { path: "/page-inexistante", expected: "/connexion?suite=%2Fpage-inexistante" },
  ]) {
    test(`Visiteur sur ${path} : redirigé vers ${expected}`, async ({ page }) => {
      await page.goto(path);
      expect(page.url()).toBe(new URL(expected, test.info().project.use.baseURL).toString());
      await expect(page.getByRole("heading", { level: 1, name: texts.signIn.pageTitle })).toBeVisible();
    });
  }

  test("cookie de session falsifié : traité comme un Visiteur", async ({ page, context }) => {
    const { hostname } = new URL(test.info().project.use.baseURL!);
    await context.addCookies([
      { name: "sb-127-auth-token", value: "base64-eyJhY2Nlc3NfdG9rZW4iOiJmYXV4In0", domain: hostname, path: "/" },
    ]);
    await page.goto("/bibliotheque");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fbibliotheque$/);
  });

  // Sans JavaScript, l'envoi natif du formulaire est un POST : le mot de passe ne figure jamais dans l'URL.
  for (const path of ["/connexion", "/inscription"]) {
    test(`envoi avant le chargement du JavaScript (${path}) : mot de passe absent de l'URL`, async ({ browser, page }) => {
      const context = await browser.newContext({
        baseURL: test.info().project.use.baseURL,
        viewport: page.viewportSize(),
        javaScriptEnabled: false,
        storageState: { cookies: [], origins: [] },
      });
      const noJs = await context.newPage();
      await noJs.goto(path);
      const secret = "mot-de-passe-sans-js";
      await fill(noJs, "camille@exemple.test", secret);
      await noJs.locator("button[type=submit]").click();
      await noJs.waitForLoadState();
      expect(noJs.url()).not.toContain(secret);
      expect(noJs.url()).not.toContain("password");
      await context.close();
    });
  }

  test("aucune boucle de redirection : /connexion et /inscription, sans puis avec session", async ({ page, account }) => {
    for (const path of ["/connexion", "/inscription", "/connexion?suite=%2Fconnexion"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
    }
    const protectedPage = await page.request.get("/bibliotheque", { maxRedirects: 0 });
    expect(protectedPage.status()).toBe(307);
    expect(protectedPage.headers().location).toMatch(/\/connexion\?suite=%2Fbibliotheque$/);

    await signInThroughForm(page, account);
    for (const path of ["/connexion", "/inscription", "/connexion?suite=%2Fconnexion"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(new URL(response.headers().location, "http://h.invalid").pathname).toBe("/");
    }
    const home = await page.request.get("/", { maxRedirects: 0 });
    expect(home.status()).toBe(200);
  });
});

test.describe("déconnexion et page introuvable", () => {
  test.use({ storageState: async ({ authState }, provide) => provide(authState) });

  test("« Se déconnecter » : retour sur /connexion avec « Vous êtes déconnecté. », pages de nouveau protégées", async ({ page, account, browser }) => {
    // Session dédiée : la déconnexion ne doit pas fermer celle partagée par les autres tests.
    // storageState vide : browser.newContext reprendrait sinon la session partagée de test.use.
    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      viewport: page.viewportSize(),
      storageState: { cookies: [], origins: [] },
    });
    const own = await context.newPage();
    await signInThroughForm(own, account);
    const area = await accountArea(own);
    await area.getByRole("button", { name: texts.shell.signOut }).click();

    await expect(own).toHaveURL(/\/connexion\?deconnecte=1$/, { timeout: 30_000 });
    await expect(own.getByRole("status")).toHaveText(texts.signIn.signedOut);
    const authCookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    expect(authCookies).toEqual([]);
    await own.goto("/bibliotheque");
    await expect(own).toHaveURL(/\/connexion\?suite=%2Fbibliotheque$/);
    await context.close();
  });

  test("URL inexistante, connecté : « Page introuvable », deux actions, focus sur le titre, statut 404", async ({ page }) => {
    const response = await page.goto("/page-inexistante");
    expect(response?.status()).toBe(404);
    const title = page.getByRole("heading", { level: 1, name: texts.notFound.title });
    await expect(title).toBeFocused();
    await expect(page.getByText(texts.notFound.text)).toBeVisible();
    await expect(page.getByRole("link", { name: texts.notFound.backToDashboard })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: texts.notFound.openAssistant })).toHaveAttribute("href", "/assistant");
    await expect(page.locator("aside")).toHaveCount(0);
    await expectNoViolations(page);
  });
});
