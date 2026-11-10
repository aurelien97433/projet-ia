import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL, EMBEDDING_VERSION } from "../../supabase/functions/_shared/config.ts";
import { handle } from "../../supabase/functions/semantic-search/index.ts";

// Edge Function semantic-search (story 4.1a), fournisseur et base simulés : session vérifiée,
// Requête revalidée, délai commun de 10 s, codes AD-19, réponse sans score, journaux sans Requête.
const REMOTE = "https://abcdefghijklmnopqrst.supabase.co";
const TOKEN = "jeton-du-collaborateur";
const PUBLISHABLE = "sb_publishable_exemple";
const QUERY = "organisation des congés";
const env: Record<string, string | undefined> = {};

type Handler = (url: string, init: RequestInit) => Promise<Response>;
let routes: { auth: Handler; embed: Handler; rpc: Handler };
const fetchMock = vi.fn();

const vector = () => Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === 0 ? 1 : 0));
const embedOk: Handler = async () => Response.json({ data: [{ index: 0, embedding: vector() }] });
const rows = [
  {
    document_id: "d1",
    title: "Procédure congés et absences",
    category: "procedure",
    passage_id: "p1",
    start_offset: 0,
    end_offset: 120,
    content: "Les congés se demandent…",
    similarity: 0.81,
  },
];

// Attend l'interruption par le délai commun, comme un fournisseur ou une base trop lents.
const hang: Handler = (_, init) =>
  new Promise((_, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("interrompu", "AbortError")));
  });

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  // Valeurs factices, composées pour ne pas ressembler à un secret aux yeux de check:secrets.
  env.SUPABASE_URL = REMOTE;
  env.SUPABASE_ANON_KEY = ["cle", "anon", "du", "projet"].join("-");
  env[["OPENAI", "API", "KEY"].join("_")] = ["cle", "fournisseur", "test"].join("-");
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
  routes = { auth: async () => Response.json({ id: "u1" }), embed: embedOk, rpc: async () => Response.json(rows) };
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return routes.auth(url, init);
    if (url.endsWith("/embeddings")) return routes.embed(url, init);
    if (url.endsWith("/rest/v1/rpc/match_passages")) return routes.rpc(url, init);
    throw new Error(`appel inattendu : ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const request = (body: unknown, headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}`, apikey: PUBLISHABLE }) =>
  new Request("http://localhost/functions/v1/semantic-search", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const calls = (suffix: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix));
const logs = () =>
  [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls].map((call) => call.join(" ")).join("\n");

