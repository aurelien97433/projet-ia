import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUDGET_MESSAGE,
  FAILURE_MESSAGE,
  handle,
  IN_PROGRESS_MESSAGE,
  REFUSAL_INFO_ABSENTE,
  SESSION_MESSAGE,
  UNVERIFIABLE_MESSAGE,
} from "../../supabase/functions/chat/index.ts";
import { EMBEDDING_DIMENSION } from "../../supabase/functions/_shared/config.ts";
import { AiError } from "../../supabase/functions/_shared/errors.ts";
import { texts } from "@/lib/texts";

// Edge Function chat (story 5.2a-2), fournisseur, base et Auth simulés : ordre des étapes, aucun appel
// à OpenAI sans réservation, échéance, une seule nouvelle tentative de génération, aucun Passage,
// règle de libération (unité rendue ou consommée), journaux sans texte.
const REMOTE = "https://abcdefghijklmnopqrst.supabase.co";
const TOKEN = "jeton-du-collaborateur";
const PUBLISHABLE = "sb_publishable_exemple";
const QUESTION = "Comment je relance un client qui n'a pas payé ?";
const REQUEST_ID = "6f1c2b9e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";
const RESERVATION = "11111111-2222-4333-8444-555555555555";
const CONVERSATION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DOC_1 = "d1d1d1d1-0000-4000-8000-000000000001";
const DOC_2 = "d2d2d2d2-0000-4000-8000-000000000002";
const PASSAGE_SECRET = "Texte confidentiel du Passage";
const ANSWER_SECRET = "Relancez 15 jours après l'échéance";
const env: Record<string, string | undefined> = {};

type Handler = (url: string, init: RequestInit) => Promise<Response>;
let routes: Record<string, Handler>;
const fetchMock = vi.fn();
const order: string[] = [];

const vector = () => Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => (index === 0 ? 1 : 0));
const row = (documentId: string, passageId: string, title = "Titre du modèle") => ({
  document_id: documentId,
  title,
  category: "procedure",
  passage_id: passageId,
  start_offset: 0,
  end_offset: 40,
  content: PASSAGE_SECRET,
  similarity: 0.8,
});
const P1 = "aaaaaaaa-0000-4000-8000-000000000001";
const P2 = "aaaaaaaa-0000-4000-8000-000000000002";
const P3 = "aaaaaaaa-0000-4000-8000-000000000003";

const completion = (content: string, finishReason = "stop") =>
  Response.json({
    model: "gpt-5.4-mini-2026-03-17",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  });

const hang: Handler = (_, init) =>
  new Promise((_, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("interrompu", "AbortError")));
  });

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  order.length = 0;
  env.SUPABASE_URL = REMOTE;
  env.SUPABASE_ANON_KEY = ["cle", "anon", "du", "projet"].join("-");
  env[["OPENAI", "API", "KEY"].join("_")] = ["cle", "fournisseur", "test"].join("-");
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
  routes = {
    auth: async () => Response.json({ id: "u1" }),
    replay: async () => Response.json([]),
    reserve: async () => Response.json({ ok: true, reservation_id: RESERVATION, reset_at: "2026-11-17T00:00:00+00:00" }),
    start: async () => Response.json({ conversation_id: CONVERSATION, message_id: "m1" }),
    embed: async () => Response.json({ data: [{ index: 0, embedding: vector() }] }),
    match: async () => Response.json([row(DOC_1, P1), row(DOC_2, P2), row(DOC_1, P3)]),
    documents: async () =>
      Response.json([
        { id: DOC_1, title: "Procédure de facturation", text_version: 2 },
        { id: DOC_2, title: "FAQ comptabilité", text_version: 1 },
      ]),
    generate: async () => completion(`${ANSWER_SECRET} [P2]. Voir aussi [P1][P3] et [P9].`),
    save: async (_, init) => {
      const body = JSON.parse(String(init.body));
      return Response.json({
        message_id: "m2",
        sources: (body.p_sources as { document_id: string; document_title: string }[]).map((source, index) => ({
          ordinal: index + 1,
          document_id: source.document_id,
          document_title: source.document_title,
        })),
      });
    },
    failure: async () => Response.json("m3"),
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
    if (url.includes("/rest/v1/messages?")) return route("replay");
    if (url.endsWith("/rpc/reserve_ai_call")) return route("reserve");
    if (url.endsWith("/rpc/start_conversation")) return route("start");
    if (url.endsWith("/embeddings")) return route("embed");
    if (url.endsWith("/rpc/match_passages")) return route("match");
    if (url.includes("/rest/v1/documents?")) return route("documents");
    if (url.endsWith("/chat/completions")) return route("generate");
    if (url.endsWith("/rpc/save_assistant_answer")) return route("save");
    if (url.endsWith("/rpc/record_assistant_failure")) return route("failure");
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
  new Request("http://localhost/functions/v1/chat", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ask = (options = {}) => handle(request({ question: `  ${QUESTION} `, clientRequestId: REQUEST_ID }), options);

const calls = (name: string) => order.filter((step) => step === name).length;
const bodyOf = (suffix: string) => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(suffix));
  return JSON.parse(String(call![1].body));
};
const logs = () =>
  [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls].map((call) => call.join(" ")).join("\n");

