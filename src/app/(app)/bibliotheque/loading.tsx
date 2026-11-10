import { SlowLoadingNotice } from "@/components/documents/slow-loading-notice";

const ROWS = 8;

// E6 · Chargement : squelette des filtres et de 8 lignes du tableau, puis message au-delà de 10 s.
// Sert aussi de frontière Suspense au segment, que cacheComponents exige pour une page qui lit des
// données de la requête.
export default function LibraryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
        <div className="h-7 w-1/3 rounded-md bg-surface" />
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="h-10 w-full rounded-md bg-surface md:w-52" />
          <div className="h-10 w-40 rounded-md bg-surface" />
          <div className="h-10 w-full rounded-md bg-surface md:flex-1" />
        </div>
        <div data-skeleton-rows className="flex flex-col gap-3">
          {Array.from({ length: ROWS }, (_, index) => (
            <div key={index} className="h-10 w-full rounded-md bg-surface" />
          ))}
        </div>
      </div>
      <SlowLoadingNotice />
    </div>
  );
}
