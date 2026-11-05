"use client";

import { useEffect, useRef } from "react";
import { shouldFocusTitle } from "./title-focus";

// Titre d'écran (h1) : reçoit le focus à chaque changement d'écran. focusOnLoad : aussi au premier
// chargement (écran sans lien d'évitement, comme la Page introuvable).
export function PageTitle({ children, focusOnLoad = false }: { children: React.ReactNode; focusOnLoad?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  // Décision prise une seule fois par titre : en développement, React rejoue les effets au
  // montage (StrictMode), ce qui consommerait l'état partagé deux fois.
  const shouldFocus = useRef<boolean | null>(null);

  useEffect(() => {
    if (shouldFocus.current === null) shouldFocus.current = shouldFocusTitle() || focusOnLoad;
    if (shouldFocus.current) ref.current?.focus();
  }, [focusOnLoad]);

  return (
    <h1 ref={ref} tabIndex={-1} className="text-xl leading-tight font-[650] text-foreground">
      {children}
    </h1>
  );
}
