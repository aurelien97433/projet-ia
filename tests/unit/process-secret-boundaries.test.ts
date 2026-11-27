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

describe("appel aux Edge Functions", () => {
  // process-document (2.3), semantic-search (4.1a), chat (5.2a-2) et summarize (6.1) : modules réservés
  // au serveur.
  const callers = [
    "src/server/chat/relay.ts",
    "src/server/documents/trigger-processing.ts",
    "src/server/search/semantic-search.ts",
    "src/server/summary/relay.ts",
  ];

  it("uniquement depuis src/server, jamais depuis un composant client", () => {
    expect(containing("src", "functions/v1/").sort()).toEqual(callers);
    for (const file of callers) expect(readFileSync(path.join(root, file), "utf8")).toMatch(/^import "server-only";/);
    const clients = filesUnder(path.join(root, "src")).filter(
      (file) => /\.tsx?$/.test(file) && readFileSync(file, "utf8").startsWith('"use client"'),
    );
    const importers = clients.filter((file) => /trigger-processing|server\/search|server\/chat|server\/summary/.test(readFileSync(file, "utf8")));
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

  it("génération simulée (5.2a-2) : seulement dans son module et la pile locale", () => {
    expect(containing("supabase/functions", "GENERATION_FAKE")).toEqual(["supabase/functions/_shared/fake-generation.ts"]);
    expect(containing("src", "GENERATION_FAKE")).toEqual([]);
    expect(readFileSync(path.join(root, ".env.example"), "utf8")).not.toContain("GENERATION_FAKE");
  });
});

describe("supabase/config.toml", () => {
  const config = readFileSync(path.join(root, "supabase", "config.toml"), "utf8");

  it("le travail d'arrière-plan n'est pas interrompu en local", () => {
    expect(config).toMatch(/^policy = "per_worker"$/m);
  });

  it("seul le secret fait foi pour process-document", () => {
    // Fins de ligne normalisées : avec core.autocrlf, une extraction Git écrit le fichier en CRLF.
    expect(config.replace(/\r\n/g, "\n")).toMatch(/^\[functions\.process-document\]\nverify_jwt = false$/m);
  });

  it("semantic-search exige un jeton valide dès la passerelle, et fait partie du déploiement", async () => {
    expect(config.replace(/\r\n/g, "\n")).toMatch(/^\[functions\.semantic-search\]\nverify_jwt = true$/m);
    const { listFunctions } = await import("../../scripts/deploy-supabase");
    const functions = listFunctions(path.join(root, "supabase", "functions"));
    expect(functions).toContain("semantic-search");
    expect(functions).not.toContain("ai-health");
  });

  it("chat (5.2a-2) exige un jeton valide dès la passerelle, et fait partie du déploiement", async () => {
    expect(config.replace(/\r\n/g, "\n")).toMatch(/^\[functions\.chat\]\nverify_jwt = true$/m);
    const { listFunctions } = await import("../../scripts/deploy-supabase");
    expect(listFunctions(path.join(root, "supabase", "functions"))).toContain("chat");
  });

  // Story 7.8 (R2, décision de l'utilisateur du 2026-11-25) : chat lit la clé service_role une fois, pour
  // le garde-fou seulement (reserve_ai_call, release_ai_call, EXECUTE à service_role seul).
  it("chat : service_role pour reserve_ai_call et release_ai_call seulement", () => {
    const source = readFileSync(path.join(root, "supabase", "functions", "chat", "index.ts"), "utf8");
    expect(source.match(/"SUPABASE_SERVICE_ROLE_KEY"/g)).toHaveLength(1);
    expect(source).not.toMatch(/serviceRoleKey|sb_secret/);
    const uses = source.split(/\r?\n/).filter((line) => /\bquotaKey\b|rpc\(quota,/.test(line) && !line.trim().startsWith("//"));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/const quotaKey = readEnv|!quotaKey|apikey: quotaKey|rpc\(quota, "(reserve|release)_ai_call"/);
    }
    expect(source.match(/rpc\(quota,/g)).toHaveLength(2);
  });

  it("summarize (6.1) exige un jeton valide dès la passerelle, et fait partie du déploiement", async () => {
    expect(config.replace(/\r\n/g, "\n")).toMatch(/^\[functions\.summarize\]\nverify_jwt = true$/m);
    const { listFunctions } = await import("../../scripts/deploy-supabase");
    expect(listFunctions(path.join(root, "supabase", "functions"))).toContain("summarize");
  });

  // Exception datée à AD-2 (décision de l'utilisateur du 2026-11-20, Q2 corrigée, étendue par la story
  // 7.8, R1 et R2) : la clé service_role est lue une seule fois ; elle sert à store_summary et au
  // garde-fou (verrou et quota), jamais à lire le Document.
  it("summarize : clé service_role lue une fois, pour store_summary, le verrou et le quota seulement", () => {
    const source = readFileSync(path.join(root, "supabase", "functions", "summarize", "index.ts"), "utf8");
    expect(source.match(/"SUPABASE_SERVICE_ROLE_KEY"/g)).toHaveLength(1);
    expect(source).not.toMatch(/sb_secret|serviceRoleKey/);
    // serviceKey n'apparaît que dans sa lecture, son contrôle, la cible du garde-fou et storeSummary.
    const uses = source.split(/\r?\n/).filter((line) => /\bserviceKey\b/.test(line) && !line.trim().startsWith("//"));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/const serviceKey = readEnv|!serviceKey|storeSummary\(url, serviceKey|serviceKey: string|apikey: serviceKey/);
    }
    // Garde-fou (story 7.8) : clé service_role (rpc(admin, …)), jamais le jeton du Collaborateur.
    for (const name of ["reserve_ai_call", "release_ai_call", "begin_summary", "end_summary"]) {
      expect(source).toMatch(new RegExp(`rpc\\(admin, "${name}"`));
      expect(source).not.toMatch(new RegExp(`rpc\\(target, "${name}"`));
    }
    // Seuls ces quatre appels passent par admin ; le Document est lu avec le jeton.
    expect(source.match(/rpc\(admin,/g)).toHaveLength(4);
    expect(source).not.toMatch(/rpc\(target, "store_summary"/);
    expect(source.match(/rpc\/store_summary/g)).toHaveLength(1);
  });

  it("measure-embed (story 4.2) : présente en local, jamais déployée, clé service_role comparée dans la fonction", async () => {
    expect(config.replace(/\r\n/g, "\n")).toMatch(/^\[functions\.measure-embed\]\nverify_jwt = false$/m);
    const { listFunctions, LOCAL_ONLY_FUNCTIONS } = await import("../../scripts/deploy-supabase");
    const dir = path.join(root, "supabase", "functions");
    expect(readFileSync(path.join(dir, "measure-embed", "index.ts"), "utf8")).toContain("hasBearerSecret");
    expect(LOCAL_ONLY_FUNCTIONS).toContain("measure-embed");
    expect(listFunctions(dir)).not.toContain("measure-embed");
  });
});
