// Seul point d'appel à OpenAI (AD-3) : fetch, sans SDK. Centralise modèles, délais, nouvelles
// tentatives et traduction des erreurs. La clé OPENAI_API_KEY n'est lue qu'ici, dans les secrets
// Supabase ; elle n'est jamais journalisée ni renvoyée, et aucun texte envoyé n'est journalisé.
import {
  AI_MAX_RETRIES,
  AI_RETRY_BASE_DELAY_MS,
  GENERATION_MAX_RETRIES,
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL,
  EMBEDDING_TIMEOUT_MS,
  EMBEDDING_VERSION,
  GENERATION_MAX_COMPLETION_TOKENS,
  GENERATION_REASONING_EFFORT,
  GENERATION_SAMPLING,
  GENERATION_TIMEOUT_MS,
  generationModel,
  MODEL_CHECK_TIMEOUT_MS,
  CHAT_MAX_QUESTION_LENGTH,
  REWRITE_MAX_COMPLETION_TOKENS,
  REWRITE_TIMEOUT_MS,
  REFUSAL_MAX_COMPLETION_TOKENS,
  OPENAI_BASE_URL,
  SUMMARY_MAX_COMPLETION_TOKENS,
  SUMMARY_MAX_POINTS,
  SUMMARY_POINT_MAX_LENGTH,
  SUMMARY_TIMEOUT_MS,
  readEnv,
} from "./config.ts";
import { AiError, logEvent } from "./errors.ts";
import type { ChatMessage } from "./rag/prompt.ts";

// Dépendances injectables : le fournisseur est simulé dans les tests unitaires.
export type AiDeps = {
  fetch: typeof fetch;
  apiKey: string | undefined;
  sleep: (ms: number) => Promise<void>;
};

function defaultDeps(): AiDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    apiKey: readEnv("OPENAI_API_KEY"),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export type AiOptions = { deps?: Partial<AiDeps>; timeoutMs?: number };

// Refus du plafond de dépense : plus aucun appel ne passera, inutile de réessayer (AD-15).
const BUDGET_ERROR_CODES = new Set(["insufficient_quota", "billing_hard_limit_reached", "project_spend_limit_exceeded"]);

type RequestSpec = {
  operation: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  timeoutMs: number;
  // Statut traité comme une réponse attendue (ex. 404 pour un modèle inaccessible).
  acceptStatus?: number;
  // Nouvelles tentatives propres à l'opération ; par défaut AI_MAX_RETRIES, y compris sur erreur réseau.
  retry?: RetryPolicy;
};

// maxRetries : nouvelles tentatives sur 429 (hors plafond) et 5xx reçus. onNetworkError : réessayer
// aussi après une erreur réseau (requête peut-être reçue et facturée par le fournisseur).
export type RetryPolicy = { maxRetries: number; onNetworkError: boolean };

const DEFAULT_RETRY: RetryPolicy = { maxRetries: AI_MAX_RETRIES, onNetworkError: true };
// Génération (story 5.2a-2) : une seule nouvelle tentative, jamais après une erreur réseau.
export const GENERATION_RETRY: RetryPolicy = { maxRetries: GENERATION_MAX_RETRIES, onNetworkError: false };

// Nom de paramètre renvoyé par le fournisseur (ex. « temperature ») : gardé seulement s'il a la forme
// d'un nom de champ court, pour ne jamais recopier de texte libre.
const PARAM_NAME = /^[A-Za-z0-9_.[\]]{1,64}$/;

async function providerError(response: Response): Promise<{ code?: string; type?: string; param?: string }> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; type?: unknown; param?: unknown } };
    const code = typeof body.error?.code === "string" ? body.error.code : undefined;
    const type = typeof body.error?.type === "string" ? body.error.type : undefined;
    const param = typeof body.error?.param === "string" && PARAM_NAME.test(body.error.param) ? body.error.param : undefined;
    return { code, type, param };
  } catch {
    return {};
  }
}

