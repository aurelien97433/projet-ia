import { connection } from "next/server";
import { Suspense } from "react";
import { ASSISTANT_FIELD_ID } from "@/components/assistant/constants";
import { AssistantView } from "@/components/assistant/assistant-view";
import { RecentConversationsSection } from "@/components/assistant/recent-conversations-section";
import { PageTitle } from "@/components/shell/page-title";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { getQuota } from "@/server/quota/get-quota";

// E4 · Assistant sans Conversation active (stories 5.2b et 5.6). Le titre est rendu aussi par le repli
// prérendu ; la vue lit `?question=`, `?historique=1` et `?mesure=1` (useSearchParams, sous Suspense) :
// la page prérendue ne contient ni question ni réponse. Story 5.10 (Q1 = A) : le quota du Collaborateur
// est lu à la requête, avec son jeton (RLS), dans la même frontière Suspense, et passé à la vue (bloc de
// limite atteinte d'emblée). Sous le champ, les 5 dernières Conversations, lues à la requête dans leur
// propre frontière Suspense. Écran de saisie : au changement d'écran, le champ de question reçoit le focus.
export default function AssistantPage() {
  return (
    <Suspense fallback={<AssistantFallback />}>
      <AssistantWithQuota />
    </Suspense>
  );
}

async function AssistantWithQuota() {
  // Lecture liée à la requête (compteur du jour, heure courante).
  await connection();
  const quota = await getQuota(await createClient());
  return (
    <AssistantView
      title={<PageTitle focusTargetId={ASSISTANT_FIELD_ID}>{texts.titles.assistantEmpty}</PageTitle>}
      recent={<RecentConversationsSection />}
      quota={quota}
    />
  );
}

// Repli prérendu : le titre et la phrase d'introduction sont déjà lisibles, la place du champ est
// réservée. Titre sans gestion du focus : seul celui de la vue la décide (jamais au premier chargement).
function AssistantFallback() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-xl leading-tight font-[650] text-foreground">{texts.titles.assistantEmpty}</h1>
      <p className="text-sm text-foreground">{texts.assistant.intro}</p>
      <div aria-hidden="true" className="h-24 w-full animate-pulse rounded-md bg-surface" />
    </div>
  );
}
