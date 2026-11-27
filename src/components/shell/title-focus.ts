// État partagé de la gestion du focus au changement d'écran (EXPERIENCE.md, Interaction Primitives).
// - Au premier chargement, le focus n'est pas déplacé : le lien d'évitement reste le premier arrêt.
// - Après une navigation depuis le menu mobile, le focus revient sur ☰ (EXPERIENCE.md, Barre latérale).
let initialLoadDone = false;
let skipNextTitleFocus = false;

// Story 7.8 (R73-F13) : adresse au chargement du module, avant toute navigation côté client. Si
// l'utilisateur change d'écran avant que le premier titre ait pris sa décision (machine lente), ce
// titre n'est pas celui du premier chargement : il reçoit le focus.
const initialHref = typeof window === "undefined" ? null : window.location.href;

export function markNavigationFromMobileMenu(): void {
  skipNextTitleFocus = true;
}

// Indique si le titre du nouvel écran doit recevoir le focus, et met l'état à jour.
export function shouldFocusTitle(): boolean {
  if (!initialLoadDone) {
    initialLoadDone = true;
    if (initialHref === null || window.location.href === initialHref) return false;
  }
  if (skipNextTitleFocus) {
    skipNextTitleFocus = false;
    return false;
  }
  return true;
}
