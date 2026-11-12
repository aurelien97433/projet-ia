"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/require-user";
import { createNote, type CreateNoteResult } from "@/server/documents/create-note";
import { importFile, type ImportFileResult } from "@/server/documents/import-file";
import { triggerProcessing } from "@/server/documents/trigger-processing";

// Server Action de création d'une Note (FR-4). La session est vérifiée ici même : une action peut
// être appelée sans passer par la page. En cas de succès, traitement déclenché puis page du Document.
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
  if (result.status === "created") {
    if (result.attemptToStart) await triggerProcessing(result.id, result.attemptToStart, supabase);
    redirect(`/documents/${result.id}`);
  }
  return result;
}

// Server Action d'import d'un fichier déjà déposé (FR-5, story 2.6a). Même déroulé qu'une Note : le
// Document n'est créé qu'après la vérification de l'objet par la base (AD-7).
export async function importFileAction(formData: FormData): Promise<ImportFileResult> {
  const auth = await requireUser();
  if (!auth.user) return { status: "error", error: auth.error };

  const supabase = await createClient();
  const result = await importFile(
    {
      title: formData.get("title"),
      category: formData.get("category"),
      uploadId: formData.get("uploadId"),
      clientRequestId: formData.get("clientRequestId"),
    },
    auth.user.id,
    supabase,
  );
  if (result.status === "created") {
    if (result.attemptToStart) await triggerProcessing(result.id, result.attemptToStart, supabase);
    redirect(`/documents/${result.id}`);
  }
  return result;
}
