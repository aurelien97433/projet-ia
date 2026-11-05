---
title: 'Story 2.2 : Créer une Note'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_commit: 'da04e0e596d43e1cf4545bf3f06f10cfbfa6b93d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un Collaborateur ne peut encore rien ajouter : il n'existe ni table `documents`, ni formulaire d'ajout, ni page Document.

**Approach:**
- **Base.** Une migration crée `documents`, avec RLS, privilèges par colonne et Statut forcé à *en cours*, et la vue `documents_list` (`security_invoker`).
- **Serveur.** Un schéma `zod` valide la saisie. Une aide `requireUser()` sert à chaque Server Action protégée. La Server Action de création est idempotente par `client_request_id`.
- **Interface.**
  - Page `/ajouter` (E8), onglet Note.
  - Page `/documents/[id]` minimale (E7) : titre, métadonnées, badge, texte brut.
  - Composant `StatusBadge`.
- **Tests.** RLS à deux Comptes, unitaires et Playwright, sur Supabase local.

## Boundaries & Constraints

**Always:**
- **Session.** Chaque Server Action d'un écran protégé appelle `requireUser()` (`getClaims`) avant toute écriture. Sans session : `UNAUTHENTICATED`, avec « Votre session a expiré. Reconnectez-vous pour continuer. » ; aucune écriture. La RLS reste la barrière finale.
- **Table `documents`.**
  - RLS activée. `anon` n'a aucun privilège, `authenticated` n'a que :
    - `SELECT` ;
    - `INSERT (title, category, content_text, client_request_id)` ;
    - `UPDATE (title, category)`.
  - `author_id = auth.uid()` par défaut et dans la politique ; `status = processing`, `attempt_id` et `processing_started_at` sont posés par défaut.
  - `status`, `attempt_id`, `error_*`, `author_id` et `kind` ne sont jamais modifiables par `authenticated`.
  - Unicité (`author_id`, `client_request_id`).
- **Contraintes en base.** Titre de 1 à 200 caractères après suppression des espaces. Texte d'une Note non vide et de 1 000 000 octets UTF-8 au plus. Catégorie parmi les 7 valeurs.
- **Vue `documents_list`.** `security_invoker = true`, sans `content_text` ni Résumé. Elle expose `effective_status` (*en erreur* au-delà de 3 min *en cours*), `effective_error_kind`, le nom de l'Auteur et `server_now`.
- **Validation `zod`.** Côté serveur : titre, Catégorie, texte non vide de 1 000 000 octets au plus, `client_request_id` UUID. `next.config.ts` fixe `experimental.serverActions.bodySizeLimit = '2mb'`, pour que la limite de taille soit appliquée par le schéma.
- **Idempotence.** Un même `client_request_id` (UUID généré une fois par formulaire, réutilisé par « Réessayer ») renvoie le Document existant. Un double clic ne crée qu'un Document : verrou synchrone et `aria-disabled`.
- **Formulaire.**
  - Champs obligatoires vérifiés à l'envoi : focus sur le premier champ manquant, message sous le champ (« Indiquez un titre. », « Choisissez une Catégorie. », « Le texte ne peut pas être vide. »), aucun envoi.
  - Saisie conservée en cas d'erreur. Échec ou absence de réponse en 10 s : alerte « Le Document n'a pas pu être enregistré. Votre saisie est conservée. » + « Réessayer ».
- **Annuler.** Sans saisie : retour à l'écran précédent. Avec une saisie : `AlertDialog` « Abandonner ce Document ? », dont « Continuer la saisie » conserve tout.
- **Succès.** Redirection vers `/documents/[id]`, avec « Document ajouté. Traitement en cours. » (`role="status"`) et le badge « ◔ en cours de traitement ».
- **Page Document.** Identifiant invalide ou inconnu : E9. Texte affiché en texte brut (aucun HTML interprété), `overflow-wrap: anywhere`.

