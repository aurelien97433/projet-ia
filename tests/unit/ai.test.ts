import { afterEach, describe, expect, it, vi } from "vitest";
import { checkModelAccess, embed, rewriteFollowUp, type AiDeps } from "../../supabase/functions/_shared/ai.ts";
import {
  AI_MAX_RETRIES,
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL,
  EMBEDDING_VERSION,
  DEFAULT_GENERATION_MODEL,
  GENERATION_SAMPLING,
  REWRITE_MAX_COMPLETION_TOKENS,
  REWRITE_TIMEOUT_MS,
} from "../../supabase/functions/_shared/config.ts";
import { AiError } from "../../supabase/functions/_shared/errors.ts";

// Module d'accès à l'IA (AD-3, AD-4, AD-15, AD-16) avec un fournisseur simulé : aucun appel réseau.
const FAKE_KEY = ["cle", "de", "test", "simulee"].join("-");

const vector = (dimension = EMBEDDING_DIMENSION, value = 0.01) => Array.from({ length: dimension }, () => value);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function embeddingsResponse(count: number, dimension = EMBEDDING_DIMENSION): Response {
  return json(200, {
    model: EMBEDDING_MODEL,
    data: Array.from({ length: count }, (_, index) => ({ index, embedding: vector(dimension, index) })),
  });
}

function providerError(status: number, code: string | null, type = "requests"): Response {
  return json(status, { error: { message: "x", type, code } });
}

type FakeDeps = AiDeps & { fetch: ReturnType<typeof vi.fn>; sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>> };

function fakeDeps(...responses: (Response | Error)[]): FakeDeps {
  const queue = [...responses];
  return {
    apiKey: FAKE_KEY,
    sleep: vi.fn(async () => {}),
    fetch: vi.fn(async () => {
      const next = queue.shift();
      if (!next) throw new Error("réponse simulée manquante");
      if (next instanceof Error) throw next;
      return next;
    }),
  };
}

async function expectAiError(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AiError);
  expect((error as AiError).code).toBe(code);
  return error as AiError;
}

let logs: ReturnType<typeof vi.spyOn>;
afterEach(() => vi.restoreAllMocks());
function captureLogs() {
  logs = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => logs.mock.calls.flat().join(" ");
}

describe("configuration (AD-4)", () => {
  it("modèle et dimension fixés une seule fois", () => {
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(EMBEDDING_DIMENSION).toBe(1536);
    expect(EMBEDDING_BATCH_SIZE).toBe(96);
    expect(AI_MAX_RETRIES).toBe(2);
  });
});

