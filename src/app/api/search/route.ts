import { NextResponse } from "next/server";
import { appError, type AppError } from "@/lib/errors";
import { parseSearchRequest } from "@/lib/schemas/search";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { requireUser } from "@/server/auth/require-user";
import { relaySearch } from "@/server/search/semantic-search";

const NO_STORE = { "Cache-Control": "no-store" };

const failure = (body: AppError, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

// Recherche sémantique (story 4.1a, FR-14) : le navigateur n'appelle jamais l'Edge Function ni le
// fournisseur d'IA. Le proxy laisse passer /api/ : cette route vérifie elle-même la session, revalide la
// Requête, puis relaie vers semantic-search avec le jeton d'accès de la session, vérifié à nouveau
// par la passerelle et par la fonction. La Requête n'est jamais reprise dans une réponse d'erreur.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.user) return failure({ error: auth.error }, 401);

  const query = parseSearchRequest(await request.json().catch(() => undefined));
  if (!query) return failure(appError("VALIDATION_FAILED", texts.search.failed, false), 400);

  // Jeton lu dans le cookie de session : sa validité vient d'être contrôlée par requireUser
  // (getClaims), et semantic-search le vérifie encore auprès du serveur Auth.
  const { data } = await (await createClient()).auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return failure(appError("UNAUTHENTICATED", texts.session.expired, false), 401);

  const { status, body } = await relaySearch(query, accessToken);
  return NextResponse.json(body, { status, headers: NO_STORE });
}
