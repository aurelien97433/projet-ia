"use client";

import { useEffect, useRef } from "react";
import { shouldFocusTitle } from "./title-focus";

// Titre d'écran (h1) : reçoit le focus à chaque changement d'écran. focusOnLoad : aussi au premier
// chargement (écran sans lien d'évitement, comme la Page introuvable). yieldFocus : le focus est
// confié à un autre élément (Passage actif) ; l'état partagé est tout de même consommé.
// focusTargetId : écran de saisie (EXPERIENCE.md, Gestion du focus) ; le champ désigné reçoit le focus
// à la place du titre, selon la même décision (jamais au premier chargement) ; absent, le titre le reçoit.
export function PageTitle({
  children,
  focusOnLoad = false,
  yieldFocus = false,
  focusTargetId,
}: {
  children: React.ReactNode;
  focusOnLoad?: boolean;
  yieldFocus?: boolean;
  focusTargetId?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  // Décision prise une seule fois par titre : en développement, React rejoue les effets au
  // montage (StrictMode), ce qui consommerait l'état partagé deux fois.
  const shouldFocus = useRef<boolean | null>(null);

  useEffect(() => {
    if (shouldFocus.current === null) shouldFocus.current = shouldFocusTitle() || focusOnLoad;
    if (!shouldFocus.current || yieldFocus) return;
    const target = focusTargetId ? document.getElementById(focusTargetId) : null;
    (target ?? ref.current)?.focus();
  }, [focusOnLoad, yieldFocus, focusTargetId]);

  return (
    <h1 ref={ref} tabIndex={-1} className="text-xl leading-tight font-[650] text-foreground">
      {children}
    </h1>
  );
}
