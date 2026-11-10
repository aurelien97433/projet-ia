---
title: 'Story 4.1a : Recherche sémantique côté serveur'
type: 'feature'
created: '2026-11-10'
status: 'in-review'
baseline_commit: '4333d26fb8f84cf10d2553eb10882fc5de494c1d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La Base commune n'est pas interrogeable par le sens : aucune fonction ne compare une Requête aux Passages vectorisés.

**Approach:** Fonction SQL `match_passages`, Edge Function `semantic-search` (jeton du Collaborateur, vectorisation de la Requête par `embed`) et Route Handler Next.js `POST /api/search`, qui renvoient au plus 5 Documents prêts avec leur meilleur Passage, sans score ni texte rédigé.

## Boundaries & Constraints

**Always:**
- **`match_passages(query_embedding, min_similarity, max_passages, max_per_document, embedding_model, embedding_version)`** : migration nouvelle ; `language sql`, `security invoker`, `stable`, `search_path` vide ; Passages dont le Document est `ready`, `text_version` égale à celle du Document, modèle et version égaux aux paramètres ; similarité cosinus ≥ seuil ; au plus `max_per_document` par Document, puis `max_passages` au total, par similarité décroissante (départage stable). Renvoie `document_id`, `title`, `category`, `passage_id`, `start_offset`, `end_offset`, `content` (le Passage seul), `similarity`. Dimension vérifiée (1 536). `REVOKE ALL` de `public`, `anon` ; `GRANT EXECUTE` à `authenticated` seul.
- **Version active et seuil** : modèle et version passés depuis `_shared/config.ts` (source unique) ; `RAG_MIN_SIMILARITY` = 0,40 dans `config.ts`, remplaçable par le secret Supabase du même nom (valeur bornée entre 0 et 1, sinon défaut).
- **`semantic-search`** : `verify_jwt = true` ; client Supabase avec le jeton reçu, session vérifiée (`UNAUTHENTICATED` 401) ; corps `{ query }` revalidé : chaîne, 1 à 500 caractères après suppression des espaces, sinon `VALIDATION_FAILED` 400 ; vectorisation par `embed` avec `embeddingDeps` (simulée seulement sur la pile locale) ; délai total de 10 s (vectorisation et requête) → `AI_TIMEOUT` ; panne → `AI_UNAVAILABLE` ou `AI_BUDGET_EXHAUSTED` ; recherche : 5 Documents, 1 Passage chacun. Réponse `{ results: [{ documentId, title, category, passage: { id, start, end, content } }] }` : jamais `similarity`, jamais `content_text`. Journaux : durée, nombre de résultats, jamais la Requête ni un jeton.
- **`POST /api/search`** : `requireUser()` (401), `Cache-Control: no-store`, même validation, appel de `semantic-search` avec le jeton de la session (délai de 12 s), relais tel quel des codes AD-19 ; panne de relais → `AI_UNAVAILABLE`. Textes du catalogue.
- **Tests** : intégration sur Supabase local ; vectorisation simulée ; refus sans jeton aux deux étages ; mesure de durée consignée.

