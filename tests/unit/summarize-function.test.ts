import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUDGET_MESSAGE,
  FAILURE_MESSAGE,
  handle,
  NOT_FOUND_MESSAGE,
  NOT_READY_MESSAGE,
  QUOTA_MESSAGE,
  SESSION_MESSAGE,
  IN_PROGRESS_MESSAGE,
} from "../../supabase/functions/summarize/index.ts";
import { SUMMARY_CLEANUP_TIMEOUT_MS, SUMMARY_TIMEOUT_MS } from "../../supabase/functions/_shared/config.ts";
import { SUMMARY_SYSTEM_PROMPT } from "../../supabase/functions/_shared/rag/prompt.ts";
import { SUMMARY_RELAY_TIMEOUT_MS } from "@/server/summary/relay";
import { SUMMARY_CLIENT_TIMEOUT_MS } from "@/components/documents/document-summary";
import { maxDuration } from "@/app/api/documents/[id]/summary/route";
import { texts } from "@/lib/texts";

// Edge Function summarize (story 6.1), fournisseur, base et Auth simulés : ordre des étapes, aucune
// réservation pour un Résumé à jour, un Document non prêt ou inaccessible, aucun appel au fournisseur
// sans réservation, clé service_role pour store_summary seulement, règle de libération (AD-14, AD-18),
// sortie invalide, échéance de 120 s, journaux sans texte.
const REMOTE = "https://abcdefghijklmnopqrst.supabase.co";
const TOKEN = "jeton-du-collaborateur";
const PUBLISHABLE = "sb_publishable_exemple";
const SERVICE = ["cle", "service", "role", "test"].join("-");
const DOC = "d1d1d1d1-0000-4000-8000-000000000001";
const RESERVATION = "11111111-2222-4333-8444-555555555555";
const SECRET_TEXT = "Texte confidentiel du Document à résumer";
const SECRET_POINT = "Le Document prévoit un point confidentiel.";
const GENERATED_AT = "2026-11-23T10:00:00.000Z";
const env: Record<string, string | undefined> = {};

type Handler = (url: string, init: RequestInit) => Promise<Response>;
let routes: Record<string, Handler>;
const fetchMock = vi.fn();
const order: string[] = [];

const documentRow = (overrides: Record<string, unknown> = {}) => ({
  id: DOC,
  title: "Procédure de facturation",
  status: "ready",
  text_version: 2,
  content_text: SECRET_TEXT,
  summary_points: null,
  summary_text_version: null,
  summary_generated_at: null,
  ...overrides,
});

const completion = (content: string, finishReason = "stop") =>
  Response.json({
    model: "gpt-5.4-mini-2026-03-17",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 900, completion_tokens: 60 },
  });

const storedBody = (points: string[], stored: boolean) =>
  Response.json({ stored, found: true, status: "ready", summary: { points, text_version: 2, generated_at: "2026-11-23T10:00:00+00:00" } });

