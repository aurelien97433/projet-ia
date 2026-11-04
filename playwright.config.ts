import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: `http://localhost:${PORT}` },
  // Deux largeurs de référence (NFR-6) : ordinateur 1 280 px et mobile 375 px.
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    // En CI, toujours démarrer un serveur propre plutôt que réutiliser ce qui écoute déjà sur le port.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
