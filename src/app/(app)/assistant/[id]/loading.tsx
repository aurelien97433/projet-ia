import { SlowLoadingNotice } from "@/components/documents/slow-loading-notice";

// E4 · Chargement d'une Conversation (EXPERIENCE.md) : squelettes de deux échanges, le champ apparaît
// une fois les messages chargés ; message au-delà de 10 s. Sert aussi de frontière Suspense au segment,
// que cacheComponents exige pour une page qui lit des données de la requête.
export default function ConversationLoading() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div aria-hidden="true" data-skeleton-exchanges className="flex animate-pulse flex-col gap-6">
        <div className="h-7 w-2/3 rounded-md bg-surface" />
        {[0, 1].map((index) => (
          <div key={index} className="flex flex-col gap-3">
            <div className="ms-auto h-12 w-1/2 rounded-xl bg-surface" />
            <div className="h-4 w-full rounded-md bg-surface" />
            <div className="h-4 w-4/5 rounded-md bg-surface" />
          </div>
        ))}
      </div>
      <SlowLoadingNotice />
    </div>
  );
}