const hang: Handler = (_, init) =>
  new Promise((_, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("interrompu", "AbortError")));
  });

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  order.length = 0;
  env.SUPABASE_URL = REMOTE;
  env.SUPABASE_ANON_KEY = ["cle", "anon"].join("-");
  env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
  env[["OPENAI", "API", "KEY"].join("_")] = ["cle", "fournisseur"].join("-");
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
  routes = {
    auth: async () => Response.json({ id: "u1" }),
    document: async () => Response.json([documentRow()]),
    lock: async () => Response.json(true),
    unlock: async () => new Response(null, { status: 204 }),
    reserve: async () => Response.json({ ok: true, reservation_id: RESERVATION, reset_at: "2026-11-24T00:00:00+00:00" }),
    generate: async () => completion(JSON.stringify({ points: [SECRET_POINT, "Le second point."] })),
    store: async (_, init) => storedBody(JSON.parse(String(init.body)).p_points, true),
    release: async () => Response.json(true),
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const route = (name: string) => {
      order.push(name);
      return routes[name](url, init);
    };
    if (url.endsWith("/auth/v1/user")) return route("auth");
    if (url.includes("/rest/v1/documents?")) return route("document");
    if (url.endsWith("/rpc/begin_summary")) return route("lock");
    if (url.endsWith("/rpc/end_summary")) return route("unlock");
    if (url.endsWith("/rpc/reserve_ai_call")) return route("reserve");
    if (url.endsWith("/chat/completions")) return route("generate");
    if (url.endsWith("/rpc/store_summary")) return route("store");
    if (url.endsWith("/rpc/release_ai_call")) return route("release");
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
  new Request("http://localhost/functions/v1/summarize", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ask = (options = {}) => handle(request({ documentId: DOC }), options);
const headersOf = (name: string) => {
  const index = order.indexOf(name);
  const call = fetchMock.mock.calls.filter(([url]) => !String(url).includes("__never__"))[index];
  return new Headers(call[1].headers as HeadersInit);
};
const logs = () =>
  [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls].map((call) => call.join(" ")).join("\n");

describe("summarize : parcours nominal", () => {
  it("ordre : session, Document, réservation, un seul appel, store_summary ; Résumé enregistré renvoyé (generated)", async () => {
    const response = await ask();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(order).toEqual(["auth", "document", "lock", "reserve", "generate", "store", "unlock"]);
    expect(await response.json()).toEqual({
      summary: { points: [SECRET_POINT, "Le second point."], generatedAt: GENERATED_AT, textVersion: 2 },
      generated: true,
    });
    // Un seul appel sur le texte entier, consignes du Résumé.
    const body = JSON.parse(String(fetchMock.mock.calls[order.indexOf("generate")][1].body));
    expect(body.messages[0].content).toBe(SUMMARY_SYSTEM_PROMPT);
    expect(body.messages[1].content).toContain(SECRET_TEXT);
    expect(body.response_format.type).toBe("json_schema");
  });

  it("jeton du Collaborateur pour la session, le Document et la réservation ; clé service_role pour store_summary seulement", async () => {
    await ask();
    for (const name of ["auth", "document", "lock", "reserve", "unlock"]) {
      expect(headersOf(name).get("authorization"), name).toBe(`Bearer ${TOKEN}`);
      expect(headersOf(name).get("apikey"), name).toBe(PUBLISHABLE);
    }
    expect(headersOf("store").get("authorization")).toBe(`Bearer ${SERVICE}`);
    expect(headersOf("store").get("apikey")).toBe(SERVICE);
    const store = JSON.parse(String(fetchMock.mock.calls[order.indexOf("store")][1].body));
    expect(store).toEqual({ p_document_id: DOC, p_text_version: 2, p_points: [SECRET_POINT, "Le second point."] });
  });

  it("Document lu avec le Résumé stocké : colonnes demandées, identifiant filtré", async () => {
    await ask();
    const url = String(fetchMock.mock.calls[order.indexOf("document")][0]);
    expect(url).toContain(`id=eq.${DOC}`);
    expect(url).toContain("summary_points");
    expect(url).toContain("content_text");
  });

  it("journaux sans texte du Document, titre ni points", async () => {
    await ask();
    expect(logs()).toContain("summarize_done");
    expect(logs()).not.toContain(SECRET_TEXT);
    expect(logs()).not.toContain(SECRET_POINT);
    expect(logs()).not.toContain("Procédure de facturation");
  });
});

describe("summarize : sans réservation", () => {
  it("Résumé à jour : renvoyé tel quel, sans réservation ni appel (FR-23)", async () => {
    routes.document = async () =>
      Response.json([documentRow({ summary_points: ["Point stocké."], summary_text_version: 2, summary_generated_at: GENERATED_AT })]);
    const response = await ask();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      summary: { points: ["Point stocké."], generatedAt: GENERATED_AT, textVersion: 2 },
      generated: false,
    });
    expect(order).toEqual(["auth", "document"]);
  });

  it("Résumé obsolète (autre version) : jamais renvoyé, un nouveau Résumé est généré", async () => {
    routes.document = async () =>
      Response.json([documentRow({ summary_points: ["Ancien."], summary_text_version: 1, summary_generated_at: GENERATED_AT })]);
    expect((await ask()).status).toBe(200);
    expect(order).toEqual(["auth", "document", "lock", "reserve", "generate", "store", "unlock"]);
  });

  it.each(["processing", "error"])("Document %s : 409 DOCUMENT_NOT_READY, sans réservation ni appel", async (status) => {
    routes.document = async () => Response.json([documentRow({ status })]);
    const response = await ask();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "DOCUMENT_NOT_READY", message: NOT_READY_MESSAGE, retryable: false } });
    expect(order).toEqual(["auth", "document"]);
  });

  it("Document inexistant ou inaccessible : 404 NOT_FOUND, sans réservation", async () => {
    routes.document = async () => Response.json([]);
    const response = await ask();
    expect(response.status).toBe(404);
    expect((await response.json()).error).toEqual({ code: "NOT_FOUND", message: NOT_FOUND_MESSAGE, retryable: false });
    expect(order).toEqual(["auth", "document"]);
  });

  it("demande invalide (identifiant absent ou non UUID, corps illisible) : 400 avant toute lecture", async () => {
    for (const body of [{}, { documentId: "abc" }, "pas du json", { documentId: 3 }]) {
      const response = await handle(request(body));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    }
    expect(order).toEqual([]);
  });

  it("sans jeton : 401 ; session refusée par Auth : 401, sans lecture", async () => {
    expect((await handle(request({ documentId: DOC }, { apikey: PUBLISHABLE }))).status).toBe(401);
    routes.auth = async () => new Response(null, { status: 401 });
    const response = await ask();
    expect(response.status).toBe(401);
    expect((await response.json()).error).toEqual({ code: "UNAUTHENTICATED", message: SESSION_MESSAGE, retryable: false });
    expect(order).toEqual(["auth"]);
  });

  it("méthode autre que POST : 405", async () => {
    const response = await handle(new Request("http://localhost/functions/v1/summarize", { method: "GET" }));
    expect(response.status).toBe(405);
  });

  it("quota atteint : 429 QUOTA_EXCEEDED avec resetAt, aucun appel ; plafond global : 503 AI_DAILY_CAP_REACHED", async () => {
    routes.reserve = async () => Response.json({ ok: false, reason: "user", reset_at: "2026-11-24T00:00:00+00:00" });
    let response = await ask();
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: { code: "QUOTA_EXCEEDED", message: QUOTA_MESSAGE, retryable: false, resetAt: "2026-11-24T00:00:00.000Z" },
    });
    expect(order).toEqual(["auth", "document", "lock", "reserve", "unlock"]);

    order.length = 0;
    routes.reserve = async () => Response.json({ ok: false, reason: "global", reset_at: "2026-11-24T00:00:00+00:00" });
    response = await ask();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("AI_DAILY_CAP_REACHED");
    expect(order).toEqual(["auth", "document", "lock", "reserve", "unlock"]);
  });

  it("clé service_role absente : panne AVANT la réservation (rien réservé, aucun appel)", async () => {
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    const response = await ask();
    expect(response.status).toBe(500);
    expect(order).toEqual(["auth", "document"]);
  });
});

