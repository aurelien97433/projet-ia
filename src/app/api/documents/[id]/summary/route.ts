import { NextResponse } from "next/server";
import { z } from "zod";
import { appError, type AppError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { requireUser } from "@/server/auth/require-user";
import { relaySummary } from "@/server/summary/relay";

// Runtime Node.js par défaut (Cache Components interdit l'export `runtime`). 150 s (story 6.1, AD-16) :
// summarize s'arrête à 120 s, le relais à 125 s, la page abandonne à 130 s.
export const maxDuration = 150;

const NO_STORE = { "Cache-Control": "no-store" };

const failure = (body: AppError, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

// « Générer le Résumé » (story 6.1) : le navigateur n'appelle jamais l'Edge Function ni le fournisseur
// d'IA. La route vérifie la session, l'identifiant (non UUID : même 404 NOT_FOUND neutre qu'un Document
// absent), puis relaie vers summarize avec le jeton d'accès de la session (jamais service_role). Le
// corps de la requête n'est pas lu : seul l'identifiant de l'URL compte.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser();
    if (!auth.user) return failure({ error: auth.error }, 401);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return failure(appError("NOT_FOUND", texts.notFound.text, false), 404);

    const { data } = await (await createClient()).auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return failure(appError("UNAUTHENTICATED", texts.session.expired, false), 401);

    const { status, body } = await relaySummary(id.toLowerCase(), accessToken, request.signal);
    return NextResponse.json(body, { status, headers: NO_STORE });
  } catch {
    return failure(appError("INTERNAL", texts.summary.failed, true), 500);
  }
}
