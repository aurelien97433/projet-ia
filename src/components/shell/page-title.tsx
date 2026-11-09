"use client";

import { useEffect, useRef } from "react";
import { shouldFocusTitle } from "./title-focus";

// Titre d'écran (h1) : reçoit le focus à chaque changement d'écran. focusOnLoad : aussi au premier
// chargement (écran sans lien d'évitement, comme la Page introuvable). yieldFocus : le focus est
// confié à un autre élément (Passage actif) ; l'état partagé est tout de même consommé.
export function PageTitle({
  children,
  focusOnLoad = false,
  yieldFocus = false,
}: {
  children: React.ReactNode;
  focusOnLoad?: boolean;
  yieldFocus?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  // Décision prise une seule fois par titre : en développement, React rejoue les effets au
  // montage (StrictMode), ce qui consommerait l'état partagé deux fois.
  const shouldFocus = useRef<boolean | null>(null);

  useEffect(() => {
    if (shouldFocus.current === null) shouldFocus.current = shouldFocusTitle() || focusOnLoad;
    if (shouldFocus.current && !yieldFocus) ref.current?.focus();
  }, [focusOnLoad, yieldFocus]);

  return (
    <h1 ref={ref} tabIndex={-1} className="text-xl leading-tight font-[650] text-foreground">
      {children}
    </h1>
  );
}
