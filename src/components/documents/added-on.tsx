"use client";

// Date d'ajout dans le fuseau du navigateur (architecture §6), en français. Le rendu serveur peut
// différer d'un jour autour de minuit : le navigateur corrige à l'hydratation.
export function AddedOn({ iso }: { iso: string }) {
  const label = new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label}
    </time>
  );
}
