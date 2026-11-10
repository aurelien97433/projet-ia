---
title: 'Story 3.3 : Parcourir la Bibliothèque'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '52974afca9ca5076458378e544559085b74c3ce3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La page `/bibliotheque` n'affiche qu'un titre : un Collaborateur ne peut ni lister, ni filtrer, ni retrouver les Documents de la Base commune.

**Approach:** La page lit une première liste côté serveur (`documents_list`, colonnes explicites, sans `content_text`), puis un composant client applique filtres, recherche et tri par un Route Handler `GET /api/documents`, et suit les badges *en cours* par un second Route Handler groupé.

## Boundaries & Constraints

**Always:**
- **Lecture** : uniquement par `src/server/documents/list-documents.ts`, avec le jeton du Collaborateur (RLS) ; colonnes `id, title, category, author_id, author_name, created_at, effective_status` ; jamais `content_text` ni Résumé. Tous Statuts confondus.
- **Filtres validés côté serveur (zod)** : Catégorie de la liste ou « toutes » ; `mine` booléen, l'Auteur venant de la session et jamais du client ; recherche de 0 à 200 caractères, partielle, sans casse (`ilike`, `%`, `_` et `\` échappés) ; tri `recent` (défaut) ou `oldest`, départage par `id`. Valeur invalide : 400 neutre.
- **Nombre exact** renvoyé avec la liste (`count: "exact"`), lignes plafonnées à 200 (Q2).
- **Filtres** : liste native « Catégorie » (« Toutes les Catégories »), interrupteur « Mes Documents » (`role="switch"`), champ « Rechercher un titre » (délai 250 ms), liste « Trier par » (« Plus récents d'abord » / « Plus anciens d'abord »). Une requête plus récente annule la précédente ; la réponse périmée est ignorée.
- **Nombre annoncé** dans une région `aria-live="polite"` après chaque résultat de filtre (Q1).
- **États** : squelette de 8 lignes (`loading.tsx`, avec le message des 10 s existant) ; Base vide ; « Mes Documents » vide ; aucun résultat avec « Réinitialiser les filtres » ; erreur `role="alert"` « Cette liste n'a pas pu être chargée. » + « Réessayer », filtres conservés. Textes du catalogue, dans `src/lib/texts.ts`.
- **Tableau** : Titre (seul lien, vers `/documents/{id}`, ligne entière cliquable à la souris par CSS, sans JavaScript), Catégorie, Auteur, Date d'ajout, Statut (badge existant). En-têtes non triables. 768–1023 px : Auteur sous le titre. Moins de 768 px : Q3. Jamais de défilement horizontal de la page à 375 px.
- **Suivi des badges** : toutes les 3 s tant qu'une ligne affichée est *en cours*, une seule requête groupée, sans déplacer focus ni défilement ; après 3 échecs, « Le Statut n'a pas pu être actualisé. » + « Actualiser » au-dessus de la liste ; 401 : `router.refresh()`. Une ligne absente de la réponse garde son état.
- Route Handlers : `requireUser()`, `Cache-Control: no-store`, forme d'erreur `{ error: { code, message, retryable } }`.

**Décisions du 2026-11-10 :**
- **Q1 = A.** Nombre visible au-dessus du tableau et annoncé : « {n} Documents » / « 1 Document » / « Aucun Document ».
- **Q2 = A.** 200 lignes au plus ; le nombre reste le total exact ; au-delà : « Seuls les 200 premiers Documents sont affichés. Affinez les filtres. »
- **Q3 = A.** Sous 768 px : tableau resserré (Titre, Statut), « Catégorie · Auteur · date » sous le titre, aucun défilement.
- **Q4 = A.** Changement de Statut annoncé seulement pour les Documents de l'utilisateur : « « {titre} » : {statut}. ».
- **Story gardée entière**, au-dessus du repère de taille.
- **Routes** : `/api/documents` et `/api/documents/statuses` vérifient elles-mêmes la session. `statuses` n'accepte que des UUID valides, 200 au plus (sinon 400), et ne renvoie que des champs de `documents_list` (`id`, `effective_status`). Aucune donnée de `content_text` dans ces réponses.
- **Index trigramme** : noté dans `deferred-work.md`, seulement si le volume l'exige.

