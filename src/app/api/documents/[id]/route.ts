import { NextResponse } from "next/server";
import { appError, type AppError } from "@/lib/errors";
import type { SourceDocument } from "@/lib/schemas/chat";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { requireUser } from "@/server/auth/require-user";
import { getDocument } from "@/server/documents/get-document";

// Jamais en cache, succès comme erreurs (exigence R2 de la story 5.7).
const NO_STORE = { "Cache-Control": "no-store" };

const failure = (body: AppError, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

// Document lu à l'ouverture du panneau Source (story 5.7, Q3 = A). Le proxy laisse passer /api/ : la
// route vérifie elle-même la session (401 sans aucune lecture, R3) puis lit avec le client Supabase de
// la session du Collaborateur (RLS), jamais service_role (R1). Identifiant non UUID, Document
// inexistant ou supprimé : même 404 NOT_FOUND neutre, statut et corps identiques (R4).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Tout le gestionnaire dans le try : même une panne de session répond 500 no-store au format AD-19 (R2).
  try {
    const auth = await requireUser();
    if (!auth.user) return failure({ error: auth.error }, 401);
    const { id } = await params;
    const document = await getDocument(id, await createClient());
    if (!document) return failure(appError("NOT_FOUND", texts.notFound.text, false), 404);
    const body: SourceDocument = {
      id: document.id,
      title: document.title,
      category: document.category,
      authorName: document.authorName,
      createdAt: document.createdAt,
      status: document.effectiveStatus,
      textVersion: document.textVersion,
      content: document.content,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch {
    return failure(appError("INTERNAL", texts.sourcePanel.loadFailed, true), 500);
  }
}
