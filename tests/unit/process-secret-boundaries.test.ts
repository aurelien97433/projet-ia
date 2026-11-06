import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Frontières du secret de traitement et de l'appel à process-document (AD-1, AD-20).
const root = path.resolve(import.meta.dirname, "..", "..");
const SECRET_NAME = "PROCESS_DOCUMENT_SECRET";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const relative = (file: string) => path.relative(root, file).replaceAll("\\", "/");
const containing = (dir: string, text: string) =>
  filesUnder(path.join(root, dir))
    .filter((file) => /\.tsx?$/.test(file) && readFileSync(file, "utf8").includes(text))
    .map(relative);

describe("PROCESS_DOCUMENT_SECRET", () => {
  it("côté Next.js, une seule lecture, dans un module réservé au serveur", () => {
    const file = "src/server/documents/trigger-processing.ts";
    expect(containing("src", SECRET_NAME)).toEqual([file]);
    expect(readFileSync(path.join(root, file), "utf8")).toMatch(/^import "server-only";/);
  });

  it("côté Edge Functions, lu par process-document seulement", () => {
    expect(containing("supabase/functions", SECRET_NAME)).toEqual(["supabase/functions/process-document/index.ts"]);
  });

  it("jamais exposé au navigateur par un préfixe public", () => {
    expect(containing("src", `NEXT_PUBLIC_${SECRET_NAME}`)).toEqual([]);
    expect(readFileSync(path.join(root, ".env.example"), "utf8")).not.toContain(`NEXT_PUBLIC_${SECRET_NAME}`);
  });

  it("aucune valeur dans .env.example", () => {
    expect(readFileSync(path.join(root, ".env.example"), "utf8")).toMatch(new RegExp(`^${SECRET_NAME}=$`, "m"));
  });
});

describe("appel à process-document", () => {
  it("uniquement depuis src/server, jamais depuis un composant client", () => {
    expect(containing("src", "functions/v1/")).toEqual(["src/server/documents/trigger-processing.ts"]);
    const clients = filesUnder(path.join(root, "src")).filter(
      (file) => /\.tsx?$/.test(file) && readFileSync(file, "utf8").startsWith('"use client"'),
    );
    const importers = clients.filter((file) => readFileSync(file, "utf8").includes("trigger-processing"));
    expect(importers).toEqual([]);
  });

  it("la clé service_role n'existe pas côté Next.js", () => {
    expect(containing("src", "SERVICE_ROLE")).toEqual([]);
  });
});

describe("vectorisation simulée", () => {
  it("n'existe que dans son module et la pile locale, jamais côté Next.js", () => {
    expect(containing("supabase/functions", "EMBEDDINGS_FAKE")).toEqual(["supabase/functions/_shared/fake-embeddings.ts"]);
    expect(containing("src", "EMBEDDINGS_FAKE")).toEqual([]);
    expect(readFileSync(path.join(root, ".env.example"), "utf8")).not.toContain("EMBEDDINGS_FAKE");
  });
});

describe("supabase/config.toml", () => {
  const config = readFileSync(path.join(root, "supabase", "config.toml"), "utf8");

  it("le travail d'arrière-plan n'est pas interrompu en local", () => {
    expect(config).toMatch(/^policy = "per_worker"$/m);
  });

  it("seul le secret fait foi pour process-document", () => {
    expect(config).toMatch(/^\[functions\.process-document\]\nverify_jwt = false$/m);
  });
});
