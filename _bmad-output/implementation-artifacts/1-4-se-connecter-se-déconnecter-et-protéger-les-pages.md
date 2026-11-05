---
title: 'Story 1.4 : Se connecter, se déconnecter et protéger les pages'
type: 'feature'
created: '2026-11-05'
status: 'in-review'
baseline_commit: 'e030969a6b262365b2fcf44a34f3616bc222ecfe'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Toutes les pages de la coquille sont ouvertes à un Visiteur. Il n'existe ni page `/connexion` ni déconnexion, et la barre latérale affiche « Non connecté ». La région `fra1` n'est pas encore prouvée sur une route dynamique (réserve de la story 1.1).

**Approach:** Page `/connexion` (E1) et Server Actions de connexion et de déconnexion via Supabase Auth. Protection des routes dans `src/proxy.ts`, doublée d'un contrôle serveur dans la coquille. Redirection vers `suite`, limitée à un chemin interne. E-mail du Collaborateur et « Se déconnecter » actif dans la coquille. Page `not-found.tsx` (E9). Tests Vitest et Playwright sur Supabase local. Contrôle de `x-vercel-id` sur Vercel, consigné dans `docs/environnements.md`.

## Boundaries & Constraints

**Always:**
- Toute route exige une session, sauf `/connexion` et `/inscription`. Sans session, redirection vers `/connexion?suite=<chemin demandé>`.
- Un Collaborateur connecté qui ouvre `/connexion` ou `/inscription` est renvoyé vers `/`.
- `suite` n'est accepté que si c'est un chemin interne : il commence par un seul `/`, sans `//`, `\`, schéma ni caractère de contrôle. Sinon, redirection vers `/`. La règle est appliquée côté serveur.
- Erreur d'identifiants : un seul message, « E-mail ou mot de passe incorrect. », au-dessus du formulaire, sans `aria-invalid` sur un champ. Le focus va sur le message et la saisie est conservée.
- Validation `zod` côté serveur avant l'appel à Supabase. Une saisie mal formée reçoit le même message unique.
- Envoi unique : « Connexion… » en `aria-disabled`, comme pour l'inscription.
- La session est persistante (cookies `@supabase/ssr` avec date d'expiration) et dure jusqu'à la déconnexion.
- Déconnexion par Server Action (`signOut`), puis `/connexion` avec « Vous êtes déconnecté. » (`role="status"`).
- E-mail lu dans les revendications du jeton côté serveur (`getClaims`), jamais depuis `profiles.email`, qui n'est pas lisible.
- Lecture de session derrière `Suspense` (`cacheComponents`).
- Aucun mot de passe journalisé, renvoyé ni placé dans une URL.
- Tous les textes viennent de `texts.ts`.

**Décisions du 2026-11-05 :**
- **Q1 = A** : un échec inattendu (Supabase indisponible, limitation de débit, erreur non prévue) affiche « La connexion n'a pas abouti. Veuillez réessayer dans quelques instants. » dans l'alerte d'erreur, sans bouton.
- **Q2 = A** : revue finale par trois relecteurs en parallèle (sans contexte, cas limites, vérifications manquantes).
- La spec est gardée entière.
- `safeNextPath` refuse aussi les variantes encodées (`%2F%2F`, `%5C`, et toute valeur qui, une fois décodée, une ou plusieurs fois, désigne une URL externe).
- Un test prouve qu'aucune boucle de redirection n'existe sur `/connexion` et `/inscription`, avec ou sans session.
- `getClaims` est utilisé selon les recommandations de sécurité de Supabase (vérification de la signature du jeton, jamais `getSession` côté serveur). Il ne sert qu'à décider d'une redirection et à afficher l'e-mail. Les droits réels restent vérifiés par le serveur et la RLS.

**Never:**
- Clé `service_role` dans Next.js.
- Tests de bout en bout sur le projet distant.
- Session expirée avec restauration de saisie (UX, Session expirée) : hors story, car aucun écran n'a encore de saisie à protéger.
- Story 2.1.
- Commit ou push sans validation de l'utilisateur.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connexion | bons identifiants, sans `suite` | `/` connecté, e-mail affiché dans la coquille | — |
| Retour interne | `suite=/bibliotheque?x=1` | `/bibliotheque?x=1` | — |
| Retour externe | `suite=https://exemple.com`, `//exemple.com`, `/\exemple.com`, `javascript:…` | `/` | refus silencieux |
| Identifiants faux | mauvais mot de passe, e-mail inconnu, e-mail mal formé ou vide | « E-mail ou mot de passe incorrect. », focus sur l'alerte | `role="alert"`, aucun champ marqué |
| Réseau coupé | l'appel à la Server Action échoue | « Connexion perdue. Vérifiez votre réseau, puis réessayez. » + « Réessayer » | saisie conservée |
| Visiteur | ouvre `/bibliotheque`, `/assistant` ou `/` | `/connexion?suite=…` | — |
| Visiteur, API directe | clé publique, toute table de `public` | aucune ligne, ou refus | — |
| Déconnexion | clic sur « Se déconnecter » | `/connexion` + « Vous êtes déconnecté. » ; `/` ensuite redirige | — |
| URL inexistante | connecté | E9 « Page introuvable », deux boutons, focus sur le titre | statut 404 |

