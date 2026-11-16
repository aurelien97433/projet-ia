import Link from "next/link";
import { ASSISTANT_HREF } from "@/components/assistant/constants";
import { ADD_HREF } from "@/components/shell/nav-items";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";
import { DashboardSearch } from "./dashboard-search";

// Bande d'actions du Tableau de bord (E3), hors de la frontière Suspense de la liste : utilisable dès
// le premier affichage, pendant le chargement comme en cas d'erreur de la liste. À 375 px, les
// éléments s'empilent et les boutons prennent toute la largeur.
export function ActionBand() {
  return (
    <div data-action-band className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Champ de Recherche en tête de la bande (story 4.1b) ; focus au changement d'écran. */}
      <DashboardSearch />
      {/* Story 5.2b : nouvelle Conversation, focus dans le champ de question (PageTitle). Style
          secondaire (contour) : « Ajouter un Document » reste le seul bouton plein (décision du
          2026-11-16, vérification en production). */}
      <Button asChild variant="outline" className="w-full sm:w-auto">
        <Link href={ASSISTANT_HREF}>{texts.assistant.askQuestion}</Link>
      </Button>
      <Button asChild className="w-full sm:w-auto">
        <Link href={ADD_HREF}>{texts.library.addDocument}</Link>
      </Button>
    </div>
  );
}
