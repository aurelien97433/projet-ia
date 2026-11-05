import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appError, logEvent, type AppError } from "@/lib/errors";
import { signInSchema } from "@/lib/schemas/auth";
import { texts } from "@/lib/texts";

// Résultat renvoyé au navigateur : ne contient jamais le mot de passe, ni l'indication du champ fautif.
export type SignInResult =
  | { status: "success" }
  | { status: "invalid_credentials" }
  | ({ status: "error" } & AppError);

type AuthClient = Pick<SupabaseClient["auth"], "signInWithPassword">;

// email_not_confirmed : Compte créé quand la confirmation par e-mail était active sur le projet
// distant. Même message que des identifiants faux : la réponse ne distingue aucun cas.
const INVALID_CREDENTIALS_CODES = new Set(["invalid_credentials", "email_not_confirmed"]);

function unexpected(): SignInResult {
  return { status: "error", ...appError("INTERNAL", texts.signIn.errors.unexpected, true) };
}

// Ouvre une session (FR-2) : le client Supabase serveur pose les cookies de session.
export async function signIn(input: { email: unknown; password: unknown }, auth: AuthClient): Promise<SignInResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid_credentials" };

  try {
    const { data, error } = await auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) {
      if (error.code === "email_not_confirmed") {
        // Message identique pour le Collaborateur, mais signalé à l'exploitant : un Compte bloqué
        // par la confirmation par e-mail révèle une configuration contraire au MVP.
        logEvent("sign_in_unconfirmed", { code: error.code });
      }
      if (INVALID_CREDENTIALS_CODES.has(error.code ?? "")) return { status: "invalid_credentials" };
      logEvent("sign_in_failed", { code: error.code || "unknown", status: error.status });
      return unexpected();
    }
    if (!data.session) {
      logEvent("sign_in_failed", { code: "no_session" });
      return unexpected();
    }
    return { status: "success" };
  } catch {
    logEvent("sign_in_failed", { code: "exception" });
    return unexpected();
  }
}
