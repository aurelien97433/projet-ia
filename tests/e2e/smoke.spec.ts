import { expect, test } from "@playwright/test";
import { texts } from "../../src/lib/texts";

// Fumée sans session : l'application répond et mène un Visiteur à la Connexion. Le Tableau de bord
// connecté est couvert par shell.spec.ts et connexion.spec.ts.
test("l'application répond et mène un Visiteur à la Connexion", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByRole("heading", { level: 1, name: texts.signIn.pageTitle })).toBeVisible();
});
