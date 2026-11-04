// État partagé de la gestion du focus au changement d'écran (EXPERIENCE.md, Interaction Primitives).
// - Au premier chargement, le focus n'est pas déplacé : le lien d'évitement reste le premier arrêt.
// - Après une navigation depuis le menu mobile, le focus revient sur ☰ (EXPERIENCE.md, Barre latérale).
let initialLoadDone = false;
let skipNextTitleFocus = false;

export function markNavigationFromMobileMenu(): void {
  skipNextTitleFocus = true;
}

// Indique si le titre du nouvel écran doit recevoir le focus, et met l'état à jour.
export function shouldFocusTitle(): boolean {
  if (!initialLoadDone) {
    initialLoadDone = true;
    return false;
  }
  if (skipNextTitleFocus) {
    skipNextTitleFocus = false;
    return false;
  }
  return true;
}
