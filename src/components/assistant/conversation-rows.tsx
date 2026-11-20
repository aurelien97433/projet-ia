"use client";

import Link from "next/link";
import type { ConversationListItem } from "@/lib/schemas/chat";
import { texts } from "@/lib/texts";
import { useDisplayTimeZone } from "@/lib/use-hydrated";
import { conversationHref } from "./constants";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

// Date du dernier échange dans le fuseau du navigateur, en français (architecture §6). Revue de la
// story 5.6 (constat 2) : avec suppressHydrationWarning, React garde le texte du serveur sans le
// corriger, donc une heure UTC restait affichée. Le serveur et l'hydratation rendent la même date dans
// un fuseau fixe ; le navigateur passe à son propre fuseau aussitôt après.
export function ConversationDate({ iso }: { iso: string }) {
  // Fuseau fixe au rendu serveur et à l'hydratation, celui du navigateur ensuite (use-hydrated.ts).
  const timeZone = useDisplayTimeZone();
  const label = new Date(iso).toLocaleString("fr-FR", { ...DATE_FORMAT, timeZone });
  return <time dateTime={iso}>{label}</time>;
}

type ConversationRowsProps = {
  conversations: ConversationListItem[];
  label: string;
  // Conversation ouverte : mise en évidence, aria-current="page".
  activeId?: string | null;
  onChoose?: (id: string) => void;
};

// Lignes de Conversations (story 5.6) : Historique et 5 dernières. Une ligne = un lien (titre), avec la
// date du dernier échange et, pour un dernier échange sans réponse, la mention en texte « Sans réponse »
// (décision Q2 = A, jamais une couleur seule).
export function ConversationRows({ conversations, label, activeId = null, onChoose }: ConversationRowsProps) {
  return (
    <ul aria-label={label} className="flex min-w-0 flex-col border-t">
      {conversations.map((conversation) => {
        const active = conversation.id === activeId;
        return (
          <li key={conversation.id} data-conversation-id={conversation.id} className="min-w-0 border-b">
            <Link
              href={conversationHref(conversation.id)}
              aria-current={active ? "page" : undefined}
              onClick={() => onChoose?.(conversation.id)}
              className={`flex min-w-0 flex-col gap-0.5 rounded-sm px-2 py-3 hover:bg-surface ${active ? "bg-accent-soft" : ""}`}
            >
              <span className="font-medium [overflow-wrap:anywhere] text-primary">{conversation.title}</span>
              <span className="text-xs text-muted-foreground">
                <ConversationDate iso={conversation.lastMessageAt} />
                {conversation.unanswered ? <span data-unanswered> · {texts.history.unanswered}</span> : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