describe("chat : parcours nominal", () => {
  it("ordre des étapes, réservation avant tout appel à OpenAI, réponse et Sources par Document", async () => {
    const response = await ask();
    expect(response.status).toBe(200);
    expect(order).toEqual(["auth", "replay", "reserve", "start", "embed", "match", "documents", "generate", "save"]);

    expect(await response.json()).toEqual({
      conversationId: CONVERSATION,
      message: {
        kind: "answer",
        content: `${ANSWER_SECRET} [P2]. Voir aussi [P1][P3] et [P9].`,
        sources: [
          { documentId: DOC_2, title: "FAQ comptabilité", passageNumbers: [2] },
          { documentId: DOC_1, title: "Procédure de facturation", passageNumbers: [1, 3] },
        ],
      },
    });
  });

  it("Conversation : titre = question, question nettoyée, identifiant de demande", async () => {
    await ask();
    expect(bodyOf("/rpc/start_conversation")).toEqual({ p_title: QUESTION, p_question: QUESTION, p_client_request_id: REQUEST_ID });
  });

  it("titre limité à 120 caractères", async () => {
    await handle(request({ question: "é".repeat(300), clientRequestId: REQUEST_ID }));
    expect(bodyOf("/rpc/start_conversation").p_title).toBe("é".repeat(120));
  });

  it("recherche : 8 Passages au plus, 3 par Document ; titre et version relus dans documents, jamais ceux du modèle", async () => {
    await ask();
    expect(bodyOf("/rpc/match_passages")).toMatchObject({ max_passages: 8, max_per_document: 3, min_similarity: 0.4 });
    const save = bodyOf("/rpc/save_assistant_answer");
    expect(save).toEqual({
      p_conversation_id: CONVERSATION,
      p_kind: "answer",
      p_content: `${ANSWER_SECRET} [P2]. Voir aussi [P1][P3] et [P9].`,
      p_sources: [
        { document_id: DOC_2, document_title: "FAQ comptabilité", text_version: 1, passages: [{ passage_id: P2, start: 0, end: 40 }] },
        {
          document_id: DOC_1,
          document_title: "Procédure de facturation",
          text_version: 2,
          passages: [
            { passage_id: P1, start: 0, end: 40 },
            { passage_id: P3, start: 0, end: 40 },
          ],
        },
      ],
    });
    // Consignes : titres relus, jamais le titre renvoyé par match_passages.
    const prompt = JSON.stringify(bodyOf("/chat/completions").messages);
    expect(prompt).toContain("Procédure de facturation");
    expect(prompt).not.toContain("Titre du modèle");
  });

  it("Document disparu entre la Recherche et la relecture : ses Passages sont écartés", async () => {
    routes.documents = async () => Response.json([{ id: DOC_2, title: "FAQ comptabilité", text_version: 1 }]);
    routes.generate = async () => completion("Réponse [P1].");
    const response = await ask();
    expect(response.status).toBe(200);
    const prompt = JSON.stringify(bodyOf("/chat/completions").messages);
    expect(prompt).toContain('id=\\"P1\\" document=\\"FAQ comptabilité\\"');
    expect(prompt).not.toContain("P2");
  });

  it("Document supprimé avant l'enregistrement : Source renvoyée avec documentId nul", async () => {
    routes.save = async () =>
      Response.json({
        message_id: "m2",
        sources: [
          { ordinal: 1, document_id: null, document_title: "FAQ comptabilité" },
          { ordinal: 2, document_id: DOC_1, document_title: "Procédure de facturation" },
        ],
      });
    const body = await (await ask()).json();
    expect(body.message.sources[0]).toEqual({ documentId: null, title: "FAQ comptabilité", passageNumbers: [2] });
  });

  it("aucune libération après une réponse enregistrée (unité consommée)", async () => {
    await ask();
    expect(calls("release")).toBe(0);
  });

  it("journaux : ni question, ni Passage, ni réponse, ni jeton", async () => {
    await ask();
    routes.generate = async () => completion("Sans citation.");
    await ask();
    const output = logs();
    expect(output).toContain("chat_done");
    for (const secret of [QUESTION, PASSAGE_SECRET, ANSWER_SECRET, TOKEN]) expect(output).not.toContain(secret);
  });
});

