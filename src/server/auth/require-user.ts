import "server-only";
import { appError, type AppError } from "@/lib/errors";
import { texts } from "@/lib/texts";
import { getCurrentUser, type CurrentUser } from "./current-user";

export type RequireUserResult = { user: CurrentUser } | ({ user: null } & AppError);

// À appeler en tête de chaque Server Action d'un écran protégé, avant toute écriture : le proxy et
// la coquille ne protègent pas une action appelée directement (identifiants d'action globaux).
// La RLS reste la barrière finale sur les données.
export async function requireUser(): Promise<RequireUserResult> {
  const user = await getCurrentUser();
  if (user) return { user };
  return { user: null, ...appError("UNAUTHENTICATED", texts.session.expired, false) };
}
