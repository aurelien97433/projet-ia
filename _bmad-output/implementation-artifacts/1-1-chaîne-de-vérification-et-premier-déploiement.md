---
title: 'Story 1.1 : Chaîne de vérification et premier déploiement'
type: 'chore'
created: '2026-11-04'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ebf4d22404ff1fb913c6052147a7a6499439fe7d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le projet Next.js + Supabase existe mais n'a ni tests, ni contrôle des secrets, ni configuration Supabase locale, ni déploiement : aucune story suivante ne peut être vérifiée ni livrée en ligne sans risque d'exposer une clé.

**Approach:** Installer l'outillage (CLI Supabase, Vitest, Playwright, tsx), initialiser `supabase/`, écrire `check-env`, `check-secrets` et `deploy-supabase`, brancher `check-secrets` avant et après `next build` dans le build Vercel (région `fra1`), et ouvrir `docs/environnements.md` et `docs/journal-vibe-coding.md`.

## Boundaries & Constraints

**Always:** aucune valeur secrète dans un fichier suivi, un document ou la conversation ; l'utilisateur saisit lui-même mots de passe et clés dans son terminal. Versions : Supabase CLI 3.0.0, Vitest 5.1.0, @playwright/test 1.64.1, @axe-core/playwright 4.14.0. `supabase/config.toml` contient `[edge_runtime] policy = "per_worker"`. `vercel.json` : `"regions": ["fra1"]`. La simple mention d'un nom de secret n'est jamais une erreur. Décision du 2026-11-04 : la clé publique Supabase (`sb_publishable_…` ou JWT de rôle `anon`/`authenticated`) n'est jamais bloquée ; les clés `sb_secret_…`, les affectations de `SUPABASE_SERVICE_ROLE_KEY` et tout JWT de rôle `service_role` sont refusés. Aucune valeur détectée n'est affichée, seulement le fichier, la ligne et le type de clé.

