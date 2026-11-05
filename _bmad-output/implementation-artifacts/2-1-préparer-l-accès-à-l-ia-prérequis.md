---
title: "Story 2.1 : Préparer l'accès à l'IA (prérequis)"
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_commit: '6c28549988d3ae1f5fb72603f658bb54c3940a02'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aucun code n'accède encore à l'IA. Avant le premier traitement (2.4), il faut un accès unique, borné en coût, invisible du navigateur, et la preuve que la clé donne accès à `gpt-5.4-mini` et à `text-embedding-3-small` (1 536 dimensions).

**Approach:**
- Le module `supabase/functions/_shared/ai.ts` est le seul point d'appel OpenAI (`fetch`, sans SDK). Il est accompagné de `_shared/config.ts` et de `_shared/errors.ts`.
- Une Edge Function de contrôle, protégée, appelle `embed(["Bonjour"])` et vérifie l'accès aux deux modèles, à travers le runtime local qui lit `supabase/functions/.env`.
- Des tests unitaires utilisent un fournisseur simulé, et un seul test d'intégration réel, à lancer sur demande, appelle le fournisseur.
- L'utilisateur pose lui-même la clé, en local et sur le projet distant, avec une méthode qui ne l'affiche ni ne l'écrit dans l'historique.

## Boundaries & Constraints

**Always:**
- **Clé.**
  - `OPENAI_API_KEY` n'est lue que par `_shared/ai.ts`, côté Edge Functions.
  - Aucune occurrence de `openai` ni de `OPENAI_API_KEY` dans `src/` (vérifié par un test).
  - `supabase/functions/.env` est ignoré par git.
  - Clé jamais journalisée ni renvoyée. Aucun texte d'entrée dans les journaux.
- **Configuration.** `EMBEDDING_MODEL = text-embedding-3-small`, `EMBEDDING_DIMENSION = 1536`, `EMBEDDING_VERSION`, `GENERATION_MODEL` (défaut `gpt-5.4-mini`, remplaçable par le secret du même nom) sont définis une seule fois dans `_shared/config.ts`.
- **`embed(texts)`.**
  - Lots de 96, délai par requête, ordre des vecteurs conservé.
  - Chaque vecteur est contrôlé : 1 536 nombres finis. Sinon, refus.
- **Erreurs.**
  - `429` (hors plafond) et `5xx` : 2 nouvelles tentatives, puis `AI_UNAVAILABLE`.
  - Refus de plafond (`insufficient_quota`, `billing_hard_limit_reached`, `project_spend_limit_exceeded`) : `AI_BUDGET_EXHAUSTED` immédiat, journalisé.
  - Autres `4xx` (clé invalide, modèle refusé) : `AI_UNAVAILABLE` sans nouvelle tentative, journalisé.
  - Délai dépassé : `AI_TIMEOUT`.
  - Mauvaise dimension : refus (`AI_OUTPUT_INVALID`), sans nouvelle tentative.
- **Codes.** Ils sont communs avec `src/lib/errors.ts`. Un test vérifie l'égalité des deux listes.
- **Fonction de contrôle.** Entrée fixe, aucun texte libre accepté. Elle n'est accessible qu'avec la clé `service_role`.
- **Test réel.** Il est sauté par défaut dans `npm test` et lancé par `npm run test:ai`.

**Décisions du 2026-11-05 :**
- **Q1 = A** : `ai-health` reste en local. `deploy:supabase` l'exclut en passant à la CLI la liste explicite des fonctions.
- **Q2** : la réponse reçue était « oui/non », non tranchée.
  - Attestés : crédit prépayé de 10 $, sans recharge automatique. C'est le plafond réel.
  - Alerte à 5 $ : **à confirmer par l'utilisateur**, notée comme telle dans `docs/environnements.md`.
- **Q3** : revue ciblée sur les secrets et le module OpenAI, sans les trois relecteurs.
- **Q4** : spec gardée entière.
- La clé locale et le secret distant ont été posés par l'utilisateur, sans les communiquer.

