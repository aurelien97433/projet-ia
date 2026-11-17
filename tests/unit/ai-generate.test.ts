import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyRefusal, generateAnswer, streamAnswer, type AiDeps } from "../../supabase/functions/_shared/ai.ts";
import {
  AI_MAX_RETRIES,
  DEFAULT_GENERATION_MODEL,
  GENERATION_MAX_COMPLETION_TOKENS,
  GENERATION_MAX_RETRIES,
  GENERATION_SAMPLING,
  GENERATION_TIMEOUT_MS,
  REFUSAL_MAX_COMPLETION_TOKENS,
} from "../../supabase/functions/_shared/config.ts";
import { AiError } from "../../supabase/functions/_shared/errors.ts";
import type { ChatMessage } from "../../supabase/functions/_shared/rag/prompt.ts";

// Génération non diffusée (story 5.2a-1) avec un fournisseur simulé : corps envoyé, réponses
// inexploitables, refus et code du fournisseur, plafond, aucun texte dans les journaux.
const FAKE_KEY = ["cle", "de", "test", "simulee"].join("-");
const SECRET_TEXT = "Contenu confidentiel du Passage";
const MESSAGES: ChatMessage[] = [
  { role: "system", content: "Consignes." },
  { role: "user", content: SECRET_TEXT },
];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const completion = (content: unknown, finishReason: unknown = "stop", extra: Record<string, unknown> = {}) =>
  json(200, {
    model: "gpt-5.4-mini-2026-03-17",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 120, completion_tokens: 18 },
    ...extra,
  });

const providerError = (status: number, code: string | null, type = "invalid_request_error") =>
  json(status, { error: { message: `Unsupported parameter: ${SECRET_TEXT}`, type, code } });

function fakeDeps(...responses: (Response | Error)[]) {
  const queue = [...responses];
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("réponse simulée manquante");
    if (next instanceof Error) throw next;
    return next;
  });
  return { apiKey: FAKE_KEY as AiDeps["apiKey"], sleep: vi.fn(async () => {}), fetch };
}

async function aiError(promise: Promise<unknown>): Promise<AiError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AiError);
  return error as AiError;
}

const logged = () =>
  [...vi.mocked(console.error).mock.calls, ...vi.mocked(console.log).mock.calls].flat().map(String).join(" ");

afterEach(() => vi.restoreAllMocks());