</frozen-after-approval>

## Code Map

- `src/proxy.ts`, `src/lib/supabase/proxy.ts` -- `updateSession` appelle déjà `getClaims()`. Il faut en exploiter le résultat pour rediriger, en recopiant les cookies rafraîchis sur la réponse de redirection.
- `src/lib/supabase/server.ts` -- client serveur, à réutiliser dans les actions et la coquille.
- `src/server/auth/sign-up.ts`, `src/app/(auth)/inscription/*` -- modèle à suivre (résultat typé, `logEvent`, `onSubmit` + transition, verrou synchrone, `unstable_rethrow`, focus).
- `src/lib/schemas/auth.ts` -- ajouter `signInSchema`.
- `src/lib/errors.ts` -- `appError`, `logEvent`.
- `src/components/forms/*` -- `FormField`, `SubmitButton`, `ErrorAlert`, sans modification.
- `src/components/shell/app-shell.tsx`, `mobile-nav.tsx`, `sign-out-button.tsx` -- remplacer `texts.shell.signedOut` par l'e-mail (Suspense) et activer le bouton (formulaire vers la Server Action).
- `src/app/(app)/layout.tsx` -- coquille. Le contrôle serveur de session va dans un composant sous `Suspense`, pas dans un `await` de haut niveau.
- `src/lib/texts.ts` -- section `signIn`, textes de la déconnexion et de E9.
- `tests/e2e/shell.spec.ts`, `smoke.spec.ts` -- ils visitent des pages désormais protégées. Il leur faut une session (Compte créé sur Supabase local), et `signedOut` ou `aria-disabled` deviennent caducs.
- `tests/support/local-supabase.ts` -- `localSupabase()`, `localSqlRows()`, `uniqueEmail()`.
- `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md` -- lecture de session sous `Suspense`. `app/not-found.tsx` à la racine traite toute URL inconnue.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/auth/safe-redirect.ts` -- `safeNextPath(value)`, fonction pure : chemin interne, sinon `/`.
- [x] `src/lib/texts.ts` -- textes E1, E9, déconnexion et erreur inattendue (selon la réponse à Q1).
- [x] `src/lib/schemas/auth.ts` -- `signInSchema`.
- [x] `src/server/auth/sign-in.ts`, `sign-out.ts` -- connexion (`invalid_credentials` et saisie invalide donnent le message unique, le reste est journalisé et renvoie `INTERNAL`) ; déconnexion.
- [x] `src/lib/supabase/proxy.ts` -- routes publiques, redirection avec `suite`, renvoi d'un connecté hors de `/connexion` et `/inscription`.
- [x] `src/app/(auth)/connexion/page.tsx`, `sign-in-form.tsx`, `actions.ts` -- E1 : focus initial sur l'e-mail, « Afficher le mot de passe », « Créer un compte », `suite` relu et filtré côté serveur.
- [x] `src/components/shell/user-email.tsx`, `sign-out-button.tsx`, `app-shell.tsx`, `mobile-nav.tsx` -- e-mail (`getClaims`, redirection vers `/connexion` sans session) et déconnexion active.
- [x] `src/app/not-found.tsx` -- E9.
- [x] `tests/unit/safe-redirect.test.ts`, `sign-in.test.ts` -- toutes les lignes de la matrice qui portent sur la redirection et sur les erreurs.
- [x] `tests/integration/anon-access.test.ts` -- liste des tables de `public`, puis lecture par `anon` avec la clé publique : vide ou refus.
- [x] `tests/e2e/connexion.spec.ts` + adaptation de `shell`, `smoke` et `inscription` -- connexion, erreur, `suite` interne et externe, protection, déconnexion, persistance (nouveau contexte avec l'état de stockage), E9, e-mail dans la coquille, axe à 1 280 et 375 px.
- [ ] `docs/environnements.md` -- procédure et résultat du contrôle `x-vercel-id`. La procédure est écrite. Le résultat sera consigné après le relevé de l'utilisateur sur Vercel.

**Acceptance Criteria:**
- Given les tests existants, when `npm test`, `npm run test:e2e`, `npm run lint` et `npm run build:ci` sont lancés, then tout passe.
- Given le déploiement Vercel et un Collaborateur connecté, when il charge `/` et lit `x-vercel-id`, then l'en-tête contient `::fra1::`, et le résultat est consigné.

## Design Notes

Le proxy est la première barrière, et la coquille la seconde : `SessionGate` (sous `Suspense`) ne rend le contenu de l'écran qu'après `getClaims`, et redirige sinon. Cette seconde lecture de session rend chaque page de la coquille dynamique, ce qui produit l'exécution d'une fonction Vercel lisible dans `x-vercel-id`. Le message « Vous êtes déconnecté. » passe par `/connexion?deconnecte=1`. Un Compte resté non confirmé sur le projet distant, créé le 04/11 avant la désactivation de la confirmation, reçoit le message d'identifiants incorrects. Il suffit de le supprimer dans le tableau de bord Supabase.

## Verification

**Commands:**
- `npm test` -- expected: unitaires et intégration verts, dont l'accès `anon`.
- `npm run test:e2e` -- expected: tout vert aux deux largeurs.
- `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected: 0 erreur, aucun secret.

