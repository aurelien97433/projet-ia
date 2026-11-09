import { SlowLoadingNotice } from "@/components/documents/slow-loading-notice";

// E7 · Chargement : squelette de l'en-tête et du texte (EXPERIENCE.md), puis message au-delà de 10 s.
// Sert aussi de frontière Suspense au segment, que cacheComponents exige pour une page qui lit des
// données de la requête.
export default function DocumentLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="h-7 w-2/3 rounded-md bg-surface" />
          <div className="h-4 w-1/2 rounded-md bg-surface" />
        </div>
        <div className="flex max-w-reading flex-col gap-2">
          <div className="h-4 w-full rounded-md bg-surface" />
          <div className="h-4 w-full rounded-md bg-surface" />
          <div className="h-4 w-4/5 rounded-md bg-surface" />
        </div>
      </div>
      <SlowLoadingNotice />
    </div>
  );
}