describe("embed", () => {
  it("vectorise avec le modèle configuré, la clé en en-tête, et renvoie modèle et version", async () => {
    const deps = fakeDeps(embeddingsResponse(1));
    const result = await embed(["Bonjour"], { deps });
    expect(result.vectors).toHaveLength(1);
    expect(result.vectors[0]).toHaveLength(EMBEDDING_DIMENSION);
    expect(result).toMatchObject({ model: EMBEDDING_MODEL, version: EMBEDDING_VERSION });

    const [url, init] = deps.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(JSON.parse(String(init.body))).toEqual({ model: EMBEDDING_MODEL, input: ["Bonjour"], encoding_format: "float" });
  });

  it("200 textes : 3 requêtes (96, 96, 8), vecteurs dans l'ordre", async () => {
    const deps = fakeDeps(embeddingsResponse(96), embeddingsResponse(96), embeddingsResponse(8));
    const texts = Array.from({ length: 200 }, (_, i) => `texte ${i}`);
    const { vectors } = await embed(texts, { deps });
    expect(deps.fetch).toHaveBeenCalledTimes(3);
    const sizes = deps.fetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).input.length);
    expect(sizes).toEqual([96, 96, 8]);
    expect(vectors).toHaveLength(200);
    expect(vectors[95][0]).toBe(95);
    expect(vectors[96][0]).toBe(0);
  });

  it("remet les vecteurs dans l'ordre des index renvoyés par le fournisseur", async () => {
    const response = json(200, {
      data: [
        { index: 1, embedding: vector(EMBEDDING_DIMENSION, 1) },
        { index: 0, embedding: vector(EMBEDDING_DIMENSION, 0) },
      ],
    });
    const { vectors } = await embed(["a", "b"], { deps: fakeDeps(response) });
    expect(vectors.map((v) => v[0])).toEqual([0, 1]);
  });

  it("aucun texte : aucun appel", async () => {
    const deps = fakeDeps();
    expect((await embed([], { deps })).vectors).toEqual([]);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each([[[""]], [["  "]], [[42 as unknown as string]]])("texte vide ou invalide %j : refusé sans appel", async (texts) => {
    const deps = fakeDeps();
    await expectAiError(embed(texts, { deps }), "VALIDATION_FAILED");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["1 535 nombres", embeddingsResponse(1, 1535)],
    ["1 537 nombres", embeddingsResponse(1, 1537)],
    ["valeur non finie", json(200, { data: [{ index: 0, embedding: [...vector(1535), Number.NaN].map(String) }] })],
    ["vecteur manquant", json(200, { data: [] })],
    ["corps sans data", json(200, {})],
  ])("dimension ou contenu inattendu (%s) : AI_OUTPUT_INVALID, sans nouvelle tentative", async (_label, response) => {
    const read = captureLogs();
    const deps = fakeDeps(response);
    const error = await expectAiError(embed(["Bonjour"], { deps }), "AI_OUTPUT_INVALID");
    expect(error.retryable).toBe(false);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(read()).toContain("ai_embedding_invalid");
  });

  it.each([429, 500, 503])("%i passager : succès après une nouvelle tentative", async (status) => {
    const deps = fakeDeps(providerError(status, null), embeddingsResponse(1));
    expect((await embed(["Bonjour"], { deps })).vectors).toHaveLength(1);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledTimes(1);
  });

  it.each([429, 502])("%i persistant : 2 nouvelles tentatives puis AI_UNAVAILABLE", async (status) => {
    const read = captureLogs();
    const deps = fakeDeps(providerError(status, null), providerError(status, null), providerError(status, null));
    const error = await expectAiError(embed(["Bonjour"], { deps }), "AI_UNAVAILABLE");
    expect(error.retryable).toBe(true);
    expect(deps.fetch).toHaveBeenCalledTimes(3);
    expect(deps.sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
    expect(read()).toContain("ai_unavailable");
  });

  it("erreur réseau : traitée comme une panne passagère", async () => {
    const deps = fakeDeps(new TypeError("fetch failed"), embeddingsResponse(1));
    expect((await embed(["Bonjour"], { deps })).vectors).toHaveLength(1);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["insufficient_quota", "insufficient_quota"],
    ["billing_hard_limit_reached", "requests"],
    ["project_spend_limit_exceeded", "requests"],
    [null, "insufficient_quota"],
  ])("plafond atteint (code %s, type %s) : AI_BUDGET_EXHAUSTED immédiat, journalisé", async (code, type) => {
    const read = captureLogs();
    const deps = fakeDeps(providerError(429, code, type));
    const error = await expectAiError(embed(["Bonjour"], { deps }), "AI_BUDGET_EXHAUSTED");
    expect(error.retryable).toBe(false);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(read()).toContain("ai_budget_exhausted");
  });

  it("crédit prépayé épuisé (réponse réelle d'OpenAI) : AI_BUDGET_EXHAUSTED, message du fournisseur non journalisé", async () => {
    // Le plafond du tableau de bord est « Limit not enforced » : seul l'épuisement du crédit prépayé
    // bloque les appels, avec cette réponse (429, type et code insufficient_quota).
    const providerMessage =
      "You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.";
    const read = captureLogs();
    const deps = fakeDeps(
      json(429, { error: { message: providerMessage, type: "insufficient_quota", param: null, code: "insufficient_quota" } }),
    );
    const error = await expectAiError(embed(["Bonjour"], { deps }), "AI_BUDGET_EXHAUSTED");
    expect(error.retryable).toBe(false);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(deps.sleep).not.toHaveBeenCalled();
    expect(read()).toContain('"event":"ai_budget_exhausted"');
    expect(read()).toContain('"code":"insufficient_quota"');
    expect(read()).not.toContain("exceeded your current quota");
  });

  it("crédit épuisé pendant la vérification des modèles : AI_BUDGET_EXHAUSTED aussi", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps(providerError(429, "insufficient_quota", "insufficient_quota"));
    await expectAiError(checkModelAccess(["gpt-5.4-mini"], { deps }), "AI_BUDGET_EXHAUSTED");
  });

  it.each([400, 401, 403, 404])("refus %i (clé invalide, modèle refusé…) : AI_UNAVAILABLE sans nouvelle tentative", async (status) => {
    const read = captureLogs();
    const deps = fakeDeps(providerError(status, "invalid_api_key"));
    const error = await expectAiError(embed(["Bonjour"], { deps }), "AI_UNAVAILABLE");
    expect(error.retryable).toBe(false);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(read()).toContain("ai_provider_rejected");
  });

  it("clé absente : AI_UNAVAILABLE sans appel, journalisé", async () => {
    const read = captureLogs();
    const deps = { ...fakeDeps(), apiKey: undefined };
    await expectAiError(embed(["Bonjour"], { deps }), "AI_UNAVAILABLE");
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(read()).toContain("ai_key_missing");
  });

  it("délai dépassé : AI_TIMEOUT, sans nouvelle tentative", async () => {
    const read = captureLogs();
    const deps = fakeDeps();
    deps.fetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const error = await expectAiError(embed(["Bonjour"], { deps, timeoutMs: 20 }), "AI_TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(read()).toContain("ai_timeout");
  });

  it("journaux : ni la clé ni le texte envoyé, quelle que soit l'issue", async () => {
    const read = captureLogs();
    const secretText = "Texte confidentiel du Document";
    for (const response of [
      providerError(401, "invalid_api_key"),
      providerError(429, "insufficient_quota", "insufficient_quota"),
      embeddingsResponse(1, 12),
    ]) {
      await embed([secretText], { deps: fakeDeps(response) }).catch(() => {});
    }
    await embed([secretText], { deps: fakeDeps(providerError(500, null), providerError(500, null), providerError(500, null)) }).catch(() => {});
    expect(read()).not.toContain(FAKE_KEY);
    expect(read()).not.toContain(secretText);
  });
});

describe("checkModelAccess", () => {
  it("modèle accessible : true ; inconnu ou refusé au projet (404) : false ; appel sans coût (GET)", async () => {
    const deps = fakeDeps(json(200, { id: "gpt-5.4-mini", object: "model" }), providerError(404, "model_not_found"));
    expect(await checkModelAccess(["gpt-5.4-mini", "modele-absent"], { deps })).toEqual({
      "gpt-5.4-mini": true,
      "modele-absent": false,
    });
    const [url, init] = deps.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/models/gpt-5.4-mini");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("clé invalide : erreur, pas un simple « false »", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expectAiError(checkModelAccess(["gpt-5.4-mini"], { deps: fakeDeps(providerError(401, "invalid_api_key")) }), "AI_UNAVAILABLE");
  });
});

// Story 5.8 (AD-12) : reformulation d'une question de suivi, même modèle que la génération, sortie
// d'une ligne de 1 à 2 000 caractères, délai de 10 s pour l'appel entier ; échec rendu en AI_TIMEOUT ou
// AI_UNAVAILABLE, réessayable.
describe("rewriteFollowUp", () => {
  const MESSAGES = [
    { role: "system" as const, content: "Consignes de reformulation." },
    { role: "user" as const, content: "Question confidentielle" },
  ];
  const completion = (content: unknown, finishReason = "stop") =>
    json(200, {
      model: "gpt-5.4-mini-2026-03-17",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
      usage: { prompt_tokens: 50, completion_tokens: 12 },
    });
  const depsOf = (...responses: Response[]) => {
    const queue = [...responses];
    return {
      apiKey: FAKE_KEY as AiDeps["apiKey"],
      sleep: vi.fn(async () => {}),
      fetch: vi.fn<typeof fetch>(async () => queue.shift() ?? json(500, {})),
    };
  };
  const failure = async (promise: Promise<unknown>) => {
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiError);
    return error as AiError;
  };

  it("sortie valide : même modèle, raisonnement et échantillonnage que la génération, sortie bornée, question normalisée sur une ligne", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = depsOf(completion("  Qui valide une facture\n au-delà de 10 000 euros ?  "));
    const result = await rewriteFollowUp(MESSAGES, { deps });
    expect(result.question).toBe("Qui valide une facture au-delà de 10 000 euros ?");
    expect(result.usage).toEqual({ inputTokens: 50, outputTokens: 12 });
    expect(JSON.parse(String(deps.fetch.mock.calls[0][1]?.body))).toEqual({
      model: DEFAULT_GENERATION_MODEL,
      messages: MESSAGES,
      reasoning_effort: "none",
      max_completion_tokens: REWRITE_MAX_COMPLETION_TOKENS,
      ...GENERATION_SAMPLING,
    });
    expect(REWRITE_TIMEOUT_MS).toBe(10_000);
  });

  it("2 000 caractères acceptés ; vide, plus de 2 000, tronquée ou filtrée : AI_UNAVAILABLE réessayable, sans texte journalisé", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await rewriteFollowUp(MESSAGES, { deps: depsOf(completion("x".repeat(2_000))) })).question).toHaveLength(2_000);
    for (const response of [completion(" \n "), completion("x".repeat(2_001)), completion("Qui", "length"), completion("Qui", "content_filter"), completion(null)]) {
      const error = await failure(rewriteFollowUp(MESSAGES, { deps: depsOf(response) }));
      expect(error.code).toBe("AI_UNAVAILABLE");
      expect(error.retryable).toBe(true);
    }
    expect(logs.mock.calls.flat().map(String).join(" ")).not.toContain("confidentielle");
  });

  it("panne (5xx répétés, refus 4xx) : AI_UNAVAILABLE réessayable, aucune réponse (no_response) ; une seule nouvelle tentative", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = depsOf(json(503, {}), json(503, {}), completion("jamais lue"));
    const unavailable = await failure(rewriteFollowUp(MESSAGES, { deps }));
    expect(unavailable).toMatchObject({ code: "AI_UNAVAILABLE", retryable: true, outcome: "no_response" });
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    const rejected = await failure(rewriteFollowUp(MESSAGES, { deps: depsOf(providerError(400, "invalid_request")) }));
    expect(rejected).toMatchObject({ code: "AI_UNAVAILABLE", retryable: true, outcome: "no_response" });
  });

  it("plafond du fournisseur : AI_BUDGET_EXHAUSTED non réessayable, comme la génération ; aucune réponse (no_response)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = depsOf(providerError(429, "insufficient_quota", "insufficient_quota"));
    const error = await failure(rewriteFollowUp(MESSAGES, { deps }));
    expect(error).toMatchObject({ code: "AI_BUDGET_EXHAUSTED", retryable: false, outcome: "no_response" });
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });

  it("issue pour la règle de libération : sortie reçue inexploitable → response_received ; délai pendant une requête envoyée → timeout ; délai pendant l'attente avant la nouvelle tentative → no_response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await failure(rewriteFollowUp(MESSAGES, { deps: depsOf(completion("x".repeat(2_001))) }))).outcome).toBe("response_received");
    expect((await failure(rewriteFollowUp(MESSAGES, { deps: depsOf(completion("Qui", "length")) }))).outcome).toBe("response_received");
    const hanging = {
      apiKey: FAKE_KEY as AiDeps["apiKey"],
      sleep: vi.fn(async () => {}),
      fetch: vi.fn<typeof fetch>((_, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("interrompu", "AbortError"))))),
    };
    expect(await failure(rewriteFollowUp(MESSAGES, { deps: hanging, timeoutMs: 50 }))).toMatchObject({ code: "AI_TIMEOUT", outcome: "timeout" });
    const waiting = { ...depsOf(json(503, {})), sleep: () => new Promise<void>(() => {}) };
    expect(await failure(rewriteFollowUp(MESSAGES, { deps: waiting, timeoutMs: 50 }))).toMatchObject({ code: "AI_TIMEOUT", outcome: "no_response" });
  });

  it("délai pour l'appel entier, nouvelles tentatives comprises : AI_TIMEOUT, appel en cours interrompu", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let aborted = false;
    const deps = {
      apiKey: FAKE_KEY as AiDeps["apiKey"],
      // Attente entre tentatives immédiate, première tentative en 503 aussitôt : la seconde part à coup sûr
      // avant l'échéance de 150 ms, même sous charge (minuteries réelles retardées dans la suite complète).
      sleep: () => Promise.resolve(),
      fetch: vi.fn<typeof fetch>(
        (_, init) =>
          new Promise((resolve, reject) => {
            // Première tentative : 503 immédiat ; la seconde ne répond jamais.
            if (vi.mocked(deps.fetch).mock.calls.length === 1) resolve(json(503, {}));
            init?.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new DOMException("interrompu", "AbortError"));
            });
          }),
      ),
    };
    const started = Date.now();
    const error = await failure(rewriteFollowUp(MESSAGES, { deps, timeoutMs: 150 }));
    expect(error.code).toBe("AI_TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(Date.now() - started).toBeLessThan(150 + 100);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    expect(aborted).toBe(true);
  });
});
