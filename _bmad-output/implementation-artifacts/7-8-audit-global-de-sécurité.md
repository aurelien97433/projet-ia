---
title: 'Story 7.8 : Audit global de sécurité'
type: 'chore'
created: '2026-11-25'
status: 'in-progress'
baseline_commit: '7fa6440'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/tests/bilan-anomalies.md'
  - '{project-root}/docs/tests/plan-de-tests.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-projet-ia-2026-11-03/architecture-nexamind-ai.md'
  - '{project-root}/docs/environnements.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** avant la mise en service, aucune revue n'a couvert tout le code d'un seul tenant. Chaque story a été relue isolément. Le bilan des anomalies (7.7) renvoie 5 points à cet audit, et deux risques d'architecture (AD-1 et AD-14) restent à revoir.

**Approach:** une revue complète avec `bmad-code-review` et plusieurs relecteurs indépendants, chacun sur une surface. Les constats sont triés, les anomalies hautes corrigées en local, les autres tranchées par l'utilisateur. Le rapport `docs/tests/audit-securite.md` est lisible par un jury.

## Boundaries & Constraints

**Always:**
- **Surfaces revues** (un relecteur par groupe) :
  1. Base : RLS des tables, droits `anon` et `authenticated`, fonctions SQL (`security definer`, `search_path` vide, `EXECUTE` limité, signatures uniques), vues (`security_invoker`), politiques du Storage (`supabase/migrations/`).
  2. Edge Functions : authentification de chaque fonction, secret de traitement, `service_role` limité, contenus encadrés dans les consignes (AD-13), délais et quotas (AD-14 à AD-16) (`supabase/functions/`).
  3. Next.js : Route Handlers, Server Actions, `proxy.ts`, frontière AD-1 (aucune Edge Function ni OpenAI depuis le navigateur), validation des entrées, refus sans session (D08) (`src/`).
  4. Affichage et injection : texte brut (AD-8), aucun HTML interprété depuis un Document ou une réponse, liens et URL signées, injection de consigne.
  5. Secrets et chaîne de build : `check:secrets`, `build:ci`, fichiers ignorés, scripts (`scripts/`), procédure de rotation (D19).
- **Points du bilan** : D08, D40, D19, D38 et R73-F13 reçoivent chacun un constat et une suite (corrigé, accepté ou reporté) ; les risques AD-1 et AD-14 sont réévalués.
- **Première tâche — contrôle des secrets** : depuis `7fa6440`, `check:secrets` signale l'URL publique de démonstration du README, car elle vaut `UJ2_LIVE_URL` dans `.env.seed`. Correction : la valeur de `UJ2_LIVE_URL` reste interdite partout sauf dans `README.md` (règle des URL du 2026-11-25), avec un test unitaire.
- **Gravité** : haute (fuite de données d'un autre Compte, contournement d'authentification ou du quota, secret exposé, exécution de code) ; moyenne (contournement limité, déni de service à faible coût) ; basse (durcissement).
- **Rapport** `docs/tests/audit-securite.md` : méthode, surfaces et relecteurs, tableau des constats (id, surface, description en une phrase, gravité, suite, preuve), points du bilan, risques restants. Le bilan des anomalies est mis à jour.
- Chaque correctif a son test. Vérification complète avant clôture : `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`.
- Aucun secret, e-mail, jeton ni URL de production dans le rapport.

**Ask First:** tout changement du code de l'application ou d'une migration ; classement d'un constat haut en « accepté » ; tout déploiement (`deploy:supabase`, push) ; tout test en production.

**Never:** modification ou test de la production sans accord ; commande destructrice sur une base (`db reset` compris) lancée par l'agent ; constat inventé ou gravité supposée sans lecture du code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Constat haut | relecteur | corrigé en local avec un test, ou décision écrite de l'utilisateur |
| Constat moyen ou bas | relecteur | suite décidée par l'utilisateur, inscrite au rapport |
| Faux positif | relecteur | écarté avec la raison au rapport |
| URL de démo dans le README | `check:secrets` | aucun constat |
| URL de production ailleurs | `check:secrets` | constat |

</frozen-after-approval>

## Code Map

- `supabase/migrations/*.sql`, `supabase/functions/**`, `src/app/**` (dont `src/app/api/`), `src/server/**`, `src/proxy.ts`, `src/components/**` (affichage), `scripts/check-secrets.ts`, `vercel.json`, `next.config.ts`.
- Nouveau : `docs/tests/audit-securite.md`. Mis à jour : `docs/tests/bilan-anomalies.md`.

## Tasks & Acceptance

**Execution:**
- [x] Correction de `check:secrets` (URL de démo autorisée dans `README.md` seulement) et test unitaire.
- [x] `bmad-code-review` : 5 relecteurs indépendants, un par surface, sur tout le code (pas seulement le dernier diff).
- [x] Triage des constats : vérification de chacun dans le code, faux positifs écartés.
- [x] Décisions de l'utilisateur ; correctifs des constats hauts et de ceux qu'il retient, chacun avec un test.
- [x] Rapport `docs/tests/audit-securite.md` et mise à jour du bilan.
- [ ] Vérification complète ; déploiement et `test:security:live` par l'utilisateur si un correctif touche la production.

