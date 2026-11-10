import { NextResponse } from "next/server";
import { appError, type AppError } from "@/lib/errors";
import { parseStatusIds } from "@/lib/schemas/library";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { requireUser } from "@/server/auth/require-user";
import { getDocumentStatuses } from "@/server/documents/list-documents";

const NO_STORE = { "Cache-Control": "no-store" };

const failure = (body: AppError, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

// Statuts effectifs des Documents *en cours* affichés par la Bibliothèque, en une requête groupée
// (AD-6) : `?ids=uuid,uuid`, 200 au plus. Seuls `id` et le Statut effectif sont renvoyés.
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.user) return failure({ error: auth.error }, 401);

  const ids = parseStatusIds(new URL(request.url).searchParams);
  if (!ids) return failure(appError("VALIDATION_FAILED", texts.documentStatus.statusUnavailable, false), 400);

  try {
    const statuses = await getDocumentStatuses(ids, await createClient());
    return NextResponse.json({ statuses }, { headers: NO_STORE });
  } catch {
    return failure(appError("INTERNAL", texts.documentStatus.statusUnavailable, true), 500);
  }
}
