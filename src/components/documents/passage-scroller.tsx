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

type PassageScrollerProps = {
  targetId: string;
  scrollKey: string;
  focusTarget?: boolean;
  noticeId?: string;
};

// Seul morceau client du Lecteur : il ne reçoit que des identifiants, jamais le texte du Document.
// `scrollKey` change avec le Passage actif ; un rafraîchissement de la page ne déplace ni le
// défilement ni le focus. `noticeId` : message collant dont la hauteur est réservée au-dessus du Passage.
export function PassageScroller({ targetId, scrollKey, focusTarget = false, noticeId }: PassageScrollerProps) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const notice = noticeId ? document.getElementById(noticeId) : null;
    target.style.setProperty("--passage-notice-height", `${notice?.getBoundingClientRect().height ?? 0}px`);
    const needed = target.getBoundingClientRect().height + (parseFloat(getComputedStyle(target).scrollMarginTop) || 0);
    // Saut immédiat dans tous les cas : la durée de « smooth » dépend du navigateur (EXPERIENCE.md : 200 ms au plus).
    target.scrollIntoView({ block: needed > visibleHeight(target) ? "start" : "center", behavior: "instant" });
    if (focusTarget) target.focus({ preventScroll: true });
  }, [targetId, scrollKey, focusTarget, noticeId]);

  return null;
}
