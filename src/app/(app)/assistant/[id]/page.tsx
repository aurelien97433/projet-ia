import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AssistantView } from "@/components/assistant/assistant-view";
import { ASSISTANT_FIELD_ID } from "@/components/assistant/constants";
import { PageTitle } from "@/components/shell/page-title";
import { createClient } from "@/lib/supabase/server";
import { getConversation } from "@/server/conversations/get-conversation";
import ConversationLoading from "./loading";

// E4 · Conversation enregistrée (story 5.6, FR-20) : titre de la Conversation (h1), fil de tous les
// échanges avec leurs Sources, champ en bas pour poursuivre. Lue côté serveur avec le jeton du
// Collaborateur (RLS, jamais service_role). Identifiant non UUID, Conversation absente ou d'un autre
// Compte : E9, identique dans tous les cas, sans rien révéler (FR-22, UX-DR29, exigence S4).
export default async function ConversationPage({ params }: PageProps<"/assistant/[id]">) {
  // Lecture liée à la requête : le client Supabase compare l'expiration du jeton à l'heure courante, et
  // l'état « en cours » d'une question dépend de l'heure de la lecture.
  await connection();
  const { id } = await params;
  const conversation = await getConversation(id, await createClient());
  if (!conversation) notFound();

  // La vue lit ?mesure=1 et ?historique=1 (useSearchParams) : frontière Suspense. Clé : une autre
  // Conversation ouverte depuis l'Historique repart d'un état neuf.
  return (
    <Suspense fallback={<ConversationLoading />}>
      <AssistantView
        key={conversation.id}
        title={<PageTitle focusTargetId={ASSISTANT_FIELD_ID}>{conversation.title}</PageTitle>}
        conversation={conversation}
      />
    </Suspense>
  );
}
