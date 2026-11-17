import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appError } from "@/lib/errors";
import { formatResetMoment } from "@/lib/reset-moment";
import { CHAT_MAX_QUESTION_LENGTH } from "@/lib/schemas/chat";
import { texts } from "@/lib/texts";
import { CHAT_MAX_QUESTION_LENGTH as FUNCTION_MAX_QUESTION_LENGTH } from "../../supabase/functions/_shared/config.ts";
import {
  FAKE_HORS_CADRE_MARKER,
  FAKE_IGNORED_TEXT,
  FAKE_INFO_ABSENTE_MARKER,
  FAKE_INVALID_MARKER,
  FAKE_NO_CITATION_MARKER,
  fakeAnswer,
  fakeRefusal,
  generationDeps,
} from "../../supabase/functions/_shared/fake-generation.ts";
import { readMarker } from "../../supabase/functions/_shared/rag/marker.ts";

// POST /api/chat et relais vers chat (story 5.2a-2) : session vérifiée, demande revalidée, jeton de la
// session transmis, codes AD-19 relayés avec le texte du catalogue et resetAt, réponse relue.
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getSession: vi.fn() }));
vi.mock("@/server/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getSession: mocks.getSession } }) }));

const { POST, maxDuration } = await import("@/app/api/chat/route");
const { relayChat, CHAT_RELAY_TIMEOUT_MS } = await import("@/server/chat/relay");

const TOKEN = "jeton-de-session";
const QUESTION = "Comment je relance un client qui n'a pas payé ?";
const REQUEST_ID = "6f1c2b9e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";
const CONVERSATION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DOC = "d1d1d1d1-0000-4000-8000-000000000001";
const TARGET = { url: "https://projet.exemple.test/functions/v1/chat", apikey: "sb_publishable_exemple" };
const ANSWER = {
  conversationId: CONVERSATION,
  message: { kind: "answer", content: "Relancez à J+15 [P1].", sources: [{ documentId: DOC, title: "FAQ comptabilité", passageNumbers: [1] }] },
};
const fetchMock = vi.fn();

const post = (body: unknown) =>
  new Request("http://localhost/api/chat", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

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

describe("POST /api/chat", () => {
  it("maxDuration de 120 s (AD-16)", () => {
    expect(maxDuration).toBe(120);
  });

  it("chaîne des délais (décision du 2026-11-16) : chat 60 s < relais 70 s < navigateur 85 s < maxDuration 120 s", async () => {
    const { CHAT_TIMEOUT_MS } = await import("../../supabase/functions/_shared/config.ts");
    const { CHAT_CLIENT_TIMEOUT_MS } = await import("@/components/assistant/assistant-view");
    expect([CHAT_TIMEOUT_MS, CHAT_RELAY_TIMEOUT_MS, CHAT_CLIENT_TIMEOUT_MS, maxDuration * 1_000]).toEqual([60_000, 70_000, 85_000, 120_000]);
    expect(CHAT_TIMEOUT_MS).toBeLessThan(CHAT_RELAY_TIMEOUT_MS);
    expect(CHAT_RELAY_TIMEOUT_MS).toBeLessThan(CHAT_CLIENT_TIMEOUT_MS);
    expect(CHAT_CLIENT_TIMEOUT_MS).toBeLessThan(maxDuration * 1_000);
  });

  it("relaie la question avec le jeton de la session et la clé publique ; réponse relue, jamais en cache", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...ANSWER, secret: "x", message: { ...ANSWER.message, extra: 1 } }));
    const response = await POST(post({ question: `  ${QUESTION}  `, clientRequestId: REQUEST_ID }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(ANSWER);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://projet.exemple.test/functions/v1/chat");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, apikey: "sb_publishable_exemple" });
    expect(JSON.parse(init.body)).toEqual({ question: QUESTION, clientRequestId: REQUEST_ID });
  });

  it("sans session : 401, aucun relais", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, ...appError("UNAUTHENTICATED", texts.session.expired, false) });
    const response = await POST(post({ question: QUESTION, clientRequestId: REQUEST_ID }));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("jeton absent du cookie : 401, aucun relais", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    expect((await POST(post({ question: QUESTION, clientRequestId: REQUEST_ID }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("question trop longue : 400 avec le texte du catalogue", async () => {
    const response = await POST(post({ question: "a".repeat(2_001), clientRequestId: REQUEST_ID }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(appError("VALIDATION_FAILED", texts.assistant.questionTooLong, false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Report g (story 5.2b) : textes de saisie invalide, jamais « Le service d'IA ne répond pas ».
  it.each([
    ["vide", { question: "  ", clientRequestId: REQUEST_ID }, texts.assistant.questionEmpty],
    ["vide, identifiant invalide", { question: "", clientRequestId: "123" }, texts.assistant.questionEmpty],
    ["identifiant absent", { question: QUESTION }, texts.assistant.invalidRequest],
    ["identifiant invalide", { question: QUESTION, clientRequestId: "123" }, texts.assistant.invalidRequest],
    ["question absente", { clientRequestId: REQUEST_ID }, texts.assistant.invalidRequest],
    ["question non textuelle", { question: 42, clientRequestId: REQUEST_ID }, texts.assistant.invalidRequest],
    ["corps illisible", "pas du json", texts.assistant.invalidRequest],
  ])("demande %s : 400 VALIDATION_FAILED avec le texte de saisie, aucun relais", async (_, body, message) => {
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(appError("VALIDATION_FAILED", message, false));
    expect(message).not.toBe(texts.assistant.failed);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abandon du navigateur : le signal de la requête est transmis au relais", async () => {
    const client = new AbortController();
    let received: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      received = init.signal ?? undefined;
      // Le navigateur se déconnecte pendant l'appel à la fonction.
      client.abort();
      return Promise.reject(init.signal?.reason);
    });
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ question: QUESTION, clientRequestId: REQUEST_ID }),
      signal: client.signal,
    });
    const response = await POST(request);
    expect(received?.aborted).toBe(true);
    expect(response.status).toBe(503);
  });

  it("même limite de question que la fonction chat", () => {
    expect(CHAT_MAX_QUESTION_LENGTH).toBe(FUNCTION_MAX_QUESTION_LENGTH);
  });
});

describe("relayChat", () => {
  const request = { question: QUESTION, clientRequestId: REQUEST_ID };

  it("délai de 70 s", () => {
    expect(CHAT_RELAY_TIMEOUT_MS).toBe(70_000);
  });

  it("refus relayé tel quel (aucune réponse inventée)", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ conversationId: CONVERSATION, message: { kind: "refusal_info_absente", content: texts.assistant.refusalInfoAbsente, sources: [] } }),
    );
    const result = await relayChat(request, TOKEN, undefined, TARGET);
    expect(result.status).toBe(200);
  });

  it("refus hors cadre (story 5.3) : kind accepté par le schéma et relayé", async () => {
    const message = { kind: "refusal_hors_cadre", content: texts.assistant.refusalHorsCadre, sources: [] };
    fetchMock.mockResolvedValue(Response.json({ conversationId: CONVERSATION, message }));
    const result = await relayChat(request, TOKEN, undefined, TARGET);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ message });
  });

  it("quota atteint : 429 QUOTA_EXCEEDED, resetAt et texte du catalogue", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { code: "QUOTA_EXCEEDED", message: "x", retryable: false, resetAt: "2026-11-17T00:00:00.000Z" } }, { status: 429 }),
    );
    const result = await relayChat(request, TOKEN, undefined, TARGET);
    expect(result.status).toBe(429);
    expect(result.body).toEqual({
      error: {
        code: "QUOTA_EXCEEDED",
        message: texts.assistant.quotaExceeded(`${formatResetMoment("2026-11-17T00:00:00.000Z", new Date(), "UTC")} (UTC)`),
        retryable: false,
        resetAt: "2026-11-17T00:00:00.000Z",
      },
    });
  });

  it("plafond global : 503 AI_DAILY_CAP_REACHED, message distinct du quota", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { code: "AI_DAILY_CAP_REACHED", message: "x", retryable: false, resetAt: "2026-11-17T00:00:00Z" } }, { status: 503 }),
    );
    const result = await relayChat(request, TOKEN, undefined, TARGET);
    const error = (result.body as { error: { code: string; message: string; resetAt: string } }).error;
    expect(result.status).toBe(503);
    expect(error.code).toBe("AI_DAILY_CAP_REACHED");
    expect(error.message).toMatch(/^L'Assistant a atteint sa limite d'utilisation pour aujourd'hui\. Il sera de nouveau disponible .+\. La Recherche reste disponible\.$/);
    expect(error.resetAt).toBe("2026-11-17T00:00:00.000Z");
  });

  it.each([
    ["AI_CITATIONS_INVALID", 502, true, texts.assistant.unverifiable],
    ["AI_BUDGET_EXHAUSTED", 503, false, texts.assistant.budgetExhausted],
    ["AI_TIMEOUT", 504, true, texts.assistant.failed],
    ["AI_OUTPUT_INVALID", 502, false, texts.assistant.failed],
    ["REQUEST_IN_PROGRESS", 409, false, texts.assistant.inProgress],
    ["INTERNAL", 500, true, texts.assistant.failed],
    // Report g (story 5.2b) : demande refusée par chat (400) ou méthode refusée (405).
    ["VALIDATION_FAILED", 400, false, texts.assistant.invalidRequest],
    ["VALIDATION_FAILED", 405, false, texts.assistant.invalidRequest],
  ] as const)("code %s relayé avec le texte du catalogue", async (code, status, retryable, message) => {
    fetchMock.mockResolvedValue(Response.json({ error: { code, message: "détail", retryable } }, { status }));
    expect(await relayChat(request, TOKEN, undefined, TARGET)).toEqual({ status, body: appError(code, message, retryable) });
  });

  it("401 de la passerelle : UNAUTHENTICATED", async () => {
    fetchMock.mockResolvedValue(Response.json({ msg: "Invalid JWT" }, { status: 401 }));
    expect(await relayChat(request, TOKEN, undefined, TARGET)).toEqual({
      status: 401,
      body: appError("UNAUTHENTICATED", texts.session.expired, false),
    });
  });

  it.each([
    ["réseau", () => Promise.reject(new TypeError("fetch failed"))],
    ["code inconnu", () => Promise.resolve(Response.json({ error: { code: "AUTRE" } }, { status: 500 }))],
    ["corps illisible", () => Promise.resolve(new Response("<html>", { status: 502 }))],
    ["succès mal formé", () => Promise.resolve(Response.json({ conversationId: "x", message: {} }))],
  ])("panne du relais (%s) : AI_UNAVAILABLE réessayable", async (_, respond) => {
    fetchMock.mockImplementation(respond);
    expect(await relayChat(request, TOKEN, undefined, TARGET)).toEqual({
      status: 503,
      body: appError("AI_UNAVAILABLE", texts.assistant.failed, true),
    });
  });

  it("délai du relais : AI_TIMEOUT", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    const result = await relayChat(request, TOKEN, undefined, TARGET, 100);
    expect(result.status).toBe(504);
  });

  it("abandon du navigateur propagé à l'appel de la fonction", async () => {
    let received: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          received = init.signal ?? undefined;
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const client = new AbortController();
    const pending = relayChat(request, TOKEN, client.signal, TARGET);
    client.abort();
    expect((await pending).status).toBe(503);
    expect(received?.aborted).toBe(true);
  });

  it("clé publique absente : aucun appel", async () => {
    expect((await relayChat(request, TOKEN, undefined, { ...TARGET, apikey: undefined })).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("journaux sans question, réponse ni jeton", async () => {
    fetchMock.mockResolvedValue(Response.json(ANSWER));
    await relayChat(request, TOKEN, undefined, TARGET);
    const output = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls].flat().join("\n");
    expect(output).toContain("chat_relayed");
    expect(output).not.toContain(QUESTION);
    expect(output).not.toContain("Relancez");
    expect(output).not.toContain(TOKEN);
  });
});

