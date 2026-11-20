// Fonction chat (story 5.2a-2, FR-16, FR-17, AD-14, AD-16, AD-17). Appelée par Next.js seulement, avec
// le jeton du Collaborateur (verify_jwt = true dans supabase/config.toml, session revérifiée auprès
// d'Auth). La base est interrogée avec ce jeton, jamais avec service_role.
//
// Deux modes (story 5.5) : flux SSE si le relais envoie « Accept: text/event-stream » (texte provisoire
// en delta, masqué de son marqueur et de ses repères, puis done, refusal ou error) ; sinon réponse JSON
// d'un bloc (story 5.4), même logique, même enregistrement. Les refus avant la génération (session,
// validation, rejeu, quota, plafond) sont des réponses JSON avec leur statut HTTP dans les deux modes.
//
// Ordre : validation ; Conversation à poursuivre (story 5.6 : lue avec le jeton, RLS ; absente ou d'un
// autre Compte → 404 NOT_FOUND, sans réservation) ; classement du clientRequestId (story 5.9, AD-16,
// begin_retry, avant toute réservation) : réponse ou refus enregistré → rejeu renvoyé tel quel, sans
// appel ni quota ; en cours depuis moins de 90 s → 409 avec la Conversation ; échec, ou sans résultat
// depuis plus de 90 s → réessai (question existante réutilisée, échec réclamé puis remplacé par le
// résultat) ; sinon nouvelle question ; réservation du quota du Compte et du plafond global (avant tout appel à OpenAI) ;
// question de suivi (story 5.8, Conversation poursuivie avec au moins un échange réglé) : 3 derniers
// échanges lus avec le jeton, reformulation en question autonome (rewriteFollowUp, 10 s pris sur le
// premier affichage ; échec → question et échec enregistrés, unité rendue) ; Conversation et question
// (start_conversation, ou add_question avec la question autonome pour une Conversation poursuivie) ;
// vectorisation de la question autonome (sinon de la question), match_passages, relecture des
// Documents ; aucun Passage → appel court qui départage les deux refus (story 5.3) ; sinon consignes et génération (diffusée en mode flux), marqueur en première ligne (AD-10) ;
// citations validées, texte réécrit avec les renvois [S{n}] (story 5.4) ; enregistrement atomique.
// Un refus enregistre le message standard du catalogue, jamais le texte du modèle. Tout échec après
// la réservation est enregistré (kind = failure). L'unité n'est rendue que si aucun appel facturable
// n'a abouti (règle de libération du 2026-11-13, appel court compris : décision du 2026-11-16). Aucun
// texte de question, de Passage ni de réponse n'est journalisé.
import {
  type AiDeps,
  classifyRefusal,
  embed,
  generateAnswer,
  type GenerationResult,
  rewriteFollowUp,
  streamAnswer,
  type StreamResult,
} from "../_shared/ai.ts";

// Résultat d'un appel au modèle, diffusé ou non : usage null quand le flux a été arrêté avant que le
// fournisseur ne le transmette (story 5.5).
type ModelResult = GenerationResult | StreamResult;
import {
  buildHistory,
  type ChatRequest,
  type GenerationState,
  conversationTitle,
  type DocumentRow,
  isDocumentRow,
  isHistoryRow,
  isReleasable,
  parseChatRequest,
  parseReservation,
  parseRetryClassification,
  replaySources,
  retainPassages,
  type RetryClassification,
  sourcesToSave,
} from "../_shared/chat.ts";
import {
  CHAT_CLEANUP_TIMEOUT_MS,
  CHAT_FIRST_DISPLAY_MS,
  CHAT_GENERATION_FIRST_CHUNK_TIMEOUT_MS,
  CHAT_GENERATION_MAX_TIMEOUT_MS,
  CHAT_HISTORY_READ_LIMIT,
  CHAT_JSON_GENERATION_MAX_TIMEOUT_MS,
  CHAT_JSON_TIMEOUT_MS,
  CHAT_MAX_PASSAGES,
  CHAT_PASSAGES_PER_DOCUMENT,
  CHAT_TIMEOUT_MS,
  EMBEDDING_MODEL,
  EMBEDDING_VERSION,
  readEnv,
  REWRITE_FIRST_DISPLAY_MARGIN_MS,
  REWRITE_TIMEOUT_MS,
} from "../_shared/config.ts";
import { AiError, type ErrorCode, errorResponse, logEvent, logInfo } from "../_shared/errors.ts";
import { generationDeps } from "../_shared/fake-generation.ts";
import { readCitations } from "../_shared/rag/citations.ts";
import { MARKER_MAX_LENGTH, type Marker, readMarker } from "../_shared/rag/marker.ts";
import {
  buildFollowUpChatMessages,
  buildRefusalMessages,
  buildRewriteMessages,
  type HistoryExchange,
} from "../_shared/rag/prompt.ts";
import { createStreamMask } from "../_shared/rag/stream-mask.ts";
import { isMatchRow, type MatchRow, searchVectorization } from "../_shared/search.ts";

// Textes du catalogue (src/lib/texts.ts) : les Edge Functions n'importent rien de src/. Le relais
// Next.js remplace le message d'erreur par le texte du catalogue correspondant au code. Un test vérifie
// l'égalité avec le catalogue. Exception : QUOTA_MESSAGE et CAP_MESSAGE n'ont pas de {moment} (fuseau du
// navigateur inconnu ici) ; le relais les remplace par le texte complet construit à partir de resetAt.
export const FAILURE_MESSAGE = "Le service d'IA ne répond pas pour le moment. Votre question est conservée.";
export const SESSION_MESSAGE = "Votre session a expiré. Reconnectez-vous pour continuer.";
export const UNVERIFIABLE_MESSAGE = "Je n'ai pas pu vérifier cette réponse à partir des Documents. Veuillez réessayer.";
export const BUDGET_MESSAGE = "Le service d'IA est momentanément indisponible. Réessayez plus tard.";
export const QUOTA_MESSAGE = "Vous avez atteint votre limite quotidienne de questions et de Résumés. La Recherche reste disponible.";
export const CAP_MESSAGE = "L'Assistant a atteint sa limite d'utilisation pour aujourd'hui. La Recherche reste disponible.";
export const IN_PROGRESS_MESSAGE = "Cette question est déjà en cours de traitement.";
// Conversation absente ou d'un autre Compte (story 5.6, exigence S3) : même réponse neutre dans les deux
// cas, texte « Accès refusé / introuvable » du catalogue.
export const NOT_FOUND_MESSAGE = "Cette page n'existe pas ou ne vous est pas accessible.";
// EXPERIENCE.md, « Information absente » et « Hors cadre » : messages standard enregistrés pour un
// refus (story 5.3), à la place du texte du modèle.
export const REFUSAL_INFO_ABSENTE =
  "Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.";
export const REFUSAL_HORS_CADRE = "Je réponds uniquement à partir des Documents de NexaWorks.";

