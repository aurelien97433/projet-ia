---
title: 'Story 5.1 : Stocker les Conversations de façon strictement privée'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: '6ff18873d3b54c8a3af30e4742bacb1bd9006857'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'Assistant n'a encore aucun stockage : ni Conversation, ni message, ni Source. Toute l'Epic 5 en dépend, et la confidentialité des Conversations (FR-22) doit être garantie par la base, même en appel direct à l'API.

**Approach:** Une migration crée `conversations`, `messages` et `message_sources`, avec RLS propriétaire seul, privilèges colonne par colonne, cohérence du propriétaire imposée par des clés étrangères composites, contraintes de taille et index. Tests d'intégration à deux Comptes, attaques directes comprises. Aucun écran ni Edge Function.

## Boundaries & Constraints

**Always:**
- **Tables** (`supabase/migrations/…_conversations.sql`) :
  - `conversations` : `id`, `owner_id` (défaut `auth.uid()`, → `profiles` `on delete cascade`), `title` (1 à 120 caractères, tiré de la première question par `chat`), `created_at`, `last_message_at`. `unique (id, owner_id)`.
  - `messages` : `id`, `conversation_id`, `owner_id` (défaut `auth.uid()`), `role` (`user`/`assistant`), `kind` (`question`/`answer`/`refusal_info_absente`/`refusal_hors_cadre`/`failure`), `content`, `standalone_question`, `error_code`, `client_request_id`, `created_at`. `unique (id, owner_id)`.
  - `message_sources` : `id`, `message_id`, `owner_id` (défaut `auth.uid()`), `ordinal` (≥ 1, unique par message), `document_id` (nullable, → `documents` **`on delete set null`**), `document_title` (1 à 200), `text_version` (≥ 1), `passages` (jsonb).
