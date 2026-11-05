import { texts } from "@/lib/texts";
import { getCurrentUser } from "@/server/auth/current-user";

// E-mail du Collaborateur en pied de barre latérale (EXPERIENCE.md, Navigation). Lit la session :
// à placer sous Suspense (cacheComponents). Sans session, SessionGate redirige déjà vers la Connexion.
export async function UserEmail() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <p className="truncate px-3 pb-1 text-xs font-medium text-muted-foreground" title={user.email}>
      <span className="sr-only">{texts.shell.accountLabel} : </span>
      {user.email}
    </p>
  );
}

// Réserve la hauteur de la ligne pendant la lecture de la session.
export function UserEmailFallback() {
  return <p aria-hidden="true" className="h-5 px-3 pb-1" />;
}