type RefusalKind = "refusal_info_absente" | "refusal_hors_cadre";
const REFUSALS: Record<Exclude<Marker, "REPONSE">, { kind: RefusalKind; content: string }> = {
  REFUS_INFO_ABSENTE: { kind: "refusal_info_absente", content: REFUSAL_INFO_ABSENTE },
  REFUS_HORS_CADRE: { kind: "refusal_hors_cadre", content: REFUSAL_HORS_CADRE },
};

// Sortie reçue sans marqueur valide (ou marqueur inattendu) : facturée, unité consommée ; réessayable.
function invalidOutput(reason: string): AiError {
  return new AiError("AI_OUTPUT_INVALID", true, reason, undefined, undefined, "response_received");
}

// Échec hors IA, avec le code AD-19 et le statut à renvoyer. La cause va aux journaux seulement ;
// pgCode : code Postgres renvoyé par l'API (ex. 23505), jamais son message.
class ChatError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly retryable: boolean,
    readonly reason: string,
    readonly pgCode?: string,
  ) {
    super(reason);
    this.name = "ChatError";
  }
}

type Target = { url: string; apikey: string; token: string };

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  return token || null;
}

// Clé publique : la clé publiable reçue de Next.js, ou la clé anon du projet ; jamais une autre clé.
function publicKey(request: Request): string | undefined {
  const received = request.headers.get("apikey") ?? "";
  return received.startsWith("sb_publishable_") ? received : readEnv("SUPABASE_ANON_KEY");
}