describe("summarize : verrou de demande par Document (correctif de revue R1 = A)", () => {
  it("verrou pris après « Résumé à jour ? », avant la réservation, avec le jeton du Collaborateur ; Document en argument", async () => {
    await ask();
    expect(order.indexOf("lock")).toBeLessThan(order.indexOf("reserve"));
    expect(headersOf("lock").get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headersOf("unlock").get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(fetchMock.mock.calls[order.indexOf("lock")][1].body))).toEqual({ p_document_id: DOC });
    expect(JSON.parse(String(fetchMock.mock.calls[order.indexOf("unlock")][1].body))).toEqual({ p_document_id: DOC });
  });

  it("verrou refusé : 409 REQUEST_IN_PROGRESS, sans réservation, sans appel au fournisseur, sans libération du verrou d'autrui", async () => {
    routes.lock = async () => Response.json(false);
    const response = await ask();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "REQUEST_IN_PROGRESS", message: IN_PROGRESS_MESSAGE, retryable: false } });
    expect(order).toEqual(["auth", "document", "lock"]);
  });

  it("Résumé à jour : aucun verrou", async () => {
    routes.document = async () =>
      Response.json([documentRow({ summary_points: ["Point stocké."], summary_text_version: 2, summary_generated_at: GENERATED_AT })]);
    await ask();
    expect(order).not.toContain("lock");
  });

  it("verrou libéré en échec aussi (panne, quota, sortie invalide), et libération en échec sans effet sur la réponse", async () => {
    routes.generate = async () => new Response("{}", { status: 503 });
    expect((await ask()).status).toBe(503);
    expect(order.at(-1)).toBe("unlock");
    order.length = 0;
    routes.reserve = async () => Response.json({ ok: false, reason: "user", reset_at: "2026-11-24T00:00:00+00:00" });
    expect((await ask()).status).toBe(429);
    expect(order).toEqual(["auth", "document", "lock", "reserve", "unlock"]);
    order.length = 0;
    routes.reserve = async () => Response.json({ ok: true, reservation_id: RESERVATION, reset_at: "2026-11-24T00:00:00+00:00" });
    routes.generate = async () => completion(JSON.stringify({ points: [SECRET_POINT] }));
    routes.unlock = async () => new Response("{}", { status: 500 });
    expect((await ask()).status).toBe(200);
    expect(order.at(-1)).toBe("unlock");
  });
});