describe("formatResetMoment", () => {
  it("aujourd'hui ou demain, dans le fuseau demandé", () => {
    const now = new Date("2026-11-16T22:30:00Z");
    expect(formatResetMoment("2026-11-17T00:00:00Z", now, "UTC")).toBe("demain à 0 h 00");
    expect(formatResetMoment("2026-11-17T00:00:00Z", now, "Europe/Paris")).toBe("demain à 1 h 00");
    expect(formatResetMoment("2026-11-17T00:00:00Z", new Date("2026-11-16T23:30:00Z"), "Europe/Paris")).toBe("aujourd'hui à 1 h 00");
    expect(formatResetMoment("2026-11-17T00:00:00Z", now, "Indian/Reunion")).toBe("aujourd'hui à 4 h 00");
  });
});

describe("génération simulée (pile locale)", () => {
  it("cite P1 (et P2), ou aucune citation avec le repère de test", () => {
    const one = '<passage id="P1" document="A">x</passage>';
    const two = `${one}\n<passage id="P2" document="B">y</passage>`;
    expect(fakeAnswer(one)).toContain("[P1]");
    expect(fakeAnswer(two)).toContain("[P2]");
    expect(fakeAnswer(`${two} ${FAKE_NO_CITATION_MARKER}`)).not.toMatch(/\[P\d\]/);
  });

  it("story 5.3 : marqueur en première ligne ; repères pour les deux refus et le marqueur invalide", () => {
    const one = '<passage id="P1" document="A">x</passage>';
    expect(readMarker(fakeAnswer(one))).toEqual({ marker: "REPONSE", rest: "Réponse simulée à partir des Documents [P1]." });
    expect(readMarker(fakeAnswer(`${one} ${FAKE_INFO_ABSENTE_MARKER}`))).toEqual({ marker: "REFUS_INFO_ABSENTE", rest: FAKE_IGNORED_TEXT });
    expect(readMarker(fakeAnswer(`${one} ${FAKE_HORS_CADRE_MARKER}`))?.marker).toBe("REFUS_HORS_CADRE");
    expect(readMarker(fakeAnswer(`${one} ${FAKE_INVALID_MARKER}`))).toBeNull();
  });

  it("appel court simulé : hors cadre avec le repère, sinon information absente ; REPONSE avec le repère invalide", () => {
    expect(fakeRefusal("Question du Collaborateur : budget 2027 ?")).toBe("REFUS_INFO_ABSENTE");
    expect(fakeRefusal(`Question du Collaborateur : capitale ? ${FAKE_HORS_CADRE_MARKER}`)).toBe("REFUS_HORS_CADRE");
    expect(fakeRefusal(`Question ${FAKE_INVALID_MARKER}`)).toBe("REPONSE");
  });

  it("rejetée hors de la pile locale", () => {
    const env: Record<string, string> = { GENERATION_FAKE: "1", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" };
    vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
    expect(generationDeps()).toBeUndefined();
    env.SUPABASE_URL = "http://kong:8000";
    expect(generationDeps()).toBeDefined();
    env.GENERATION_FAKE = "";
    expect(generationDeps()).toBeUndefined();
  });
});
