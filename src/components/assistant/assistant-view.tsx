"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { z } from "zod";
import { ErrorAlert } from "@/components/forms/error-alert";
import { ADD_HREF } from "@/components/shell/nav-items";
import { Button } from "@/components/ui/button";
import {
  failureMessage,
  failureRetryable,
  PENDING_REFRESH_MS,
  type RefusalVariant,
  stripRawCitations,
  type ThreadExchange,
  type ThreadSource,
} from "@/lib/conversation-thread";
import { ERROR_CODES, type ErrorCode } from "@/lib/errors";
import {
  CHAT_MAX_QUESTION_LENGTH,
  chatDeltaSchema,
  chatErrorEventSchema,
  type ChatQuestionIssue,
  chatRefusalEventSchema,
  type ChatResponse,
  chatResponseSchema,
  questionIssue,
} from "@/lib/schemas/chat";
import { searchHref, SEARCH_PATH } from "@/lib/search-links";
import { createSseParser, type SseEvent } from "@/lib/sse";
import { functionRegion, type Measure, measureMarkdown } from "@/lib/stream-measure";
import { texts } from "@/lib/texts";
import { ASSISTANT_FIELD_ID, ASSISTANT_HREF, conversationHref } from "./constants";
import { HistorySheet } from "./history-sheet";
import { SOURCE_PANEL_ID, SourcePanel, type SourceSelection, useWideLayout } from "./source-panel";

const t = texts.assistant;

// Délais côté navigateur (story 5.5, AD-16), au-delà desquels la question est considérée comme en
// échec : 20 s sans premier affichage (delta, refusal, done ou error), 90 s au total. Chaîne des
// délais : génération 20 s au premier morceau < relais 25 s aux en-têtes ; chat 85 s < navigateur
// 90 s < maxDuration 120 s.
export const CHAT_FIRST_DISPLAY_TIMEOUT_MS = 20_000;
export const CHAT_CLIENT_TIMEOUT_MS = 90_000;

type ChatError = { code: ErrorCode; message: string; retryable: boolean };
type Reply =
  | { kind: "pending" }
  // Texte provisoire (story 5.5) : sans marqueur ni repère, remplacé par la réponse validée.
  | { kind: "streaming"; text: string }
  | { kind: "answer"; content: string; sources: ThreadSource[] }
  | { kind: "refusal"; variant: RefusalVariant }
  | { kind: "error"; error: ChatError };
// Fil de la Conversation (story 5.6) : tous les échanges, dans l'ordre. stored : échange lu en base à
// l'ouverture (/assistant/[id]), par opposition à une question envoyée depuis cette page.
// clientRequestId (story 5.9, AD-16) : identifiant de la question, renvoyé tel quel par « Réessayer ».
type Exchange = { id: string; question: string; clientRequestId: string | null; reply: Reply; stored: boolean };
// Issue d'une demande : la réponse affichée et la Conversation créée ou poursuivie, si chat l'a donnée.
// inProgress (story 5.9) : 409 REQUEST_IN_PROGRESS avec la Conversation de la question déjà en cours.
type Outcome = { reply: Reply; conversationId?: string; inProgress?: boolean };

// Échanges enregistrés (règles d'affichage de conversation-thread.ts) → fil de la page. Un échec
// enregistré devient l'alerte de panne avec le message du catalogue pour son code.
function fromThread(exchanges: ThreadExchange[]): Exchange[] {
  return exchanges.map(({ id, question, clientRequestId, reply }) => ({
    id,
    question,
    clientRequestId: clientRequestId ?? null,
    stored: true,
    reply:
      reply.kind === "failure"
        ? { kind: "error", error: { code: reply.code, message: failureMessage(reply.code), retryable: failureRetryable(reply.code) } }
        : reply,
  }));
}

// Corps d'erreur AD-19 renvoyé par /api/chat ; le message vient déjà du catalogue (relais).
// Story 5.9 : un 409 REQUEST_IN_PROGRESS porte la Conversation de la question déjà en cours.
const errorBodySchema = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string().min(1), retryable: z.boolean(), conversationId: z.uuid().optional() }),
});

// Pannes de l'Assistant : titre « La réponse n'a pas pu être générée. » suivi du message. Les autres
// refus (quota, plafond, double envoi, saisie, session) n'ont que leur message.
const FAILURE_CODES: readonly ErrorCode[] = [
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_CITATIONS_INVALID",
  "AI_OUTPUT_INVALID",
  "AI_BUDGET_EXHAUSTED",
  "INTERNAL",
];
// Jamais de « Réessayer » : le quota ou le plafond ne reviennent pas avant l'heure indiquée. Story 5.9 :
// un 409 REQUEST_IN_PROGRESS fait patienter puis recharge la Conversation ; sans Conversation connue,
// « Réessayer » renvoie le même identifiant (idempotent).
const NO_RETRY_CODES: readonly ErrorCode[] = ["QUOTA_EXCEEDED", "AI_DAILY_CAP_REACHED"];

const unavailable = (): Reply => ({ kind: "error", error: { code: "AI_UNAVAILABLE", message: t.failed, retryable: true } });
const timedOut = (): Reply => ({ kind: "error", error: { code: "AI_TIMEOUT", message: t.failed, retryable: true } });

