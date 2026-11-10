import { SlowLoadingNotice } from "@/components/documents/slow-loading-notice";
import { RECENT_DOCUMENTS_LIMIT } from "./constants";

// Squelette de la liste « Derniers Documents » (5 lignes), puis message au-delà de 10 s. Contenu de
// repli de la frontière Suspense de la liste seulement : la bande d'actions reste affichée.
export function RecentDocumentsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden="true" data-skeleton-rows className="flex animate-pulse flex-col gap-3">
        {Array.from({ length: RECENT_DOCUMENTS_LIMIT }, (_, index) => (
          <div key={index} className="h-14 w-full rounded-md bg-surface" />
        ))}
      </div>
      <SlowLoadingNotice />
    </div>
  );
}