describe("generateAnswer", () => {
  it("POST /chat/completions : modèle, messages, raisonnement none, sortie bornée, échantillonnage retenu", async () => {
    const deps = fakeDeps(completion("Relancez à J+15 [P1]."));
    const result = await generateAnswer(MESSAGES, { deps });
    const [url, init] = deps.fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: DEFAULT_GENERATION_MODEL,
      messages: MESSAGES,
      reasoning_effort: "none",
      max_completion_tokens: GENERATION_MAX_COMPLETION_TOKENS,
      ...GENERATION_SAMPLING,
    });
    expect(result).toEqual({
      text: "Relancez à J+15 [P1].",
      model: "gpt-5.4-mini-2026-03-17",
      usage: { inputTokens: 120, outputTokens: 18 },
    });
  });

  it("délai par tentative : GENERATION_TIMEOUT_MS par défaut, réductible par l'appelant", async () => {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    await generateAnswer(MESSAGES, { deps: fakeDeps(completion("OK")) });
    expect(timeout.mock.calls.some(([, ms]) => ms === GENERATION_TIMEOUT_MS)).toBe(true);
    timeout.mockClear();
    await generateAnswer(MESSAGES, { deps: fakeDeps(completion("OK")), timeoutMs: 5_000 });
    expect(timeout.mock.calls.some(([, ms]) => ms === 5_000)).toBe(true);
  });

  it.each([
    ["sortie tronquée", completion("Début de réponse", "length")],
    ["sortie filtrée", completion("", "content_filter")],
    ["texte vide", completion("   ")],
    ["contenu absent", completion(null)],
    ["finish_reason absent", completion("Texte", null)],
    ["aucun choix", json(200, { model: "gpt-5.4-mini", choices: [] })],
  ])("%s : AI_OUTPUT_INVALID, sans nouvelle tentative ni texte journalisé", async (label, response) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const deps = fakeDeps(response);
    const error = await aiError(generateAnswer(MESSAGES, { deps }));
    expect(error.code).toBe("AI_OUTPUT_INVALID");
    // Tronquée ou filtrée : la même demande redonnerait le même résultat.
    expect(error.retryable).toBe(!["sortie tronquée", "sortie filtrée"].includes(label));
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(logged()).not.toContain("Début de réponse");
  });

  it("paramètre refusé (400 unsupported_parameter) : AI_UNAVAILABLE non relancé, code du fournisseur gardé, message jamais journalisé", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const deps = fakeDeps(json(400, { error: { message: `Unsupported parameter: ${SECRET_TEXT}`, type: "invalid_request_error", code: "unsupported_parameter", param: "temperature" } }));
    const error = await aiError(generateAnswer(MESSAGES, { deps }));
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE", retryable: false, providerCode: "unsupported_parameter", providerParam: "temperature" });
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(logged()).toContain("unsupported_parameter");
    expect(logged()).not.toContain(SECRET_TEXT);
  });

  it("plafond de dépense atteint : AI_BUDGET_EXHAUSTED, sans nouvelle tentative", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps(providerError(429, "insufficient_quota", "insufficient_quota"));
    expect(await aiError(generateAnswer(MESSAGES, { deps }))).toMatchObject({ code: "AI_BUDGET_EXHAUSTED", providerCode: "insufficient_quota" });
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });

  it(`503 répétés : une seule nouvelle tentative (${GENERATION_MAX_RETRIES}, story 5.2a-2), puis AI_UNAVAILABLE sans réponse reçue`, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps(...Array.from({ length: AI_MAX_RETRIES + 1 }, () => providerError(503, null, "server_error")));
    const error = await aiError(generateAnswer(MESSAGES, { deps }));
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE", retryable: true, outcome: "no_response" });
    expect(GENERATION_MAX_RETRIES).toBe(1);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it("429 (hors plafond) puis succès : une nouvelle tentative, réponse rendue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps(providerError(429, "rate_limit_exceeded", "requests"), completion("Réponse [P1]."));
    expect((await generateAnswer(MESSAGES, { deps })).text).toBe("Réponse [P1].");
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it("erreur réseau : aucune nouvelle tentative (requête peut-être reçue et facturée), AI_UNAVAILABLE sans réponse", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps(new TypeError("fetch failed"), completion("Réponse [P1]."));
    const error = await aiError(generateAnswer(MESSAGES, { deps }));
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE", outcome: "no_response" });
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });

  it("délai dépassé après envoi : AI_TIMEOUT, issue « timeout », aucune nouvelle tentative", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("interrompu", "AbortError")))),
    );
    const deps = { apiKey: FAKE_KEY as AiDeps["apiKey"], sleep: vi.fn(async () => {}), fetch };
    const error = await aiError(generateAnswer(MESSAGES, { deps, timeoutMs: 20 }));
    expect(error).toMatchObject({ code: "AI_TIMEOUT", outcome: "timeout" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("issue de l'appel : réponse inexploitable « response_received », refus et plafond « no_response »", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect((await aiError(generateAnswer(MESSAGES, { deps: fakeDeps(completion("x", "length")) }))).outcome).toBe("response_received");
    expect((await aiError(generateAnswer(MESSAGES, { deps: fakeDeps(new Response("{coupé", { status: 200 })) }))).outcome).toBe(
      "response_received",
    );
    expect((await aiError(generateAnswer(MESSAGES, { deps: fakeDeps(providerError(400, "invalid_value")) }))).outcome).toBe("no_response");
    expect(
      (await aiError(generateAnswer(MESSAGES, { deps: fakeDeps(providerError(429, "insufficient_quota", "insufficient_quota")) }))).outcome,
    ).toBe("no_response");
  });

  it("503 puis succès : la réponse est rendue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps(providerError(503, null, "server_error"), completion("Réponse [P1]."));
    expect((await generateAnswer(MESSAGES, { deps })).text).toBe("Réponse [P1].");
  });

  it("usage absent : compteurs à 0 ; modèle absent : modèle demandé", async () => {
    const response = json(200, { choices: [{ message: { content: "OK" }, finish_reason: "stop" }] });
    expect(await generateAnswer(MESSAGES, { deps: fakeDeps(response) })).toEqual({
      text: "OK",
      model: DEFAULT_GENERATION_MODEL,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it("paramètre refusé avec un nom de champ suspect : nom non recopié", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps(json(400, { error: { code: "unsupported_value", param: "texte libre avec espaces" } }));
    expect((await aiError(generateAnswer(MESSAGES, { deps }))).providerParam).toBeUndefined();
  });

  it("réponse 200 illisible (JSON coupé) : AI_OUTPUT_INVALID non réessayable, sans nouvelle tentative", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps(new Response("{ \"choices\": [", { status: 200 }));
    expect(await aiError(generateAnswer(MESSAGES, { deps }))).toMatchObject({ code: "AI_OUTPUT_INVALID", retryable: false });
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });

  it("refus de sécurité du modèle : signalé dans les journaux, sans son texte", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const response = json(200, { choices: [{ message: { content: null, refusal: "Texte du refus" }, finish_reason: "stop" }] });
    await aiError(generateAnswer(MESSAGES, { deps: fakeDeps(response) }));
    expect(logged()).toContain('"refusal":true');
    expect(logged()).not.toContain("Texte du refus");
  });

  it("sortie bornée bien sous la limite de 20 000 caractères d'une réponse en base (story 5.1)", () => {
    // Environ 4 caractères par token en français : 1 500 tokens ≈ 6 000 caractères.
    expect(GENERATION_MAX_COMPLETION_TOKENS * 4).toBeLessThan(20_000);
  });

  it("clé absente : AI_UNAVAILABLE sans appel", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = { ...fakeDeps(), apiKey: undefined };
    expect((await aiError(generateAnswer(MESSAGES, { deps }))).code).toBe("AI_UNAVAILABLE");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});