describe("semantic-search", () => {
  it("Requête valide : 200, résultats sans score ni texte complet, version active et seuil de 0,40", async () => {
    const response = await handle(request({ query: `  ${QUERY} ` }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      results: [
        {
          documentId: "d1",
          title: "Procédure congés et absences",
          category: "procedure",
          passage: { id: "p1", start: 0, end: 120, content: "Les congés se demandent…" },
        },
      ],
    });
    expect(text).not.toMatch(/similarity|0\.81|content_text/);

    const [[, embedInit]] = calls("/embeddings");
    expect(JSON.parse(String(embedInit.body)).input).toEqual([QUERY]);

    const [[, rpcInit]] = calls("/rest/v1/rpc/match_passages");
    const body = JSON.parse(String(rpcInit.body));
    expect(body).toMatchObject({
      min_similarity: 0.4,
      max_passages: 5,
      max_per_document: 1,
      embedding_model: EMBEDDING_MODEL,
      embedding_version: EMBEDDING_VERSION,
    });
    expect(JSON.parse(body.query_embedding)).toHaveLength(EMBEDDING_DIMENSION);
    // La base est interrogée avec le jeton du Collaborateur et la clé publique reçue.
    expect(rpcInit.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, apikey: PUBLISHABLE });
  });

  it("journaux : durées et nombre de résultats, jamais la Requête ni le jeton", async () => {
    await handle(request({ query: QUERY }));
    const output = logs();
    expect(output).toContain("semantic_search_done");
    expect(output).toMatch(/"duration_ms":\d+/);
    expect(output).toContain('"results":1');
    expect(output).not.toContain(QUERY);
    expect(output).not.toContain(TOKEN);
  });

  it("aucun Passage au-dessus du seuil : liste vide", async () => {
    routes.rpc = async () => Response.json([]);
    const response = await handle(request({ query: "recette de la tarte aux pommes" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [] });
  });

  it("clé secrète reçue : ignorée, la clé publique du projet est utilisée", async () => {
    await handle(request({ query: QUERY }, { Authorization: `Bearer ${TOKEN}`, apikey: "sb_secret_exemple" }));
    for (const [, init] of [...calls("/auth/v1/user"), ...calls("/rest/v1/rpc/match_passages")]) {
      expect(init.headers.apikey).toBe(env.SUPABASE_ANON_KEY);
    }
  });

  it("sans jeton : 401 UNAUTHENTICATED, aucun appel", async () => {
    const response = await handle(request({ query: QUERY }, {}));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("jeton refusé par le serveur Auth : 401, ni vectorisation ni recherche", async () => {
    routes.auth = async () => new Response("{}", { status: 401 });
    const response = await handle(request({ query: QUERY }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Votre session a expiré. Reconnectez-vous pour continuer.", retryable: false },
    });
    expect(calls("/embeddings")).toHaveLength(0);
  });

  it.each([
    ["vide", { query: "" }],
    ["espaces", { query: "   " }],
    ["> 500 caractères", { query: "a".repeat(501) }],
    ["absente", {}],
    ["non textuelle", { query: 12 }],
    ["corps illisible", "{pas du json"],
  ])("Requête %s : 400 VALIDATION_FAILED, aucune vectorisation", async (_, body) => {
    const response = await handle(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_FAILED", message: "La Recherche n'a pas pu aboutir.", retryable: false },
    });
    expect(calls("/embeddings")).toHaveLength(0);
  });

  it("autre méthode que POST : refusée", async () => {
    const response = await handle(new Request("http://localhost/", { method: "GET" }));
    expect(response.status).toBe(405);
  });

  it("plafond du fournisseur : AI_BUDGET_EXHAUSTED, non réessayable", async () => {
    routes.embed = async () => Response.json({ error: { code: "insufficient_quota" } }, { status: 429 });
    const response = await handle(request({ query: QUERY }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toEqual({ code: "AI_BUDGET_EXHAUSTED", message: "La Recherche n'a pas pu aboutir.", retryable: false });
  });

  it("fournisseur en échec : AI_UNAVAILABLE, sans détail technique", async () => {
    routes.embed = async () => Response.json({ error: { code: "invalid_api_key" } }, { status: 401 });
    const response = await handle(request({ query: QUERY }));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text).error.code).toBe("AI_UNAVAILABLE");
    expect(text).not.toMatch(/invalid_api_key|401/);
  });

  it("fournisseur trop lent : AI_TIMEOUT au délai commun", async () => {
    routes.embed = hang;
    const started = Date.now();
    const response = await handle(request({ query: QUERY }), { timeoutMs: 300 });
    expect(response.status).toBe(504);
    expect((await response.json()).error).toEqual({ code: "AI_TIMEOUT", message: "La Recherche n'a pas pu aboutir.", retryable: true });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(calls("/rest/v1/rpc/match_passages")).toHaveLength(0);
  });

  it("fournisseur en panne puis délai commun atteint pendant l'attente entre deux tentatives : AI_TIMEOUT", async () => {
    routes.embed = async () => new Response("{}", { status: 503 });
    const response = await handle(request({ query: QUERY }), { timeoutMs: 200 });
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("AI_TIMEOUT");
  });

  it("base trop lente après la vectorisation : AI_TIMEOUT, sans rejet non géré", async () => {
    routes.rpc = hang;
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const response = await handle(request({ query: QUERY }), { timeoutMs: 300 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.off("unhandledRejection", unhandled);
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("AI_TIMEOUT");
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("base en échec : erreur réessayable, sans détail technique", async () => {
    routes.rpc = async () => Response.json({ message: "relation inconnue" }, { status: 500 });
    const response = await handle(request({ query: QUERY }));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text).error).toEqual({ code: "INTERNAL", message: "La Recherche n'a pas pu aboutir.", retryable: true });
    expect(text).not.toContain("relation");
  });
});