// Refus : texte du catalogue selon la variante (identique au message standard enregistré par chat).
function toReply(data: ChatResponse): Reply {
  switch (data.message.kind) {
    case "refusal_info_absente":
      return { kind: "refusal", variant: "info_absente" };
    case "refusal_hors_cadre":
      return { kind: "refusal", variant: "hors_cadre" };
    default:
      return {
        kind: "answer",
        content: data.message.content,
        // Story 5.7 : positions et version transmises par chat pour un Document existant seulement.
        sources: data.message.sources.map(({ documentId, title, passageNumbers, passages, textVersion }) =>
          documentId === null
            ? { documentId, title, passageCount: passageNumbers.length }
            : { documentId, title, passageCount: passageNumbers.length, passages, textVersion },
        ),
      };
  }
}

const canRetry = (error: ChatError) => error.retryable && !NO_RETRY_CODES.includes(error.code);

function parseData(event: SseEvent): unknown {
  try {
    return JSON.parse(event.data);
  } catch {
    return undefined;
  }
}

const failed = (): Outcome => ({ reply: unavailable() });

// Événement final du flux → issue affichée et Conversation (story 5.6 : done, refusal et error la
// portent) ; null pour un delta ou un événement inconnu (ignoré).
function finalOutcome(event: SseEvent): Outcome | null {
  switch (event.event) {
    case "done": {
      const parsed = chatResponseSchema.safeParse(parseData(event));
      return parsed.success ? { reply: toReply(parsed.data), conversationId: parsed.data.conversationId } : failed();
    }
    case "refusal": {
      const parsed = chatRefusalEventSchema.safeParse(parseData(event));
      if (!parsed.success) return failed();
      return {
        reply: { kind: "refusal", variant: parsed.data.kind === "refusal_hors_cadre" ? "hors_cadre" : "info_absente" },
        conversationId: parsed.data.conversationId,
      };
    }
    case "error": {
      const parsed = chatErrorEventSchema.safeParse(parseData(event));
      if (!parsed.success) return failed();
      const { conversationId, ...error } = parsed.data;
      return { reply: { kind: "error", error }, conversationId };
    }
    default:
      return null;
  }
}

type StreamCallbacks = {
  // Texte provisoire reçu (déjà masqué de ses repères par chat).
  onDelta: (text: string) => void;
  // Fin d'une lecture du flux qui a apporté au moins un delta (mesure : morceaux mis en tampon).
  onDeltaRead: () => void;
};

// Lit le flux de /api/chat jusqu'à son événement final (done, refusal, error) ; flux fini sans
// événement final ou illisible : panne. Abandon (délai) : lecture annulée aussitôt, panne.
async function readChatStream(body: ReadableStream<Uint8Array>, signal: AbortSignal, callbacks: StreamCallbacks): Promise<Outcome> {
  const reader = body.getReader();
  const stop = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", stop, { once: true });
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const events = parser.push(done ? decoder.decode() : decoder.decode(value, { stream: true }));
      let hadDelta = false;
      for (const event of events) {
        if (event.event === "delta") {
          const parsed = chatDeltaSchema.safeParse(parseData(event));
          if (!parsed.success) return failed();
          hadDelta = true;
          callbacks.onDelta(parsed.data.text);
          continue;
        }
        const outcome = finalOutcome(event);
        if (outcome) return outcome;
      }
      if (hadDelta) callbacks.onDeltaRead();
      if (done) return failed();
    }
  } finally {
    signal.removeEventListener("abort", stop);
    reader.cancel().catch(() => {});
  }
}

export type AssistantConversation = { id: string; title: string; exchanges: ThreadExchange[] };

type AssistantViewProps = {
  // Titre de l'écran (h1) : « Que voulez-vous savoir ? » ou titre de la Conversation.
  title?: React.ReactNode;
  // Conversation enregistrée ouverte par /assistant/[id] (story 5.6) ; absente : nouvelle Conversation.
  conversation?: AssistantConversation;
  // 5 dernières Conversations, sous le champ tant qu'aucune Conversation n'est active (story 5.6).
  recent?: React.ReactNode;
};

// Adresse d'une Conversation : seul ?mesure=1 est gardé (instrument de mesure de la 5.5).
const addressOf = (conversationId: string | null, measuring: boolean) =>
  `${conversationId ? conversationHref(conversationId) : ASSISTANT_HREF}${measuring ? "?mesure=1" : ""}`;

