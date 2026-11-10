import { NextResponse } from "next/server";
import { appError, type AppError } from "@/lib/errors";
import { parseLibraryQuery } from "@/lib/schemas/library";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { requireUser } from "@/server/auth/require-user";
import { listDocuments } from "@/server/documents/list-documents";

const NO_STORE = { "Cache-Control": "no-store" };

const failure = (body: AppError, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

// Liste de la Bibliothèque pour un changement de filtre (FR-9). Le proxy laisse passer /api/ : cette
// route vérifie elle-même la session. Paramètre invalide : 400 neutre, la valeur n'est jamais reprise.
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.user) return failure({ error: auth.error }, 401);

  const filters = parseLibraryQuery(new URL(request.url).searchParams);
  if (!filters) return failure(appError("VALIDATION_FAILED", texts.library.loadFailed, false), 400);

  try {
    const page = await listDocuments(filters, auth.user.id, await createClient());
    return NextResponse.json(page, { headers: NO_STORE });
  } catch {
    return failure(appError("INTERNAL", texts.library.loadFailed, true), 500);
  }
}
