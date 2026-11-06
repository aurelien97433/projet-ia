import { NextResponse } from "next/server";
import { appError, type AppError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { requireUser } from "@/server/auth/require-user";
import { getDocumentStatus } from "@/server/documents/get-document-status";

const NO_STORE = { "Cache-Control": "no-store" };

const failure = (body: AppError, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

// Statut effectif d'un Document, interrogé par le bandeau de la page Document (AD-6). Le proxy
// laisse passer /api/ : cette route vérifie elle-même la session et répond en JSON.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.user) return failure({ error: auth.error }, 401);

  const { id } = await params;
  try {
    const status = await getDocumentStatus(id, await createClient());
    if (!status) return failure(appError("NOT_FOUND", texts.notFound.text, false), 404);
    return NextResponse.json(status, { headers: NO_STORE });
  } catch {
    return failure(appError("INTERNAL", texts.documentStatus.statusUnavailable, true), 500);
  }
}
