import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string };

// Collaborateur de la requête en cours, ou null. getClaims vérifie la signature du jeton (clés de
// signature du projet, ou appel au serveur Auth pour une clé symétrique) : jamais getSession côté
// serveur, dont le contenu vient du cookie sans vérification. Ce résultat ne sert qu'à l'affichage
// et aux redirections ; les droits sur les données restent contrôlés par la RLS (AD-2).
// Mis en cache pour la durée d'un rendu : la barre latérale et le menu mobile le lisent tous deux.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Lecture liée à la requête : getClaims compare l'expiration du jeton à l'heure courante, valeur
  // que cacheComponents refuse pendant le pré-rendu.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});
