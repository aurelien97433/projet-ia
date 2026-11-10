import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Account, loadMiniSet, type SeedConfig, seedMini } from "../../scripts/seed-demo";
import { EMBEDDING_MODEL, EMBEDDING_VERSION, SIMULATED_MIN_SIMILARITY } from "../../supabase/functions/_shared/config.ts";
import { fakeVector } from "../../supabase/functions/_shared/fake-embeddings.ts";
import { localProcessSecret, localSupabase, uniqueEmail } from "../support/local-supabase";

// Edge Function semantic-search réelle (story 4.1a), servie par Supabase local avec la vectorisation
// simulée (lexicale, seuil simulé de 0,20, décision Q1) : elle prouve la mécanique, pas la
// pertinence réelle, mesurée sur le projet distant par npm run test:search:live.
const root = path.resolve(import.meta.dirname, "..", "..");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const account = (prefix: string): Account => ({ email: uniqueEmail(prefix), password: ["Mot", "de", "passe", "seed"].join("-") });
const set = loadMiniSet();
const { searchQueries } = JSON.parse(readFileSync(path.join(root, "demo", "questions-mini.json"), "utf8")) as {
  searchQueries: { id: string; query: string; expectedDocument: string }[];
};
const titleOf = (key: string) => set.documents.find((document) => document.key === key)!.title;

let admin: SupabaseClient;
let collaborator: SupabaseClient;
let token: string;
let config: SeedConfig;
const extraDocuments: string[] = [];
const report: string[] = [];

type Result = { documentId: string; title: string; category: string; passage: { id: string; start: number; end: number; content: string } };

const functionUrl = () => `${localSupabase().url}/functions/v1/semantic-search`;

async function search(query: unknown, headers: Record<string, string> = { Authorization: `Bearer ${token}` }) {
  const started = performance.now();
  const response = await fetch(functionUrl(), {
    method: "POST",
    headers: { apikey: localSupabase().publishableKey, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(query === undefined ? {} : { query }),
  });
  const text = await response.text();
  return { status: response.status, text, durationMs: Math.round(performance.now() - started) };
}

// Rang du Document attendu parmi les titres distincts (d'autres tests peuvent avoir préchargé le
// même mini Jeu en parallèle : deux copies d'un Document comptent pour un seul rang).
function rankOf(results: Result[], title: string): number | null {
  const titles = [...new Set(results.map((result) => result.title))];
  const index = titles.indexOf(title);
  return index === -1 ? null : index + 1;
}

// Similarité simulée du Document attendu, lue directement dans match_passages (rapport local seul,
// pour préparer la 4.2 : la réponse de la Recherche ne la porte jamais).
async function simulatedSimilarity(query: string, title: string): Promise<number | null> {
  const { data } = await collaborator.rpc("match_passages", {
    query_embedding: JSON.stringify(fakeVector(query)),
    min_similarity: 0,
    max_passages: 200,
    max_per_document: 1,
    embedding_model: EMBEDDING_MODEL,
    embedding_version: EMBEDDING_VERSION,
  });
  const row = (data as { title: string; similarity: number }[] | null)?.find((candidate) => candidate.title === title);
  return row ? Number(row.similarity.toFixed(3)) : null;
}

async function documentWithQueryVector(status: "processing" | "error", query: string) {
  const { data, error } = await collaborator
    .from("documents")
    .insert({ title: `Non prêt ${status}`, category: "procedure", content_text: query, client_request_id: crypto.randomUUID() })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  extraDocuments.push(data.id);
  await admin.from("documents").update({ status, ...(status === "error" ? { error_kind: "temporary" } : {}) }).eq("id", data.id);
  const insert = await admin.from("passages").insert({
    document_id: data.id,
    text_version: 1,
    ordinal: 0,
    start_offset: 0,
    end_offset: query.length,
    content: query,
    embedding: JSON.stringify(fakeVector(query)),
    embedding_model: EMBEDDING_MODEL,
    embedding_version: EMBEDDING_VERSION,
  });
  if (insert.error) throw new Error(`Création du Passage de test impossible : ${insert.error.message}`);
  return data.id;
}

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  config = {
    url,
    serviceRoleKey,
    processSecret: localProcessSecret(),
    demoA: account("search-a"),
    demoB: account("search-b"),
    measure: [account("search-m1"), account("search-m2"), account("search-m3")],
  };
  await seedMini(config, { log: () => {} });

  collaborator = createClient(url, publishableKey, options);
  const { data, error } = await collaborator.auth.signInWithPassword(config.measure[0]);
  if (error || !data.session) throw new Error(`Connexion du Compte de mesure impossible : ${error?.code}`);
  token = data.session.access_token;
}, 180_000);