**Décisions du 2026-11-10 :**
- **Q1 = A.** En local, seuil simulé de 0,20 pour r1 à r6 et la mécanique. Ce seuil n'est actif **qu'avec la vectorisation simulée sur la pile locale, avec le même garde-fou qu'`EMBEDDINGS_FAKE`** (`EMBEDDINGS_FAKE=1` et hôte `kong`) ; ailleurs, le seuil reste celui de `RAG_MIN_SIMILARITY` (0,40 par défaut). Un test prouve qu'il ne peut pas s'appliquer en production (hôte distant, ou `EMBEDDINGS_FAKE` absent). « Hors base sans résultat » est prouvé en local sur `match_passages` avec des vecteurs contrôlés.
- **Test réel unique `npm run test:search:live`**, après déploiement : un Compte de mesure de `.env.seed`, la cible affichée, le projet distant attendu exigé (refus sinon), aucun secret affiché. Il vérifie r1 à r6 dans les 3 premiers et s1 à s3 et « recette de la tarte aux pommes » sans résultat, au seuil de 0,40. Son rapport consigne pour chaque Requête le rang du bon Document et la durée, jamais les similarités (l'Edge Function ne les renvoie pas). Les similarités peuvent figurer dans un rapport de mesure local, pour préparer la 4.2.
- **Q2 = A.** Si le test réel échoue au seuil de 0,40 : story livrée avec la réserve consignée, mesures transmises à la 4.2.
- **Story gardée entière**, au-dessus du repère de taille.

**Never:** Page Recherche ou champ du Tableau de bord (4.1b) ; script de mesure ou calibrage (4.2) ; texte rédigé par l'IA ; score dans une réponse ; `service_role` hors de `process-document` ; commit, push ou `deploy:supabase` sans validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pertinent | « organisation des congés », mini Jeu | « Procédure congés et absences » dans les 3 premiers, ≤ 5 Documents, chacun une fois, titre, Catégorie, Passage (positions) | — |
| Mini Jeu | r1 à r6 | bon Document dans les 3 premiers | — |
| Hors base | « recette de la tarte aux pommes », s1 à s3 | `results: []` (réel, seuil 0,40) | décisions Q1 |
| Non prêt | Document *en cours* ou *en erreur* contenant le terme | jamais renvoyé | — |
| Ancienne version | Passages d'un autre modèle, d'une autre version ou d'un ancien `text_version` | jamais renvoyés | — |
| Requête invalide | vide, espaces, > 500 caractères, absente, non textuelle | 400 `VALIDATION_FAILED` | message du catalogue |
| Sans jeton | Route Handler ou `semantic-search` | 401 | `UNAUTHENTICATED` |
| `anon` | appel direct de `match_passages` | refusé | — |
| Panne / lenteur | fournisseur en échec, ou > 10 s | `AI_UNAVAILABLE` / `AI_TIMEOUT` | sans détail technique |

</frozen-after-approval>

## Code Map

- `supabase/functions/_shared/config.ts` -- ajouter `RAG_MIN_SIMILARITY` (0,40), lecture bornée du secret, constantes de la Recherche (5 Documents, 1 Passage, 500 caractères, 10 s).
- `supabase/functions/_shared/ai.ts` -- `embed(texts, options)` : `timeoutMs` et `deps` ; `AiError` (codes AI_*). `EMBEDDING_TIMEOUT_MS` = 15 s : passer un délai réduit pour tenir 10 s au total.
- `supabase/functions/_shared/fake-embeddings.ts` -- `embeddingDeps(id)` : simulée si `EMBEDDINGS_FAKE=1` et hôte `kong` ; réutiliser tel quel (l'argument sert seulement aux journaux).
- `supabase/functions/_shared/errors.ts` -- `errorResponse`, `logEvent`, `logInfo` ; liste des codes identique à `src/lib/errors.ts` (test existant).
- `supabase/functions/process-document/index.ts` -- modèle de structure d'Edge Function (imports `.ts`, `Deno.serve`, journaux).
- `supabase/migrations/20261106130000_passages.sql` -- table `passages` (`embedding_model`, `embedding_version`, `text_version`), index HNSW, politique « Documents prêts » ; modèle de `REVOKE`/`GRANT`.
- `supabase/config.toml:384-437` -- `[edge_runtime.secrets]` (`EMBEDDINGS_FAKE`) ; ajouter `[functions.semantic-search] verify_jwt = true`. Redémarrer Supabase local après un changement de `config.toml`.
- `scripts/deploy-supabase.ts:19` -- `listFunctions` détecte les dossiers avec `index.ts` (vérifier que `semantic-search` y entre et qu'`ai-health` reste exclu).
- `src/app/api/documents/route.ts` -- modèle de Route Handler (`requireUser`, `NO_STORE`, `appError`) ; `src/lib/errors.ts`, `src/lib/texts.ts` (textes de la Recherche à ajouter depuis EXPERIENCE.md : « La Recherche n'a pas pu aboutir. »).
- `src/server/documents/trigger-processing.ts` -- modèle d'appel d'Edge Function depuis Next.js (URL, en-têtes, délai).
- `tests/integration/*.test.ts`, `tests/support/local-supabase.ts` -- Comptes et clients locaux ; `tests/integration/seed-demo.test.ts` -- mini Jeu local ; `vitest.live.config.mts`, `npm run test:ai` -- modèle de test réel séparé.
- `AGENTS.md` : lire `node_modules/next/dist/docs/` pour les Route Handlers. Ne lire aucun fichier `.env*`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<horodatage>_match_passages.sql` -- fonction, droits.
- [x] `supabase/functions/_shared/config.ts`, `supabase/functions/_shared/search.ts` -- seuil, validation, mise en forme des résultats (fonctions pures testées par Vitest).
- [x] `supabase/functions/semantic-search/index.ts`, `supabase/config.toml` -- Edge Function, `verify_jwt`.
- [x] `src/app/api/search/route.ts`, `src/server/search/semantic-search.ts`, `src/lib/schemas/search.ts`, `src/lib/texts.ts` -- Route Handler et relais.
- [x] `tests/unit/` -- validation, seuil borné, mise en forme sans score, relais des erreurs, délai.
- [x] `tests/integration/match-passages.test.ts` -- prêts seulement, version et `text_version`, 1 Passage par Document, limite, seuil, `anon` refusé, vecteurs contrôlés.
- [x] `tests/integration/semantic-search.test.ts` -- mini Jeu local : « organisation des congés », r1 à r6, refus sans jeton aux deux étages, Requête invalide, durée consignée.
- [x] `supabase/functions/_shared/config.ts`, `scripts/test-search-live.ts`, `package.json` -- seuil simulé gardé (Q1) et son test ; test réel `test:search:live` (Compte de mesure, cible exigée, rapport rang et durée).

**Acceptance Criteria:**
- Given une réponse de `semantic-search` ou de `/api/search`, when je l'inspecte, then elle ne contient ni `similarity`, ni `content_text`, ni texte rédigé.
- Given `build:ci` et `check:secrets`, when ils se terminent, then aucun secret n'apparaît, et `OPENAI_API_KEY` n'est lue que par `_shared/ai.ts`.

## Design Notes

Le relais Next.js passe le jeton d'accès de la session (`Authorization: Bearer`) et la clé publique (`apikey`) : l'Edge Function crée son client avec ce jeton, la RLS s'applique donc dans `match_passages`. Le délai de 10 s couvre vectorisation et requête : un `AbortController` commun, la vectorisation recevant le temps restant.

`test:search:live` vise le projet distant, qui n'a pas encore la fonction : il est écrit et testé unitairement (cible exigée, refus d'une autre cible, aucun secret affiché), mais **jamais lancé pendant l'implémentation**. Le projet distant attendu est celui lié par la CLI (`supabase/.temp/project-ref`, comme `deploy:supabase`). Lire `.env.seed` par le script seulement, jamais l'afficher. La clé publique du projet distant n'étant pas dans `.env.seed`, la lire d'une source publique déjà présente (variable publique de Next.js ou CLI), sans jamais utiliser la clé `service_role` pour la Recherche.

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run test:e2e` -- expected : tout vert, aucun secret.

**Manual checks:**
- Production : voir le rapport de fin de story.

## Implementation Notes

- **Garde-fou du seuil simulé (Q1)** : `searchVectorization()` (`_shared/search.ts`) choisit ensemble la vectorisation et le seuil ; c'est exactement ce qu'exécute `semantic-search`. Le seuil de 0,20 n'est retenu que si `embeddingDeps` a retenu la simulation (pile locale, hôte `kong`). Tests : `tests/unit/search.test.ts` (projet distant avec ou sans simulation demandée, hôte voisin de `kong`, URL absente → 0,40 ou le secret).
- **Délai commun** : un `AbortController` de 10 s couvre session, vectorisation et requête ; la promesse d'expiration a un gestionnaire propre, pour qu'une expiration pendant la requête en base ne devienne pas un rejet non géré sous Deno (test dédié).
- **Session** : `semantic-search` vérifie le jeton auprès du serveur Auth (`/auth/v1/user`) en plus de `verify_jwt` ; la base est interrogée avec ce jeton et la clé publiable reçue (une clé secrète reçue est ignorée).
- **Relais Next.js** : `relaySearch` relit la réponse avec `searchResponseSchema` (aucune clé non déclarée ne passe) ; le 401 de la passerelle devient `UNAUTHENTICATED` ; toute réponse hors AD-19, réseau ou délai de 12 s → `AI_UNAVAILABLE`.
- **Frontières** : `process-secret-boundaries.test.ts` admet désormais deux appelants d'Edge Function côté Next.js (`trigger-processing.ts`, `server/search/semantic-search.ts`), tous deux `server-only` ; il vérifie aussi `verify_jwt = true` et la présence de `semantic-search` dans `deploy:supabase`.
- **Mesure locale (vectorisation simulée, seuil 0,20)** : « organisation des congés » rang 1 ; r1 1, r2 2, r3 1, r4 1, r5 1, r6 1 ; similarités simulées du bon Document 0,246 à 0,489 ; 23 à 55 ms par appel à chaud. Ces similarités, simulées et lexicales, ne disent rien du seuil réel (4.2).
- **`test:search:live`** : écrit et testé unitairement, jamais lancé. Cible = projet lié (`supabase/.temp/project-ref`), exigée à la fois par `.env.seed` et par la clé publique de `.env.local` ; refus de toute autre cible, de http, d'une clé secrète ou `service_role`. Rapport `docs/mesures/recherche-live.md` : rang et durée par Requête, sans similarité (la fonction n'en renvoie pas ; les obtenir à distance exigerait d'exposer le vecteur ou la clé OpenAI, hors périmètre).
- **E2e** : `tests/e2e/search-api.spec.ts` couvre `POST /api/search` sur le build de production (401 sans session, 200 sans score, 400).

## Spec Change Log

## Review Triage Log

Revue ciblée faite dans la session (règle 11 : 4.1a n'est pas une story sensible, relecteurs non lancés). Points examinés : authentification aux deux étages, garde-fou du seuil simulé, droits SQL, secrets, délais, forme des erreurs.

| Constat | Verdict | Suite |
| --- | --- | --- |
| La promesse d'expiration du délai commun restait sans gestionnaire après la vectorisation : une expiration pendant la requête en base produisait un rejet non géré (arrêt possible de l'isolat Deno). | medium | patch appliqué, test « base trop lente » |
| Commentaires citant `OpenAI` dans `src/` et le nom de la variable de simulation hors de son module : refusés par les tests de frontière. | low | patch appliqué |
| Valeurs factices de clés dans deux tests détectées par `check:secrets`. | low | patch appliqué (valeurs composées) |
| `match_passages` calcule la distance sur tous les Passages filtrés : l'index HNSW n'est pas utilisé. Sans effet mesurable à 13 Passages. | low | différé (4.2, avec la mesure de durée) |
| `verify_jwt = true` sur un projet passé aux nouvelles clés de signature JWT asymétriques : la passerelle pourrait refuser des jetons valides. Non vérifiable en local. | maybe-false | à constater par `test:search:live` (tous les cas en HTTP 401) |
