// Génération simulée de la pile locale (story 5.2a-2) : aucun appel à OpenAI dans les tests
// d'intégration de chat. Elle passe par generateAnswer et classifyRefusal (_shared/ai.ts), dont les
// contrôles restent appliqués, avec un fetch simulé. Même garde-fou que la vectorisation simulée :
// active seulement si GENERATION_FAKE=1 ET si SUPABASE_URL vise l'hôte local ; ailleurs, rejetée et
// journalisée. Story 5.3 : sortie précédée du marqueur (AD-10), repères de test pour les refus et le
// marqueur invalide, appel court simulé. Story 5.5 : avec stream: true, réponse diffusée en morceaux
// (marqueur et repères coupés), espacés avec FAKE_SLOW_STREAM_MARKER.
import type { AiDeps } from "./ai.ts";
import { readEnv } from "./config.ts";
import { logEvent, logInfo } from "./errors.ts";
import { isLocalStack } from "./fake-embeddings.ts";
import { REFUSAL_SYSTEM_PROMPT } from "./rag/prompt.ts";

// Repères placés dans la question (texte neutralisé dans les consignes, sans chevron ni esperluette) :
// réponse simulée sans aucune citation (cas AI_CITATIONS_INVALID).
export const FAKE_NO_CITATION_MARKER = "[simulation:sans-citation]";
// Story 5.4 : citation invalide [P9] à côté d'une citation valide [P1] (retirée du texte enregistré).
export const FAKE_INVALID_CITATION_MARKER = "[simulation:citation-invalide]";
// Refus « information absente » malgré des Passages (texte du modèle ignoré par chat).
export const FAKE_INFO_ABSENTE_MARKER = "[simulation:info-absente]";
// Refus « hors cadre » : avec Passages, et pour l'appel court sans Passage.
export const FAKE_HORS_CADRE_MARKER = "[simulation:hors-cadre]";
// Marqueur invalide (« REPONSE : … » avec Passages, « REPONSE » à l'appel court) : AI_OUTPUT_INVALID.
export const FAKE_INVALID_MARKER = "[simulation:marqueur-invalide]";
// Story 5.5 : morceaux espacés de FAKE_SLOW_STREAM_DELAY_MS (texte provisoire observable à l'écran).
export const FAKE_SLOW_STREAM_MARKER = "[simulation:flux-lent]";
export const FAKE_SLOW_STREAM_DELAY_MS = 400;

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
  if (question.includes(FAKE_INVALID_CITATION_MARKER)) {
    return "REPONSE\nRéponse simulée à partir des Documents [P1]. Point simulé sans Passage [P9].";
  }
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

// Découpage simulé du texte en morceaux (story 5.5) : marqueur coupé après trois caractères, et chaque
// repère [P{n}] coupé entre « [P » et son numéro, pour exercer le tampon du marqueur et le masquage.
export function fakeStreamChunks(content: string): string[] {
  const chunks: string[] = [];
  let rest = content;
  if (rest.length > 3) {
    chunks.push(rest.slice(0, 3));
    rest = rest.slice(3);
  }
  for (const part of rest.split(/(?<=\[P)/)) if (part !== "") chunks.push(part);
  return chunks;
}

// Réponse diffusée du fournisseur (format SSE de Chat Completions), un événement par morceau, puis
// l'usage et [DONE].
export function fakeStreamResponse(chunks: string[], finishReason = "stop", delayMs = 0): Response {
  const event = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
  const base = { object: "chat.completion.chunk", model: "simulation" };
  const body = [
    event({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] }),
    ...chunks.map((content) => event({ ...base, choices: [{ index: 0, delta: { content }, finish_reason: null }] })),
    event({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] }),
    event({ ...base, choices: [], usage: { prompt_tokens: 0, completion_tokens: 0 } }),
    "data: [DONE]\n\n",
  ];
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [index, part] of body.entries()) {
        if (delayMs > 0 && index > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (cancelled) return;
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const fakeFetch: typeof fetch = (_input, init) => {
  const { messages, stream } = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[]; stream?: boolean };
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const user = messages.find((message) => message.role === "user")?.content ?? "";
  const content = system === REFUSAL_SYSTEM_PROMPT ? fakeRefusal(user) : fakeAnswer(user);
  if (stream === true) {
    const delayMs = questionOf(user).includes(FAKE_SLOW_STREAM_MARKER) ? FAKE_SLOW_STREAM_DELAY_MS : 0;
    return Promise.resolve(fakeStreamResponse(fakeStreamChunks(content), "stop", delayMs));
  }
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
