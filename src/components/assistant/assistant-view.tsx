"use client";

import { Info } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ErrorAlert } from "@/components/forms/error-alert";
import { Button } from "@/components/ui/button";
import { ERROR_CODES, type ErrorCode } from "@/lib/errors";
import {
  CHAT_MAX_QUESTION_LENGTH,
  type ChatQuestionIssue,
  type ChatResponse,
  chatResponseSchema,
  questionIssue,
} from "@/lib/schemas/chat";
import { texts } from "@/lib/texts";
import { ASSISTANT_FIELD_ID } from "./constants";

const t = texts.assistant;

// Délai côté navigateur, au-delà duquel la question est considérée comme en échec (décision du
// 2026-11-16). Chaîne des délais : chat 60 s < relais 70 s < navigateur 85 s < maxDuration 120 s ; le
// relais ne démarre qu'après requireUser, getSession et un éventuel démarrage à froid.
export const CHAT_CLIENT_TIMEOUT_MS = 85_000;

type ChatSource = ChatResponse["message"]["sources"][number];
type ChatError = { code: ErrorCode; message: string; retryable: boolean };
type Reply =
  | { kind: "pending" }
  | { kind: "answer"; content: string; sources: ChatSource[] }
  | { kind: "refusal"; content: string }
  | { kind: "error"; error: ChatError };
// Un seul échange à l'écran (décision du 2026-11-16) : une nouvelle question remplace le précédent.
type Exchange = { id: number; question: string; reply: Reply };

// Corps d'erreur AD-19 renvoyé par /api/chat ; le message vient déjà du catalogue (relais).
const errorBodySchema = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string().min(1), retryable: z.boolean() }),
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
// Jamais de « Réessayer » : le quota ou le plafond ne reviennent pas avant l'heure indiquée, et un
// double envoi (409) est déjà en cours.
const NO_RETRY_CODES: readonly ErrorCode[] = ["QUOTA_EXCEEDED", "AI_DAILY_CAP_REACHED", "REQUEST_IN_PROGRESS"];

const unavailable = (): Reply => ({ kind: "error", error: { code: "AI_UNAVAILABLE", message: t.failed, retryable: true } });
const timedOut = (): Reply => ({ kind: "error", error: { code: "AI_TIMEOUT", message: t.failed, retryable: true } });

function toReply(data: ChatResponse): Reply {
  return data.message.kind === "refusal_info_absente"
    ? { kind: "refusal", content: data.message.content }
    : { kind: "answer", content: data.message.content, sources: data.message.sources };
}

const canRetry = (error: ChatError) => error.retryable && !NO_RETRY_CODES.includes(error.code);

