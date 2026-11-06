import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Account, loadMiniSet, requestIdFor, type SeedConfig, seedMini } from "../../scripts/seed-demo";
import { localProcessSecret, localSupabase, uniqueEmail } from "../support/local-supabase";

// Préchargement réel sur Supabase local (vecteurs simulés) : Comptes jetables, supprimés à la fin.
const root = path.resolve(import.meta.dirname, "..", "..");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const account = (prefix: string): Account => ({ email: uniqueEmail(prefix), password: ["Mot", "de", "passe", "seed"].join("-") });
const quiet = { log: () => {} };

let admin: SupabaseClient;
let config: SeedConfig;

const emails = () => [config.demoA, config.demoB, ...config.measure].map((item) => item.email);

async function userId(email: string): Promise<string | undefined> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((user) => user.email === email)?.id;
}

async function documentsOf(authorIds: string[]) {
  const { data } = await admin
    .from("documents")
    .select("id, title, kind, status, text_version, client_request_id, author_id")
    .in("author_id", authorIds);
  return data!;
}

const processCalls = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.filter((call: unknown[]) => String(call[0]).includes("/functions/v1/process-document")).length;

beforeAll(async () => {
  const { url, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  config = {
    url,
    serviceRoleKey,
    processSecret: localProcessSecret(),
    demoA: account("seed-a"),
    demoB: account("seed-b"),
    measure: [account("seed-m1"), account("seed-m2"), account("seed-m3")],
  };
  await seedMini(config, quiet);
}, 120_000);

afterAll(async () => {
  for (const email of emails()) {
    const id = await userId(email);
    if (id) await admin.auth.admin.deleteUser(id);
  }
});

describe("seedMini sur Supabase local", () => {
  it("5 Comptes confirmés, Auteurs aux noms fictifs, connexion possible", async () => {
    for (const email of emails()) expect(await userId(email)).toBeDefined();
    const id = (await userId(config.demoA.email))!;
    const { data } = await admin.from("profiles").select("display_name").eq("id", id).single();
    expect(data?.display_name).toBe("Claire Martin");

    const client = createClient(config.url, localSupabase().publishableKey, options);
    const { error } = await client.auth.signInWithPassword(config.measure[2]);
    expect(error).toBeNull();
  });

  it("8 Notes prêtes, avec Passages, modèle et vecteurs de 1 536 dimensions", async () => {
    const ids = [(await userId(config.demoA.email))!, (await userId(config.demoB.email))!];
    const documents = await documentsOf(ids);
    expect(documents).toHaveLength(8);
    for (const document of documents) {
      expect(document.kind).toBe("note");
      expect(document.status).toBe("ready");
      const { data } = await admin.from("passages").select("embedding, embedding_model").eq("document_id", document.id);
      expect(data!.length).toBeGreaterThan(0);
      expect(data![0].embedding_model).toBe("text-embedding-3-small");
      expect(JSON.parse(data![0].embedding)).toHaveLength(1536);
    }
  });

  it("relance : aucun doublon, aucun appel à process-document", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      const reports = await seedMini(config, quiet);
      expect(processCalls(spy)).toBe(0);
      expect(reports.map((report) => report.action)).toEqual(new Array(8).fill("déjà prêt"));
    } finally {
      spy.mockRestore();
    }
    const ids = [(await userId(config.demoA.email))!, (await userId(config.demoB.email))!];
    expect(await documentsOf(ids)).toHaveLength(8);
  });

  it("Document en erreur : repris sur la même ligne, puis prêt", async () => {
    const authorId = (await userId(config.demoA.email))!;
    const { data: before } = await admin
      .from("documents")
      .select("id, text_version")
      .eq("author_id", authorId)
      .eq("client_request_id", requestIdFor("faq-comptabilite"))
      .single();
    await admin.from("documents").update({ status: "error", error_kind: "temporary" }).eq("id", before!.id);

    const reports = await seedMini(config, quiet);
    expect(reports.find((report) => report.key === "faq-comptabilite")).toMatchObject({ action: "repris", status: "ready" });
    const { data: after } = await admin.from("documents").select("id, text_version, error_kind").eq("id", before!.id).single();
    expect(after).toEqual({ id: before!.id, text_version: before!.text_version, error_kind: null });
  });

  it("texte modifié : même ligne, nouvelle version, Passages remplacés", async () => {
    const set = loadMiniSet();
    const edited = {
      ...set,
      documents: set.documents.map((document) =>
        document.key === "procedure-conges" ? { ...document, text: `${document.text}Ajout de la relecture.\n` } : document,
      ),
    };
    const authorId = (await userId(config.demoB.email))!;
    const select = () =>
      admin.from("documents").select("id, text_version, content_text").eq("author_id", authorId).eq("client_request_id", requestIdFor("procedure-conges")).single();
    const { data: before } = await select();

    const reports = await seedMini(config, { ...quiet, set: edited });
    expect(reports.find((report) => report.key === "procedure-conges")).toMatchObject({ action: "mis à jour", status: "ready" });

    const { data: after } = await select();
    expect(after!.id).toBe(before!.id);
    expect(after!.text_version).toBe(before!.text_version + 1);
    expect(after!.content_text).toContain("Ajout de la relecture.");
    const { data: passages } = await admin.from("passages").select("text_version").eq("document_id", before!.id);
    expect(passages!.every((passage) => passage.text_version === after!.text_version)).toBe(true);
  });

  it("vecteurs simulés : refusés si de vrais vecteurs sont exigés", async () => {
    await expect(seedMini(config, { ...quiet, requireRealEmbeddings: true })).rejects.toThrow("vrais vecteurs");
  });

  it("Compte existant : mot de passe et nom réalignés", async () => {
    const id = (await userId(config.demoB.email))!;
    await admin.auth.admin.updateUserById(id, { password: "Autre-mot-de-passe-2026" });
    await admin.from("profiles").update({ display_name: "Ancien nom" }).eq("id", id);

    await seedMini(config, quiet);

    const client = createClient(config.url, localSupabase().publishableKey, options);
    expect((await client.auth.signInWithPassword(config.demoB)).error).toBeNull();
    const { data } = await admin.from("profiles").select("display_name").eq("id", id).single();
    expect(data?.display_name).toBe("Karim Benali");
  });

  async function documentFor(key: string, email: string) {
    const authorId = (await userId(email))!;
    const { data } = await admin
      .from("documents")
      .select("id, attempt_id")
      .eq("author_id", authorId)
      .eq("client_request_id", requestIdFor(key))
      .single();
    return data!;
  }

  it("en cours expiré : nouvelle tentative sur la même ligne", async () => {
    const before = await documentFor("compte-rendu-lumen", config.demoB.email);
    await admin
      .from("documents")
      .update({ status: "processing", processing_started_at: new Date(Date.now() - 181_000).toISOString() })
      .eq("id", before.id);
    const reports = await seedMini(config, quiet);
    expect(reports.find((report) => report.key === "compte-rendu-lumen")).toMatchObject({ action: "repris", status: "ready" });
    const after = await documentFor("compte-rendu-lumen", config.demoB.email);
    expect(after.id).toBe(before.id);
    expect(after.attempt_id).not.toBe(before.attempt_id);
  });

  it("en cours et vivant : tentative conservée, aucun appel supplémentaire", async () => {
    const before = await documentFor("guide-relances", config.demoB.email);
    await admin
      .from("documents")
      .update({ status: "processing", processing_started_at: new Date().toISOString() })
      .eq("id", before.id);
    // Une autre exécution termine cette tentative pendant l'attente.
    const finish = setTimeout(async () => {
      await admin.from("documents").update({ status: "ready" }).eq("id", before.id);
    }, 1_500);
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      const reports = await seedMini(config, quiet);
      expect(reports.find((report) => report.key === "guide-relances")?.action).toBe("déjà en cours");
      expect(processCalls(spy)).toBe(0);
    } finally {
      clearTimeout(finish);
      spy.mockRestore();
    }
    expect((await documentFor("guide-relances", config.demoB.email)).attempt_id).toBe(before.attempt_id);
  });

  it("prêt sans Passage : retraité", async () => {
    const before = await documentFor("reunion-finance", config.demoA.email);
    await admin.from("passages").delete().eq("document_id", before.id);
    const reports = await seedMini(config, quiet);
    const report = reports.find((item) => item.key === "reunion-finance")!;
    expect(report.action).toBe("repris");
    expect(report.passages).toBeGreaterThan(0);
  });

  it("titre modifié : mis à jour sans nouveau traitement", async () => {
    const set = loadMiniSet();
    const renamed = {
      ...set,
      documents: set.documents.map((document) =>
        document.key === "test-md-piege" ? { ...document, title: "Titre modifié pour le test" } : document,
      ),
    };
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      const reports = await seedMini(config, { ...quiet, set: renamed });
      expect(reports.find((report) => report.key === "test-md-piege")?.action).toBe("titre ou Catégorie à jour");
      expect(processCalls(spy)).toBe(0);
    } finally {
      spy.mockRestore();
    }
    await seedMini(config, quiet);
  });

  it("mauvais secret : échec explicite, secret jamais cité", async () => {
    const authorId = (await userId(config.demoA.email))!;
    await admin.from("documents").update({ status: "error", error_kind: "temporary" }).eq("author_id", authorId).eq("client_request_id", requestIdFor("procedure-facturation"));
    const wrong = "mauvais-secret".repeat(4);
    const failure = await seedMini({ ...config, processSecret: wrong }, quiet).catch((error: Error) => error);
    expect((failure as Error).message).toContain("process-document a répondu 401");
    expect((failure as Error).message).not.toContain(wrong);
    // Le Document ne reste pas en cours : il passe en erreur, comme un abandon de Next.js.
    const { data } = await admin
      .from("documents")
      .select("status, error_kind")
      .eq("author_id", authorId)
      .eq("client_request_id", requestIdFor("procedure-facturation"))
      .single();
    expect(data).toEqual({ status: "error", error_kind: "temporary" });
    await seedMini(config, quiet);
  });
});