describe("chat : garde-fou et rejeu", () => {
  it("quota personnel atteint : 429 QUOTA_EXCEEDED avec resetAt, aucune Conversation, aucun appel à OpenAI", async () => {
    routes.reserve = async () => Response.json({ ok: false, reason: "user", reset_at: "2026-11-17T00:00:00+00:00" });
    const response = await ask();
    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatchObject({ code: "QUOTA_EXCEEDED", retryable: false, resetAt: "2026-11-17T00:00:00.000Z" });
    expect(order).toEqual(["auth", "replay", "reserve"]);
  });

  it("plafond global atteint : 503 AI_DAILY_CAP_REACHED, message distinct, aucun appel", async () => {
    routes.reserve = async () => Response.json({ ok: false, reason: "global", reset_at: "2026-11-17T00:00:00+00:00" });
    const response = await ask();
    expect(response.status).toBe(503);
    const { error } = await response.json();
    expect(error).toMatchObject({ code: "AI_DAILY_CAP_REACHED", resetAt: "2026-11-17T00:00:00.000Z" });
    expect(error.message).toContain("limite d'utilisation");
    expect(order).toEqual(["auth", "replay", "reserve"]);
  });

  it("réservation illisible : échec, aucun appel à OpenAI", async () => {
    routes.reserve = async () => Response.json({ ok: "oui" });
    const response = await ask();
    expect(response.status).toBe(500);
    expect(calls("embed") + calls("generate") + calls("start")).toBe(0);
  });

  it("rejeu (question déjà reçue) : 409 REQUEST_IN_PROGRESS sans réservation", async () => {
    routes.replay = async () => Response.json([{ id: "m1" }]);
    const response = await ask();
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("REQUEST_IN_PROGRESS");
    expect(order).toEqual(["auth", "replay"]);
    expect(String(fetchMock.mock.calls[1][0])).toContain(`client_request_id=eq.${REQUEST_ID}`);
  });

  it("23505 concurrent à la création de la question : unité rendue puis 409", async () => {
    routes.start = async () => Response.json({ code: "23505", message: "duplicate key" }, { status: 409 });
    const response = await ask();
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("REQUEST_IN_PROGRESS");
    expect(bodyOf("/rpc/release_ai_call")).toEqual({ p_reservation_id: RESERVATION });
    expect(calls("embed") + calls("generate") + calls("failure")).toBe(0);
  });
});

