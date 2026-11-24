import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test as base, expect, type Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { createAccount, deleteAccount } from "../support/e2e-auth";
import { localSupabase } from "../support/local-supabase";
import { chooseOptionByTyping, cleanupMarkedDocuments, liveCredentials, openLiveSession, press, readDailyUsage, ROOT, typeInto, uj2Stamp } from "./support/uj2";

// SM-5, fiabilité de l'ajout (story 7.2) : lot demo/fichiers-test/ importé au clavier seul (focus posé
// puis Entrée, flèches, frappe ; aucun clic). valide.txt et valide.md → prêt ; vide.txt → en erreur
// avec le message du catalogue ; trop-gros.txt et format-non-pris-en-charge.pdf → refusés avant tout
// envoi avec le message du catalogue. Aucun appel au modèle (vectorisation seulement) : compteur du
// jour inchangé.
// Deux modes, même fichier (infrastructure de la 6.2) :
// - local (npm run test:e2e, deux largeurs) : pile locale, Compte temporaire ;
// - production (measure:all, playwright.live.config.ts) : Compte de mesure 1 de .env.seed, sa session ;
//   trace, vidéo et captures désactivées.
// Titres marqués « — test SM-5 {horodatage} » ; nettoyage garanti par la session du Compte (jamais
// service_role) après chaque test, à la fin et en cas d'échec.

const SM5_MARK = "— test SM-5";
const FILES_DIR = path.join(ROOT, "demo", "fichiers-test");

type Sm5Session = { live: boolean; email: string; password: string; userId: string; client: SupabaseClient; supabaseHost: string | null };

const test = base.extend<object, { sm5: Sm5Session }>({
  sm5: [
    async ({}, provide, workerInfo) => {
      // Même indicateur que la configuration live de la 6.2 (production, Compte de mesure 1).
      const live = workerInfo.config.metadata?.uj2Live === true;
      let session: Sm5Session;
      let release: () => Promise<void>;
      if (live) {
        const credentials = liveCredentials();
        const opened = await openLiveSession(credentials);
        session = { live, email: credentials.email, password: credentials.password, userId: opened.userId, client: opened.client, supabaseHost: opened.target.host };
        release = async () => {
          await opened.client.auth.signOut().catch(() => {});
        };
      } else {
        const account = await createAccount("e2e-sm5");
        const { url, publishableKey } = localSupabase();
        const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const signIn = await client.auth.signInWithPassword({ email: account.email, password: account.password });
        if (signIn.error) throw new Error(`Session du Compte temporaire refusée (${signIn.error.code}).`);
        session = { live, email: account.email, password: account.password, userId: account.id, client, supabaseHost: null };
        release = async () => {
          await deleteAccount(account);
        };
      }
      try {
        await provide(session);
      } finally {
        const remaining = await cleanupMarkedDocuments(session.client, session.userId, SM5_MARK);
        await release();
        if (remaining !== 0) throw new Error(`${remaining} Document(s) « ${SM5_MARK} » restant(s) après nettoyage.`);
      }
    },
    { scope: "worker", timeout: 120_000 },
  ],
});

// Un test par fichier, à la suite (un échec n'empêche pas la mesure des autres fichiers).
test.afterEach(async ({ sm5 }) => {
  expect(await cleanupMarkedDocuments(sm5.client, sm5.userId, SM5_MARK)).toBe(0);
});

const a = texts.addDocument;
const DOCUMENT_URL = /\/documents\/([0-9a-f-]{36})$/;
const fileMessage = (page: Page) => page.locator("#file-message");
const metadata = (page: Page) => page.locator("main dl");
const banner = (page: Page) => page.locator('main article > [role="status"]');
const isUploadRequest = (url: string) => url.includes("/api/uploads") || url.includes("/storage/v1/object/upload/sign/");

async function signIn(page: Page, sm5: Sm5Session) {
  await page.goto("/connexion");
  await page.waitForLoadState("networkidle");
  await typeInto(page, page.locator("#email"), sm5.email);
  const password = page.locator("#password");
  await typeInto(page, password, sm5.password);
  await page.keyboard.press("Enter");
  try {
    await expect(page).not.toHaveURL(/\/connexion/, { timeout: 30_000 });
  } catch (error) {
    // Connexion refusée : champ vidé avant l'instantané de la page joint à l'échec.
    await password.clear().catch(() => {});
    throw error;
  }
}