// Page Assistant (E4, story 5.2b). Le navigateur n'appelle que POST /api/chat (jamais une Edge
// Function ni le fournisseur d'IA). Chaque question crée sa Conversation et remplace l'échange affiché.
// La réponse, d'un bloc, est affichée en texte brut, citations [P{n}] comprises (retirées en 5.4).
export function AssistantView() {
  const router = useRouter();
  const raw = useSearchParams().get("question");
  const prefill = (raw ?? "").slice(0, CHAT_MAX_QUESTION_LENGTH);

  const [value, setValue] = useState(prefill);
  const [syncedRaw, setSyncedRaw] = useState(raw);
  // Nouvelle adresse (retour arrière, autre question pré-remplie) : le champ reprend la question.
  if (raw !== syncedRaw) {
    setSyncedRaw(raw);
    setValue(prefill);
  }

  const [exchange, setExchange] = useState<Exchange | null>(null);
  // Question vide refusée à l'envoi ; la longueur, elle, est contrôlée à chaque frappe.
  const [emptyRefused, setEmptyRefused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(1);
  // Occupé dès la première activation, avant même le rendu suivant (second clic ignoré).
  const busyRef = useRef(false);

  const busy = exchange?.reply.kind === "pending";
  // Longueur après suppression des espaces de bord, comme le schéma et la route : compteur et
  // contrôle mesurent la même chose.
  const questionLength = value.trim().length;
  const tooLong = questionLength > CHAT_MAX_QUESTION_LENGTH;
  const fieldIssue: ChatQuestionIssue | null = tooLong ? "tooLong" : emptyRefused ? "empty" : null;

  async function ask(question: string, exchangeId: number) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    let expired = false;
    const timeout = setTimeout(() => {
      expired = true;
      controller.abort();
    }, CHAT_CLIENT_TIMEOUT_MS);
    const isCurrent = () => controllerRef.current === controller;

    let reply: Reply = unavailable();
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Nouvel identifiant à chaque envoi, « Réessayer » compris (décision du 2026-11-16).
        body: JSON.stringify({ question, clientRequestId: crypto.randomUUID() }),
        cache: "no-store",
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => undefined);
      if (!isCurrent()) return;
      // Session expirée : le rafraîchissement renvoie vers la page de connexion.
      if (response.status === 401) router.refresh();
      if (response.ok) {
        const parsed = chatResponseSchema.safeParse(body);
        if (parsed.success) reply = toReply(parsed.data);
      } else {
        const parsed = errorBodySchema.safeParse(body);
        if (parsed.success) reply = { kind: "error", error: parsed.data.error };
        else if (response.status === 401) {
          reply = { kind: "error", error: { code: "UNAUTHENTICATED", message: texts.session.expired, retryable: false } };
        }
      }
    } catch {
      // Réseau ou abandon : panne, sauf si une autre demande a pris le relais.
    } finally {
      clearTimeout(timeout);
    }
    if (!isCurrent()) return;
    if (expired) reply = timedOut();
    controllerRef.current = null;
    busyRef.current = false;
    // Erreur sans « Réessayer » (saisie invalide, double envoi, quota, plafond, session) : la question
    // revient dans le champ s'il est resté vide, pour être corrigée ou renvoyée plus tard.
    if (reply.kind === "error" && !canRetry(reply.error)) setValue((current) => (current === "" ? question : current));
    setExchange((current) => (current?.id === exchangeId ? { ...current, reply } : current));
  }

  useEffect(() => () => controllerRef.current?.abort(), []);

  // Issue affichée : erreur → focus sur l'alerte ; réponse ou refus → le focus reste dans le champ
  // (ou y revient depuis « Envoyer » ou « Réessayer »), sauf s'il a été posé ailleurs entre-temps.
  const replyKind = exchange?.reply.kind;
  useEffect(() => {
    if (replyKind === undefined || replyKind === "pending") return;
    const active = document.activeElement;
    const free = active === null || active === document.body || containerRef.current?.contains(active) === true;
    if (!free) return;
    if (replyKind === "error") alertRef.current?.focus();
    else if (active !== fieldRef.current) fieldRef.current?.focus();
  }, [replyKind, exchange?.id]);

  function send() {
    if (busyRef.current) return;
    const issue = questionIssue(value);
    if (issue) {
      setEmptyRefused(issue === "empty");
      fieldRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setEmptyRefused(false);
    const question = value.trim();
    const id = nextIdRef.current++;
    setExchange({ id, question, reply: { kind: "pending" } });
    setValue("");
    void ask(question, id);
  }

  function retry() {
    if (busyRef.current || exchange === null) return;
    busyRef.current = true;
    // L'alerte qui a le focus disparaît : le focus va dans le champ pendant l'attente.
    fieldRef.current?.focus();
    // Même bulle de question : seul l'état de la réponse reprend.
    setExchange({ ...exchange, reply: { kind: "pending" } });
    void ask(exchange.question, exchange.id);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    // Composition en cours (IME, touches mortes) : Entrée valide la composition, rien n'est envoyé.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send();
  }

  const helpId = `${ASSISTANT_FIELD_ID}-aide`;
  const counterId = `${ASSISTANT_FIELD_ID}-compteur`;
  const errorId = `${ASSISTANT_FIELD_ID}-erreur`;

  return (
    <div ref={containerRef} className="flex min-w-0 flex-col gap-6">
      {exchange === null ? <p className="text-sm text-foreground">{t.intro}</p> : null}

      {exchange !== null ? (
        // Sans clé : la région d'annonce reste en place d'une question à l'autre (nouvelles annonces).
        <ol aria-label={t.threadLabel} className="flex min-w-0 flex-col gap-4">
          <li className="flex min-w-0 justify-end">
            <div
              data-question-bubble
              className="max-w-[75%] min-w-0 rounded-xl rounded-br-[2px] border border-border bg-surface px-4 py-3 text-[15px] text-foreground"
            >
              <span className="sr-only">{t.you} : </span>
              <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{exchange.question}</span>
            </div>
          </li>
          <li className="flex min-w-0 flex-col gap-2">
            <p className="text-sm font-semibold text-primary">{t.assistantLabel}</p>
            {/* Région toujours rendue (jamais masquée, même vide) : l'état neutre y est annoncé, puis
                remplacé par la réponse ou le refus, annoncés une seule fois, une fois confirmés. */}
            <div role="status" className="min-w-0">
              {exchange.reply.kind === "pending" ? (
                <p data-pending className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
                  {t.pending}
                </p>
              ) : null}
              {exchange.reply.kind === "answer" ? <Answer content={exchange.reply.content} sources={exchange.reply.sources} /> : null}
              {exchange.reply.kind === "refusal" ? <Refusal content={exchange.reply.content} /> : null}
            </div>
            {exchange.reply.kind === "error" ? (
              <FailureAlert ref={alertRef} error={exchange.reply.error} onRetry={retry} />
            ) : null}
          </li>
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
    </div>
  );
}

// Réponse sourcée, d'un bloc, en texte brut ; puces de Source non cliquables (cliquables en 5.7).
function Answer({ content, sources }: { content: string; sources: ChatSource[] }) {
  return (
    <div data-answer className="flex min-w-0 flex-col gap-3">
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground [overflow-wrap:anywhere]">{content}</p>
      {sources.length > 0 ? (
        <ul aria-label={t.sourcesLabel} className="flex min-w-0 flex-wrap gap-2">
          {sources.map((source, index) => (
            <li
              key={`${source.documentId ?? "supprime"}-${index}`}
              data-source-chip
              data-deleted={source.documentId === null || undefined}
              className={
                source.documentId === null
                  ? "max-w-full rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted-foreground line-through [overflow-wrap:anywhere]"
                  : "max-w-full rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-sm font-medium text-accent-text [overflow-wrap:anywhere]"
              }
            >
              {source.documentId === null ? t.sourceDeleted(source.title) : source.title}
              {source.passageNumbers.length > 1 ? (
                <span className="font-normal"> · {t.passagesCount(source.passageNumbers.length)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Refus provisoire (information absente) : bloc distinct d'une réponse, sans Source ni bouton (5.3).
function Refusal({ content }: { content: string }) {
  return (
    <div data-refusal className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface p-4 text-[15px] text-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 [overflow-wrap:anywhere]">{content}</p>
    </div>
  );
}

type FailureAlertProps = { error: ChatError; onRetry: () => void; ref: React.Ref<HTMLDivElement> };

function FailureAlert({ error, onRetry, ref }: FailureAlertProps) {
  const failure = FAILURE_CODES.includes(error.code);
  return (
    <ErrorAlert
      ref={ref}
      title={failure ? t.failedTitle : error.message}
      action={
        canRetry(error) ? (
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
