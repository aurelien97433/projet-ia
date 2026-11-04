---
title: 'Story 1.3 : Créer un Compte'
type: 'feature'
created: '2026-11-04'
status: 'done'
baseline_commit: '29461be7ade70827042b17e06ca8f1571e181899'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un Visiteur ne peut pas encore créer de Compte : il n'existe ni page d'inscription, ni table `profiles`, ni règles d'accès sur `public`, ni format d'erreur commun.

**Approach:** Première migration (`profiles` + déclencheur sur `auth.users`, RLS, rôle `anon` sans privilège), forme d'erreur AD-19 dans `src/lib/errors.ts`, schéma `zod`, Server Action d'inscription via Supabase Auth, page `/inscription` (E2) avec les textes du catalogue, et tests d'intégration RLS à deux Comptes sur Supabase local.

## Boundaries & Constraints

**Always:** Compte créé sans confirmation par e-mail, Collaborateur connecté et redirigé vers `/` ; ligne `profiles` (`id`, `email`, `display_name` = partie locale de l'e-mail) créée par déclencheur `security definer` ; RLS activée, politiques `to authenticated` uniquement, `REVOKE ALL` du rôle `anon` sur les tables, séquences et fonctions de `public` (et privilèges par défaut) ; `authenticated` ne peut que lire `profiles` ; validation `zod` côté serveur (e-mail valide, mot de passe ≥ 8 caractères) avant tout appel à Supabase ; erreurs inattendues au format `{ error: { code, message, retryable } }`, codes de l'architecture, message français sans détail technique ; tous les libellés dans `src/lib/texts.ts` ; envoi unique : bouton « Création… » en `aria-disabled` dès le premier clic, une seule requête ; saisie conservée en cas d'erreur ; aucun mot de passe journalisé ni renvoyé au navigateur.

**Décisions du 2026-11-04 :** erreur inattendue (option A) : titre « Le Compte n'a pas pu être créé. », texte « Veuillez réessayer dans quelques instants. Votre saisie est conservée. », sans bouton, formulaire prêt pour un nouvel envoi ; après une erreur, le mot de passe peut rester dans le champ côté navigateur, mais il n'est jamais renvoyé par le serveur, écrit dans les journaux ni placé dans une URL ; le message « e-mail déjà utilisé » reste celui de FR-1 et du catalogue, testé sur Supabase local ; le lien vers `/connexion` et l'affichage « Non connecté » sont acceptés temporairement jusqu'à la story 1.4 ; l'utilisateur règle le minimum de 8 caractères sur le projet distant.

**Never:** page `/connexion`, déconnexion ou protection des routes (story 1.4) ; affichage de l'e-mail dans la coquille (1.4) ; clé `service_role` dans Next.js ; tests de bout en bout sur le projet Supabase distant (ils tournent sur Supabase local) ; migration appliquée au projet distant sans l'action de l'utilisateur.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Création | e-mail valide, mot de passe de 8 caractères ou plus | Compte créé sans e-mail de confirmation, ligne `profiles`, session ouverte, redirection vers `/` | — |
| E-mail mal formé | `camille@` | aucun Compte ; « Cette adresse e-mail n'est pas valide. » sous le champ | `aria-invalid`, `aria-describedby`, focus sur le champ |
| Mot de passe court | 7 caractères | aucun Compte ; « Le mot de passe doit contenir au moins 8 caractères. » | idem |
| E-mail déjà utilisé | e-mail d'un Compte existant | aucun Compte ; « Cette adresse e-mail est déjà utilisée. » + lien « Se connecter » | idem |
| Double clic | deux clics rapides sur « Créer mon Compte » | une seule requête, bouton « Création… » en `aria-disabled` | — |
| Erreur inattendue | Supabase indisponible ou erreur non prévue | réponse `{ error: { code: "INTERNAL", message, retryable: true } }`, alerte d'erreur en français | `role="alert"`, saisie conservée |
| Visiteur | rôle `anon` sur `profiles` | aucune ligne, aucune écriture | refus |
| Deux Comptes | A et B connectés | B lit le profil de A ; ni A ni B ne peuvent insérer, modifier ni supprimer un profil | refus |

</frozen-after-approval>

## Code Map

- `src/lib/supabase/server.ts` -- `createClient()` serveur (cookies) : à utiliser dans la Server Action, il pose les cookies de session.
- `src/lib/texts.ts` -- catalogue : ajouter la section inscription (titres, libellés, erreurs, liens) depuis EXPERIENCE.md (E2, « Création de Compte »).
- `src/components/ui/button.tsx` -- `Button` shadcn adapté en 1.2 ; aucun autre composant shadcn à ajouter.
- `src/components/shell/logo.tsx` -- logo réutilisable pour la page sans coquille.
- `src/app/(app)/` -- écrans de la coquille ; `/inscription` va dans un groupe `(auth)` sans coquille (E1, E2 n'ont pas de barre latérale).
- `supabase/config.toml` -- `enable_confirmations = false`, `minimum_password_length = 8`, `site_url` `http://localhost:3000` : local déjà prêt.
- `supabase/migrations/.gitkeep` -- dossier vide : première migration horodatée à créer.
- `tests/integration/supabase-local.test.ts` -- exemple de test sur Supabase local (`http://127.0.0.1:54321`).
- `playwright.config.ts` -- serveur `npm run dev` sur 3000 avec `.env.local` (projet distant) : les tests de bout en bout de la story doivent viser Supabase local.
- `npx supabase status -o json` -- fournit à l'exécution `API_URL`, `PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY` locaux ; ne jamais les écrire dans un fichier suivi.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- `zod@4.6.7` (version exacte).
- [x] `supabase/migrations/<horodatage>_profiles.sql` -- table, RLS, politique de lecture, déclencheur, `REVOKE` `anon` (objets existants et privilèges par défaut), droits limités de `authenticated`.
- [x] `src/lib/errors.ts` -- type `AppError`, liste des codes d'AD-19, fabrique `appError(code)` avec messages du catalogue.
- [x] `src/lib/schemas/auth.ts` -- schéma d'inscription `zod`, messages du catalogue.
- [x] `src/server/auth/sign-up.ts` + Server Action `src/app/(auth)/inscription/actions.ts` -- validation, `supabase.auth.signUp`, correspondance des erreurs Supabase vers les champs ou `INTERNAL`, redirection vers `/`.
- [x] `src/components/forms/` -- `FormField` (libellé, aide, erreur liée), `SubmitButton` (état occupé, `aria-disabled`), `ErrorAlert` (`role="alert"`).
- [x] `src/app/(auth)/layout.tsx`, `src/app/(auth)/inscription/page.tsx`, formulaire client -- E2 : « Créer votre Compte », champs, aide « 8 caractères minimum », « Afficher le mot de passe », « Créer mon Compte », « J'ai déjà un Compte ».
- [x] `tests/unit/` -- schéma, correspondance des erreurs, forme AD-19.
- [x] `tests/integration/profiles-rls.test.ts` -- déclencheur, `anon`, deux Comptes, nettoyage des Comptes créés.
- [x] `tests/e2e/inscription.spec.ts`, `playwright.config.ts` -- matrice côté interface, axe à 1 280 et 375 px, contre Supabase local.
- [x] `docs/environnements.md` -- action distante : appliquer la migration au projet distant.

**Acceptance Criteria:**
- Given les tests existants, when `npm test`, `npm run test:e2e`, `npm run lint` et `npm run build:ci`, then tout passe.
- Given la migration appliquée au projet distant par l'utilisateur, when un Compte est créé sur Vercel, then il arrive sur le Tableau de bord et sa ligne `profiles` existe.

## Spec Change Log

## Review Triage Log

Revue du 2026-11-04 : trois relecteurs (sans contexte, cas limites, vérifications manquantes).

| # | Remarque | Verdict | Preuve | Suite |
|---|---|---|---|---|
| 1 | Les fonctions créées plus tard restent exécutables par `anon` (EXECUTE global de PUBLIC, non révocable par schéma) | high | reproduit : `anon_exec=true` sur une fonction neuve | patch : `alter default privileges ... revoke execute on functions from public` global ; test de privilège réel |
| 2 | Tests `anon` « ne peut rien écrire » et fonction du déclencheur passent sans le REVOKE (collision de clé, fonction trigger non appelable) | medium | lecture des tests | patch : UUID neuf + `42501`, contrôles `has_function_privilege` / `has_table_privilege` |
| 3 | Correspondances `email_exists`, `email_address_invalid`, `weak_password` non testées | medium | aucune occurrence dans les tests | patch |
| 4 | Tout Collaborateur lit l’e-mail des autres | medium | `grant select` sur toute la table | patch : `grant select (id, display_name, created_at)` ; test B ne lit pas l’e-mail de A |
| 5 | Comptes distants antérieurs à la migration sans profil | low | aucune reprise | patch : insertion de reprise `on conflict do nothing` |
| 6 | E-mail nul (téléphone, anonyme) : violation NOT NULL | low | seul l’e-mail est activé | patch : `coalesce` |
| 7 | Double clic testé seulement sur le chemin refusé | medium | test sur `camille@` | patch : test valide, un seul Compte |
| 8 | Nettoyage e2e via `profiles` | low | fuite si le déclencheur échoue | patch : via `auth.admin.listUsers` |
| 9 | `count ?? 0` et pré-création non vérifiés | low | assertions vacantes | patch |
| 10 | `ERROR_CODES` testé par sa longueur seule | low | `toHaveLength(16)` | patch : liste exacte |
| 11 | `aria-pressed` + libellé changeant | low | annonce ambiguë | patch : `aria-pressed` retiré |
| 12 | `reuseExistingServer` pourrait réutiliser un serveur visant le projet distant | medium | port 3100 | patch : jamais de réutilisation |
| 13 | Clés locales absentes non détectées ; `NEXT_DIST_DIR` vide | low | — | patch |
| 14 | `server-only` non déclaré, alias vers un chemin interne de Next.js | low | `package.json` | patch : paquet `server-only@0.0.1` |
| 15 | Mot de passe > 72 caractères : erreur générique | low | limite de Supabase Auth | patch après arbitrage : « Le mot de passe doit contenir au plus 72 caractères. » (72 octets UTF-8) |
| 16 | `weak_password` pour une autre raison que la longueur → message « 8 caractères » faux | low | seule la longueur est réglée sur le projet distant | patch après arbitrage : « Ce mot de passe n'est pas accepté. Choisissez-en un autre. » sauf refus pour la seule longueur |
| 17 | Réponse perdue après création, puis « e-mail déjà utilisé » au réessai | low | cas rare | defer |
| 18 | Codes de limitation de débit (`over_request_rate_limit`) en `INTERNAL` | low | message « réessayer » adapté | reject |
| 19 | `profiles.email` non synchronisé si l’e-mail change | low | aucun changement d’e-mail dans le MVP | reject |
| 20 | Pas d’index ni d’unicité sur `profiles.email` | low | unicité garantie par `auth.users` | reject |
| 21 | Config Playwright dépend de Supabase local au chargement | low | voulu : les e2e visent le local ; message clair | reject |
| 22 | `appError` ne porte pas le catalogue ; statut `status` en plus | low | appelants passent les textes du catalogue ; la forme `error` est respectée | reject |
| 23 | `tsconfig.json` reformaté | false | réécrit par `next dev` (types de `.next-e2e`) | reject |
| 24 | Ordre migration distante / déploiement non imposé | low | action utilisateur documentée | defer |
| 25 | Statuts story / sprint différents ; Code Map citant `.gitkeep` | false | synchronisés en fin de workflow | reject |

## Design Notes

Les tests de bout en bout démarrent leur propre serveur sur un autre port, avec les variables publiques de Supabase local lues à l'exécution : ils ne créent aucun Compte sur le projet de démonstration. Le formulaire envoie ses données par `onSubmit` + transition plutôt que par `action` : React réinitialiserait sinon le formulaire après l'envoi, et la saisie ne serait pas conservée.

## Verification

**Commands:**
- `npm test` -- expected: unitaires et intégration verts, dont la RLS à deux Comptes
- `npm run test:e2e` -- expected: inscription, coquille et fumée verts aux deux largeurs
- `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected: 0 erreur, aucun secret

**Manual checks (if no CLI):**
- Sur Vercel, après la migration distante : création d'un Compte, puis ligne `profiles` visible dans le tableau de bord Supabase.

## Implementation Notes

- Migration `20261104094731_profiles.sql` : `REVOKE` d'`anon` (et de `PUBLIC` pour `EXECUTE` sur les fonctions, droit dont `anon` hérite), sur l'existant et en privilèges par défaut du rôle `postgres`. Conséquence pour la suite : toute fonction SQL appelable par un Collaborateur devra recevoir un `GRANT EXECUTE ... TO authenticated` explicite.
- `authenticated` ne reçoit que `SELECT` sur `profiles` ; les tests vérifient `42501` pour `anon` et pour toute écriture d'un Collaborateur.
- Formulaire : envoi par `onSubmit` + transition (saisie conservée), verrou synchrone + `isPending` (le verrou seul laissait passer un clic entre la fin de l'appel et le rendu) ; `unstable_rethrow` pour laisser passer la redirection de Next.js.
- `zod` : message du catalogue aussi quand le champ est absent (sinon message anglais par défaut).
- Tests de bout en bout : serveur dédié (`next dev -p 3100`, `NEXT_DIST_DIR=.next-e2e`) pointé sur Supabase local ; `next.config.ts` lit `NEXT_DIST_DIR`, car Next.js 16 refuse deux `next dev` dans le même dossier de build. Clés locales lues à l'exécution par `tests/support/local-supabase.ts`.
- Vérifié : `npm test` 52/52 (dont RLS à deux Comptes), `npm run test:e2e` 39 réussis (5 sautés, propres à l'autre largeur), axe sans violation sur `/inscription`, `lint` 0, `tsc` 0, `build:ci` vert.
- Restent à faire par l'utilisateur : migration distante (`npm run deploy:supabase`) et longueur minimale de 8 caractères sur le projet distant.
- Après revue : défaut global `revoke execute on functions from public` (rôle `postgres`), sans lequel toute nouvelle fonction restait exécutable par `anon` ; `profiles` lisible seulement sur `id`, `display_name`, `created_at` (un `select("*")` ou `select("email")` par un Collaborateur est refusé : sélectionner les colonnes explicitement) ; reprise des Comptes existants ; `coalesce` sur l'e-mail ; paquet `server-only` déclaré.
- Tests après revue : `npm test` 58/58 (dont les privilèges SQL réels via `supabase db query`), `npm run test:e2e` 41 réussis (5 sautés), `lint` 0, `tsc` 0, `build:ci` vert.
- Arbitrages de l'utilisateur appliqués : limite de 72 octets UTF-8 (limite de Supabase Auth) avec « Le mot de passe doit contenir au plus 72 caractères. » ; `weak_password` pour un motif autre que la seule longueur → « Ce mot de passe n'est pas accepté. Choisissez-en un autre. ». Longueur minimale de 8 réglée par l'utilisateur. ~~Migration distante appliquée~~ : **inexact**, voir la correction ci-dessous.
- Tests : `npm test` 62/62, `npm run test:e2e` 43 réussis (5 sautés), `lint` 0, `tsc` 0, `build:ci` vert.
- ~~Vérification sur Vercel confirmée par l'utilisateur le 2026-11-04 (…). Story passée à `done`.~~ **Annulé** : cette vérification reposait sur une migration distante qui n'avait pas été appliquée.

**Correction du 2026-11-04 — anomalie `deploy:supabase` (relevée par l'utilisateur) :**
- `npm run deploy:supabase` avait visé la stack **locale** (127.0.0.1:54322) : la CLI 3.0.0 cible la base locale par défaut et affichait « pass --remote for projet-ia ». La migration `profiles` n'avait donc **pas** été appliquée au projet distant.
- L'utilisateur l'a appliquée lui-même avec `supabase db push --remote` ; la table `profiles` existe maintenant sur le projet distant.
- Script corrigé : `--remote=<référence liée>` explicite pour `db push` et `functions deploy`, échec sans projet lié, contrôle de la cible dans la sortie JSON de la CLI (refus de `"kind":"local"` ou d'un autre projet), puis contrôle par `migration list --remote` que chaque migration locale est présente sur le projet distant. Tests : `tests/unit/deploy-supabase.test.ts`.
- Edge Functions futures : `functions deploy` reçoit la même référence explicite et le même contrôle de cible ; la forme JSON de sa sortie sera vérifiée au premier déploiement d'une fonction (story 2.3).
- Story repassée en `review` jusqu'à la nouvelle vérification de l'utilisateur : `npm run deploy:supabase` corrigé sur le projet distant, puis vérifications Vercel.
- **Second correctif (2026-11-04) :** sur le projet distant, le script corrigé échouait avec « la CLI n'a pas indiqué sa cible », alors que la ligne `Target: project projet-ia (lkjjtcfegplipalraqml) · production` s'affichait. Relevé : hors terminal, la CLI écrit sur stdout le JSON `{"target":{"kind":"linked","project_ref":"<réf>",…}}` et la ligne « Target: » sur stderr ; dans un terminal interactif, elle n'écrit pas ce JSON. Le script ajoute donc `--output-format json` à ses trois commandes, compare exactement `project_ref` à la référence liée (refus de `kind: local` et d'un autre projet), et affiche en cas d'échec le début de la sortie reçue, identifiants d'URL masqués. Tests ajoutés avec la sortie réelle de la CLI. Exécution distante laissée à l'utilisateur.
- **Confirmation par e-mail encore active sur le projet distant (2026-11-04) :** le journal Auth montrait `mail.send` à l'inscription ; l'utilisateur l'a désactivée. Le code traite désormais ce cas clairement : un Compte accepté par Supabase sans session renvoie `{ status: "confirmation_required" }` (et non plus l'erreur inattendue « Le Compte n'a pas pu être créé. », fausse puisque Supabase a accepté la demande) ; l'écran affiche un message neutre, `role="status"`, sans rouge : « Votre Compte n'a pas pu être ouvert directement. Une confirmation par e-mail est demandée… » ; le serveur journalise `sign_up_without_session` sans e-mail ni mot de passe. Test unitaire ajouté. Prérequis corrigé dans `docs/environnements.md` et `epics.md`.

**Critères d'acceptation (bilan final, 2026-11-04) :**
- Création sans confirmation par e-mail, ligne `profiles`, arrivée connecté sur le Tableau de bord : ✔ sur Supabase local (tests) et sur Vercel (vérifié par l'utilisateur après désactivation de la confirmation et application de la migration distante).
- E-mail invalide, mot de passe trop court ou trop long, e-mail déjà utilisé, saisie conservée, envoi unique : ✔ (tests et Vercel).
- `anon` sans accès, RLS à deux Comptes, privilèges SQL : ✔ (tests sur Supabase local).
- Forme d'erreur unique et textes du catalogue : ✔.
- Tests existants, lint, build : ✔.
- Story passée à `done` le 2026-11-04 à 15:34. Reste hors de cette story : la confirmation de `npm run deploy:supabase` corrigé (critère AC5 de la story 1.1).