**Never:** pousser un faux secret réaliste sur GitHub ; écrire une fausse clé réaliste telle quelle dans le dépôt (les tests la construisent à l'exécution) ; toucher à l'interface (story 1.2), à l'authentification (1.3, 1.4) ou créer une migration ; committer ou pousser sans accord explicite.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dépôt sain | fichiers suivis actuels, docs citant les motifs | `check:secrets` code 0 | — |
| Clé OpenAI | fichier contenant `sk-` + ≥ 20 caractères | échec, fichier et ligne affichés, valeur masquée | code 1 |
| JWT `service_role` | jeton `eyJ…` dont la charge utile décodée a `role` = `service_role` | échec, valeur jamais affichée | code 1 |
| JWT public | jeton `eyJ…` de rôle `anon` ou `authenticated` (clé publique Supabase, y compris dans `.next/static`) | succès | — |
| Clé Supabase secrète | `sb_secret_` + caractères | échec | code 1 |
| Affectation | `OPENAI_API_KEY=abc…` (idem `SUPABASE_SERVICE_ROLE_KEY`, `PROCESS_DOCUMENT_SECRET`) | échec | code 1 |
| Nom sans valeur | `OPENAI_API_KEY=` vide, `process.env.OPENAI_API_KEY`, chaîne `sk-` isolée | succès | — |
| Motif témoin | `NEXAMIND_CANARY_DO_NOT_DEPLOY=<valeur>` | échec | code 1 |
| Bundle | mode `--static` sur `.next/static` | mêmes règles sur le code envoyé au navigateur | code 1 si trouvé |
| Pas de `.git` (Vercel) | `git ls-files` indisponible | parcours du disque hors `node_modules`, `.next`, `.git`, `.vercel`, `.env*` | — |
| Outil absent | `docker` ou `supabase` introuvable (simulé) | message nommant l'outil, code 1 | — |

</frozen-after-approval>

## Code Map

- `package.json` -- ajouter scripts `test`, `test:e2e`, `check:env`, `check:secrets`, `build:ci`, `deploy:supabase` et devDependencies ; ne pas changer les versions existantes.
- `next.config.ts` -- à ne pas modifier dans cette story (`bodySizeLimit` arrive en 2.2).
- `src/proxy.ts`, `src/lib/supabase/*` -- existants, à ne pas toucher ; lisent `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `src/app/page.tsx` -- page d'accueil actuelle, cible du test de fumée (remplacée en 1.2).
- `.gitignore` -- `.env*` déjà ignoré (y compris `supabase/functions/.env`), `!.env.example` ; ajouter `/test-results`, `/playwright-report`, `/supabase/.temp`, `/supabase/.branches`.
- `.env.example` -- ne contient que les deux variables publiques ; à compléter.
- `.env.local` -- non suivi, contient l'URL du projet distant (référence `lkjjtcfegplipalraqml`, non secrète) ; ne jamais l'afficher en entier.
- Fichiers suivis : 275, dont `_bmad/` et `_bmad-output/` ; les docs citent le motif témoin sans `=` et les motifs de clés sous forme d'expressions, sans valeur.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- installer `supabase@3.0.0`, `vitest@5.1.0`, `@playwright/test@1.64.1`, `@axe-core/playwright@4.14.0`, `tsx` en devDependencies ; scripts listés ; `build:ci` = `check:secrets && next build && check:secrets -- --static` -- un seul point d'entrée pour Vercel et le local.
- [x] `supabase/config.toml` -- `npx supabase init`, puis `[edge_runtime] policy = "per_worker"` -- prérequis AD-5.
- [x] `scripts/check-env.ts` -- vérifie `docker info` et la version de la CLI via un exécuteur injectable ; message « Docker OK · Supabase CLI 3.0.0 OK » ou outil manquant nommé, code 1 -- testable par simulation.
- [x] `scripts/check-secrets.ts` -- motifs de la matrice, liste des fichiers via `git ls-files` sinon parcours du disque, fichiers binaires ignorés, mode `--static`, sortie fichier:ligne avec valeur masquée -- cœur de NFR-2.
- [x] `scripts/deploy-supabase.ts` -- `supabase db push`, puis `supabase functions deploy` seulement si une fonction (hors `_shared`) existe -- réussit même sans rien à déployer.
- [x] `tests/unit/check-secrets.test.ts`, `tests/unit/check-env.test.ts`, `vitest.config.ts` -- toute la matrice ; fausses clés construites à l'exécution.
- [x] `playwright.config.ts`, `tests/e2e/smoke.spec.ts` -- serveur `npm run dev`, la page d'accueil répond et affiche un `h1`.
- [x] `vercel.json` -- `regions: ["fra1"]`, `buildCommand: "npm run build:ci"`.
- [x] `.env.example`, `.gitignore` -- tous les noms du tableau des secrets sans valeur ; artefacts de test ignorés.
- [x] `docs/environnements.md`, `docs/journal-vibe-coding.md` -- environnements, régions, prérequis cochés, noms des secrets sans valeur ; entrée de la story 1.1.

**Acceptance Criteria:**
- Given Docker démarré, when `npx supabase start` puis `npm test`, then Supabase local démarre et Vitest passe.
- Given un fichier non suivi contenant une fausse clé générée, when `npm run build:ci`, then le build échoue à `check:secrets` avec fichier et ligne.
- Given `.env.local`, when `git status`, then il est ignoré.
- Given Vercel relié au dépôt, when un push sur `main` (après accord), then le build exécute `check:secrets` avant et après `next build` et déploie en HTTPS dans `fra1` ; une branche temporaire contenant seulement le motif témoin produit un build refusé, puis est supprimée en local et à distance.
- Given le projet lié (`supabase link`, mot de passe saisi par l'utilisateur), when `npm run deploy:supabase`, then il réussit sans rien à déployer.

## Spec Change Log

## Review Triage Log

Revue du 2026-11-04 : trois relecteurs (sans contexte, cas limites, vérifications manquantes).

| # | Remarque | Verdict | Preuve | Suite |
|---|---|---|---|---|
| 1 | `const OPENAI_API_KEY = Deno.env.get(...)` signalé à tort | medium | reproduit : 1 constat sur ce code | patch |
| 2 | Nom préfixé (`NEXT_PUBLIC_…`) non détecté | medium | reproduit : 0 constat | patch |
| 3 | Syntaxe `:` (YAML, JSON) non détectée | medium | reproduit : 0 constat | patch |
| 4 | Motif témoin entre guillemets non détecté | medium | reproduit : 0 constat | patch |
| 5 | Valeur exacte d’un secret sans format (PROCESS_DOCUMENT_SECRET) non cherchée dans le bundle | medium | aucun motif ne la couvre | patch (valeurs de l’environnement) |
| 6 | Fichiers ignorés en silence (binaires, > 10 Mo, UTF-16) | low | `scanFiles` sans compte rendu | patch (liste affichée, UTF-16 décodé) |
| 7 | `main()`, codes de sortie et `--static` non testés | medium | aucun test ne lance le script | patch (tests en ligne de commande) |
| 8 | Chemin `git ls-files --others` non testé | medium | seul le repli disque était couvert | patch (test avec dépôt git) |
| 9 | AC1 : rien ne teste Supabase local | medium | `tests/integration` vide | patch (test de l’API locale) |
| 10 | `docker info` sans délai | low | `spawnSync` sans `timeout` | patch (60 s ; binaire local, npx prenait 31 s) |
| 11 | Version de CLI mal lue avec un avis de mise à jour | low | dernier mot pris | patch (premier numéro) |
| 12 | `listFunctions` : dossiers cachés ou sans `index.ts` | low | filtre sur `_` seulement | patch |
| 13 | `reuseExistingServer: true` en CI | low | config | patch (`!process.env.CI`) |
| 14 | Garde `main()` sensible à la casse sous Windows | low | comparaison stricte | patch (insensible à la casse sous win32) |
| 15 | `maxBuffer` de `git ls-files` | low | 1 Mo par défaut | patch |
| 16 | Node non épinglé | low | pas d’`engines` | patch (`24.x`) |
| 17 | `minimum_password_length = 6`, `site_url` en 127.0.0.1 | low | `config.toml` généré | patch (8 ; localhost:3000) |
| 18 | Install Chromium non documentée | low | docs | patch |
| 19 | Pages prérendues (`.next/server/app`) non contrôlées | medium | hors `.next/static` | defer |
| 20 | `supabase` (postinstall) téléchargé à chaque build Vercel | maybe-false | dépend des scripts autorisés par npm sur Vercel | defer |
| 21 | `.env.local` partagé avec le script de préchargement : la clé service_role entrerait dans l’environnement serveur de Next.js | medium | AD-20 nomme ce fichier | defer (décision d’architecture) |
| 22 | `major_version = 17` non comparé au projet distant | maybe-false | `supabase link` le signalera | defer |
| 23 | Exemple `OPENAI_API_KEY=abc…` de la matrice accepté | low | valeur élidée ; toute valeur réelle (≥ 8 car.) est refusée | reject |
| 24 | `sb_secret_` court (< 8) accepté | low | les vraies clés sont longues | reject |
| 25 | Liens symboliques, `EACCES`, `GIT_DIR`, tmpdir dans un dépôt | low | cas improbables, garde coûteuse | reject |
| 26 | Listes d’exclusion différentes de `.gitignore` | low | dossiers absents sur Vercel | reject |
| 27 | `@axe-core/playwright` inutilisé | false | prévu pour la story 1.2 | reject |
| 28 | `db push` sans confirmation | false | la CLI demande confirmation | reject |
| 29 | `supabase/.temp/project-ref` interne à la CLI | low | message clair si absent | reject |
| 30 | Statut `in-review` contre `in-progress` | false | synchronisé en fin de workflow | reject |

## Design Notes

Le motif témoin n'est reconnu que sous forme d'affectation (`NEXAMIND_CANARY_DO_NOT_DEPLOY=…`) : les documents qui le citent restent valides, et la branche de test ne contient aucune donnée sensible. Sur Vercel, le dépôt est cloné sans `.git` utilisable de façon garantie : le parcours du disque sert de repli, avec les mêmes exclusions que `.gitignore` pour les dossiers générés.

## Verification

**Commands:**
- `npm run check:env` -- expected: « Docker OK · Supabase CLI 3.0.0 OK »
- `npm test` -- expected: 0 échec
- `npm run check:secrets` -- expected: code 0
- `npm run build:ci` -- expected: succès ; échec avec un fichier piégé non suivi
- `npm run test:e2e` -- expected: test de fumée vert
- `npm run lint` -- expected: 0 erreur

**Manual checks (if no CLI):**
- Après accord : URL Vercel en HTTPS, région `fra1` dans les détails du déploiement, build de la branche témoin en échec.

## Implementation Notes

- `@types/node` passé de `^20` à `24.19.2` : Vitest 5.1 exige `@types/node` 22 ou plus ; Node 24 est installé.
- `vitest.config.mts` au lieu de `.ts` : évite l'avertissement de Vite sur le chargement ESM d'un projet sans `"type": "module"`. Un test `tests/unit/deploy-supabase.test.ts` couvre `listFunctions`.
- `git ls-files --cached --others --exclude-standard` : les fichiers non suivis mais non ignorés sont contrôlés (ils pourraient être commités), ce que demande le critère du fichier piégé.
- Règle d'affectation resserrée après un premier passage (4 faux positifs sur des exemples de documentation) : valeur d'au moins 8 caractères de type clé ; motif témoin reconnu seulement avec une valeur alphanumérique.
- `supabase/config.toml` : `per_worker` est la valeur par défaut de la CLI 3.0.0 ; `[analytics] enabled = false`, car le conteneur Logflare ne devient pas sain sous Windows et bloquait `supabase start`. `supabase/.gitignore` (généré) ignore `.temp` et `.branches`.
- Commandes lancées via le shell en une seule chaîne constante (exécutables `.cmd` de Windows) : supprime l'avertissement DEP0190 de Node.
- Vérifié en local : `npm test` 19/19 avec Supabase local démarré, `check:secrets` vert (290 fichiers), `build:ci` vert puis en échec avec un fichier piégé non suivi (supprimé ensuite), `--static` vert (23 fichiers), `test:e2e` 1/1, `lint` 0 erreur, `check:env` OK.
- Restent à faire par l'utilisateur, après accord : `supabase link` (mot de passe saisi dans son terminal), `npm run deploy:supabase`, import du projet Vercel et variables publiques, push sur `main`, branche témoin.

**Critères d'acceptation en attente (actions de l'utilisateur) :** AC4 (push sur `main`, déploiement HTTPS en `fra1`, branche témoin refusée puis supprimée) et AC5 (`supabase link`, puis `npm run deploy:supabase`). La story reste `in-review` jusqu'à leur vérification ; elle passera à `done` ensuite.

**Vérifications distantes (2026-11-04) :**
- `supabase link` et `npm run deploy:supabase` réalisés par l'utilisateur, avec succès.
- Commit `3229aaf46034377d396ba1039b3a1d21339aef70` poussé sur `main` : statut Vercel `success` (« Deployment has completed »).
- Les URL Vercel du projet sont protégées par l'authentification Vercel, donc la région et les journaux de build restent à confirmer par l'utilisateur.
- Branche `test/check-secrets` (commit `e993f33dcd484e753dcd862b2707621b2e79d727`, seulement le motif témoin, avec une valeur) : statut Vercel `failure`. Le contrôle local la refuse aussi (« motif témoin »). La branche est supprimée en local et à distance.
- Confirmé par l'utilisateur dans les journaux Vercel : le build de `3229aaf` affiche deux fois `check:secrets` sans secret détecté ; le build de `test/check-secrets` échoue sur `canary-check-secrets.txt:1`, valeur masquée.
- Région : la Function Region du projet Vercel affichait `iad1` (badge « Overridden »), bien que `vercel.json` définisse `fra1` ; l'utilisateur l'a réglée sur Frankfurt `fra1` dans le tableau de bord. Un nouveau déploiement doit le confirmer.
