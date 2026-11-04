"use client";

import { useEffect, useRef } from "react";
import { shouldFocusTitle } from "./title-focus";

// Titre d'écran (h1) : reçoit le focus à chaque changement d'écran.
export function PageTitle({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  // Décision prise une seule fois par titre : en développement, React rejoue les effets au
  // montage (StrictMode), ce qui consommerait l'état partagé deux fois.
  const shouldFocus = useRef<boolean | null>(null);

  useEffect(() => {
    if (shouldFocus.current === null) shouldFocus.current = shouldFocusTitle();
    if (shouldFocus.current) ref.current?.focus();
  }, []);

  return (
    <h1 ref={ref} tabIndex={-1} className="text-xl leading-tight font-[650] text-foreground">
      {children}
    </h1>
  );
}
