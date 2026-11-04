import { defineConfig, devices } from "@playwright/test";
import { localSupabase } from "./tests/support/local-supabase";

// Les tests de bout en bout tournent sur Supabase local (npx supabase start), jamais sur le projet
// distant de démonstration : un serveur Next.js dédié, sur un autre port, reçoit les variables
// publiques locales, lues à l'exécution (elles priment sur .env.local).
const PORT = 3100;
const supabase = localSupabase();

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: `http://localhost:${PORT}` },
  // Deux largeurs de référence (NFR-6) : ordinateur 1 280 px et mobile 375 px.
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
    },
    // Jamais de réutilisation : un serveur déjà présent sur ce port pourrait viser le projet distant.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
