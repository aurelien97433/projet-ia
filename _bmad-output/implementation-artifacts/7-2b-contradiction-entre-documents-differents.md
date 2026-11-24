---
title: 'Story 7.2b : Contradiction signalée seulement entre Documents différents'
type: 'fix'
created: '2026-11-24'
status: 'done'
baseline_commit: '01d70e6eaa29c86d04f41a1cdb7ea4d31bf8a575'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/supabase/functions/_shared/rag/prompt.ts'
  - '{project-root}/scripts/test-followup-live.ts'
  - '{project-root}/scripts/test-chat-live.ts'
  - '{project-root}/scripts/measure-all.ts'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** au premier tour de f2 (`measure:all` du 2026-11-24, `docs/mesures/indicateurs.md`), l'Assistant donne la règle des 2 semaines et l'exception des 5 jours (congés de moins de 3 jours ouvrés), puis ajoute « Les Documents ne concordent pas : 2 semaines[S1], 5 jours[S1] », alors que les deux valeurs viennent d'un seul Document (Procédure congés et absences). Visible pendant la démonstration d'UJ-3. Cause : la consigne de `CHAT_SYSTEM_PROMPT` (`supabase/functions/_shared/rag/prompt.ts`) parle de « plusieurs Passages » qui donnent des valeurs différentes, sans exiger des Documents différents.

**Approach:** une règle dans `CHAT_SYSTEM_PROMPT` : une contradiction ne se signale qu'entre Passages de Documents différents ; une règle et son exception, ou deux cas distincts, dans un même Document ne sont pas une contradiction. Le titre du Document est déjà transmis avec chaque Passage (`<passage id="P{n}" document="{titre}">`, `buildChatMessages`) : aucun autre changement de code de l'application. Test unitaire, `deploy:supabase` (fonction `chat`), rejeu ciblé.

## Boundaries & Constraints

**Always:**
- Seul le paragraphe « Avant de répondre, comparez les Passages… » de `CHAT_SYSTEM_PROMPT` change ; il garde : ne jamais choisir une valeur, donner chaque valeur avec sa citation dès la réponse directe, l'exemple « Les Documents ne concordent pas : X[P1], Y[P3]. ». Ajout : la comparaison porte sur des Passages dont l'attribut `document` diffère ; pour un même Document, une règle et son exception (ou deux cas distincts) sont données chacune avec son cas et sa citation, sans phrase d'écart.
- `REFUSAL_SYSTEM_PROMPT`, `buildChatMessages`, le marqueur, les citations : inchangés.
- Test unitaire (`tests/unit/prompt.test.ts`) : la consigne mentionne les Documents différents et le cas d'un même Document ; l'exemple de contradiction est conservé ; les deux assertions de texte exact existantes sont mises à jour.
- **Rejeu en production, après `deploy:supabase` et push, lancé par l'utilisateur, un passage :**
  - `npm run test:chat:live` complet, inchangé dans son déroulé (q1, p1, h1, o1, c1, 3 essais chacun = 15 questions). Critère ajouté : chaque essai de c1 contient « ne concordent pas » (après normalisation), en plus de 15 et 21 jours et des deux Sources ; le reste inchangé et vert.
  - `npm run test:followup:live -- --only=f2,f4` : scénarios f2 et f4 du **Jeu complet** (`demo/jeu-demonstration.json`, critères de `buildFollowUpScenarios` de `measure-all.ts`), **un essai chacun** (4 questions). f2 : premier tour avec « 2 semaines », Source « Procédure congés et absences », et **sans** « ne concordent pas » (bloquant) ; second tour « responsable d'équipe ». f4 : second tour avec « 5 jours », Source « Procédure congés et absences ». Sans `--only`, le script est inchangé (f1, f3, i1 du mini Jeu, 3 essais). `--only` n'accepte que des identifiants de f1 à f5 du Jeu complet ; tout autre identifiant arrête le script avant tout appel.
  - Compte de mesure 1 pour les deux (19 unités, environ 0,11 $) ; rapports existants (`assistant-live.md`, `suivi-live.md`) jamais écrasés (`-2`, `-3`…).

**Ask First:** échec d'un critère du rejeu : les textes sont montrés à l'utilisateur, **sans reformuler la consigne une seconde fois** ; toute autre modification des consignes.

**Never:** consigne reformulée après un échec sans accord ; seuil, Documents, Passages ou quota modifiés ; rejeu lancé par l'agent.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Règle et exception, même Document | f2 tour 1 | 2 semaines et 5 jours, chacun avec son cas et [S1], sans « ne concordent pas » |
| Valeurs différentes, deux Documents | c1 (FAQ comptabilité, Note finance) | 15 et 21 jours, deux Sources, « ne concordent pas » |
| Exception seule | f4 tour 2 | « 5 jours », Procédure congés et absences |
| `--only` inconnu | `--only=f9` ou `--only=q1` | arrêt avant tout appel, identifiant nommé |
| Sans `--only` | `test:followup:live` | comportement actuel inchangé |

</frozen-after-approval>

## Code Map

