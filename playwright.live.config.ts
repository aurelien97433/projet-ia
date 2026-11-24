import { defineConfig, devices } from "@playwright/test";
import { readLiveAppUrl, readSeedFile } from "./tests/e2e/support/uj2";

// Passage réel du parcours UJ-2 (story 6.2) : npm run test:uj2:live, lancé par l'utilisateur seul.
// Cible : la production Vercel (UJ2_LIVE_URL de .env.seed, jamais écrite dans le dépôt), jamais une
// prévisualisation (PROCESS_DOCUMENT_SECRET n'y est pas posé : aucune Note n'y serait traitée).
// Vraie IA, Compte de mesure 1 (sa session seulement). Aucun serveur local, aucune préparation locale.
// Trace, vidéo et captures désactivées : la saisie du mot de passe ne doit jamais être enregistrée.
const baseURL = readLiveAppUrl(readSeedFile());

export default defineConfig({
  testDir: "tests/e2e",
  // uj-2.spec.ts (story 6.2, test:uj2:live) et sm5.spec.ts (story 7.2, SM-5, lancé par measure:all) ;
  // chaque commande désigne son fichier.
  testMatch: ["uj-2.spec.ts", "sm5.spec.ts"],
  // Lu par uj-2.spec.ts et sm5.spec.ts : mode production (Compte de mesure 1 ; vraie IA pour UJ-2).
  metadata: { uj2Live: true },
  // Une exécution réelle : traitement, génération d'une réponse et d'un Résumé (quelques dizaines de secondes).
  timeout: 300_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["./tests/e2e/support/uj2-live-reporter.ts"]],
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  // Ordinateur seul (1 280 px).
  projects: [{ name: "ordinateur", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
});
