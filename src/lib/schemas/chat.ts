import { z } from "zod";

// Assistant (story 5.2a-2). Mêmes règles que supabase/functions/_shared/chat.ts et _shared/config.ts
// (les Edge Functions n'importent rien de src/ : un test vérifie l'égalité des limites).
export const CHAT_MAX_QUESTION_LENGTH = 2_000;

// Question de 1 à 2 000 caractères après suppression des espaces ; identifiant de demande UUID.
export const chatRequestSchema = z.object({
  question: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(CHAT_MAX_QUESTION_LENGTH)),
  clientRequestId: z.uuid().transform((value) => value.toLowerCase()),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

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
