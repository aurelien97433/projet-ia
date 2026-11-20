"use client";

import { useDisplayTimeZone } from "@/lib/use-hydrated";

// Date d'ajout dans le fuseau du navigateur (architecture §6), en français. Story 5.10 (report de la
// 5.6) : même correctif que ConversationDate. Avec suppressHydrationWarning, React gardait le texte du
// serveur (UTC) sans le corriger ; le serveur et l'hydratation rendent maintenant la même date dans un
// fuseau fixe, puis le navigateur passe à son propre fuseau.
export function AddedOn({ iso }: { iso: string }) {
  const timeZone = useDisplayTimeZone();
  const label = new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone });
  return <time dateTime={iso}>{label}</time>;
}
