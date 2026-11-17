import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUDGET_MESSAGE,
  FAILURE_MESSAGE,
  handle,
  type HandleOptions,
  IN_PROGRESS_MESSAGE,
  REFUSAL_HORS_CADRE,
  REFUSAL_INFO_ABSENTE,
  SESSION_MESSAGE,
  UNVERIFIABLE_MESSAGE,
} from "../../supabase/functions/chat/index.ts";
import { CHAT_FIRST_DISPLAY_MS, EMBEDDING_DIMENSION } from "../../supabase/functions/_shared/config.ts";
import { AiError } from "../../supabase/functions/_shared/errors.ts";
import { fakeStreamResponse } from "../../supabase/functions/_shared/fake-generation.ts";
import { REFUSAL_SYSTEM_PROMPT } from "../../supabase/functions/_shared/rag/prompt.ts";
import { texts } from "@/lib/texts";

// Edge Function chat (story 5.2a-2), fournisseur, base et Auth simulés : ordre des étapes, aucun appel
// à OpenAI sans réservation, échéance, une seule nouvelle tentative de génération, aucun Passage
// (appel court, story 5.3), marqueur en première ligne, règle de libération (unité rendue ou
// consommée), journaux sans texte.
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
    generate: async () => completion(`REPONSE\n${ANSWER_SECRET} [P2]. Voir aussi [P1][P3] et [P9].`),
    classify: async () => completion("REFUS_INFO_ABSENTE"),
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
    if (url.endsWith("/chat/completions")) {
      // Appel court (consignes de refus) ou génération : même point d'appel du fournisseur.
      const system = (JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] }).messages[0].content;
      return route(system === REFUSAL_SYSTEM_PROMPT ? "classify" : "generate");
    }
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
        content: `${ANSWER_SECRET}[S1]. Voir aussi[S2] et.`,
        sources: [
          { documentId: DOC_2, title: "FAQ comptabilité", passageNumbers: [2] },
          { documentId: DOC_1, title: "Procédure de facturation", passageNumbers: [1, 3] },
        ],
      },
    });
  });

  it("story 5.4 : citations invalides retirées sans message, nombre seul journalisé ; renvois [S{n}] enregistrés", async () => {
    routes.generate = async () => completion(`REPONSE\n${ANSWER_SECRET} [P1][P3]. Suite [P0] et [P1, P2] [P2]. Fin [S4] [P9].`);
    const body = await (await ask()).json();
    const content = `${ANSWER_SECRET}[S1]. Suite et[S2]. Fin.`;
    expect(body.message.content).toBe(content);
    expect(body.message.sources.map((source: { passageNumbers: number[] }) => source.passageNumbers)).toEqual([[1, 3], [2]]);
    expect(bodyOf("/rpc/save_assistant_answer").p_content).toBe(content);
    const output = logs();
    expect(output).toMatch(/"unknown_citations":3/);
    expect(output).toMatch(/"model_renvois_removed":1/);
    expect(output).not.toContain("[P0]");
    expect(output).not.toContain("[P1, P2]");
    expect(output).not.toContain("[P9]");
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
      p_content: `${ANSWER_SECRET}[S1]. Voir aussi[S2] et.`,
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
    routes.generate = async () => completion("REPONSE\nRéponse [P1].");
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
    routes.generate = async () => completion("REPONSE\nSans citation.");
    await ask();
    routes.generate = async () => completion(`REFUS_HORS_CADRE\n${ANSWER_SECRET}`);
    await ask();
    routes.generate = async () => completion(`Pas de marqueur. ${ANSWER_SECRET}`);
    await ask();
    routes.match = async () => Response.json([]);
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

describe("chat : marqueur de la génération (story 5.3)", () => {
  it("REPONSE : réponse enregistrée et renvoyée sans le marqueur ; lecture tolérante (**reponse**  )", async () => {
    routes.generate = async () => completion("**reponse**  \nSous 5 jours ouvrés [P1].");
    const response = await ask();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message).toMatchObject({ kind: "answer", content: "Sous 5 jours ouvrés[S1]." });
    expect(bodyOf("/rpc/save_assistant_answer").p_content).toBe("Sous 5 jours ouvrés[S1].");
    expect(calls("classify")).toBe(0);
  });

  it.each([
    ["REFUS_INFO_ABSENTE", "refusal_info_absente", REFUSAL_INFO_ABSENTE],
    ["REFUS_HORS_CADRE", "refusal_hors_cadre", REFUSAL_HORS_CADRE],
  ])("%s avec Passages : message standard enregistré, texte du modèle ignoré, sans Source ; unité consommée", async (marker, kind, content) => {
    routes.generate = async () => completion(`${marker}\n${ANSWER_SECRET} [P1].`);
    const response = await ask();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ conversationId: CONVERSATION, message: { kind, content, sources: [] } });
    expect(text).not.toContain(ANSWER_SECRET);
    expect(bodyOf("/rpc/save_assistant_answer")).toEqual({ p_conversation_id: CONVERSATION, p_kind: kind, p_content: content, p_sources: [] });
    expect(calls("release") + calls("failure") + calls("classify")).toBe(0);
  });

  it.each([
    ["absent", `Voici la réponse : ${ANSWER_SECRET} [P1].`],
    ["suivi de texte", `REPONSE : ${ANSWER_SECRET} [P1].`],
    ["mot inconnu", `REFUS\n${ANSWER_SECRET} [P1].`],
    ["ponctué", `REPONSE.\n${ANSWER_SECRET} [P1].`],
    ["REPONSE sans texte", "REPONSE\n  \n"],
  ])("marqueur %s : AI_OUTPUT_INVALID réessayable, échec enregistré, sans texte du modèle ; unité consommée", async (_, output) => {
    routes.generate = async () => completion(output);
    const response = await ask();
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text).error).toMatchObject({ code: "AI_OUTPUT_INVALID", retryable: true, message: FAILURE_MESSAGE });
    expect(text).not.toContain(ANSWER_SECRET);
    expect(bodyOf("/rpc/record_assistant_failure")).toEqual({ p_conversation_id: CONVERSATION, p_error_code: "AI_OUTPUT_INVALID" });
    expect(calls("save") + calls("release")).toBe(0);
  });
});