describe("summarize : règle de libération (AD-14, AD-18)", () => {
  it("écriture perdue (Résumé concurrent) : unité rendue, Résumé stocké renvoyé (generated faux)", async () => {
    routes.store = async () => storedBody(["Résumé du gagnant."], false);
    const response = await ask();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      summary: { points: ["Résumé du gagnant."], generatedAt: GENERATED_AT, textVersion: 2 },
      generated: false,
    });
    expect(order).toEqual(["auth", "document", "lock", "reserve", "generate", "store", "release", "unlock"]);
    expect(JSON.parse(String(fetchMock.mock.calls[order.indexOf("release")][1].body))).toEqual({ p_reservation_id: RESERVATION });
    expect(headersOf("release").get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("texte changé pendant la génération (aucun Résumé à jour) : unité rendue, panne réessayable", async () => {
    routes.store = async () => Response.json({ stored: false, found: true, status: "ready", summary: null });
    const response = await ask();
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatchObject({ code: "INTERNAL", message: FAILURE_MESSAGE, retryable: true });
    expect(order.slice(-2)).toEqual(["release", "unlock"]);
  });

  it("Document devenu non prêt ou supprimé pendant la génération : unité rendue, 409 ou 404", async () => {
    routes.store = async () => Response.json({ stored: false, found: true, status: "processing", summary: null });
    expect((await ask()).status).toBe(409);
    expect(order.slice(-2)).toEqual(["release", "unlock"]);
    order.length = 0;
    routes.store = async () => Response.json({ stored: false, found: false, status: null, summary: null });
    expect((await ask()).status).toBe(404);
    expect(order.slice(-2)).toEqual(["release", "unlock"]);
  });

  it("panne sans réponse du fournisseur (deux 5xx) : unité rendue, AI_UNAVAILABLE, rien enregistré", async () => {
    routes.generate = async () => new Response("{}", { status: 503 });
    const response = await ask();
    expect(response.status).toBe(503);
    expect((await response.json()).error).toEqual({ code: "AI_UNAVAILABLE", message: FAILURE_MESSAGE, retryable: true });
    expect(order).toEqual(["auth", "document", "lock", "reserve", "generate", "generate", "release", "unlock"]);
  });

  it("erreur réseau du fournisseur : unité rendue, une seule tentative", async () => {
    routes.generate = async () => {
      throw new TypeError("réseau");
    };
    expect((await ask()).status).toBe(503);
    expect(order).toEqual(["auth", "document", "lock", "reserve", "generate", "release", "unlock"]);
  });

  it("plafond du fournisseur : AI_BUDGET_EXHAUSTED non réessayable, unité rendue", async () => {
    routes.generate = async () => Response.json({ error: { code: "insufficient_quota", type: "insufficient_quota" } }, { status: 429 });
    const response = await ask();
    expect(response.status).toBe(503);
    expect((await response.json()).error).toEqual({ code: "AI_BUDGET_EXHAUSTED", message: BUDGET_MESSAGE, retryable: false });
    expect(order.slice(-2)).toEqual(["release", "unlock"]);
  });

  it.each([
    ["0 point", JSON.stringify({ points: [] })],
    ["6 points", JSON.stringify({ points: ["1", "2", "3", "4", "5", "6"] })],
    ["point vide", JSON.stringify({ points: ["A", " "] })],
    ["point de plus de 400 caractères", JSON.stringify({ points: ["x".repeat(401)] })],
    ["texte libre", "- A\n- B"],
  ])("sortie invalide (%s) : AI_OUTPUT_INVALID, unité consommée, rien enregistré", async (_, content) => {
    routes.generate = async () => completion(content);
    const response = await ask();
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("AI_OUTPUT_INVALID");
    expect(order).toEqual(["auth", "document", "lock", "reserve", "generate", "unlock"]);
  });

  it("enregistrement en échec après la génération : unité consommée, panne réessayable", async () => {
    routes.store = async () => new Response("{}", { status: 500 });
    const response = await ask();
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatchObject({ code: "INTERNAL", retryable: true });
    expect(order).toEqual(["auth", "document", "lock", "reserve", "generate", "store", "unlock"]);
  });

  it("délai après envoi (fournisseur muet jusqu'à l'échéance) : AI_TIMEOUT, unité consommée", async () => {
    routes.generate = hang;
    const response = await ask({ timeoutMs: 300, cleanupTimeoutMs: 100 });
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("AI_TIMEOUT");
    expect(order).toEqual(["auth", "document", "lock", "reserve", "generate", "unlock"]);
  });

  it("délai avant envoi (attente d'une nouvelle tentative) : AI_TIMEOUT, unité rendue", async () => {
    routes.generate = async () => new Response("{}", { status: 503 });
    // La nouvelle tentative attend AI_RETRY_BASE_DELAY_MS (500 ms) : l'échéance tombe pendant l'attente.
    const response = await ask({ timeoutMs: 300, cleanupTimeoutMs: 100 });
    expect(response.status).toBe(504);
    expect(order).toEqual(["auth", "document", "lock", "reserve", "generate", "release", "unlock"]);
  });

  it("échéance avant la réservation (lecture du Document trop lente) : AI_TIMEOUT, rien réservé", async () => {
    routes.document = hang;
    const response = await ask({ timeoutMs: 100, cleanupTimeoutMs: 50 });
    expect(response.status).toBe(504);
    expect(order).toEqual(["auth", "document"]);
  });

  it("échéance pendant la réservation (validée en base) : unité rendue aussitôt, aucun appel", async () => {
    routes.reserve = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return Response.json({ ok: true, reservation_id: RESERVATION, reset_at: "2026-11-24T00:00:00+00:00" });
    };
    const response = await ask({ timeoutMs: 100, cleanupTimeoutMs: 200 });
    expect(response.status).toBe(504);
    expect(order).toEqual(["auth", "document", "lock", "reserve", "release", "unlock"]);
  });

  it("la génération reçoit au plus l'échéance moins le délai réservé à l'enregistrement", async () => {
    const started = Date.now();
    routes.generate = hang;
    await ask({ timeoutMs: 400, cleanupTimeoutMs: 250 });
    // Génération coupée vers 150 ms (400 − 250), bien avant l'échéance commune.
    expect(Date.now() - started).toBeLessThan(380);
  });
});

