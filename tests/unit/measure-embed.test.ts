import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from "../../supabase/functions/_shared/config.ts";
import { handle, MEASURE_MAX_TEXTS, parseMeasureTexts } from "../../supabase/functions/measure-embed/index.ts";

// Fonction locale measure-embed (story 4.2) : clé service_role exigée, Requêtes validées,
// vectorisation toujours réelle (jamais simulée), textes jamais journalisés. Fournisseur simulé ici.
const SERVICE = ["cle", "service", "locale", "de", "test"].join("-");
const env: Record<string, string | undefined> = {};
const fetchMock = vi.fn();
const vector = () => Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === 0 ? 1 : 0));

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
  env[["OPENAI", "API", "KEY"].join("_")] = ["cle", "fournisseur", "test"].join("-");
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const { input } = JSON.parse(String(init.body)) as { input: string[] };
    return Response.json({ data: input.map((_, index) => ({ index, embedding: vector() })) });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const call = (body: unknown, authorization: string | undefined = `Bearer ${SERVICE}`) =>
  handle(
    new Request("http://localhost/functions/v1/measure-embed", {
      method: "POST",
      headers: authorization ? { Authorization: authorization } : {},
      body: JSON.stringify(body),
    }),
  );

describe("measure-embed", () => {
  it("vectorise les Requêtes : modèle, version, dimension de production, un vecteur par Requête", async () => {
    const response = await call({ texts: [" revue après un incident critique ", "recette de la tarte aux pommes"] });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ model: EMBEDDING_MODEL, version: 1, dimension: EMBEDDING_DIMENSION, expectedDimension: EMBEDDING_DIMENSION });
    expect(body.vectors).toHaveLength(2);
    const [[url, init]] = fetchMock.mock.calls;
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(JSON.parse(init.body).input).toEqual(["revue après un incident critique", "recette de la tarte aux pommes"]);
  });

  it("vectorisation simulée demandée sur la pile locale : ignorée, l'appel au fournisseur reste réel", async () => {
    Object.assign(env, { SUPABASE_URL: "http://kong:8000", EMBEDDINGS_FAKE: "1" });
    await call({ texts: ["congés"] });
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/embeddings", expect.anything());
  });

  it("textes jamais journalisés", async () => {
    await call({ texts: ["Requête confidentielle"] });
    const output = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls].flat().join("\n");
    expect(output).toContain("measure_embed_done");
    expect(output).not.toContain("confidentielle");
  });

  it.each([
    ["sans en-tête", undefined],
    ["clé publique", "Bearer sb_publishable_exemple"],
    ["autre valeur", "Bearer autre"],
  ])("%s : 401, aucun appel au fournisseur", async (_, authorization) => {
    const response = await call({ texts: ["congés"] }, authorization ?? "");
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clé service_role absente de l'environnement : tout appel refusé", async () => {
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await call({ texts: ["congés"] }, "Bearer ")).status).toBe(401);
  });

  it.each([
    ["liste vide", { texts: [] }],
    ["trop de textes", { texts: Array(MEASURE_MAX_TEXTS + 1).fill("congés") }],
    ["texte vide", { texts: ["congés", "  "] }],
    ["texte > 500 caractères", { texts: ["a".repeat(501)] }],
    ["texte non textuel", { texts: [12] }],
    ["texts absent", {}],
  ])("%s : 400, aucun appel au fournisseur", async (_, body) => {
    expect((await call(body)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parseMeasureTexts : 20 textes acceptés, nettoyés", () => {
    expect(parseMeasureTexts({ texts: Array(MEASURE_MAX_TEXTS).fill(" a ") })).toEqual(Array(MEASURE_MAX_TEXTS).fill("a"));
  });

  it("panne du fournisseur : code AD-19, sans détail", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: "invalid_api_key" } }, { status: 401 }));
    const response = await call({ texts: ["congés"] });
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text).error.code).toBe("AI_UNAVAILABLE");
    expect(text).not.toContain("invalid_api_key");
  });
});