// Onglet Fichier au clavier, puis choix du fichier par « Choisir un fichier » et Entrée.
async function chooseTestFile(page: Page, file: string) {
  await page.goto("/ajouter");
  await expect(page.locator("#title")).toBeFocused();
  await press(page, page.getByRole("tab", { name: a.noteTab }), "ArrowRight");
  await expect(page.getByRole("tab", { name: a.fileTab })).toHaveAttribute("aria-selected", "true");
  const chooser = page.waitForEvent("filechooser");
  await press(page, page.getByRole("button", { name: a.chooseFile }));
  await (await chooser).setFiles(path.join(FILES_DIR, file));
}

type Measure = { file: string; expected: string; observed: string | null; processingMs: number | null; counterBefore: number | null; counterAfter: number | null; supabaseHost: string | null };

// Import d'un fichier accepté : titre marqué, Catégorie « Autre », « Importer » ; renvoie la page du
// Document et la durée jusqu'à l'état final observé.
async function importFile(page: Page, file: string, stamp: string) {
  await chooseTestFile(page, file);
  await expect(fileMessage(page)).toHaveText(a.uploaded(file), { timeout: 30_000 });
  const title = `Fichier ${file} ${SM5_MARK} ${stamp}`;
  await typeInto(page, page.locator("#file-title"), title);
  await chooseOptionByTyping(page, page.locator("#file-category"), texts.categories.other);
  await expect(page.locator("#file-category")).toHaveValue("other");
  const started = Date.now();
  await press(page, page.getByRole("button", { name: a.importSubmit, exact: true }));
  await expect(page).toHaveURL(DOCUMENT_URL, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return { started };
}

const cases = [
  { file: "valide.txt", expected: "prêt", kind: "ready" },
  { file: "valide.md", expected: "prêt", kind: "ready" },
  { file: "vide.txt", expected: "en erreur, message « aucun texte exploitable »", kind: "no-text" },
  { file: "trop-gros.txt", expected: "refusé avant l'envoi, message « dépasse 100 Ko »", kind: "too-large" },
  { file: "format-non-pris-en-charge.pdf", expected: "refusé avant l'envoi, message « format non pris en charge »", kind: "format" },
] as const;

for (const item of cases) {
  test(`SM-5 au clavier : ${item.file} → ${item.expected}`, async ({ page, sm5 }, testInfo) => {
    test.setTimeout(sm5.live ? 180_000 : 90_000);
    const measure: Measure = { file: item.file, expected: item.expected, observed: null, processingMs: null, counterBefore: null, counterAfter: null, supabaseHost: sm5.supabaseHost };
    try {
      measure.counterBefore = await readDailyUsage(sm5.client, sm5.userId);
      await signIn(page, sm5);
      if (item.kind === "ready" || item.kind === "no-text") {
        const { started } = await importFile(page, item.file, uj2Stamp());
        if (item.kind === "ready") {
          await expect(metadata(page).getByText(texts.status.ready)).toBeVisible({ timeout: 60_000 });
          measure.processingMs = Date.now() - started;
          await expect(metadata(page)).not.toContainText(texts.status.error);
          measure.observed = "prêt";
        } else {
          await expect(banner(page)).toContainText(texts.documentStatus.noText, { timeout: 60_000 });
          measure.processingMs = Date.now() - started;
          await expect(metadata(page).getByText(texts.status.error)).toBeVisible();
          measure.observed = "en erreur, message du catalogue";
        }
      } else {
        const requests: string[] = [];
        page.on("request", (request) => {
          if (isUploadRequest(request.url())) requests.push(request.url());
        });
        await chooseTestFile(page, item.file);
        await expect(fileMessage(page)).toHaveText(item.kind === "too-large" ? a.errors.fileTooLarge : a.errors.fileFormat);
        expect(requests, "aucun envoi").toEqual([]);
        measure.observed = "refusé avant l'envoi, message du catalogue";
      }
      // Aucun appel au modèle : compteur du jour inchangé.
      measure.counterAfter = await readDailyUsage(sm5.client, sm5.userId);
      expect(measure.counterAfter - measure.counterBefore).toBe(0);
    } finally {
      await testInfo.attach("sm5-mesures", { body: JSON.stringify(measure), contentType: "application/json" });
    }
  });
}