// Page Assistant (E4, stories 5.2b et 5.6). Le navigateur n'appelle que POST /api/chat (jamais une Edge
// Function ni le fournisseur d'IA) et GET /api/conversations (Historique). Story 5.6 : fil de tous les
// échanges de la Conversation ; la première question crée la Conversation et l'adresse devient
// /assistant/{id} (history.replaceState, sans rechargement) ; les questions suivantes, et « Réessayer »
// (Q3 = A), y sont ajoutées (conversationId). Une question enregistrée encore sans réponse recharge la
// page toutes les 5 s jusqu'à son issue (90 s au plus, AD-16).
// Story 5.5 : la réponse s'écrit progressivement (texte provisoire, aria-busy, hors de la région
// d'annonce), puis la réponse validée la remplace, en texte brut avec ses renvois ¹ ² et ses puces
// numérotées (story 5.4), annoncée une seule fois ; un refus arrive d'un bloc (story 5.3) ; une panne
// retire le texte provisoire. ?mesure=1 : instrument de mesure du flux.
export function AssistantView({ title, conversation, recent }: AssistantViewProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("question");
  const measuring = searchParams.get("mesure") === "1";
  const historyParam = searchParams.get("historique") === "1";
  const prefill = (raw ?? "").slice(0, CHAT_MAX_QUESTION_LENGTH);

  const [value, setValue] = useState(prefill);
  const [syncedRaw, setSyncedRaw] = useState(raw);
  // Nouvelle adresse portant une question (retour arrière, exemple de question) : le champ la reprend.
  // Une adresse sans question (adresse de la Conversation prise après le premier envoi) ne vide pas le
  // champ : un texte saisi entre-temps est gardé.
  if (raw !== syncedRaw) {
    setSyncedRaw(raw);
    if (raw !== null) setValue(prefill);
  }

  // Panneau Historique : ouvert par « Historique », ou d'emblée par ?historique=1 (« Voir tout l'Historique »).
  const [historyOpen, setHistoryOpen] = useState(historyParam);
  const [syncedHistoryParam, setSyncedHistoryParam] = useState(historyParam);
  if (historyParam !== syncedHistoryParam) {
    setSyncedHistoryParam(historyParam);
    if (historyParam) setHistoryOpen(true);
  }
  const [historyContainer, setHistoryContainer] = useState<HTMLDivElement | null>(null);

  // Panneau Source (story 5.7) : puce montrée (une seule à la fois), Documents découverts supprimés
  // pendant la visite (404 à l'ouverture : leurs puces passent au style supprimé).
  const wide = useWideLayout();
  const [sourceSelection, setSourceSelection] = useState<SourceSelection | null>(null);
  const [deletedDocuments, setDeletedDocuments] = useState<ReadonlySet<string>>(() => new Set());
  // Puce d'origine du panneau ouvert ou en cours de fermeture : cible du retour du focus.
  const sourceChipRef = useRef<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(conversation?.id ?? null);
  const conversationIdRef = useRef<string | null>(conversation?.id ?? null);
  const [exchanges, setExchanges] = useState<Exchange[]>(() => fromThread(conversation?.exchanges ?? []));
  const [measures, setMeasures] = useState<Measure[]>([]);
  // Question vide refusée à l'envoi ; la longueur, elle, est contrôlée à chaque frappe.
  const [emptyRefused, setEmptyRefused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(1);
  // Occupé dès la première activation, avant même le rendu suivant (second clic ignoré).
  const busyRef = useRef(false);

  const last = exchanges.at(-1);
  // Question enregistrée encore sans réponse (navigateur fermé pendant la génération, ou rechargé) :
  // la page se recharge toutes les 5 s ; le serveur la traite comme un échec au-delà de 90 s.
  const storedPending = last?.stored === true && last.reply.kind === "pending";

  // Nouvelle lecture du serveur (rechargement d'une question en cours) : le fil reprend l'état enregistré.
  const [syncedThread, setSyncedThread] = useState(conversation?.exchanges);
  if (conversation && conversation.exchanges !== syncedThread) {
    setSyncedThread(conversation.exchanges);
    if (storedPending) setExchanges(fromThread(conversation.exchanges));
  }

  useEffect(() => {
    if (!storedPending) return;
    const timer = setInterval(() => router.refresh(), PENDING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [storedPending, router]);

  // « Envoyer » inactif jusqu'à l'issue (réponse validée, refus ou panne), y compris pour une question
  // enregistrée encore en cours.
  const busy = last?.reply.kind === "pending" || last?.reply.kind === "streaming";
  // Longueur après suppression des espaces de bord, comme le schéma et la route : compteur et
  // contrôle mesurent la même chose.
  const questionLength = value.trim().length;
  const tooLong = questionLength > CHAT_MAX_QUESTION_LENGTH;
  const fieldIssue: ChatQuestionIssue | null = tooLong ? "tooLong" : emptyRefused ? "empty" : null;

  const updateExchange = (exchangeId: string, reply: Reply, stored = false) =>
    setExchanges((current) => current.map((exchange) => (exchange.id === exchangeId ? { ...exchange, reply, stored } : exchange)));

  // Conversation créée par la première question (ou confirmée) : la page en prend l'adresse, sans
  // rechargement ni perte du texte affiché ; les questions suivantes y sont ajoutées.
  function adoptConversation(id: string) {
    if (conversationIdRef.current === id) return;
    conversationIdRef.current = id;
    setConversationId(id);
    if (window.location.pathname !== conversationHref(id)) window.history.replaceState(null, "", addressOf(id, measuring));
  }

  async function ask(question: string, exchangeId: string, clientRequestId: string) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    let expired = false;
    const expire = () => {
      expired = true;
      controller.abort();
    };
    const total = setTimeout(expire, CHAT_CLIENT_TIMEOUT_MS);
    const firstDisplay = setTimeout(expire, CHAT_FIRST_DISPLAY_TIMEOUT_MS);
    const isCurrent = () => controllerRef.current === controller;

    // Mesure (?mesure=1) : instants depuis l'envoi ; aucun identifiant n'est gardé.
    const sentAt = new Date();
    const started = performance.now();
    const elapsed = () => performance.now() - started;
    let firstDeltaMs: number | null = null;
    let deltas = 0;
    const deltaReadsMs: number[] = [];
    let region: string | null = null;

    let outcome: Outcome = failed();
    const currentConversation = conversationIdRef.current;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        // Story 5.9 (AD-16) : nouvel identifiant pour chaque question, le MÊME pour « Réessayer » (fin de
        // la décision du 2026-11-16) : chat rejoue un résultat enregistré, ou réessaie sur place.
        // Conversation en cours, si elle existe (story 5.6).
        body: JSON.stringify(
          currentConversation ? { question, clientRequestId, conversationId: currentConversation } : { question, clientRequestId },
        ),
        cache: "no-store",
        signal: controller.signal,
      });
      region = functionRegion(response.headers.get("x-vercel-id"));
      if (!isCurrent()) return;
      // Session expirée : le rafraîchissement renvoie vers la page de connexion.
      if (response.status === 401) router.refresh();
      const streamed = (response.headers.get("content-type") ?? "").includes("text/event-stream");
      if (response.ok && streamed && response.body) {
        let provisional = "";
        outcome = await readChatStream(response.body, controller.signal, {
          onDelta: (text) => {
            clearTimeout(firstDisplay);
            if (firstDeltaMs === null) firstDeltaMs = elapsed();
            deltas += 1;
            provisional += text;
            if (!isCurrent()) return;
            updateExchange(exchangeId, { kind: "streaming", text: provisional });
          },
          onDeltaRead: () => deltaReadsMs.push(elapsed()),
        });
      } else {
        // Réponse d'un bloc : refus avant le flux (saisie, session, quota, plafond, double envoi,
        // Conversation introuvable) ou réponse JSON.
        clearTimeout(firstDisplay);
        const body: unknown = await response.json().catch(() => undefined);
        if (!isCurrent()) return;
        if (response.ok) {
          const parsed = chatResponseSchema.safeParse(body);
          if (parsed.success) outcome = { reply: toReply(parsed.data), conversationId: parsed.data.conversationId };
        } else {
          const parsed = errorBodySchema.safeParse(body);
          if (parsed.success) {
            const { conversationId, ...error } = parsed.data.error;
            // Story 5.9 : question déjà en cours. Avec sa Conversation : attente puis rechargement ; sans,
            // « Réessayer » (même identifiant).
            outcome =
              error.code === "REQUEST_IN_PROGRESS"
                ? { reply: { kind: "error", error: { ...error, retryable: true } }, conversationId, inProgress: conversationId !== undefined }
                : { reply: { kind: "error", error } };
          }
          else if (response.status === 401) {
            outcome = { reply: { kind: "error", error: { code: "UNAUTHENTICATED", message: texts.session.expired, retryable: false } } };
          }
        }
      }
    } catch {
      // Réseau ou abandon : panne, sauf si une autre demande a pris le relais.
    } finally {
      clearTimeout(total);
      clearTimeout(firstDisplay);
    }
    if (!isCurrent()) return;
    // Délai dépassé : panne, le texte provisoire éventuel est retiré. La Conversation éventuellement
    // reçue reste adoptée.
    let reply = outcome.reply;
    if (expired) reply = timedOut();
    // Story 5.9 (AD-16) : 409, la question est déjà en cours de traitement : état « en cours », puis la
    // Conversation est rechargée jusqu'à un résultat (90 s au plus, règles du fil : au-delà, échec avec
    // « Réessayer »).
    if (!expired && outcome.inProgress && outcome.conversationId) {
      controllerRef.current = null;
      busyRef.current = false;
      waitForConversation(outcome.conversationId, exchangeId);
      return;
    }
    if (outcome.conversationId) adoptConversation(outcome.conversationId);
    if (measuring) {
      const measure: Measure = {
        sentAt,
        question,
        outcome: reply.kind === "answer" ? "answer" : reply.kind === "refusal" ? "refusal" : "error",
        code: reply.kind === "error" ? reply.error.code : undefined,
        firstDeltaMs,
        endMs: elapsed(),
        deltas,
        deltaReadsMs,
        region,
      };
      setMeasures((current) => [...current, measure]);
    }
    controllerRef.current = null;
    busyRef.current = false;
    // Erreur sans « Réessayer » (saisie invalide, double envoi, quota, plafond, session) : la question
    // revient dans le champ s'il est resté vide, pour être corrigée ou renvoyée plus tard.
    if (reply.kind === "error" && !canRetry(reply.error)) setValue((current) => (current === "" ? question : current));
    updateExchange(exchangeId, reply);
  }

  // Question déjà en cours (409, story 5.9) : sur la page de cette Conversation, l'échange devient un
  // échange enregistré en cours, rechargé toutes les 5 s ; sinon, la Conversation est ouverte à son adresse.
  function waitForConversation(id: string, exchangeId: string) {
    if (conversation?.id === id) {
      updateExchange(exchangeId, { kind: "pending" }, true);
      return;
    }
    updateExchange(exchangeId, { kind: "pending" });
    // Adresse déjà prise sans rechargement (replaceState, page /assistant) : rechargement complet.
    if (window.location.pathname === conversationHref(id)) window.location.reload();
    else router.replace(addressOf(id, measuring));
  }

  useEffect(() => () => controllerRef.current?.abort(), []);

  // Conversation rouverte : focus dans le champ à l'ouverture (story 5.6).
  const openedConversation = conversation?.id;
  useEffect(() => {
    if (openedConversation) fieldRef.current?.focus();
  }, [openedConversation]);

  // Issue affichée d'une question envoyée ici : erreur → focus sur l'alerte ; réponse ou refus → le
  // focus reste dans le champ (ou y revient depuis « Envoyer » ou « Réessayer »), sauf s'il a été posé
  // ailleurs entre-temps. Un échange lu en base ne déplace pas le focus.
  const replyKind = last?.stored === false ? last.reply.kind : undefined;
  const lastId = last?.id;
  useEffect(() => {
    if (replyKind === undefined || replyKind === "pending" || replyKind === "streaming") return;
    const active = document.activeElement;
    const free = active === null || active === document.body || containerRef.current?.contains(active) === true;
    if (!free) return;
    if (replyKind === "error") alertRef.current?.focus();
    else if (active !== fieldRef.current) fieldRef.current?.focus();
  }, [replyKind, lastId]);

  function send() {
    if (busyRef.current || busy) return;
    const issue = questionIssue(value);
    if (issue) {
      setEmptyRefused(issue === "empty");
      fieldRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setEmptyRefused(false);
    const question = value.trim();
    const id = `local-${nextIdRef.current++}`;
    const clientRequestId = crypto.randomUUID();
    setExchanges((current) => [...current, { id, question, clientRequestId, reply: { kind: "pending" }, stored: false }]);
    setValue("");
    void ask(question, id, clientRequestId);
  }

  // « Réessayer » (dernier échange seulement) : la question repart dans la même Conversation (Q3 = A),
  // avec le MÊME identifiant (story 5.9) : aucune bulle ni question en plus, le résultat remplace l'alerte.
  function retry() {
    if (busyRef.current || last === undefined) return;
    busyRef.current = true;
    const clientRequestId = last.clientRequestId ?? crypto.randomUUID();
    // L'alerte qui a le focus disparaît : le focus va dans le champ pendant l'attente.
    fieldRef.current?.focus();
    // Même bulle de question : seul l'état de la réponse reprend.
    setExchanges((current) =>
      current.map((exchange) =>
        exchange.id === last.id ? { ...exchange, clientRequestId, reply: { kind: "pending" }, stored: false } : exchange,
      ),
    );
    void ask(last.question, last.id, clientRequestId);
  }

  // « + Nouvelle Conversation » sur /assistant, alors qu'une Conversation y a été commencée : l'écran
  // revient à l'état vide sans rechargement (l'adresse /assistant est reprise). Sur /assistant/[id], le
  // lien ouvre /assistant normalement.
  function startNewConversation(event: React.MouseEvent<HTMLAnchorElement>) {
    if (conversation) return;
    event.preventDefault();
    controllerRef.current?.abort();
    controllerRef.current = null;
    busyRef.current = false;
    conversationIdRef.current = null;
    setConversationId(null);
    setExchanges([]);
    setEmptyRefused(false);
    setSourceSelection(null);
    window.history.pushState(null, "", addressOf(null, measuring));
    // Revue de la story 5.6 (constat 4) : les 5 dernières Conversations, rendues au chargement, sont
    // relues pour inclure celle qui vient d'être commencée.
    router.refresh();
    fieldRef.current?.focus();
  }

  // Retour du focus à la puce d'origine ; puce devenue non cliquable (Document supprimé) : champ.
  const focusSourceChip = useCallback(() => {
    const key = sourceChipRef.current;
    const chip = key ? document.getElementById(key) : null;
    if (chip instanceof HTMLButtonElement) chip.focus();
    else fieldRef.current?.focus();
  }, []);

  // Une puce ouvre le panneau, ou remplace son contenu ; l'Historique se ferme (un seul panneau à la fois).
  function openSource(selection: SourceSelection) {
    if (historyOpen) changeHistoryOpen(false);
    sourceChipRef.current = selection.key;
    setSourceSelection(selection);
  }

  // ✕, Échap, « ← Retour à la Conversation ». Aside : focus rendu aussitôt à la puce ; Sheet : à la fin
  // de sa fermeture (onSheetClosed).
  // Échap avec le focus hors de l'aside (restoreFocus faux) : fermé sans déplacer le focus.
  const closeSource = useCallback((restoreFocus = true) => {
    if (wide) {
      flushSync(() => setSourceSelection(null));
      if (restoreFocus) focusSourceChip();
    } else {
      setSourceSelection(null);
    }
  }, [wide, focusSourceChip]);

  const markDeleted = useCallback((documentId: string) => {
    setDeletedDocuments((current) => (current.has(documentId) ? current : new Set(current).add(documentId)));
  }, []);

  function changeHistoryOpen(open: boolean) {
    // Ouvrir l'Historique ferme le panneau Source (un seul panneau à la fois, EXPERIENCE.md).
    if (open) setSourceSelection(null);
    setHistoryOpen(open);
    // Panneau ouvert par ?historique=1 puis fermé : l'adresse n'ouvre plus le panneau au rechargement.
    if (!open && historyParam) window.history.replaceState(null, "", addressOf(conversationIdRef.current, measuring));
  }

  // « Poser une première question » (Historique vide) : focus dans le champ d'une nouvelle Conversation.
  function askFirst() {
    if (conversation) router.push(ASSISTANT_HREF);
  }

  // « Reformuler la question » : la question revient dans le champ, focus et curseur à la fin.
  function reformulate(question: string) {
    flushSync(() => {
      setValue(question);
      setEmptyRefused(false);
    });
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    // Composition en cours (IME, touches mortes) : Entrée valide la composition, rien n'est envoyé.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send();
  }

  const sourceProps: SourceChipsProps = {
    selectedKey: sourceSelection?.key ?? null,
    deleted: deletedDocuments,
    onOpen: openSource,
  };

  const helpId = `${ASSISTANT_FIELD_ID}-aide`;
  const counterId = `${ASSISTANT_FIELD_ID}-compteur`;
  const errorId = `${ASSISTANT_FIELD_ID}-erreur`;

  return (
    // ≥ 1024 px : panneau Source à droite du fil, la Conversation reste visible et utilisable.
    <div className="flex min-w-0 items-start gap-6">
      <div ref={containerRef} className="flex min-w-0 flex-1 flex-col gap-6">
        {/* En-tête de l'Assistant (EXPERIENCE.md, E4) : titre, « Historique », « + Nouvelle Conversation ». */}
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 [overflow-wrap:anywhere]">{title}</div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <HistorySheet
              open={historyOpen}
              onOpenChange={changeHistoryOpen}
              activeId={conversationId}
              container={historyContainer}
              onFieldFocus={() => fieldRef.current?.focus()}
              onAskFirst={askFirst}
            />
            <Button asChild variant="outline">
              <Link href={ASSISTANT_HREF} onClick={startNewConversation}>
                {texts.history.newConversation}
              </Link>
            </Button>
          </div>
        </div>
        {/* Accueil du panneau Historique : avant le fil dans le DOM (E4b). */}
        <div ref={setHistoryContainer} data-history-container />

        {exchanges.length === 0 ? <p className="text-sm text-foreground">{t.intro}</p> : null}

        {exchanges.length > 0 ? (
          <ol aria-label={t.threadLabel} className="flex min-w-0 flex-col gap-4">
            {exchanges.map((exchange, index) => {
              const isLast = index === exchanges.length - 1;
              return (
                <ExchangeItems
                  key={exchange.id}
                  exchange={exchange}
                  isLast={isLast}
                  alertRef={isLast ? alertRef : undefined}
                  sources={sourceProps}
                  onRetry={retry}
                  onReformulate={() => reformulate(exchange.question)}
                />
              );
            })}
          </ol>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          className="flex min-w-0 flex-col gap-1.5"
        >
          <label htmlFor={ASSISTANT_FIELD_ID} className="sr-only">
            {t.fieldLabel}
          </label>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              ref={fieldRef}
              id={ASSISTANT_FIELD_ID}
              name="question"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setEmptyRefused(false);
              }}
              onKeyDown={onKeyDown}
              placeholder={t.placeholder}
              rows={2}
              aria-invalid={fieldIssue !== null || undefined}
              aria-describedby={`${helpId} ${counterId}${fieldIssue ? ` ${errorId}` : ""}`}
              enterKeyHint="send"
              className={`field-sizing-content max-h-[7.5rem] min-h-16 w-full min-w-0 resize-none rounded-md border bg-background px-3 py-2 text-[15px] text-foreground sm:max-h-[10.5rem] ${
                tooLong ? "border-destructive" : "border-input"
              }`}
            />
            <Button type="submit" aria-disabled={busy || undefined} className="h-10 w-full aria-disabled:opacity-80 sm:w-auto">
              {t.submit}
            </Button>
          </div>
          <div className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
            <p id={helpId} className="text-muted-foreground">
              {t.keyboardHelp}
            </p>
            <p id={counterId} data-counter className={tooLong ? "font-medium text-destructive" : "text-muted-foreground"}>
              {t.counter(questionLength, CHAT_MAX_QUESTION_LENGTH)}
            </p>
          </div>
          {/* Toujours présent : le message de saisie est annoncé quand il apparaît. */}
          <p id={errorId} aria-live="polite" className="text-sm text-destructive">
            {fieldIssue === "tooLong" ? t.questionTooLong : fieldIssue === "empty" ? t.questionEmpty : null}
          </p>
        </form>

        {conversationId === null ? recent : null}

        {measuring ? <MeasurePanel measures={measures} /> : null}
      </div>
      <SourcePanel
        selection={sourceSelection}
        wide={wide}
        onClose={closeSource}
        onSheetClosed={focusSourceChip}
        onDeleted={markDeleted}
      />
    </div>
  );
}