**Never:** Filtres dans l'URL, cartes, « Filtres ({n}) » (story 3.6). Tableau de bord (3.5). Suppression (3.4). Migration SQL ou index `pg_trgm`. Écriture depuis un composant client vers Supabase. Délai de test augmenté pour stabiliser. Commit ou push sans validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ouverture | Documents de A et B, tous Statuts | toutes les lignes, plus récents d'abord, nombre total | — |
| Combinaison | Procédure + Mes Documents + « FACTU » + oldest | Procédures de l'utilisateur dont le titre contient « factu », anciens d'abord | — |
| Joker | recherche `%` ou `_` | titres contenant ce caractère seulement | — |
| Base vide | aucun Document, aucun filtre | « La Base commune est encore vide. » + « Ajouter un Document » | — |
| Mes Documents vide | seul filtre actif, aucun Document à soi | « Vous n'avez encore ajouté aucun Document. » + « Ajouter un Document » | — |
| Aucun résultat | autre combinaison vide | « Aucun Document ne correspond à ces filtres. » + « Réinitialiser les filtres » | — |
| Erreur | API en 500 ou réseau coupé | alerte + « Réessayer », filtres inchangés | réessai avec les mêmes filtres |
| Paramètre hostile | `category=x`, `sort=y`, recherche > 200 | 400, rien d'affiché tel quel | alerte d'erreur |
| En cours → prêt | ligne *en cours* | badge « prêt » sans rechargement | 3 échecs : « Actualiser » |
| Sans session | appel API | 401 | `router.refresh()` |

</frozen-after-approval>

## Code Map