// Réponse en échec du fournisseur : plafond (AI_BUDGET_EXHAUSTED) et autres refus définitifs levés ;
// 429 hors plafond et 5xx : raison de la nouvelle tentative.
async function rejectedStatus(response: Response, operation: string, attempt: number): Promise<string> {
  const { code, type, param } = await providerError(response);
  const details = { operation, status: response.status, code: code ?? type, param, attempt };
  if (response.status === 429 && (BUDGET_ERROR_CODES.has(code ?? "") || BUDGET_ERROR_CODES.has(type ?? ""))) {
    logEvent("ai_budget_exhausted", details);
    throw new AiError("AI_BUDGET_EXHAUSTED", false, "plafond du fournisseur atteint", code ?? type, undefined, "no_response");
  }
  if (response.status !== 429 && response.status < 500) {
    logEvent("ai_provider_rejected", details);
    throw new AiError("AI_UNAVAILABLE", false, `refus du fournisseur (${response.status})`, code ?? type, param, "no_response");
  }
  return `status_${response.status}`;
}

// Appel au fournisseur : délai par tentative, nouvelles tentatives selon spec.retry (par défaut 2,
// sur 429 hors plafond, 5xx et erreur réseau) ; tout autre refus est définitif. Renvoie le corps
// JSON, ou null pour acceptStatus. Chaque AiError porte l'issue de l'appel (outcome) : aucune
// réponse, réponse reçue (facturée) ou délai dépassé après envoi.
async function callProvider(spec: RequestSpec, deps: AiDeps): Promise<unknown> {
  if (!deps.apiKey) {
    logEvent("ai_key_missing", { operation: spec.operation });
    throw new AiError("AI_UNAVAILABLE", false, "OPENAI_API_KEY absente", undefined, undefined, "no_response");
  }
  const retry = spec.retry ?? DEFAULT_RETRY;

  for (let attempt = 0; ; attempt += 1) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), spec.timeoutMs);
    let retryReason: string;
    try {
      const response = await deps.fetch(`${OPENAI_BASE_URL}${spec.path}`, {
        method: spec.method,
        headers: {
          Authorization: `Bearer ${deps.apiKey}`,
          ...(spec.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
        signal: controller.signal,
      });
      if (response.ok) {
        // Réponse reçue (et payée) mais illisible : jamais réessayée comme une panne réseau.
        try {
          return await response.json();
        } catch {
          logEvent("ai_output_invalid", { operation: spec.operation, reason: "json" });
          throw new AiError("AI_OUTPUT_INVALID", false, "réponse illisible", undefined, undefined, "response_received");
        }
      }
      if (response.status === spec.acceptStatus) return null;
      retryReason = await rejectedStatus(response, spec.operation, attempt);
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (controller.signal.aborted) {
        logEvent("ai_timeout", { operation: spec.operation, attempt, duration_ms: Date.now() - started });
        throw new AiError("AI_TIMEOUT", true, "délai dépassé", undefined, undefined, "timeout");
      }
      retryReason = "network";
    } finally {
      clearTimeout(timer);
    }

    if (attempt >= retry.maxRetries || (retryReason === "network" && !retry.onNetworkError)) {
      logEvent("ai_unavailable", { operation: spec.operation, reason: retryReason, attempts: attempt + 1 });
      throw new AiError("AI_UNAVAILABLE", true, "fournisseur indisponible", undefined, undefined, "no_response");
    }
    await deps.sleep(AI_RETRY_BASE_DELAY_MS * 2 ** attempt);
  }
}

export type EmbeddingResult = { vectors: number[][]; model: string; version: number };

function isValidVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === EMBEDDING_DIMENSION &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

