import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { expect, test } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Lecteur sur la page Document, avec les contenus réels des Documents pièges (2.8). Statut « prêt » posé
// à l'insertion : aucun traitement n'est déclenché.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });

const demoText = (file: string) =>
  readFileSync(path.join(__dirname, "..", "..", "demo", "documents", file), "utf8").replace(/\r\n/g, "\n");

async function insertReadyDocument(authorId: string, content: string): Promise<string> {
  const admin = createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("documents")
    .insert({
      author_id: authorId,
      title: `Lecteur ${crypto.randomUUID()}`,
      category: "other",
      content_text: content,
      status: "ready",
      client_request_id: crypto.randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  return data.id;
}

const reader = (page: Page) => page.getByRole("region", { name: texts.document.textLabel });

const expectNoAxeViolation = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
};

test(".md piège : balisage visible en texte, aucune exécution, aucun élément créé", async ({ page, account }) => {
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const id = await insertReadyDocument(account.id, demoText("test-md-piege.md"));

  await page.goto(`/documents/${id}`);
  const region = reader(page);
  await expect(region).toContainText('<script>window.__nexamindPiege = true; alert("piège");</script>');
  await expect(region).toContainText('<img src="x" onerror="window.__nexamindPiege = true">');
  await expect(region).toContainText("<a href=\"javascript:alert('piège')\">Ce lien ne doit pas exister.</a>");
  await expect(region).toContainText("**Ces astérisques restent visibles**");

  await expect(region.locator("script, img, a, b, strong, h1")).toHaveCount(0);
  await expect(region.locator("mark")).toHaveCount(0);
  expect(await page.evaluate(() => "__nexamindPiege" in window)).toBe(false);
  expect(dialogs).toEqual([]);
  await expectNoAxeViolation(page);
});

test.describe("piège à 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("aucun défilement horizontal", async ({ page, account }) => {
    const id = await insertReadyDocument(account.id, demoText("test-piege-375.md"));
    await page.goto(`/documents/${id}`);
    await expect(reader(page)).toContainText("anticonstitutionnellement");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    const box = await reader(page).boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
    await expectNoAxeViolation(page);
  });
});
