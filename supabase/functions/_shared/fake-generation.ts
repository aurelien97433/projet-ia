// Génération simulée de la pile locale (story 5.2a-2) : aucun appel à OpenAI dans les tests
// d'intégration de chat. Elle passe par generateAnswer (_shared/ai.ts), dont les contrôles restent
// appliqués, avec un fetch simulé. Même garde-fou que la vectorisation simulée : active seulement si
// GENERATION_FAKE=1 ET si SUPABASE_URL vise l'hôte local ; ailleurs, rejetée et journalisée.
import type { AiDeps } from "./ai.ts";
import { readEnv } from "./config.ts";
import { logEvent, logInfo } from "./errors.ts";
import { isLocalStack } from "./fake-embeddings.ts";

// Question qui contient ce repère : réponse simulée sans aucune citation (cas AI_CITATIONS_INVALID).
export const FAKE_NO_CITATION_MARKER = "[simulation:sans-citation]";

// Réponse simulée : cite P1 (et P2 s'il existe), sauf si la question demande une réponse sans citation.
export function fakeAnswer(userMessage: string): string {
  const passages = (userMessage.match(/<passage id="P\d+"/g) ?? []).length;
  if (passages === 0 || userMessage.includes(FAKE_NO_CITATION_MARKER)) return "Réponse simulée, sans citation.";
  return passages >= 2
    ? "Réponse simulée à partir des Documents [P1]. Second point simulé [P2]."
    : "Réponse simulée à partir des Documents [P1].";
}

const fakeFetch: typeof fetch = (_input, init) => {
  const { messages } = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
  const user = messages.find((message) => message.role === "user")?.content ?? "";
  return Promise.resolve(
    Response.json({
      model: "simulation",
      choices: [{ index: 0, message: { role: "assistant", content: fakeAnswer(user) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    }),
  );
};

// Dépendances de generateAnswer : simulées seulement si GENERATION_FAKE=1 sur la pile locale.
export function generationDeps(): Partial<AiDeps> | undefined {
  if (readEnv("GENERATION_FAKE") !== "1") return undefined;
  if (!isLocalStack()) {
    logEvent("generation_fake_rejected", { reason: "not_local_stack" });
    return undefined;
  }
  logInfo("generation_fake_active", {});
  return { fetch: fakeFetch, apiKey: "simulation" };
}
