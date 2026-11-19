import { z } from "zod";
import { ERROR_CODES } from "@/lib/errors";

// Assistant (story 5.2a-2). Mêmes règles que supabase/functions/_shared/chat.ts et _shared/config.ts
// (les Edge Functions n'importent rien de src/ : un test vérifie l'égalité des limites).
export const CHAT_MAX_QUESTION_LENGTH = 2_000;

// Question de 1 à 2 000 caractères après suppression des espaces ; identifiant de demande UUID ;
// Conversation à poursuivre (story 5.6), facultative : absente ou null, une nouvelle Conversation est créée.
export const chatRequestSchema = z.object({
  question: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(CHAT_MAX_QUESTION_LENGTH)),
  clientRequestId: z.uuid().transform((value) => value.toLowerCase()),
  conversationId: z
    .uuid()
    .nullish()
    .transform((value) => value?.toLowerCase() ?? undefined),
});

// conversationId facultatif (absent : nouvelle Conversation).
export type ChatRequest = Omit<z.infer<typeof chatRequestSchema>, "conversationId"> & { conversationId?: string };

// Raison d'un refus de saisie : question vide (ou faite d'espaces), trop longue, ou autre demande
// invalide (identifiant absent ou invalide, corps illisible).
export type ChatQuestionIssue = "empty" | "tooLong";
export type ChatRequestParse = { ok: true; data: ChatRequest } | { ok: false; reason: ChatQuestionIssue | "invalid" };

// Contrôle de la question seule, partagé par le navigateur (avant tout appel) et la route.
export function questionIssue(question: string): ChatQuestionIssue | null {
  const length = question.trim().length;
  if (length === 0) return "empty";
  return length > CHAT_MAX_QUESTION_LENGTH ? "tooLong" : null;
}

export function parseChatRequest(body: unknown): ChatRequestParse {
  const parsed = chatRequestSchema.safeParse(body);
  if (parsed.success) return { ok: true, data: parsed.data };
  const question = (body as { question?: unknown } | null)?.question;
  const issue = typeof question === "string" ? questionIssue(question) : null;
  return { ok: false, reason: issue ?? "invalid" };
}

// Réponse relayée au navigateur. Les objets zod retirent toute clé non déclarée.
export const chatResponseSchema = z.object({
  conversationId: z.uuid(),
  message: z.object({
    kind: z.enum(["answer", "refusal_info_absente", "refusal_hors_cadre"]),
    content: z.string().min(1),
    sources: z
      .array(
        z.object({
          documentId: z.uuid().nullable(),
          title: z.string().min(1),
          passageNumbers: z.array(z.number().int().min(1).max(8)).min(1),
        }),
      )
      .max(8),
  }),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

// Événements du flux de chat (story 5.5), relayés tels quels par /api/chat : texte provisoire (delta),
// refus d'un bloc (refusal), réponse validée (done, même forme que chatResponseSchema), panne (error,
// forme AD-19 sans enveloppe).
export const chatDeltaSchema = z.object({ text: z.string().min(1) });
// Story 5.6 (Q3 = A) : refusal et error portent la Conversation créée ou poursuivie (facultative : une
// panne avant sa création n'en a pas).
export const chatRefusalEventSchema = z.object({
  conversationId: z.uuid().optional(),
  kind: z.enum(["refusal_info_absente", "refusal_hors_cadre"]),
  content: z.string().min(1),
});
export const chatErrorEventSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string().min(1),
  retryable: z.boolean(),
  conversationId: z.uuid().optional(),
});

// Listes de Conversations (story 5.6) : GET /api/conversations, Historique et 5 dernières. unanswered :
// dernier échange sans réponse ni refus, en échec ou en attente depuis plus de 90 s (« Sans réponse »).
export const CONVERSATIONS_MAX_LIMIT = 100;
export const RECENT_CONVERSATIONS_LIMIT = 5;

export const conversationListItemSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  lastMessageAt: z.iso.datetime({ offset: true }),
  unanswered: z.boolean(),
});
export type ConversationListItem = z.infer<typeof conversationListItemSchema>;

export const conversationsResponseSchema = z.object({ conversations: z.array(conversationListItemSchema) });
export type ConversationsResponse = z.infer<typeof conversationsResponseSchema>;

// ?limit= de GET /api/conversations : entier de 1 à 100, 100 par défaut ; null si invalide.
export function parseConversationsLimit(value: string | null): number | null {
  if (value === null) return CONVERSATIONS_MAX_LIMIT;
  if (!/^[0-9]{1,3}$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= CONVERSATIONS_MAX_LIMIT ? limit : null;
}
