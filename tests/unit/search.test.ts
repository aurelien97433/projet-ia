import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as appSearch from "@/lib/schemas/search";
import { texts } from "@/lib/texts";
import {
  RAG_MIN_SIMILARITY,
  ragMinSimilarity,
  SEARCH_MAX_DOCUMENTS,
  SEARCH_PASSAGES_PER_DOCUMENT,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_TIMEOUT_MS,
  SIMULATED_MIN_SIMILARITY,
} from "../../supabase/functions/_shared/config.ts";
import { type MatchRow, parseSearchQuery, searchVectorization, toSearchResponse } from "../../supabase/functions/_shared/search.ts";

// Recherche sémantique (story 4.1a) : règles communes aux deux étages, sans réseau.
const env: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const row = (documentId: string, passageId: string, extra: Partial<MatchRow> = {}): MatchRow => ({
  document_id: documentId,
  title: `Titre ${documentId}`,
  category: "procedure",
  passage_id: passageId,
  start_offset: 10,
  end_offset: 42,
  content: `Passage ${passageId}`,
  similarity: 0.73,
  ...extra,
});

describe("constantes", () => {
  it("5 Documents, 1 Passage chacun, Requête de 500 caractères, délai de 10 s", () => {
    expect(SEARCH_MAX_DOCUMENTS).toBe(5);
    expect(SEARCH_PASSAGES_PER_DOCUMENT).toBe(1);
    expect(SEARCH_QUERY_MAX_LENGTH).toBe(500);
    expect(SEARCH_TIMEOUT_MS).toBe(10_000);
  });

  it("src/lib/schemas/search reprend les mêmes limites que les Edge Functions", () => {
    expect(appSearch.SEARCH_QUERY_MAX_LENGTH).toBe(SEARCH_QUERY_MAX_LENGTH);
    expect(appSearch.SEARCH_MAX_DOCUMENTS).toBe(SEARCH_MAX_DOCUMENTS);
  });

  it("le texte de panne des Edge Functions est celui du catalogue", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("supabase/functions/semantic-search/index.ts", "utf8");
    expect(source).toContain(`"${texts.search.failed}"`);
    expect(source).toContain(`"${texts.session.expired}"`);
  });
});

describe("validation de la Requête, aux deux étages", () => {
  const parsers = [
    ["Edge Function", parseSearchQuery],
    ["Next.js", appSearch.parseSearchRequest],
  ] as const;

  it.each(parsers)("%s : espaces retirés, 1 et 500 caractères acceptés", (_, parse) => {
    expect(parse({ query: "  organisation des congés \n" })).toBe("organisation des congés");
    expect(parse({ query: "a" })).toBe("a");
    expect(parse({ query: ` ${"é".repeat(500)} ` })).toBe("é".repeat(500));
  });

  it.each(parsers)("%s : vide, espaces, > 500 caractères, absente ou non textuelle → refusée", (_, parse) => {
    for (const body of [
      { query: "" },
      { query: "   \n\t" },
      { query: "a".repeat(501) },
      {},
      { query: 42 },
      { query: ["congés"] },
      { query: null },
      null,
      "congés",
      ["congés"],
      undefined,
    ]) {
      expect(parse(body), JSON.stringify(body)).toBeNull();
    }
  });
});

describe("toSearchResponse", () => {
  it("ordre conservé, un Document une seule fois, positions et Passage, jamais de similarité", () => {
    const response = toSearchResponse([row("d1", "p1"), row("d2", "p2"), row("d1", "p3")]);
    expect(response).toEqual({
      results: [
        { documentId: "d1", title: "Titre d1", category: "procedure", passage: { id: "p1", start: 10, end: 42, content: "Passage p1" } },
        { documentId: "d2", title: "Titre d2", category: "procedure", passage: { id: "p2", start: 10, end: 42, content: "Passage p2" } },
      ],
    });
    expect(JSON.stringify(response)).not.toMatch(/similarity|0\.73|content_text/);
  });

  it("clés inattendues de la base ignorées (content_text, score)", () => {
    const response = toSearchResponse([{ ...row("d1", "p1"), content_text: "Texte complet", score: 1 }]);
    expect(JSON.stringify(response)).not.toMatch(/content_text|Texte complet|score/);
  });

  it("5 Documents au plus", () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(`d${index}`, `p${index}`));
    expect(toSearchResponse(rows)!.results).toHaveLength(5);
  });

  it("aucune ligne : liste vide", () => {
    expect(toSearchResponse([])).toEqual({ results: [] });
  });

  it("réponse illisible : null", () => {
    expect(toSearchResponse(null)).toBeNull();
    expect(toSearchResponse({ rows: [] })).toBeNull();
    expect(toSearchResponse([{ ...row("d1", "p1"), start_offset: "10" }])).toBeNull();
    expect(toSearchResponse([{ ...row("d1", "p1"), title: undefined }])).toBeNull();
  });
});

