import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { expect, isDesktop, test } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// E8 onglet Fichier (story 2.6a), sur le build de production et Supabase local : contrôle avant tout
// envoi, dépôt direct dans le Storage par URL signée, échec et « Réessayer », import, page Document.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });
test.describe.configure({ timeout: 60_000 });

const t = texts.addDocument;
const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

const created: string[] = [];
test.afterEach(async () => {
  if (created.length === 0) return;
  const { data } = await admin().from("documents").select("id, storage_path").in("id", created);
  await admin().from("documents").delete().in("id", created.splice(0));
  const paths = (data ?? []).map((row) => row.storage_path as string).filter(Boolean);
  if (paths.length > 0) await admin().storage.from("documents").remove(paths);
});

const DOCUMENT_URL = /\/documents\/([0-9a-f-]{36})$/;
const marker = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const zone = (page: Page) => page.locator("[data-drop-zone]");
const fileMessage = (page: Page) => page.locator("#file-message");
const importButton = (page: Page) => page.getByRole("button", { name: t.importSubmit, exact: true });
const isStorageUpload = (url: string | URL) => String(url).includes("/storage/v1/object/upload/sign/");

async function openFileTab(page: Page) {
  await page.goto("/ajouter");
  await page.getByRole("tab", { name: t.noteTab }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: t.fileTab })).toHaveAttribute("aria-selected", "true");
}

// Choix d'un fichier au clavier : « Choisir un fichier » puis Entrée ouvre le sélecteur.
async function chooseFile(page: Page, name: string, content: string | Buffer) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: t.chooseFile }).focus();
  await page.keyboard.press("Enter");
  await (await chooser).setFiles({ name, mimeType: "application/octet-stream", buffer: Buffer.from(content) });
}

test("parcours au clavier : .md déposé, titre prérempli et modifiable, import, Document prêt", async ({ page, account }) => {
  const id = marker();
  await openFileTab(page);
  await chooseFile(page, `procedure-conges-${id}.md`, "# Procédure congés\n\nPoser ses congés deux semaines à l'avance.\n");
  await expect(fileMessage(page)).toHaveText(t.uploaded(`procedure-conges-${id}.md`));
  await expect(page.locator("#file-title")).toHaveValue(`procedure-conges-${id}`);
  await expect(importButton(page)).not.toHaveAttribute("aria-disabled", "true");

  const title = `Procédure congés ${id}`;
  await page.locator("#file-title").fill(title);
  await page.locator("#file-category").selectOption("procedure");
  await importButton(page).focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(DOCUMENT_URL, { timeout: 30_000 });
  const documentId = DOCUMENT_URL.exec(page.url())![1];
  created.push(documentId);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.locator("main dl").getByText(texts.status.ready)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("main article").getByText("Poser ses congés deux semaines à l'avance.")).toBeVisible();

  const { data } = await admin()
    .from("documents")
    .select("author_id, kind, mime_type, storage_path, status")
    .eq("id", documentId)
    .single();
  expect(data).toMatchObject({ author_id: account.id, kind: "file", mime_type: "text/markdown", status: "ready" });
  expect(data?.storage_path).toMatch(new RegExp(`^${account.id}/uploads/[0-9a-f-]{36}\\.md$`));
});

test(".docx et .txt de 1 200 000 octets : refusés avant tout envoi, autres champs conservés", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/uploads") || isStorageUpload(request.url())) requests.push(request.url());
  });
  await openFileTab(page);
  await page.locator("#file-title").fill("Titre saisi");
  await page.locator("#file-category").selectOption("faq");

  await chooseFile(page, "rapport.docx", "PK");
  await expect(fileMessage(page)).toHaveText(t.errors.fileFormat);
  await chooseFile(page, "gros.txt", Buffer.alloc(1_200_000, 97));
  await expect(fileMessage(page)).toHaveText(t.errors.fileTooLarge);

  await expect(page.locator("#file-title")).toHaveValue("Titre saisi");
  await expect(page.locator("#file-category")).toHaveValue("faq");
  expect(requests).toEqual([]);

  await importButton(page).click();
  await expect(fileMessage(page)).toHaveText(t.errors.fileMissing);
  await expect(page.getByRole("button", { name: t.chooseFile })).toBeFocused();
});

test("échec du dépôt : message et « Réessayer », champs conservés ; « Réessayer » dépose le fichier", async ({ page }) => {
  let failNext = true;
  await page.route(isStorageUpload, async (route) => {
    if (failNext && route.request().method() === "PUT") {
      failNext = false;
      await route.fulfill({ status: 500, body: "panne" });
    } else await route.continue();
  });
  await openFileTab(page);
  await page.locator("#file-category").selectOption("procedure");
  await chooseFile(page, "notes.txt", "Texte des notes.");
  await expect(fileMessage(page)).toHaveText(t.errors.uploadFailed);
  await expect(page.locator("#file-title")).toHaveValue("notes");
  await expect(page.locator("#file-category")).toHaveValue("procedure");

  await zone(page).getByRole("button", { name: t.retry }).click();
  await expect(fileMessage(page)).toHaveText(t.uploaded("notes.txt"));
  await expect(page.locator("#file-title")).toHaveValue("notes");
  await expect(page.locator("#file-category")).toHaveValue("procedure");
});

