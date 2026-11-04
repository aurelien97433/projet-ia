import "server-only";
import type { AuthError, SupabaseClient } from "@supabase/supabase-js";
import { appError, logEvent, type AppError } from "@/lib/errors";
import { signUpSchema } from "@/lib/schemas/auth";
import { texts } from "@/lib/texts";

export type SignUpFieldErrors = { email?: string; password?: string };

// Résultat renvoyé au navigateur : ne contient jamais le mot de passe.
export type SignUpResult =
  | { status: "success" }
  | { status: "invalid"; fieldErrors: SignUpFieldErrors; emailTaken?: boolean }
  | ({ status: "error" } & AppError);

type AuthClient = Pick<SupabaseClient["auth"], "signUp">;

const EMAIL_TAKEN_CODES = new Set(["user_already_exists", "email_exists"]);
const INVALID_EMAIL_CODES = new Set(["email_address_invalid"]);
const WEAK_PASSWORD_CODES = new Set(["weak_password"]);

function unexpected(): SignUpResult {
  return { status: "error", ...appError("INTERNAL", texts.signUp.errors.unexpectedTitle, true) };
}

function fromAuthError(error: AuthError): SignUpResult {
  const code = error.code ?? "";
  if (EMAIL_TAKEN_CODES.has(code)) {
    return { status: "invalid", fieldErrors: { email: texts.signUp.errors.emailTaken }, emailTaken: true };
  }
  if (INVALID_EMAIL_CODES.has(code)) {
    return { status: "invalid", fieldErrors: { email: texts.signUp.errors.invalidEmail } };
  }
  if (WEAK_PASSWORD_CODES.has(code)) {
    // Supabase indique les motifs du refus (length, characters, pwned) : seul un refus pour la
    // seule longueur reçoit le message « 8 caractères » ; tout autre refus, le message générique.
    const reasons = "reasons" in error && Array.isArray(error.reasons) ? (error.reasons as string[]) : [];
    const onlyLength = reasons.length > 0 && reasons.every((reason) => reason === "length");
    const message = onlyLength ? texts.signUp.errors.passwordTooShort : texts.signUp.errors.passwordRejected;
    return { status: "invalid", fieldErrors: { password: message } };
  }
  logEvent("sign_up_failed", { code: code || "unknown", status: error.status });
  return unexpected();
}

// Crée un Compte (FR-1) sans confirmation par e-mail : la session est ouverte par le client
// Supabase serveur, qui pose les cookies. La ligne profiles est créée par déclencheur.
export async function signUp(input: { email: unknown; password: unknown }, auth: AuthClient): Promise<SignUpResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: SignUpFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === "email" || field === "password") && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { status: "invalid", fieldErrors };
  }

  try {
    const { data, error } = await auth.signUp({ email: parsed.data.email, password: parsed.data.password });
    if (error) return fromAuthError(error);
    // Sans session, la confirmation par e-mail serait activée : configuration à corriger.
    if (!data.session) {
      logEvent("sign_up_without_session", { code: "email_confirmation_enabled" });
      return unexpected();
    }
    return { status: "success" };
  } catch {
    logEvent("sign_up_failed", { code: "exception" });
    return unexpected();
  }
}
