---
title: 'Story 5.0 : Essai léger du flux sur Vercel'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: '3d214c641068913bc748a096ea04632b111559e7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'Assistant (Epic 5) repose sur un flux Edge Function → Route Handler Next.js → navigateur. Personne n'a encore vérifié que Vercel Hobby le relaie morceau par morceau, sans le mettre en tampon : c'est le principal risque technique avant lundi 16/11.

**Approach:** Sur la branche `probe/5-0-stream` seulement, une Edge Function factice `stream-probe` (20 morceaux, un toutes les 250 ms, sans IA ni base), un Route Handler qui la relaie avec le jeton du Collaborateur, et une page de mesure dans le navigateur. 10 essais sur la prévisualisation Vercel depuis le réseau de l'utilisateur (La Réunion), rapport `docs/mesures/flux-vercel.md`, puis retrait complet.

## Boundaries & Constraints

**Always:**
- **Branche** `probe/5-0-stream`, créée par l'IA ; poussée seulement sur signal de l'utilisateur (Vercel crée alors la prévisualisation). **Rien ne part sur `main` pour l'essai.**
- **`stream-probe`** (`supabase/functions/stream-probe/index.ts`, `verify_jwt = true`) : session revérifiée auprès d'Auth (`/auth/v1/user`, modèle `semantic-search`) → sinon 401 sans corps utile. Puis 20 événements SSE `data: {"i":n,"t":ms}` (`t` = ms écoulées côté fonction, pour distinguer un tampon de la fonction d'un tampon du relais), un toutes les 250 ms, puis `event: done`. **Aucun import de `_shared/ai.ts`, aucun appel à `/rest/v1`, au Storage ni à OpenAI**, aucune lecture de secret autre que l'URL et la clé publique ; vérifié par un test.
- **Relais** `src/app/api/stream-probe/route.ts` (runtime Node, `maxDuration = 60`) : `requireUser()` puis jeton de la session (modèle `src/app/api/search/route.ts`) ; réponse `text/event-stream`, `Cache-Control: no-cache, no-transform`, corps amont relayé tel quel. Variante **B1** par `?variante=b1` (ajoute `X-Accel-Buffering: no` et `Content-Encoding: identity`, `ReadableStream` recopié morceau par morceau). Variante **B2** : `src/app/api/stream-probe-edge/route.ts` en `runtime = 'edge'`, même contrat. Les trois sont déployées ensemble : un échec se rejoue sans nouveau push.
- **Page** `src/app/(app)/essai-flux/page.tsx` (session exigée par le proxy) : choix de la variante, « Lancer 10 essais » (séquentiels). Pour chaque essai : instant de chaque morceau reçu (`performance.now()` depuis l'envoi), `t` côté fonction, `x-vercel-id` lu sur la réponse ; tableau, verdict, bouton « Copier le résultat » (Markdown, sans jeton ni identifiant de Compte). Aucun lien depuis la navigation.
- **Critères (par essai)** : premier morceau < 2 000 ms ; arrivée progressive = 20 morceaux, écart médian entre morceaux successifs ≥ 150 ms et dernier morceau ≥ 4 000 ms après le premier. Réussite = 10 essais conformes.
- **Variables Vercel (Preview)** : `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` doivent cocher **Preview** (lues au build et par le relais). `PROCESS_DOCUMENT_SECRET` n'est pas utilisé par l'essai ; il est en **Production seulement** (relevé de l'utilisateur, 2026-11-13) et **ne doit pas être ajouté en Preview**. Son absence ne bloque pas `build:ci` (`check:secrets` ignore un secret absent) ; sur la prévisualisation, seul le déclenchement d'un traitement (ajout d'une Note ou d'un fichier) échouerait, ce que l'essai ne fait pas. Vérification par l'utilisateur, faite le 2026-11-13 : Settings › Environment Variables, les deux variables publiques en « Production and Preview » ; aucune valeur affichée ni collée.
- **Protection Vercel** : laissée active. Essais dans le **navigateur de l'utilisateur**, connecté à Vercel (accès à la prévisualisation) puis à NexaMind sur le domaine de prévisualisation avec son propre Compte. Aucun script, aucun contournement (« Protection Bypass for Automation » non utilisé), aucun jeton copié.
- **Région** : `vercel.json` (`regions: ["fra1"]`) s'applique aussi aux prévisualisations ; preuve par `x-vercel-id` de chaque essai (`…::fra1::…`), relevé dans le rapport. Autre région → essai non représentatif, signalé.
- **Déploiement Supabase** (production, seul projet distant) par l'utilisateur, commande ciblée : `npx supabase functions deploy stream-probe --remote=<réf> --yes` (option vérifiée par `--help` le 2026-11-13) ; jamais `deploy:supabase` depuis la branche.
- **Retrait** (après validation des résultats) : suppression de la fonction distante par l'utilisateur (`npx supabase functions delete stream-probe` avec la même option), contrôle `functions list` ; branche distante supprimée ; prévisualisation Vercel supprimable au tableau de bord (facultatif, protégée de toute façon).
- **Plan B** : si la variante de base échoue, B1 puis B2 sont mesurées et consignées ; si elles échouent, la décision B3 est soumise à l'utilisateur, jamais appliquée.

**Décisions de l'utilisateur (2026-11-13) :**
- **Q1 = A.** Un essai de chauffe non compté (noté à part dans le rapport), puis 10 essais comptés.
- **Q2 = A.** Réussite = critères de la story. Plan B (B1 puis B2) seulement si le flux est mis en tampon ou si la médiane du premier morceau dépasse 5 s ; premiers morceaux entre 2 et 5 s : réserve consignée et présentée, sans B1.
- **Q3 = A.** Code et documents sur la branche pendant l'essai ; après validation, un commit **de documents seulement** sur `main` (spec, `docs/mesures/flux-vercel.md`, journal, `sprint-status.yaml`, `epic-5-context.md`), avec contrôle au moment du commit qu'aucun fichier de code ou de configuration de l'essai n'y passe (page, relais, fonction, `config.toml`, tests) ; puis suppression de la branche.
- **Story gardée entière.**
- **B2 (décision du 2026-11-13, après implémentation)** : `runtime = 'edge'` est impossible avec Cache Components (Next.js 16) ; B2 n'est pas préparé. On ne tranche que si la base et B1 échouent toutes les deux.
- **Commit de documents sur `main`** : il aligne aussi `docs/environnements.md` sur « `PROCESS_DOCUMENT_SECRET` en Production seulement ».
- `stream-probe` refuse un appel avec la seule clé publique (`apikey` ou `Authorization: Bearer <clé publique>`), sans jeton de Collaborateur : cas testé.
- Bilan : durée maximale du relais (`maxDuration`) et sa conformité aux limites de Vercel Hobby.

**Never:** code de l'essai sur `main` ; appel OpenAI ; accès aux Documents ou à toute table ; `service_role` ; désactivation de la protection Vercel ; jeton, cookie ou valeur de variable dans le chat, un fichier ou le rapport ; navigateur appelant l'Edge Function directement ; changement de l'application existante.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Essai nominal | Collaborateur connecté, variante de base | 20 morceaux, ~250 ms d'écart, premier < 2 s | — |
| Sans session (relais) | aucun cookie | 401 `UNAUTHENTICATED`, fonction non appelée | — |
| Sans jeton ou jeton invalide (fonction) | appel direct | 401 (passerelle ou fonction), aucun morceau | — |
| Flux mis en tampon | morceaux reçus d'un coup | essai non conforme (écart médian < 150 ms) | proposer B1 |
| Amont en échec | fonction 5xx ou injoignable | relais 502, essai « en échec » dans le tableau | — |
| Région autre que fra1 | `x-vercel-id` | essai signalé non représentatif | — |

</frozen-after-approval>

## Code Map

- `supabase/functions/semantic-search/index.ts:35-60` -- modèle : jeton `Bearer`, clé publique, vérification `/auth/v1/user`. Ne rien importer de `_shared/ai.ts`.
- `supabase/config.toml:446` -- section `[functions.semantic-search]` ; ajouter `[functions.stream-probe] verify_jwt = true` (branche seulement).
- `src/app/api/search/route.ts`, `src/server/search/semantic-search.ts` -- modèle de relais (session, jeton, URL `NEXT_PUBLIC_SUPABASE_URL` + `/functions/v1/...`, clé publique).
- `src/server/auth/require-user.ts`, `src/lib/supabase/server.ts` -- session et jeton.
- `vercel.json` -- `regions: ["fra1"]`, `buildCommand: npm run build:ci` (contrôle des secrets aussi sur la prévisualisation).
- `scripts/deploy-supabase.ts:145` -- forme de l'option `--remote=<réf>` de la CLI 3.
- `docs/environnements.md:51-65` -- lecture de `x-vercel-id` (dernier segment avant l'identifiant).
- `AGENTS.md` -- lire `node_modules/next/dist/docs/` (Route Handlers, flux, `maxDuration`, runtime Edge) avant d'écrire le relais.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/functions/stream-probe/index.ts`, `supabase/config.toml` -- fonction factice.
- [~] `src/server/stream-probe/relay.ts`, `src/app/api/stream-probe/route.ts`, `src/app/api/stream-probe-edge/route.ts` -- relais, variantes de base, B1, B2. Base et B1 faits ; B2 non créé (impossible avec Cache Components, voir Implementation Notes, décision attendue).
- [x] `src/lib/stream-probe.ts` -- calcul pur d'un essai (délais, écarts, verdict) et rendu Markdown.
- [x] `src/app/(app)/essai-flux/page.tsx` (+ composant client) -- page de mesure.
- [x] Tests : unitaires (fonction : 401, 20 événements, aucun import ni appel interdit ; relais : 401, en-têtes, B1 ; calcul et Markdown), intégration locale (flux réel sur Supabase local, arrivée progressive), e2e local (un essai complet affiché).
- [x] `docs/mesures/flux-vercel.md` -- rapport, rempli après les essais de l'utilisateur.

**Acceptance Criteria:**
- Given la prévisualisation de la branche, when l'utilisateur lance 10 essais depuis La Réunion, then le rapport donne pour chacun le premier morceau, les 20 délais, le verdict et `x-vercel-id`, et la conclusion (réussite, réserve ou plan B).
- Given la fin de l'essai validée, when le retrait est fait, then `stream-probe` n'apparaît plus dans `functions list` distant et aucun code de l'essai n'est sur `main`.

## Implementation Notes

- **Écart avec la spec, à trancher par l'utilisateur : B2 impossible tel quel.** Next.js 16 avec `cacheComponents: true` (configuration du projet) ne prend pas en charge l'export `runtime` d'un segment, et `runtime = 'edge'` est déprécié (`node_modules/next/dist/docs` : Route Segment Config, « Migrating to Cache Components »). `src/app/api/stream-probe-edge/route.ts` n'est donc pas créé ; seules la base et B1 sont déployées. B2 ne servirait qu'après l'échec de la base et de B1.
- **Fonction** `stream-probe` : clé publique seule (jeton `sb_…`) refusée sans appel à Auth ; tout autre jeton vérifié par `/auth/v1/user` (un jeton anon y est refusé) ; 20 événements `data: {"i","t"}` puis `event: done` ; arrêt si le relais annule. N'importe que `_shared/config.ts` et `_shared/errors.ts` (test des frontières).
- **Relais** : délai de 10 s jusqu'aux en-têtes de la fonction seulement ; l'abandon du navigateur annule l'appel amont ; `maxDuration = 60` (essai d'environ 5 s ; plafond de Vercel Hobby : 300 s).
- **Page** : un instant de réception par lecture du flux (des morceaux mis en tampon partagent donc le même instant) ; étalement côté fonction relevé à part pour distinguer un tampon de Supabase d'un tampon de Vercel ; le résultat Markdown donne la région tirée de `x-vercel-id`, pas l'identifiant complet.
- **Local** : nouvelle fonction servie après `supabase stop` puis `supabase start` (redémarrer le seul conteneur des fonctions ne suffit pas). Test de frontières : `src/server/stream-probe/relay.ts` ajouté aux appelants autorisés des Edge Functions (branche seulement).
- **Résultats** : `npm test` 1 304 réussis (78 fichiers) ; `lint` et `tsc` propres ; `build:ci` vert (`ƒ /api/stream-probe`) ; e2e de l'essai en local : chauffe + 10 essais, verdict « Réussite », relais sans session 401. Le message Windows « Assertion failed … UV_HANDLE_CLOSING » apparaît à l'arrêt du serveur de test, après les résultats, sans échec.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm test` (depuis PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npx playwright test tests/e2e/stream-probe.spec.ts` -- expected : vert.

**Manual checks:**
- Prévisualisation : 10 essais (plus la chauffe selon Q1), `x-vercel-id` en `fra1`, résultat copié dans le chat par l'utilisateur.

## Verification Results

- **Commit et déploiement (2026-11-13)** : `b0da814` commité sur la branche `probe/5-0-stream` ; `stream-probe` déployée par l'utilisateur (commande ciblée, `--remote=<réf>`, 6,7 kB) ; branche poussée, prévisualisation Vercel « Deployment has completed ».
- **Variables Vercel** (relevé de l'utilisateur) : `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en « Production and Preview » ; `PROCESS_DOCUMENT_SECRET` en Production seulement, laissé ainsi.
- **Mesure** (navigateur de l'utilisateur, La Réunion, variante de base, `docs/mesures/flux-vercel.md`) : **réussite, 10 essais conformes sur 10**. Premier morceau : médiane 760 ms, maximum 1 061 ms ; chauffe 1 550 ms. Écart médian 247 à 249 ms ; étalement reçu proche de l'étalement émis : pas de mise en tampon. Région `fra1` pour tous les essais. Essai 4 : morceaux 16 à 18 reçus groupés (5 256, 5 271, 5 271 ms) après un trou de 968 ms, émission régulière côté fonction : probable variation du réseau, sans effet sur le verdict. Ni B1 ni B3 ; B2 non tranché.
- **Retrait** : `stream-probe` supprimée par l'utilisateur, `functions list` réduit à `process-document` et `semantic-search` ; branche distante supprimée ; prévisualisation laissée, protégée (facultatif : la supprimer au tableau de bord).
- **`main`** : commit de documents seulement (spec, rapport, contexte de l'Epic 5, journal, `sprint-status.yaml`, `docs/environnements.md`), sans code ni configuration de l'essai.
- **Revue** : revue ciblée de l'IA seulement (story hors règle 11, aucun relecteur demandé) ; code de l'essai jamais livré en production Vercel.
