"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/require-user";
import { createNote, type CreateNoteResult } from "@/server/documents/create-note";

// Server Action de création d'une Note (FR-4). La session est vérifiée ici même : une action peut
// être appelée sans passer par la page. En cas de succès, page du Document avec la notification.
export async function createNoteAction(formData: FormData): Promise<CreateNoteResult> {
  const auth = await requireUser();
  if (!auth.user) return { status: "error", error: auth.error };

  const supabase = await createClient();
  const result = await createNote(
    {
      title: formData.get("title"),
      category: formData.get("category"),
      content: formData.get("content"),
      clientRequestId: formData.get("clientRequestId"),
    },
    auth.user.id,
    supabase,
  );
  if (result.status === "created") redirect(`/documents/${result.id}?ajoute=1`);
  return result;
}
