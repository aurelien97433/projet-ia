import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appError } from "@/lib/errors";
import { formatResetMoment } from "@/lib/reset-moment";
import { SUMMARY_MAX_POINTS, SUMMARY_POINT_MAX_LENGTH } from "@/lib/schemas/summary";
import { texts } from "@/lib/texts";
import { currentSummary } from "@/server/documents/get-document";
import { SUMMARY_MAX_POINTS as FUNCTION_MAX_POINTS, SUMMARY_POINT_MAX_LENGTH as FUNCTION_POINT_MAX } from "../../supabase/functions/_shared/config.ts";

// POST /api/documents/[id]/summary et relais vers summarize (story 6.1) : session vérifiée, identifiant
// contrôlé, jeton de la session transmis (jamais service_role), codes AD-19 relayés avec le texte du
// catalogue et resetAt, réponse relue ; Résumé à jour lu par la page Document.
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getSession: vi.fn() }));
vi.mock("@/server/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getSession: mocks.getSession } }) }));

const { POST, maxDuration } = await import("@/app/api/documents/[id]/summary/route");
const { relaySummary, SUMMARY_RELAY_TIMEOUT_MS } = await import("@/server/summary/relay");

const TOKEN = "jeton-de-session";
const DOC = "d1d1d1d1-0000-4000-8000-000000000001";
const TARGET = { url: "https://projet.exemple.test/functions/v1/summarize", apikey: "sb_publishable_exemple" };
const SUMMARY = { summary: { points: ["La procédure prévoit une validation."], generatedAt: "2026-11-23T10:00:00.000Z", textVersion: 1 }, generated: true };
const fetchMock = vi.fn();

const post = (id: string) =>
  POST(new Request(`http://localhost/api/documents/${id}/summary`, { method: "POST" }), { params: Promise.resolve({ id }) });

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

describe("POST /api/documents/[id]/summary", () => {
  it("maxDuration 150 s ; relaie vers summarize avec le jeton de la session et l'identifiant seul ; Résumé renvoyé, no-store", async () => {
    expect(maxDuration).toBe(150);
    fetchMock.mockResolvedValue(Response.json(SUMMARY));
    const response = await post(DOC.toUpperCase());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(SUMMARY);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(TARGET.url);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(new Headers(init.headers).get("apikey")).toBe(TARGET.apikey);
    expect(JSON.parse(init.body)).toEqual({ documentId: DOC });
  });

  it("sans session : 401, aucun relais", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, ...appError("UNAUTHENTICATED", texts.session.expired, false) });
    const response = await post(DOC);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("identifiant non UUID : 404 NOT_FOUND neutre, aucun relais", async () => {
    const response = await post("abc");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(appError("NOT_FOUND", texts.notFound.text, false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("jeton absent de la session : 401", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    expect((await post(DOC)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("panne de la vérification de session : 500 INTERNAL au format AD-19, texte du Résumé", async () => {
    mocks.requireUser.mockRejectedValue(new Error("auth"));
    const response = await post(DOC);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(appError("INTERNAL", texts.summary.failed, true));
  });
});

describe("relaySummary", () => {
  const relay = (signal?: AbortSignal, timeoutMs?: number) => relaySummary(DOC, TOKEN, signal, TARGET, timeoutMs);

  it("délai du relais : 125 s", () => {
    expect(SUMMARY_RELAY_TIMEOUT_MS).toBe(125_000);
  });

  it.each([
    ["DOCUMENT_NOT_READY", 409, texts.summary.notReady, false],
    ["NOT_FOUND", 404, texts.notFound.text, false],
    ["REQUEST_IN_PROGRESS", 409, texts.summary.inProgress, false],
    ["AI_UNAVAILABLE", 503, texts.summary.failed, true],
    ["AI_TIMEOUT", 504, texts.summary.failed, true],
    ["AI_OUTPUT_INVALID", 502, texts.summary.failed, true],
    ["INTERNAL", 500, texts.summary.failed, true],
    ["AI_BUDGET_EXHAUSTED", 503, texts.assistant.budgetExhausted, false],
  ] as const)("%s relayé avec le texte du catalogue (jamais le texte de la fonction)", async (code, status, message, retryable) => {
    fetchMock.mockResolvedValue(Response.json({ error: { code, message: "texte technique", retryable } }, { status }));
    const result = await relay();
    expect(result).toEqual({ status, body: appError(code, message, retryable) });
  });

  it("QUOTA_EXCEEDED : resetAt relayé, texte de repli en UTC", async () => {
    const resetAt = "2026-11-24T00:00:00.000Z";
    fetchMock.mockResolvedValue(Response.json({ error: { code: "QUOTA_EXCEEDED", message: "x", retryable: false, resetAt } }, { status: 429 }));
    const result = await relay();
    expect(result).toEqual({
      status: 429,
      body: appError("QUOTA_EXCEEDED", texts.summary.quotaExceeded(`${formatResetMoment(resetAt, new Date(), "UTC")} (UTC)`), false, resetAt),
    });
  });

  it("401 de la passerelle : UNAUTHENTICATED", async () => {
    fetchMock.mockResolvedValue(new Response("Invalid JWT", { status: 401 }));
    expect((await relay()).body).toEqual(appError("UNAUTHENTICATED", texts.session.expired, false));
  });

  it("corps de succès non conforme (6 points, point trop long) : AI_UNAVAILABLE", async () => {
    for (const points of [["1", "2", "3", "4", "5", "6"], ["x".repeat(401)], []]) {
      fetchMock.mockResolvedValueOnce(Response.json({ summary: { ...SUMMARY.summary, points }, generated: true }));
      expect((await relay()).body).toEqual(appError("AI_UNAVAILABLE", texts.summary.failed, true));
    }
  });

  it("réseau : AI_UNAVAILABLE ; délai du relais : AI_TIMEOUT 504", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("réseau"));
    expect((await relay()).status).toBe(503);
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError")))),
    );
    const result = await relay(undefined, 20);
    expect(result).toEqual({ status: 504, body: appError("AI_TIMEOUT", texts.summary.failed, true) });
  });

  it("code inconnu : AI_UNAVAILABLE ; clé publique absente : aucun appel", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: "INCONNU" } }, { status: 500 }));
    expect((await relay()).body).toEqual(appError("AI_UNAVAILABLE", texts.summary.failed, true));
    fetchMock.mockClear();
    expect((await relaySummary(DOC, TOKEN, undefined, { url: TARGET.url, apikey: undefined })).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Résumé à jour lu par la page (currentSummary)", () => {
  const row = { text_version: 2, summary_points: ["A."], summary_text_version: 2, summary_generated_at: "2026-11-23T10:00:00+00:00" };

  it("Résumé à jour : points, date ISO et version", () => {
    expect(currentSummary(row)).toEqual({ points: ["A."], generatedAt: "2026-11-23T10:00:00.000Z", textVersion: 2 });
  });

  it("obsolète, absent ou mal formé : null (jamais affiché)", () => {
    expect(currentSummary({ ...row, summary_text_version: 1 })).toBeNull();
    expect(currentSummary({ text_version: 2, summary_points: null, summary_text_version: null, summary_generated_at: null })).toBeNull();
    expect(currentSummary({ ...row, summary_points: ["1", "2", "3", "4", "5", "6"] })).toBeNull();
    expect(currentSummary({ ...row, summary_points: [" "] })).toBeNull();
    expect(currentSummary({ ...row, summary_generated_at: "pas une date" })).toBeNull();
  });

  it("mêmes bornes côté Next.js et côté Edge Functions", () => {
    expect(SUMMARY_MAX_POINTS).toBe(FUNCTION_MAX_POINTS);
    expect(SUMMARY_POINT_MAX_LENGTH).toBe(FUNCTION_POINT_MAX);
  });
});
