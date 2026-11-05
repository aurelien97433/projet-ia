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
  MODEL_CHECK_TIMEOUT_MS,
  OPENAI_BASE_URL,
  readEnv,
} from "./config.ts";
import { AiError, logEvent } from "./errors.ts";

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

async function providerError(response: Response): Promise<{ code?: string; type?: string }> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; type?: unknown } };
    const code = typeof body.error?.code === "string" ? body.error.code : undefined;
    const type = typeof body.error?.type === "string" ? body.error.type : undefined;
    return { code, type };
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
      if (response.ok) return await response.json();
      if (response.status === spec.acceptStatus) return null;

      const { code, type } = await providerError(response);
      const details = { operation: spec.operation, status: response.status, code: code ?? type, attempt };
      if (response.status === 429 && (BUDGET_ERROR_CODES.has(code ?? "") || BUDGET_ERROR_CODES.has(type ?? ""))) {
        logEvent("ai_budget_exhausted", details);
        throw new AiError("AI_BUDGET_EXHAUSTED", false, "plafond du fournisseur atteint");
      }
      if (response.status !== 429 && response.status < 500) {
        logEvent("ai_provider_rejected", details);
        throw new AiError("AI_UNAVAILABLE", false, `refus du fournisseur (${response.status})`);
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