type ExchangeItemsProps = {
  exchange: Exchange;
  // Dernier échange du fil : seul à porter la région d'annonce, l'alerte annoncée et « Réessayer ».
  isLast: boolean;
  alertRef?: React.Ref<HTMLDivElement>;
  sources: SourceChipsProps;
  onRetry: () => void;
  onReformulate: () => void;
};

// Puces de Source (story 5.7) : puce montrée par le panneau, Documents supprimés pendant la visite, ouverture.
type SourceChipsProps = {
  selectedKey: string | null;
  deleted: ReadonlySet<string>;
  onOpen: (selection: SourceSelection) => void;
};

// Un échange du fil : « Vous » (bulle de question à droite), puis « Assistant » (réponse, refus, état
// neutre, texte provisoire ou alerte de panne).
function ExchangeItems({ exchange, isLast, alertRef, sources, onRetry, onReformulate }: ExchangeItemsProps) {
  const { reply } = exchange;
  const body = (
    <>
      {reply.kind === "pending" ? (
        <p data-pending className="flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          {t.pending}
        </p>
      ) : null}
      {reply.kind === "answer" ? <Answer exchangeId={exchange.id} content={reply.content} sources={reply.sources} chips={sources} /> : null}
      {reply.kind === "refusal" ? <RefusalText variant={reply.variant} /> : null}
    </>
  );
  return (
    <>
      <li className="flex min-w-0 justify-end">
        <div
          data-question-bubble
          className="max-w-[75%] min-w-0 rounded-xl rounded-br-[2px] border border-border bg-surface px-4 py-3 text-[15px] text-foreground"
        >
          <span className="sr-only">{t.you} : </span>
          <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{exchange.question}</span>
        </div>
      </li>
      <li className="flex min-w-0 flex-col gap-2" data-exchange-reply={reply.kind}>
        <p className="text-sm font-semibold text-primary">{t.assistantLabel}</p>
        {/* Cadre toujours rendu : pour un refus, il porte la bordure et le fond du bloc de refus
            (texte et suites forment un seul bloc à l'écran). Région d'annonce sur le dernier échange
            seulement, toujours rendue (jamais masquée, même vide) : l'état neutre y est annoncé, puis
            remplacé par la réponse ou le texte du refus, annoncés une seule fois. Les suites du refus
            restent hors de la région (décision du 2026-11-17). */}
        <div data-refusal={reply.kind === "refusal" ? reply.variant : undefined} className={reply.kind === "refusal" ? REFUSAL_FRAME : "min-w-0"}>
          {isLast ? (
            <div role="status" className="min-w-0">
              {body}
            </div>
          ) : (
            <div className="min-w-0">{body}</div>
          )}
          {/* Texte provisoire (story 5.5) : hors de la région d'annonce (jamais lu morceau par morceau),
              aria-busy ; la réponse validée le remplace dans la région et y est annoncée une seule fois. */}
          {reply.kind === "streaming" ? (
            <p
              data-provisional
              aria-busy="true"
              className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground [overflow-wrap:anywhere]"
            >
              <span className="sr-only">{t.provisionalLabel} : </span>
              {reply.text}
            </p>
          ) : null}
          {reply.kind === "refusal" ? <RefusalActions variant={reply.variant} question={exchange.question} onReformulate={onReformulate} /> : null}
        </div>
        {reply.kind === "error" ? <FailureAlert ref={alertRef} error={reply.error} onRetry={isLast ? onRetry : undefined} live={isLast} /> : null}
      </li>
    </>
  );
}

