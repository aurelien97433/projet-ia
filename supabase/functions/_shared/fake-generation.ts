// Génération simulée de la pile locale (story 5.2a-2) : aucun appel à OpenAI dans les tests
// d'intégration de chat. Elle passe par generateAnswer et classifyRefusal (_shared/ai.ts), dont les
// contrôles restent appliqués, avec un fetch simulé. Même garde-fou que la vectorisation simulée :
// active seulement si GENERATION_FAKE=1 ET si SUPABASE_URL vise l'hôte local ; ailleurs, rejetée et
// journalisée. Story 5.3 : sortie précédée du marqueur (AD-10), repères de test pour les refus et le
// marqueur invalide, appel court simulé. Story 5.5 : avec stream: true, réponse diffusée en morceaux
// (marqueur et repères coupés), espacés avec FAKE_SLOW_STREAM_MARKER. Story 5.8 : reformulation de
// suivi simulée (fakeRewrite), panne avec FAKE_REWRITE_FAILURE_MARKER. Story 6.1 : Résumé simulé.
import type { AiDeps } from "./ai.ts";
import { CHAT_MAX_QUESTION_LENGTH, readEnv } from "./config.ts";
import { logEvent, logInfo } from "./errors.ts";
import { isLocalStack } from "./fake-embeddings.ts";
import { REFUSAL_SYSTEM_PROMPT, REWRITE_QUESTION_PREFIX, REWRITE_SYSTEM_PROMPT, SUMMARY_SYSTEM_PROMPT } from "./rag/prompt.ts";

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

// Story 5.8 : reformulation simulée en panne (503 du fournisseur, à chaque tentative) : AI_UNAVAILABLE.
export const FAKE_REWRITE_FAILURE_MARKER = "[simulation:reformulation-en-panne]";

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

const unescape = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Reformulation simulée (story 5.8) : question autonome déterministe, question de l'échange précédent le
// plus récent suivie de la nouvelle question, sur une ligne, 2 000 caractères au plus ; null si la
// nouvelle question porte FAKE_REWRITE_FAILURE_MARKER (panne simulée).
export function fakeRewrite(userMessage: string): string | null {
  const index = userMessage.lastIndexOf(REWRITE_QUESTION_PREFIX);
  const question = unescape(index === -1 ? userMessage : userMessage.slice(index + REWRITE_QUESTION_PREFIX.length));
  if (question.includes(FAKE_REWRITE_FAILURE_MARKER)) return null;
  const previous = [...userMessage.matchAll(/<question>([\s\S]*?)<\/question>/g)].at(-1)?.[1] ?? "";
  const standalone = `${unescape(previous)} ${question}`.replace(/\s+/g, " ").trim();
  return Array.from(standalone).slice(0, CHAT_MAX_QUESTION_LENGTH).join("");
}

// Story 6.1 : Résumé simulé. Repères placés dans le TEXTE du Document à résumer (données neutralisées,
// sans chevron ni esperluette ; aucun Document du Jeu de démonstration n'en contient) : panne du
// fournisseur (503 à chaque tentative : AI_UNAVAILABLE, sans réponse), sortie non conforme (6 points :
// AI_OUTPUT_INVALID, réponse reçue) et réponse lente (FAKE_SUMMARY_SLOW_DELAY_MS, état « Génération du
// Résumé… » observable, demandes concurrentes).
export const FAKE_SUMMARY_FAILURE_MARKER = "[simulation:resume-en-panne]";
export const FAKE_SUMMARY_INVALID_MARKER = "[simulation:resume-invalide]";
export const FAKE_SUMMARY_SLOW_MARKER = "[simulation:resume-lent]";
export const FAKE_SUMMARY_SLOW_DELAY_MS = 1_500;

// Points simulés, déterministes : le titre du Document (attribut de la balise <document>) et deux points
// fixes, à la troisième personne.
export function fakeSummaryPoints(userMessage: string): string[] {
  const title = unescape((/<document titre="([^"]*)">/.exec(userMessage)?.[1] ?? "").replace(/&quot;/g, '"'));
  return [`Le Document « ${title} » est résumé par la génération simulée.`, "Le deuxième point simulé reprend le Document.", "Le troisième point simulé conclut le Résumé."];
}

function fakeSummaryResponse(userMessage: string, signal?: AbortSignal | null): Promise<Response> {
  if (userMessage.includes(FAKE_SUMMARY_FAILURE_MARKER)) {
    return Promise.resolve(Response.json({ error: { type: "server_error" } }, { status: 503 }));
  }
  const points = userMessage.includes(FAKE_SUMMARY_INVALID_MARKER)
    ? Array.from({ length: 6 }, (_, index) => `Point simulé ${index + 1}.`)
    : fakeSummaryPoints(userMessage);
  const response = () =>
    Response.json({
      model: "simulation",
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ points }) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    });
  if (!userMessage.includes(FAKE_SUMMARY_SLOW_MARKER)) return Promise.resolve(response());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(response()), FAKE_SUMMARY_SLOW_DELAY_MS);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("interrompu", "AbortError"));
    }, { once: true });
  });
}

const fakeFetch: typeof fetch = (_input, init) => {
  const { messages, stream } = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[]; stream?: boolean };
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const user = messages.find((message) => message.role === "user")?.content ?? "";
  if (system === SUMMARY_SYSTEM_PROMPT) return fakeSummaryResponse(user, init?.signal);
  if (system === REWRITE_SYSTEM_PROMPT) {
    const rewritten = fakeRewrite(user);
    if (rewritten === null) return Promise.resolve(Response.json({ error: { type: "server_error" } }, { status: 503 }));
    return Promise.resolve(
      Response.json({
        model: "simulation",
        choices: [{ index: 0, message: { role: "assistant", content: rewritten }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      }),
    );
  }
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