afterAll(async () => {
  if (report.length > 0) {
    console.info(
      [`Rapport local (vectorisation simulée, seuil ${SIMULATED_MIN_SIMILARITY}) :`, ...report].join("\n"),
    );
  }
  for (const id of extraDocuments) await admin.from("documents").delete().eq("id", id);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emails = new Set([config.demoA, config.demoB, ...config.measure].map((item) => item.email));
  for (const user of data.users.filter((candidate) => emails.has(candidate.email ?? ""))) {
    await admin.auth.admin.deleteUser(user.id);
  }
});

describe("semantic-search sur le mini Jeu local", () => {
  it("« organisation des congés » : « Procédure congés et absences » dans les 3 premiers, réponse conforme", async () => {
    const { status, text, durationMs } = await search("organisation des congés");
    expect(status).toBe(200);
    expect(text).not.toMatch(/similarity|content_text/);
    const { results } = JSON.parse(text) as { results: Result[] };
    const title = titleOf("procedure-conges");
    const rank = rankOf(results, title);
    report.push(`- pertinent « organisation des congés » : rang ${rank}, ${durationMs} ms`);
    expect(rank).not.toBeNull();
    expect(rank!).toBeLessThanOrEqual(3);

    expect(results.length).toBeLessThanOrEqual(5);
    expect(new Set(results.map((result) => result.documentId)).size).toBe(results.length);
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual(["category", "documentId", "passage", "title"]);
      expect(Object.keys(result.passage).sort()).toEqual(["content", "end", "id", "start"]);
      expect(result.passage.end).toBeGreaterThan(result.passage.start);
    }
    // Le Passage renvoyé est exactement l'extrait du texte du Document à ses positions.
    const found = results.find((result) => result.title === title)!;
    const { data } = await admin.from("documents").select("content_text").eq("id", found.documentId).single();
    expect(data!.content_text.slice(found.passage.start, found.passage.end)).toBe(found.passage.content);
  });

  it.each(searchQueries)("$id « $query » : bon Document dans les 3 premiers", async ({ id, query, expectedDocument }) => {
    const { status, text, durationMs } = await search(query);
    expect(status).toBe(200);
    const title = titleOf(expectedDocument);
    const rank = rankOf((JSON.parse(text) as { results: Result[] }).results, title);
    report.push(`- ${id} : rang ${rank ?? "absent"}, ${durationMs} ms, similarité simulée ${await simulatedSimilarity(query, title)}`);
    expect(rank).not.toBeNull();
    expect(rank!).toBeLessThanOrEqual(3);
  });

  it("Documents en cours ou en erreur proches de la Requête : jamais renvoyés", async () => {
    const query = "organisation des congés";
    const ids = [await documentWithQueryVector("processing", query), await documentWithQueryVector("error", query)];
    const { status, text } = await search(query);
    expect(status).toBe(200);
    const returned = (JSON.parse(text) as { results: Result[] }).results.map((result) => result.documentId);
    for (const id of ids) expect(returned).not.toContain(id);
  });

  it("sans jeton ou jeton invalide : 401, refusé dès la passerelle", async () => {
    const missing = await search("organisation des congés", { Authorization: "" });
    expect(missing.status).toBe(401);
    const invalid = await search("organisation des congés", { Authorization: "Bearer jeton-invalide" });
    expect(invalid.status).toBe(401);
    expect(invalid.text).not.toContain("results");
  });

  it("clé publique seule, sans session de Collaborateur : 401", async () => {
    const { status } = await search("organisation des congés", { Authorization: `Bearer ${localSupabase().publishableKey}` });
    expect(status).toBe(401);
  });

  it.each([
    ["vide", ""],
    ["espaces", "   "],
    ["> 500 caractères", "a".repeat(501)],
    ["absente", undefined],
    ["non textuelle", 42],
  ])("Requête %s : 400 VALIDATION_FAILED", async (_, query) => {
    const { status, text } = await search(query);
    expect(status).toBe(400);
    expect(JSON.parse(text).error).toEqual({ code: "VALIDATION_FAILED", message: "La Recherche n'a pas pu aboutir.", retryable: false });
  });

  it("durée consignée : sous 3 s une fois la fonction chargée", async () => {
    await search("procédure de facturation");
    const durations: number[] = [];
    for (const { query } of searchQueries.slice(0, 3)) durations.push((await search(query)).durationMs);
    report.push(`- durées à chaud : ${durations.join(", ")} ms`);
    expect(Math.max(...durations)).toBeLessThan(3_000);
  });
});
