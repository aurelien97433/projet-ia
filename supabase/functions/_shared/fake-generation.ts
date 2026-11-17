// Génération simulée de la pile locale (story 5.2a-2) : aucun appel à OpenAI dans les tests
// d'intégration de chat. Elle passe par generateAnswer et classifyRefusal (_shared/ai.ts), dont les
// contrôles restent appliqués, avec un fetch simulé. Même garde-fou que la vectorisation simulée :
// active seulement si GENERATION_FAKE=1 ET si SUPABASE_URL vise l'hôte local ; ailleurs, rejetée et
// journalisée. Story 5.3 : sortie précédée du marqueur (AD-10), repères de test pour les refus et le
// marqueur invalide, appel court simulé.
import type { AiDeps } from "./ai.ts";
import { readEnv } from "./config.ts";
import { logEvent, logInfo } from "./errors.ts";
import { isLocalStack } from "./fake-embeddings.ts";
import { REFUSAL_SYSTEM_PROMPT } from "./rag/prompt.ts";

// Repères placés dans la question (texte neutralisé dans les consignes, sans chevron ni esperluette) :
// réponse simulée sans aucune citation (cas AI_CITATIONS_INVALID).
export const FAKE_NO_CITATION_MARKER = "[simulation:sans-citation]";
// Refus « information absente » malgré des Passages (texte du modèle ignoré par chat).
export const FAKE_INFO_ABSENTE_MARKER = "[simulation:info-absente]";
// Refus « hors cadre » : avec Passages, et pour l'appel court sans Passage.
export const FAKE_HORS_CADRE_MARKER = "[simulation:hors-cadre]";
// Marqueur invalide (« REPONSE : … » avec Passages, « REPONSE » à l'appel court) : AI_OUTPUT_INVALID.
export const FAKE_INVALID_MARKER = "[simulation:marqueur-invalide]";

// Texte du modèle simulé après un marqueur de refus : jamais affiché ni enregistré.
export const FAKE_IGNORED_TEXT = "Texte simulé du modèle, à ignorer.";

const QUESTION_PREFIX = "Question du Collaborateur : ";

// Repères lus dans la question seule (après QUESTION_PREFIX), jamais dans un Passage : un Passage
// d'un autre test retrouvé par la Recherche ne déclenche donc jamais un repère.
function questionOf(userMessage: string): string {
  const index = userMessage.lastIndexOf(QUESTION_PREFIX);
  return index === -1 ? userMessage : userMessage.slice(index + QUESTION_PREFIX.length);
}

// Réponse simulée : marqueur en première ligne, puis cite P1 (et P2 s'il existe), sauf repère contraire.
export function fakeAnswer(userMessage: string): string {
  const passages = (userMessage.match(/<passage id="P\d+"/g) ?? []).length;
  const question = questionOf(userMessage);
  if (question.includes(FAKE_INVALID_MARKER)) return "REPONSE : réponse simulée [P1].";
  if (question.includes(FAKE_INFO_ABSENTE_MARKER)) return `REFUS_INFO_ABSENTE\n${FAKE_IGNORED_TEXT}`;
  if (question.includes(FAKE_HORS_CADRE_MARKER)) return `REFUS_HORS_CADRE\n${FAKE_IGNORED_TEXT}`;
  if (passages === 0 || question.includes(FAKE_NO_CITATION_MARKER)) return "REPONSE\nRéponse simulée, sans citation.";
  return passages >= 2
    ? "REPONSE\nRéponse simulée à partir des Documents [P1]. Second point simulé [P2]."
    : "REPONSE\nRéponse simulée à partir des Documents [P1].";
}

// Appel court simulé : hors cadre si la question porte le repère, sinon information absente.
export function fakeRefusal(userMessage: string): string {
  const question = questionOf(userMessage);
  if (question.includes(FAKE_INVALID_MARKER)) return "REPONSE";
  return question.includes(FAKE_HORS_CADRE_MARKER) ? "REFUS_HORS_CADRE" : "REFUS_INFO_ABSENTE";
}

const fakeFetch: typeof fetch = (_input, init) => {
  const { messages } = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const user = messages.find((message) => message.role === "user")?.content ?? "";
  const content = system === REFUSAL_SYSTEM_PROMPT ? fakeRefusal(user) : fakeAnswer(user);
  return Promise.resolve(
    Response.json({
      model: "simulation",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    }),
  );
};

// Dépendances de generateAnswer et classifyRefusal : simulées seulement si GENERATION_FAKE=1 sur la
// pile locale.
export function generationDeps(): Partial<AiDeps> | undefined {
  if (readEnv("GENERATION_FAKE") !== "1") return undefined;
  if (!isLocalStack()) {
    logEvent("generation_fake_rejected", { reason: "not_local_stack" });
    return undefined;
  }
  logInfo("generation_fake_active", {});
  return { fetch: fakeFetch, apiKey: "simulation" };
}