describe("seuil de pertinence", () => {
  it("0,40 par défaut", () => {
    expect(RAG_MIN_SIMILARITY).toBe(0.4);
    expect(ragMinSimilarity(false)).toBe(0.4);
  });

  it("secret RAG_MIN_SIMILARITY retenu entre 0 et 1", () => {
    for (const [raw, expected] of [["0.35", 0.35], [" 0.5 ", 0.5], ["0", 0], ["1", 1]] as const) {
      env.RAG_MIN_SIMILARITY = raw;
      expect(ragMinSimilarity(false), raw).toBe(expected);
    }
  });

  it("secret hors bornes ou illisible : défaut de 0,40", () => {
    for (const raw of ["-0.1", "1.01", "abc", "", "  ", "NaN", "Infinity", "0,35"]) {
      env.RAG_MIN_SIMILARITY = raw;
      expect(ragMinSimilarity(false), raw).toBe(0.4);
    }
  });
});

// Décision Q1 du 2026-11-10 : le seuil simulé de 0,20 n'existe que pour la vectorisation simulée
// de la pile locale. searchVectorization est exactement ce qu'exécute semantic-search.
describe("seuil simulé : jamais hors de la pile locale", () => {
  it("pile locale et EMBEDDINGS_FAKE=1 : vectorisation simulée et seuil de 0,20", () => {
    env.SUPABASE_URL = "http://kong:8000";
    env.EMBEDDINGS_FAKE = "1";
    const result = searchVectorization();
    expect(result.simulated).toBe(true);
    expect(result.deps).toBeDefined();
    expect(result.minSimilarity).toBe(SIMULATED_MIN_SIMILARITY);
    expect(SIMULATED_MIN_SIMILARITY).toBe(0.2);
  });

  it.each([
    ["projet distant, EMBEDDINGS_FAKE=1", { SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", EMBEDDINGS_FAKE: "1" }],
    ["projet distant, EMBEDDINGS_FAKE absent", { SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }],
    ["pile locale, EMBEDDINGS_FAKE absent", { SUPABASE_URL: "http://kong:8000" }],
    ["pile locale, EMBEDDINGS_FAKE=true", { SUPABASE_URL: "http://kong:8000", EMBEDDINGS_FAKE: "true" }],
    ["hôte proche de kong", { SUPABASE_URL: "https://kong.exemple.test", EMBEDDINGS_FAKE: "1" }],
    ["URL absente", { EMBEDDINGS_FAKE: "1" }],
  ])("%s : vectorisation réelle, seuil de 0,40", (_, values) => {
    Object.assign(env, values);
    const result = searchVectorization();
    expect(result.simulated).toBe(false);
    expect(result.deps).toBeUndefined();
    expect(result.minSimilarity).toBe(0.4);
  });

  it("projet distant avec EMBEDDINGS_FAKE=1 : le secret RAG_MIN_SIMILARITY reste appliqué", () => {
    Object.assign(env, { SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", EMBEDDINGS_FAKE: "1", RAG_MIN_SIMILARITY: "0.45" });
    expect(searchVectorization().minSimilarity).toBe(0.45);
  });
});

describe("searchResponseSchema (relais Next.js)", () => {
  it("retire toute clé non déclarée : ni similarité, ni texte complet", () => {
    const parsed = appSearch.searchResponseSchema.parse({
      results: [
        {
          documentId: "d1",
          title: "T",
          category: "procedure",
          similarity: 0.9,
          content_text: "Texte complet",
          passage: { id: "p1", start: 0, end: 5, content: "Passa", similarity: 0.9 },
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/similarity|content_text|Texte complet/);
  });

  it("plus de 5 résultats refusés", () => {
    const result = { documentId: "d", title: "T", category: "procedure", passage: { id: "p", start: 0, end: 1, content: "x" } };
    expect(appSearch.searchResponseSchema.safeParse({ results: Array(6).fill(result) }).success).toBe(false);
  });
});
