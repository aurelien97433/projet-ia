import { Suspense } from "react";
import { SEARCH_FIELD_ID } from "@/components/search/constants";
import { SearchView } from "@/components/search/search-view";
import { PageTitle } from "@/components/shell/page-title";
import { texts } from "@/lib/texts";

// E5 · Recherche (story 4.1b). Le titre appartient à la partie prérendue ; la vue lit `?q=` dans le
// navigateur (useSearchParams, sous Suspense) : la page prérendue ne contient ni Requête, ni résultat,
// ni Passage. Écran de saisie : au changement d'écran, le champ reçoit le focus à la place du titre.
export default function SearchPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageTitle focusTargetId={SEARCH_FIELD_ID}>{texts.titles.search}</PageTitle>
      <Suspense fallback={<SearchFallback />}>
        <SearchView />
      </Suspense>
    </div>
  );
}

// Repli prérendu : la place du champ est réservée, la phrase d'aide est déjà lisible.
function SearchFallback() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div aria-hidden="true" className="h-16 w-full animate-pulse rounded-md bg-surface" />
      <p className="text-sm text-foreground">{texts.search.help}</p>
    </div>
  );
}