describe("classifyRefusal (appel court, story 5.3)", () => {
  it("même modèle, raisonnement none et échantillonnage que la génération ; sortie bornée à 16 tokens", async () => {
    const deps = fakeDeps(completion("REFUS_HORS_CADRE"));
    const result = await classifyRefusal(MESSAGES, { deps });
    expect(REFUSAL_MAX_COMPLETION_TOKENS).toBe(16);
    expect(JSON.parse(String(deps.fetch.mock.calls[0][1]?.body))).toEqual({
      model: DEFAULT_GENERATION_MODEL,
      messages: MESSAGES,
      reasoning_effort: "none",
      max_completion_tokens: REFUSAL_MAX_COMPLETION_TOKENS,
      ...GENERATION_SAMPLING,
    });
    expect(result.text).toBe("REFUS_HORS_CADRE");
  });

  it("503 répétés : une seule nouvelle tentative, puis AI_UNAVAILABLE sans réponse reçue (unité rendable)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps(providerError(503, null, "server_error"), providerError(503, null, "server_error"), completion("x"));
    expect(await aiError(classifyRefusal(MESSAGES, { deps }))).toMatchObject({ code: "AI_UNAVAILABLE", outcome: "no_response" });
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it("erreur réseau : aucune nouvelle tentative ; sortie tronquée : AI_OUTPUT_INVALID « response_received »", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const network = fakeDeps(new TypeError("fetch failed"), completion("REFUS_HORS_CADRE"));
    expect(await aiError(classifyRefusal(MESSAGES, { deps: network }))).toMatchObject({ code: "AI_UNAVAILABLE", outcome: "no_response" });
    expect(network.fetch).toHaveBeenCalledTimes(1);
    const truncated = await aiError(classifyRefusal(MESSAGES, { deps: fakeDeps(completion("REFUS_", "length")) }));
    expect(truncated).toMatchObject({ code: "AI_OUTPUT_INVALID", outcome: "response_received" });
    expect(logged()).toContain("classify_refusal");
  });

  it("sortie coupée par la borne après la première ligne (« length » avec saut de ligne) : acceptée, texte rendu tel quel", async () => {
    const deps = fakeDeps(completion("REFUS_HORS_CADRE\nLa capitale de l'Australie est", "length"));
    expect((await classifyRefusal(MESSAGES, { deps })).text).toBe("REFUS_HORS_CADRE\nLa capitale de l'Australie est");
  });

  it("« length » sans saut de ligne : AI_OUTPUT_INVALID ; generateAnswer refuse toujours « length », même avec un saut de ligne", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await aiError(classifyRefusal(MESSAGES, { deps: fakeDeps(completion("REFUS_HORS_CADRE la capitale", "length")) }))).toMatchObject({
      code: "AI_OUTPUT_INVALID",
      outcome: "response_received",
    });
    expect(await aiError(generateAnswer(MESSAGES, { deps: fakeDeps(completion("REPONSE\nDébut", "length")) }))).toMatchObject({
      code: "AI_OUTPUT_INVALID",
    });
    expect(await aiError(classifyRefusal(MESSAGES, { deps: fakeDeps(completion("REFUS_HORS_CADRE\nx", "content_filter")) }))).toMatchObject({
      code: "AI_OUTPUT_INVALID",
    });
  });
});