**Acceptance Criteria:**
- Given le rapport, when je le lis, then chaque surface a été revue par un relecteur, et chaque constat a une gravité, une suite et une preuve.
- Given un constat haut, when la story est close, then il est corrigé et testé, ou accepté par une décision écrite de l'utilisateur.
- Given D08, D40, D19, D38 et R73-F13, when la story est close, then chacun a un constat et une suite.
- Given `npm run check:secrets`, when il s'exécute, then il passe avec l'URL de démo dans le README et échoue si elle apparaît ailleurs.

## Design Notes

Relecteurs séparés (règle 11) : aucun n'a écrit le code relu. Lecture seule de la production autorisée pour contrôler les droits (requêtes `select` sur le catalogue), comme en 5.8 et 5.9. **Estimation : 3 h à 4 h**, hors correctifs.

## Verification

**Commands:** `npm run check:secrets` ; `npm test` ; `npm run test:e2e` ; `npm run lint` ; `npx tsc --noEmit` ; `npm run build:ci`.

### Review Findings

Revue du 2026-11-25 : 5 relecteurs indépendants (S1 base, S2 Edge Functions, S3 Next.js, S4 affichage et injection, S5 secrets et build). Aucun n'a trouvé de fuite de données d'un autre Compte, de contournement d'authentification ni de secret exposé. Constats vérifiés par Claude dans le code ; gravités recalculées au triage.

- [x] [Review][Decision] R1 (haute) Verrou du Résumé contournable — `begin_summary` et `end_summary` sont exécutables par `authenticated` (`20261123100000_summary_lock.sql:59-60`). Un Collaborateur libère le verrou lui-même et lance N Résumés en parallèle : les N−1 écritures perdues rendent leur unité (`summarize/index.ts:371`, règle de la 6.1) alors que la génération est facturée. Dépense hors quota, jusqu'au crédit du fournisseur. Il peut aussi bloquer le Résumé de tous les Documents en prenant le verrou en boucle (409, sans coût). Sources : S2-1, S2-2, S1-2.
- [x] [Review][Decision] R2 (moyenne) Plafond global vidé sans coût — `reserve_ai_call` exécutable par `authenticated` (`20261116090000_chat.sql:150`) : 5 Comptes × 60 réservations directes = 300, l'Assistant et le Résumé refusent tout le monde jusqu'à minuit UTC. Sources : S1-1, S2-3 (AD-14).
- [x] [Review][Decision] R3 (moyenne) Aucune limite de volume par Compte — Notes, Conversations, messages et dépôts Storage (y compris en direct, politique `20261112100000_file_import.sql:32`) ; fichiers déposés jamais purgés. Remplissage de la base ou du Storage du plan gratuit. Sources : S1-3, S3-2, D40, D38.
- [x] [Review][Decision] R4 (moyenne) Vectorisation hors quota — Recherche (`semantic-search/index.ts:139`), création, modification et relance des Documents (`process-document`) appellent OpenAI sans réservation ni limite de débit. Coût unitaire faible, mais sans borne ; risque sur les limites de débit OpenAI partagées avec l'Assistant. Sources : S1-4, S2-4, S2-5, S3-1.
- [x] [Review][Decision] R5 (basse à moyenne) Caractères Unicode invisibles et bidi jamais retirés — une consigne invisible au Lecteur part au modèle ; un titre avec U+202E inverse l'affichage voisin. Sources : S4-1, S4-3.
- [x] [Review][Patch] R6 (moyenne) Secret de traitement en Preview dans le script de rotation, contraire à la doc [scripts/setup-seed-env.ps1:212] (S5-3)
- [x] [Review][Patch] R7 (moyenne) Procédure manuelle de rotation lancée depuis la racine, sans `--workdir` ni `--remote` : pose les variables de simulation en production [docs/environnements.md:107-114] (S5-2)
- [x] [Review][Patch] R8 (basse) Copie du secret par le presse-papiers sans nouvel essai ni vérification (D19) [scripts/setup-seed-env.ps1:209] (S5-7)
- [x] [Review][Patch] R9 (basse) Aucun en-tête de sécurité : `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` [next.config.ts] (S5-1, S4-4, S3-4)
- [x] [Review][Patch] R10 (basse) Limite des Server Actions à 2 Mo, justifiée par l'ancienne limite de 1 Mo [next.config.ts] (S3-7)
- [x] [Review][Patch] R11 (basse) Focus perdu : `skipNextTitleFocus` reste posé après un clic sur l'entrée de la page courante du menu mobile (R73-F13) [src/components/shell/title-focus.ts:8] (S4)
- [x] [Review][Defer] R12 Bornes de `match_passages` (paramètres libres, coût borné par le délai de 8 s) [20261110090000_match_passages.sql:8] — deferred: basse, demande une migration
- [x] [Review][Defer] R13 Limites de l'Auth appliquées à l'IP de sortie de Vercel (S3-3) — deferred: moyenne non vérifiée ; à trancher en lisant les limites Auth du projet distant
- [x] [Review][Defer] R14 Fonctions locales `ai-health` et `measure-embed` exclues par liste seulement (S2-7, S5-4) — deferred: basse ; vérifier une fois, en lecture seule, la liste des fonctions distantes
- [x] [Review][Defer] R15 `display_name` = partie locale de l'e-mail, lisible par tous (S1-6) — deferred: basse, vie privée ; changement de l'inscription après la démo
- [x] [Review][Defer] R16 Injection réussie persistante dans le Résumé partagé (S4-2) — deferred: risque résiduel d'AD-13, à mesurer en 7.9
- [x] [Review][Defer] R17 Motifs absents de `check:secrets` (`sbp_`, `postgres://…@`, `ghp_`) (S5-5) — deferred: basse ; les tests contiennent des valeurs fictives à composer d'abord
- [x] [Review][Defer] R18 Procédures de rotation absentes pour `SUPABASE_SERVICE_ROLE_KEY`, mots de passe des Comptes, base et révocation après fuite — deferred: guide de reprise (7.6)

