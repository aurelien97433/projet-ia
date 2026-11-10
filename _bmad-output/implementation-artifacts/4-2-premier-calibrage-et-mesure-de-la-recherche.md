---
title: 'Story 4.2 : Premier calibrage et mesure de la Recherche'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '9005ffbfd499be6e5c9583af8c42d42c3f7d622e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le seuil de 0,40 passe le test réel de la 4.1a (`docs/mesures/recherche-live.md`), mais sa marge est inconnue : `semantic-search` ne renvoie aucune similarité. Le démarrage à froid (3 542 ms au premier appel) n'est pas expliqué, et deux points différés attendent la 4.2 (index HNSW, intertitres en fin de Passage).

**Approach:** `npm run measure:search` réutilise `test:search:live` (cible exigée, Compte de mesure 1, cas r1 à r6, s1 à s3, « tarte ») et ajoute les similarités réelles : les 10 Requêtes sont vectorisées en un seul appel par une fonction **locale** (clé OpenAI locale), puis `match_passages` est appelée sur le projet distant avec la session du Compte de mesure (seuil 0, 1 Passage par Document). Le balayage des seuils (0,30 à 0,50) est calculé hors ligne, sans autre appel. Rapport : `docs/mesures/recherche.md`.

## Boundaries & Constraints