**Never:**
- Clé saisie dans la conversation, dans un fichier suivi ou dans un document.
- Lecture ou affichage, par l'IA, du contenu de `supabase/functions/.env`.
- SDK OpenAI. Import de `src/` depuis les Edge Functions.
- Appel à l'IA depuis Next.js.
- Tables `documents` et `passages`, ou fonction `process-document` (stories 2.2 à 2.4).
- Story 2.2.
- Commit ou push sans validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vecteur réel | `embed(["Bonjour"])`, clé locale valide | 1 vecteur de 1 536 nombres, modèle `text-embedding-3-small` | — |
| Lots | 200 textes | 3 requêtes (96, 96, 8), 200 vecteurs dans l'ordre | — |
| Dimension inattendue | le fournisseur renvoie 1 535 nombres | refus `AI_OUTPUT_INVALID` | journalisé, aucune nouvelle tentative |
| 429 ou 5xx passager | échec, puis succès | succès après au plus 2 nouvelles tentatives | — |
| 429 ou 5xx persistant | 3 échecs | `AI_UNAVAILABLE` (3 requêtes en tout) | journalisé |
| Plafond atteint | 429 `insufficient_quota` | `AI_BUDGET_EXHAUSTED`, 1 seule requête | journalisé |
| Clé absente ou invalide | aucune clé, ou 401 | `AI_UNAVAILABLE`, sans nouvelle tentative | journalisé, clé jamais affichée |
| Délai dépassé | aucune réponse | `AI_TIMEOUT` | journalisé |
| Fonction de contrôle sans clé `service_role` | clé publique ou aucune | 401 | forme AD-19 |
| Code Next.js | recherche de `openai` dans `src/` | aucune occurrence | — |

</frozen-after-approval>

## Code Map

