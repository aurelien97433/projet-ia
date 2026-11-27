import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { readLiveAppUrl, readSeedFile } from "./tests/e2e/support/uj2";
import { VIDEO_DIR } from "./tests/video/video-dir";

// Vidéo de secours (story 7.5) : npm run demo:video, lancé par le porteur du produit seul. Production
// Vercel (UJ2_LIVE_URL de .env.seed, jamais écrite dans le dépôt), vraie IA, Compte de démo A.
// Seule configuration du projet qui enregistre une vidéo ; navigateur visible, 1 280 × 720. Trace et
// captures désactivées. Fichiers écrits hors du dépôt (DEMO_VIDEO_DIR, sinon ~/Videos/NexaMind-demo).
const baseURL = readLiveAppUrl(readSeedFile());
const size = { width: 1280, height: 720 };

export default defineConfig({
  testDir: "tests/video",
  testMatch: ["**/demo-video.spec.ts"],
  // Dossier de travail de Playwright, vidé à chaque lancement : la vidéo finale est copiée à côté.
  outputDir: path.join(VIDEO_DIR, "playwright-output"),
  timeout: 480_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL,
    headless: false,
    viewport: size,
    video: { mode: "on", size },
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "video", use: { ...devices["Desktop Chrome"], viewport: size, headless: false } }],
});