// Vectorise des textes (AD-4) par lots de 96. Chaque vecteur est contrôlé (1 536 nombres finis) et
// l'ordre des textes est conservé. Un écart de dimension est refusé : AI_OUTPUT_INVALID.
export async function embed(texts: string[], options: AiOptions = {}): Promise<EmbeddingResult> {
  if (!Array.isArray(texts) || texts.some((text) => typeof text !== "string" || text.trim() === "")) {
    throw new AiError("VALIDATION_FAILED", false, "texte à vectoriser vide ou invalide");
  }
  const deps = { ...defaultDeps(), ...options.deps };
  const timeoutMs = options.timeoutMs ?? EMBEDDING_TIMEOUT_MS;
  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const body = (await callProvider(
      {
        operation: "embed",
        path: "/embeddings",
        method: "POST",
        body: { model: EMBEDDING_MODEL, input: batch, encoding_format: "float" },
        timeoutMs,
      },
      deps,
    )) as { data?: { index?: unknown; embedding?: unknown }[] } | null;

    const data = Array.isArray(body?.data) ? [...body.data] : [];
    data.sort((a, b) => Number(a.index) - Number(b.index));
    const valid =
      data.length === batch.length && data.every((item, i) => item.index === i && isValidVector(item.embedding));
    if (!valid) {
      const first = data[0]?.embedding;
      logEvent("ai_embedding_invalid", {
        expected_count: batch.length,
        received_count: data.length,
        expected_dimension: EMBEDDING_DIMENSION,
        received_dimension: Array.isArray(first) ? first.length : undefined,
      });
      throw new AiError("AI_OUTPUT_INVALID", false, "vecteurs non conformes");
    }
    for (const item of data) vectors.push(item.embedding as number[]);
  }

  return { vectors, model: EMBEDDING_MODEL, version: EMBEDDING_VERSION };
}