// Story 5.5 : génération diffusée (fournisseur simulé en SSE).
describe("streamAnswer (story 5.5)", () => {
  const sseChunk = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
  // Flux du fournisseur : chaque morceau de texte dans un événement, puis finish_reason, usage, [DONE].
  // split : découpage des octets envoyés (lignes coupées n'importe où).
  function streamed(texts: string[], { finishReason = "stop", split = 0, done = true, open = false } = {}) {
    const body = [
      sseChunk({ model: "gpt-5.4-mini-2026-03-17", choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] }),
      ...texts.map((content) => sseChunk({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })),
      finishReason === "absent" ? "" : sseChunk({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }] }),
      sseChunk({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 18 } }),
      done ? "data: [DONE]\n\n" : "",
    ].join("");
    const parts = split > 0 ? (body.match(new RegExp(`[\\s\\S]{1,${split}}`, "g")) ?? []) : [body];
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
        // open : flux laissé ouvert (fournisseur qui continue d'écrire), à annuler par le lecteur.
        if (!open) controller.close();
      },
      cancel,
    });
    return { response: new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }), cancel };
  }

  it("corps : mêmes modèle, échantillonnage, raisonnement et borne que generateAnswer, avec stream: true", async () => {
    const deps = fakeDeps(streamed(["Bonjour"]).response);
    await streamAnswer(MESSAGES, { deps, onText: () => {} });
    const [url, init] = deps.fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: DEFAULT_GENERATION_MODEL,
      messages: MESSAGES,
      reasoning_effort: "none",
      max_completion_tokens: GENERATION_MAX_COMPLETION_TOKENS,
      ...GENERATION_SAMPLING,
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it("morceaux rendus dans l'ordre, même avec des lignes coupées en plein milieu ; texte complet, modèle et usage", async () => {
    const texts = ["REPONSE\n", "Relancez à J+15 ", "[P", "1]. Fin é."];
    for (const split of [0, 1, 7]) {
      const received: string[] = [];
      const result = await streamAnswer(MESSAGES, {
        deps: fakeDeps(streamed(texts, { split }).response),
        onText: (text) => void received.push(text),
      });
      expect(received).toEqual(texts);
      expect(result).toMatchObject({
        text: texts.join(""),
        model: "gpt-5.4-mini-2026-03-17",
        usage: { inputTokens: 120, outputTokens: 18 },
        stopped: false,
      });
      expect(result.firstChunkMs).not.toBeNull();
    }
  });

  it("onText → false : lecture du fournisseur arrêtée (flux annulé), texte partiel non contrôlé", async () => {
    const { response, cancel } = streamed(["REFUS_INFO_ABSENTE\n", "Texte à ignorer", " encore"], { finishReason: "length", open: true });
    const received: string[] = [];
    const result = await streamAnswer(MESSAGES, {
      deps: fakeDeps(response),
      onText: (text) => {
        received.push(text);
        return false;
      },
    });
    expect(received).toEqual(["REFUS_INFO_ABSENTE\n"]);
    expect(result).toMatchObject({ text: "REFUS_INFO_ABSENTE\n", stopped: true });
    expect(cancel).toHaveBeenCalled();
  });

  it.each([
    ["sortie tronquée", { finishReason: "length" }, false],
    ["sortie filtrée", { finishReason: "content_filter" }, false],
    ["flux sans fin (ni finish_reason ni [DONE])", { finishReason: "absent", done: false }, true],
  ])("%s : AI_OUTPUT_INVALID « response_received »", async (_, options, retryable) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = await aiError(streamAnswer(MESSAGES, { deps: fakeDeps(streamed(["Début"], options).response), onText: () => {} }));
    expect(error).toMatchObject({ code: "AI_OUTPUT_INVALID", retryable, outcome: "response_received" });
    expect(logged()).not.toContain("Début");
  });

  it("503 puis flux : une seule nouvelle tentative avant le premier morceau ; 503 répétés : AI_UNAVAILABLE sans réponse", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = fakeDeps(json(503, {}), streamed(["OK"]).response);
    expect((await streamAnswer(MESSAGES, { deps: ok, onText: () => {} })).text).toBe("OK");
    expect(ok.fetch).toHaveBeenCalledTimes(2);
    const ko = fakeDeps(json(503, {}), json(503, {}), streamed(["OK"]).response);
    expect(await aiError(streamAnswer(MESSAGES, { deps: ko, onText: () => {} }))).toMatchObject({
      code: "AI_UNAVAILABLE",
      outcome: "no_response",
    });
    expect(ko.fetch).toHaveBeenCalledTimes(1 + GENERATION_MAX_RETRIES);
  });

  it("plafond (429) : AI_BUDGET_EXHAUSTED sans nouvelle tentative ; erreur réseau : aucune nouvelle tentative", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const budget = fakeDeps(providerError(429, "project_spend_limit_exceeded"));
    expect((await aiError(streamAnswer(MESSAGES, { deps: budget, onText: () => {} }))).code).toBe("AI_BUDGET_EXHAUSTED");
    expect(budget.fetch).toHaveBeenCalledTimes(1);
    const network = fakeDeps(new TypeError("fetch failed"), streamed(["OK"]).response);
    expect(await aiError(streamAnswer(MESSAGES, { deps: network, onText: () => {} }))).toMatchObject({
      code: "AI_UNAVAILABLE",
      outcome: "no_response",
    });
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it("flux coupé après le premier morceau : AI_UNAVAILABLE « response_received » (facturé), aucune nouvelle tentative", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) controller.enqueue(new TextEncoder().encode(sseChunk({ choices: [{ index: 0, delta: { content: "Début" } }] })));
        else controller.error(new TypeError("connexion coupée"));
      },
    });
    const deps = fakeDeps(new Response(stream, { status: 200 }), streamed(["OK"]).response);
    const received: string[] = [];
    const error = await aiError(streamAnswer(MESSAGES, { deps, onText: (text) => void received.push(text) }));
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE", outcome: "response_received" });
    expect(received).toEqual(["Début"]);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });

  it("aucun morceau avant firstChunkTimeoutMs : AI_TIMEOUT « timeout » ; premier morceau à temps : délai total seul ensuite", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const encoder = new TextEncoder();
    const slow = (firstDelay: number, secondDelay: number) =>
      vi.fn<typeof globalThis.fetch>(async (_url, init) => {
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const wait = (ms: number) =>
              new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, ms);
                init?.signal?.addEventListener("abort", () => {
                  clearTimeout(timer);
                  reject(new DOMException("interrompu", "AbortError"));
                });
              });
            try {
              await wait(firstDelay);
              controller.enqueue(encoder.encode(sseChunk({ choices: [{ index: 0, delta: { content: "A" } }] })));
              await wait(secondDelay);
              controller.enqueue(encoder.encode(sseChunk({ choices: [{ index: 0, delta: { content: "B" }, finish_reason: "stop" }] })));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch (error) {
              controller.error(error);
            }
          },
        });
        return new Response(stream, { status: 200 });
      });
    const deps = (fetch: typeof globalThis.fetch) => ({ apiKey: FAKE_KEY as AiDeps["apiKey"], sleep: vi.fn(async () => {}), fetch });
    const late = slow(300, 0);
    expect(await aiError(streamAnswer(MESSAGES, { deps: deps(late), timeoutMs: 2_000, firstChunkTimeoutMs: 40, onText: () => {} }))).toMatchObject({
      code: "AI_TIMEOUT",
      outcome: "timeout",
    });
    expect(late).toHaveBeenCalledTimes(1);
    const steady = slow(5, 120);
    expect((await streamAnswer(MESSAGES, { deps: deps(steady), timeoutMs: 2_000, firstChunkTimeoutMs: 40, onText: () => {} })).text).toBe("AB");
    const tooLong = slow(5, 400);
    expect(await aiError(streamAnswer(MESSAGES, { deps: deps(tooLong), timeoutMs: 100, firstChunkTimeoutMs: 40, onText: () => {} }))).toMatchObject({
      code: "AI_TIMEOUT",
    });
  });

  it("clé absente : AI_UNAVAILABLE sans appel ; morceau illisible : AI_OUTPUT_INVALID", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = { ...fakeDeps(), apiKey: undefined };
    expect(await aiError(streamAnswer(MESSAGES, { deps, onText: () => {} }))).toMatchObject({ code: "AI_UNAVAILABLE", outcome: "no_response" });
    expect(deps.fetch).not.toHaveBeenCalled();
    const broken = new Response("data: {pas du json\n\n", { status: 200 });
    expect((await aiError(streamAnswer(MESSAGES, { deps: fakeDeps(broken), onText: () => {} }))).code).toBe("AI_OUTPUT_INVALID");
  });
});

