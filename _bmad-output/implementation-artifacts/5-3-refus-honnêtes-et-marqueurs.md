---
title: 'Story 5.3 : Refus honnêtes et marqueurs'
type: 'feature'
created: '2026-11-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9686ecf08cf0b690545c5de5e0ef00237fb2922f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-2b-page-assistant.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'Assistant ne sait pas encore refuser franchement : avec des Passages, le modèle répond toujours (aucun marqueur) ; sans Passage, `chat` enregistre « information absente » sans appel, même pour une question de culture générale, ce que FR-18 (P0) interdit (« hors cadre » attendu). L'écran n'affiche qu'un refus provisoire, sans les suites d'UX-DR11.

**Approach:** Marqueur `REPONSE` / `REFUS_INFO_ABSENTE` / `REFUS_HORS_CADRE` en première ligne de la génération (AD-10), lu et retiré par `_shared/rag/marker.ts` ; appel court quand aucun Passage ne dépasse le seuil ; refus enregistré avec le message standard ; composant `RefusalBlock` à deux variantes. Déploiement : `deploy:supabase` (`chat`, `_shared/`) puis push ; aucune migration.

## Boundaries & Constraints

**Always:**
- **Marqueur (décision de l'utilisateur du 2026-11-16)** : seul sur la première ligne. Lecture **minimale** : espaces autour, casse, astérisques de mise en gras (`*`, `**`) autour du mot ; **rien d'autre** (texte sur la même ligne, ponctuation, autre mot → invalide). Le marqueur est retiré, jamais affiché ni enregistré. Lecteur pur et réutilisable par la 5.5 (tampon de 40 caractères au plus, AD-10) : fonction sur une chaîne, constante `MARKER_MAX_LENGTH = 40`.
- **Avec Passages** : génération avec marqueur.
  - `REPONSE` : suite actuelle sur le texte qui suit (citations, Sources, enregistrement) ; texte vide après le marqueur → `AI_OUTPUT_INVALID`.
  - `REFUS_INFO_ABSENTE` / `REFUS_HORS_CADRE` : texte du modèle **ignoré** ; message standard du catalogue enregistré (`kind = refusal_info_absente` / `refusal_hors_cadre`), sans Source, sans validation de citations.
  - Marqueur absent ou invalide → `AI_OUTPUT_INVALID` (échec enregistré, « Réessayer »), sans texte du modèle.
- **Sans Passage au-dessus du seuil : appel court (validé par l'utilisateur, FR-18 P0)** : question seule (neutralisée comme en 5.2a-1), consignes « répondez uniquement par `REFUS_INFO_ABSENTE` (information d'entreprise absente) ou `REFUS_HORS_CADRE` (culture générale, demande personnelle, sans rapport avec NexaWorks) », sortie bornée (≈ 16 tokens), raisonnement désactivé, même échantillonnage fixe. `REPONSE` ou autre sortie → `AI_OUTPUT_INVALID`. Une seule nouvelle tentative sur 429/5xx reçus, comme la génération.
- **Quota (AD-14, décision de l'utilisateur du 2026-11-16)** : tout refus consomme l'unité, **appel court compris** (appel facturé) ; la règle de libération reste : unité rendue seulement si aucun appel facturable n'a abouti (appel court sans réponse reçue → `AI_UNAVAILABLE`, unité rendue). Le raccourci « aucun Passage → refus sans appel, unité rendue » de la 5.2a-2 disparaît.
- **Alignement des documents** : AD-14 (ligne « aucun Passage (refus sans appel, 5.2a-2) » retirée de la colonne 0 ; refus par appel court à 1), AD-10 (tolérance de lecture), PRD FR-18 troisième critère (« une panne… ne décompte pas le quota » → « une panne sans réponse du fournisseur ne décompte pas le quota ; une sortie inexploitable ou un délai dépassé après envoi le décomptent (décision du 2026-11-16) »), avec note datée.
- **Écran : `RefusalBlock` (UX-DR11, boutons gardés par décision de l'utilisateur)**, remplace le refus provisoire de la 5.2b, affiché d'un bloc, distinct d'une réponse et d'une panne, sans Source :
  - information absente : texte d'EXPERIENCE.md + « Reformuler la question » (remet la question dans le champ, focus, curseur à la fin), « Rechercher dans les Documents » (`searchHref(question)`, Recherche avec la question en Requête), « Ajouter un Document » (`ADD_HREF`) ;
  - hors cadre : « Je réponds uniquement à partir des Documents de NexaWorks. » + « Reformuler la question » seulement.
  - Annonce et focus : comme la 5.2b (région `role="status"`, focus dans le champ).
- **Schéma** : `chatResponseSchema.message.kind` accepte `refusal_hors_cadre` (la base l'accepte depuis la 5.1).
- **Génération simulée locale** : sortie précédée de `REPONSE` ; repères de test pour `REFUS_INFO_ABSENTE`, `REFUS_HORS_CADRE`, marqueur invalide ; appel court simulé (hors cadre si la question porte un repère, sinon information absente).
- **Test réel (`npm run test:chat:live`, utilisateur, 12 questions, ≈ 0,07 $)** : q1 (`REPONSE`, « 5 jours ouvrés », « Procédure de facturation ») et p1 (`REPONSE`, sans « 99 jours » ni « PERROQUET ») 3/3 ; h1 « Quel est le budget marketing de NexaWorks pour 2027 ? » → `refusal_info_absente` 3/3 ; « Quelle est la capitale de l'Australie ? » (ajoutée à `questions-mini.json`) → `refusal_hors_cadre` 3/3 ; termes du piège interdits sur les 12 ; compteur +12 ; **sans la relance**.
- **Revue** : un relecteur séparé (décision de l'utilisateur), centré sur la lecture du marqueur, la règle de quota des refus et l'accessibilité du bloc de refus.

**Never:** diffusion et tampon en flux (5.5) ; renvois ¹ ² et retrait des citations (5.4) ; boutons ou textes autres que ceux d'UX-DR11 ; migration ; tolérance du marqueur au-delà de la décision ; texte du modèle affiché ou enregistré pour un refus ; `service_role` ; délai de test augmenté ; commit, déploiement ou push sans accord.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Réponse | Passages, sortie `REPONSE\n…[P1]` | réponse sans le marqueur, Sources | — |
| Tolérance | `**reponse**  \n…` | lu comme `REPONSE` | — |
| Refus avec Passages | `REFUS_INFO_ABSENTE\n…` | `refusal_info_absente`, message standard, texte du modèle ignoré ; unité consommée | — |
| Sans Passage, hors cadre | appel court → `REFUS_HORS_CADRE` | `refusal_hors_cadre`, bloc hors cadre ; unité consommée | — |
| Sans Passage, absente | appel court → `REFUS_INFO_ABSENTE` | `refusal_info_absente`, bloc à 3 boutons ; unité consommée | — |
| Marqueur absent | `Voici la réponse…` | échec enregistré ; unité consommée | `AI_OUTPUT_INVALID`, « Réessayer » |
| Marqueur invalide | `REPONSE : voici…` / `REFUS` / `REPONSE.` | idem | `AI_OUTPUT_INVALID` |
| `REPONSE` vide | `REPONSE\n` seul | idem | `AI_OUTPUT_INVALID` |
| Appel court sans réponse | réseau, 5xx après la nouvelle tentative | échec enregistré ; unité rendue | `AI_UNAVAILABLE` |
| Appel court inexploitable | `REPONSE` ou autre | échec enregistré ; unité consommée | `AI_OUTPUT_INVALID` |
| Reformuler | bouton activé | question dans le champ, focus, curseur à la fin | — |
| Rechercher | bouton activé | `/recherche?q={question}` | — |

</frozen-after-approval>

## Code Map

- `supabase/functions/chat/index.ts` -- branche `passages.length === 0` (l. ~343-364, refus sans appel puis `release()`) à remplacer par l'appel court ; après `generateAnswer` (l. ~372-393), lire le marqueur avant `readCitations` ; constantes de texte (`REFUSAL_INFO_ABSENTE` existe ; ajouter le texte hors cadre, égalité avec le catalogue testée comme les autres) ; `isReleasable` / `generation` : l'appel court suit la même règle que la génération (`no_response` rendu, sinon consommé).
- `supabase/functions/_shared/rag/prompt.ts` -- `CHAT_SYSTEM_PROMPT` : règle du marqueur en première ligne ; nouvelle fonction de consignes de l'appel court (question neutralisée par `escapeContent`) ; test `tests/unit/prompt.test.ts`.
- `supabase/functions/_shared/rag/marker.ts` (nouveau) -- `readMarker(text)` → `{ marker, rest }` ou `null` ; `MARKER_MAX_LENGTH = 40`.
- `supabase/functions/_shared/ai.ts` -- `generateAnswer` (modèle, `GENERATION_SAMPLING`, `GENERATION_RETRY`) : ajouter l'appel court (`max_completion_tokens` borné) en réutilisant `callProvider` et l'`outcome`.
- `supabase/functions/_shared/config.ts` -- borne de sortie de l'appel court.
- `supabase/functions/_shared/fake-generation.ts` -- `fakeAnswer` avec marqueur, repères de test, appel court simulé.
- `src/lib/schemas/chat.ts` -- `kind` ; `src/lib/texts.ts` -- texte hors cadre, libellés des 3 boutons.
- `src/components/assistant/assistant-view.tsx` -- `Refusal` → `RefusalBlock` (2 variantes) ; « Reformuler » : `setValue(question)`, focus, `setSelectionRange` en fin.
- `src/lib/search-links.ts` (`searchHref`), `src/components/shell/nav-items.ts` (`ADD_HREF`) -- liens des boutons.
- `scripts/test-chat-live.ts`, `demo/questions-mini.json` -- 4 cas bloquants (q1, p1, h1, hors cadre) ; observation de relance retirée.
- `_bmad-output/planning-artifacts/architecture/architecture-projet-ia-2026-11-03/architecture-nexamind-ai.md` (AD-10 l. 158-159, tableau AD-14 l. ~218-230), `_bmad-output/planning-artifacts/prds/prd-projet-ia-2026-11-02/prd.md` (FR-18, l. 290), EXPERIENCE.md (l. 180-181, 265 : textes déjà présents).
- Tests à adapter : `tests/unit/chat-function.test.ts` (refus sans appel → appel court ; sorties simulées avec marqueur), `tests/integration/chat.test.ts` (« question hors base … unité rendue » → consommée), `tests/unit/assistant-view.test.tsx`, `tests/e2e/assistant.spec.ts` (refus provisoire → `RefusalBlock`), `tests/unit/test-chat-live.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `_shared/rag/marker.ts` + tests unitaires (3 valeurs, tolérance, absent, invalides, vide, 40 caractères).
- [x] `_shared/rag/prompt.ts`, `_shared/ai.ts`, `_shared/config.ts`, `_shared/fake-generation.ts` -- marqueur dans les consignes, appel court, simulation.
- [x] `supabase/functions/chat/index.ts` -- lecture du marqueur, refus enregistrés, appel court, quota.
- [x] `src/lib/schemas/chat.ts`, `src/lib/texts.ts`, `src/components/assistant/assistant-view.tsx` -- `RefusalBlock`.
- [x] Tests unitaires, d'intégration (refus consomme l'unité, appel court simulé) et e2e (deux variantes, boutons, focus, axe, frontière réseau).
- [x] `scripts/test-chat-live.ts`, `demo/questions-mini.json`, tests du script.
- [x] Architecture (AD-10, AD-14), PRD (FR-18), note datée dans `epics.md`.

**Acceptance Criteria:**
- Given une sortie simulée avec chacun des marqueurs, when `chat` la traite, then l'issue, le `kind` enregistré et le compteur suivent le tableau ci-dessus.
- Given le déploiement, when l'utilisateur lance `npm run test:chat:live`, then 12 sur 12, compteur +12, aucun terme du piège.
- Given la production, when l'utilisateur pose h1 puis la question de culture générale dans la page Assistant, then les deux variantes du bloc de refus s'affichent avec leurs boutons, et « Reformuler » remet la question dans le champ.

## Design Notes

Ordre : marqueur et consignes, puis `chat`, puis écran, puis documents. Estimation : une journée. Coût réel : ≈ 0,07 $ (12 questions). Risque principal : marqueur mal formé par le modèle (mesuré par le test réel ; aucune 2ᵉ formulation des consignes en production sans retour à l'utilisateur).

**Interprétations validées par l'utilisateur (2026-11-17) :**
- Appel court : un `REFUS_*` valide sur la première ligne suffit ; les lignes suivantes sont ignorées (jamais affichées ni enregistrées). Une sortie coupée par la borne de 16 tokens (`finish_reason` = `length`) est acceptée si la première ligne est complète (saut de ligne présent) ; sinon `AI_OUTPUT_INVALID`. « `REPONSE` ou autre sortie → `AI_OUTPUT_INVALID` » vise la première ligne.
- Bloc de refus : seul le texte du refus est dans la région `role="status"` ; les boutons sont hors de la région annoncée (même cadre visuel).

## Verification

**Commands:**
- `npx supabase db reset` puis `npm test` (PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run check:secrets`, `npm run test:e2e` (d'un seul tenant) -- expected : vert.
- Après `deploy:supabase` (utilisateur) et push : `npm run test:chat:live` (utilisateur) -- expected : 12 sur 12.

**Manual checks (production, navigateur de l'utilisateur) :**
- « Quel est le budget marketing de NexaWorks pour 2027 ? » → bloc « information absente », 3 boutons, aucune Source ; « Reformuler » remet la question dans le champ ; « Rechercher » ouvre la Recherche avec la question.
- « Quelle est la capitale de l'Australie ? » → bloc « hors cadre », « Reformuler » seulement.
- q1 → réponse inchangée, sans marqueur visible.

## Review Triage Log

Revue du 2026-11-17 : un relecteur séparé (Edge Case Hunter, centré sur le marqueur, le quota des refus et l'accessibilité), par décision de l'utilisateur ; couches Blind Hunter et Verification Gap non lancées.

| # | Constat | Verdict | Preuve | Suite |
|---|---------|---------|--------|-------|
| 1 | `marker.ts` : ligne vide, BOM ou bloc de code avant le marqueur → `AI_OUTPUT_INVALID` | false | Comportement voulu : tolérance minimale décidée par l'utilisateur le 2026-11-16 (« rien d'autre ») ; l'élargir est exclu par la spec (Never). | rejeté |
| 2 | `marker.ts` : espace insécable ou `RÉPONSE` accentué → invalide | false | Même décision de tolérance minimale ; `RÉPONSE` refusé volontairement (test unitaire). | rejeté |
| 3 | `ai.ts` / `chat` : appel court coupé à 16 tokens (`finish_reason` = `length`) rejeté avant la lecture du marqueur | medium | `complete()` rejette tout `finish_reason` autre que `stop` ; un refus valide suivi de texte devient une panne facturée, contraire à l'interprétation validée le 2026-11-17. | patch : corrigé (2026-11-17) |
| 4 | `assistant-view.tsx` : boutons du bloc de refus dans la région `role="status"` | medium | Les libellés des boutons sont annoncés avec le refus ; décision de l'utilisateur du 2026-11-17 : seul le texte dans la région. | patch : corrigé (2026-11-17) |
| 5 | « Reformuler » écrase un brouillon tapé après le refus | low | Réel mais rare (clic explicite pour retrouver la question) ; le correctif ajoute une branche. | rejeté |
| 6 | `tooLong` après « Reformuler » | false | Le relecteur l'a trouvé traité : la valeur remplacée recalcule `tooLong`. | rejeté |
| 7 | « Rechercher » tronque une question de plus de 500 caractères (`searchHref`) | low | Limite existante de la Recherche (`SEARCH_QUERY_MAX_LENGTH`) ; questions refusées aussi longues rares ; le correctif ajoute un message ou une branche. | rejeté |
| 8 | Échec de `save_assistant_answer` après un refus facturé | false | Unité consommée, échec enregistré : conforme à la règle de libération. | rejeté |
| 9 | Texte du refus affiché depuis le catalogue, pas depuis la réponse serveur | false | Test d'égalité des constantes `chat` / `texts.ts` (`chat-function.test.ts`, « textes des refus identiques au catalogue »). | rejeté |
| 10 | Matrice « Rechercher → `/recherche?q={question}` » non tenue pour une question longue | low | Même cause que 7. | rejeté |
| 11 | Matrice « appel court → `REFUS_*` » non tenue si la sortie est coupée | medium | Même cause que 3. | patch (avec 3) : corrigé |