export type GenerationResult = {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

// Génération d'une réponse, non diffusée (story 5.2a-1 ; mode JSON de chat, flux : streamAnswer) :
// Chat Completions, raisonnement désactivé, échantillonnage de GENERATION_SAMPLING, sortie bornée, une
// seule nouvelle tentative (GENERATION_RETRY, story 5.2a-2 : jamais après une erreur réseau). Une
// réponse vide, tronquée ou filtrée (finish_reason autre que « stop ») est invalide : aucun fait
// partiel n'est rendu. Ni les consignes ni la réponse ne sont journalisées.
export function generateAnswer(messages: ChatMessage[], options: AiOptions = {}): Promise<GenerationResult> {
  return complete("generate", messages, GENERATION_MAX_COMPLETION_TOKENS, options, false);
}

// Appel court sans Passage (story 5.3) : mêmes modèle, échantillonnage, raisonnement désactivé,
// nouvelles tentatives et contrôles que generateAnswer ; sortie bornée à REFUSAL_MAX_COMPLETION_TOKENS.
// Le marqueur est lu par l'appelant (marker.ts). Seule exception (décision de l'utilisateur du
// 2026-11-17) : une sortie coupée par la borne (finish_reason « length ») est acceptée si elle contient
// un saut de ligne, car la première ligne, seule lue, est alors complète ; le reste est ignoré.
export function classifyRefusal(messages: ChatMessage[], options: AiOptions = {}): Promise<GenerationResult> {
  return complete("classify_refusal", messages, REFUSAL_MAX_COMPLETION_TOKENS, options, true);
}

async function complete(
  operation: string,
  messages: ChatMessage[],
  maxCompletionTokens: number,
  options: AiOptions,
  // Accepte finish_reason « length » quand la première ligne est complète (appel court seulement).
  acceptTruncatedAfterFirstLine: boolean,
  // Champs ajoutés au corps de la requête (story 6.1 : response_format du Résumé).
  extraBody: Record<string, unknown> = {},
): Promise<GenerationResult> {
  const deps = { ...defaultDeps(), ...options.deps };
  const model = generationModel();
  const body = await callProvider(
    {
      operation,
      path: "/chat/completions",
      method: "POST",
      body: {
        model,
        messages,
        reasoning_effort: GENERATION_REASONING_EFFORT,
        max_completion_tokens: maxCompletionTokens,
        ...GENERATION_SAMPLING,
        ...extraBody,
      },
      timeoutMs: options.timeoutMs ?? GENERATION_TIMEOUT_MS,
      retry: GENERATION_RETRY,
    },
    deps,
  );

  const parsed = body as {
    model?: unknown;
    choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  } | null;
  const choice = Array.isArray(parsed?.choices) ? parsed.choices[0] : undefined;
  const text = typeof choice?.message?.content === "string" ? choice.message.content : "";
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "absent";
  checkOutput(operation, text, finishReason, typeof choice?.message?.refusal === "string", acceptTruncatedAfterFirstLine);
  return {
    text,
    model: typeof parsed?.model === "string" ? parsed.model : model,
    usage: { inputTokens: count(parsed?.usage?.prompt_tokens), outputTokens: count(parsed?.usage?.completion_tokens) },
  };
}

export type RewriteResult = GenerationResult & { question: string };

// Reformulation d'une question de suivi en question autonome (story 5.8, AD-12) : mêmes modèle,
// échantillonnage, raisonnement, nouvelles tentatives et contrôles de fin que generateAnswer (sortie
// vide, filtrée ou tronquée refusée) ; sortie normalisée sur une ligne (espaces réduits), 1 à 2 000
// caractères. Délai de timeoutMs (10 s par défaut) pour l'appel entier, nouvelles tentatives comprises.
// Échec rendu en AI_TIMEOUT (délai), AI_BUDGET_EXHAUSTED (plafond du fournisseur, non réessayable,
// comme la génération) ou AI_UNAVAILABLE réessayable (panne, sortie invalide), avec l'issue de l'appel
// (outcome) pour la règle de libération d'AD-14 appliquée par chat (décision de l'utilisateur du
// 2026-11-19) : aucune réponse → unité rendue ; réponse reçue inexploitable ou délai après envoi →
// unité consommée. Ni les consignes ni la question ne sont journalisées.
export async function rewriteFollowUp(messages: ChatMessage[], options: AiOptions = {}): Promise<RewriteResult> {
  const timeoutMs = options.timeoutMs ?? REWRITE_TIMEOUT_MS;
  const controller = new AbortController();
  // Requêtes envoyées au fournisseur et encore sans réponse : un délai qui tombe pendant l'une d'elles
  // est un délai après envoi ; pendant l'attente avant une nouvelle tentative, aucune réponse.
  let inFlight = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const outcome = inFlight > 0 ? "timeout" : "no_response";
      controller.abort();
      logEvent("ai_timeout", { operation: "rewrite_follow_up", duration_ms: timeoutMs, sent: outcome === "timeout" });
      reject(new AiError("AI_TIMEOUT", true, "délai de reformulation dépassé", undefined, undefined, outcome));
    }, timeoutMs);
  });
  const base = options.deps?.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const deps: Partial<AiDeps> = {
    ...options.deps,
    fetch: async (input, init) => {
      inFlight += 1;
      try {
        return await base(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
      } finally {
        inFlight -= 1;
      }
    },
  };
  try {
    const result = await Promise.race([
      complete("rewrite_follow_up", messages, REWRITE_MAX_COMPLETION_TOKENS, { deps, timeoutMs }, false),
      expired,
    ]);
    const question = result.text.replace(/\s+/g, " ").trim();
    if (question === "" || question.length > CHAT_MAX_QUESTION_LENGTH) {
      logEvent("ai_output_invalid", { operation: "rewrite_follow_up", reason: question === "" ? "empty" : "too_long", length: question.length });
      throw new AiError("AI_UNAVAILABLE", true, "reformulation inexploitable", undefined, undefined, "response_received");
    }
    return { ...result, question };
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    if (error.code === "AI_BUDGET_EXHAUSTED") throw error;
    if ((error.code === "AI_TIMEOUT" || error.code === "AI_UNAVAILABLE") && error.retryable) throw error;
    throw new AiError(
      error.code === "AI_TIMEOUT" ? "AI_TIMEOUT" : "AI_UNAVAILABLE",
      true,
      `reformulation en échec (${error.code})`,
      error.providerCode,
      error.providerParam,
      error.outcome,
    );
  } finally {
    clearTimeout(timer);
    expired.catch(() => {});
  }
}

// Résumé (story 6.1, AD-18, Q1 = A) : sortie JSON structurée, schéma { points: string[] } exigé du
// fournisseur ; les bornes (1 à 5 points, 400 caractères) sont contrôlées ici, strictement.
export const SUMMARY_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "resume",
    strict: true,
    schema: {
      type: "object",
      properties: { points: { type: "array", items: { type: "string" } } },
      required: ["points"],
      additionalProperties: false,
    },
  },
} as const;

// Lecture stricte de la sortie du Résumé : un objet JSON avec la seule clé « points », tableau de 1 à 5
// chaînes ; chaque point est remis sur une ligne (espaces réduits), non vide et de 400 caractères
// (points de code) au plus. Null si la sortie n'est pas conforme (rien n'est corrigé ni tronqué).
export function readSummaryOutput(text: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "points") return null;
  const points = (parsed as { points: unknown }).points;
  if (!Array.isArray(points) || points.length < 1 || points.length > SUMMARY_MAX_POINTS) return null;
  const cleaned: string[] = [];
  for (const point of points) {
    if (typeof point !== "string") return null;
    const line = point.replace(/\s+/g, " ").trim();
    if (line === "" || Array.from(line).length > SUMMARY_POINT_MAX_LENGTH) return null;
    cleaned.push(line);
  }
  return cleaned;
}