**Manual checks (if no CLI):**
- Sur Vercel, connecté, ouvrir `/` dans l'onglet Réseau des outils de développement : l'en-tête `x-vercel-id` du document contient `::fra1::`.

## Implementation Notes

- Implémentation faite directement dans la session principale. Les sous-agents sont réservés aux relecteurs (décision Q2).
- **`safeNextPath`** (`src/lib/auth/safe-redirect.ts`) contrôle la valeur brute et chacune de ses formes décodées (5 niveaux au plus), avant et après normalisation par l'analyseur d'URL. Le chemin renvoyé est la forme normalisée, contrôlée à nouveau.
  - Cas trouvé par les tests : `/./%2F/exemple.com` ressortait en `/%2F/exemple.com`, qui se décode en `///exemple.com`. Il est désormais refusé.
- **`accessRedirect`** (`src/lib/auth/routes.ts`) est la décision pure du proxy. Une page publique n'est jamais redirigée sans session. Un Collaborateur connecté va de `/connexion` ou `/inscription` vers `/`, qui ne redirige pas. La redirection a donc une étape au plus, ce que prouvent les tests unitaires et e2e.
- **Proxy** : les en-têtes anti-cache fournis par `@supabase/ssr` avec les cookies (`Cache-Control: private, no-store…`) sont désormais appliqués. Ils l'étaient pas avant cette story. Ils sont aussi recopiés sur une réponse de redirection, avec les cookies rafraîchis.
- **`getCurrentUser`** (`src/server/auth/current-user.ts`) utilise `getClaims` (signature vérifiée), jamais `getSession`, avec `react.cache` et `connection()`.
  - Sans `connection()`, Next 16 signalait `Date.now()` pendant le pré-rendu, car `getClaims` compare l'expiration du jeton à l'heure courante.
  - Il ne sert qu'à l'affichage et aux redirections. La RLS reste le contrôle des données.