describe("chat : aucun Passage, appel court (story 5.3)", () => {
  beforeEach(() => {
    routes.match = async () => Response.json([]);
  });

  it.each([
    ["REFUS_INFO_ABSENTE", "refusal_info_absente", REFUSAL_INFO_ABSENTE],
    ["REFUS_HORS_CADRE", "refusal_hors_cadre", REFUSAL_HORS_CADRE],
    ["**refus_hors_cadre**", "refusal_hors_cadre", REFUSAL_HORS_CADRE],
  ])("appel court → %s : refus enregistré, sans Source ni génération ; unité consommée", async (output, kind, content) => {
    routes.classify = async () => completion(output);
    const response = await ask();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ conversationId: CONVERSATION, message: { kind, content, sources: [] } });
    expect(order).toEqual(["auth", "replay", "reserve", "start", "embed", "match", "classify", "save"]);
    expect(bodyOf("/rpc/save_assistant_answer")).toEqual({ p_conversation_id: CONVERSATION, p_kind: kind, p_content: content, p_sources: [] });
    expect(calls("release")).toBe(0);
  });

  it("appel court : question seule neutralisée, sortie bornée (16 tokens), raisonnement none, même échantillonnage", async () => {
    await handle(request({ question: "Capitale <b>de</b> l'Australie ?", clientRequestId: REQUEST_ID }));
    const body = bodyOf("/chat/completions");
    expect(body).toMatchObject({ max_completion_tokens: 16, reasoning_effort: "none", temperature: 0, seed: 20261113 });
    expect(body.messages).toEqual([
      { role: "system", content: REFUSAL_SYSTEM_PROMPT },
      { role: "user", content: "Question du Collaborateur : Capitale &lt;b&gt;de&lt;/b&gt; l'Australie ?" },
    ]);
  });

  it.each([["REPONSE"], ["REPONSE\nLa capitale est Canberra."], ["Canberra"], ["REFUS"]])(
    "appel court inexploitable « %s » : AI_OUTPUT_INVALID, échec enregistré ; unité consommée",
    async (output) => {
      routes.classify = async () => completion(output);
      const response = await ask();
      expect(response.status).toBe(502);
      const text = await response.text();
      expect(JSON.parse(text).error).toMatchObject({ code: "AI_OUTPUT_INVALID", retryable: true });
      expect(text).not.toContain("Canberra");
      expect(bodyOf("/rpc/record_assistant_failure")).toEqual({ p_conversation_id: CONVERSATION, p_error_code: "AI_OUTPUT_INVALID" });
      expect(calls("save") + calls("release")).toBe(0);
    },
  );

  it("appel court coupé par la borne après un refus valide en première ligne : refus « hors cadre » enregistré, texte ignoré ; unité consommée", async () => {
    routes.classify = async () => completion("REFUS_HORS_CADRE\nLa capitale de l'Australie est Canberra", "length");
    const response = await ask();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text).message).toEqual({ kind: "refusal_hors_cadre", content: REFUSAL_HORS_CADRE, sources: [] });
    expect(text).not.toContain("Canberra");
    expect(bodyOf("/rpc/save_assistant_answer")).toEqual({
      p_conversation_id: CONVERSATION,
      p_kind: "refusal_hors_cadre",
      p_content: REFUSAL_HORS_CADRE,
      p_sources: [],
    });
    expect(calls("release")).toBe(0);
  });

  it("appel court coupé sans saut de ligne : AI_OUTPUT_INVALID, échec enregistré ; unité consommée", async () => {
    routes.classify = async () => completion("REFUS_HORS_CADRE la capitale", "length");
    const response = await ask();
    expect((await response.json()).error.code).toBe("AI_OUTPUT_INVALID");
    expect(bodyOf("/rpc/record_assistant_failure")).toEqual({ p_conversation_id: CONVERSATION, p_error_code: "AI_OUTPUT_INVALID" });
    expect(calls("save") + calls("release")).toBe(0);
  });

  it("appel court sans réponse (5xx après la nouvelle tentative) : AI_UNAVAILABLE, échec enregistré, unité rendue", async () => {
    routes.classify = async () => Response.json({ error: { type: "server_error" } }, { status: 503 });
    const response = await ask({ timeoutMs: 2_000, generationTimeoutMs: 200 });
    expect((await response.json()).error.code).toBe("AI_UNAVAILABLE");
    expect(calls("classify")).toBe(2);
    expect(bodyOf("/rpc/record_assistant_failure")).toEqual({ p_conversation_id: CONVERSATION, p_error_code: "AI_UNAVAILABLE" });
    expect(calls("release")).toBe(1);
  });

  it("appel court : erreur réseau, aucune nouvelle tentative, unité rendue", async () => {
    routes.classify = async () => {
      throw new TypeError("fetch failed");
    };
    const response = await ask({ timeoutMs: 2_000, generationTimeoutMs: 200 });
    expect((await response.json()).error.code).toBe("AI_UNAVAILABLE");
    expect(calls("classify")).toBe(1);
    expect(calls("release")).toBe(1);
  });

  it("appel court : délai dépassé après envoi, AI_TIMEOUT, unité consommée", async () => {
    routes.classify = hang;
    const response = await ask({ timeoutMs: 2_000, generationTimeoutMs: 200 });
    expect((await response.json()).error.code).toBe("AI_TIMEOUT");
    expect(calls("release")).toBe(0);
  });

  it("textes des refus identiques au catalogue de Next.js", () => {
    expect(REFUSAL_INFO_ABSENTE).toBe(texts.assistant.refusalInfoAbsente);
    expect(REFUSAL_HORS_CADRE).toBe(texts.assistant.refusalHorsCadre);
  });
});

