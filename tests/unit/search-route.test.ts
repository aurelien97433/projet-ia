import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appError } from "@/lib/errors";
import { texts } from "@/lib/texts";

// POST /api/search et relais vers semantic-search (story 4.1a) : session vérifiée, Requête
// revalidée, jeton de la session transmis, codes AD-19 relayés, aucun score ne passe.
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getSession: vi.fn() }));
vi.mock("@/server/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getSession: mocks.getSession } }) }));

const { POST } = await import("@/app/api/search/route");
const { relaySearch, SEARCH_RELAY_TIMEOUT_MS } = await import("@/server/search/semantic-search");

const TOKEN = "jeton-de-session";
const QUERY = "organisation des congés";
const TARGET = { url: "https://projet.exemple.test/functions/v1/semantic-search", apikey: "sb_publishable_exemple" };
const RESULT = {
  documentId: "d1",
  title: "Procédure congés et absences",
  category: "procedure",
  passage: { id: "p1", start: 0, end: 12, content: "Les congés…" },
};
const fetchMock = vi.fn();

const post = (body: unknown) =>
  new Request("http://localhost/api/search", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projet.exemple.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_exemple");
  mocks.requireUser.mockResolvedValue({ user: { id: "u1", email: "" } });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: TOKEN } } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/search", () => {
  it("relaie la Requête avec le jeton de la session et la clé publique, réponse jamais en cache", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [{ ...RESULT, similarity: 0.9 }] }));
    const response = await POST(post({ query: `  ${QUERY}  ` }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ results: [RESULT] });
    expect(text).not.toContain("similarity");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://projet.exemple.test/functions/v1/semantic-search");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, apikey: "sb_publishable_exemple" });
    expect(JSON.parse(init.body)).toEqual({ query: QUERY });
  });

  it("sans session : 401, aucun relais", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, ...appError("UNAUTHENTICATED", texts.session.expired, false) });
    const response = await POST(post({ query: QUERY }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("jeton d'accès absent du cookie : 401, aucun relais", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const response = await POST(post({ query: QUERY }));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["vide", { query: "" }],
    ["espaces", { query: "  " }],
    ["> 500 caractères", { query: "a".repeat(501) }],
    ["absente", {}],
    ["non textuelle", { query: true }],
    ["corps illisible", "pas du json"],
  ])("Requête %s : 400 VALIDATION_FAILED, texte du catalogue, aucun relais", async (_, body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(appError("VALIDATION_FAILED", texts.search.failed, false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Requête de 500 caractères acceptée", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [] }));
    const response = await POST(post({ query: "é".repeat(500) }));
    expect(response.status).toBe(200);
  });
});

describe("relaySearch", () => {
  it("délai de 12 s", () => {
    expect(SEARCH_RELAY_TIMEOUT_MS).toBe(12_000);
  });

  it.each([
    ["AI_TIMEOUT", 504, true],
    ["AI_UNAVAILABLE", 503, true],
    ["AI_BUDGET_EXHAUSTED", 503, false],
    ["VALIDATION_FAILED", 400, false],
    ["INTERNAL", 500, true],
  ] as const)("code %s relayé tel quel, avec le texte du catalogue", async (code, status, retryable) => {
    fetchMock.mockResolvedValue(Response.json({ error: { code, message: "détail", retryable } }, { status }));
    const result = await relaySearch(QUERY, TOKEN, TARGET);
    expect(result).toEqual({ status, body: appError(code, texts.search.failed, retryable) });
  });

  it("401 de la passerelle (corps hors AD-19) : UNAUTHENTICATED", async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 401, message: "Invalid JWT" }, { status: 401 }));
    expect(await relaySearch(QUERY, TOKEN, TARGET)).toEqual({
      status: 401,
      body: appError("UNAUTHENTICATED", texts.session.expired, false),
    });
  });

  it.each([
    ["réseau", () => Promise.reject(new TypeError("fetch failed"))],
    ["délai", () => Promise.reject(new DOMException("délai", "TimeoutError"))],
    ["code inconnu", () => Promise.resolve(Response.json({ error: { code: "AUTRE" } }, { status: 500 }))],
    ["corps illisible", () => Promise.resolve(new Response("<html>", { status: 502 }))],
    ["succès mal formé", () => Promise.resolve(Response.json({ results: [{ documentId: 1 }] }))],
  ])("panne du relais (%s) : AI_UNAVAILABLE réessayable, sans détail", async (_, respond) => {
    fetchMock.mockImplementation(respond);
    const result = await relaySearch(QUERY, TOKEN, TARGET);
    expect(result).toEqual({ status: 503, body: appError("AI_UNAVAILABLE", texts.search.failed, true) });
  });

  it("délai du relais réellement appliqué", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    const started = Date.now();
    const result = await relaySearch(QUERY, TOKEN, TARGET, 100);
    expect(result.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("clé publique absente : AI_UNAVAILABLE, aucun appel", async () => {
    const result = await relaySearch(QUERY, TOKEN, { ...TARGET, apikey: undefined });
    expect(result.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("journaux sans Requête ni jeton", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [RESULT] }));
    await relaySearch(QUERY, TOKEN, TARGET);
    fetchMock.mockResolvedValue(Response.json({ error: { code: "AI_TIMEOUT", retryable: true } }, { status: 504 }));
    await relaySearch(QUERY, TOKEN, TARGET);
    const output = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls].flat().join("\n");
    expect(output).toContain("duration_ms");
    expect(output).not.toContain(QUERY);
    expect(output).not.toContain(TOKEN);
  });
});