- `supabase/functions/` -- n'existe pas encore. `_shared/` (modules) et `ai-health/index.ts` (fonction) seront créés.
- `supabase/config.toml` -- `[edge_runtime] enabled = true`, `policy = "per_worker"`. Ajouter `[functions.ai-health] verify_jwt = false`, car le contrôle de la clé `service_role` est fait dans la fonction, ce qui marche avec les clés locales et les nouvelles clés distantes.
- `scripts/deploy-supabase.ts` -- `listFunctions` exclut `_*` et `.*`. Le déploiement appelle `functions deploy` sans nom, donc toutes les fonctions. Selon la réponse à la question 1, passer les noms et exclure `ai-health`. Tests : `tests/unit/deploy-supabase.test.ts`.
- `scripts/check-secrets.ts` -- parcourt les fichiers suivis et non ignorés (`git ls-files --others --exclude-standard`). Le `.env` ignoré n'est pas lu. Mentionner le nom `OPENAI_API_KEY` n'est pas une erreur.
- `src/lib/errors.ts` -- `ERROR_CODES`, à reproduire dans `_shared/errors.ts` (les Edge Functions n'importent rien de `src/`).
- `tests/support/local-supabase.ts` -- `localSupabase()` (URL, clé `service_role` locale) pour appeler `http://127.0.0.1:54321/functions/v1/ai-health`.
- `vitest.config.mts` -- `include` couvre `tests/unit` et `tests/integration`. `server-only` est remplacé par un module vide.
- `tsconfig.json` -- inclut `**/*.ts`, donc les fichiers des fonctions aussi. Pas de type `Deno` : y accéder par `globalThis`.
- `.gitignore` -- `.env*` couvre `supabase/functions/.env` (vérifié par `git check-ignore`).
- `.env.example` -- liste déjà `OPENAI_API_KEY` comme secret Supabase uniquement.
- `docs/environnements.md` -- prérequis OpenAI « à confirmer avant la story 2.1 » : à attester sans valeur.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/functions/_shared/config.ts` -- modèles, dimension, version, taille de lot, délais, lecture de l'environnement.
- [x] `supabase/functions/_shared/errors.ts` -- liste des codes, `AiError`, `errorResponse` (AD-19), `logEvent`.
- [x] `supabase/functions/_shared/ai.ts` -- `embed`, `checkModelAccess` ; dépendances injectables (`fetch`, clé, attente) pour les tests.
- [x] `supabase/functions/ai-health/index.ts` + `supabase/config.toml` -- contrôle de la clé `service_role`, puis `{ embeddingModel, dimension, models: { [id]: boolean } }`.
- [x] `scripts/deploy-supabase.ts` + son test -- selon la réponse à la question 1.
- [x] `tests/unit/ai.test.ts` -- toutes les lignes simulables de la matrice.
- [x] `tests/unit/ai-boundaries.test.ts` -- aucune occurrence de `openai` dans `src/`, codes d'erreur identiques des deux côtés, `supabase/functions/.env` ignoré.
- [x] `tests/integration/ai-live.test.ts` + script `test:ai` -- appel réel par `ai-health` en local ; sauté sans `AI_LIVE_TEST=1`.
- [x] `docs/environnements.md` -- prérequis attestés (sans valeur), procédure de pose de la clé, contrôle par empreinte.

**Acceptance Criteria:**
- Given la clé posée par l'utilisateur, when `npm run test:ai`, then `ai-health` répond 1 536 dimensions, `text-embedding-3-small`, et l'accès aux deux modèles est vrai.
- Given les tests existants, when `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` et `npm run check:secrets`, then tout passe.

## Design Notes

- **Accès aux modèles.** Il est vérifié par `GET /v1/models/{id}`, sans coût. Le seul appel facturé est l'embedding de « Bonjour » (moins d'un millionième de dollar).
- **Mauvaise dimension.** Elle reçoit `AI_OUTPUT_INVALID` (sortie du fournisseur non conforme), sans nouvelle tentative : une nouvelle tentative ne changerait rien.
- **Erreurs réseau** (`fetch` qui échoue). Elles sont traitées comme un `5xx` (nouvelle tentative).
- **Délai.** Un délai dépassé n'est pas retenté. L'appelant choisit son délai, dans le respect des budgets d'AD-16.

## Verification

**Commands:**
- `npm test` -- expected: tout vert, test réel sauté.
- `npm run test:ai` -- expected: après la pose de la clé locale, 1 536 dimensions et accès aux deux modèles.
- `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected: 0 erreur, aucun secret.

## Implementation Notes

- Implémentation faite dans la session principale.
- **Modules en TypeScript pur.** Aucun type Deno : l'environnement est lu par `globalThis.Deno`. Les modules sont importés avec l'extension `.ts`, ce qui a demandé l'ajout de `allowImportingTsExtensions` dans `tsconfig.json`. Ils sont testés par Vitest.
- **`callProvider`** (`_shared/ai.ts`) est le seul `fetch` vers OpenAI.
  - Le délai couvre aussi la lecture du corps de la réponse.
  - Les journaux portent le code ou le type de l'erreur du fournisseur, jamais son message. Le message d'OpenAI pour une clé invalide contient un fragment de la clé.
- **`checkModelAccess`** utilise `GET /v1/models/{id}`, sans coût. Un 404 donne `false`, tout autre refus est une erreur.
- **`ai-health`**
  - Elle compare la clé `service_role` à durée constante. `verify_jwt = false` est posé pour cette seule fonction.
  - Elle répond 401 sans clé ou avec la clé publique, ce que vérifie le test réel.
- **`deploy:supabase`** passe la liste explicite des fonctions. `ai-health` est exclue, et seuls les noms `[a-z0-9-]` sont acceptés, car `runCli` passe par le shell.
- **Test réel.** `npm run test:ai` lance `tests/live/` avec `vitest.live.config.mts`.
  - La première version utilisait `mergeConfig`, qui additionnait les `include` et lançait toute la suite.
  - Supabase local a dû être redémarré pour servir la nouvelle fonction et lire `supabase/functions/.env`.
- **Vérifié** :
  - `npm run test:ai` : 2/2. Accès à `gpt-5.4-mini` et `text-embedding-3-small`, dimension 1 536, 401 sans clé `service_role`.
  - `npm test` : 196/196, dont 32 tests du module IA et 5 de frontières.
  - `npm run test:e2e` : 93 réussis, 5 ignorés.
  - `lint` : 0 erreur. `tsc` : 0 erreur. `check:secrets` et `build:ci` : verts.
  - `git add --dry-run` n'inclut pas `supabase/functions/.env`.
- **Non vérifié par l'IA** : le contenu de `supabase/functions/.env` n'a jamais été lu. Le secret distant n'est pas prouvé par un appel : la story 2.4 le prouvera au premier traitement réel.

## Spec Change Log

## Review Triage Log

Revue ciblée du 2026-11-05 (décision Q3) : secrets et module OpenAI, faite par l'IA sans relecteurs.

| # | Point contrôlé | Verdict | Preuve | Suite |
|---|---|---|---|---|
| 1 | La clé ne quitte `_shared/ai.ts` que vers `api.openai.com` | false (aucun défaut) | URL constante `OPENAI_BASE_URL` ; seul lecteur de `OPENAI_API_KEY` (test de frontière) | — |
| 2 | Clé ou texte dans les journaux | false | test « journaux » sur 4 issues ; le message du fournisseur, qui peut contenir un fragment de la clé, n'est jamais journalisé | — |
| 3 | `supabase/functions/.env` commité ou lu par `check:secrets` | false | `git check-ignore`, `git add --dry-run` ; `check:secrets` exclut les fichiers ignorés | — |
| 4 | Réponse d'`ai-health` contenant la clé ou un détail technique | false | corps fixe ; en erreur, code AD-19 et message générique | — |
| 5 | `ai-health` déployée par erreur avec `verify_jwt = false` | low | `deploy:supabase` l'exclut ; un `functions deploy` manuel sans nom la déploierait, mais elle exige toujours la clé `service_role` | accepté, documenté |
| 6 | Réponse 200 au JSON invalide retentée comme une erreur réseau, et journalisée `reason: network` | low | lecture de `callProvider` | reject : rare, l'issue (`AI_UNAVAILABLE`) reste correcte |
| 7 | `Retry-After` du fournisseur ignoré (attente de 500 puis 1 000 ms) | low | AD-16 ne fixe que le nombre de tentatives | reject |
| 8 | Noms de fonctions passés au shell par `runCli` | medium | nouveaux arguments variables | corrigé : filtre `[a-z0-9-]` et test |
| 9 | Test réel affichant la clé en cas d'échec | false | seul `body.error` est affiché | — |

**Clôture (2026-11-05) :**
- **Alerte à 5 $** : configurée, attestée par l'utilisateur.
- **Plafond de 10 $** : le tableau de bord OpenAI affiche « Limit not enforced », donc ce plafond **ne bloque pas** les appels. La limite réelle est le crédit prépayé de 10 $, sans recharge automatique.
  - Quand le crédit est épuisé, OpenAI répond 429 `insufficient_quota`.
  - Deux tests vérifient la traduction en `AI_BUDGET_EXHAUSTED` : l'un reprend la réponse réelle d'OpenAI (type et code `insufficient_quota`, message), l'autre le même refus pendant `checkModelAccess`.
  - Les tests vérifient aussi que la réponse n'est pas retentée et que le message du fournisseur n'est pas journalisé.
- **Secret distant** : l'utilisateur a vérifié que `supabase secrets list` affiche `OPENAI_API_KEY` avec une empreinte seulement.
- Story passée à `done` à la demande de l'utilisateur.
