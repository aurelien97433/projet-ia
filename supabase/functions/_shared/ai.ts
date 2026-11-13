// Seul point d'appel à OpenAI (AD-3) : fetch, sans SDK. Centralise modèles, délais, nouvelles
// tentatives et traduction des erreurs. La clé OPENAI_API_KEY n'est lue qu'ici, dans les secrets
// Supabase ; elle n'est jamais journalisée ni renvoyée, et aucun texte envoyé n'est journalisé.
import {
  AI_MAX_RETRIES,
  AI_RETRY_BASE_DELAY_MS,
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
  OPENAI_BASE_URL,
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
};

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

// Appel au fournisseur : délai par tentative, 2 nouvelles tentatives sur 429 (hors plafond), 5xx
// et erreur réseau ; tout autre refus est définitif. Renvoie le corps JSON, ou null pour acceptStatus.
async function callProvider(spec: RequestSpec, deps: AiDeps): Promise<unknown> {
  if (!deps.apiKey) {
    logEvent("ai_key_missing", { operation: spec.operation });
    throw new AiError("AI_UNAVAILABLE", false, "OPENAI_API_KEY absente");
  }

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
          throw new AiError("AI_OUTPUT_INVALID", false, "réponse illisible");
        }
      }
      if (response.status === spec.acceptStatus) return null;

      const { code, type, param } = await providerError(response);
      const details = { operation: spec.operation, status: response.status, code: code ?? type, param, attempt };
      if (response.status === 429 && (BUDGET_ERROR_CODES.has(code ?? "") || BUDGET_ERROR_CODES.has(type ?? ""))) {
        logEvent("ai_budget_exhausted", details);
        throw new AiError("AI_BUDGET_EXHAUSTED", false, "plafond du fournisseur atteint", code ?? type);
      }
      if (response.status !== 429 && response.status < 500) {
        logEvent("ai_provider_rejected", details);
        throw new AiError("AI_UNAVAILABLE", false, `refus du fournisseur (${response.status})`, code ?? type, param);
      }
      retryReason = `status_${response.status}`;
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (controller.signal.aborted) {
        logEvent("ai_timeout", { operation: spec.operation, attempt, duration_ms: Date.now() - started });
        throw new AiError("AI_TIMEOUT", true, "délai dépassé");
      }
      retryReason = "network";
    } finally {
      clearTimeout(timer);
    }

    if (attempt >= AI_MAX_RETRIES) {
      logEvent("ai_unavailable", { operation: spec.operation, reason: retryReason, attempts: attempt + 1 });
      throw new AiError("AI_UNAVAILABLE", true, "fournisseur indisponible");
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

// Génération d'une réponse, non diffusée (story 5.2a-1 ; la diffusion arrive en 5.5) : Chat
// Completions, raisonnement désactivé, échantillonnage de GENERATION_SAMPLING, sortie bornée. Une
// réponse vide, tronquée ou filtrée (finish_reason autre que « stop ») est invalide : aucun fait
// partiel n'est rendu. Ni les consignes ni la réponse ne sont journalisées.
export async function generateAnswer(messages: ChatMessage[], options: AiOptions = {}): Promise<GenerationResult> {
  const deps = { ...defaultDeps(), ...options.deps };
  const model = generationModel();
  const body = await callProvider(
    {
      operation: "generate",
      path: "/chat/completions",
      method: "POST",
      body: {
        model,
        messages,
        reasoning_effort: GENERATION_REASONING_EFFORT,
        max_completion_tokens: GENERATION_MAX_COMPLETION_TOKENS,
        ...GENERATION_SAMPLING,
      },
      timeoutMs: options.timeoutMs ?? GENERATION_TIMEOUT_MS,
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
  if (finishReason !== "stop" || text.trim() === "") {
    logEvent("ai_output_invalid", {
      operation: "generate",
      finish_reason: finishReason,
      empty: text.trim() === "",
      // Refus de sécurité du modèle : signalé, jamais son texte.
      refusal: typeof choice?.message?.refusal === "string",
    });
    // Sortie tronquée ou filtrée : avec un échantillonnage fixe, la même demande redonnerait le même
    // résultat ; elle n'est donc pas réessayable.
    const deterministic = finishReason === "length" || finishReason === "content_filter";
    throw new AiError("AI_OUTPUT_INVALID", !deterministic, `réponse inexploitable (${finishReason})`);
  }
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return {
    text,
    model: typeof parsed?.model === "string" ? parsed.model : model,
    usage: { inputTokens: count(parsed?.usage?.prompt_tokens), outputTokens: count(parsed?.usage?.completion_tokens) },
  };
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
