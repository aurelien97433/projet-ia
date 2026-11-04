import { expect, test } from "@playwright/test";

test("la page d'accueil répond et affiche un titre", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("h1")).toBeVisible();
});
