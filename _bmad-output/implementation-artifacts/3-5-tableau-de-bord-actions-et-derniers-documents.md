---
title: 'Story 3.5 : Tableau de bord (actions et derniers Documents)'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '296b6db7997e6eeef7195f404dc3e7397fd7e0ed'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le Tableau de bord (`/`) n'affiche qu'un titre : aucune action clé ni aucun Document récent.

**Approach:** Bande d'actions rendue tout de suite, puis liste « Derniers Documents » (5 derniers de la Base commune, tous Statuts) lue côté serveur dans sa propre frontière Suspense, avec squelette, état vide et erreur confinée à la liste.

## Boundaries & Constraints

**Always:**
- **Lecture** : `listDocuments` existant (`src/server/documents/list-documents.ts`), filtres par défaut, 5 lignes au plus, jeton du Collaborateur ; colonnes de `LIBRARY_COLUMNS`, jamais `content_text`.
- **Bande d'actions** : « Ajouter un Document » (→ `/ajouter`) utilisable dès le premier affichage, y compris pendant le chargement ou l'erreur de la liste.
- **« Poser une question » : aucun bouton** tant que l'Assistant n'est pas utilisable (même règle que la story 3.2). Emplacement prévu dans le code seulement.
- **Emplacements prévus dans le code, rien d'affiché** : champ de Recherche (4.1b, en tête de la bande d'actions) et « Mes dernières Conversations » (5.6).
- **Liste « Derniers Documents »** (titre de section `h2`) : pour chaque Document, titre en lien vers `/documents/{id}` (seul lien), Catégorie · Auteur, badge de Statut existant ; plus récent en tête ; lien « Voir la Bibliothèque ».
- **États** : squelette de 5 lignes dans la liste, la bande d'actions restant affichée ; Base vide : « La Base commune est encore vide. » + « Ajouter un Document » ; erreur : alerte « Cette liste n'a pas pu être chargée. » + « Réessayer » dans la liste seulement (relit la liste sans recharger la page, état occupé `aria-disabled` pendant la relecture).
- **Pages prérendues** : la liste n'est jamais prérendue (lecture liée à la requête, dans la frontière Suspense). `check:secrets --static` contrôle aussi `.next/server/app` (`.html`, `.rsc`, `.body`) ; vérifier que la page `/` prérendue ne contient aucune donnée de Document.
- **375 px** : bande d'actions empilée, boutons pleine largeur, aucun défilement horizontal (titres longs compris).
- Focus : règle existante du titre (`PageTitle`) ; le focus initial sur le champ de Recherche arrive avec 4.1b.

**Décisions du 2026-11-10 :**
- **Q1 = A.** Le bouton « Poser une question » du Tableau de bord est ajouté à la story 5.2b dans `epics.md` (tâche et critère).
- **Q2 = A.** « Derniers Documents » en pleine largeur ; la story 5.6 passera à deux colonnes.
- **Q3 = A.** Badges mis à jour sans rechargement par le suivi groupé de la Bibliothèque (`useLibraryStatuses`, `/api/documents/statuses`), avec les mêmes protections (session vérifiée, UUID valides, 200 au plus, aucun `content_text`) et la même annonce limitée aux Documents de l'utilisateur.
- **Story gardée entière**, au-dessus du repère de taille.
- **`check:secrets --static` sur les pages prérendues** : aucun faux positif admis. S'il en signale, les présenter à l'utilisateur avant toute exclusion ; aucune exclusion sans sa décision.

**Never:** Champ de Recherche (4.1b), Conversations (5.6), bouton « Poser une question » (5.2b), Route Handler nouveau pour la liste, migration SQL, délai de test augmenté, story 3.4 ou 3.6, commit ou push sans validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ouverture | 7 Documents de A et B, Statuts variés | 5 plus récents, badge, lien chacun, « Voir la Bibliothèque » | — |
| Ajout d'un collègue | B ajoute un Document | en tête au prochain affichage | — |
| Base vide | aucun Document | « La Base commune est encore vide. » + « Ajouter un Document » | — |
| Chargement lent | lecture retardée | squelette de 5 lignes, « Ajouter un Document » déjà utilisable | — |
| Erreur | lecture en échec | alerte + « Réessayer » dans la liste, bande d'actions intacte | « Réessayer » relit la liste |
| Titre long | mot sans espace, URL longue, 375 px | aucun défilement horizontal | — |

</frozen-after-approval>

## Code Map