// Instrument de mesure du flux (story 5.5, ?mesure=1) : résultat Markdown sans identifiant, jeton ni
// e-mail (stream-measure.ts), affiché et copiable.
function MeasurePanel({ measures }: { measures: Measure[] }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const markdown = measureMarkdown(measures);
  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }
  return (
    <section data-measure aria-labelledby="mesure-titre" className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-4 text-sm">
      <h2 id="mesure-titre" className="font-semibold text-foreground">
        {t.measureTitle}
      </h2>
      <p className="text-muted-foreground">{t.measureHelp}</p>
      <p data-measure-count className="text-foreground">
        {t.measureCount(measures.length)}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => void copy()} disabled={measures.length === 0}>
          {t.measureCopy}
        </Button>
        <p aria-live="polite" className="text-muted-foreground">
          {copyState === "copied" ? t.measureCopied : copyState === "failed" ? t.measureCopyFailed : null}
        </p>
      </div>
      {measures.length > 0 ? (
        <pre data-measure-result className="max-h-64 overflow-auto rounded-md bg-surface p-3 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
          {markdown}
        </pre>
      ) : null}
    </section>
  );
}

// Segments du texte de la réponse : texte brut ou renvoi vers la Source de numéro n (1 à sources).
// Le texte enregistré par chat porte les renvois canoniques [S{n}] (story 5.4, AD-11) ; un renvoi sans
// Source correspondante est retiré. Story 5.6 : les repères bruts [P{n}] des réponses enregistrées
// avant la 5.4 sont retirés, sans renvoi (stripRawCitations). Le texte n'est jamais interprété comme du
// HTML.
type AnswerSegment = { kind: "text"; text: string } | { kind: "renvoi"; ordinal: number };