describe("chat : aucun Passage", () => {
  it("refus enregistré avec le texte du catalogue, sans appel de génération, unité rendue", async () => {
    routes.match = async () => Response.json([]);
    const response = await ask();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversationId: CONVERSATION,
      message: { kind: "refusal_info_absente", content: REFUSAL_INFO_ABSENTE, sources: [] },
    });
    expect(bodyOf("/rpc/save_assistant_answer")).toEqual({
      p_conversation_id: CONVERSATION,
      p_kind: "refusal_info_absente",
      p_content: REFUSAL_INFO_ABSENTE,
      p_sources: [],
    });
    expect(calls("generate")).toBe(0);
    expect(calls("release")).toBe(1);
  });

  it("texte du refus identique au catalogue de Next.js", () => {
    expect(REFUSAL_INFO_ABSENTE).toBe(texts.assistant.refusalInfoAbsente);
  });

  it("messages d'erreur identiques au catalogue (quota et plafond : sans {moment}, remplacés par le relais)", () => {
    expect(FAILURE_MESSAGE).toBe(texts.assistant.failed);
    expect(SESSION_MESSAGE).toBe(texts.session.expired);
    expect(UNVERIFIABLE_MESSAGE).toBe(texts.assistant.unverifiable);
    expect(BUDGET_MESSAGE).toBe(texts.assistant.budgetExhausted);
    expect(IN_PROGRESS_MESSAGE).toBe(texts.assistant.inProgress);
  });
});

