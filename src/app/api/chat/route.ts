import { NextResponse } from "next/server";
import { appError, type AppError } from "@/lib/errors";
import { parseChatRequest } from "@/lib/schemas/chat";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { requireUser } from "@/server/auth/require-user";
import { relayChat, relayChatStream } from "@/server/chat/relay";

// Runtime Node.js par défaut (Cache Components interdit l'export `runtime`). 120 s (AD-16) : le flux
// dure au plus 85 s côté chat et 90 s côté navigateur ; le relais JSON attend au plus 70 s ; Vercel
// Hobby autorise jusqu'à 300 s.
export const maxDuration = 120;

const NO_STORE = { "Cache-Control": "no-store" };

const failure = (body: AppError, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

// Question à l'Assistant (story 5.2a-2) : le navigateur n'appelle jamais l'Edge Function ni le
// fournisseur d'IA. La route vérifie la session, revalide la demande, puis relaie vers chat avec le
// jeton d'accès de la session. Story 5.5 : flux SSE relayé tel quel si le navigateur l'accepte
// (« Accept: text/event-stream ») ; sinon réponse JSON d'un bloc (page ouverte avant le push). La
// question n'est jamais reprise dans une réponse d'erreur ni dans les journaux.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.user) return failure({ error: auth.error }, 401);

  const parsed = parseChatRequest(await request.json().catch(() => undefined));
  if (!parsed.ok) {
    // Saisie invalide (story 5.2b, report g) : jamais le texte de panne du service d'IA.
    const message =
      parsed.reason === "empty"
        ? texts.assistant.questionEmpty
        : parsed.reason === "tooLong"
          ? texts.assistant.questionTooLong
          : texts.assistant.invalidRequest;
    return failure(appError("VALIDATION_FAILED", message, false), 400);
  }

  const { data } = await (await createClient()).auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return failure(appError("UNAUTHENTICATED", texts.session.expired, false), 401);

  if ((request.headers.get("Accept") ?? "").includes("text/event-stream")) {
    return relayChatStream(parsed.data, accessToken, request.signal);
  }
  const { status, body } = await relayChat(parsed.data, accessToken, request.signal);
  return NextResponse.json(body, { status, headers: NO_STORE });
}
