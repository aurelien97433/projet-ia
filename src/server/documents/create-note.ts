import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appError, logEvent, type AppError } from "@/lib/errors";
import { noteSchema } from "@/lib/schemas/documents";
import { texts } from "@/lib/texts";

export type NoteFieldErrors = { title?: string; category?: string; content?: string };

// Résultat renvoyé au navigateur : identifiant du Document, ou messages du catalogue.
export type CreateNoteResult =
  | { status: "created"; id: string }
  | { status: "invalid"; fieldErrors: NoteFieldErrors }
  | ({ status: "error" } & AppError);

type Db = Pick<SupabaseClient, "from">;

const UNIQUE_VIOLATION = "23505";

function unexpected(): CreateNoteResult {
  return { status: "error", ...appError("INTERNAL", texts.addDocument.errors.saveFailed, true) };
}

// Crée une Note (FR-4) avec le client Supabase du Collaborateur : la RLS et les privilèges par
// colonne fixent l'Auteur, le Statut et la tentative. Idempotente (AD-16) : un même
// client_request_id renvoie le Document déjà créé par CE Collaborateur, jamais celui d'un autre.
// Journaux : codes et identifiants seulement, jamais le titre ni le texte.
export async function createNote(
  input: { title: unknown; category: unknown; content: unknown; clientRequestId: unknown },
  userId: string,
  db: Db,
): Promise<CreateNoteResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: NoteFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === "title" || field === "category" || field === "content") && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    // Identifiant de demande absent ou invalide : faute du client, pas de la saisie.
    if (Object.keys(fieldErrors).length === 0) {
      logEvent("create_note_invalid_request", { user_id: userId });
      return unexpected();
    }
    return { status: "invalid", fieldErrors };
  }

  const { title, category, content, clientRequestId } = parsed.data;
  try {
    const { data, error } = await db
      .from("documents")
      .insert({ title, category, content_text: content, client_request_id: clientRequestId })
      .select("id")
      .single();
    if (!error && data) return { status: "created", id: data.id as string };

    if (error?.code === UNIQUE_VIOLATION) {
      const { data: existing } = await db
        .from("documents")
        .select("id")
        .eq("author_id", userId)
        .eq("client_request_id", clientRequestId)
        .maybeSingle();
      if (existing) {
        logEvent("create_note_replayed", { user_id: userId, document_id: existing.id as string });
        return { status: "created", id: existing.id as string };
      }
    }
    logEvent("create_note_failed", { user_id: userId, code: error?.code ?? "no_data" });
    return unexpected();
  } catch {
    logEvent("create_note_failed", { user_id: userId, code: "exception" });
    return unexpected();
  }
}
