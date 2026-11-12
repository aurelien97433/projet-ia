import Link from "next/link";
import { Suspense } from "react";
import { ActionBand } from "@/components/dashboard/action-band";
import { DASHBOARD_SEARCH_FIELD_ID, RECENT_DOCUMENTS_HEADING_ID } from "@/components/dashboard/constants";
import { RecentDocuments } from "@/components/dashboard/recent-documents";
import { RecentDocumentsSkeleton } from "@/components/dashboard/recent-documents-skeleton";
import { PageTitle } from "@/components/shell/page-title";
import { texts } from "@/lib/texts";

// E3 · Tableau de bord. Titre, bande d'actions et en-tête de section appartiennent à la partie
// statique de la page ; seule la liste « Derniers Documents », lue à la requête, est dans une
// frontière Suspense (aucune donnée de Document dans la page prérendue).
export default function DashboardPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageTitle focusTargetId={DASHBOARD_SEARCH_FIELD_ID}>{texts.titles.dashboard}</PageTitle>
      <ActionBand />

      {/* Pleine largeur (Q2) ; la story 5.6 passera à deux colonnes avec « Mes dernières Conversations ». */}
      <section aria-labelledby={RECENT_DOCUMENTS_HEADING_ID} className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={RECENT_DOCUMENTS_HEADING_ID} tabIndex={-1} className="text-base font-semibold text-foreground">
            {texts.dashboard.recentDocuments}
          </h2>
          <Link href="/bibliotheque" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            {texts.dashboard.seeLibrary}
          </Link>
        </div>
        <Suspense fallback={<RecentDocumentsSkeleton />}>
          <RecentDocuments />
        </Suspense>
      </section>

      {/* Emplacement réservé (story 5.6) : « Mes dernières Conversations ». Rien n'est affiché avant. */}
    </div>
  );
}
