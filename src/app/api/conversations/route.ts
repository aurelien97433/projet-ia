import { NextResponse } from "next/server";
import { appError, type AppError } from "@/lib/errors";
import { parseConversationsLimit } from "@/lib/schemas/chat";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { requireUser } from "@/server/auth/require-user";
import { listConversations } from "@/server/conversations/list-conversations";

const NO_STORE = { "Cache-Control": "no-store" };

const failure = (body: AppError, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

// Historique (story 5.6, E4b) : Conversations du Collaborateur connecté, de la plus récente à la plus
// ancienne, 100 au plus (?limit=). Le proxy laisse passer /api/ : la route vérifie elle-même la
// session ; la lecture se fait avec son jeton (RLS, jamais service_role). Erreurs : forme AD-19.
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.user) return failure({ error: auth.error }, 401);

  const limit = parseConversationsLimit(new URL(request.url).searchParams.get("limit"));
  if (limit === null) return failure(appError("VALIDATION_FAILED", texts.history.loadFailed, false), 400);

  try {
    const conversations = await listConversations(await createClient(), limit);
    return NextResponse.json({ conversations }, { headers: NO_STORE });
  } catch {
    return failure(appError("INTERNAL", texts.history.loadFailed, true), 500);
  }
}