const RENVOI = /\[S(\d+)\]/g;

export function answerSegments(raw: string, sourceCount: number): AnswerSegment[] {
  const content = stripRawCitations(raw);
  const segments: AnswerSegment[] = [];
  let last = 0;
  const pushText = (text: string) => {
    if (text === "") return;
    const previous = segments.at(-1);
    if (previous?.kind === "text") previous.text += text;
    else segments.push({ kind: "text", text });
  };
  for (const match of content.matchAll(RENVOI)) {
    pushText(content.slice(last, match.index));
    last = match.index + match[0].length;
    const ordinal = Number(match[1]);
    if (ordinal >= 1 && ordinal <= sourceCount) segments.push({ kind: "renvoi", ordinal });
  }
  pushText(content.slice(last));
  return segments;
}

// Réponse sourcée, d'un bloc, en texte brut avec ses renvois ¹ ² (non cliquables, précédés du texte
// masqué « Source ») ; puces de Source numérotées, qui ouvrent le panneau Source (story 5.7).
type AnswerProps = { exchangeId: string; content: string; sources: ThreadSource[]; chips: SourceChipsProps };

function Answer({ exchangeId, content, sources, chips }: AnswerProps) {
  return (
    <div data-answer className="flex min-w-0 flex-col gap-3">
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
        {answerSegments(content, sources.length).map((segment, index, segments) =>
          segment.kind === "text" ? (
            segment.text
          ) : (
            <Fragment key={index}>
              {/* Texte masqué « Source » précédé d'un espace (le renvoi est collé au mot) ; renvois consécutifs
                  séparés à la lecture (« Source 2, Source 1 ») ; la marge les sépare à l'écran. */}
              {segments[index - 1]?.kind === "renvoi" ? <span className="sr-only">,</span> : null}
              <sup
                data-renvoi={segment.ordinal}
                className="ms-0.5 rounded-sm border border-accent-line bg-accent-soft px-1 text-[0.7em] font-medium text-accent-text"
              >
                <span className="sr-only">{` ${t.citationPrefix} `}</span>
                {segment.ordinal}
              </sup>
            </Fragment>
          ),
        )}
      </p>
      {sources.length > 0 ? (
        <ul aria-label={t.sourcesLabel} className="flex min-w-0 flex-wrap gap-2">
          {sources.map((source, index) => (
            <SourceChip
              key={`${source.documentId ?? "supprime"}-${index}`}
              chipId={sourceChipId(exchangeId, index + 1)}
              source={source}
              ordinal={index + 1}
              chips={chips}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Identifiant d'une puce : cible de la fermeture du panneau (retour du focus).
const sourceChipId = (exchangeId: string, ordinal: number) => `source-${exchangeId}-${ordinal}`;

type SourceChipProps = { chipId: string; source: ThreadSource; ordinal: number; chips: SourceChipsProps };

// Puce « {n} · {titre} » (« · {k} Passages » si plusieurs) ; points médians masqués, nom accessible
// « Source {n} : {titre}, {k} Passages ». Story 5.7 (UX-DR10) : button (Entrée, Espace, clic) avec
// aria-expanded et aria-controls vers le panneau Source, « sélectionnée » (fond accent-mark) tant que le
// panneau la montre. Source supprimée (documentId nul, ou 404 à l'ouverture pendant la visite) : texte
// simple, non focalisable, style barré, numéro gardé.
function SourceChip({ chipId, source, ordinal, chips }: SourceChipProps) {
  const { documentId } = source;
  const deleted = documentId === null || chips.deleted.has(documentId);
  const label = deleted ? t.sourceDeleted(source.title) : source.title;
  const count = source.passageCount;
  const content = (
    <>
      <span aria-hidden="true">
        {ordinal} · {label}
        {count > 1 ? <span className="font-normal"> · {t.passagesCount(count)}</span> : null}
      </span>
      <span className="sr-only">{t.sourceName(ordinal, label, count)}</span>
    </>
  );
  if (documentId === null || deleted) {
    return (
      <li
        data-source-chip
        data-deleted
        className="max-w-full rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted-foreground line-through [overflow-wrap:anywhere]"
      >
        {content}
      </li>
    );
  }
  const selected = chips.selectedKey === chipId;
  return (
    <li data-source-chip className="max-w-full">
      <button
        type="button"
        id={chipId}
        aria-expanded={selected}
        aria-controls={SOURCE_PANEL_ID}
        data-selected={selected || undefined}
        onClick={() =>
          chips.onOpen({ key: chipId, documentId, title: source.title, passages: source.passages, textVersion: source.textVersion })
        }
        className={`max-w-full rounded-full border px-3 py-1 text-left text-sm font-medium text-accent-text [overflow-wrap:anywhere] hover:bg-accent-mark ${
          selected ? "border-accent-text bg-accent-mark" : "border-accent-line bg-accent-soft"
        }`}
      >
        {content}
      </button>
    </li>
  );
}

// Bloc de refus (UX-DR11, story 5.3) : un seul cadre (fond, bordure), distinct d'une réponse et d'une
// panne (jamais rouge), sans Source. Le texte (icône et phrase) est dans la région d'annonce, les suites
// juste après, hors de la région. Information absente : trois suites ; hors cadre : « Reformuler » seul.
const REFUSAL_FRAME = "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-[15px] text-foreground";

function RefusalText({ variant }: { variant: RefusalVariant }) {
  return (
    <div data-refusal-text className="flex min-w-0 items-start gap-3">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 [overflow-wrap:anywhere]">{variant === "info_absente" ? t.refusalInfoAbsente : t.refusalHorsCadre}</p>
    </div>
  );
}

type RefusalActionsProps = { variant: RefusalVariant; question: string; onReformulate: () => void };

// Boutons secondaires (contour), alignés sous le texte (après l'icône).
function RefusalActions({ variant, question, onReformulate }: RefusalActionsProps) {
  return (
    <div data-refusal-actions className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:pl-8">
      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onReformulate}>
        {t.reformulate}
      </Button>
      {variant === "info_absente" ? (
        <>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={searchHref(question) ?? SEARCH_PATH}>{t.searchDocuments}</Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={ADD_HREF}>{t.addDocument}</Link>
          </Button>
        </>
      ) : null}
    </div>
  );
}

// onRetry absent : « Réessayer » n'est proposé que sur le dernier échange du fil (story 5.6). live :
// alerte annoncée (dernier échange) ; une panne plus ancienne du fil est affichée sans être annoncée.
type FailureAlertProps = { error: ChatError; onRetry?: () => void; live?: boolean; ref?: React.Ref<HTMLDivElement> };

function FailureAlert({ error, onRetry, live = true, ref }: FailureAlertProps) {
  const failure = FAILURE_CODES.includes(error.code);
  return (
    <ErrorAlert
      ref={ref}
      live={live}
      title={failure ? t.failedTitle : error.message}
      action={
        onRetry && canRetry(error) ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            {t.retry}
          </Button>
        ) : undefined
      }
    >
      {failure ? error.message : null}
    </ErrorAlert>
  );
}
