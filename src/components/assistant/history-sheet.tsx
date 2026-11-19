"use client";

import { History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SlowLoadingNotice } from "@/components/documents/slow-loading-notice";
import { ErrorAlert } from "@/components/forms/error-alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { type ConversationListItem, CONVERSATIONS_MAX_LIMIT, conversationsResponseSchema } from "@/lib/schemas/chat";
import { texts } from "@/lib/texts";
import { ConversationRows } from "./conversation-rows";

const t = texts.history;
const SKELETON_ROWS = 6;

type HistoryState = { status: "loading" } | { status: "error" } | { status: "ready"; conversations: ConversationListItem[] };

type HistorySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Conversation ouverte dans l'Assistant (mise en évidence, focus à l'ouverture) ; null sans Conversation.
  activeId: string | null;
  // Élément d'accueil du panneau, placé avant le fil dans le DOM (EXPERIENCE.md, E4b).
  container: HTMLElement | null;
  // Conversation choisie, ou « Poser une première question » : le panneau se ferme et le focus va dans
  // le champ de question, pas sur « Historique ».
  onFieldFocus: () => void;
  // « Poser une première question » (Historique vide).
  onAskFirst: () => void;
};

// Panneau Historique (story 5.6, E4b, UX-DR16) : bouton « Historique » de l'en-tête de l'Assistant et
// Sheet modal à gauche à toutes les largeurs (plein écran sous 768 px). Liste lue à chaque ouverture
// par GET /api/conversations (100 au plus, plus récente d'abord). Focus à l'ouverture sur la
// Conversation active, sinon sur la première ligne ; choisir une ligne ouvre la Conversation, ferme le
// panneau et place le focus dans le champ ; Échap rend le focus à « Historique » (Radix).
export function HistorySheet({ open, onOpenChange, activeId, container, onFieldFocus, onAskFirst }: HistorySheetProps) {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const toFieldRef = useRef(false);

  // Revue de la story 5.6 (constat 6) : chaque ouverture repart de l'état « chargement », quelle qu'en
  // soit l'origine (bouton, ou ?historique=1 depuis « Voir tout l'Historique »), pour ne jamais montrer
  // ni focaliser la liste lue à l'ouverture précédente.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setState({ status: "loading" });
  }

  // Lecture à l'ouverture (et à « Réessayer ») ; l'état « chargement » est posé par les gestionnaires
  // d'ouverture et de « Réessayer ».
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/conversations?limit=${CONVERSATIONS_MAX_LIMIT}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const parsed = conversationsResponseSchema.safeParse(response.ok ? await response.json() : undefined);
        if (controller.signal.aborted) return;
        setState(parsed.success ? { status: "ready", conversations: parsed.data.conversations } : { status: "error" });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [open, attempt]);

  // Liste chargée : focus sur la Conversation active, sinon sur la première ligne.
  useEffect(() => {
    if (!open || state.status !== "ready") return;
    const list = listRef.current;
    const target =
      list?.querySelector<HTMLElement>("a[aria-current='page']") ?? list?.querySelector<HTMLElement>("a") ?? null;
    target?.focus();
  }, [open, state]);

  function changeOpen(next: boolean) {
    if (next) {
      toFieldRef.current = false;
      setState({ status: "loading" });
    }
    onOpenChange(next);
  }

  function toField(action: () => void) {
    toFieldRef.current = true;
    onOpenChange(false);
    action();
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" data-history-trigger>
          <History aria-hidden="true" className="size-4" />
          {t.open}
        </Button>
      </SheetTrigger>
      <SheetContent
        ref={contentRef}
        side="left"
        container={container}
        aria-describedby={undefined}
        data-history-panel
        className="w-full max-w-none gap-0 overflow-y-auto p-4 pt-14 md:w-96 md:max-w-sm"
        onOpenAutoFocus={(event) => {
          // Le focus attend la liste (Conversation active ou première ligne) ; en attendant, le panneau.
          event.preventDefault();
          contentRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (!toFieldRef.current) return;
          event.preventDefault();
          toFieldRef.current = false;
          onFieldFocus();
        }}
      >
        <SheetTitle className="mb-3 text-base">{t.title}</SheetTitle>
        <div ref={listRef} className="flex min-w-0 flex-col gap-3">
          {state.status === "loading" ? (
            <div className="flex flex-col gap-4">
              <div aria-hidden="true" data-skeleton-rows className="flex animate-pulse flex-col gap-3">
                {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <div key={index} className="h-12 w-full rounded-md bg-surface" />
                ))}
              </div>
              <SlowLoadingNotice />
            </div>
          ) : null}
          {state.status === "error" ? (
            <ErrorAlert
              title={t.loadFailed}
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setState({ status: "loading" });
                    setAttempt((value) => value + 1);
                  }}
                >
                  {t.retry}
                </Button>
              }
            />
          ) : null}
          {state.status === "ready" && state.conversations.length === 0 ? (
            <div className="flex flex-col items-start gap-3 text-sm text-foreground">
              <p>{t.empty}</p>
              <Button type="button" onClick={() => toField(onAskFirst)}>
                {t.firstQuestion}
              </Button>
            </div>
          ) : null}
          {state.status === "ready" && state.conversations.length > 0 ? (
            <ConversationRows
              conversations={state.conversations}
              label={t.title}
              activeId={activeId}
              onChoose={() => toField(() => {})}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
