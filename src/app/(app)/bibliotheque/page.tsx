import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LibraryView } from "@/components/library/library-view";
import { PageTitle } from "@/components/shell/page-title";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { DEFAULT_LIBRARY_FILTERS } from "@/lib/schemas/library";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { getCurrentUser } from "@/server/auth/current-user";
import { listDocuments, type LibraryPage } from "@/server/documents/list-documents";

// E6 · Bibliothèque : la première liste (filtres par défaut) est lue côté serveur, sans aller-retour
// au premier affichage ; les changements de filtre passent ensuite par GET /api/documents.
export default async function LibraryPage() {
  // Lecture liée à la requête : la page reste dynamique, aucune donnée n'est prérendue.
  await connection();
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  if (!user) redirect(SIGN_IN_PATH);

  // Lecture impossible : la page s'affiche avec l'alerte et « Réessayer » (filtres par défaut).
  let initial: LibraryPage | null = null;
  try {
    initial = await listDocuments(DEFAULT_LIBRARY_FILTERS, user.id, supabase);
  } catch {
    initial = null;
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageTitle>{texts.titles.library}</PageTitle>
      <LibraryView initial={initial} userId={user.id} />
    </div>
  );
}