export type SummaryResult = Omit<GenerationResult, "text"> & { points: string[] };

// Résumé d'un Document (story 6.1, AD-7, AD-18) : un seul appel sur le texte entier, mêmes modèle,
// échantillonnage (temperature 0, seed), raisonnement et contrôles de fin que generateAnswer (sortie vide,
// tronquée, filtrée ou refus du modèle : AI_OUTPUT_INVALID), une seule nouvelle tentative sur 429 (hors
// plafond) et 5xx (GENERATION_RETRY, jamais après une erreur réseau). Sortie JSON lue strictement
// (readSummaryOutput) : non conforme → AI_OUTPUT_INVALID, réponse reçue. timeoutMs (120 s par défaut)
// borne l'appel entier, nouvelles tentatives comprises ; l'issue de l'échec (outcome) sert la règle de
// libération d'AD-14 appliquée par summarize : délai pendant une requête envoyée → « timeout » (unité
// consommée) ; pendant l'attente d'une nouvelle tentative ou avant tout envoi → « no_response » (rendue).
// Ni les consignes, ni le texte du Document, ni les points ne sont journalisés.
export async function summarize(messages: ChatMessage[], options: AiOptions = {}): Promise<SummaryResult> {
  const timeoutMs = options.timeoutMs ?? SUMMARY_TIMEOUT_MS;
  const controller = new AbortController();
  // Requêtes envoyées au fournisseur et encore sans réponse (même règle que rewriteFollowUp).
  let inFlight = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const outcome = inFlight > 0 ? "timeout" : "no_response";
      controller.abort();
      logEvent("ai_timeout", { operation: "summarize", duration_ms: timeoutMs, sent: outcome === "timeout" });
      reject(new AiError("AI_TIMEOUT", true, "délai du Résumé dépassé", undefined, undefined, outcome));
    }, timeoutMs);
  });
  const base = options.deps?.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const deps: Partial<AiDeps> = {
    ...options.deps,
    fetch: async (input, init) => {
      inFlight += 1;
      try {
        return await base(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
      } finally {
        inFlight -= 1;
      }
    },
  };
  try {
    const result = await Promise.race([
      complete("summarize", messages, SUMMARY_MAX_COMPLETION_TOKENS, { deps, timeoutMs }, false, {
        response_format: SUMMARY_RESPONSE_FORMAT,
      }),
      expired,
    ]);
    const points = readSummaryOutput(result.text);
    if (!points) {
      logEvent("ai_output_invalid", { operation: "summarize", reason: "summary_format" });
      throw new AiError("AI_OUTPUT_INVALID", true, "Résumé non conforme", undefined, undefined, "response_received");
    }
    return { points, model: result.model, usage: result.usage };
  } finally {
    clearTimeout(timer);
    expired.catch(() => {});
  }
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

// Sortie complète exigée : finish_reason « stop » (sauf exception de l'appel court) et texte non vide.
function checkOutput(
  operation: string,
  text: string,
  finishReason: string,
  refusal: boolean,
  acceptTruncatedAfterFirstLine: boolean,
): void {
  const firstLineComplete = acceptTruncatedAfterFirstLine && finishReason === "length" && text.includes("\n");
  if ((finishReason !== "stop" && !firstLineComplete) || text.trim() === "") {
    logEvent("ai_output_invalid", {
      operation,
      finish_reason: finishReason,
      empty: text.trim() === "",
      // Refus de sécurité du modèle : signalé, jamais son texte.
      refusal,
    });
    // Sortie tronquée ou filtrée : avec un échantillonnage fixe, la même demande redonnerait le même
    // résultat ; elle n'est donc pas réessayable.
    const deterministic = finishReason === "length" || finishReason === "content_filter";
    throw new AiError(
      "AI_OUTPUT_INVALID",
      !deterministic,
      `réponse inexploitable (${finishReason})`,
      undefined,
      undefined,
      "response_received",
    );
  }
}

export type StreamAnswerOptions = AiOptions & {
  // Délai jusqu'au premier morceau de texte ; timeoutMs borne l'appel entier. Les deux échéances
  // partent du début de l'appel : une nouvelle tentative ne reçoit que le temps restant.
  firstChunkTimeoutMs?: number;
  // Chaque morceau de texte reçu, dans l'ordre ; false arrête la lecture du fournisseur (refus ou
  // marqueur invalide reconnus par l'appelant).
  onText: (text: string) => boolean | void;
};

// stopped : lecture arrêtée par onText (texte partiel, non contrôlé) ; firstChunkMs : délai du premier
// morceau de texte depuis l'appel ; usage null si le fournisseur ne l'a pas transmis (lecture arrêtée
// avant son dernier morceau, par exemple après un refus) : inconnu, jamais compté à 0.
export type StreamResult = Omit<GenerationResult, "usage"> & {
  usage: GenerationResult["usage"] | null;
  stopped: boolean;
  firstChunkMs: number | null;
};

const STREAM_OPERATION = "generate_stream";

// Génération diffusée (story 5.5, AD-16) : mêmes modèle, échantillonnage, raisonnement et borne de
// sortie que generateAnswer, avec stream: true. Une seule nouvelle tentative sur 429 (hors plafond) ou
// 5xx reçus, donc avant le premier morceau ; aucune après une erreur réseau, un délai dépassé ou une
// réponse reçue. Lecture complète : mêmes contrôles que generateAnswer (finish_reason « stop », texte
// non vide). Ni les consignes ni le texte ne sont journalisés.
export async function streamAnswer(messages: ChatMessage[], options: StreamAnswerOptions): Promise<StreamResult> {
  const deps = { ...defaultDeps(), ...options.deps };
  if (!deps.apiKey) {
    logEvent("ai_key_missing", { operation: STREAM_OPERATION });
    throw new AiError("AI_UNAVAILABLE", false, "OPENAI_API_KEY absente", undefined, undefined, "no_response");
  }
  const model = generationModel();
  const totalMs = options.timeoutMs ?? GENERATION_TIMEOUT_MS;
  const firstMs = Math.min(options.firstChunkTimeoutMs ?? totalMs, totalMs);
  const body = JSON.stringify({
    model,
    messages,
    reasoning_effort: GENERATION_REASONING_EFFORT,
    max_completion_tokens: GENERATION_MAX_COMPLETION_TOKENS,
    ...GENERATION_SAMPLING,
    stream: true,
    stream_options: { include_usage: true },
  });
  const started = Date.now();

  for (let attempt = 0; ; attempt += 1) {
    const attemptStarted = Date.now();
    const elapsed = Date.now() - started;
    if (elapsed >= firstMs) {
      // Échéance atteinte pendant l'attente avant une nouvelle tentative : aucune réponse reçue.
      logEvent("ai_timeout", { operation: STREAM_OPERATION, attempt, received: false, duration_ms: elapsed });
      throw new AiError("AI_TIMEOUT", true, "délai dépassé", undefined, undefined, "no_response");
    }
    const controller = new AbortController();
    const total = setTimeout(() => controller.abort(), totalMs - elapsed);
    const first = setTimeout(() => controller.abort(), firstMs - elapsed);
    let received = false;
    let retryReason: string;
    try {
      const response = await deps.fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (response.ok) {
        received = true;
        if (!response.body) {
          logEvent("ai_output_invalid", { operation: STREAM_OPERATION, reason: "body" });
          throw new AiError("AI_OUTPUT_INVALID", false, "flux absent", undefined, undefined, "response_received");
        }
        return await readCompletionStream(response.body, model, started, () => clearTimeout(first), options.onText);
      }
      retryReason = await rejectedStatus(response, STREAM_OPERATION, attempt);
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (controller.signal.aborted) {
        logEvent("ai_timeout", { operation: STREAM_OPERATION, attempt, received, duration_ms: Date.now() - attemptStarted });
        throw new AiError("AI_TIMEOUT", true, "délai dépassé", undefined, undefined, "timeout");
      }
      if (received) {
        // Flux coupé après la réponse du fournisseur : génération facturée, jamais réessayée.
        logEvent("ai_stream_interrupted", { operation: STREAM_OPERATION, attempt });
        throw new AiError("AI_UNAVAILABLE", true, "flux interrompu", undefined, undefined, "response_received");
      }
      retryReason = "network";
    } finally {
      clearTimeout(total);
      clearTimeout(first);
    }

    if (attempt >= GENERATION_RETRY.maxRetries || (retryReason === "network" && !GENERATION_RETRY.onNetworkError)) {
      logEvent("ai_unavailable", { operation: STREAM_OPERATION, reason: retryReason, attempts: attempt + 1 });
      throw new AiError("AI_UNAVAILABLE", true, "fournisseur indisponible", undefined, undefined, "no_response");
    }
    await deps.sleep(AI_RETRY_BASE_DELAY_MS * 2 ** attempt);
  }
}

type StreamChunk = {
  model?: unknown;
  error?: unknown;
  choices?: { delta?: { content?: unknown; refusal?: unknown }; finish_reason?: unknown }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } | null;
};