- **Déconnexion** : portée `local` (seul ce navigateur). En cas de refus du serveur Auth, `supabase-js` efface quand même la session locale (lu dans `GoTrueClient._signOut`). L'action se contente donc de journaliser et de rediriger.
- **Formulaires** : `method="post"` ajouté à la connexion et à l'inscription. Un envoi fait avant le chargement du JavaScript ne place jamais le mot de passe dans l'URL.
- **Textes** : `shell.signedOut` (« Non connecté ») est retiré et remplacé par l'e-mail, précédé de « Compte connecté : » pour les lecteurs d'écran.
- **Tests e2e** : un Compte confirmé par worker (`tests/support/e2e-auth.ts`, API admin locale) et une session partagée par `storageState`.
  - `browser.newContext()` reprend les options de `test.use`, d'où un `storageState` vide explicite dans le test de déconnexion.
- **Vérifié avant revue** :
  - `npm test` : 150/150.
  - `npm run test:e2e` : 87 réussis et 5 ignorés (propres à l'autre largeur).
  - `lint`, `tsc`, `build:ci` : verts.
- **Après revue** :
  - `SessionGate` protège le contenu des écrans (avant, seul l'e-mail était soumis à la vérification).
  - `email_not_confirmed` est journalisé (`sign_in_unconfirmed`).
  - L'avis « déconnecté » est masqué après une tentative.
  - La déconnexion est simplifiée.
  - Limite locale `sign_in_sign_ups` relevée à 1000 (`supabase/config.toml`, sans effet distant).
  - `testTimeout` de Vitest passé à 30 s : `supabase db query` prend environ 6 s par appel, et un test de la story 1.3 en fait trois.
  - Tests ajoutés : proxy (cookies et `Cache-Control` sur la redirection et sur la réponse transmise), déconnexion, envoi sans JavaScript des deux formulaires, cookie falsifié, `suite` exacte, fumée.
- **Vérifié après revue** :
  - `npm test` : 157/157.
  - `npm run test:e2e` : 93 réussis et 5 ignorés.
  - `lint` : 0 erreur. `tsc` : 0 erreur. `build:ci` : vert, aucun secret.
- **Reste à faire par l'utilisateur** : déploiement Vercel, puis relevé de `x-vercel-id` (`docs/environnements.md`).

## Spec Change Log

## Review Triage Log

Revue du 2026-11-05 : trois relecteurs (sans contexte, cas limites, vérifications manquantes).

| # | Remarque | Verdict | Preuve | Suite |
|---|---|---|---|---|
| 1 | Seconde barrière : le contenu de l'écran était rendu hors du contrôle de session (seul `UserEmail` redirigeait) | medium | `children` hors de la frontière `Suspense` de `UserEmail` | patch : `SessionGate` autour du contenu |
| 2 | Barrière de la coquille : redirection vers `/connexion` sans `suite` | low | le proxy passe toujours avant ; cas d'un contournement seulement | reject |
| 3 | Envoi sans JavaScript : saisie perdue, aucune connexion | low | avant la story, c'était un GET avec le mot de passe dans l'URL ; `action` natif réinitialiserait le formulaire (choix de la story 1.3) | reject |
| 4 | Erreur inattendue sans « Réessayer » | false | décision Q1 = A, « sans bouton » | reject |
| 5 | POST de Server Action redirigé en 307 par le proxy après expiration de la session | maybe-false | à vérifier : comportement de Next 16 pour une action rejouée sur `/connexion` | defer |
| 6 | Server Actions joignables sur une page publique : chaque action future doit vérifier la session elle-même | medium | identifiants d'action globaux ; aucune action protégée n'existe encore | defer (story 2.2) |
| 7 | Fichiers publics non image (`robots.txt`, polices) redirigés pour un Visiteur | low | aucun fichier de ce type dans le dépôt | reject |
| 8 | « Créer un compte » perd `suite` ; un Collaborateur connecté sur `/connexion?suite=/x` va sur `/` | low | correction avec un risque de boucle (`suite=/connexion`) | reject |
| 9 | Jeton sans `email` : ligne vide | low | seul le fournisseur e-mail est activé | reject |
| 10 | Avis « Vous êtes déconnecté. » affiché à côté d'une erreur | low | `?deconnecte=1` reste dans l'URL | patch : masqué après une tentative |
| 11 | `role="status"` présent au chargement, rarement annoncé ; avis relu à l'actualisation | low | cosmétique | reject |
| 12 | Repli de déconnexion (suppression manuelle des `sb-*`) non testé | low | `supabase-js` efface déjà la session locale en cas d'erreur (`_signOut`) | patch : repli retiré, test unitaire de l'action |
| 13 | Aucun test pour un cookie falsifié | medium | aucun test | patch : test e2e |
| 14 | `anon-access` : erreur de `createUser` ignorée ; RPC et Storage absents | low | RPC : privilèges déjà testés en 1.3 ; aucun bucket | patch (erreur vérifiée), reste reject |
| 15 | Test e2e « protection » : `suite` non vérifiée exactement | low | expression régulière trop large | patch |
| 16 | `fra1` non prouvé alors que la tâche est cochée | high | résultat encore à consigner | tâche décochée, critère signalé « en attente » |
| 17 | `/recherche?q=100%25` est refusé (décodage du `%` final) | low | repli sûr vers le Tableau de bord ; décision « refuser les variantes encodées » | reject |
| 18 | `getClaims` en erreur passagère : Collaborateur redirigé | low | refus par défaut voulu | reject |
| 19 | Erreur GoTrue sans `code` → message inattendu | false | GoTrue local et distant renvoient `invalid_credentials` (tests e2e) | reject |
| 20 | `signOut` qui lève une exception | false | `_signOut` renvoie l'erreur au lieu de la lever | reject |
| 21 | Limite de débit locale (30 par 5 min) : tests e2e instables | medium | `sign_in_sign_ups = 30`, environ 40 connexions par exécution | patch : 1000 en local |
| 22 | `email_not_confirmed` non journalisé | medium | `INVALID_CREDENTIALS_CODES` sans journal | patch : `sign_in_unconfirmed` |
| 23 | Proxy : cookies rafraîchis et `Cache-Control` sur la redirection non testés | medium | aucun test | patch : `tests/unit/proxy.test.ts` |
| 24 | `method="post"` non testé | medium | aucun envoi sans JavaScript | patch : test e2e sur les deux formulaires |
| 25 | Branche d'erreur inattendue de l'interface non rendue en e2e | low | il faudrait un point d'injection de panne | defer |
| 26 | Redirection de `SessionGate` non testée | low | il faudrait un banc de test pour composants serveur asynchrones | defer |
| 27 | `smoke.spec.ts` testait la Connexion sous le nom « page d'accueil » | low | redirection du proxy | patch : test renommé et précisé |
| 28 | Aucune intégration continue | low | aucun dossier `.github/workflows` dans le dépôt | reject (hors story) |
| 29 | Le diff omet la story et `sprint-status.yaml` | false | exclus volontairement du diff de code | reject |
