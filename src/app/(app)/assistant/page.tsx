import { Suspense } from "react";
import { ASSISTANT_FIELD_ID } from "@/components/assistant/constants";
import { AssistantView } from "@/components/assistant/assistant-view";
import { PageTitle } from "@/components/shell/page-title";
import { texts } from "@/lib/texts";

// E4 · Assistant (story 5.2b). Le titre appartient à la partie prérendue ; la vue lit `?question=`
// dans le navigateur (useSearchParams, sous Suspense) : la page prérendue ne contient ni question ni
// réponse. Écran de saisie : au changement d'écran, le champ de question reçoit le focus.
export default function AssistantPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageTitle focusTargetId={ASSISTANT_FIELD_ID}>{texts.titles.assistantEmpty}</PageTitle>
      <Suspense fallback={<AssistantFallback />}>
        <AssistantView />
      </Suspense>
    </div>
  );
}

// Repli prérendu : la phrase d'introduction est déjà lisible, la place du champ est réservée.
function AssistantFallback() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="text-sm text-foreground">{texts.assistant.intro}</p>
      <div aria-hidden="true" className="h-24 w-full animate-pulse rounded-md bg-surface" />
    </div>
  );
}