- `supabase/functions/_shared/rag/prompt.ts` -- `CHAT_SYSTEM_PROMPT`, paragraphe des contradictions.
- `tests/unit/prompt.test.ts` -- assertions de la consigne (texte exact lignes ~67 et ~157).
- `scripts/test-followup-live.ts` -- option `--only` (scénarios f1 à f5 du Jeu complet via `buildFollowUpScenarios` de `scripts/measure-all.ts`, un essai), critère « sans ne concordent pas » au premier tour de f2.
- `scripts/test-chat-live.ts` -- critère « ne concordent pas » pour c1.
- `tests/unit/test-followup-live.test.ts`, `tests/unit/test-chat-live.test.ts` -- tests des deux critères et de `--only`.
- `docs/environnements.md` -- ligne `test:followup:live` (option `--only`).

## Tasks & Acceptance

**Execution:**
- [x] Consigne de `CHAT_SYSTEM_PROMPT` modifiée ; `prompt.test.ts` mis à jour.
- [x] `test:chat:live` : critère c1 « ne concordent pas » ; test.
- [x] `test:followup:live --only` (Jeu complet, un essai, contrôle des identifiants) et critère f2 tour 1 ; tests ; `docs/environnements.md`.
- [x] Revue ciblée par Claude (consigne seule, aucune logique applicative).

**Acceptance Criteria:**
- Given la consigne déployée, when l'utilisateur lance `test:chat:live`, then les 15 essais sont verts et chaque essai de c1 contient « ne concordent pas », 15 et 21 jours et les deux Sources.
- Given la consigne déployée, when l'utilisateur lance `test:followup:live -- --only=f2,f4`, then f2 donne « 2 semaines » sans « ne concordent pas » au premier tour et « responsable d'équipe » au second, et f4 donne « 5 jours » avec la Source « Procédure congés et absences ».
- Given un critère du rejeu en échec, when le rapport est lu, then les textes sont présentés à l'utilisateur et la consigne n'est pas reformulée sans son accord.

## Design Notes

Le modèle peut distinguer les Documents parce que chaque Passage porte déjà son titre dans l'attribut `document`. Limite acceptée : deux Documents différents de même titre seraient pris pour un seul (aucun cas dans le Jeu complet, titres uniques). Le critère « ne concordent pas » reprend la phrase d'exemple de la consigne, suivie par le modèle à chaque passage de la 5.4 et de la 7.2. **Estimation : 1 h à 1 h 30** + `deploy:supabase` et rejeu par l'utilisateur (environ 5 min). Revue ciblée par Claude.

## Verification

**Commands:** `npm test` (depuis PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run check:secrets`.

**Utilisateur, dans cet ordre, chaque étape sur accord :** commit local ; `npm run deploy:supabase` ; push ; `npm run test:chat:live` ; `npm run test:followup:live -- --only=f2,f4`.

## Review Triage Log

Revue ciblée par Claude (Design Notes : consigne seule, aucune logique applicative ; couches blind-hunter, edge-case-hunter et verification-gap non lancées).

| # | Constat | Verdict | Preuve | Suite |
|---|---------|---------|--------|-------|
| 1 | Consigne : comparaison limitée aux Passages de Documents différents, exemple « ne concordent pas » et règle « ne jamais choisir » conservés, cas règle et exception d'un même Document ajouté | false (conforme) | diff de `prompt.ts` : une seule ligne de `CHAT_SYSTEM_PROMPT` ; `REFUSAL_SYSTEM_PROMPT` et `buildChatMessages` inchangés | - |
| 2 | `test:followup:live` refuse désormais tout argument inconnu (avant : ignoré) | low | `parseOnly` ; voulu : une faute de frappe (`--onyl`) lancerait sinon les 14 questions du passage complet | accepté |
| 3 | `measure:all` n'interdit pas la phrase d'écart au premier tour de f2 (seul `--only` le fait) | low | `loadFullSetScenarios` ajoute `disagreement: "forbidden"` ; `buildFollowUpScenarios` inchangé | accepté : `measure:all` n'est pas rejoué dans cette story |
| 4 | Deux Documents différents de même titre seraient vus comme un seul | low | attribut `document` = titre ; titres uniques dans le Jeu complet | limite acceptée par la spec |
| 5 | Passage complet de `npm test` : 1 échec sur 2 204, `tests/integration/summary.test.ts` (expiration `AI_TIMEOUT` après 396 s, pile locale) | false (pour cette story) | fichier ni importé ni modifié par la story (Résumé) ; relancé seul : 27 sur 27 ; lint, tsc, check:secrets verts | à surveiller (instabilité sous charge, pile locale) |

## Clôture (2026-11-24)

- Code f21fc82 (spec 01d70e6), poussé ; `deploy:supabase` réussi par l'utilisateur (fonction `chat` redéployée).
- `npm run test:chat:live` : 15 sur 15, c1 avec « ne concordent pas » 3 sur 3 (15 et 21 jours, deux Sources), compteur 0 → 15 ; rapport `docs/mesures/assistant-live-2.md`.
- `npm run test:followup:live -- --only=f2,f4` : 4 sur 4, f2 sans phrase d'écart au premier tour et « responsable d'équipe » au second, f4 « 5 jours » avec la Procédure congés et absences, compteur 15 → 19 ; rapport `docs/mesures/suivi-live-2.md`.
- Vérification sur le site par l'utilisateur : question sur les congés sans « ne concordent pas », conforme.