describe("chat : textes du catalogue", () => {
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
    routes.generate = async () => completion("REPONSE\nRéponse sans citation, ou [P9] inconnue.");
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

  it("mode JSON : échéance de 60 s, la génération reçoit le temps restant, 40 s au plus", async () => {
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

// Story 5.5 : mode flux (Accept: text/event-stream), fournisseur simulé en SSE.
describe("chat : mode flux (story 5.5)", () => {
  type Event = { event: string; data: Record<string, unknown> };
  const streamRequest = (body: unknown) =>
    new Request("http://localhost/functions/v1/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, apikey: PUBLISHABLE, Accept: "text/event-stream" },
      body: JSON.stringify(body),
    });
  const parseEvents = (text: string): Event[] =>
    text
      .split("\n\n")
      .filter((block) => block.startsWith("event: "))
      .map((block) => {
        const [eventLine, dataLine] = block.split("\n");
        return { event: eventLine.slice("event: ".length), data: JSON.parse(dataLine.slice("data: ".length)) };
      });
  // Demande complète : réponse, flux lu jusqu'au bout, travail en arrière-plan terminé.
  async function stream(options: HandleOptions = {}, body: unknown = { question: QUESTION, clientRequestId: REQUEST_ID }) {
    const pending: Promise<unknown>[] = [];
    const response = await handle(streamRequest(body), { ...options, waitUntil: (promise) => void pending.push(promise) });
    const text = await response.text();
    await Promise.all(pending);
    const events = parseEvents(text);
    const deltas = events.filter((event) => event.event === "delta").map((event) => String(event.data.text));
    return { response, text, events, deltas, final: events.filter((event) => event.event !== "delta") };
  }
  const provider = (chunks: string[], finishReason = "stop") => async () => fakeStreamResponse(chunks, finishReason);

  it("matrice « Réponse » : « REPONSE\\nA [P1]. B [P2]. » en 6 morceaux → delta « A », « . B », « . » puis done avec renvois et Sources", async () => {
    routes.generate = provider(["REPONSE\nA [", "P1", "]. B", " [P", "2]", "."]);
    const { response, deltas, final } = await stream();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(deltas).toEqual(["A", ". B", "."]);
    const body = {
      conversationId: CONVERSATION,
      message: {
        kind: "answer",
        content: "A[S1]. B[S2].",
        sources: [
          { documentId: DOC_1, title: "Procédure de facturation", passageNumbers: [1] },
          { documentId: DOC_2, title: "FAQ comptabilité", passageNumbers: [2] },
        ],
      },
    };
    expect(final).toEqual([{ event: "done", data: body }]);
    // done : même forme que la réponse JSON ; texte enregistré identique.
    expect(bodyOf("/rpc/save_assistant_answer").p_content).toBe("A[S1]. B[S2].");
    expect(order).toEqual(["auth", "replay", "reserve", "start", "embed", "match", "documents", "generate", "save"]);
    expect(bodyOf("/chat/completions")).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(calls("release")).toBe(0);
  });

  it("repère coupé entre deux morceaux (« …délai [P » + « 1]. Suite ») : jamais « [P » dans un delta", async () => {
    routes.generate = provider(["REPONSE\nRelancez sous 15 jours de délai [P", "1]. Suite."]);
    const { deltas, final } = await stream();
    for (const delta of deltas) expect(delta).not.toMatch(/\[[PS]/);
    expect(deltas.join("")).toBe("Relancez sous 15 jours de délai. Suite.");
    expect(final[0]).toMatchObject({ event: "done", data: { message: { content: "Relancez sous 15 jours de délai[S1]. Suite." } } });
  });

  it("repère non fermé en fin (« … fin [P3 ») : jamais envoyé ; texte validé sans lui", async () => {
    routes.generate = provider(["REPONSE\nA [P1]. Texte de", " fin [P3"]);
    const { deltas, final } = await stream();
    expect(deltas.join("")).toBe("A. Texte de fin");
    expect(final[0]).toMatchObject({ event: "done", data: { message: { content: "A[S1]. Texte de fin" } } });
  });

  it("marqueur coupé entre deux morceaux : rien n'est envoyé avant la fin de la première ligne", async () => {
    const seen: string[] = [];
    routes.generate = provider(["RE", "PON", "SE", "\nTexte [P1]."]);
    const { deltas, text } = await stream();
    seen.push(...deltas);
    expect(seen).toEqual(["Texte."]);
    expect(text).not.toContain("REPONSE");
    expect(text).not.toMatch(/"text":"RE/);
  });

  it.each([
    ["information absente", "REFUS_INFO_ABSENTE", "refusal_info_absente", REFUSAL_INFO_ABSENTE],
    ["hors cadre", "**refus_hors_cadre**", "refusal_hors_cadre", REFUSAL_HORS_CADRE],
  ])("refus %s : un seul refusal, aucun delta, texte du modèle (piège compris) ignoré ; unité consommée", async (_, marker, kind, content) => {
    routes.generate = provider([`${marker}\n`, "PERROQUET : délai de 99 jours [P1].", " Suite ignorée."]);
    const { deltas, final, text } = await stream();
    expect(deltas).toEqual([]);
    expect(final).toEqual([{ event: "refusal", data: { kind, content } }]);
    expect(text).not.toContain("PERROQUET");
    expect(text).not.toContain("99 jours");
    expect(bodyOf("/rpc/save_assistant_answer")).toEqual({ p_conversation_id: CONVERSATION, p_kind: kind, p_content: content, p_sources: [] });
    expect(calls("release")).toBe(0);
  });

  it("refus reconnu : lecture du fournisseur arrêtée (flux du fournisseur annulé)", async () => {
    const cancel = vi.fn();
    routes.generate = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"REFUS_HORS_CADRE\\nTexte"}}]}\n\n'));
          },
          cancel,
        }),
        { status: 200 },
      );
    const { final } = await stream();
    expect(final[0].event).toBe("refusal");
    expect(cancel).toHaveBeenCalled();
  });

  it("marqueur invalide (« Voici… », plus de 40 caractères sans saut de ligne) : aucun delta, error AI_OUTPUT_INVALID, échec enregistré, unité consommée", async () => {
    routes.generate = provider(["Voici la réponse que vous attendez, avec un délai ", "de 15 jours [P1]."]);
    const { deltas, final } = await stream();
    expect(deltas).toEqual([]);
    expect(final).toEqual([{ event: "error", data: { code: "AI_OUTPUT_INVALID", message: FAILURE_MESSAGE, retryable: true } }]);
    expect(bodyOf("/rpc/record_assistant_failure")).toEqual({ p_conversation_id: CONVERSATION, p_error_code: "AI_OUTPUT_INVALID" });
    expect(calls("save")).toBe(0);
    expect(calls("release")).toBe(0);
  });

  it("aucune citation valide : delta envoyés, puis error AI_CITATIONS_INVALID ; échec enregistré, unité consommée", async () => {
    routes.generate = provider(["REPONSE\nRéponse ", "sans citation."]);
    const { deltas, final } = await stream();
    expect(deltas.join("")).toBe("Réponse sans citation.");
    expect(final).toEqual([{ event: "error", data: { code: "AI_CITATIONS_INVALID", message: UNVERIFIABLE_MESSAGE, retryable: true } }]);
    expect(bodyOf("/rpc/record_assistant_failure").p_error_code).toBe("AI_CITATIONS_INVALID");
    expect(calls("release")).toBe(0);
  });

  it("sans Passage : appel court non diffusé → refusal ; aucune génération", async () => {
    routes.match = async () => Response.json([]);
    const { deltas, final } = await stream();
    expect(deltas).toEqual([]);
    expect(final).toEqual([{ event: "refusal", data: { kind: "refusal_info_absente", content: REFUSAL_INFO_ABSENTE } }]);
    expect(calls("generate")).toBe(0);
    expect(bodyOf("/chat/completions").stream).toBeUndefined();
  });

  it.each([
    ["rejeu (question déjà reçue) : 409 REQUEST_IN_PROGRESS", () => (routes.replay = async () => Response.json([{ id: "m1" }])), 409, "REQUEST_IN_PROGRESS"],
    [
      "quota atteint : 429 QUOTA_EXCEEDED",
      () => (routes.reserve = async () => Response.json({ ok: false, reason: "user", reset_at: "2026-11-17T00:00:00+00:00" })),
      429,
      "QUOTA_EXCEEDED",
    ],
    [
      "plafond global : 503 AI_DAILY_CAP_REACHED",
      () => (routes.reserve = async () => Response.json({ ok: false, reason: "global", reset_at: "2026-11-17T00:00:00+00:00" })),
      503,
      "AI_DAILY_CAP_REACHED",
    ],
    ["session refusée : 401", () => (routes.auth = async () => new Response("{}", { status: 401 })), 401, "UNAUTHENTICATED"],
  ])("refus avant le flux, %s en JSON, aucun appel au fournisseur", async (_, setup, status, code) => {
    setup();
    const response = await handle(streamRequest({ question: QUESTION, clientRequestId: REQUEST_ID }));
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect((await response.json()).error.code).toBe(code);
    expect(calls("generate")).toBe(0);
  });

  it("saisie invalide en flux : 400 JSON", async () => {
    const response = await handle(streamRequest({ question: "", clientRequestId: REQUEST_ID }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
  });

  it("mode JSON (sans Accept) : réponse JSON de la 5.4, génération non diffusée", async () => {
    const response = await ask();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect((await response.json()).message.kind).toBe("answer");
    expect(bodyOf("/chat/completions").stream).toBeUndefined();
  });

  it("navigateur ou relais déconnecté pendant le flux : chat va au bout, réponse enregistrée, unité consommée (waitUntil)", async () => {
    routes.generate = async () => fakeStreamResponse(["REPONSE\nA [P1].", " Suite [P2]."], "stop", 30);
    const pending: Promise<unknown>[] = [];
    const response = await handle(streamRequest({ question: QUESTION, clientRequestId: REQUEST_ID }), {
      waitUntil: (promise) => void pending.push(promise),
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(bodyOf("/rpc/save_assistant_answer").p_content).toBe("A[S1]. Suite[S2].");
    expect(calls("release")).toBe(0);
    expect(logs()).toContain("chat_stream_disconnected");
  });

  it("aucun premier morceau dans le délai : error AI_TIMEOUT, aucun delta, échec enregistré, unité consommée", async () => {
    routes.generate = async (_, init) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            init.signal?.addEventListener("abort", () => controller.error(new DOMException("interrompu", "AbortError")));
          },
        }),
        { status: 200 },
      );
    const { deltas, final } = await stream({ firstChunkTimeoutMs: 50 });
    expect(deltas).toEqual([]);
    expect(final).toEqual([{ event: "error", data: { code: "AI_TIMEOUT", message: FAILURE_MESSAGE, retryable: true } }]);
    expect(bodyOf("/rpc/record_assistant_failure").p_error_code).toBe("AI_TIMEOUT");
    expect(calls("release")).toBe(0);
  });

  it("panne du fournisseur avant tout morceau (5xx répétés) : error AI_UNAVAILABLE, unité rendue", async () => {
    routes.generate = async () => Response.json({}, { status: 503 });
    const { deltas, final } = await stream();
    expect(deltas).toEqual([]);
    expect(final[0]).toMatchObject({ event: "error", data: { code: "AI_UNAVAILABLE", retryable: true } });
    expect(calls("generate")).toBe(2);
    expect(calls("release")).toBe(1);
  });

  it("délais du flux : échéance de 85 s, premier affichage 17 s, génération 70 s au plus et premier morceau min(20 s, 17 s − écoulé)", async () => {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    routes.generate = provider(["REPONSE\nA [P1]."]);
    await stream();
    const delays = timeout.mock.calls.map(([, ms]) => Number(ms));
    expect(delays).toContain(85_000);
    expect(delays).toContain(CHAT_FIRST_DISPLAY_MS);
    expect(CHAT_FIRST_DISPLAY_MS).toBe(17_000);
    expect(delays).toContain(70_000);
    // Premier morceau : jamais 20 s, toujours dans les 17 s qui suivent la réception.
    expect(delays).not.toContain(20_000);
    expect(delays.some((ms) => ms > 16_000 && ms < 17_000)).toBe(true);
  });

  describe("premier affichage du serveur (décision de l'utilisateur du 2026-11-17, option A)", () => {
    const delay = (ms: number, handler: () => Promise<Response>) => async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return handler();
    };

    it("recherche lente : la génération reçoit moins de temps jusqu'au premier morceau (premier affichage − temps écoulé)", async () => {
      const timeout = vi.spyOn(globalThis, "setTimeout");
      const match = routes.match;
      routes.match = delay(250, () => match("", {}));
      routes.generate = hang;
      const started = Date.now();
      const { deltas, final } = await stream({ firstDisplayMs: 400 });
      expect(deltas).toEqual([]);
      expect(final).toEqual([{ event: "error", data: { code: "AI_TIMEOUT", message: FAILURE_MESSAGE, retryable: true } }]);
      // Événement envoyé au plus tard à l'échéance du premier affichage (marge d'exécution).
      expect(Date.now() - started).toBeLessThan(400 + 200);
      // Délai du premier morceau : au plus 400 − 250 ms.
      const firstChunk = timeout.mock.calls.map(([, ms]) => Number(ms)).filter((ms) => ms > 0 && ms <= 160);
      expect(firstChunk.length).toBeGreaterThan(0);
      expect(bodyOf("/rpc/record_assistant_failure").p_error_code).toBe("AI_TIMEOUT");
      // Génération envoyée : unité consommée (règle de libération inchangée).
      expect(calls("release")).toBe(0);
    });

    it("aucun morceau avant l'échéance : error AI_TIMEOUT au plus tard à l'échéance, même si le délai du premier morceau (20 s) est plus long", async () => {
      routes.generate = hang;
      const started = Date.now();
      const { final } = await stream({ firstDisplayMs: 150, firstChunkTimeoutMs: 20_000 });
      expect(final[0]).toMatchObject({ event: "error", data: { code: "AI_TIMEOUT" } });
      expect(Date.now() - started).toBeLessThan(150 + 200);
    });

    it("recherche plus lente que l'échéance : error AI_TIMEOUT, aucune génération, échec enregistré, unité rendue", async () => {
      routes.match = hang;
      const { final } = await stream({ firstDisplayMs: 150 });
      expect(final).toEqual([{ event: "error", data: { code: "AI_TIMEOUT", message: FAILURE_MESSAGE, retryable: true } }]);
      expect(calls("generate")).toBe(0);
      expect(calls("failure")).toBe(1);
      expect(calls("release")).toBe(1);
      expect(logs()).toContain('"first_display_expired":true');
    });

    it("appel court (sans Passage) : refusal à temps ; appel court trop lent : error AI_TIMEOUT avant l'échéance, borné par elle", async () => {
      routes.match = async () => Response.json([]);
      expect((await stream({ firstDisplayMs: 400 })).final[0].event).toBe("refusal");

      fetchMock.mockClear();
      order.length = 0;
      routes.classify = hang;
      const timeout = vi.spyOn(globalThis, "setTimeout");
      const started = Date.now();
      const { final } = await stream({ firstDisplayMs: 150 });
      expect(final[0]).toMatchObject({ event: "error", data: { code: "AI_TIMEOUT" } });
      expect(Date.now() - started).toBeLessThan(150 + 200);
      // Délai de l'appel court : jamais au-delà du temps restant avant l'échéance du premier affichage.
      expect(timeout.mock.calls.some(([, ms]) => Number(ms) > 0 && Number(ms) <= 150)).toBe(true);
      // Appel envoyé : unité consommée.
      expect(calls("release")).toBe(0);
    });

    it("premier delta envoyé à temps : l'échéance du premier affichage ne s'applique plus (réponse longue menée à terme)", async () => {
      routes.generate = async () => fakeStreamResponse(["REPONSE\nA [P1].", " B [P2].", " C.", " D."], "stop", 120);
      const { deltas, final } = await stream({ firstDisplayMs: 300 });
      expect(deltas.length).toBeGreaterThan(1);
      expect(final[0].event).toBe("done");
    });

    it("mode JSON : aucune échéance de premier affichage", async () => {
      const timeout = vi.spyOn(globalThis, "setTimeout");
      await ask();
      expect(timeout.mock.calls.some(([, ms]) => ms === CHAT_FIRST_DISPLAY_MS)).toBe(false);
    });
  });

  it("rien de ce qui part en delta n'est pire que le texte final : ni marqueur, ni repère, ni fait absent du texte validé", async () => {
    const answer = "REPONSE\nTon courtois [P1], sans reproche [P1][P3]. Délai : 15 jours [P2] ; [P9] ignoré [S4].\n1. Relancer [P2]\n2. Noter [P1]";
    for (const size of [1, 2, 3, 7]) {
      fetchMock.mockClear();
      order.length = 0;
      routes.generate = provider(answer.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")) ?? []);
      const { deltas, final, text } = await stream();
      const provisional = deltas.join("");
      expect(text).not.toContain("REPONSE");
      expect(provisional).not.toMatch(/\[[PS]/);
      const content = String((final[0].data.message as { content: string }).content).replace(/\[S\d+\]/g, "");
      // Chaque caractère envoyé en delta se retrouve, dans l'ordre, dans le texte validé.
      let index = 0;
      for (const c of content) if (index < provisional.length && provisional[index] === c) index += 1;
      expect(index).toBe(provisional.length);
    }
  });

  it("refus en flux, lecture arrêtée avant l'usage : chat_done signale usage_missing, jamais 0 jeton ; réponse complète : usage journalisé", async () => {
    routes.generate = provider(["REFUS_INFO_ABSENTE\n", "Texte ignoré."]);
    await stream();
    const refusalLog = logs().split("\n").find((line) => line.includes('"event":"chat_done"'))!;
    expect(refusalLog).toContain('"usage_missing":true');
    expect(refusalLog).not.toMatch(/"input_tokens"|"output_tokens"/);

    vi.mocked(console.log).mockClear();
    routes.generate = provider(["REPONSE\nA [P1]."]);
    await stream();
    const answerLog = logs().split("\n").find((line) => line.includes('"event":"chat_done"'))!;
    expect(answerLog).not.toContain("usage_missing");
    expect(answerLog).toMatch(/"input_tokens":0,"output_tokens":0/);
  });

  it("journaux : mode, premier delta et nombre de delta ; jamais la question, un Passage ni le texte", async () => {
    routes.generate = provider(["REPONSE\n", `${ANSWER_SECRET} [P1].`]);
    await stream();
    const output = logs();
    expect(output).toMatch(/chat_done.*"mode":"stream"/);
    expect(output).toMatch(/"first_delta_ms":\d+/);
    expect(output).toMatch(/"deltas":1/);
    expect(output).not.toContain(QUESTION);
    expect(output).not.toContain(PASSAGE_SECRET);
    expect(output).not.toContain(ANSWER_SECRET);
    expect(output).not.toContain(TOKEN);
  });
});