**Points du bilan.** D08 : fermé (proxy sans redirection pour `next-action`, `requireUser` refuse avant toute écriture dans les 4 actions). D40, D38 : R3. D19 : R8. R73-F13 : R11 (accessibilité, pas sécurité). AD-1 : respectée côté navigateur ; l'appel direct des RPC `begin_summary`, `end_summary` et `reserve_ai_call` donne plus que l'interface (R1, R2). AD-14 : R2 et R4.

**Rejetés.** S1-5 (colonnes internes lisibles : aucune exploitation, rien ne se fie au seul `attempt_id`) ; S1-8 (course import/suppression : limitée au propre Document) ; S3-5 (CSRF : cookie `SameSite=Lax` vérifié) ; S3-6 (flux non revalidé : source de confiance, testée) ; S3-8 (`getClaims` sans révocation : comportement de PostgREST, accepté) ; S4-5 (entités recopiées : qualité, pas sécurité) ; S4-6 (`?question=` : rien n'est envoyé sans clic) ; S5-6 (URL de démo comparée exactement : publique) ; S5-8 (`db push --yes` : décision documentée) ; S5-9 (clé service_role locale : sans valeur en production).

**Décisions de l'utilisateur (2026-11-25).**
- R1 et R2 : oui. Une seule migration : accès direct retiré à `begin_summary`, `end_summary`, `reserve_ai_call` et `release_ai_call` ; appel par `service_role` avec l'identifiant vérifié de l'utilisateur. Même discipline : drop des anciennes signatures si besoin, grants explicites, `search_path` vide, tests d'intégration (un Collaborateur reçoit 42501 en appel direct). Unité gardée dès que la génération est facturée (modifie la règle de la 6.1) : note datée dans AD-14 et AD-18.
- R3 : A (accepté pour la démo, surveillance de l'espace au tableau de bord). R4 : A (accepté, le crédit prépayé de 10 $ reste la borne). Décisions écrites dans `docs/tests/audit-securite.md` et dans les limites connues de `docs/demarche-vibe-coding.md`.
- R5 : A (caractères invisibles et bidi retirés dans `escapeContent` et `escapeTitle` seulement).
- R6 à R11 : oui. En-têtes : vérifier dans la suite e2e qu'ils ne cassent ni la Source, ni le Lecteur, ni le flux de l'Assistant.
- Fin : vérification complète d'un seul tenant (`db reset` lancé par l'utilisateur), puis commit. Déploiement : `deploy:supabase` par l'utilisateur, contrôle distant des droits en lecture seule, push, puis `test:security:live`, `test:chat:live` et `test:summary:live` par l'utilisateur.

**Mise en œuvre (2026-11-27).** R1 et R2 : migration `20261127090000_service_only_quota.sql` (anciennes signatures supprimées ; `p_user_id` ajouté ; `EXECUTE` à `service_role` seul), `chat` et `summarize` passent l'identifiant renvoyé par `/auth/v1/user` ; écriture de Résumé perdue → unité consommée ; notes datées dans AD-2, AD-14 et AD-18. R5 : `stripInvisible` (\p{Cf} et sélecteurs de variante) dans `escapeContent` et `escapeTitle`. R6 à R8 : `setup-seed-env.ps1` (`Copy-Verified`, Production seulement) et `docs/environnements.md` (`--workdir`, `--remote`). R9 et R10 : `next.config.ts`. R11 : `nav-links.tsx`, `mobile-nav.tsx`. **Ajout hors décision, signalé à l'utilisateur :** le cas d'origine de R73-F13 (navigation avant que le premier titre décide, machine lente) est corrigé aussi, dans `title-focus.ts` (adresse relevée au chargement du module), avec un test. Échec du test sans le correctif vérifié pour R11 et R73-F13. Rapport : `docs/tests/audit-securite.md` ; bilan, plan de tests, dossier et README mis à jour.
