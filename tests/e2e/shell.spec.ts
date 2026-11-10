import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { expect, isDesktop, test } from "../support/e2e-auth";

// Coquille des écrans protégés : chaque test part avec la session du Compte du worker.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });

const RING_COLOR = "rgb(14, 90, 107)"; // {colors.ring} #0E5A6B

const PAGES = [
  { path: "/", title: texts.titles.dashboard },
  { path: "/assistant", title: texts.titles.assistantEmpty },
  { path: "/recherche", title: texts.titles.search },
  { path: "/bibliotheque", title: texts.titles.library },
  { path: "/ajouter", title: texts.titles.addDocument },
];

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("coquille commune", () => {
  for (const { path, title } of PAGES) {
    test(`${path} : français, titre, axe sans violation, sans défilement horizontal`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("link", { name: texts.app.name })).toBeVisible();
      await expectNoHorizontalScroll(page);

      const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
      expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }

  test("fond clair même si le système est en mode sombre", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe("rgb(255, 255, 255)");
  });

  test("premier arrêt de tabulation : « Aller au contenu », visible, puis contenu principal", async ({ page }) => {
    await page.goto("/bibliotheque");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: texts.shell.skipLink });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });

  test("anneau de focus plein, 2 px, décalé de 2 px, couleur {colors.ring}", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const shadow = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow);
    expect(shadow).toContain(RING_COLOR);
    expect(shadow).toContain("0px 0px 0px 4px");
    expect(shadow).toContain("0px 0px 0px 2px");
  });
});

test.describe("ordinateur (≥ 1 024 px)", () => {
  test.beforeEach(({ page }) => test.skip(!isDesktop(page), "vue ordinateur uniquement"));

  test("barre latérale : « + Ajouter », 4 entrées, entrée active, pied de compte", async ({ page, account }) => {
    await page.goto("/bibliotheque");
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: texts.shell.addAction })).toBeVisible();
    for (const label of Object.values(texts.nav)) {
      await expect(sidebar.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await expect(sidebar.getByRole("link", { name: texts.nav.library })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: texts.nav.dashboard })).not.toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByText(account.email)).toBeVisible();
    const signOut = sidebar.getByRole("button", { name: texts.shell.signOut });
    await expect(signOut).not.toHaveAttribute("aria-disabled", "true");
    await signOut.focus();
    await expect(signOut).toBeFocused();
    await expect(page.getByRole("button", { name: texts.shell.openMenu })).toBeHidden();
  });

  test("changement d'écran : le focus va sur le titre du nouvel écran", async ({ page }) => {
    await page.goto("/");
    await page.locator("aside").getByRole("link", { name: texts.nav.search }).click();
    await expect(page).toHaveURL(/\/recherche$/);
    await expect(page.getByRole("heading", { level: 1, name: texts.titles.search })).toBeFocused();
  });
});

test.describe("mobile (375 px)", () => {
  test.beforeEach(({ page }) => test.skip(isDesktop(page), "vue mobile uniquement"));

  test("barre du haut : ☰ · logo · « + » nommé « Ajouter un Document », sans barre latérale", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: texts.shell.openMenu })).toBeVisible();
    // Barre du haut seulement : le Tableau de bord a aussi son « Ajouter un Document » (story 3.5).
    await expect(page.locator("header").getByRole("link", { name: texts.shell.addDocumentLabel })).toBeVisible();
    await expect(page.locator("aside")).toBeHidden();
  });

  test("menu : s'ouvre, se ferme par Échap, le focus revient sur ☰", async ({ page, account }) => {
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: texts.shell.openMenu });
    await menuButton.click();
    const dialog = page.getByRole("dialog", { name: texts.shell.menuTitle });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: texts.nav.dashboard })).toHaveAttribute("aria-current", "page");
    await expect(dialog.getByText(account.email)).toBeVisible();
    await expect(dialog.getByRole("button", { name: texts.shell.signOut })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  test("menu : un lien navigue, ferme le menu, le focus revient sur ☰", async ({ page }) => {
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: texts.shell.openMenu });
    await menuButton.click();
    await page.getByRole("dialog").getByRole("link", { name: texts.nav.library }).click();
    await expect(page).toHaveURL(/\/bibliotheque$/);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(menuButton).toBeFocused();
    await expectNoHorizontalScroll(page);
  });
});