// Lecture du flux SSE du fournisseur (lignes « data: {…} », puis « data: [DONE] »).
async function readCompletionStream(
  body: ReadableStream<Uint8Array>,
  requestedModel: string,
  started: number,
  onFirstChunk: () => void,
  onText: (text: string) => boolean | void,
): Promise<StreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let model = requestedModel;
  let usage: GenerationResult["usage"] | null = null;
  let finishReason = "absent";
  let refusal = false;
  let firstChunkMs: number | null = null;
  let stopped = false;
  let finished = false;

  const readLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice("data:".length).trim();
    if (data === "[DONE]") {
      finished = true;
      return;
    }
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(data) as StreamChunk;
    } catch {
      logEvent("ai_output_invalid", { operation: STREAM_OPERATION, reason: "json" });
      throw new AiError("AI_OUTPUT_INVALID", false, "morceau illisible", undefined, undefined, "response_received");
    }
    if (chunk.error !== undefined && chunk.error !== null) {
      logEvent("ai_stream_interrupted", { operation: STREAM_OPERATION, reason: "provider_error" });
      throw new AiError("AI_UNAVAILABLE", true, "erreur dans le flux", undefined, undefined, "response_received");
    }
    if (typeof chunk.model === "string") model = chunk.model;
    if (chunk.usage) {
      usage = { inputTokens: count(chunk.usage.prompt_tokens), outputTokens: count(chunk.usage.completion_tokens) };
    }
    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
    if (typeof choice?.delta?.refusal === "string") refusal = true;
    if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
    const content = choice?.delta?.content;
    if (typeof content === "string" && content !== "") {
      if (firstChunkMs === null) {
        firstChunkMs = Date.now() - started;
        onFirstChunk();
      }
      text += content;
      if (onText(content) === false) stopped = true;
    }
  };

  try {
    while (!stopped && !finished) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (!stopped && !finished && newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        readLine(line);
        newline = buffer.indexOf("\n");
      }
      if (done) {
        if (!stopped && !finished && buffer.trim() !== "") readLine(buffer.replace(/\r$/, ""));
        break;
      }
    }
  } finally {
    // Refus reconnu, fin ou erreur : la lecture du fournisseur est arrêtée.
    await reader.cancel().catch(() => {});
  }

  if (!stopped) checkOutput(STREAM_OPERATION, text, finishReason, refusal, false);
  return { text, model, usage, stopped, firstChunkMs };
}

// Accès du projet aux modèles, sans coût (GET /models/{id}) : true si le modèle est accessible,
// false s'il est inconnu ou refusé au projet (404).
export async function checkModelAccess(models: string[], options: AiOptions = {}): Promise<Record<string, boolean>> {
  const deps = { ...defaultDeps(), ...options.deps };
  const access: Record<string, boolean> = {};
  for (const model of models) {
    const body = await callProvider(
      {
        operation: "check_model",
        path: `/models/${encodeURIComponent(model)}`,
        method: "GET",
        timeoutMs: options.timeoutMs ?? MODEL_CHECK_TIMEOUT_MS,
        acceptStatus: 404,
      },
      deps,
    );
    access[model] = body !== null && (body as { id?: unknown }).id === model;
  }
  return access;
}
