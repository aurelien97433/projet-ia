import { redirect } from "next/navigation";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { getCurrentUser } from "@/server/auth/current-user";

// Seconde barrière après le proxy : le contenu d'un écran protégé n'est rendu qu'après la
// vérification de la session (sinon redirection vers la Connexion). À placer sous Suspense.
export async function SessionGate({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) redirect(SIGN_IN_PATH);
  return children;
}
