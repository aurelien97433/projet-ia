// Chargement de la Recherche (EXPERIENCE.md, E5) : trois cartes squelettes, masquées aux lecteurs
// d'écran (la zone parente porte aria-busy).
export function SearchSkeleton() {
  return (
    <div aria-hidden="true" data-search-skeleton className="flex animate-pulse flex-col gap-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-32 w-full rounded-lg bg-surface" />
      ))}
    </div>
  );
}
