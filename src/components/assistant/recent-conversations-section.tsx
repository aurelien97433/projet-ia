import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SlowLoadingNotice } from "@/components/documents/slow-loading-notice";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { RECENT_CONVERSATIONS_LIMIT } from "@/lib/schemas/chat";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { getCurrentUser } from "@/server/auth/current-user";
import { listConversations } from "@/server/conversations/list-conversations";
import { assistantHref, HISTORY_HREF } from "./constants";
import { ConversationRows } from "./conversation-rows";
import { RecentConversationsError } from "./recent-conversations-error";

export const RECENT_CONVERSATIONS_HEADING_ID = "dernieres-conversations";

// « Mes dernières Conversations » (story 5.6) : section du Tableau de bord (E3) et de l'état vide de
// l'Assistant (E4), avec « Voir tout l'Historique » (/assistant?historique=1 ouvre le panneau). La liste
// est lue à la requête dans sa propre frontière Suspense (squelettes, puis message des 10 s).
export function RecentConversationsSection() {
  return (
    <section aria-labelledby={RECENT_CONVERSATIONS_HEADING_ID} data-recent-conversations className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={RECENT_CONVERSATIONS_HEADING_ID} tabIndex={-1} className="text-base font-semibold text-foreground">
          {texts.history.recentTitle}
        </h2>
        <Link href={HISTORY_HREF} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {texts.history.seeAll}
        </Link>
      </div>
      <Suspense fallback={<RecentConversationsSkeleton />}>
        <RecentConversations />
      </Suspense>
    </section>
  );
}

function RecentConversationsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden="true" data-skeleton-rows className="flex animate-pulse flex-col gap-3">
        {Array.from({ length: RECENT_CONVERSATIONS_LIMIT }, (_, index) => (
          <div key={index} className="h-12 w-full rounded-md bg-surface" />
        ))}
      </div>
      <SlowLoadingNotice />
    </div>
  );
}

// Les 5 dernières Conversations du Collaborateur connecté, lues avec son jeton (RLS). Vide : « Vous
// n'avez pas encore posé de question. » et deux exemples du mini Jeu, qui préremplissent le champ de
// l'Assistant (?question=, jamais envoyés d'office : aucune unité consommée sans envoi). Lecture en
// échec : alerte confinée à la liste, avec « Réessayer ».
async function RecentConversations() {
  await connection();
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  if (!user) redirect(SIGN_IN_PATH);

  let conversations;
  try {
    conversations = await listConversations(supabase, RECENT_CONVERSATIONS_LIMIT);
  } catch {
    // Détail déjà journalisé par listConversations.
    return <RecentConversationsError />;
  }

  if (conversations.length === 0) {
    return (
      <div data-recent-empty className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-foreground">
        <p>{texts.history.noQuestionYet}</p>
        <ul aria-label={texts.history.examplesLabel} className="flex min-w-0 flex-col gap-2">
          {texts.history.examples.map((example) => (
            <li key={example} className="min-w-0">
              <Link href={assistantHref(example)} className="font-medium [overflow-wrap:anywhere] text-primary underline-offset-4 hover:underline">
                {example}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <ConversationRows conversations={conversations} label={texts.history.recentTitle} />;
}