// Revue de la 5.5 : échéances comptées depuis le début de l'appel, usage inconnu quand la lecture est
// arrêtée avant le morceau d'usage.
describe("streamAnswer : échéances de l'appel et usage (revue de la 5.5)", () => {
  const sseChunk = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
  // Flux dont le premier morceau arrive après delayMs (abandonné si le signal est abandonné).
  const delayedStream = (delayMs: number, signal: AbortSignal | null | undefined) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const timer = setTimeout(() => {
            controller.enqueue(new TextEncoder().encode(sseChunk({ choices: [{ index: 0, delta: { content: "OK" }, finish_reason: "stop" }] })));
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            controller.close();
          }, delayMs);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            controller.error(new DOMException("interrompu", "AbortError"));
          });
        },
      }),
      { status: 200 },
    );

  it("nouvelle tentative après 503 : elle ne reçoit que le temps restant jusqu'au premier morceau (échéance de l'appel, pas de la tentative)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      calls += 1;
      return calls === 1 ? json(503, {}) : delayedStream(80, init?.signal);
    });
    // Attente de 60 ms avant la nouvelle tentative : 60 + 80 > 100 ms d'échéance au premier morceau.
    const deps = { apiKey: FAKE_KEY as AiDeps["apiKey"], sleep: () => new Promise<void>((resolve) => setTimeout(resolve, 60)), fetch };
    const error = await aiError(streamAnswer(MESSAGES, { deps, timeoutMs: 2_000, firstChunkTimeoutMs: 100, onText: () => {} }));
    expect(error.code).toBe("AI_TIMEOUT");
    expect(fetch).toHaveBeenCalledTimes(2);
    // Même enchaînement avec assez de temps : réponse rendue.
    calls = 0;
    expect((await streamAnswer(MESSAGES, { deps, timeoutMs: 2_000, firstChunkTimeoutMs: 400, onText: () => {} })).text).toBe("OK");
  });

  it("échéance déjà atteinte pendant l'attente avant la nouvelle tentative : AI_TIMEOUT sans réponse reçue, aucun second appel", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json(503, {}));
    const deps = { apiKey: FAKE_KEY as AiDeps["apiKey"], sleep: () => new Promise<void>((resolve) => setTimeout(resolve, 80)), fetch };
    const error = await aiError(streamAnswer(MESSAGES, { deps, timeoutMs: 2_000, firstChunkTimeoutMs: 50, onText: () => {} }));
    expect(error).toMatchObject({ code: "AI_TIMEOUT", outcome: "no_response" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("lecture arrêtée avant le morceau d'usage : usage inconnu (null), jamais 0 ; flux complet : usage rendu", async () => {
    const body = [
      sseChunk({ choices: [{ index: 0, delta: { content: "REFUS_HORS_CADRE\n" } }] }),
      sseChunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
      sseChunk({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 4 } }),
      "data: [DONE]\n\n",
    ].join("");
    const stopped = await streamAnswer(MESSAGES, { deps: fakeDeps(new Response(body, { status: 200 })), onText: () => false });
    expect(stopped).toMatchObject({ stopped: true, usage: null });
    const complete = await streamAnswer(MESSAGES, { deps: fakeDeps(new Response(body, { status: 200 })), onText: () => {} });
    expect(complete.usage).toEqual({ inputTokens: 120, outputTokens: 4 });
  });
});
