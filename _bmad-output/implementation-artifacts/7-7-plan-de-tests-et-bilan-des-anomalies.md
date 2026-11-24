---
title: 'Story 7.7 : Plan de tests et bilan des anomalies (synthèse)'
type: 'chore'
created: '2026-11-24'
status: 'done'
baseline_commit: 'a4db428db031fe9d9d766bbcf0a153216875f713'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-projet-ia-2026-11-03/architecture-nexamind-ai.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-projet-ia-2026-11-02/prd.md'
  - '{project-root}/docs/environnements.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** avant la publication, le porteur du produit et le jury doivent voir d'un coup d'œil ce qui est vérifié et ce qui reste ouvert. Les tests existent (22 e2e, 85 unitaires, 21 d'intégration, scripts live, rapports `docs/mesures/`), mais aucun document ne les relie aux parcours et aux risques, et les 85 entrées de `deferred-work.md` mêlent reports traités et ouverts.

**Approach (mode synthèse, décision de l'utilisateur du 2026-11-24) :** deux documents courts, rédigés à partir de l'existant, sans nouveau test sauf vrai trou. `docs/tests/plan-de-tests.md` et `docs/tests/bilan-anomalies.md`, lisibles par un jury. Le bilan sert de liste d'entrée à l'audit de sécurité (7.8).

## Boundaries & Constraints

**Always:**
- **`docs/tests/plan-de-tests.md`** (cible : 2 à 3 pages) :
  - un tableau par parcours UJ-1, UJ-2, UJ-3 : étape du parcours (PRD §2) → test(s) qui la couvrent, avec fichier et niveau (unitaire, intégration, e2e local, live en production, manuel) ;
  - un tableau des risques : les « Risque restant » des décisions d'architecture (AD-1 à AD-21) et les risques des indicateurs SM-1 à SM-6 → test(s) ou mesure qui les couvrent, ou « non couvert » avec la raison ;
  - les commandes de test (`docs/environnements.md`) en une liste : quoi, où (local ou production), qui lance (agent ou utilisateur), coût ;
  - chaque référence pointe vers un fichier qui existe (chemin relatif cliquable) ; aucun test cité sans avoir vérifié qu'il existe et ce qu'il vérifie.
- **`docs/tests/bilan-anomalies.md`** :
  - une ligne par anomalie : identifiant court, description en une phrase, gravité (haute, moyenne, basse), origine (story, revue, mesure), suite (corrigée, reportée, acceptée), état (fermée, ouverte), preuve (commit, test ou rapport) ;
  - toutes les entrées de `deferred-work.md` sont classées : « Traité en story… » = fermée ; les autres = ouvertes, avec la story ou la décision qui les porte (7.8, après la démo, acceptée) ;
  - les anomalies relevées pendant les mesures (rapports `docs/mesures/`) et les revues de l'Epic 7 (7.2, 7.2b, 7.3) y figurent ;
  - en tête : nombre d'anomalies ouvertes par gravité, et la liste des ouvertes à traiter par la 7.8 (sécurité) ;
  - aucune anomalie haute ouverte sans décision écrite.
- **Vrai trou** : une étape d'un parcours ou un risque de gravité haute sans aucun test ni mesure. Il est signalé dans le plan ; un test n'est ajouté que si son absence est un vrai trou ET qu'il tient en moins de 30 minutes ; sinon il est inscrit au bilan comme ouvert.
- Rédaction en français, phrases courtes, sans jargon inutile (lecteur : jury) ; aucun secret, e-mail, jeton ni URL de production.

**Ask First:** tout nouveau test qui dépasse 30 minutes ; tout changement du code de l'application ; tout reclassement d'une anomalie haute en « acceptée ».

**Never:** modification de `deferred-work.md` (le bilan le lit, il ne le réécrit pas) ; test lancé en production ; anomalie inventée ou état supposé sans preuve.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Entrée « Traité en story… » | `deferred-work.md` | fermée, avec la story et la preuve |
| Entrée sans traitement | `deferred-work.md` | ouverte, avec la story ou la décision qui la porte |
| Étape de parcours couverte | UJ-1 à UJ-3 | test, fichier, niveau |
| Risque sans test | AD « Risque restant » | « non couvert » et la raison, ou trou signalé |
| Anomalie haute ouverte | bilan | décision écrite, jamais muette |

</frozen-after-approval>

## Code Map

- `docs/tests/plan-de-tests.md`, `docs/tests/bilan-anomalies.md` (nouveaux).
- Sources : `tests/e2e/*.spec.ts`, `tests/unit/`, `tests/integration/`, `scripts/*-live.ts`, `scripts/measure-*.ts`, `docs/mesures/*.md`, `_bmad-output/implementation-artifacts/*.md` (Review Triage Log des specs), `deferred-work.md`, PRD §2 et SM, architecture §2 (AD).

## Tasks & Acceptance

**Execution:**
- [x] `docs/tests/plan-de-tests.md` (parcours, risques, commandes).
- [x] `docs/tests/bilan-anomalies.md` (toutes les entrées de `deferred-work.md` classées, anomalies des mesures et des revues de l'Epic 7, en-tête chiffré, liste pour la 7.8).
- [x] Vrais trous : signalés ; test ajouté seulement s'il tient en moins de 30 minutes.
- [x] Revue ciblée par Claude : chaque fichier cité existe ; échantillon de 10 lignes du bilan recoupé avec leur preuve.

**Acceptance Criteria:**
- Given `docs/tests/plan-de-tests.md`, when je le lis, then chaque parcours UJ-1 à UJ-3 et chaque risque identifié sont reliés à leurs tests avec leur niveau, ou marqués « non couvert » avec la raison.
- Given `docs/tests/bilan-anomalies.md`, when je le lis, then chaque anomalie indique sa gravité, sa suite et son état, y compris les reports encore ouverts de `deferred-work.md`, et l'en-tête donne les ouvertes par gravité et la liste pour la 7.8.
- Given un vrai trou, when le plan est écrit, then il est signalé, et soit couvert par un test court qui passe, soit inscrit au bilan.

## Design Notes

Mode synthèse : l'Epic 7 a déjà ajouté les tests de parcours (6.2, 7.3) ; `bmad-qa-generate-e2e-tests` n'est pas relancé. Revue ciblée par Claude (documents seulement). **Estimation : 1 h 30 à 2 h.**

## Verification

**Commands:** `npm run check:secrets` ; contrôle que chaque chemin cité existe ; si un test est ajouté, son fichier et `npm run lint`, `npx tsc --noEmit`.

## Clôture (2026-11-24)

- `docs/tests/plan-de-tests.md` : UJ-1 à UJ-3 étape par étape, risques AD-1 à AD-21 et SM-1 à SM-6, 15 commandes ; non couverts : AD-3, AD-7, AD-21, AD-14 (Comptes jetables). Aucun vrai trou : aucun test ajouté.
- `docs/tests/bilan-anomalies.md` : 85 entrées de `deferred-work.md` (D01 à D85) et constats de l'Epic 7 ; ouvertes : 0 haute, 6 moyennes, 36 basses (22 acceptées) ; fermées : 71. Liste pour la 7.8 : D08, D40, D19, D38, R73-F13, risques AD-1 et AD-14. N1, D37, M3 pour la 7.5 ; D46 pour la 7.9.
- Choix de l'implémenteur, gardé : 24 entrées non marquées « Traité » fermées sur preuve (liste dans le bilan). Gravités à relire par l'utilisateur.
- Revue ciblée par Claude (documents seulement, sans relecteur séparé, décision de l'utilisateur) : liens vérifiés, en-tête recalculé, recoupement de plus de 10 lignes avec leur preuve ; `check:secrets` propre.