test("« Importer » inactif pendant le dépôt, avec « Dépôt du fichier… »", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(isStorageUpload, async (route) => {
    await gate;
    await route.continue();
  });
  await openFileTab(page);
  await chooseFile(page, "lent.txt", "Texte.");
  await expect(fileMessage(page)).toContainText(t.uploading);
  await expect(page.getByRole("progressbar", { name: t.uploading })).toBeVisible();
  await expect(importButton(page)).toHaveAttribute("aria-disabled", "true");
  release();
  await expect(fileMessage(page)).toHaveText(t.uploaded("lent.txt"));
});

test("375 px : aucun défilement horizontal, bouton principal en premier ; axe sans violation", async ({ page }) => {
  test.skip(isDesktop(page), "vue mobile uniquement");
  await openFileTab(page);
  await chooseFile(page, `${"Nomtreslongsansespace".repeat(8)}.txt`, "Texte.");
  await expect(fileMessage(page)).toContainText("Fichier déposé");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  const submit = await importButton(page).boundingBox();
  const cancel = await page.getByRole("button", { name: t.cancel }).boundingBox();
  if (!submit || !cancel) throw new Error("Boutons invisibles");
  expect(submit.y).toBeLessThan(cancel.y);
  const results = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("POST /api/uploads sans session : 401 ; avec session : URL signée pour son propre dossier", async ({ page, playwright, baseURL, account }) => {
  // Contexte sans session : la session du fichier (test.use) serait sinon reprise.
  const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const refused = await anonymous.post("/api/uploads", { data: { fileName: "a.txt", size: 1 }, maxRedirects: 0 });
  expect(refused.status()).toBe(401);
  await anonymous.dispose();

  const response = await page.request.post("/api/uploads", { data: { fileName: "a.md", size: 1 } });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const { uploadId, signedUrl } = (await response.json()) as { uploadId: string; signedUrl: string };
  expect(uploadId).toMatch(/^[0-9a-f-]{36}\.md$/);
  expect(decodeURIComponent(signedUrl)).toContain(`/documents/${account.id}/uploads/${uploadId}`);
  expect((await page.request.post("/api/uploads", { data: { fileName: "a.docx", size: 1 } })).status()).toBe(400);
});

test("réponse perdue après l'import, puis « Réessayer » : même identifiant de demande, un seul Document", async ({ page }) => {
  let attempts = 0;
  const requestIds: string[] = [];
  await page.route(
    (url) => url.pathname === "/ajouter",
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST" || !("next-action" in request.headers())) return route.continue();
      attempts += 1;
      requestIds.push(/clientRequestId"\r\n\r\n([0-9a-f-]{36})/.exec(request.postData() ?? "")?.[1] ?? "");
      if (attempts === 1) {
        // Le serveur crée le Document, mais le navigateur ne reçoit pas la réponse.
        await route.fetch();
        return route.abort("failed");
      }
      return route.continue();
    },
  );
  const id = marker();
  await openFileTab(page);
  await chooseFile(page, `perdu-${id}.txt`, "Texte importé.");
  await expect(fileMessage(page)).toHaveText(t.uploaded(`perdu-${id}.txt`));
  await page.locator("#file-category").selectOption("faq");
  await importButton(page).click();

  const alert = page.getByRole("alert").filter({ hasText: t.errors.saveFailed });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert).toBeFocused();
  await expect(page.locator("#file-title")).toHaveValue(`perdu-${id}`);
  await alert.getByRole("button", { name: t.retry }).click();

  await expect(page).toHaveURL(DOCUMENT_URL, { timeout: 30_000 });
  created.push(DOCUMENT_URL.exec(page.url())![1]);
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toMatch(/^[0-9a-f-]{36}$/);
  expect(requestIds[0]).toBe(requestIds[1]);
  const { count } = await admin().from("documents").select("id", { count: "exact", head: true }).eq("title", `perdu-${id}`);
  expect(count).toBe(1);
});

test("changer d'onglet ne perd ni le titre, ni la Catégorie, ni le fichier déposé", async ({ page }) => {
  await openFileTab(page);
  await chooseFile(page, "onglets.md", "Texte.");
  await expect(fileMessage(page)).toHaveText(t.uploaded("onglets.md"));
  await page.locator("#file-category").selectOption("other");
  await page.getByRole("tab", { name: t.noteTab }).click();
  await expect(page.locator("#title")).toBeVisible();
  await expect(page.locator("#file-title")).toBeHidden();
  await page.getByRole("tab", { name: t.fileTab }).click();
  await expect(page.locator("#file-title")).toHaveValue("onglets");
  await expect(page.locator("#file-category")).toHaveValue("other");
  await expect(fileMessage(page)).toHaveText(t.uploaded("onglets.md"));
  await expect(importButton(page)).not.toHaveAttribute("aria-disabled", "true");
});
