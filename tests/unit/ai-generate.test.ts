import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAnswer, type AiDeps } from "../../supabase/functions/_shared/ai.ts";
import {
  AI_MAX_RETRIES,
  DEFAULT_GENERATION_MODEL,
  GENERATION_MAX_COMPLETION_TOKENS,
  GENERATION_SAMPLING,
  GENERATION_TIMEOUT_MS,
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

  it(`503 répétés : ${AI_MAX_RETRIES} nouvelles tentatives, puis AI_UNAVAILABLE réessayable`, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps(...Array.from({ length: AI_MAX_RETRIES + 1 }, () => providerError(503, null, "server_error")));
    const error = await aiError(generateAnswer(MESSAGES, { deps }));
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
    expect(deps.fetch).toHaveBeenCalledTimes(AI_MAX_RETRIES + 1);
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