- `src/app/(app)/page.tsx` -- aujourd'hui `PageTitle` seul. Il n'y a pas de `loading.tsx` à la racine du groupe : la frontière Suspense est posée autour de la liste seulement, pour que la bande d'actions reste dans la partie statique.
- `src/server/documents/list-documents.ts` -- `listDocuments(filters, userId, db)` : ajouter une limite de lignes optionnelle (défaut `MAX_LIBRARY_ROWS`), sans autre changement de comportement. Le total exact n'est pas affiché ici.
- `src/app/(app)/bibliotheque/page.tsx` -- modèle : `connection()`, `createClient()`, `getCurrentUser()`, erreur rattrapée.
- `src/components/library/library-view.tsx`, `library-table.tsx`, `use-library-statuses.ts` -- `EmptyState`, `StatusBadge`, liens par CSS et suivi groupé à réutiliser, en extrayant un composant partagé si nécessaire, sans changer le comportement de la Bibliothèque.
- `src/components/forms/error-alert.tsx`, `src/components/ui/button.tsx` -- alerte (`role="alert"`) et boutons (`asChild` + `Link`).
- `src/lib/texts.ts` -- `library.emptyBase`, `library.loadFailed`, `library.retry`, `library.addDocument` existent ; ajouter `dashboard.recentDocuments` (« Derniers Documents ») et `dashboard.seeLibrary` (« Voir la Bibliothèque »).
- `scripts/check-secrets.ts:210-231` -- mode `--static` limité à `.next/static` : ajouter `.next/server/app` (`.html`, `.rsc`, `.body`) ; `tests/unit/check-secrets.test.ts:226-260` -- modèles de tests.
- `tests/e2e/library.spec.ts` -- modèle d'insertion de Documents (`admin()`), interception de route et contrôle à 375 px ; `tests/e2e/shell.spec.ts` -- tests existants du Tableau de bord à garder verts.
- `AGENTS.md` : lire `node_modules/next/dist/docs/` (Suspense, `connection()`, `cacheComponents`, `router.refresh`). Ne lire aucun fichier `.env*`.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/documents/list-documents.ts` -- limite optionnelle -- 5 lignes pour le Tableau de bord.
- [x] `src/components/dashboard/*` -- bande d'actions, liste, squelette, erreur avec « Réessayer » -- E3.
- [x] `src/app/(app)/page.tsx`, `src/lib/texts.ts` -- page et textes.
- [x] `scripts/check-secrets.ts`, `tests/unit/check-secrets.test.ts` -- contrôle de `.next/server/app` -- pages prérendues.
- [x] `tests/unit/` -- limite, liste (vide, erreur, Réessayer occupé), squelette.
- [x] `tests/e2e/dashboard.spec.ts` -- ouverture, ajout d'un collègue en tête, lien, « Voir la Bibliothèque », bande d'actions hors de la frontière de la liste, 375 px, axe.
- [x] `_bmad-output/planning-artifacts/epics.md` -- emplacement de « Poser une question » du Tableau de bord dans 5.2b (Q1).

**Acceptance Criteria:**
- Given le Tableau de bord, when il s'ouvre, then « Ajouter un Document » et les 5 derniers Documents (badge, lien) s'affichent, avec « Voir la Bibliothèque », sans bouton « Poser une question ».
- Given un élément de la liste, when je l'active, then la page du Document s'ouvre.
- Given `build:ci`, when il se termine, then `check:secrets --static` a contrôlé `.next/server/app` et la page `/` prérendue ne contient aucune donnée de Document.
- Given les réponses réseau du Tableau de bord, when je les inspecte, then aucune ne contient le texte d'un Document.

## Design Notes

L'erreur reste confinée : le composant serveur de la liste rattrape l'échec de lecture et rend une alerte client dont « Réessayer » appelle `router.refresh()` dans une transition ; seule la frontière Suspense de la liste est relue, la bande d'actions n'est jamais démontée. La lecture se fait côté serveur : une erreur ne peut pas être provoquée en e2e par une interception réseau, et aucun interrupteur de test n'est ajouté au code de production. L'erreur et « Réessayer » sont donc prouvés par des tests unitaires (composant serveur de la liste avec une lecture simulée en échec, puis composant d'alerte), et l'e2e vérifie seulement que la bande d'actions est rendue indépendamment de la liste.

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run test:e2e` -- expected : tout vert, aucun secret, `.next/server/app` contrôlé.

**Manual checks:**
- Production : voir le rapport de fin de story.

## Implementation Notes

- `listDocuments(filters, userId, db, limit = MAX_LIBRARY_ROWS)` : limite ramenée dans [1, 200] ; rien d'autre ne change.
- `src/components/dashboard/` : `action-band.tsx` (emplacements 4.1b et 5.2b en commentaires), `recent-documents.tsx` (composant serveur, `connection()`, erreur rattrapée), `recent-documents-list.tsx` (client, suivi groupé `useLibraryStatuses`), `recent-documents-error.tsx` (« Réessayer » = `router.refresh()` en transition, `aria-disabled` pendant la relecture, focus rendu au `h2` après succès), `recent-documents-skeleton.tsx` (5 lignes + message des 10 s), `constants.ts`.
- Calcul des Statuts suivis extrait dans `src/components/library/status-updates.ts`, utilisé par la Bibliothèque (comportement inchangé, tests verts) et le Tableau de bord.
- `check:secrets --static` contrôle `.next/static` puis `.next/server/app` (`.html`, `.rsc`, `.body`, y compris `*.segments/`) ; l'absence de l'un des deux dossiers fait échouer le contrôle. Build du 2026-11-10 : 45 fichiers contrôlés dans `.next/server/app`, aucun signalement (aucun faux positif, aucune exclusion ajoutée).
- Page `/` prérendue : `index.html` ne contient pas le contenu de la page (coquille `SessionGate` sous Suspense) ; `index.segments/*.rsc` contient la bande d'actions et le squelette, aucun `data-document-id`, `/documents/` ni `content_text`.
- e2e : les Documents du Tableau de bord sont datés en 2999+ pour rester en tête de la Base partagée, supprimés après chaque test ; les tests ne tournent que dans le projet « ordinateur », en série (375 px par `setViewportSize`). `shell.spec.ts` : le « + » mobile est cherché dans `header` (la page a désormais deux liens « Ajouter un Document »).

## Spec Change Log

## Review Triage Log

Revue ciblée du 2026-11-10 (accès, affichage, accessibilité), menée directement, sans les trois relecteurs, à la demande de l'utilisateur. Aucun correctif nécessaire.

| # | Axe | Constat | Verdict | Preuve | Suite |
|---|---|---|---|---|---|
| R1 | Accès | Liste lue par `listDocuments` avec le jeton du Collaborateur, colonnes `LIBRARY_COLUMNS`, 5 lignes ; suivi des badges par la route groupée existante (session vérifiée, UUID valides, 200 au plus, `id` et Statut seulement) | false | `recent-documents.tsx`, `list-documents.ts`, `use-library-statuses.ts` ; tests `dashboard`, `library-routes` ; e2e « ouverture » : aucune réponse ne contient le texte témoin | aucune |
| R2 | Accès | Pages prérendues : aucune donnée de Document ; `check:secrets --static` contrôle `.next/server/app` (`.html`, `.rsc`, `.body`) | false | `build:ci` : 45 fichiers contrôlés, aucun signalement, donc aucun faux positif ni exclusion ; aucun lien `/documents/{uuid}` ni `data-document-id` dans `.next/server/app` | aucune |
| R3 | Affichage | Bande d'actions empilée et bouton pleine largeur à 375 px, titres longs coupés (`overflow-wrap: anywhere`), liste pleine largeur (Q2), aucun bouton « Poser une question » | false | `action-band.tsx`, `recent-documents-list.tsx` ; e2e « 375 px » et « ouverture » | aucune |
| R4 | Accessibilité | Section nommée par son `h2`, un seul lien par élément, alerte `role="alert"`, « Réessayer » en `aria-disabled` pendant la relecture puis focus sur le `h2`, squelette masqué aux lecteurs d'écran, annonce limitée aux Documents de l'utilisateur, axe sans violation | false | `page.tsx`, `recent-documents-error.tsx` ; tests `dashboard` ; e2e avec axe | aucune |
| R5 | Accessibilité | Base vide : deux liens « Ajouter un Document » (bande d'actions et état vide) | low | même nom, même destination : aucune ambiguïté (WCAG 2.4.4) ; texte imposé par le catalogue pour l'état vide | rejeté |
| R6 | Affichage | Le « Réessayer » du message des 10 s recharge toute la page, pas seulement la liste | low | composant existant de la story 3.2 (lien simple, sans JavaScript) ; la bande d'actions reste utilisable pendant l'attente | rejeté |
| R7 | Performances | `count: "exact"` calculé pour 5 lignes alors que le total n'est pas affiché | low | une agrégation sur une petite table ; l'éviter ajouterait un paramètre à `listDocuments` | rejeté |
| R8 | Tests | Les e2e datent leurs Documents en 2999 pour rester en tête de la base locale partagée ; supprimés après chaque test | low | `afterEach` ; une interruption brutale laisserait ces Documents en tête du Tableau de bord local seulement, jamais en production | rejeté, à connaître |

## Verification Results

**Résultats du 2026-11-10 (session principale, après l'agent) :** `npm run lint` et `npx tsc --noEmit` propres ; `npm test` : 47 fichiers, 778 tests réussis ; `npm run build:ci` vert : `.next/static` (31 fichiers) et `.next/server/app` (45 fichiers) contrôlés, aucun secret, aucun faux positif, aucune exclusion ; `◐ /` sans donnée de Document dans les pages prérendues ; `npm run test:e2e` complet : 262 réussis, 10 sautés (dont les 5 tests du Tableau de bord sur le projet mobile, joués sur ordinateur seulement, 375 px compris par redimensionnement), aucun échec, délais inchangés. Matrice : ouverture, ajout d'un collègue, titre long à 375 px et bande d'actions hors de la frontière (e2e) ; Base vide, chargement lent et erreur avec « Réessayer » (unitaires, la lecture étant côté serveur). Dans la suite complète de l'agent, 3 échecs hors de ses fichiers (`process_document` local en délai dépassé), absents de cette suite.

Production (2026-11-10, utilisateur, déploiement 4f45a0f) : bande d'actions réduite à « Ajouter un Document » (ni « Poser une question » ni champ de Recherche), 5 derniers Documents avec titre, Catégorie, Auteur et badge, liens vers les Documents et la Bibliothèque, 375 px vérifiés ; Document d'un collègue en tête, badge en direct, contenu réseau, Base vide, chargement lent et erreur couverts par les tests seulement.
