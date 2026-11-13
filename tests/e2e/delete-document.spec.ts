import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { createAccount, deleteAccount, expect, test } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";

// Suppression d'un Document (story 3.4), contre Supabase local : dialogue, « Annuler », succès avec
// notification et retour à la Bibliothèque, autre Collaborateur, bandeau no_text, Document supprimé
// pendant la consultation. Documents insérés sans déclencher le traitement.
test.use({ storageState: async ({ authState }, provide) => provide(authState) });
test.describe.configure({ timeout: 60_000 });

const d = texts.deleteDocument;
const t = texts.documentStatus;
const admin = () => createClient(localSupabase().url, localSupabase().serviceRoleKey, { auth: { persistSession: false } });

async function insertDocument(authorId: string, values: Record<string, unknown> = { status: "ready" }) {
  const title = `À supprimer ${crypto.randomUUID()}`;
  const { data, error } = await admin()
    .from("documents")
    .insert({ author_id: authorId, title, category: "procedure", content_text: "Texte de la Note.", client_request_id: crypto.randomUUID() })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  const update = await admin().from("documents").update(values).eq("id", data.id);
  expect(update.error).toBeNull();
  return { id: data.id as string, title };
}

const exists = async (id: string) => ((await admin().from("documents").select("id").eq("id", id)).data ?? []).length === 1;

const banner = (page: Page) => page.locator("main article > [role=\"status\"]");
const actions = (page: Page) => page.getByRole("group", { name: texts.document.actionsLabel });

// Cliquer après l'hydratation : le bouton ne réagit qu'une fois le composant client actif.
async function openDocument(page: Page, id: string) {
  await page.goto(`/documents/${id}`);
  await page.waitForLoadState("networkidle");
}

test("Auteur : « Annuler » ne supprime rien, puis confirmation → Bibliothèque et « Document supprimé. »", async ({ page, account }) => {
  const doc = await insertDocument(account.id);
  await openDocument(page, doc.id);

  const trigger = actions(page).getByRole("button", { name: d.action });
  await trigger.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(d.title(doc.title));
  await expect(dialog).toContainText(d.text);
  await expect(dialog.getByRole("button", { name: d.cancel })).toBeFocused();
  expect((await new AxeBuilder({ page }).include("[role=alertdialog]").analyze()).violations).toEqual([]);

  await dialog.getByRole("button", { name: d.cancel }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await exists(doc.id)).toBe(true);

  await trigger.click();
  await page.getByRole("alertdialog").getByRole("button", { name: d.confirm }).click();
  await expect(page).toHaveURL(/\/bibliotheque$/);
  await expect(page.getByText(d.done)).toBeVisible();
  expect(await exists(doc.id)).toBe(false);
  await expect(page.getByRole("link", { name: doc.title })).toHaveCount(0);
});

test("Échap ferme le dialogue sans rien supprimer", async ({ page, account }) => {
  const doc = await insertDocument(account.id);
  await openDocument(page, doc.id);
  await actions(page).getByRole("button", { name: d.action }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeHidden();
  expect(await exists(doc.id)).toBe(true);
});

test("Auteur, Document en cours de traitement : « Supprimer » proposé et effectif", async ({ page, account }) => {
  const doc = await insertDocument(account.id, { status: "processing" });
  await openDocument(page, doc.id);
  await actions(page).getByRole("button", { name: d.action }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: d.confirm }).click();
  await expect(page).toHaveURL(/\/bibliotheque$/);
  expect(await exists(doc.id)).toBe(false);
});

test("Auteur, sans texte exploitable : suppression depuis le bandeau", async ({ page, account }) => {
  const doc = await insertDocument(account.id, { status: "error", error_kind: "no_text", error_message: t.noText });
  await openDocument(page, doc.id);
  await expect(actions(page)).toHaveCount(0);
  await banner(page).getByRole("button", { name: d.action }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: d.confirm }).click();
  await expect(page).toHaveURL(/\/bibliotheque$/);
  await expect(page.getByText(d.done)).toBeVisible();
  expect(await exists(doc.id)).toBe(false);
});

test("autre Collaborateur : aucun « Supprimer », ni dans la barre ni dans le bandeau no_text", async ({ page }) => {
  const other = await createAccount("e2e-suppr-autre");
  try {
    const ready = await insertDocument(other.id);
    await openDocument(page, ready.id);
    await expect(page.getByRole("button", { name: d.action })).toHaveCount(0);

    const noText = await insertDocument(other.id, { status: "error", error_kind: "no_text", error_message: t.noText });
    await openDocument(page, noText.id);
    await expect(banner(page)).toContainText(t.noText);
    await expect(page.getByRole("button", { name: d.action })).toHaveCount(0);
  } finally {
    await deleteAccount(other);
  }
});

test("supprimé pendant la consultation : message, retour à la Bibliothèque, plus d'action", async ({ page, account }) => {
  const doc = await insertDocument(account.id, { status: "processing" });
  await openDocument(page, doc.id);
  await expect(banner(page)).toContainText(t.processingTitle);
  await admin().from("documents").delete().eq("id", doc.id);

  await expect(banner(page)).toContainText(t.deleted, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: d.action })).toHaveCount(0);
  await expect(page.getByRole("button", { name: texts.document.loadingRetry })).toHaveCount(0);
  await banner(page).getByRole("link", { name: t.backToLibrary }).click();
  await expect(page).toHaveURL(/\/bibliotheque$/);
});

test("supprimé ailleurs puis « Supprimer » : état supprimé, sans notification d'erreur", async ({ page, account }) => {
  const doc = await insertDocument(account.id);
  await openDocument(page, doc.id);
  await admin().from("documents").delete().eq("id", doc.id);
  await actions(page).getByRole("button", { name: d.action }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: d.confirm }).click();
  await expect(banner(page)).toContainText(t.deleted);
  await expect(page.getByText(d.forbidden)).toHaveCount(0);
});

test("fichier importé : la suppression par l'interface retire aussi son objet du Storage", async ({ page, account }) => {
  // Dépôt et import avec la session du Compte, comme le formulaire « Fichier » (story 2.6a).
  const { url, publishableKey } = localSupabase();
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  expect(signIn.error).toBeNull();
  const uploadId = `${crypto.randomUUID()}.txt`;
  const path = `${account.id}/uploads/${uploadId}`;
  const signed = await client.storage.from("documents").createSignedUploadUrl(path);
  expect(signed.error).toBeNull();
  const put = await fetch(signed.data!.signedUrl, { method: "PUT", headers: { "x-upsert": "false", "Content-Type": "text/plain" }, body: "Texte." });
  expect(put.ok).toBe(true);
  const imported = await client.rpc("import_file_document", {
    p_title: `Fichier à supprimer ${crypto.randomUUID()}`,
    p_category: "procedure",
    p_upload_id: uploadId,
    p_client_request_id: crypto.randomUUID(),
  });
  const id = (imported.data as { document_id: string }[])[0].document_id;
  const listed = async () =>
    ((await admin().storage.from("documents").list(`${account.id}/uploads`, { search: uploadId })).data ?? []).length;
  expect(await listed()).toBe(1);

  await openDocument(page, id);
  await actions(page).getByRole("button", { name: d.action }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: d.confirm }).click();
  await expect(page).toHaveURL(/\/bibliotheque$/);
  expect(await exists(id)).toBe(false);
  expect(await listed()).toBe(0);
});
