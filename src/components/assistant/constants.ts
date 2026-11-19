import { CHAT_MAX_QUESTION_LENGTH } from "@/lib/schemas/chat";

// Champ de question de la page Assistant (story 5.2b) : cible du focus au changement d'écran (PageTitle).
export const ASSISTANT_FIELD_ID = "assistant-question";

export const ASSISTANT_HREF = "/assistant";

// Assistant avec le panneau Historique ouvert (story 5.6, « Voir tout l'Historique »).
export const HISTORY_HREF = `${ASSISTANT_HREF}?historique=1`;

// Conversation enregistrée (story 5.6, /assistant/[id]).
export function conversationHref(id: string): string {
  return `${ASSISTANT_HREF}/${id}`;
}

// Ouvre l'Assistant avec une question pré-remplie (jamais envoyée d'office), 2 000 caractères au plus.
export function assistantHref(question: string): string {
  const prefill = question.trim().slice(0, CHAT_MAX_QUESTION_LENGTH);
  if (prefill.length === 0) return ASSISTANT_HREF;
  return `${ASSISTANT_HREF}?${new URLSearchParams({ question: prefill }).toString()}`;
}