- **Cohérence du propriétaire (point 1)** : clés étrangères **composites** `messages (conversation_id, owner_id) → conversations (id, owner_id) on delete cascade` et `message_sources (message_id, owner_id) → messages (id, owner_id) on delete cascade`, **en plus** de `with check (owner_id = auth.uid())`. Une ligne ne peut donc référencer qu'une Conversation ou un message du même propriétaire, quel que soit le chemin d'écriture (jeton, `security definer`, `service_role`). Choisie plutôt qu'un `with check` avec sous-requête : invariant structurel, indépendant de la RLS et des fonctions futures. `owner_id` n'est jamais accordé en modification.
- **Cohérence interne (checks)** : `role = 'user'` ⇔ `kind = 'question'` ; question : `content` non vide, ≤ **2 000** caractères (NFR-8), `client_request_id` obligatoire ; réponse ou refus : `content` non vide, ≤ **20 000** caractères ; `failure` : `content` nul, `error_code` obligatoire (≤ 64 caractères, motif `^[A-Z_]+$`) ; `error_code` nul sinon ; `standalone_question` ≤ 2 000 et seulement sur une question ; `passages` : tableau JSON non vide de 20 éléments au plus.
- **Unicité (point 4)** : index unique partiel `(owner_id, client_request_id) where role = 'user'` : deux Comptes peuvent utiliser le même identifiant ; une réponse peut reprendre celui de sa question.
- **Privilèges** : `revoke all` pour `anon` et `authenticated`, puis `select` ; `insert` colonne par colonne (jamais `id`, `created_at`, ni `last_message_at` à l'insertion d'une Conversation, ni `owner_id` autrement que par défaut contrôlé) ; `update (last_message_at)` sur `conversations` ; `update (kind, content, error_code)` sur `messages`, politique limitée aux lignes `role = 'assistant' and kind = 'failure'` du propriétaire ; aucune modification de `message_sources` ; aucun `delete` (voir Q2). Politiques toutes `to authenticated`.
- **Index** : `conversations (owner_id, last_message_at desc)` ; `messages (conversation_id, created_at)` ; `message_sources (message_id, ordinal)` unique ; `message_sources (document_id)` (mise à null rapide à la suppression d'un Document).
- **Tests** (`tests/integration/conversations-rls.test.ts`, deux Comptes A et B, plus `anon`) :
  - A crée et lit ses lignes ; B ne lit, ne crée, ne modifie ni ne supprime rien de A, par le client et par appel REST direct avec son jeton ; `anon` ne lit rien.
  - **Attaque (point 1)** : B insère un message dans la Conversation de A avec `owner_id = B` → refusé (`23503`) ; idem une Source sur un message de A ; B ne peut pas non plus changer l'`owner_id` d'une ligne.
  - **Point 2** : B cite un Document de A ; A supprime ce Document → la Source de B a `document_id` nul, `document_title` conservé ; A ne lit pas cette Source (0 ligne), avant comme après.
  - Unicité : deuxième question de A avec le même `client_request_id` refusée (`23505`) ; même identifiant accepté pour une réponse de A et pour une question de B.
  - Checks : question de 2 001 caractères, réponse de 20 001, `failure` avec texte, `passages` vide ou de 21 éléments, incohérence rôle/type → refusés.
  - Modifications : `last_message_at` accepté ; `title` refusé ; message `failure` remplacé par une réponse accepté ; message `answer` ou question non modifiable.
  - Privilèges réels (`has_table_privilege`, `has_column_privilege`), RLS activée, politiques `to authenticated`.
- `tests/integration/anon-access.test.ts` mis à jour pour les nouvelles tables.

**Décisions de l'utilisateur (2026-11-13) :**
- **Q1 = A.** `passages` ne contient que `passage_id`, `start`, `end` : aucun extrait de texte copié.
- **Q2 = A.** Aucune suppression de Conversation maintenant ; les cascades sont posées pour la story P1 (FR-21).
- **Story gardée entière**, revue à **trois relecteurs** (règle 11).
- **Modification d'un message `failure` (« Réessayer »), verrouillée** :
  - politique `update` : `using (owner_id = auth.uid() and role = 'assistant' and kind = 'failure')` ; `with check (owner_id = auth.uid() and role = 'assistant')` (le résultat reste un message de l'Assistant, contrôlé aussi par les checks de cohérence) ;
  - droits par colonne : `update (kind, content, error_code)` seulement ; `owner_id`, `conversation_id`, `role`, `client_request_id` ne sont jamais modifiables (refus `42501`) ;
  - tests : B ne modifie pas un `failure` de A (0 ligne) ; A ne transforme pas un message `user` en `failure` (0 ligne) ; A ne déplace pas un message vers une autre de ses Conversations ni ne change son `role`, `owner_id` ou `client_request_id` (`42501`) ; A remplace bien son `failure` par une réponse ; une réponse déjà enregistrée n'est plus modifiable.
- **`conversations`** : `update (last_message_at)` seulement ; `title`, `owner_id`, `created_at` refusés (`42501`), B ne modifie pas la Conversation de A (0 ligne).
- **Ordre de fin** : commit local, `npm run deploy:supabase` par l'utilisateur, puis push. Rien de déployé, commité ni poussé sans accord.

**Never:** Edge Function `chat`, écran, quota (`ai_usage`, 5.10) ; suppression d'une Conversation (Q2 = A) ; texte d'un Passage copié dans une Source (Q1 = A) ; `service_role` côté Next.js ; commit, `deploy:supabase` ou push sans accord.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nominal | A : Conversation, question, réponse, 2 Sources | lignes créées et lues par A | — |
| Lecture croisée | B lit les tables | 0 ligne de A | — |
| Rattachement croisé | B : message sur Conversation de A, `owner_id = B` | refusé | `23503` |
| Usurpation | B : `owner_id = A` | refusé | `42501` (RLS) |
| Document supprimé | Source de B citant un Document de A | `document_id` nul, titre gardé | — |
| Rejeu de question | même `client_request_id`, même Compte | refusé | `23505` |
| Taille | question > 2 000, réponse > 20 000 | refusé | `23514` |
| Visiteur | `anon` | rien | `42501` ou 0 ligne |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261105105410_documents.sql:56-92` -- modèle : `revoke all`, privilèges colonne par colonne, politiques `to authenticated`, `(select auth.uid())`.
- `supabase/migrations/20261104094731_profiles.sql:19` -- `profiles.id` (cible de `owner_id`, `on delete cascade`).
- `supabase/migrations/20261113090000_delete_document.sql` -- suppression d'un Document par son Auteur : déclenche le `set null`.
- `tests/integration/documents-rls.test.ts`, `tests/integration/delete-document.test.ts` -- modèles à deux Comptes, appels REST directs avec jeton, contrôle des privilèges par `localSqlRows`.
- `tests/integration/anon-access.test.ts:15` -- liste des tables de `public`, à compléter.
- `src/lib/errors.ts:4` -- codes d'erreur (AD-19) : forme reprise par le motif de `error_code`.
- `_bmad-output/implementation-artifacts/deferred-work.md` (entrée de 3.4 sur l'Epic 5) -- points (1) et (3) traités ici par Q1 et le test du point 2 ; la course à l'insertion d'une Source (`23503` si le Document disparaît entre la Recherche et l'enregistrement) reste pour 5.2a.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261113120000_conversations.sql` -- tables, contraintes, clés composites, index, privilèges, politiques.
- [x] `tests/integration/conversations-rls.test.ts` -- cas ci-dessus.
- [x] `tests/integration/anon-access.test.ts` -- nouvelles tables.
- [x] `deferred-work.md` -- entrée de 3.4 mise à jour (ce qui est traité ici, ce qui reste pour 5.2a).

**Acceptance Criteria:**
- Given `supabase db reset` local, when les tests d'intégration tournent, then toutes les migrations passent et tous les tests sont verts.
- Given la migration, when `npm run deploy:supabase` est lancé par l'utilisateur, then les trois tables existent sur le projet distant, sans changement pour l'application en ligne.

## Implementation Notes

- **Implémentation directe**, à partir de la spec. Migration `20261113120000_conversations.sql` : types `message_role` et `message_kind`, trois tables, clés étrangères composites `(conversation_id, owner_id)` et `(message_id, owner_id)` en cascade, `document_id` en `on delete set null`, contraintes de cohérence et de taille, index (dont l'index unique partiel de la question), privilèges colonne par colonne, huit politiques `to authenticated`, aucune politique ni privilège `delete` (Q2 = A).
- **Codes observés** : rattachement à la Conversation ou au message d'un autre Compte → `23503` (clé composite) ; colonne non accordée (`owner_id`, `title`, `conversation_id`, `role`, `client_request_id`, suppression) → `42501` ; ligne hors politique (échec de A modifié par B, question transformée en échec) → 0 ligne, sans erreur.
- **Tests** : `tests/integration/conversations-rls.test.ts` (37 cas, deux Comptes, `anon`, appels REST directs), `anon-access.test.ts` (nouvelles tables nommées).
- **En chemin** :
  - Retour de la branche d'essai sur `main` : Git a réécrit `supabase/config.toml` en CRLF (`core.autocrlf`) et un test de frontières de 2.3 ne normalisait pas les fins de ligne ; aligné sur le test voisin.
  - Les types générés par les builds de la branche d'essai (`.next`, `.next-e2e`) cassaient `tsc` ; `.next-e2e` (ignoré par Git, régénéré par `test:e2e`) supprimé, `.next` régénéré par `build:ci`.
  - Requête SQL multiligne passée à la CLI : réduite à une ligne.
- **Après la revue** : tailles brutes et non-vide sur tous les blancs, fonction `is_valid_source_passages` (Q1 imposée par la base), Source réservée aux réponses (`message_kind`), `created_at` des messages par `clock_timestamp()`, `last_message_at >= created_at`, au plus 20 Sources par réponse ; tests complétés.
- **Résultats** : `supabase db reset` puis tests ; `npm test` 1 331 réussis (74 fichiers, dont 71 cas pour `conversations-rls` et `anon-access`) ; `lint`, `tsc`, `build:ci` et `check:secrets` verts.

## Spec Change Log

## Review Triage Log

Revue à trois relecteurs (règle 11) : Blind Hunter, Edge Case Hunter, Verification Gap, sur le diff complet. Constats dédoublonnés par cause.

| Constat | Verdict | Suite |
| --- | --- | --- |
| Tailles mesurées après `btrim` : une question de 2 000 caractères entourée de milliers d'espaces (idem réponse, titres, question reformulée) passe ; un texte fait de retours à la ligne ou de tabulations est accepté comme non vide. | medium | patch : longueur brute bornée, non-vide = au moins un caractère hors `[[:space:]]` ; tests. |
| Décision Q1 non imposée : `passages` accepte n'importe quel objet, extrait de texte compris. | medium | patch : fonction `is_valid_source_passages` (exactement `passage_id` UUID, `start`, `end` entiers, 0 ≤ start < end ; EXECUTE pour `authenticated` et `service_role`) ; 8 cas refusés testés. |
| Une Source peut se rattacher à une question, un refus ou un échec. | low | patch : colonne `message_kind` fixée à `answer`, clé composite `(message_id, owner_id, message_kind)` vers `messages (id, owner_id, kind)` ; tests. |
| `created_at default now()` : question et réponse écrites dans une même transaction (5.2a) auraient la même heure. | low | patch : `clock_timestamp()` ; test du défaut. |
| `last_message_at` libre, y compris avant la création. | low | patch : `check (last_message_at >= created_at)` ; test. |
| Nombre de Sources par réponse non borné. | low | patch : `ordinal between 1 and 20` ; test 20/21. |
| Note de `deferred-work.md` pour 5.2a : « vérifier puis insérer » ne protège pas d'une suppression concurrente (READ COMMITTED). | medium | patch : la note prescrit d'intercepter `23503` et de réinsérer avec `null`. |
| Tests manquants : « Réessayer » échec → échec et échec → refus ; suppressions de B ; lectures REST des trois tables ; attaque REST sans code exact ; ordinal en double ; question reformulée acceptée ; bornes (code d'erreur > 64, titre de Document, `text_version` 0, titre blanc) ; `afterAll` sans garde. | low | patch : tests ajoutés (71 cas avec `anon-access`). |
| Matrice I/O : refus d'usurpation attribué à la RLS (c'est le droit de colonne, `42501`) ; « Visiteur : `42501` ou 0 ligne » alors que le test exige `42501`. | false | comportement testé exact ; correction = modifier la partie figée de la spec, rejetée. |
| Statut de la spec et du sprint divergents, notes vides. | false | notes remplies pendant la revue ; `sprint-status.yaml` suit le workflow (passe à `review` à la présentation). |
| Normalisation CRLF dans `process-secret-boundaries.test.ts` hors périmètre, non consignée ; autres assertions sur `config.toml` peut-être fragiles. | false | consignée dans les Implementation Notes ; les autres assertions du fichier normalisent déjà (`replace(/\r\n/g, "\n")`) ; suite verte après extraction CRLF. |
| Pas d'index sur `owner_id` seul (messages, Sources). | low | rejeté : utile seulement à la suppression d'un Compte, qui n'est pas une fonction de l'application ; les lectures passent par `conversation_id` et `message_id`. |
| `document_id` : une Source peut référencer un Document que son auteur ne lirait pas ; titre et version copiés non vérifiés. | low | différé (5.2a) : tous les Collaborateurs lisent tous les Documents (FR-3) ; `chat` doit tirer titre et version du Document (`deferred-work.md`). |

## Verification

**Commands:**
- `npx supabase db reset` puis `npx vitest run tests/integration` (PowerShell) -- expected : vert.
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected : vert.

## Verification Results

- **Commits (2026-11-13)** : `35b3e47` (normalisation des fins de ligne de `config.toml` dans le test de frontières, commit séparé à la demande de l'utilisateur) puis `86632ff` (story 5.1), poussés sur `main`.
- **Déploiement** : `npm run deploy:supabase` par l'utilisateur ; migration `20261113120000_conversations.sql` appliquée sur le projet distant, `process-document` et `semantic-search` inchangées.
- **Contrôle en lecture seule sur le projet distant (IA)** :
  - `conversations`, `messages`, `message_sources` : RLS activée ; 3, 3 et 2 politiques, toutes `to authenticated` ; aucun droit pour `anon` ; aucun droit de suppression ;
  - clés étrangères : `messages_conversation_owner_fk` et `message_sources_message_owner_fk` (composites, cascade), `message_sources_document_id_fkey` (`set null`), `owner_id` → `profiles` (cascade) ;
  - `messages.created_at` par `clock_timestamp()` ; `is_valid_source_passages` non exécutable par `anon` ; migration `20261113120000` enregistrée ;
  - 0 ligne dans chacune des trois tables.
- Aucun écran ni aucune Edge Function ne change : rien à vérifier côté Vercel.
