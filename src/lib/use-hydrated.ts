"use client";

import { useSyncExternalStore } from "react";

// Rendu serveur et hydratation d'une date ou d'une heure : fuseau fixe, identique des deux côtés (le
// serveur Vercel est en UTC). Le navigateur passe à son propre fuseau aussitôt après l'hydratation
// (revue de la story 5.6, constat 2 ; story 5.10 pour la date d'ajout et le moment du quota).
export const SERVER_TIME_ZONE = "Europe/Paris";

const noSubscription = () => () => {};

// Vrai dans le navigateur une fois hydraté, faux au rendu serveur et pendant l'hydratation.
export const useHydrated = () =>
  useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

// Fuseau à utiliser pour le rendu : fixe avant l'hydratation, celui du navigateur ensuite (undefined).
export const useDisplayTimeZone = (): string | undefined => (useHydrated() ? undefined : SERVER_TIME_ZONE);
