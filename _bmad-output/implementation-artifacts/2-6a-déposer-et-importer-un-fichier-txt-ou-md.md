---
title: 'Story 2.6a : Déposer et importer un fichier .txt ou .md'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '00448ac3db2c94c263abf887fbc50abfbc697b1c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un Collaborateur ne peut ajouter qu'une Note recopiée : aucun fichier .txt ou .md ne peut être déposé ni importé (FR-5, FR-7).

**Approach:** Onglet « Fichier » de `/ajouter` : contrôle du format et de la taille dans le navigateur, dépôt direct dans le bucket privé `documents` par une URL signée (`POST /api/uploads`), puis « Importer » (Server Action) qui fait vérifier l'objet par la base avec le jeton du Collaborateur, crée le Document `file` et lance le traitement ; `process-document` lit le fichier en UTF-8.

## Boundaries & Constraints

**Always:**
- **Bucket** `documents` créé par migration : `public = false`, `file_size_limit = 1000000`, `allowed_mime_types` nul. Politiques `storage.objects` `to authenticated` seulement : **insertion** et **lecture** si `bucket_id = 'documents'` et `name` de la forme `{auth.uid()}/uploads/{upload_id}` (exactement 3 segments) ; aucune politique de mise à jour ni de suppression ; rien pour `anon`.
- **`upload_id`** = `{uuid}.{txt|md}` (motif strict, minuscules) : l'extension, validée au moment de la demande d'URL, fait partie du nom de l'objet ; le chemin reste `{author_id}/uploads/{upload_id}`.
- **`POST /api/uploads`** : `requireUser()` (401), `Cache-Control: no-store`, corps `{ fileName, size }` validé (extension `.txt` ou `.md`, insensible à la casse ; taille entière de 0 à 1 000 000 octets : un fichier vide est importable, la 2.6b le passe en `no_text`), sinon 400 avec le message du catalogue ; `upload_id` créé par le serveur ; URL signée créée avec le client du Collaborateur (sans `upsert`) ; réponse `{ uploadId, signedUrl }` ; panne → `INTERNAL` retryable, sans détail.
- **Navigateur** : extension et taille (1 000 000 octets) contrôlées dès le choix, avant tout appel, avec « Ce format n'est pas pris en charge. Formats acceptés : .txt et .md. » ou « Ce fichier dépasse 1 Mo, la taille maximale. » dans la zone de dépôt ; dépôt par `PUT` sur l'URL signée avec progression « Dépôt du fichier… » ; « Importer » `aria-disabled` pendant le dépôt ; échec (demande d'URL ou dépôt) : « Le fichier n'a pas pu être déposé. » + « Réessayer » (nouvelle demande, nouveau dépôt) ; titre, Catégorie et fichier choisi conservés dans tous les cas.
- **Titre** prérempli avec le nom du fichier sans sa dernière extension, tronqué à 200 caractères, modifiable ; un titre déjà modifié par le Collaborateur n'est pas remplacé au changement de fichier.
- **Import** : Server Action `importFileAction` → `requireUser()` → validation (titre, Catégorie, `uploadId`, `clientRequestId` UUID) → fonction SQL `import_file_document(p_title, p_category, p_upload_id, p_client_request_id)`, `security definer`, `search_path` vide, appelée avec le jeton du Collaborateur : objet `storage.objects` du bucket `documents`, nom exact `auth.uid()/uploads/p_upload_id`, propriétaire `auth.uid()`, taille (`metadata.size`) de 0 à 1 000 000 ; MIME déduit de l'extension (`.txt` → `text/plain`, `.md` → `text/markdown`) ; insertion `kind = 'file'`, `storage_path`, `mime_type`, `size_bytes`, `status = processing` (le délai de 3 min démarre à cette insertion). Idempotente : même `(auteur, client_request_id)` ou même `storage_path` → Document existant, sans nouvelle tentative. Refus (objet absent, autre dossier, `upload_id` d'un autre Auteur, taille) → message du catalogue, aucun Document. `REVOKE` de `public`, `anon` ; `GRANT EXECUTE` à `authenticated`. Puis `triggerProcessing` et redirection, comme une Note.
- **`process-document`** : pour un Document `file` sans `content_text`, télécharge l'objet (`service_role`) et le décode en UTF-8 (BOM retiré, sans repli) ; le reste du traitement est inchangé. Échec du téléchargement → erreur temporaire relançable.
- **Tests** : unitaires (motif `upload_id`, extension → MIME, titre prérempli, validations, route, action) ; intégration à deux Comptes sur Supabase local (dépôt et lecture dans le dossier d'un autre refusés, `anon` refusé, bucket privé et limite, objet > 1 000 000 refusé, import d'un `upload_id` d'un autre Auteur refusé, idempotence, `.txt` UTF-8 simple → *prêt*) ; e2e (onglet Fichier au clavier, refus `.docx` et 1 200 000 octets avant envoi, dépôt, échec et « Réessayer », import → page Document, 375 px).

**Décisions du 2026-11-12 :**
- Story gardée entière.
- `import_file_document` : `search_path` fixé (vide), `REVOKE ALL` de `public` et `anon`, `GRANT EXECUTE` à `authenticated` seul.
- Elle vérifie `auth.uid()` (non nul), le **propriétaire réel** de l'objet (`owner_id` = `auth.uid()`), le **chemin exact** `{auth.uid()}/uploads/{upload_id}`, et un `upload_id` **strictement** au format `{uuid}.txt` ou `{uuid}.md` (motif ancré, minuscules), sans `..`, barre oblique ni caractère inattendu ; la même règle s'applique dans Next.js avant l'appel.
- Tests : appels directs de la fonction avec un chemin forgé (`..`, `/`, autre dossier, motif invalide) et avec l'objet d'un autre Collaborateur, tous refusés sans Document créé.
- `deferred-work.md` : nettoyage des fichiers déposés mais jamais importés. Story 3.4 : vérifier qu'elle supprime l'objet d'un Document importé (précision ajoutée si besoin).

**Never:** décodage strict, repli Windows-1252, contrôle des caractères ou messages d'encodage (2.6b) ; PDF ; nettoyage des fichiers jamais importés (AD-7, différé) ; suppression du fichier (3.4) ; fichier transitant par Next.js ; MIME déclaré par le navigateur ; `service_role` hors de `process-document` ; story 2.6b ; commit, push ou `deploy:supabase` sans validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dépôt valide | `procedure-conges.md` ≤ 1 Mo | titre « procedure-conges », dépôt puis « Importer » actif | — |
| Import | dépôt terminé, titre, Catégorie | Document `file`, `text/markdown`, traitement lancé, page Document ; `.txt` UTF-8 → *prêt* | — |
| Format | `.docx`, sans extension, `.TXT.exe` | refus avant envoi, message format | champs conservés |
| Taille | 1 200 000 octets ; 0 octet | refus avant envoi (taille) ; fichier vide accepté (traité en 2.6b) | champs conservés |
| Dépôt échoué | URL refusée, réseau, 4xx/5xx du Storage | « Le fichier n'a pas pu être déposé. » + « Réessayer » | champs conservés |
| Autre dossier | dépôt ou lecture dans `{autre}/uploads/…` | refusé par le Storage | — |
| `upload_id` d'un autre | « Importer » avec l'`upload_id` de B | refusé, aucun Document | message du catalogue |
| Rejeu | même `client_request_id`, ou même `upload_id` réimporté | même Document, pas de 2ᵉ traitement | — |
| Sans session | `POST /api/uploads`, action | 401 / `UNAUTHENTICATED` | — |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261105105410_documents.sql` -- colonnes `kind`, `storage_path`, `mime_type`, `size_bytes` déjà là ; politique d'insertion limitée à `kind = 'note'` et privilèges par colonne (ne pas élargir : passer par la fonction `security definer`).
- `supabase/migrations/20261109090000_retry_processing.sql` -- modèle de fonction `security definer` (`search_path` vide, `auth.uid()`, `REVOKE`/`GRANT`).
- `storage.objects` (local) : `bucket_id`, `name`, `owner_id` (text), `metadata.size` ; fonctions `storage.foldername`. Aucun bucket ni politique aujourd'hui.
- `src/app/(app)/ajouter/page.tsx` -- onglets (Radix) ; `note-form.tsx` -- modèle : verrou de double clic, `clientRequestId` réutilisé, alerte de 10 s, `AlertDialog` d'abandon ; `actions.ts` -- modèle de Server Action (`requireUser`, `triggerProcessing`, `redirect`).
- `src/server/documents/create-note.ts` -- modèle de rejeu et de journaux ; `src/lib/schemas/documents.ts`, `src/lib/documents.ts` (`MAX_TEXT_BYTES`, `MAX_TITLE_LENGTH`, Catégories) ; `src/lib/texts.ts` (`addDocument`).
- `src/app/api/documents/route.ts` -- modèle de Route Handler (`requireUser`, `NO_STORE`).
- `supabase/functions/_shared/processing.ts` (`readDocumentText`), `process-document/index.ts` -- lecture du texte ; `restRequest` (`service_role`).
- `@supabase/storage-js` 2.118 : `createSignedUploadUrl(path)` → `{ signedUrl, token }` ; dépôt navigateur = `PUT` sur `signedUrl` (en-tête `x-upsert: false`).
- `tests/support/local-supabase.ts`, `tests/integration/*.test.ts` -- Comptes locaux ; `tests/e2e/ajouter.spec.ts` -- modèle e2e.
- `AGENTS.md` : lire `node_modules/next/dist/docs/` (Route Handlers, Server Actions). Ne lire aucun `.env*`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<horodatage>_file_import.sql` -- bucket, politiques Storage, `import_file_document`, index unique partiel sur `storage_path`.
- [x] `src/lib/files.ts`, `src/lib/schemas/uploads.ts`, `src/lib/texts.ts` -- extensions, MIME, `upload_id`, titre prérempli, schémas, textes.
- [x] `src/app/api/uploads/route.ts`, `src/server/documents/create-upload.ts` -- URL signée.
- [x] `src/server/documents/import-file.ts`, `src/app/(app)/ajouter/actions.ts` -- import.
- [x] `src/app/(app)/ajouter/file-form.tsx`, `page.tsx` -- onglet Fichier, zone de dépôt, dépôt avec progression.
- [x] `supabase/functions/_shared/processing.ts`, `process-document/index.ts` -- lecture du fichier en UTF-8.
- [x] `tests/unit/*`, `tests/integration/storage-uploads.test.ts`, `tests/integration/import-file.test.ts`, `tests/e2e/ajouter-fichier.spec.ts` -- matrice.

**Acceptance Criteria:**
- Given le bucket créé, when je lis `storage.buckets`, then `documents` est privé, limité à 1 000 000 octets, sans restriction MIME, et aucune URL publique ne donne accès à un objet.
- Given `npm run build:ci` et `check:secrets`, when ils se terminent, then aucun secret n'apparaît et aucune clé `service_role` n'est lue par Next.js.

## Design Notes

Vérification dans la base plutôt qu'en deux temps : la fonction `import_file_document` est appelée avec le jeton du Collaborateur (AD-7 : « avec le jeton du Collaborateur ») et lit `storage.objects` dans la même transaction que l'insertion ; un appel direct de la fonction subit donc les mêmes contrôles qu'« Importer », sans fenêtre entre vérification et création.

## Spec Change Log

## Review Triage Log

Revue par trois relecteurs (règle 11) : « Blind Hunter », « Edge Case Hunter », « Verification Gap ». Verdicts vérifiés dans le code.

| Constat | Verdict | Suite |
| --- | --- | --- |
| Après un refus de la base puis « Réessayer » du dépôt réussi, l'ancien message d'échec restait affiché et « Fichier déposé » masqué. | medium | patch : erreur de fichier effacée au début de chaque dépôt ; test. |
| Fichier choisi ou déposé pendant un import en cours : identifiant de demande réinitialisé, résultat appliqué au nouveau fichier. | medium | patch : choix ignoré pendant l'import ; mise à jour fonctionnelle liée à l'`uploadId` envoyé ; test. |
| Changer d'onglet démontait le formulaire : titre, Catégorie et fichier perdus, dépôt interrompu. | medium | patch : onglets `forceMount` masqués ; e2e. |
| `POST /api/uploads` sans délai côté navigateur : dépôt « en cours » sans fin. | medium | patch : `AbortSignal.any` avec 60 s ; tests. |
| Progression dans la zone `role="status"` : annonces répétées. | low | patch : barre hors de la zone vivante. |
| Fichier lâché à côté de la zone : le navigateur l'ouvre, saisie perdue ; surbrillance qui clignote sur les enfants. | low | patch : `dragover`/`drop` bloqués au niveau de la fenêtre pour les fichiers ; `relatedTarget`. |
| Session expirée entre `requireUser` et la fonction : affichée comme échec réessayable. | low | patch : `UNAUTHENTICATED` ; test. |
| `unique_violation` sans ligne gagnante : `document_id` nul, redirection vers `/documents/null`. | low | patch : `raise` en SQL, contrôle `document_id` en TypeScript ; test. |
| Écouteur d'abandon jamais retiré après le `PUT`. | low | patch (correction directe). |
| Tests manquants : action en exception, délai de 10 s, « Annuler » avec seulement un fichier, glisser-déposer, réponse perdue à l'import (e2e), imports simultanés. | medium | patch : tests ajoutés (unitaires, e2e, intégration). |
| Simulacre de module pouvant fuir (`doMock` sans `finally`), trois scénarios dans un seul test. | low | patch : `withAction` avec `try/finally`, trois tests. |
| Commentaire d'en-tête de `page.tsx` sur une seule longue ligne. | low | patch. |
| Résultat `aborted` laissant l'état « en cours » alors que le contrôleur est courant. | false | `aborted` n'arrive que par un abandon volontaire, qui remplace d'abord le contrôleur (ou démonte le formulaire). |
| Objet absent au traitement (404) traité en erreur temporaire, relance sans fin. | low | rejeté : aucun rôle applicatif ne peut supprimer l'objet (pas de politique `delete`), et la fonction n'importe qu'un objet existant. |
| Refus `file_too_large` par la base proposant « Réessayer ». | low | rejeté : le bucket refuse déjà tout objet de plus de 1 000 000 octets ; cas inatteignable hors modification manuelle. |
| Corps JSON illisible sur `/api/uploads` annoncé comme format refusé. | low | rejeté : le navigateur envoie toujours un JSON valide. |
| Plusieurs fichiers déposés : seul le premier est pris. | low | rejeté : comportement usuel d'un champ à fichier unique. |
| Aucune limite au nombre d'URL de dépôt par Collaborateur. | low | différé (`deferred-work.md`). |
| Décodage UTF-8 non strict : caractères de remplacement pouvant faire dépasser 1 000 000 octets au texte canonique. | maybe-false | différé à 2.6b et 2.7 (décodage strict, test de charge). |
| Fichiers de test nommés autrement que dans la spec (un seul fichier d'intégration). | low | consigné dans les notes d'implémentation. |

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run test:e2e` -- expected : tout vert, aucun secret.

## Implementation Notes

- **Migration** `20261112100000_file_import.sql` : bucket `documents` (privé, 1 000 000 octets, sans restriction MIME) ; fonction `is_own_upload_path` (motif ancré `{auth.uid()}/uploads/{uuid}.(txt|md)`) utilisée par les deux politiques `storage.objects` (insertion, lecture) `to authenticated` ; index unique partiel `documents_storage_path_key` ; `import_file_document` (`security definer`, `search_path` vide, `REVOKE` de `public`, `anon`, `authenticated`, `service_role`, `GRANT EXECUTE` à `authenticated` seul). Appliquée en local par `supabase migration up`, puis la fonction remplacée en local après la revue (`create or replace`, garde `v_id is null`).
- **Sonde du Storage local** (avant les tests) : URL signée créée avec le jeton de A → politique d'insertion appliquée à la signature ; objet déposé par l'URL signée → `owner_id` = A ; refus de la signature et du dépôt direct dans le dossier de B ou avec `..` ; B ne liste ni ne lit l'objet de A ; `anon` et URL publique refusés ; objet de 1 000 001 octets refusé ; écrasement refusé.
- **`upload_id`** = `{uuid}.{txt|md}` choisi par le serveur (`newUploadId`) : l'extension validée à la demande d'URL fait partie du nom de l'objet ; le MIME est déduit de cette extension dans la base.
- **Navigateur** : `upload-file.ts` (demande d'URL avec délai de 60 s, puis `PUT` par `XMLHttpRequest` pour la progression, `x-upsert: false`, type déduit de l'extension) ; `file-form.tsx` (zone de dépôt clavier et glisser-déposer, progression hors de la zone vivante, « Réessayer » du dépôt, titre prérempli non écrasé s'il a été modifié, identifiant de demande renouvelé à chaque nouveau dépôt, fichier figé pendant un import) ; onglets toujours montés (`forceMount`, masqués quand inactifs) pour ne rien perdre en changeant d'onglet.
- **`process-document`** : seul `_shared/processing.ts` change (`readDocumentText` lit `kind` et `storage_path`, `downloadFile` avec `service_role`) et `_shared/rag/extract.ts` (`decodeFileText`, UTF-8 non strict, BOM retiré) ; `process-document/index.ts` est inchangé. Le déploiement de la fonction est tout de même nécessaire (module partagé).
- **Tests** : unitaires `files`, `file-import-server`, `upload-file`, `file-form`, `processing-file` ; intégration `tests/integration/file-import.test.ts` (Storage et import réunis en un fichier, 34 cas, dont appels directs forgés, propriétaire réel, taille, imports simultanés, `.txt` UTF-8 avec BOM → prêt) ; e2e `tests/e2e/ajouter-fichier.spec.ts`.
- **Hors périmètre, consigné** : nettoyage des fichiers jamais importés et suppression de l'objet par 3.4 (`deferred-work.md`, précision dans `epics.md`).
- **Preuve de la migration seule** (2026-11-12, demande de l'utilisateur) : `supabase db reset` local, puis contrôle de `import_file_document` (version finale, droits), du bucket et des politiques ; 34 tests de `tests/integration/file-import.test.ts` réussis.