describe("chat : règle de libération", () => {
  const failing = async (code: string) => {
    // Échéance assez large pour une nouvelle tentative (500 ms d'attente) ; génération bornée à 200 ms.
    const response = await ask({ timeoutMs: 2_000, generationTimeoutMs: 200 });
    const { error } = await response.json();
    expect(error.code).toBe(code);
    expect(bodyOf("/rpc/record_assistant_failure")).toEqual({ p_conversation_id: CONVERSATION, p_error_code: code });
    return response;
  };

  it("panne de vectorisation (avant génération) : échec enregistré, unité rendue, aucune génération", async () => {
    routes.embed = async () => Response.json({ error: { code: "invalid_api_key" } }, { status: 401 });
    await failing("AI_UNAVAILABLE");
    expect(calls("generate")).toBe(0);
    expect(calls("release")).toBe(1);
  });

  it("panne de match_passages : INTERNAL, unité rendue", async () => {
    routes.match = async () => Response.json({ message: "relation" }, { status: 500 });
    await failing("INTERNAL");
    expect(calls("release")).toBe(1);
  });

  it("erreur réseau à la génération : aucune nouvelle tentative, AI_UNAVAILABLE, unité rendue", async () => {
    routes.generate = async () => {
      throw new TypeError("fetch failed");
    };
    await failing("AI_UNAVAILABLE");
    expect(calls("generate")).toBe(1);
    expect(calls("release")).toBe(1);
  });

  it("5xx répétés sans réponse : une seule nouvelle tentative, puis unité rendue", async () => {
    routes.generate = async () => Response.json({ error: { type: "server_error" } }, { status: 503 });
    await failing("AI_UNAVAILABLE");
    expect(calls("generate")).toBe(2);
    expect(calls("release")).toBe(1);
  });

  it("AiError sans issue levée avant tout envoi (hors délai commun) : unité rendue", async () => {
    // callProvider relaie telle quelle une AiError levée par fetch : elle n'a pas d'outcome.
    routes.generate = async () => {
      throw new AiError("AI_UNAVAILABLE", true, "levée avant envoi");
    };
    await failing("AI_UNAVAILABLE");
    expect(calls("release")).toBe(1);
  });

  it("clé absente : AI_UNAVAILABLE, aucune génération, unité rendue", async () => {
    delete env[["OPENAI", "API", "KEY"].join("_")];
    await failing("AI_UNAVAILABLE");
    expect(calls("generate")).toBe(0);
    expect(calls("release")).toBe(1);
  });

  it("plafond du fournisseur : AI_BUDGET_EXHAUSTED, unité rendue", async () => {
    routes.generate = async () => Response.json({ error: { code: "insufficient_quota", type: "insufficient_quota" } }, { status: 429 });
    const response = await failing("AI_BUDGET_EXHAUSTED");
    expect(response.status).toBe(503);
    expect(calls("release")).toBe(1);
  });

  it("réponse reçue sans citation valide : AI_CITATIONS_INVALID, unité consommée", async () => {
    routes.generate = async () => completion("Réponse sans citation, ou [P9] inconnue.");
    const response = await failing("AI_CITATIONS_INVALID");
    expect(response.status).toBe(502);
    expect(calls("save")).toBe(0);
    expect(calls("release")).toBe(0);
  });

  it.each([
    ["tronquée", () => completion("Début", "length")],
    ["filtrée", () => completion("", "content_filter")],
    [
      "refus du modèle",
      () =>
        Response.json({
          choices: [{ index: 0, message: { role: "assistant", content: null, refusal: "Je ne peux pas." }, finish_reason: "stop" }],
        }),
    ],
  ])("sortie %s : AI_OUTPUT_INVALID, unité consommée", async (_, respond) => {
    routes.generate = async () => respond();
    await failing("AI_OUTPUT_INVALID");
    expect(calls("release")).toBe(0);
  });

  it("délai dépassé après envoi de la génération : AI_TIMEOUT, unité consommée", async () => {
    routes.generate = hang;
    const started = Date.now();
    const response = await failing("AI_TIMEOUT");
    expect(response.status).toBe(504);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(calls("release")).toBe(0);
  });

  it("échéance globale atteinte avant la génération (base lente) : AI_TIMEOUT, unité rendue", async () => {
    routes.match = hang;
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const response = await ask({ timeoutMs: 300 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.off("unhandledRejection", unhandled);
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("AI_TIMEOUT");
    expect(calls("generate")).toBe(0);
    expect(calls("release")).toBe(1);
    expect(calls("failure")).toBe(1);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("panne à l'enregistrement de la réponse (génération reçue) : INTERNAL, unité consommée", async () => {
    routes.save = async () => Response.json({ code: "XX000" }, { status: 500 });
    await failing("INTERNAL");
    expect(calls("release")).toBe(0);
  });

  it("la génération reçoit le temps restant, 40 s au plus", async () => {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    await ask();
    expect(timeout.mock.calls.some(([, ms]) => ms === 40_000)).toBe(true);
    expect(timeout.mock.calls.some(([, ms]) => ms === 60_000)).toBe(true);
  });
});

describe("chat : entrée et session", () => {
  it("sans jeton : 401, aucun appel", async () => {
    const response = await handle(request({ question: QUESTION, clientRequestId: REQUEST_ID }, {}));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("jeton refusé par Auth : 401, aucune réservation", async () => {
    routes.auth = async () => new Response("{}", { status: 401 });
    const response = await ask();
    expect(response.status).toBe(401);
    expect(order).toEqual(["auth"]);
  });

  it.each([
    ["vide", { question: "", clientRequestId: REQUEST_ID }],
    ["espaces", { question: "   ", clientRequestId: REQUEST_ID }],
    ["> 2 000 caractères", { question: "a".repeat(2_001), clientRequestId: REQUEST_ID }],
    ["identifiant absent", { question: QUESTION }],
    ["identifiant non UUID", { question: QUESTION, clientRequestId: "abc" }],
    ["corps illisible", "{pas du json"],
  ])("demande %s : 400 VALIDATION_FAILED, ni rejeu ni réservation", async (_, body) => {
    const response = await handle(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    expect(order).toEqual(["auth"]);
  });

  it("2 000 caractères acceptés", async () => {
    expect((await handle(request({ question: "a".repeat(2_000), clientRequestId: REQUEST_ID }))).status).toBe(200);
  });

  it("clé secrète reçue : ignorée, clé publique du projet utilisée partout", async () => {
    await handle(request({ question: QUESTION, clientRequestId: REQUEST_ID }, { Authorization: `Bearer ${TOKEN}`, apikey: "sb_secret_exemple" }));
    const supabaseCalls = fetchMock.mock.calls.filter(([url]) => String(url).startsWith(REMOTE));
    expect(supabaseCalls.length).toBeGreaterThan(5);
    for (const [, init] of supabaseCalls) {
      expect(init.headers.apikey).toBe(env.SUPABASE_ANON_KEY);
      expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    }
  });

  it("autre méthode que POST : refusée", async () => {
    expect((await handle(new Request("http://localhost/", { method: "GET" }))).status).toBe(405);
  });
});
