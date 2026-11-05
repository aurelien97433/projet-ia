"use server";

import { redirect } from "next/navigation";
import { NEXT_PARAM, safeNextPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { signIn, type SignInResult } from "@/server/auth/sign-in";

// Server Action de connexion (FR-2). En cas de succès, la session est posée dans les cookies et le
// Collaborateur arrive sur la page demandée, filtrée ici côté serveur (chemin interne uniquement),
// sinon sur le Tableau de bord. Sinon, le résultat ne contient que des messages du catalogue.
export async function signInAction(formData: FormData): Promise<SignInResult> {
  const supabase = await createClient();
  const result = await signIn({ email: formData.get("email"), password: formData.get("password") }, supabase.auth);
  if (result.status === "success") redirect(safeNextPath(formData.get(NEXT_PARAM)));
  return result;
}
