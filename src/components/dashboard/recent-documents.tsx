import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ADD_HREF } from "@/components/shell/nav-items";
import { Button } from "@/components/ui/button";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { DEFAULT_LIBRARY_FILTERS } from "@/lib/schemas/library";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { getCurrentUser } from "@/server/auth/current-user";
import { listDocuments, type LibraryPage } from "@/server/documents/list-documents";
import { RECENT_DOCUMENTS_LIMIT } from "./constants";
import { RecentDocumentsError } from "./recent-documents-error";
import { RecentDocumentsList } from "./recent-documents-list";

// « Derniers Documents » (E3) : les 5 derniers Documents de la Base commune, tous Statuts, lus côté
// serveur avec le jeton du Collaborateur. Rendu dans sa propre frontière Suspense : la lecture est
// liée à la requête, la liste n'est jamais prérendue. Une lecture en échec reste confinée à la liste.
export async function RecentDocuments() {
  await connection();
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  if (!user) redirect(SIGN_IN_PATH);

  let page: LibraryPage;
  try {
    page = await listDocuments(DEFAULT_LIBRARY_FILTERS, user.id, supabase, RECENT_DOCUMENTS_LIMIT);
  } catch {
    // Détail déjà journalisé par listDocuments.
    return <RecentDocumentsError />;
  }

  if (page.documents.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-foreground">
        <p>{texts.library.emptyBase}</p>
        <Button asChild>
          <Link href={ADD_HREF}>{texts.library.addDocument}</Link>
        </Button>
      </div>
    );
  }

  // Clé tirée des lignes reçues : une nouvelle lecture (Réessayer, retour sur la page) repart de
  // l'état du serveur plutôt que des Statuts suivis côté client.
  const key = page.documents.map((document) => `${document.id}:${document.effectiveStatus}`).join(",");
  return <RecentDocumentsList key={key} documents={page.documents} userId={user.id} />;
}
