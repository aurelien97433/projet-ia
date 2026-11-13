---
title: 'Story 2.7 : Test de charge de la limite de 1 Mo'
type: 'feature'
created: '2026-11-12'
status: 'in-review'
baseline_commit: '4ae6ef4ac147c302322c81701964fc0e6d384cf6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La limite de 1 Mo par fichier (FR-5) n'a jamais été éprouvée : un fichier proche de la limite (environ 1 250 Passages, un seul `complete_processing` d'environ 25 Mo de JSON) pourrait dépasser 3 min, la limite de 2 s de calcul des Edge Functions ou le budget de 500 Mo de la base du plan gratuit.

**Approach:** `npm run load:1mo` importe sur le projet distant, par le vrai chemin (dépôt par URL signée avec le Compte de mesure 1, `import_file_document`, déclenchement de `process-document` avec `PROCESS_DOCUMENT_SECRET`), un `.txt` puis un `.md` de texte français réaliste de 950 000 à 1 000 000 octets ; mesure, juge les trois conditions, écrit `docs/mesures/charge-1mo.md`, et nettoie dans tous les cas.

## Boundaries & Constraints

**Always:**
- **Cible** : même règle que `test:search:live` (`resolveLiveTarget`) : projet lié par la CLI, désigné à la fois par `.env.seed` et par la clé publique ; `--remote` obligatoire ; sans `--remote`, la pile locale seulement (vectorisation simulée, pour éprouver la mécanique). Toute autre cible : refus avant le moindre appel.
- **Fichiers** : générés en mémoire (`buildMeasureText`, découpés à une fin de paragraphe), `.txt` et `.md` (intertitres `#`), chacun entre 950 000 et 1 000 000 octets UTF-8 (contrôlé avant tout envoi), jamais écrits sur disque ni versionnés.
- **Déroulé par fichier** : taille de la base avant (`pg_database_size`, plus tailles de `documents`, `passages` et de leurs index, lues par `supabase db query --remote=<réf>`, requêtes constantes) ; dépôt et import avec la session du Compte de mesure 1 ; déclenchement ; attente du Statut final (échec explicite après 3 min 30 s) ; relevé : durée `updated_at - processing_started_at`, Statut, `error_kind`, `error_message`, nombre de Passages, taille du texte ; taille de la base après ; coût estimé (tokens ≈ caractères / 4, tarif de 0,02 $ par million, daté).
- **Conditions** (par fichier) : *prêt* en moins de 3 min ; moins de 50 Mo ajoutés ; base totale sous 400 Mo. Toutes réunies → limite confirmée.
- **`embed_ms`, `complete_ms`, `duration_ms`** : écrits par `process-document` dans ses journaux (`process_document_work_done`) ; le script affiche l'identifiant de chaque Document pour les retrouver ; l'utilisateur les relève dans le tableau de bord Supabase et ils sont ajoutés au rapport. Un échec (`process_document_work_failed`, dont `http_500`) est relevé de la même façon : c'est l'observation demandée.
- **Nettoyage garanti** : bloc `finally`, plus interruption (Ctrl+C, `SIGINT`/`SIGTERM`) : suppression des Documents de test (Passages en cascade) et de leurs objets du bucket, avec `service_role` ; taille de la base après nettoyage consignée. Mode `--cleanup` relançable qui supprime tout reste (Documents du Compte de mesure 1 intitulés exactement « Test de charge 1 Mo », objets correspondants) sans rien importer.
- **Rapport** `docs/mesures/charge-1mo.md` : date, cible, conditions, tableau par fichier (octets, caractères, Passages, durée, Statut, Mo ajoutés, base totale, coût), taille après nettoyage, cases à remplir pour les durées des journaux, évaluation de l'écriture par lots et de `http_500`, et, si une condition échoue, une **proposition chiffrée** (limite plus basse ou optimisation) **non appliquée**.
- **Secrets** : jamais affichés ni écrits dans le rapport (clés, mot de passe, e-mail, jeton, URL signée).
- **Refus de 1 000 001 octets** avant tout envoi : test e2e dédié (aucune requête), en plus du contrôle existant.
- **Tests** : unitaires (génération et bornes, conditions, rapport sans secret, sélection du nettoyage, refus de cible) ; exécution réelle sur la pile locale par l'IA ; exécution distante par l'utilisateur seulement.

**Décisions du 2026-11-12 :**
- Story gardée entière.
- **Titre exact** : chaque Document de test s'intitule exactement « Test de charge 1 Mo » (le `.txt` et le `.md` se distinguent par leur type). Le nettoyage ne supprime que les Documents dont l'Auteur est le Compte de mesure 1 **et** dont le titre est exactement ce texte, ainsi que leurs fichiers.
- **Avant toute suppression en production**, le script affiche le nombre de Documents concernés ; `--cleanup` refuse de continuer si ce nombre dépasse 2, sauf confirmation explicite (`--confirm`).
- Les requêtes passées à `supabase db query --remote` sont uniquement des **lectures fixes** (constantes du script, aucune valeur interpolée).
- La clé `service_role`, utilisée pour supprimer les Documents et les fichiers, vient seulement de `.env.seed` et n'est jamais affichée.

**Never:** changement de la limite, du découpage, de l'écriture des Passages ou de `process-document` (toute optimisation est une proposition) ; appel direct d'OpenAI ; plus de deux imports réels par exécution ; suppression de Documents qui ne sont pas des Documents de test de ce script (`procedure-test.md` et ceux de 2.6b restent) ; exécution distante par l'IA ; story 3.4 ; commit ou push sans validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Exécution distante | `npm run load:1mo -- --remote`, projet lié | 2 imports, rapport, nettoyage, conditions jugées | — |
| Exécution locale | sans `--remote` | même déroulé sur la pile locale (vecteurs simulés) | — |
| Cible invalide | autre projet, http, clé secrète | refus avant tout appel | message sans secret |
| Traitement en échec ou trop long | Statut *en erreur*, ou 3 min 30 s | condition échouée, consignée, proposition | nettoyage quand même |
| Interruption | Ctrl+C pendant l'attente | nettoyage, puis sortie | code de sortie non nul |
| Restes | `--cleanup` | nombre affiché ; Documents « Test de charge 1 Mo » du Compte de mesure 1 et leurs objets supprimés | plus de 2 : refus sans `--confirm` |
| 1 000 001 octets | choisi dans l'onglet Fichier | « Ce fichier dépasse 1 Mo, la taille maximale. », aucune requête | — |

</frozen-after-approval>

## Code Map

- `scripts/test-search-live.ts` -- `resolveLiveTarget`, `isPublicKey`, `openLiveSession` (Compte de mesure 1, cible exigée) : à réutiliser.
- `scripts/seed-demo.ts` -- `parseSeedEnv` (`.env.seed` : URL, `service_role`, `PROCESS_DOCUMENT_SECRET`, Comptes), `targetHost`, `waitForReady` ; modèle de déclenchement de `process-document`.
- `scripts/deploy-supabase.ts` -- `readLinkedProjectRef`, `runCli` (CLI avec `--remote=<réf>` et `--output-format json`) : modèle des requêtes SQL distantes.
- `scripts/generate-measure-note.ts` -- `buildMeasureText(targetLength)` (texte français réaliste).
- `supabase/functions/process-document/index.ts` -- journal `process_document_work_done` (`embed_ms`, `complete_ms`, `duration_ms`, `passages`) et `process_document_work_failed` (`code`).
- `src/lib/files.ts` -- `MAX_FILE_BYTES`, `checkFile` ; `tests/e2e/ajouter-fichier.spec.ts` -- refus avant envoi.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- écriture par lots (2.4) et `http_500` (3.2) : à clore ou reporter avec la mesure.
- `docs/mesures/traitement-60000.md` -- modèle de rapport ; `docs/environnements.md` -- commande à documenter.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/load-test-1mo.ts`, `package.json` -- `load:1mo` : cible, génération, mesures, conditions, rapport, nettoyage, `--cleanup`.
- [x] `tests/unit/load-test-1mo.test.ts` -- fonctions pures et refus de cible.
- [x] `tests/e2e/ajouter-fichier.spec.ts` -- refus de 1 000 001 octets avant tout envoi.
- [x] `docs/environnements.md`, `deferred-work.md` -- commande ; points différés mis à jour après la mesure.

**Acceptance Criteria:**
- Given une exécution locale complète, when elle se termine (réussie ou non), then aucun Document « Test de charge 1 Mo » ni objet correspondant ne reste, et le rapport ne contient aucun secret.

## Spec Change Log

## Review Triage Log

Revue ciblée faite dans la session, sans les trois relecteurs (demande de l'utilisateur) : sécurité du script et nettoyage.

| Constat | Verdict | Suite |
| --- | --- | --- |
| Avec `--remote`, si la CLI n'avait plus de projet lié, `supabase db query` sans `--remote` aurait lu la base **locale** sans le dire : tailles fausses dans le rapport de production. | high | patch : référence liée exigée et égale à la cible avant tout appel. |
| Suppression des Documents avant celle des fichiers : en cas d'échec du Storage, les chemins étaient perdus et `--cleanup` ne pouvait plus retrouver les fichiers. | medium | patch : fichiers d'abord, Documents ensuite. |
| Erreur à la génération des fichiers ou à la connexion locale après la création du Compte temporaire : Compte local laissé. | low | patch : fichiers générés avant toute connexion ; Compte supprimé si la connexion échoue. |
| Liste `createdIds` alimentée mais jamais lue. | low | patch : retirée. |
| Sélection du nettoyage : Auteur = Compte de mesure 1, titre exact, fichiers limités à `{id du Compte}/uploads/`. | false | vérifié : aucun autre Document ni fichier ne peut être visé ; `procedure-test.md` et les Documents de 2.6b ont d'autres titres. |
| Requête SQL de la CLI : constante, en lecture seule, référence de projet validée par motif. | false | vérifié ; test unitaire sur la requête. |
| Secrets : clé `service_role` et `PROCESS_DOCUMENT_SECRET` lus dans `.env.seed` (pile locale : `supabase status` et `supabase/functions/.env`), jamais affichés ; messages d'erreur limités à des codes ; URL signée jamais affichée. | false | vérifié ; test du rapport sans secret. |
| Interruption par Ctrl+C : gestionnaire `SIGINT`/`SIGTERM` ; arrêt brutal (fermeture du terminal, `taskkill /F`) non rattrapable. | low | consigné : `--cleanup` rattrape les restes ; non testable sur la pile locale (Compte temporaire propre à chaque exécution). |
| Test e2e de 1 000 000 octets : fichier déposé jamais importé, laissé dans la base locale (deux fichiers de la première exécution). | low | patch : le test supprime son dépôt ; les deux fichiers retirés de la pile locale. |
| Taille « ajoutée » : inclut toute autre activité de la base pendant le test. | low | consigné dans le rapport (mesure sur un projet de démonstration peu actif). |

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run test:e2e` -- expected : tout vert, aucun secret.
- `npm run load:1mo` (pile locale) -- expected : rapport local, nettoyage complet. `npm run load:1mo -- --remote` : lancé par l'utilisateur.

## Implementation Notes

- **Script** `scripts/load-test-1mo.ts` (`npm run load:1mo`) : fonctions pures exportées et testées (génération, conditions, coût, proposition, rapport, nettoyage, options, requête SQL) ; exécution par le vrai chemin (dépôt par URL signée, `import_file_document` avec la session du Compte, `process-document` avec le secret, attente de 3 min 30 s au plus).
- **Pile locale (deux exécutions par l'IA, vecteurs simulés)** : `.txt` 989 984 octets → *prêt*, 1 162 Passages, 1,8 à 2,4 s ; `.md` 989 208 octets → *prêt*, 1 157 Passages, 1,3 à 1,4 s ; 10,8 à 18,6 Mo ajoutés par fichier ; nettoyage complet (aucun Document, fichier ni Compte temporaire restant). Ces chiffres ne valent pas mesure : la vectorisation est simulée et la base locale n'est pas celle de production.
- **`embed_ms`, `complete_ms`, `duration_ms`** : journaux de `process-document` seulement ; le rapport réserve leurs cases, remplies d'après le relevé de l'utilisateur.
- **Écriture par lots et `http_500`** : à trancher avec la mesure distante (`complete_ms`, échecs éventuels), puis `deferred-work.md` mis à jour.
- **Échec de la première exécution distante (2026-11-12, utilisateur)** : `supabase db query --remote` sans `--read-only` exige une confirmation sur le projet de production (`HostedMutationConsentRequiredError`), impossible hors terminal interactif ; la CLI n'a rien exécuté. Correctifs : `--read-only` toujours passé (lecture seule, sans confirmation) ; cause réelle de la CLI affichée (code et message de son erreur JSON, sinon stderr, sinon code de sortie), secrets masqués (`cliFailure`, `redact`, testés avec la sortie réelle) ; cible affichée une seule fois ; nettoyage et mesure de la taille après nettoyage signalés séparément (le nettoyage avait réussi) ; rapport existant non écrasé quand rien n'a été mesuré. Requête vérifiée sur le projet distant en lecture seule : base de 12,9 Mo avant le test.
- **Deuxième échec distant (2026-11-12, utilisateur) : `SyntaxError`.** La forme JSON de `supabase db query` dépend du mode détecté par la CLI : tableau nu dans le terminal de l'utilisateur, enveloppe `{ boundary, rows, warning }` en mode agent (variables `AI_AGENT`, `CLAUDECODE`). L'analyse partait du premier « { » (objet intérieur du tableau) et échouait sur le « ] » final ; la vérification précédente, faite en mode agent, ne pouvait pas le voir. Ni BOM ni ligne supplémentaire. Correctifs : analyseur partagé `scripts/cli-rows.ts` (`parseCliRows` : tableau ou enveloppe, BOM, texte avant ou après le JSON ; extrait masqué en cas d'échec), utilisé par le script et par `localSqlRows` (même défaut latent dans les tests lancés depuis un terminal) ; étape nommée dans chaque message (« taille de la base avant le .txt », « dépôt du .md »…) et message réel de toute erreur, masqué. Tests avec les deux sorties réelles. Rejoué en mode terminal : lecture distante (12,9 Mo), exécution locale complète, tests de `localSqlRows`.
- **Décision de l'utilisateur (2026-11-12) : option B**, limite de 300 000 octets pour les `.txt`, les `.md` et les Notes (Note mesurée après normalisation, comme aujourd'hui), sous réserve d'une mesure de confirmation en production ; option A reportée après l'Epic 5, seulement si 1 Mo devient nécessaire. Option `--size=<octets>` ajoutée à `load:1mo` (fichiers de size − 10 000 à size, rapport `docs/mesures/charge-<size>-octets.md`, libellé « limite de <size> octets confirmée ») ; essai local à 300 000 octets : 298 905 et 298 273 octets, *prêts*, 351 et 349 Passages, environ 3,3 Mo ajoutés par fichier, nettoyage complet. Lecture seule en production : 13 Documents, texte le plus long 4 036 octets, aucun au-delà de 300 000.
- **Mesures à 150 000 et 100 000 octets (utilisateur)** : 150 000 rejeté (`complete_ms` 3 339 et 7 005 ms) ; **100 000 retenu** (`complete_ms` 2 556 et 3 047 ms pour 116 et 115 Passages). Décision : **100 Ko = 100 000 octets** pour les fichiers et les Notes (après normalisation) ; écriture par lots reportée après l'Epic 5.
- **Application de la limite** : migration `20261112170000_limit_100000.sql` (bucket, contrainte `documents_content_size`, `import_file_document` recréée à l'identique hormis la limite, droits conservés ; aucun Document existant au-delà, 4 036 octets au plus) ; `process-document` (texte converti à 100 Ko, message) ; `DbError.from` journalise le code Postgres ou PostgREST réel (`http_500:57014`), jamais le message ni les détails ; `src/lib/documents.ts` (`MAX_TEXT_BYTES = 100_000`, dont dépendent le contrôle navigateur, la route de dépôt et le schéma de la Note) ; messages « 100 Ko » ; `load:1mo` mesure la limite en vigueur par défaut, `--size` jusqu'à 1 000 000, rapports jamais écrasés ; PRD (FR-4, FR-5, SM-5, Jeu), addendum, architecture, EXPERIENCE.md, `epics.md` (note datée, critères livrés non réécrits), `docs/environnements.md` ; tests adaptés et test de concordance de la limite (`tests/unit/size-limit.test.ts`).
- **Ordre de déploiement validé** : push d'abord (l'application refuse au-delà de 100 Ko, la base accepte encore jusqu'à 1 Mo : aucune erreur possible), puis `npm run deploy:supabase` (migration et `process-document`).