**Always:**
- Appels réels limités à une exécution : 1 vectorisation groupée locale (10 Requêtes), 10 appels de `semantic-search` (durées de la chaîne réelle, premier appel distingué) et 10 appels de `match_passages`, tous avec la session du Compte de mesure 1.
- Rapport : pour chaque Requête, rang du bon Document et similarité de son meilleur Passage, meilleure similarité hors base, nombre de résultats, durée ; tableau par seuil (0,30 ; 0,35 ; 0,40 ; 0,45 ; 0,50) : Requêtes r dans le top 3, Requêtes hors base avec résultat ; marges basse (0,40 − meilleure similarité hors base) et haute (plus faible similarité d'un bon Document − 0,40) ; médiane et maximum des durées, durée de `match_passages` seule. Aucun secret, aucune adresse e-mail, aucun jeton, aucun vecteur.
- Fonction locale `measure-embed` : exclue de `deploy:supabase` comme `ai-health` ; réservée à la clé `service_role` locale ; 1 à 20 textes de 1 à 500 caractères ; vectorisation réelle par `embed` (jamais simulée) ; renvoie les vecteurs seuls.
- Démarrage à froid : cause consignée (comparaison premier appel / médiane, durée de `match_passages` seule, journaux `semantic_search_done` lus par l'utilisateur) et action simple proposée.
- Points différés : HNSW et intertitres traités ou reportés explicitement, avec la mesure qui justifie la décision.

**Décisions du 2026-11-10 :**
- **Q1 = A.** 0,40 est gardé s'il satisfait les critères avec au moins 0,05 de marge des deux côtés. Sinon, le milieu de la bande sûre est recommandé : la valeur et la procédure (secret `RAG_MIN_SIMILARITY`, posé par l'utilisateur) lui sont présentées avant toute pose, sans changement de code.
- **`measure-embed` strictement locale**, exclue de `deploy:supabase`, avec un test qui le prouve, comme `ai-health`. Même modèle et même dimension que la production, vérifiés et consignés dans le rapport.
- **Story gardée entière**, au-dessus du repère de taille.

**Never:** modification du seuil, des secrets ou du code déployé si 0,40 reste retenu ; `service_role` distante ; similarité dans une réponse de `semantic-search` ou de `/api/search` ; nouveau découpage ou re-vectorisation des Documents ; story 4.1b ; commit ou push sans validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mesure complète | projet lié, 9 Documents prêts | rapport complet, marges, balayage | — |
| Seuil retenu | 0,40 conforme aux critères | aucune modification, valeur consignée | — |
| Critères non atteints à 0,40 | < 4 r sur 6 dans le top 3, ou un hors base avec résultat | valeur proposée consignée, non appliquée | décision de l'utilisateur |
| Cible invalide | autre projet, local, http, clé secrète | refus avant tout appel | message sans secret |
| Fonction locale | sans clé `service_role`, texte vide ou > 500, > 20 textes | 401 ou 400, aucun appel OpenAI | — |
| Supabase local arrêté | — | échec explicite avant tout appel distant | message d'action |

</frozen-after-approval>

## Code Map

- `scripts/test-search-live.ts` -- `resolveLiveTarget`, `isPublicKey`, `loadCases`, `evaluateCase`, `publicVariables`, boucle d'appel : à exporter et réutiliser (une fonction `runLiveCases`), sans changer le comportement de `test:search:live`.
- `scripts/seed-demo.ts` -- `parseSeedEnv` (Compte de mesure 1), `SeedError`.
- `scripts/deploy-supabase.ts:15` -- `LOCAL_ONLY_FUNCTIONS` : ajouter `measure-embed` ; `tests/unit/deploy-supabase.test.ts:41` à étendre.
- `supabase/functions/ai-health/index.ts` -- modèle de fonction locale (`hasBearerSecret`, `SUPABASE_SERVICE_ROLE_KEY`, `embed` sans `deps`) ; `supabase/config.toml:431` -- `[functions.ai-health] verify_jwt = false` à reproduire.
- `supabase/functions/_shared/search.ts` -- `parseSearchQuery` (bornes de la Requête) ; `_shared/config.ts` -- `RAG_MIN_SIMILARITY`, `SEARCH_MAX_DOCUMENTS`.
- `supabase/migrations/20261110090000_match_passages.sql` -- appel direct : `min_similarity` 0, `max_passages` 50, `max_per_document` 1.
- `supabase/functions/semantic-search/index.ts:166` -- journal `semantic_search_done` (`embed_ms`, `match_ms`, `duration_ms`) : source de l'analyse du démarrage à froid.
- `tests/support/local-supabase.ts` -- `supabase status` (URL et clé `service_role` locales) : même lecture dans le script, sans affichage.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- entrées HNSW (4.1a) et intertitres (avant 4.1a) à clore ou reporter.
- `docs/environnements.md` -- ligne `measure:search` à ajouter près de `test:ai`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/functions/measure-embed/index.ts`, `supabase/config.toml`, `scripts/deploy-supabase.ts` -- fonction locale de vectorisation des Requêtes, exclue du déploiement.
- [x] `scripts/test-search-live.ts` -- exporter la boucle d'appel réutilisable, comportement inchangé.
- [x] `scripts/measure-search.ts`, `package.json` -- `measure:search` : cible, vectorisation locale, `match_passages` distante, durées, balayage, marges, rapport.
- [x] `tests/unit/measure-search.test.ts`, `tests/unit/measure-embed.test.ts`, `tests/unit/deploy-supabase.test.ts` -- balayage, marges, rapport sans donnée sensible, refus de la fonction, exclusion du déploiement.
- [x] `tests/integration/measure-embed.test.ts` -- refus sans clé `service_role` et validation sur Supabase local, sans appel OpenAI.
- [x] `docs/environnements.md`, `deferred-work.md` -- commande documentée ; HNSW, intertitres et réchauffement de la démo reportés ou clos, avec leur justification.

**Acceptance Criteria:**
- Given `npm run measure:search`, when il se termine, then `docs/mesures/recherche.md` contient rang, similarité, résultats hors base et durée pour chaque Requête, et le seuil retenu.
- Given `npm test`, `build:ci` et `check:secrets`, when ils se terminent, then aucun n'appelle OpenAI et aucun secret n'apparaît.

## Design Notes

Similarités sans changer la production : la Requête est vectorisée localement avec le même modèle que les Passages distants (`text-embedding-3-small`, version 1), puis comparée par `match_passages` sur le projet distant avec la session du Compte de mesure. Ni la clé OpenAI ni `service_role` distante ne quittent Supabase ; le vecteur n'est jamais écrit dans le rapport.

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected : tout vert, aucun secret.
- `npm run measure:search` -- lancé par l'utilisateur, une fois, Supabase local démarré.

## Implementation Notes

- **Réutilisation** : `test-search-live.ts` exporte `openLiveSession` (cible exigée, Compte de mesure 1) et `runLiveCases` (boucle d'appel de `semantic-search`) ; `test:search:live` garde son comportement et son rapport.
- **`measure-embed`** : `embed` appelé sans `deps`, donc toujours réel, même sur la pile locale avec la simulation activée (test dédié). Exclusion du déploiement prouvée sur le vrai dossier (`process-secret-boundaries.test.ts`) et dans `deploy-supabase.test.ts`.
- **`measure:search`** : pile locale d'abord (aucun appel distant si elle ou sa clé ne répondent pas), contrôle modèle, version et dimension (`checkEmbedding`), puis 10 `match_passages` et 10 `semantic-search` distants. Balayage, marges, décision Q1 = A et analyse des durées sont des fonctions pures testées.
- **Critère de l'epic** (4 sur 5) généralisé à 80 % : 5 Requêtes pertinentes sur 6 au moins dans le top 3.
- **Points différés** : HNSW reporté à 7.1b, intertitres à 5.7, réchauffement avant la démo à 7.5 ou 7.6 (`deferred-work.md`), chacun avec sa justification.
- **Reste** : l'exécution de `npm run measure:search` par l'utilisateur produit `docs/mesures/recherche.md` et la décision sur le seuil.

## Spec Change Log

## Review Triage Log

Revue ciblée faite dans la session, sans les trois relecteurs (demande de l'utilisateur). Points examinés : vectorisation locale toujours réelle, exclusion du déploiement, aucune clé distante sensible, absence de donnée sensible dans le rapport, appels réels limités, règle de décision.

| Constat | Verdict | Suite |
| --- | --- | --- |
| `recommend` contenait une condition sans effet (balayage d'une liste vide). | low | patch appliqué avant les tests |
| La décision repose sur la meilleure similarité hors base et la plus faible d'un bon Document, alors que le critère de l'epic tolère une Requête pertinente sur cinq hors du top 3 : la règle Q1 = A est donc plus stricte que l'epic. | low | gardé : conforme à la décision Q1, consigné |
| `max_passages` = 50 : au-delà de 50 Documents (Jeu complet), les similarités les plus faibles ne seraient pas lues. Sans effet sur le mini Jeu (9 Documents). | low | rejeté pour la 4.2 ; à revoir avant de rejouer la mesure en 7.1b |

## Verification Results

**Résultats du 2026-11-10 :** `npm test` : 56 fichiers, 931 tests réussis (dont `measure-embed` local : refus et validation) ; `npx tsc --noEmit` et `npm run lint` propres ; `npm run build:ci` vert, aucun secret. E2e non relancés : aucun code de l'application Next.js modifié. `npm run measure:search` : à lancer par l'utilisateur.

Mesure réelle (2026-11-10, utilisateur, `npm run measure:search`) : vectorisation locale conforme (`text-embedding-3-small`, version 1, 1 536 dimensions) ; r1 à r6 au rang 1 (similarités 0,461 à 0,621) ; hors base 0,207 à 0,345, aucun résultat réel ; critères atteints de 0,35 à 0,45 ; marges 0,055 et 0,061 ; **0,40 gardé**, aucun secret modifié ; durées 530 à 959 ms, médiane 619 ms, `match_passages` seule 308 ms. Rapport : `docs/mesures/recherche.md`.