describe("ligne de commande", () => {
  const seed = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "scripts", "seed-demo.ts"), ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...env },
    });

  function envFile(url: string): { file: string; dir: string; text: string } {
    const dir = mkdtempSync(path.join(tmpdir(), "seed-cli-"));
    const file = path.join(dir, ".env.seed");
    const names = ["DEMO_ACCOUNT_A", "DEMO_ACCOUNT_B", "MEASURE_ACCOUNT_1", "MEASURE_ACCOUNT_2", "MEASURE_ACCOUNT_3"];
    const accounts = [config.demoA, config.demoB, ...config.measure];
    const text = [
      `SEED_SUPABASE_URL=${url}`,
      `${["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")}=${config.serviceRoleKey}`,
      `${["PROCESS", "DOCUMENT", "SECRET"].join("_")}=${config.processSecret}`,
      ...names.flatMap((name, index) => [`${name}_EMAIL=${accounts[index].email}`, `${name}_PASSWORD=${accounts[index].password}`]),
    ].join("\n");
    writeFileSync(file, text);
    return { file, dir, text };
  }

  it("relance locale : réussie, aucune valeur affichée", () => {
    const { file, dir } = envFile(config.url);
    const result = seed(["--mini", "--seed-file", file]);
    rmSync(dir, { recursive: true, force: true });
    const output = result.stdout + result.stderr;
    expect(result.status, output).toBe(0);
    expect(output).toContain("cible : 127.0.0.1");
    expect(output).toContain("contrôle final réussi");
    for (const secret of [config.serviceRoleKey, config.processSecret, config.demoA.email, config.demoA.password]) {
      expect(output).not.toContain(secret);
    }
  });

  it("--remote exige de vrais vecteurs : refus des vecteurs simulés de la pile locale", () => {
    const { file, dir } = envFile(config.url);
    const result = seed(["--mini", "--remote", "--seed-file", file]);
    rmSync(dir, { recursive: true, force: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("vrais vecteurs");
  });

  it("variables du terminal ignorées : seule compte le fichier", () => {
    const { file, dir, text } = envFile(config.url);
    writeFileSync(file, text.replace(/^DEMO_ACCOUNT_B_PASSWORD=.*$/m, "DEMO_ACCOUNT_B_PASSWORD="));
    const result = seed(["--mini", "--seed-file", file], { DEMO_ACCOUNT_B_PASSWORD: "valeur-du-terminal" });
    rmSync(dir, { recursive: true, force: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DEMO_ACCOUNT_B_PASSWORD");
  });

  it("projet distant sans --remote : refus avant toute écriture", () => {
    const { file, dir } = envFile("https://abcdefghijklmnopqrst.supabase.co");
    const result = seed(["--mini", "--seed-file", file]);
    rmSync(dir, { recursive: true, force: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--remote");
    expect(result.stdout).not.toContain("Comptes prêts");
  });

  it("fichier absent : échec clair", () => {
    const result = seed(["--mini", "--seed-file", path.join(tmpdir(), "absent.env.seed")]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("introuvable");
  });
});
