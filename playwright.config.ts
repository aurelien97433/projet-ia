import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    // En CI, toujours démarrer un serveur propre plutôt que réutiliser ce qui écoute déjà sur le port.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