describe("chaîne des délais (AD-16)", () => {
  it("summarize 120 s < relais 125 s < page 130 s < maxDuration 150 s ; enregistrement réservé dans les 120 s", () => {
    expect(SUMMARY_TIMEOUT_MS).toBe(120_000);
    expect(SUMMARY_CLEANUP_TIMEOUT_MS).toBeLessThan(SUMMARY_TIMEOUT_MS);
    expect(SUMMARY_TIMEOUT_MS).toBeLessThan(SUMMARY_RELAY_TIMEOUT_MS);
    expect(SUMMARY_RELAY_TIMEOUT_MS).toBeLessThan(SUMMARY_CLIENT_TIMEOUT_MS);
    expect(SUMMARY_CLIENT_TIMEOUT_MS).toBe(130_000);
    expect(SUMMARY_CLIENT_TIMEOUT_MS).toBeLessThan(maxDuration * 1000);
    expect(maxDuration).toBe(150);
  });
});

describe("textes du catalogue", () => {
  it("messages de summarize identiques au catalogue", () => {
    expect(FAILURE_MESSAGE).toBe(texts.summary.failed);
    expect(NOT_READY_MESSAGE).toBe(texts.summary.notReady);
    expect(SESSION_MESSAGE).toBe(texts.session.expired);
    expect(NOT_FOUND_MESSAGE).toBe(texts.notFound.text);
    expect(BUDGET_MESSAGE).toBe(texts.assistant.budgetExhausted);
    expect(IN_PROGRESS_MESSAGE).toBe(texts.summary.inProgress);
    expect(texts.summary.quotaExceeded("X").startsWith(QUOTA_MESSAGE)).toBe(true);
  });
});
