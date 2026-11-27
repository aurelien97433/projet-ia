import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VIDEO_DIR } from "../video/video-dir";

// Vidéo de secours (story 7.5) : garde-fous vérifiables sans lancer le tournage.
const root = path.resolve(import.meta.dirname, "..", "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("demo:video", () => {
  it("seule playwright.video.config.ts enregistre une vidéo ; les autres configurations ne l'activent pas", () => {
    expect(read("playwright.video.config.ts")).toMatch(/video: \{ mode: "on", size \}/);
    expect(read("playwright.live.config.ts")).toMatch(/video: "off"/);
    expect(read("playwright.config.ts")).not.toMatch(/video:/);
    for (const file of ["playwright.video.config.ts", "playwright.live.config.ts"]) {
      expect(read(file)).toMatch(/trace: "off"/);
      expect(read(file)).toMatch(/screenshot: "off"/);
    }
  });

  it("vidéo écrite hors du dépôt", () => {
    expect(path.relative(root, VIDEO_DIR).startsWith("..") || path.isAbsolute(path.relative(root, VIDEO_DIR))).toBe(true);
  });

  it("le parcours filmé ne tape jamais le mot de passe et ne le journalise pas", () => {
    const spec = read("tests/video/demo-video.spec.ts");
    expect(spec).not.toMatch(/keyboard\.type\([^)]*password/i);
    expect(spec).not.toMatch(/fill\([^)]*password/i);
    expect(spec).not.toMatch(/console\.log\([^)]*(password|email)/i);
    expect(spec).toContain("setPassword(page, account.password)");
  });

  it("hors de la suite e2e et de Vitest : dossier tests/video, lancé par npm run demo:video", () => {
    expect(read("playwright.config.ts")).toMatch(/testDir: "tests\/e2e"/);
    expect(JSON.parse(read("package.json")).scripts["demo:video"]).toBe("tsx scripts/demo-video.ts");
  });
});
