import { DEFAULT_NEXT_PATH, NEXT_PARAM } from "./safe-redirect";

// Routes de l'authentification (FR-2). Seules ces pages sont accessibles sans session.
export const SIGN_IN_PATH = "/connexion";
export const SIGN_UP_PATH = "/inscription";
export const PUBLIC_PATHS: readonly string[] = [SIGN_IN_PATH, SIGN_UP_PATH];

// Paramètre posé après la déconnexion pour afficher « Vous êtes déconnecté. ».
export const SIGNED_OUT_PARAM = "deconnecte";

// Décision du proxy pour une requête : null pour la laisser passer, sinon l'URL relative de
// redirection. Une page publique n'est jamais redirigée vers elle-même ni vers une autre page
// publique, et un Collaborateur connecté n'est jamais renvoyé vers une page publique : aucune boucle.
export function accessRedirect(pathname: string, search: string, signedIn: boolean): string | null {
  const isPublic = PUBLIC_PATHS.includes(pathname);
  if (signedIn) return isPublic ? DEFAULT_NEXT_PATH : null;
  if (isPublic) return null;
  if (pathname === DEFAULT_NEXT_PATH && !search) return SIGN_IN_PATH;
  return `${SIGN_IN_PATH}?${new URLSearchParams({ [NEXT_PARAM]: `${pathname}${search}` })}`;
}
