"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signUp, type SignUpResult } from "@/server/auth/sign-up";

// Server Action de création de Compte (FR-1). En cas de succès, la session est posée dans les
// cookies et le Collaborateur arrive sur le Tableau de bord. Sinon, le résultat ne contient
// que des messages du catalogue : ni mot de passe ni détail technique.
export async function signUpAction(formData: FormData): Promise<SignUpResult> {
  const supabase = await createClient();
  const result = await signUp({ email: formData.get("email"), password: formData.get("password") }, supabase.auth);
  if (result.status === "success") redirect("/");
  return result;
}
