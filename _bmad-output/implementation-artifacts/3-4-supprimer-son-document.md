---
title: 'Story 3.4 : Supprimer son Document'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: '91388117bc27de4d0cb4397e524bebfe93ab08e1'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aucun Document ne peut être supprimé : ni privilège ni politique `delete` sur `documents` ou sur le bucket `documents`, aucun bouton, et le bandeau `no_text` n'offre aucune issue à l'Auteur. Les Documents de test de 2.6a et 2.6b doivent quitter la production par l'interface avant l'Epic 5 (16/11).

**Approach:** Migration (suppression par l'Auteur seul du Document, puis de son objet Storage s'il n'est plus référencé), Server Action « Document puis objet », bouton « Supprimer » avec `AlertDialog` dans la barre d'actions et dans le bandeau `no_text`, notification Sonner, état « supprimé pendant la consultation ».

## Boundaries & Constraints

**Always:**
- **Base** : `grant delete on documents to authenticated` ; politique `delete` `author_id = auth.uid()`. Passages en cascade (déjà en place). Rien pour `anon`.
- **Storage** : politique `delete` sur `storage.objects`, `authenticated` seulement, bucket `documents`, `is_own_upload_path(name)` **et** aucun Document ne référence `name` (fonction `security definer`, `search_path = ''`, EXECUTE pour `authenticated` seul). Impose l'ordre Document puis objet, et permet à l'Auteur de retirer ses propres orphelins.
- **Server Action** `deleteDocumentAction(documentId)` : `requireUser()`, UUID (zod), `delete … select storage_path` avec le jeton du Collaborateur. 0 ligne : Document encore lisible → `FORBIDDEN` (« Cette action n'est pas autorisée. ») ; absent → `NOT_FOUND`. Puis `storage.remove([storage_path])` si présent ; un échec du Storage est journalisé (code seulement), le Document reste supprimé, l'action réussit.
- **Interface** : « Supprimer » pour l'Auteur seul, quel que soit le Statut (traitement compris) ; `AlertDialog` (textes du catalogue : « Supprimer « {titre} » ? », conséquence, « Annuler » focalisé par défaut, « Supprimer » destructif) ; état occupé `aria-disabled` dès le premier clic. Succès : `toast("Document supprimé.")` puis `/bibliotheque`. Bandeau `no_text` : même bouton pour l'Auteur, raison seule pour les autres, jamais de relance.
- **Supprimé pendant la consultation** : un 404 (interrogation du Statut, « Actualiser », relance, suppression) fait passer le fournisseur en état `deleted` : bandeau « Ce Document a été supprimé. » + lien « Retour à la Bibliothèque », actions retirées, sans « Réessayer ». 401 : comportement actuel (`router.refresh()`). Un rechargement complet mène à E9.
- **`process-document`** : un Document supprimé pendant le traitement n'est jamais un échec bruyant. Quand l'écriture finale ou l'échec est refusé, ou que le travail lève (objet déjà supprimé), vérifier si le Document existe encore ; absent → `logInfo("process_document_document_deleted")` seulement, sans `logEvent`.
- **Sonner** : `npx shadcn add sonner` ; `<Toaster />` dans `AppShell`. Sans `next-themes` (absent du projet) : thème suivant le système.
- Textes dans `src/lib/texts.ts`, au vouvoiement, repris d'EXPERIENCE.md.

**Décisions de l'utilisateur (2026-11-13) :** Sonner par shadcn ; « Supprimer » disponible pendant le traitement, avec un test d'intégration (`complete_processing` renvoie false, aucun Passage orphelin, aucun journal d'échec) ; orphelins de 2.6b supprimés par l'utilisateur au tableau de bord, sans script ; en plus de la revue ciblée, **un relecteur séparé, sécurité seulement** (privilèges et politiques `delete`, sous-requête, dossier, objet non référencé, `anon`, B contre A par REST et Storage avec son propre jeton) ; ce que l'Epic 5 doit prévoir pour la Source d'un Document supprimé est noté, sans code ; `deploy:supabase` avant le push ; rien commité ni poussé sans accord.

**Never:** `service_role` dans Next.js ; suppression SQL directe de `storage.objects` ; nettoyage automatique des orphelins ; code de l'Epic 5 (`message_sources`) ; story 3.6 ; délai de test augmenté ; lecture d'un fichier `.env*`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Note de A | A confirme | Document et Passages supprimés, Bibliothèque + « Document supprimé. » | — |
| Fichier importé de A | A confirme | Document puis objet supprimés | objet en échec : journalisé, succès quand même |
| Annuler / Échap | dialogue ouvert | rien n'est supprimé, focus rendu au bouton | — |
| B sur le Document de A | page | aucun « Supprimer » | — |
| B appelle l'action / REST / Storage | jeton de B | Document et objet de A intacts | action : `FORBIDDEN` |
| Objet encore référencé | A, Storage direct | refusé, objet intact | — |
| Pendant le traitement | A supprime | `complete_processing` → false, 0 Passage, `logInfo` seulement | — |
| Supprimé ailleurs | page ouverte, 404 | « Ce Document a été supprimé. » + retour | — |
| `no_text` | Auteur / autre | raison + « Supprimer » / raison seule | — |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261112100000_file_import.sql` -- modèle : `is_own_upload_path`, politiques Storage, `revoke`/`grant execute`. Nouvelle migration `…_delete_document.sql`.
- `supabase/migrations/20261105105410_documents.sql:68-91` -- privilèges et politiques actuels de `documents` (aucun `delete`).
- `src/app/(app)/documents/[id]/actions.ts`, `src/server/documents/retry-processing.ts` -- modèle de Server Action et de module serveur (zod, `appError`, `logEvent`/`logInfo`, codes `42501`). Nouveau `src/server/documents/delete-document.ts`.
- `src/components/documents/document-status-provider.tsx` -- `fetchStatus` renvoie `"gone"` pour 401 et 404 : distinguer 404 → `deleted` ; exposer `deleted` et `markDeleted()` dans le contexte.
- `src/components/documents/status-banner.tsx` -- bandeau `no_text` (sans action aujourd'hui) ; relance : `NOT_FOUND` → `markDeleted()`.
- `src/components/documents/document-actions.tsx` -- `authorActions` vide, prévu pour 3.4 ; reçoit `isAuthor` ; ajouter `documentId` et `title`.
- `src/app/(app)/documents/[id]/page.tsx` -- passe `documentId`/`title` ; le Lecteur reste hors du fournisseur.
- `src/components/ui/alert-dialog.tsx` -- existant ; modèle d'usage : `src/app/(app)/ajouter/note-form.tsx`.
- `src/components/shell/app-shell.tsx` -- y monter `<Toaster />`.
- `supabase/functions/process-document/index.ts:33-107`, `_shared/processing.ts` -- `completeProcessing`/`failProcessing` renvoient false sans distinguer un Document supprimé ; ajouter `documentExists`.
- `tests/integration/documents-rls.test.ts:187` -- test « aucune suppression avant la story 3.4 » à remplacer ; `file-import.test.ts` -- aides `deposit`, `importAs`, comptes A/B ; `complete-processing.test.ts` -- appel RPC en `service_role`.
- `tests/e2e/document-status.spec.ts:153-190` -- 404 et `no_text` (à adapter : 404 → état supprimé ; `no_text` Auteur → bouton « Supprimer »).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261113090000_delete_document.sql` -- privilège, politique `documents`, fonction `is_unreferenced_upload`, politique Storage.
- [x] `src/server/documents/delete-document.ts`, `src/app/(app)/documents/[id]/actions.ts` -- suppression et action.
- [x] `src/lib/texts.ts` -- textes du dialogue, notification, état supprimé.
- [x] `src/components/ui/sonner.tsx`, `app-shell.tsx`, `package.json` -- Sonner.
- [x] `src/components/documents/delete-document-button.tsx` (nouveau), `document-actions.tsx`, `status-banner.tsx`, `document-status-provider.tsx`, `page.tsx` -- interface.
- [x] `supabase/functions/_shared/processing.ts`, `process-document/index.ts` -- Document supprimé = `logInfo`.
- [x] Tests : intégration (RLS `delete`, cascade, objet supprimé, B contre A par REST et Storage, objet référencé protégé, `anon`, Note, pendant le traitement), unitaires (`delete-document`, `process-document`, fournisseur, bouton), e2e (dialogue, Annuler, autre Collaborateur, `no_text`, supprimé pendant la consultation, 375 px).
- [x] `deferred-work.md` -- ce que l'Epic 5 doit prévoir pour une Source dont le Document est supprimé.

**Acceptance Criteria:**
- Given un Document importé de A supprimé, when on lit le bucket, then son objet n'existe plus.
- Given B, when il appelle `DELETE /rest/v1/documents?id=eq.{A}` ou `storage.remove` sur l'objet de A avec son jeton, then rien n'est supprimé.
- Given la suite complète, when elle tourne, then `npm test`, `test:e2e`, `lint`, `tsc`, `build:ci`, `check:secrets` sont verts.

## Implementation Notes

- **Implémentation directe** (sans agent d'implémentation), à partir de la spec et de l'exploration consignée dans la Code Map.
- **Migration** `20261113090000_delete_document.sql` : `grant delete` (table), politique « L'Auteur supprime ses Documents », fonction `is_unreferenced_upload` (`security definer`, `search_path = ''`, EXECUTE pour `authenticated` seul), politique Storage `delete` (bucket, dossier propre, objet non référencé). Appliquée en local (`migration up`, puis `db reset` complet). Rien pour `anon`.
- **Serveur** `src/server/documents/delete-document.ts` : `delete … select storage_path` avec le jeton du Collaborateur ; 0 ligne → relecture : présent = `FORBIDDEN`, absent = `NOT_FOUND` (message « Ce Document a été supprimé. ») ; objet retiré ensuite. L'API Storage renvoie une liste vide, sans erreur, quand la politique écarte l'objet : ce cas est journalisé (`not_removed`).
- **Interface** : `DeleteDocumentButton` (déclencheur Radix : le focus revient au bouton à la fermeture ; `AlertDialogTrigger` ajouté au composant shadcn). Dans une erreur `no_text`, « Supprimer » est dans le bandeau seulement, pas répété dans la barre d'actions. Document supprimé pendant la consultation : le texte du Lecteur reste affiché, les actions disparaissent. 404 de la relance : état supprimé (avant : E9 par rafraîchissement) ; test e2e existant adapté.
- **Sonner** : `npx shadcn add sonner` a ajouté `sonner` et `next-themes` ; `next-themes` retiré (projet en mode clair seulement, `theme="light"`).
- **`process-document`** : `documentExists` (réponse non tableau = erreur, donc refus toujours signalé en cas de doute) ; refus d'écriture ou travail en échec avec Document absent → `logInfo("process_document_document_deleted")`, sans `fail_processing`. Une lecture de l'objet après sa suppression, ou une Note lue après la suppression (`attempt_superseded`), restent en information.
- **Piège d'environnement** : depuis Git Bash, Vitest échoue (« failed to find the runner ») à cause de la casse de la lettre de lecteur (`C:` / `c:`) ; lancer Vitest depuis PowerShell.
- **Résultats** : `npm test` 1 265 réussis (73 fichiers), dont intégration 244 après `db reset` ; `lint`, `tsc`, `build:ci` (avec `check:secrets` statique) verts ; e2e de suppression et de Statut : 16 et 92 réussis (ordinateur et 375 px).

## Spec Change Log

## Review Triage Log

Couches standard (Blind Hunter, Edge Case Hunter, Verification Gap) non lancées : 3.4 n'est pas dans la règle 11, décision de l'utilisateur (revue ciblée de l'IA + un relecteur sécurité séparé). Relecteur sécurité : aucune vulnérabilité exploitable ; points 1 à 6 prouvés sains par appels directs (PostgREST, API Storage, jetons de A, B et anon ; chemins altérés : majuscules, `../`, `%00`, barre encodée, `prefixes`).

| Constat | Verdict | Suite |
| --- | --- | --- |
| Sécurité C1 : `is_unreferenced_upload` appelable en RPC sur n'importe quel chemin (oracle d'existence d'un Document référençant un chemin ; `null` → vrai) ; le commentaire affirmait le contraire. Sans fuite aujourd'hui (lecture des Documents ouverte), fuite future si la lecture est restreinte. | low | patch : la fonction vérifie elle-même `is_own_upload_path` (faux pour un autre Compte et pour `null`), commentaire corrigé, test d'intégration en appel direct. |
| Sécurité C2 : course entre `import_file_document` (lecture de l'objet sans verrou) et la suppression de l'objet par son propre Auteur : Document pointant vers un objet absent. | low | rejeté : non reproduit (0 sur 8), ne touche que les données de l'Auteur (traitement en échec, relançable par suppression), correctif = verrou dans une fonction livrée. |
| Sécurité C3 : objet conservé si `storage.remove` échoue après la suppression du Document. | low | rejeté : déjà différé (`deferred-work.md`, nettoyage des fichiers jamais importés par `service_role`), comportement voulu par la spec. |
| Revue IA : un Document *en cours* supprimé reste interrogé toutes les 3 s par le suivi groupé de la Bibliothèque / du Tableau de bord tant que la page reste ouverte (l'id absent n'est jamais retiré). | low | rejeté : cas rare (suppression par l'Auteur pendant qu'un autre regarde la liste), coût d'une requête légère, correctif = logique de retrait dans le suivi de 3.3. |
| Revue IA : après une suppression réussie d'un Document en cours, le suivi peut recevoir un 404 avant le changement d'écran et afficher brièvement « Ce Document a été supprimé. ». | false | sans effet utilisateur : la notification et la Bibliothèque suivent aussitôt ; message exact dans les deux cas. |
| Revue IA : couverture de la matrice I/O. | false | chaque ligne couverte par un test exécuté (unitaires, intégration, e2e ordinateur et 375 px). |

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run test:e2e`, `npm run check:secrets` -- expected : tout vert.
- `supabase db reset` local puis tests d'intégration -- expected : migration rejouée depuis zéro.

## Verification Results

- **Commit et déploiement (2026-11-13)** : `c8b7e40` commité en local ; `npm run deploy:supabase` par l'utilisateur (migration `20261113090000_delete_document.sql` appliquée sur le projet distant, `process-document` redéployée, `semantic-search` inchangée) ; puis push, Vercel *Ready*.
- **Vérification en production (par l'utilisateur)** : `procedure-test` et `windows-1252` supprimés par « Supprimer » de la page, `vide` et `binaire` par le bandeau *en erreur* ; à chaque fois, confirmation avec le focus sur « Annuler », notification « Document supprimé. », retour à la Bibliothèque. Bibliothèque : 9 Documents. Les 2 fichiers orphelins de 2.6b ont été supprimés par l'utilisateur au tableau de bord Supabase.
- **Contrôle en lecture seule (IA)** :
  - 9 Documents, tous *prêts* ; aucun Document de test restant ; aucun Passage orphelin ;
  - aucun Document avec fichier ; les fichiers des 4 Documents supprimés et les 2 orphelins ont disparu du bucket ;
  - seul objet restant : `a23cfad2…/uploads/.emptyFolderPlaceholder` (0 octet, 2026-11-13 05:44 UTC), marqueur créé par le tableau de bord Supabase quand un dossier est vidé, pas un fichier de l'application.