- `src/app/(app)/bibliotheque/page.tsx` -- aujourd'hui `PageTitle` seul. Modèle : `src/app/(app)/documents/[id]/page.tsx` (`await connection()`, `createClient()`, `getCurrentUser()`).
- `src/app/(app)/documents/[id]/loading.tsx`, `src/components/documents/slow-loading-notice.tsx` -- modèle du squelette et message des 10 s, à réutiliser.
- `src/server/documents/get-document-status.ts` -- modèle de lecture `documents_list` + `logEvent` ; type `Db`.
- `src/app/api/documents/[id]/status/route.ts` -- modèle de Route Handler (`requireUser`, `NO_STORE`, `appError`).
- `src/components/documents/document-status-provider.tsx` -- modèle d'interrogation (3 s, délai de 5 s, jamais deux requêtes, 3 échecs). Ne pas le modifier : il est propre à la page Document.
- `src/components/documents/status-badge.tsx`, `added-on.tsx` -- réutilisés tels quels.
- `src/components/forms/select-field.tsx` -- liste native ; prévoit un placeholder désactivé : écrire un champ dédié ou l'étendre sans casser `note-form.tsx`.
- `src/lib/documents.ts` (`DOCUMENT_CATEGORIES`, `MAX_TITLE_LENGTH`), `src/lib/texts.ts` (`categories`, `status`, `documentStatus.statusUnavailable/refresh`).
- Vue `documents_list` : `supabase/migrations/20261109090000_retry_processing.sql:7` ; index `documents_created_at_idx` existant. Pas de migration.
- `tests/support/` -- aides e2e existantes (Comptes, Documents) ; `tests/e2e/document-page.spec.ts` -- modèle de test à 375 px.
- `AGENTS.md` : lire `node_modules/next/dist/docs/` pour Route Handlers et `cacheComponents`. Ne lire aucun fichier `.env*`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/schemas/library.ts` -- schéma zod des filtres, échappement `ilike` -- validation partagée.
- [x] `src/server/documents/list-documents.ts` -- `listDocuments(filters, userId, db)` et `getDocumentStatuses(ids, db)` (au plus le plafond d'ids) -- seule lecture de la liste.
- [x] `src/app/api/documents/route.ts`, `src/app/api/documents/statuses/route.ts` -- Route Handlers.
- [x] `src/components/library/*` -- filtres, tableau, états, suivi des Statuts, nombre annoncé.
- [x] `src/app/(app)/bibliotheque/page.tsx`, `loading.tsx`, `src/lib/texts.ts` -- page, squelette de 8 lignes, textes.
- [x] `tests/unit/` -- schéma, échappement, `listDocuments` (colonnes sans `content_text`), composants (états, délai de 250 ms, réponse périmée ignorée, 3 échecs).
- [x] `tests/integration/` -- `listDocuments` sur Supabase local : B voit les Documents de A, `mine`, recherche partielle sans casse, jokers.
- [x] `tests/e2e/library.spec.ts` -- ouverture, combinaison, états vides, erreur + Réessayer (route interceptée), en cours → prêt, lien, 375 px sans défilement, axe.

**Acceptance Criteria:**
- Given la Bibliothèque, when je l'ouvre, then chaque ligne affiche titre (lien), Catégorie, Auteur, date et badge, plus récents d'abord, tous Statuts.
- Given un titre de la liste, when je l'active au clavier ou clique sur la ligne, then la page du Document s'ouvre.
- Given la page à 1280 px puis à 375 px, when je la lis, then le tableau est lisible et la page ne défile pas horizontalement.
- Given les réponses réseau de la page, when je les inspecte, then aucune ne contient `content_text`.

## Design Notes

Première liste rendue côté serveur (pas d'aller-retour au premier affichage) ; les changements de filtre passent par l'API, ce qui rend l'erreur et « Réessayer » possibles sans perdre les filtres. Le suivi groupé évite une requête par ligne *en cours*. La page reste dynamique (`connection()`) : aucune donnée prérendue, donc `check:secrets --static` n'a pas besoin d'être étendu ; à vérifier dans la sortie de `build:ci` (`ƒ /bibliotheque`).

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run test:e2e` -- expected : tout vert, aucun secret, `/bibliotheque` dynamique.

**Manual checks:**
- Production : voir le rapport de fin de story.

## Implementation Notes

- **« * » et PostgREST.** PostgREST traduit tout `*` d'un motif `like`/`ilike` en `%`, sans échappement possible (vérifié sur Supabase local). Une recherche contenant `*` garde donc `ilike` (`*` remplacé par `_`) et ajoute un filtre `imatch` sur l'expression régulière échappée (`escapeRegex`) : `*` n'est jamais un joker. Couvert par `tests/integration/list-documents.test.ts`.
- **Statuts groupés** : `GET /api/documents/statuses?ids=uuid,uuid` (liste séparée par des virgules, doublons retirés) ; réponse `{ statuses: [{ id, effectiveStatus }] }`.
- **Paramètres de `GET /api/documents`** : `category`, `mine=true|false`, `search`, `sort=recent|oldest` ; paramètre répété refusé (400), clé inconnue ignorée ; seules les valeurs différentes du défaut sont envoyées.
- **Lecture serveur impossible** au premier affichage : la page s'affiche avec l'alerte « Cette liste n'a pas pu être chargée. » et « Réessayer » (filtres par défaut), sans écran d'erreur.
- **Délai de 10 s** sur une requête de filtre : au-delà, alerte et « Réessayer » (jamais de chargement infini).
- `SelectField` : `placeholder` devenu facultatif (sans lui, aucune option d'invite) ; `note-form.tsx` inchangé.
- Le squelette de 8 lignes est vérifié en test unitaire (`tests/unit/library-loading.test.tsx`) ; l'apparition du message à 10 s reste prouvée en e2e sur la page Document (même composant).
- **`build:ci`** affiche `◐ /bibliotheque` (Partial Prerender, comme `/documents/[id]`), pas `ƒ` : avec `cacheComponents`, seul le shell statique est prérendu. Vérifié : `.next/server/app/bibliotheque.html` ne contient aucune donnée de liste (ni identifiant, ni Statut, ni Auteur) ; `check:secrets --static` n'a donc pas besoin d'être étendu ici.
- **`tests/e2e/document-page.spec.ts` (« chargement lent »)** : page de départ passée de `/bibliotheque` à `/recherche`. La Bibliothèque affiche désormais des liens vers les Documents, que Next.js précharge seul ; le préchargement déclenché par le test devenait sans effet et le test échouait. Aucun délai modifié.

## Spec Change Log

## Review Triage Log

Revue ciblée du 2026-11-10 (accès, performances de la liste, accessibilité), menée directement, sans les trois relecteurs, à la demande de l'utilisateur. Aucun correctif nécessaire.

| # | Axe | Constat | Verdict | Preuve | Suite |
|---|---|---|---|---|---|
| R1 | Accès | Les deux routes vérifient la session (`requireUser`, 401), lisent avec le jeton du Collaborateur (RLS de `documents_list`, `security_invoker`), `no-store` ; `statuses` n'accepte que 1 à 200 UUID (400 sinon) et ne renvoie que `id` et `effective_status` ; « Mes Documents » prend l'Auteur dans la session | false | `route.ts` des deux routes, `parseStatusIds`, tests `library-routes`, e2e « sans session » et « paramètre hostile » | aucune |
| R2 | Accès | Aucune donnée de `content_text` dans les réponses ni dans la page prérendue | false | colonnes explicites (`LIBRARY_COLUMNS`) ; e2e « ouverture » : aucune réponse ne contient le texte témoin ; `bibliotheque.html` sans ligne de Document | aucune |
| R3 | Accès | `/api/documents` renvoie l'identifiant de l'Auteur de chaque Document | low | nécessaire à l'annonce Q4 ; ces identifiants sont déjà lisibles par tout Collaborateur (`profiles.id`) | rejeté : aucune donnée nouvelle exposée |
| R4 | Performances | Next.js précharge partiellement chaque lien de titre visible (squelette de `/documents/[id]`) | low | comportement par défaut documenté (`loading.tsx` présent), coût limité au squelette ; seules les lignes visibles | rejeté : recommandé par Next.js, navigation plus rapide |
| R5 | Performances | Recherche `ilike '%…%'` sans index | low | parcours complet de la table, négligeable pour quelques dizaines de Documents ; 200 lignes au plus, total exact, tri sur l'index `created_at` | différé (décision de l'utilisateur, `deferred-work.md`) |
| R6 | Performances | Suivi des Statuts : une seule requête groupée toutes les 3 s, jamais deux à la fois, arrêt quand plus rien n'est *en cours* ; requête de filtre annulée par la suivante, réponse périmée ignorée | false | `use-library-statuses.ts`, `library-view.tsx` (`AbortController`, `isCurrent`) ; tests `library-view` | aucune |
| R7 | Accessibilité | Une annonce de Statut identique à la précédente (même titre, même Statut) ne serait pas relue | low | région `aria-live` dont le texte ne change pas ; cas improbable (deux Documents de l'utilisateur au même titre passant au même Statut dans deux cycles successifs) | rejeté |
| R8 | Accessibilité | Libellés visibles (« Catégorie », « Rechercher un titre », « Trier par »), interrupteur `role="switch"` au clavier, un seul lien par ligne, nombre annoncé à chaque résultat (`key` de version), erreur en `role="alert"`, focus replacé après « Réessayer », « Réinitialiser les filtres » et « Actualiser », axe sans violation aux deux largeurs | false | `library-filters.tsx`, `library-view.tsx`, e2e « ouverture » et « titres longs » (axe) | aucune |

## Verification Results

**Résultats du 2026-11-10 (session principale, après l'agent) :** `npm run lint` et `npx tsc --noEmit` propres ; `npm test` : 46 fichiers, 762 tests réussis ; `npm run build:ci` vert, aucun secret, `◐ /bibliotheque` sans donnée de liste dans `bibliotheque.html` ; `npm run test:e2e` complet : 257 réussis, 5 sautés, aucun échec, délais inchangés. Matrice couverte : ouverture, combinaison, « Mes Documents » vide, aucun résultat, erreur, paramètre hostile, sans session, en cours → prêt (e2e) ; jokers (intégration) ; Base vide et 3 échecs du suivi (unitaires, la base locale partagée n'étant jamais vide en e2e). Dans la suite complète de l'agent, deux échecs (« chargement lent », corrigé par la page de départ ; « rafraîchissement périmé », intermittent connu) : absents de cette suite.