function headers({ apikey, token }: Target): Record<string, string> {
  return { apikey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function verifySession(target: Target, signal: AbortSignal): Promise<void> {
  const response = await fetch(`${target.url}/auth/v1/user`, { headers: headers(target), signal });
  await response.body?.cancel().catch(() => {});
  if (response.status === 401 || response.status === 403) {
    throw new ChatError("UNAUTHENTICATED", 401, false, `session_${response.status}`);
  }
  if (!response.ok) throw new ChatError("INTERNAL", 500, true, `auth_http_${response.status}`);
}

async function failed(response: Response, name: string): Promise<ChatError> {
  if (response.status === 401) {
    await response.body?.cancel().catch(() => {});
    return new ChatError("UNAUTHENTICATED", 401, false, `${name}_http_401`);
  }
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
  const pgCode = typeof body?.code === "string" && /^[0-9A-Z]{5}$/.test(body.code) ? body.code : undefined;
  return new ChatError("INTERNAL", 500, true, `${name}_http_${response.status}`, pgCode);
}

async function rpc(target: Target, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${target.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(target),
    body: JSON.stringify(args),
    signal,
  });
  if (!response.ok) throw await failed(response, name);
  return await response.json().catch(() => {
    throw new ChatError("INTERNAL", 500, true, `${name}_invalid_body`);
  });
}

async function get(target: Target, path: string, name: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${target.url}/rest/v1/${path}`, { headers: headers(target), signal });
  if (!response.ok) throw await failed(response, name);
  return await response.json().catch(() => {
    throw new ChatError("INTERNAL", 500, true, `${name}_invalid_body`);
  });
}

// Rejeu complet (story 5.9, AD-16) : classement de la demande par begin_retry (security invoker, RLS,
// verrou transactionnel sur le Compte et l'identifiant), avant toute réservation. Pour un réessai,
// l'échec est déjà réclamé (REQUEST_IN_PROGRESS) au retour.
async function classifyRequest(target: Target, input: ChatRequest, signal: AbortSignal): Promise<RetryClassification> {
  const classified = parseRetryClassification(
    await rpc(
      target,
      "begin_retry",
      {
        p_client_request_id: input.clientRequestId,
        p_question: input.question,
        ...(input.conversationId ? { p_conversation_id: input.conversationId } : {}),
      },
      signal,
    ),
  );
  if (!classified) throw new ChatError("INTERNAL", 500, true, "replay_invalid_body");
  return classified;
}

// Story 5.9 (rapport a de la 5.2a-2) : une réponse ou un refus rattaché à cette question est-il déjà
// enregistré ? Lu avant d'enregistrer un échec quand l'enregistrement du résultat a été envoyé : un
// enregistrement validé dont la réponse HTTP s'est perdue n'est jamais suivi d'un échec.
async function settledExists(target: Target, clientRequestId: string, signal: AbortSignal): Promise<boolean> {
  const rows = await get(
    target,
    `messages?select=id&role=eq.assistant&kind=neq.failure&client_request_id=eq.${clientRequestId}&limit=1`,
    "settled_check",
    signal,
  );
  if (!Array.isArray(rows)) throw new ChatError("INTERNAL", 500, true, "settled_check_invalid_rows");
  return rows.length > 0;
}

// Conversation de la question déjà enregistrée avec ce clientRequestId (23505 concurrent), pour le 409.
async function questionConversation(target: Target, clientRequestId: string, signal: AbortSignal): Promise<string | undefined> {
  const rows = await get(
    target,
    `messages?select=conversation_id&role=eq.user&client_request_id=eq.${clientRequestId}&limit=1`,
    "question_lookup",
    signal,
  );
  const id = Array.isArray(rows) ? (rows[0] as { conversation_id?: unknown } | undefined)?.conversation_id : undefined;
  return typeof id === "string" ? id : undefined;
}

// Conversation à poursuivre (story 5.6) : lue avec le jeton du Collaborateur, la RLS ne renvoie que les
// siennes. Absente ou d'un autre Compte : false, sans distinction (exigence S3).
async function conversationExists(target: Target, conversationId: string, signal: AbortSignal): Promise<boolean> {
  const rows = await get(target, `conversations?select=id&id=eq.${conversationId}&limit=1`, "conversation_check", signal);
  if (!Array.isArray(rows)) throw new ChatError("INTERNAL", 500, true, "conversation_check_invalid_rows");
  return rows.length > 0;
}

// Story 5.8 (Q2 = A) : derniers messages de la Conversation, lus avec le jeton (RLS), remis dans l'ordre
// de created_at ; buildHistory en tire les 3 derniers échanges réglés. Story 5.9 : pour le réessai d'une
// question, seuls les messages antérieurs à cette question (before, sa date d'enregistrement).
async function readHistory(target: Target, conversationId: string, signal: AbortSignal, before?: string): Promise<HistoryExchange[]> {
  const until = before ? `&created_at=lt.${encodeURIComponent(before)}` : "";
  const rows = await get(
    target,
    `messages?select=role,kind,content,client_request_id,created_at&conversation_id=eq.${conversationId}${until}&order=created_at.desc&limit=${CHAT_HISTORY_READ_LIMIT}`,
    "history",
    signal,
  );
  if (!Array.isArray(rows) || !rows.every(isHistoryRow)) throw new ChatError("INTERNAL", 500, true, "history_invalid_rows");
  return buildHistory([...rows].reverse(), { refusal_info_absente: REFUSAL_INFO_ABSENTE, refusal_hors_cadre: REFUSAL_HORS_CADRE });
}

async function matchPassages(target: Target, vector: number[], minSimilarity: number, signal: AbortSignal): Promise<MatchRow[]> {
  const rows = await rpc(
    target,
    "match_passages",
    {
      query_embedding: JSON.stringify(vector),
      min_similarity: minSimilarity,
      max_passages: CHAT_MAX_PASSAGES,
      max_per_document: CHAT_PASSAGES_PER_DOCUMENT,
      embedding_model: EMBEDDING_MODEL,
      embedding_version: EMBEDDING_VERSION,
    },
    signal,
  );
  if (!Array.isArray(rows) || !rows.every(isMatchRow)) throw new ChatError("INTERNAL", 500, true, "match_invalid_rows");
  return rows;
}

// Titre et version relus dans documents avec le jeton : jamais du modèle ni du navigateur.
async function readDocuments(target: Target, ids: string[], signal: AbortSignal): Promise<DocumentRow[]> {
  if (ids.length === 0) return [];
  const rows = await get(target, `documents?select=id,title,text_version&id=in.(${ids.join(",")})`, "documents", signal);
  if (!Array.isArray(rows) || !rows.every(isDocumentRow)) throw new ChatError("INTERNAL", 500, true, "documents_invalid_rows");
  return rows;
}

// Le délai commun interrompt aussi l'appel au fournisseur en cours.
function withSignal(deps: Partial<AiDeps> | undefined, signal: AbortSignal): Partial<AiDeps> {
  const base = deps?.fetch ?? ((input, init) => fetch(input, init));
  return {
    ...deps,
    fetch: (input, init) =>
      base(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal }),
  };
}

// Rejette dès l'expiration du délai commun, même pendant une attente entre deux tentatives.
function deadline(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const expire = () => reject(new AiError("AI_TIMEOUT", true, "délai de chat dépassé"));
    if (signal.aborted) expire();
    else signal.addEventListener("abort", expire, { once: true });
  });
}

type Failure = { code: ErrorCode; status: number; retryable: boolean; cause: string };

function failure(error: unknown, timedOut: boolean): Failure {
  if (error instanceof ChatError) {
    if (timedOut && error.code === "INTERNAL") return { code: "AI_TIMEOUT", status: 504, retryable: true, cause: "timeout" };
    return { code: error.code, status: error.status, retryable: error.retryable, cause: error.reason };
  }
  if (error instanceof AiError) {
    switch (error.code) {
      case "AI_TIMEOUT":
        return { code: "AI_TIMEOUT", status: 504, retryable: true, cause: error.code };
      case "AI_BUDGET_EXHAUSTED":
        return { code: "AI_BUDGET_EXHAUSTED", status: 503, retryable: false, cause: error.code };
      case "AI_OUTPUT_INVALID":
        return { code: "AI_OUTPUT_INVALID", status: 502, retryable: error.retryable, cause: error.code };
      case "AI_CITATIONS_INVALID":
        return { code: "AI_CITATIONS_INVALID", status: 502, retryable: true, cause: error.code };
      case "AI_UNAVAILABLE":
        return { code: "AI_UNAVAILABLE", status: 503, retryable: error.retryable, cause: error.code };
      default:
        return { code: "INTERNAL", status: 500, retryable: true, cause: error.code };
    }
  }
  if (timedOut) return { code: "AI_TIMEOUT", status: 504, retryable: true, cause: "timeout" };
  return { code: "INTERNAL", status: 500, retryable: true, cause: error instanceof Error ? error.name : "unknown" };
}

function messageFor(code: ErrorCode): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return SESSION_MESSAGE;
    case "AI_CITATIONS_INVALID":
      return UNVERIFIABLE_MESSAGE;
    case "AI_BUDGET_EXHAUSTED":
      return BUDGET_MESSAGE;
    case "REQUEST_IN_PROGRESS":
      return IN_PROGRESS_MESSAGE;
    case "NOT_FOUND":
      return NOT_FOUND_MESSAGE;
    default:
      return FAILURE_MESSAGE;
  }
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

// Mode flux (story 5.5) : demandé par l'en-tête Accept du relais. Sans lui, réponse JSON d'un bloc
// (story 5.4), même logique et même enregistrement : un relais ou une page antérieurs au push restent
// servis pendant le déploiement (deploy:supabase précède le push).
function wantsStream(request: Request): boolean {
  return (request.headers.get("Accept") ?? "").includes("text/event-stream");
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
};

// Événements du flux (story 5.5) : delta (texte provisoire, sans marqueur ni repère), refusal (message
// standard, d'un bloc), done (même forme que la réponse JSON), error (forme AD-19 sans enveloppe).
export type StreamEvent = "delta" | "refusal" | "done" | "error";

// Flux SSE vers le relais. Une déconnexion (relais ou navigateur) ferme seulement l'envoi : le travail
// continue jusqu'à son terme (AD-17), sans lever d'exception.
function eventStream() {
  const encoder = new TextEncoder();
  let target: ReadableStreamDefaultController<Uint8Array> | null = null;
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      target = controller;
    },
    cancel() {
      open = false;
    },
  });
  const write = (text: string) => {
    if (!open || !target) return;
    try {
      target.enqueue(encoder.encode(text));
    } catch {
      open = false;
    }
  };
  return {
    stream,
    // Commentaire SSE envoyé dès l'ouverture : en-têtes et premiers octets partent sans attendre la
    // génération (ignoré par le lecteur).
    opened: () => write(": flux\n\n"),
    send: (event: StreamEvent, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
    close: () => {
      if (!open || !target) return;
      open = false;
      try {
        target.close();
      } catch {
        // Déjà fermé par le lecteur.
      }
    },
    disconnected: () => !open,
  };
}

type ChatBody = {
  conversationId: string;
  message: {
    kind: "answer" | RefusalKind;
    content: string;
    sources: ChatSource[];
  };
};

// Source renvoyée au navigateur. Story 5.7 (Q1 = A) : positions des Passages cités et version du texte,
// seulement pour un Document existant ; jamais de passage_id, rien pour un Document supprimé (report
// de la 3.4).
type ChatSource = {
  documentId: string | null;
  title: string;
  passageNumbers: number[];
  passages?: { start: number; end: number }[];
  textVersion?: number;
};

type Outcome =
  | { type: "answer"; body: ChatBody }
  | { type: "refusal"; body: ChatBody }
  | { type: "error"; code: ErrorCode; status: number; retryable: boolean };

type LogDetails = Record<string, string | number | boolean | undefined>;

// Demande acceptée (unité réservée, question enregistrée). Story 5.8 : historique transmis à la
// génération, question autonome (recherche) ou échec de la reformulation à rendre en error.
type Accepted = {
  input: ChatRequest;
  history: HistoryExchange[];
  standaloneQuestion: string | null;
  rewriteError: unknown;
};

// Story 5.9 (Q3 = A) : réponse ou refus déjà enregistré pour ce clientRequestId, renvoyé tel quel (done
// ou refusal en flux, JSON sinon), sans réservation ni appel au fournisseur.
type Replayed = { replayed: Outcome & { type: "answer" | "refusal" } };

const isReplayed = (value: unknown): value is Replayed =>
  typeof value === "object" && value !== null && "replayed" in value;

function replayOutcome(classified: RetryClassification & { outcome: "replay" }): Replayed {
  const body: ChatBody = {
    conversationId: classified.conversationId,
    message: { kind: classified.kind, content: classified.content, sources: replaySources(classified.sources) },
  };
  return { replayed: { type: classified.kind === "answer" ? "answer" : "refusal", body } };
}

export type HandleOptions = {
  timeoutMs?: number;
  generationTimeoutMs?: number;
  firstChunkTimeoutMs?: number;
  // Mode flux : premier événement affiché (delta, refusal, done ou error) au plus tard ce délai après
  // la réception de la demande (CHAT_FIRST_DISPLAY_MS).
  firstDisplayMs?: number;
  // Reformulation d'une question de suivi (story 5.8) : REWRITE_TIMEOUT_MS (10 s) par défaut.
  rewriteTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  // Travail poursuivi après l'envoi des en-têtes (mode flux) : EdgeRuntime.waitUntil en production.
  waitUntil?: (promise: Promise<unknown>) => void;
};

export async function handle(request: Request, options: HandleOptions = {}): Promise<Response> {
  if (request.method !== "POST") return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 405);

  const token = bearerToken(request);
  if (!token) return errorResponse("UNAUTHENTICATED", SESSION_MESSAGE, false, 401);

  const url = readEnv("SUPABASE_URL");
  const apikey = publicKey(request);
  if (!url || !apikey) {
    logEvent("chat_not_configured", {});
    return errorResponse("INTERNAL", FAILURE_MESSAGE, true, 500);
  }
  const target = { url, apikey, token };

  const streaming = wantsStream(request);
  const mode = streaming ? "stream" : "json";
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? (streaming ? CHAT_TIMEOUT_MS : CHAT_JSON_TIMEOUT_MS);
  const generationMaxMs =
    options.generationTimeoutMs ?? (streaming ? CHAT_GENERATION_MAX_TIMEOUT_MS : CHAT_JSON_GENERATION_MAX_TIMEOUT_MS);
  const firstChunkMaxMs = options.firstChunkTimeoutMs ?? CHAT_GENERATION_FIRST_CHUNK_TIMEOUT_MS;
  const firstDisplayMs = options.firstDisplayMs ?? CHAT_FIRST_DISPLAY_MS;
  const controller = new AbortController();
  const signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Premier affichage du serveur (mode flux, décision de l'utilisateur du 2026-11-17, option A) : si
  // aucun événement n'est parti 17 s après la réception (session, recherche, appel court ou génération
  // trop lents), l'échéance commune est déclenchée : error AI_TIMEOUT, échec enregistré, règle de
  // libération inchangée (unité rendue avant tout envoi au fournisseur, consommée après). Le navigateur
  // n'abandonne qu'à 20 s : l'écran ne montre jamais une panne pour une réponse que chat enregistre.
  let firstDisplayExpired = false;
  // Garde-fou du premier affichage (story 5.8) : réponse JSON ou événement error envoyé aussitôt à
  // l'échéance, selon que les en-têtes du flux sont partis ou non (voir la fin de handle).
  let onFirstDisplayExpired: (() => void) | null = null;
  const firstDisplayTimer = streaming
    ? setTimeout(() => {
        firstDisplayExpired = true;
        controller.abort();
        onFirstDisplayExpired?.();
      }, firstDisplayMs)
    : undefined;
  const displayed = () => clearTimeout(firstDisplayTimer);
  // Temps restant avant l'échéance du premier affichage (mode flux).
  const firstDisplayLeft = () => Math.max(1, firstDisplayMs - (Date.now() - started));
  // Le délai peut expirer pendant une étape sans lecteur : son rejet ne doit jamais rester non géré.
  const expired = deadline(signal);
  expired.catch(() => {});
  const within = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, expired]);
  const remaining = () => Math.max(1, timeoutMs - (Date.now() - started));
  const cleanupMs = options.cleanupTimeoutMs ?? CHAT_CLEANUP_TIMEOUT_MS;
  // Temps laissé au modèle : échéance commune moins le délai réservé à l'enregistrement du résultat.
  const generationLeft = () => Math.max(1, timeoutMs - (Date.now() - started) - cleanupMs);

  let stage = "session";
  let reservationId: string | null = null;
  let conversationId: string | null = null;
  // Question acceptée (story 5.6) : rattache la réponse, le refus ou l'échec à sa question, même quand
  // deux questions de la même Conversation sont traitées en même temps.
  let questionRequestId: string | null = null;
  // Réessai (story 5.9, Q1 = A) : ligne d'échec réclamée par begin_retry, remplacée par le résultat
  // (réponse, refus ou nouvel échec) au lieu d'une insertion.
  let replaceMessageId: string | null = null;
  // Enregistrement du résultat envoyé (save_assistant_answer) : un échec n'est enregistré ensuite que si
  // aucun résultat n'est en base pour cette question (rapport a de la 5.2a-2).
  let saveSent = false;
  let generation: GenerationState = "not_sent";
  // Texte provisoire (mode flux) : délai du premier delta depuis la demande, nombre de delta envoyés.
  let firstDeltaMs: number | null = null;
  let deltas = 0;

  // Rend l'unité réservée, avec son propre délai (le délai commun peut être expiré). Jamais de levée.
  const release = async (): Promise<boolean> => {
    if (!reservationId) return false;
    const id = reservationId;
    reservationId = null;
    try {
      const cleanup = AbortSignal.timeout(options.cleanupTimeoutMs ?? CHAT_CLEANUP_TIMEOUT_MS);
      return (await rpc(target, "release_ai_call", { p_reservation_id: id }, cleanup)) === true;
    } catch (error) {
      logEvent("chat_release_failed", { cause: error instanceof ChatError ? error.reason : "network" });
      return false;
    }
  };

  // Réessai refusé avant tout appel (quota, plafond) : la ligne réclamée reprend le code de l'échec
  // précédent, avec son propre délai. Jamais de levée.
  const restoreFailure = async (code: string): Promise<void> => {
    if (!conversationId || !replaceMessageId) return;
    try {
      const cleanup = AbortSignal.timeout(options.cleanupTimeoutMs ?? CHAT_CLEANUP_TIMEOUT_MS);
      await rpc(
        target,
        "record_assistant_failure",
        { p_conversation_id: conversationId, p_error_code: code, p_client_request_id: questionRequestId, p_replace_message_id: replaceMessageId },
        cleanup,
      );
    } catch (error) {
      logEvent("chat_failure_not_restored", { cause: error instanceof ChatError ? error.reason : "network" });
    }
  };

  // Enregistrement du résultat (réponse ou refus), à la place de l'échec réclamé pour un réessai. Story
  // 5.9 : avec son propre délai, hors de l'échéance commune, pour que sa réponse soit toujours lue (une
  // échéance qui tomberait pendant l'enregistrement laisserait un résultat validé sans le savoir).
  const saveResult = (args: Record<string, unknown>): Promise<unknown> => {
    saveSent = true;
    return rpc(
      target,
      "save_assistant_answer",
      {
        ...args,
        p_conversation_id: conversationId,
        p_client_request_id: questionRequestId,
        ...(replaceMessageId ? { p_replace_message_id: replaceMessageId } : {}),
      },
      AbortSignal.timeout(options.cleanupTimeoutMs ?? CHAT_CLEANUP_TIMEOUT_MS),
    );
  };

  // Échec enregistré (AD-17), même si le navigateur s'est déconnecté, avec son propre délai ; unité
  // rendue selon la règle de libération. Jamais de levée.
  const fail = async (error: unknown): Promise<Outcome & { type: "error" }> => {
    const { code, status, retryable, cause } = failure(error, signal.aborted);
    let recorded = false;
    let alreadySettled = false;
    if (conversationId && saveSent && questionRequestId) {
      // Résultat peut-être déjà validé en base (réponse HTTP perdue, corps illisible) : jamais d'échec
      // après un enregistrement validé ; le rejeu renverra ce résultat.
      try {
        alreadySettled = await settledExists(target, questionRequestId, AbortSignal.timeout(options.cleanupTimeoutMs ?? CHAT_CLEANUP_TIMEOUT_MS));
      } catch (checkError) {
        logEvent("chat_settled_check_failed", { cause: checkError instanceof ChatError ? checkError.reason : "network" });
      }
    }
    if (conversationId && !alreadySettled) {
      try {
        const cleanup = AbortSignal.timeout(options.cleanupTimeoutMs ?? CHAT_CLEANUP_TIMEOUT_MS);
        await rpc(
          target,
          "record_assistant_failure",
          {
            p_conversation_id: conversationId,
            p_error_code: code,
            p_client_request_id: questionRequestId,
            ...(replaceMessageId ? { p_replace_message_id: replaceMessageId } : {}),
          },
          cleanup,
        );
        recorded = true;
      } catch (recordError) {
        logEvent("chat_failure_not_recorded", { cause: recordError instanceof ChatError ? recordError.reason : "network" });
      }
    }
    const released = reservationId !== null && isReleasable(generation) ? await release() : false;
    logEvent("chat_failed", {
      code,
      cause,
      stage,
      generation,
      recorded,
      already_settled: alreadySettled || undefined,
      retry: replaceMessageId !== null || undefined,
      released,
      mode,
      ...streamDetails(),
      first_display_expired: firstDisplayExpired || undefined,
      duration_ms: Date.now() - started,
    });
    return { type: "error", code, status, retryable };
  };

  const streamDetails = (): LogDetails =>
    streaming ? { first_delta_ms: firstDeltaMs ?? undefined, deltas } : {};

  // Étapes avant toute génération : refus en JSON avec leur statut HTTP, dans les deux modes. Sinon :
  // demande acceptée, unité réservée, Conversation et question créées ; pour une question de suivi,
  // historique, question autonome ou échec de la reformulation (story 5.8).
  const accept = async (): Promise<Response | Accepted | Replayed> => {
    await within(verifySession(target, signal));

    stage = "validation";
    const input = parseChatRequest(await request.json().catch(() => undefined));
    if (!input) return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 400);

    if (input.conversationId) {
      stage = "conversation_check";
      if (!(await within(conversationExists(target, input.conversationId, signal)))) {
        logInfo("chat_conversation_not_found", {});
        return errorResponse("NOT_FOUND", NOT_FOUND_MESSAGE, false, 404);
      }
    }

    // Story 5.9 (AD-16) : classement du clientRequestId avant toute réservation. Rejeu et 409 : aucune
    // réservation, aucun appel au fournisseur (AD-14).
    stage = "replay";
    const classified = await within(classifyRequest(target, input, signal));
    if (classified.outcome === "mismatch") {
      // Même identifiant, autre question (ou autre Conversation) : refusé, rien d'enregistré (Q2).
      logInfo("chat_replay_mismatch", {});
      return errorResponse("VALIDATION_FAILED", FAILURE_MESSAGE, false, 400);
    }
    if (classified.outcome === "in_progress") {
      logInfo("chat_replay_refused", { in_progress: true });
      return errorResponse("REQUEST_IN_PROGRESS", IN_PROGRESS_MESSAGE, false, 409, undefined, classified.conversationId);
    }
    if (classified.outcome === "replay") {
      logInfo("chat_replayed", { kind: classified.kind, sources: classified.sources.length, mode });
      return replayOutcome(classified);
    }
    // Réessai : question existante réutilisée (aucune question ni Conversation nouvelle), Conversation
    // lue en base ; l'échec réclamé sera remplacé par le résultat. Dès ici, un échec (réservation
    // comprise) est enregistré à la place de la ligne réclamée.
    const retry = classified.outcome === "retry" ? classified : null;
    if (retry) {
      conversationId = retry.conversationId;
      questionRequestId = input.clientRequestId;
      replaceMessageId = retry.replaceMessageId;
    }

    stage = "reserve";
    // Story 5.10 (rapport de la 5.8 et de la 5.2a-2) : la réponse de reserve_ai_call est lue avec le temps restant plus le délai
    // de nettoyage, hors de l'échéance commune (comme add_question après une reformulation), pour que
    // l'identifiant de réservation soit toujours connu ; une échéance tombée pendant la réservation rend
    // l'unité aussitôt (fail, AD-14 : rien n'a été envoyé au fournisseur) et répond AI_TIMEOUT. Le
    // garde-fou des 17 s, lui, répond toujours à son échéance (le travail continue en tâche de fond).
    if (signal.aborted) throw new AiError("AI_TIMEOUT", true, "délai de chat dépassé avant la réservation");
    const reservation = parseReservation(await rpc(target, "reserve_ai_call", {}, AbortSignal.timeout(remaining() + cleanupMs)));
    if (!reservation) throw new ChatError("INTERNAL", 500, true, "reserve_invalid_body");
    if (reservation.ok && signal.aborted) {
      reservationId = reservation.reservationId;
      logInfo("chat_reservation_expired", { retry: retry !== null || undefined });
      throw new AiError("AI_TIMEOUT", true, "délai de chat dépassé pendant la réservation");
    }
    if (!reservation.ok) {
      logInfo("chat_quota_refused", { reason: reservation.reason, retry: retry !== null || undefined });
      // Réessai refusé par le quota : l'échec précédent est rétabli (il reste affiché), sans réservation.
      if (retry) await restoreFailure(retry.previousErrorCode);
      return reservation.reason === "global"
        ? errorResponse("AI_DAILY_CAP_REACHED", CAP_MESSAGE, false, 503, reservation.resetAt)
        : errorResponse("QUOTA_EXCEEDED", QUOTA_MESSAGE, false, 429, reservation.resetAt);
    }
    reservationId = reservation.reservationId;

    // Question de suivi (story 5.8, AD-12) : seulement pour une Conversation poursuivie qui a au moins
    // un échange réglé ; après la réservation (aucun appel au fournisseur sans unité réservée), avant
    // l'enregistrement de la question (Q1 = A). Échec de la reformulation : la question est enregistrée
    // sans question autonome, puis l'échec (answer). Règle de libération d'AD-14 (décision de
    // l'utilisateur du 2026-11-19), comme callModel : aucune réponse du fournisseur → unité rendue ;
    // réponse reçue inexploitable ou délai après envoi (ou échéance commune dépassée) → consommée.
    let history: HistoryExchange[] = [];
    let standaloneQuestion: string | null = null;
    let rewriteError: unknown = null;
    let rewriteAttempted = false;
    // Story 5.10 (R6 de la 5.9) : la reformulation a reçu une réponse du fournisseur (réussie, ou
    // inexploitable, ou délai après envoi) : l'unité est consommée même si la question n'est pas enregistrée.
    let rewriteBilled = false;
    // Story 5.9 (Q2) : pour un réessai, l'historique est relu AVANT la question réessayée, dans sa
    // Conversation (lue en base) ; la question autonome déjà enregistrée est reprise telle quelle, sinon
    // la reformulation est refaite (sans être enregistrée : la question existe déjà).
    const historyConversation = retry ? retry.conversationId : input.conversationId;
    if (retry?.standaloneQuestion) standaloneQuestion = retry.standaloneQuestion;
    if (historyConversation) {
      stage = "history";
      history = await within(readHistory(target, historyConversation, signal, retry?.questionCreatedAt));
      if (history.length > 0 && standaloneQuestion === null) {
        stage = "rewrite";
        rewriteAttempted = true;
        // 10 s au plus, pris sur l'échéance du premier affichage en mode flux (la génération reçoit le
        // temps restant), moins une marge pour enregistrer la question, et sur l'échéance globale.
        const rewriteMs = Math.max(
          1,
          Math.min(
            options.rewriteTimeoutMs ?? REWRITE_TIMEOUT_MS,
            remaining(),
            streaming ? firstDisplayLeft() - REWRITE_FIRST_DISPLAY_MARGIN_MS : Infinity,
          ),
        );
        const rewriteStarted = Date.now();
        try {
          const rewritten = await within(
            rewriteFollowUp(buildRewriteMessages({ question: input.question, history }), {
              deps: withSignal(generationDeps(), signal),
              timeoutMs: rewriteMs,
            }),
          );
          standaloneQuestion = rewritten.question;
          rewriteBilled = true;
          logInfo("chat_rewrite_done", {
            exchanges: history.length,
            model: rewritten.model,
            input_tokens: rewritten.usage.inputTokens,
            output_tokens: rewritten.usage.outputTokens,
            rewrite_ms: Date.now() - rewriteStarted,
          });
        } catch (error) {
          rewriteError = error;
          if (
            error instanceof AiError &&
            !((error.outcome === "no_response" || error.outcome === undefined) && !signal.aborted)
          ) {
            generation = "billed";
            rewriteBilled = true;
          }
          logEvent("chat_rewrite_failed", {
            code: error instanceof AiError ? error.code : "unknown",
            exchanges: history.length,
            rewrite_ms: Date.now() - rewriteStarted,
          });
        }
      }
    }

    // Nouvelle Conversation (titre = première question), ou question ajoutée à la Conversation poursuivie
    // (story 5.6, add_question : security invoker, date du dernier échange avancée), avec sa question
    // autonome (story 5.8). Dès qu'une reformulation a été tentée (réussie ou non), la question est
    // enregistrée avec le délai de nettoyage, hors de l'échéance commune : si celle-ci tombe pendant
    // l'enregistrement, la question existe quand même et l'échec y est rattaché (error avec conversationId).
    // Réessai : la question est déjà enregistrée (aucune question ni Conversation nouvelle).
    if (retry) return { input, history, standaloneQuestion, rewriteError };

    stage = "conversation";
    const cleanupRecord = rewriteAttempted || signal.aborted;
    const questionSignal = cleanupRecord ? AbortSignal.timeout(options.cleanupTimeoutMs ?? CHAT_CLEANUP_TIMEOUT_MS) : signal;
    const guarded = <T>(promise: Promise<T>): Promise<T> => (cleanupRecord ? promise : within(promise));
    let startedConversation: unknown;
    try {
      startedConversation = await guarded(
        input.conversationId
          ? rpc(
              target,
              "add_question",
              {
                p_conversation_id: input.conversationId,
                p_question: input.question,
                p_client_request_id: input.clientRequestId,
                ...(standaloneQuestion ? { p_standalone_question: standaloneQuestion } : {}),
              },
              questionSignal,
            )
          : rpc(
              target,
              "start_conversation",
              { p_title: conversationTitle(input.question), p_question: input.question, p_client_request_id: input.clientRequestId },
              questionSignal,
            ),
      );
    } catch (error) {
      if (error instanceof ChatError && error.pgCode === "23505") {
        // Même clientRequestId arrivé en concurrence : aucune Conversation de plus ; la Conversation de la
        // question déjà enregistrée accompagne le 409 si elle peut être lue (5.9). Story 5.10 (R6) : règle
        // de libération d'AD-14 pour la reformulation du perdant : unité rendue si aucune reformulation n'a
        // été envoyée ou si elle a échoué sans réponse ; consommée si elle a reçu une réponse.
        let released = false;
        if (rewriteBilled) reservationId = null;
        else released = await release();
        logInfo("chat_replay_refused", { concurrent: true, released, rewrite_billed: rewriteBilled || undefined });
        const existing = await questionConversation(
          target,
          input.clientRequestId,
          AbortSignal.timeout(options.cleanupTimeoutMs ?? CHAT_CLEANUP_TIMEOUT_MS),
        ).catch(() => undefined);
        return errorResponse("REQUEST_IN_PROGRESS", IN_PROGRESS_MESSAGE, false, 409, undefined, existing);
      }
      throw error;
    }
    const conversation = (startedConversation as { conversation_id?: unknown } | null)?.conversation_id;
    if (typeof conversation !== "string") throw new ChatError("INTERNAL", 500, true, "conversation_invalid_body");
    conversationId = conversation;
    questionRequestId = input.clientRequestId;
    return { input, history, standaloneQuestion, rewriteError };
  };

  // Morceaux du fournisseur → texte provisoire (story 5.5) : rien n'est envoyé avant la fin de la
  // première ligne ou MARKER_MAX_LENGTH caractères ; REPONSE → texte masqué de ses repères
  // (stream-mask.ts) ; refus ou marqueur invalide → lecture du fournisseur arrêtée, aucun delta.
  const streamFilter = (onDelta: (text: string) => void) => {
    const mask = createStreamMask();
    let head = "";
    let state: "head" | "answer" | "stopped" = "head";
    const emit = (text: string) => {
      if (text === "") return;
      if (firstDeltaMs === null) {
        firstDeltaMs = Date.now() - started;
        displayed();
      }
      deltas += 1;
      onDelta(text);
    };
    const onText = (chunk: string): boolean => {
      if (state === "answer") {
        emit(mask.push(chunk));
        return true;
      }
      if (state === "stopped") return false;
      head += chunk;
      if (!head.includes("\n") && head.length <= MARKER_MAX_LENGTH) return true;
      const marking = readMarker(head);
      if (!marking || marking.marker !== "REPONSE") {
        state = "stopped";
        return false;
      }
      state = "answer";
      emit(mask.push(marking.rest));
      return true;
    };
    // Fin de la lecture : rien de retenu n'est envoyé (repère ouvert, espaces de fin), sauf un « [ » seul.
    const end = () => {
      if (state === "answer") emit(mask.flush());
    };
    return { onText, end };
  };

  // Recherche, génération, marqueur, citations, enregistrement. Ne lève jamais : un échec est
  // enregistré et rendu comme une issue « error ».
  const answer = async (
    { input, history, standaloneQuestion, rewriteError }: Accepted,
    onDelta: (text: string) => void,
  ): Promise<Outcome> => {
    try {
      // Story 5.8 : reformulation échouée (délai, panne, sortie invalide) : question déjà enregistrée,
      // échec enregistré et unité rendue (aucune génération envoyée), error avec la Conversation.
      if (rewriteError !== null) {
        stage = "rewrite";
        throw rewriteError;
      }

      // Recherche sur la question autonome d'une question de suivi (story 5.8), sinon sur la question.
      const searched = standaloneQuestion ?? input.question;
      stage = "embed";
      const vectorization = searchVectorization("chat");
      const embedStarted = Date.now();
      const { vectors } = await within(
        embed([searched], { deps: withSignal(vectorization.deps, signal), timeoutMs: remaining() }),
      );

      stage = "match";
      const matchStarted = Date.now();
      const rows = await within(matchPassages(target, vectors[0], vectorization.minSimilarity, signal));

      stage = "documents";
      const documents = await within(readDocuments(target, [...new Set(rows.map((row) => row.document_id))], signal));
      const passages = retainPassages(rows, documents);

      const fakeGeneration = generationDeps();
      const generateStarted = Date.now();

      // Appel au modèle (génération, diffusée ou non, ou appel court : même règle de libération) : seul
      // un appel sans aucune réponse reçue (réseau, 5xx, refus, plafond), hors délai commun dépassé,
      // laisse l'unité rendable ; délai après envoi et réponse reçue la consomment. Une AiError sans
      // issue a été levée avant tout envoi (ex. clé absente) ; celle du délai commun (signal
      // abandonné) reste « billed ».
      const callModel = async (
        call: (deps: Partial<AiDeps>, timeoutMs: number) => Promise<ModelResult>,
      ): Promise<ModelResult> => {
        generation = "billed";
        try {
          // Story 5.9 (option A du 2026-11-20) : le délai de l'enregistrement du résultat est réservé dans
          // l'échéance commune (génération et appel court bornés au temps restant moins ce délai).
          return await within(call(withSignal(fakeGeneration, signal), Math.min(generationMaxMs, generationLeft())));
        } catch (error) {
          if (error instanceof AiError && (error.outcome === "no_response" || error.outcome === undefined) && !signal.aborted) {
            generation = "no_response";
          }
          throw error;
        }
      };

      const logged = (generated: ModelResult): LogDetails => ({
        passages: passages.length,
        simulated: vectorization.simulated,
        generation_simulated: fakeGeneration !== undefined,
        model: generated.model,
        // Usage inconnu (flux arrêté avant son dernier morceau) : signalé, jamais compté à 0.
        input_tokens: generated.usage?.inputTokens,
        output_tokens: generated.usage?.outputTokens,
        usage_missing: generated.usage === null ? true : undefined,
        mode,
        ...streamDetails(),
      });

      // Refus : message standard du catalogue enregistré, sans Source ; le texte du modèle est ignoré
      // (jamais affiché ni enregistré). Appel facturé : unité consommée (décision du 2026-11-16).
      const refuse = async (marker: Exclude<Marker, "REPONSE">, generated: ModelResult): Promise<Outcome> => {
        const { kind, content } = REFUSALS[marker];
        stage = "refusal";
        await saveResult({ p_kind: kind, p_content: content, p_sources: [] });
        logInfo("chat_done", {
          kind,
          ...logged(generated),
          generate_ms: Date.now() - generateStarted,
          duration_ms: Date.now() - started,
        });
        return { type: "refusal", body: { conversationId: conversationId as string, message: { kind, content, sources: [] } } };
      };

      if (passages.length === 0) {
        // Aucun Passage au-dessus du seuil : appel court, non diffusé, sortie bornée au marqueur, qui
        // départage information absente et hors cadre (FR-18). REPONSE ou toute autre sortie :
        // AI_OUTPUT_INVALID.
        stage = "classify";
        // Mode flux : l'appel court ne dépasse pas l'échéance du premier affichage.
        const classified = await callModel((deps, timeoutMs) =>
          classifyRefusal(buildRefusalMessages(searched), {
            deps,
            timeoutMs: streaming ? Math.min(timeoutMs, firstDisplayLeft()) : timeoutMs,
          }),
        );
        const marking = readMarker(classified.text);
        if (!marking || marking.marker === "REPONSE") {
          logEvent("chat_marker_invalid", { stage, marker: marking?.marker });
          throw invalidOutput("marqueur de l'appel court invalide");
        }
        return await refuse(marking.marker, classified);
      }

      stage = "generate";
      // Story 5.8 : Passages, 3 derniers échanges (données, jamais source de faits) et question d'origine.
      const messages = buildFollowUpChatMessages({ question: input.question, passages: passages.map((passage) => passage.chat), history });
      let generated: ModelResult;
      if (streaming) {
        const filter = streamFilter(onDelta);
        generated = await callModel((deps, timeoutMs) =>
          streamAnswer(messages, {
            deps,
            timeoutMs,
            // min(20 s, 17 s − temps déjà écoulé depuis la réception) : premier morceau à temps pour
            // le premier affichage.
            firstChunkTimeoutMs: Math.min(firstChunkMaxMs, timeoutMs, firstDisplayLeft()),
            onText: filter.onText,
          }),
        );
        filter.end();
      } else {
        generated = await callModel((deps, timeoutMs) => generateAnswer(messages, { deps, timeoutMs }));
      }

      // Marqueur en première ligne (AD-10) : absent ou invalide → AI_OUTPUT_INVALID, sans texte du
      // modèle ; refus → message standard ; REPONSE → le texte qui suit, sans le marqueur. En flux, la
      // lecture s'est arrêtée dès un refus ou un marqueur invalide : sa première ligne suffit.
      stage = "marker";
      const marking = readMarker(generated.text);
      if (!marking) {
        logEvent("chat_marker_invalid", { stage });
        throw invalidOutput("marqueur absent ou invalide");
      }
      if (marking.marker !== "REPONSE") return await refuse(marking.marker, generated);
      const text = marking.rest.trim();
      if (text === "") {
        logEvent("chat_marker_invalid", { stage, marker: marking.marker, empty: true });
        throw invalidOutput("réponse vide après le marqueur");
      }

      stage = "citations";
      const reading = readCitations(text, passages.map((passage) => passage.chat));
      if (reading.cited.length === 0) {
        // Génération reçue et facturée : unité consommée.
        logEvent("chat_citations_invalid", { unknown: reading.unknown.length });
        throw new AiError("AI_CITATIONS_INVALID", true, "aucune citation valide", undefined, undefined, "response_received");
      }
      // Story 5.4 (AD-11) : texte enregistré et renvoyé avec les renvois [S{n}], citations invalides
      // retirées sans message (leur nombre seul est journalisé, dans chat_done).
      const content = reading.text;
      const sources = sourcesToSave(reading.sources, passages);

      stage = "save";
      const saveStarted = Date.now();
      const saved = (await saveResult({
        p_kind: "answer",
        p_content: content,
        p_sources: sources.map(({ document_id, document_title, text_version, passages }) => ({
          document_id,
          document_title,
          text_version,
          passages,
        })),
      })) as { sources?: { ordinal?: unknown; document_id?: unknown }[] } | null;
      const savedSources = Array.isArray(saved?.sources) ? saved.sources : null;
      if (!savedSources || savedSources.length !== sources.length) throw new ChatError("INTERNAL", 500, true, "save_invalid_body");

      const finished = Date.now();
      logInfo("chat_done", {
        kind: "answer",
        ...logged(generated),
        sources: sources.length,
        cited: reading.cited.length,
        unknown_citations: reading.unknown.length,
        model_renvois_removed: reading.modelRenvoisRemoved,
        embed_ms: matchStarted - embedStarted,
        generate_ms: saveStarted - generateStarted,
        duration_ms: finished - started,
      });
      return {
        type: "answer",
        body: {
          conversationId: conversationId as string,
          message: {
            kind: "answer",
            content,
            sources: sources.map((source, index): ChatSource => {
              // Null si le Document a été supprimé entre la Recherche et l'enregistrement (FR-12).
              const documentId = typeof savedSources[index].document_id === "string" ? savedSources[index].document_id : null;
              const base = { documentId, title: source.document_title, passageNumbers: source.passageNumbers };
              // Story 5.7 : positions et version pour le panneau Source, jamais pour un Document supprimé.
              if (documentId === null) return base;
              return { ...base, passages: source.passages.map(({ start, end }) => ({ start, end })), textVersion: source.text_version };
            }),
          },
        },
      };
    } catch (error) {
      return await fail(error);
    }
  };

  // Garde-fou du premier affichage (mode flux, décision de l'utilisateur du 2026-11-19) : le premier
  // événement part au plus firstDisplayMs après la réception, quelle que soit la durée des écritures en
  // base (question, échec, libération), reformulation comprise. Échéance pendant l'acceptation : réponse
  // JSON 504 AI_TIMEOUT aussitôt ; en-têtes déjà partis : événement error aussitôt. Le travail en cours
  // continue en tâche de fond jusqu'à son terme (question et échec enregistrés, libération selon
  // AD-14) ; son issue n'est jamais envoyée en plus.
  const acceptance = (async (): Promise<Response | Accepted | Replayed> => {
    try {
      return await accept();
    } catch (error) {
      const failed = await fail(error);
      return errorResponse(failed.code, messageFor(failed.code), failed.retryable, failed.status);
    }
  })();
  let accepted: Response | Accepted | Replayed | "expired";
  if (streaming) {
    const reached = new Promise<"expired">((resolve) => {
      onFirstDisplayExpired = () => resolve("expired");
    });
    accepted = await Promise.race([acceptance, reached]);
    onFirstDisplayExpired = null;
  } else {
    accepted = await acceptance;
  }
  if (accepted === "expired") {
    const rest = (async () => {
      try {
        const late = await acceptance;
        if (!(late instanceof Response) && !isReplayed(late)) await answer(late, () => {});
      } finally {
        clearTimeout(timer);
      }
    })();
    options.waitUntil?.(rest.catch(() => {}));
    logEvent("chat_first_display_guard", { phase: "accept", stage, duration_ms: Date.now() - started });
    return errorResponse("AI_TIMEOUT", messageFor("AI_TIMEOUT"), true, 504);
  }
  if (accepted instanceof Response) {
    clearTimeout(timer);
    displayed();
    return accepted;
  }
  if (isReplayed(accepted)) {
    clearTimeout(timer);
    displayed();
    const outcome = accepted.replayed;
    if (!streaming) return json(outcome.body);
    // Mode flux : même forme qu'une réponse ou un refus de première main (done ou refusal), sans texte
    // provisoire.
    const events = eventStream();
    events.opened();
    if (outcome.type === "answer") events.send("done", outcome.body);
    else {
      events.send("refusal", {
        conversationId: outcome.body.conversationId,
        kind: outcome.body.message.kind,
        content: outcome.body.message.content,
      });
    }
    events.close();
    return new Response(events.stream, { status: 200, headers: SSE_HEADERS });
  }
  const input = accepted;

  if (!streaming) {
    try {
      const outcome = await answer(input, () => {});
      return outcome.type === "error"
        ? errorResponse(outcome.code, messageFor(outcome.code), outcome.retryable, outcome.status)
        : json(outcome.body);
    } finally {
      clearTimeout(timer);
    }
  }

  // Mode flux : en-têtes envoyés dès la demande acceptée ; le travail continue même si le relais ou le
  // navigateur se déconnecte (AD-17) : réponse ou échec enregistré, unité consommée ou rendue.
  const events = eventStream();
  events.opened();
  // Garde-fou, en-têtes partis : error AI_TIMEOUT aussitôt (avec la Conversation), flux fermé ; rien de
  // ce que calcule ensuite le travail en cours n'est envoyé.
  let guardSent = false;
  onFirstDisplayExpired = () => {
    guardSent = true;
    events.send("error", {
      code: "AI_TIMEOUT",
      message: messageFor("AI_TIMEOUT"),
      retryable: true,
      ...(conversationId ? { conversationId } : {}),
    });
    events.close();
    logEvent("chat_first_display_guard", { phase: "stream", stage, duration_ms: Date.now() - started });
  };
  const work = (async () => {
    try {
      const outcome = await answer(input, (text) => events.send("delta", { text }));
      displayed();
      // Story 5.6 (Q3 = A) : refusal et error portent aussi la Conversation, pour que la page prenne son
      // adresse et que « Réessayer » ou la question suivante y restent.
      if (outcome.type === "answer") events.send("done", outcome.body);
      else if (outcome.type === "refusal") {
        events.send("refusal", {
          conversationId: outcome.body.conversationId,
          kind: outcome.body.message.kind,
          content: outcome.body.message.content,
        });
      } else {
        events.send("error", {
          code: outcome.code,
          message: messageFor(outcome.code),
          retryable: outcome.retryable,
          ...(conversationId ? { conversationId } : {}),
        });
      }
      if (events.disconnected() && !guardSent) logInfo("chat_stream_disconnected", { outcome: outcome.type, duration_ms: Date.now() - started });
    } finally {
      clearTimeout(timer);
      displayed();
      events.close();
    }
  })();
  options.waitUntil?.(work.catch(() => {}));
  return new Response(events.stream, { status: 200, headers: SSE_HEADERS });
}

// Le travail continue jusqu'à son terme même si le relais se déconnecte (AD-17) : la promesse est
// confiée à EdgeRuntime.waitUntil quand il existe ; en mode flux, le travail qui suit l'envoi des
// en-têtes aussi.
const runtime = globalThis as {
  Deno?: { serve(handler: (request: Request) => Promise<Response>): unknown };
  EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
};
runtime.Deno?.serve((request) => {
  const work = handle(request, { waitUntil: (promise) => runtime.EdgeRuntime?.waitUntil(promise) });
  runtime.EdgeRuntime?.waitUntil(work.catch(() => {}));
  return work;
});
