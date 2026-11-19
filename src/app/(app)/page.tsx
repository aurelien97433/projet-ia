import Link from "next/link";
import { Suspense } from "react";
import { RecentConversationsSection } from "@/components/assistant/recent-conversations-section";
import { ActionBand } from "@/components/dashboard/action-band";
import { DASHBOARD_SEARCH_FIELD_ID, RECENT_DOCUMENTS_HEADING_ID } from "@/components/dashboard/constants";
import { RecentDocuments } from "@/components/dashboard/recent-documents";
import { RecentDocumentsSkeleton } from "@/components/dashboard/recent-documents-skeleton";
import { PageTitle } from "@/components/shell/page-title";
import { texts } from "@/lib/texts";

// E3 · Tableau de bord. Titre, bande d'actions et en-têtes de section appartiennent à la partie
// statique de la page ; les listes « Mes dernières Conversations » (story 5.6) et « Derniers
// Documents », lues à la requête, sont chacune dans une frontière Suspense (aucune donnée dans la page
// prérendue). Deux colonnes à partir de 1024 px ; Conversations d'abord (H10, aussi à 375 px).
export default function DashboardPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageTitle focusTargetId={DASHBOARD_SEARCH_FIELD_ID}>{texts.titles.dashboard}</PageTitle>
      <ActionBand />

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentConversationsSection />
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
      </div>
    </div>
  );
}