**Décisions du 2026-11-05 :**
- **Q1 = A** : seul l'onglet « Note » existe jusqu'à 2.6a.
- **Q2 = A** : « Le texte dépasse 1 Mo, la taille maximale. »
- La spec est gardée entière.
- **`author_id`.** Il prend sa valeur de `auth.uid()`, et la politique `INSERT` vérifie `author_id = auth.uid()`.
- **Appel direct.** Un appel direct (clé publique et jeton d'un Collaborateur) ne peut forcer ni `author_id`, ni `status`, ni `attempt_id`, ni `processing_started_at`, ni les champs d'erreur. Le test RLS couvre chacun de ces cas.
- **Rejeu.** Un rejeu de `client_request_id` ne renvoie jamais le Document d'un autre Auteur : la relecture filtre sur `author_id` = l'utilisateur de la session. Un même `client_request_id` utilisé par deux Auteurs crée deux Documents.
- **Journaux.** Aucune donnée sensible : ni texte, ni titre, ni e-mail, ni jeton. Seulement des codes et des identifiants.

**Never:**
- Appel de `process-document`, interrogation du Statut, relance (2.3 à 2.5).
- Suppression (3.4). Garde de navigation et `beforeunload` (2.9).
- Écriture vers Supabase depuis un composant client.
- Story 2.3.
- Commit ou push sans validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Création | titre, Catégorie, texte | 1 Document `processing`, avec `attempt_id` et `processing_started_at` ; page Document, notification, badge | — |
| Champ manquant | titre vide, aucune Catégorie ou texte vide | aucun envoi ; message sous le premier champ manquant, qui reçoit le focus | `aria-invalid`, `aria-describedby` |
| Texte trop long | 1 000 001 octets (ou 500 001 « é ») | refus `zod`, message sous « Texte », saisie conservée, aucun Document | ce n'est pas la limite des Server Actions qui répond |
| Texte à la limite | 1 000 000 octets | Document créé | — |
| Double clic ou renvoi | même `client_request_id` deux fois | un seul Document, même page | — |
| Session absente | Server Action appelée sans session | aucune écriture, `UNAUTHENTICATED` | message de session expirée |
| Panne à l'envoi | requête coupée, ou plus de 10 s | alerte et « Réessayer » (même `client_request_id`) | saisie conservée |
| Annuler avec saisie | « Annuler », puis « Continuer la saisie » | tout est conservé | — |
| RLS : autre Compte | B lit `documents_list` ; tente de modifier le titre ou le Statut de A | lecture sans `content_text` ; aucune modification | 0 ligne ou `42501` |
| RLS : Auteur | A tente de modifier `status`, `attempt_id`, ou d'insérer avec `status = ready` ou un autre `author_id` | refus | `42501` |
| Visiteur | `anon` sur `documents` et `documents_list` | rien | `42501` |
| Document inconnu | `/documents/abc` ou un UUID absent | E9, statut 404 | — |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261104094731_profiles.sql` -- modèle à suivre : `REVOKE` d'`anon` (et privilèges par défaut) et `EXECUTE` retiré à `PUBLIC`. Supabase accorde par défaut `ALL` à `authenticated` sur toute nouvelle table : il faut faire un `revoke all … from anon, authenticated`, puis des `GRANT` par colonne. `profiles` n'est lisible que sur `id`, `display_name` et `created_at`, ce qui suffit pour la jointure de la vue.
- `tests/integration/profiles-rls.test.ts` -- modèle des tests à deux Comptes (`signUp` sur Supabase local, nettoyage par `auth.admin.deleteUser`, codes `42501`).
- `tests/integration/anon-access.test.ts` -- parcourt déjà chaque table et vue de `public` avec la clé publique : `documents` et `documents_list` y sont couvertes automatiquement.
- `src/server/auth/current-user.ts` -- `getCurrentUser()` (`getClaims`, `cache`, `connection`), base de `requireUser()`.
- `src/app/(auth)/connexion/sign-in-form.tsx`, `src/server/auth/sign-in.ts` -- mécanique de formulaire à reprendre : `onSubmit` + transition, verrou synchrone, `unstable_rethrow`, résultat typé, focus.
- `src/components/forms/` -- `FormField`, `SubmitButton`, `ErrorAlert`. Une zone de texte et une liste de choix sont à ajouter, avec la même accessibilité.
- `src/components/shell/page-title.tsx` -- titre focalisé. `src/app/(app)/ajouter/page.tsx` : titre seul aujourd'hui.
- `src/lib/errors.ts` -- `appError`, `logEvent`. `src/lib/texts.ts` : catalogue.
- `src/app/globals.css` -- jetons `pending`, `pending-soft`, `success`, `success-soft`, `destructive`, `destructive-soft` ; `--container-reading: 72ch`.
- `radix-ui` -- `Tabs` et `AlertDialog` sont disponibles, à importer comme `sheet.tsx` (`import { Dialog as SheetPrimitive } from "radix-ui"`).
- `next.config.ts` -- `cacheComponents` : la page Document lit des données sous la `Suspense` de `SessionGate`. `params` est une promesse.
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md` -- `experimental.serverActions.bodySizeLimit`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<horodatage>_documents.sql` -- types énumérés, table, contraintes, index unique, déclencheur `updated_at`, RLS, `GRANT` par colonne, vue `documents_list`.
- [x] `src/server/auth/require-user.ts` -- `requireUser()` : utilisateur ou `UNAUTHENTICATED`.
- [x] `src/lib/schemas/documents.ts`, `src/lib/documents.ts` -- schéma de Note ; Catégories (valeur et libellé) ; libellés de Statut.
- [x] `src/server/documents/create-note.ts`, `get-document.ts` -- création idempotente (23505 → Document existant) ; lecture pour la page (UUID invalide → null).
- [x] `src/app/(app)/ajouter/{page,actions,note-form}.tsx` + `src/components/ui/{tabs,alert-dialog}.tsx` + `src/components/forms/{text-area-field,select-field}.tsx` -- E8.
- [x] `src/app/(app)/documents/[id]/page.tsx` + `src/components/documents/status-badge.tsx` -- E7 minimale.
- [x] `src/lib/texts.ts`, `next.config.ts` -- textes, limite du corps à 2 Mo.
- [x] `tests/unit/` -- schéma (octets, limite exacte, multi-octets), `requireUser`, création (idempotence, 23505, erreurs).
- [x] `tests/integration/documents-rls.test.ts` -- toute la partie RLS de la matrice, avec privilèges SQL réels.
- [x] `tests/e2e/ajouter.spec.ts` -- création, champs manquants, texte trop long, double clic, panne et réessai, Annuler, E9, axe à 1 280 et 375 px.

**Acceptance Criteria:**
- Given la migration, when `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit` et `npm run build:ci` sont lancés, then tout passe.
- Given la migration appliquée au projet distant par `npm run deploy:supabase` **avant** le push, when une Note est créée sur Vercel, then sa page s'affiche avec le badge « ◔ en cours de traitement ».

## Design Notes

- **Statut forcé sans fonction SQL.** Les privilèges par colonne empêchent tout `INSERT` ou `UPDATE` de `status` par `authenticated`. Les valeurs par défaut posent la tentative. La politique `with check` revérifie `author_id` et `status`. Les fonctions des stories 2.3 à 2.5 passeront par `security definer` ou par `service_role`.
- **Idempotence.** `insert` simple. Sur une violation d'unicité (23505), le Document de même (`author_id`, `client_request_id`) est relu. Deux requêtes simultanées : la seconde attend la validation de la première, puis relit.
- **Notification.** « Document ajouté. Traitement en cours. » passe par `/documents/[id]?ajoute=1`, comme « Vous êtes déconnecté. » en story 1.4 : il n'existe pas encore de composant de notification.
- **Catégorie.** Liste native `<select>` (accessible, clavier natif), stylée comme les champs.

## Verification

**Commands:**
- `npm test` -- expected: unitaires et intégration verts, dont la RLS de `documents` à deux Comptes.
- `npm run test:e2e` -- expected: tout vert aux deux largeurs.
- `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected: 0 erreur, aucun secret.

## Implementation Notes

- **Migration** `20261105105410_documents.sql`.
  - `revoke all … from anon, authenticated`, puis privilèges par colonne : `INSERT (title, category, content_text, client_request_id)` et `UPDATE (title, category)`. Pas de `DELETE` avant la story 3.4.
  - Valeurs par défaut : `author_id = auth.uid()`, `status`, `attempt_id`, `processing_started_at`.
  - Contraintes : titre, taille du texte, Note non vide, unicité (`author_id`, `client_request_id`).
  - Vue `documents_list` en `security_invoker`, avec un Statut effectif à 3 min.
  - Fonction de déclencheur `set_updated_at` (`search_path` vide, `EXECUTE` retiré).
- **`requireUser()`** (`src/server/auth/require-user.ts`) est appelée en tête de `createNoteAction`, avant toute écriture : c'était le point reporté depuis la story 1.4.
- **Proxy.** Les requêtes de Server Action (POST + en-tête `next-action`) ne sont plus redirigées.
  - Avant ce changement, un envoi sans session recevait une redirection 307 vers `/connexion`. Le navigateur affichait alors « Le Document n'a pas pu être enregistré » avec « Réessayer », sans issue possible.
  - Désormais, l'action répond `UNAUTHENTICATED` et le formulaire affiche « Votre session a expiré. Reconnectez-vous pour continuer. », sans « Réessayer ».
  - C'était le second point reporté depuis la story 1.4, maintenant observé et corrigé.
- **Texte canonique (AD-8).** Fins de ligne `\n` et forme NFC, appliquées avant la mesure et avant l'enregistrement, côté navigateur comme côté serveur. Défaut trouvé par les tests : l'envoi d'un formulaire multipart convertit `\n` en `\r\n`, si bien qu'une Note de 1 000 000 octets comptée par le navigateur dépassait la limite côté serveur.
- **Idempotence.** Insertion simple. Sur une violation d'unicité (23505), le Document est relu en filtrant sur `author_id` = l'utilisateur de la session. Le test e2e « réponse perdue » vérifie que la création a bien lieu côté serveur, puis que « Réessayer » réutilise le même identifiant de demande : un seul Document au total.
- **Page Document.**
  - `connection()` en tête, et `loading.tsx` (squelette prévu par l'UX), qui sert de frontière `Suspense` exigée par `cacheComponents`.
  - **Écart avec la matrice** : pour un Document inconnu, E9 s'affiche avec `<meta name="robots" content="noindex">`, mais le statut HTTP reste 200 et non 404. La coquille est déjà envoyée en flux quand `notFound()` s'exécute ; la documentation de Next.js 16 le confirme. Une URL sans route garde son 404.
- **E8.** Le titre de page ne prend pas le focus : le focus va sur « Titre », comme le prévoit l'UX. La liste des Catégories est un `<select>` natif. Seul l'onglet « Note » existe (décision Q1).
- **Outillage de test.**
  - `test:e2e` utilise maintenant un build de production (`next build` puis `next start`) au lieu de `next dev`. Avec la nouvelle route, `next dev` recompilait les routes à la demande et rechargeait les pages pendant les tests parallèles : 31 à 35 échecs, et plus de 11 min. Après le changement : 117 réussis en 1 min.
  - Délais Playwright relevés : 60 s par test, 10 s par attente, 120 s pour la session du worker.
  - `testTimeout` de Vitest porté à 60 s, à cause des appels concurrents à `supabase db query`.
- **Vérifié** :
  - `npm test` : 255/255, dont 32 tests RLS de `documents` et l'accès `anon` à chaque relation.
  - `npm run test:e2e` : 117 réussis et 5 ignorés.
  - `lint` : 0 erreur. `tsc` : 0 erreur. `build:ci` et `check:secrets` : verts.

## Spec Change Log

## Review Triage Log

Revue ciblée du 2026-11-05 : sécurité et RLS, faite par l'IA, sans relecteurs.

| # | Point contrôlé | Verdict | Preuve | Suite |
|---|---|---|---|---|
| 1 | Appel direct qui force `author_id`, `status`, `attempt_id`, `processing_started_at`, `error_*`, `kind`, `summary_points` ou `text_version` | false (aucun défaut) | aucun privilège `INSERT` ni `UPDATE` sur ces colonnes ; 9 cas d'insertion et 7 de modification en `42501` (tests) | — |
| 2 | Supabase accorde `ALL` à `authenticated` sur une nouvelle table | false | `revoke all` explicite ; `has_column_privilege` et `has_table_privilege` vérifiés | — |
| 3 | Rejeu renvoyant le Document d'un autre Auteur | false | relecture filtrée sur `author_id` (test unitaire) ; même identifiant chez deux Auteurs = deux Documents (test RLS) | — |
| 4 | `documents_list` contournant la RLS | false | `security_invoker = true` vérifié dans `pg_class.reloptions` | — |
| 5 | Données sensibles dans les journaux | false | `create_note_*` : `user_id`, `document_id`, code seulement ; test sans titre ni texte | — |
| 6 | Server Action sans session redirigée par le proxy (307), avec un message trompeur | medium | test e2e : « Le Document n'a pas pu être enregistré » + « Réessayer » | corrigé : les Server Actions sont transmises, `requireUser` répond ; tests unitaires et e2e |
| 7 | Texte compté différemment par le navigateur et le serveur (`\r\n`) | medium | Note de 1 000 000 octets refusée | corrigé : texte canonique (AD-8) avant la mesure |
| 8 | Texte non canonique stocké par un appel direct (`\r\n`, non NFC) | low | la base ne vérifie que la taille | reject : `process-document` (2.4) devra reconstruire le texte canonique avant le découpage |
| 9 | Inscription ouverte, Notes de 1 Mo en grand nombre : stockage du plan gratuit (500 Mo) | low | aucun quota d'ajout dans le PRD | reject : hors périmètre ; à surveiller avec le test de charge (2.7) |
| 10 | Lecture du texte complet par tout Collaborateur, quel que soit le Statut | false | conforme aux règles d'accès (page Document, tout Collaborateur) | — |
| 11 | E9 servi avec le statut 200 | low | statut figé par le flux ; `noindex` présent | accepté, signalé à l'utilisateur |

**Après validation (2026-11-05) :**
- **Écart du statut 200 sur un Document inconnu** : accepté pour le MVP par l'utilisateur, consigné dans `deferred-work.md`.
- **`deploy:supabase` a échoué chez l'utilisateur** avec seulement « supabase db push a échoué », alors qu'une migration était en attente. L'utilisateur l'a appliquée avec `supabase db push --remote`, puis `deploy:supabase` a réussi.
  - Cause : face à un projet hébergé, la CLI demande une confirmation et la refuse sans terminal interactif, sauf avec `--yes`. Le script jetait la sortie JSON qui contenait l'erreur.
  - Correction :
    - `--yes` sur `db push` et `functions deploy` ;
    - message de la CLI affiché (code et message, identifiants d'URL masqués) ;
    - logique extraite dans `runDeploy(dir, cli)`.
  - Tests ajoutés avec une CLI simulée qui exige `--yes` pour une migration en attente : succès et ordre des commandes, erreur affichée et masquée, migration absente après le push, cible locale, projet non lié.
  - `--yes` est accepté par la CLI 3.0.0 (vérifié sur la base locale, sans effet distant).
- La story reste en `review` jusqu'à la vérification de l'utilisateur en production.

**Clôture (2026-11-05) :**
- L'utilisateur a vérifié en production :
  - Note créée, notification et badge corrects au départ ;
  - ligne `documents` avec `status = processing` et son `author_id` ;
  - Document lisible par un second Compte, sans action de modification.
- Après 3 min, le badge passe à « en erreur », ce qui est attendu avant les stories 2.3 et 2.4. En revanche, la notification `?ajoute=1` reste affichée : reporté à la story 2.3 (`deferred-work.md`), où le bandeau de Statut prendra le relais selon l'état réel.
- Story passée à `done` à la demande de l'utilisateur.
