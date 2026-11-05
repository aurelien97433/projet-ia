import { createClient } from "@supabase/supabase-js";
import { test as base, expect, type BrowserContextOptions, type Page } from "@playwright/test";
import { texts } from "../../src/lib/texts";
import { localSupabase, uniqueEmail } from "./local-supabase";

// Comptes et sessions des tests de bout en bout, sur Supabase local uniquement.
export type Account = { id: string; email: string; password: string };
type StorageState = Exclude<BrowserContextOptions["storageState"], string | undefined>;

const PASSWORD = ["Mot", "de", "passe", "e2e", "2026"].join("-");

const admin = () =>
  createClient(localSupabase().url, localSupabase().serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function createAccount(prefix: string): Promise<Account> {
  const email = uniqueEmail(prefix);
  const { data, error } = await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  return { id: data.user.id, email, password: PASSWORD };
}

export async function deleteAccount(account: Account): Promise<void> {
  await admin().auth.admin.deleteUser(account.id);
}

// Connexion par le formulaire E1, depuis l'URL donnée (par défaut /connexion).
export async function signInThroughForm(page: Page, account: Account, from = "/connexion"): Promise<void> {
  await page.goto(from);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByRole("button", { name: texts.signIn.submit }).click();
  // La première exécution de la Server Action est compilée à la demande en développement.
  await expect(page).not.toHaveURL(/\/connexion/, { timeout: 30_000 });
}

// Un Compte par worker ; authState : session ouverte une fois, réutilisée par chaque test.
export const test = base.extend<object, { account: Account; authState: StorageState }>({
  account: [
    async ({}, use, workerInfo) => {
      const account = await createAccount(`e2e-w${workerInfo.workerIndex}`);
      await use(account);
      await deleteAccount(account);
    },
    { scope: "worker" },
  ],
  authState: [
    async ({ browser, account }, use, workerInfo) => {
      const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
      const page = await context.newPage();
      await signInThroughForm(page, account);
      await use(await context.storageState());
      await context.close();
    },
    { scope: "worker" },
  ],
});

export { expect };

export const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

// Pied de compte (e-mail + « Se déconnecter ») : barre latérale sur ordinateur, menu sous 1 024 px.
export async function accountArea(page: Page) {
  if (isDesktop(page)) return page.locator("aside");
  await page.getByRole("button", { name: texts.shell.openMenu }).click();
  return page.getByRole("dialog", { name: texts.shell.menuTitle });
}
