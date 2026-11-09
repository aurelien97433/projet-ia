"use client";

import { useEffect } from "react";

// Hauteur réellement visible autour d'un élément : conteneur défilant le plus proche (panneau Source),
// sinon la fenêtre, moins la zone réservée par scroll-padding-top (barre fixe).
function visibleHeight(element: HTMLElement): number {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.body || parent === document.documentElement) break;
    const style = getComputedStyle(parent);
    if (/auto|scroll/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
      return parent.clientHeight - (parseFloat(style.scrollPaddingTop) || 0);
    }
  }
  return window.innerHeight - (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
}

// Seul morceau client du Lecteur : il ne reçoit que l'identifiant du Passage actif, jamais le texte du
// Document. `scrollKey` change avec le Passage actif ; un rafraîchissement de la page ne fait pas défiler.
export function PassageScroller({ targetId, scrollKey }: { targetId: string; scrollKey: string }) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    // Saut immédiat dans tous les cas : la durée de « smooth » dépend du navigateur (EXPERIENCE.md : 200 ms au plus).
    target.scrollIntoView({
      block: target.getBoundingClientRect().height > visibleHeight(target) ? "start" : "center",
      behavior: "instant",
    });
  }, [targetId, scrollKey]);

  return null;
}
