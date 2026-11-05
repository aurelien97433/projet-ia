"use server";

import { redirect } from "next/navigation";
import { logEvent } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { SIGNED_OUT_PARAM, SIGN_IN_PATH } from "@/lib/auth/routes";

// Server Action de déconnexion (FR-2). Portée « local » : seule la session de ce navigateur est
// fermée, les autres appareils du Collaborateur restent connectés. Même si le serveur Auth refuse
// la révocation, supabase-js efface la session locale (cookies) : ce navigateur est déconnecté,
// et le jeton d'actualisation non révoqué expirera de lui-même.
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) logEvent("sign_out_failed", { code: error.code || "unknown", status: error.status });
  redirect(`${SIGN_IN_PATH}?${SIGNED_OUT_PARAM}=1`);
}
