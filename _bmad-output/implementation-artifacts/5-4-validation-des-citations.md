---
title: 'Story 5.4 : Validation des citations'
type: 'feature'
created: '2026-11-17'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '758386e9ea6331e010ab764bfdef490a6aea2d8f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-3-refus-honnêtes-et-marqueurs.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les citations sont lues mais pas encore appliquées : la réponse affiche les repères bruts `[P2]`, une citation invalide reste dans le texte, les puces ne sont pas numérotées, et la contradiction c1 n'a jamais été exigée (FR-16, FR-17, AD-11, UX-DR10). La production montre aussi « 1. » devant une réponse d'une phrase et un fait attribué au mauvais Document (deferred-work, 5.2a-2 et 5.2b).

**Approach:** `chat` valide les citations, retire les invalides (journalisées), remplace chaque citation valide par un renvoi au numéro de sa Source et enregistre ce texte ; la page affiche les renvois ¹ ² (texte masqué « Source ») et des puces numérotées. Deux consignes ajoutées. Test réel étendu à c1 après une mesure de son classement. Déploiement : `deploy:supabase` puis push.

## Boundaries & Constraints

**Always:**
- **Validation (AD-11)** : au moins une citation valide → citations invalides (`[P9]`, `[P0]`, `[P1, P2]`…) retirées du texte, sans message, nombre journalisé (jamais leur texte) ; espaces doublés et espace avant ponctuation laissés par le retrait nettoyés. Aucune valide → `AI_CITATIONS_INVALID` inchangé (5.2a-2).
- **Renvois (décision de l'utilisateur du 2026-11-17, Q1 = A)** : `chat` enregistre et renvoie le texte avec un repère canonique `[S{n}]` (n = numéro de la Source), après avoir retiré du texte du modèle tout repère `[S…]` préexistant ; la page remplace `[S{n}]` par le renvoi ; aucune migration. AD-11 consigne l'écart avec sa lettre (« position des renvois ») et sa raison (pas de migration, même format lu par l'Historique en 5.6). Plusieurs Passages d'un même Document cités côte à côte → un seul renvoi. Le texte du modèle n'est jamais interprété comme du HTML.
- **Puces (décision de l'utilisateur du 2026-11-17, Q2 = A)** : non interactives jusqu'à la 5.7, qui leur donne leur action ; la tâche technique d'`epics.md` (« puces `button` ») est corrigée par une note datée.
- **Sources** : numérotées dans l'ordre de première citation (déjà fait par `readCitations`) ; puce « {n} · {titre} » ou « {n} · {titre} · {k} Passages » ; nom accessible « Source {n} : {titre}, {k} Passages » (points médians masqués) ; Source supprimée : style actuel, numéro gardé.
- **Renvoi à l'écran** : numéro en exposant précédé du texte masqué « Source » (lu « Source 1 »), non cliquable, `overflow-wrap: anywhere` conservé.
- **Consignes** (`CHAT_SYSTEM_PROMPT`) : « numérotez seulement une procédure d'au moins deux étapes » ; « ne nommez jamais un Document autre que celui du Passage que vous citez ». Les règles du marqueur (5.3) et du piège (NFR-10) restent inchangées.
- **Mesure avant le critère c1 (deferred-work)** : `npm run measure:search` (utilisateur) étendu à la question c1 de `questions-mini.json` ; FAQ comptabilité et Note de réunion finance doivent dépasser 0,40 avec au moins 0,02 de marge. Sinon : arrêt, mesures présentées à l'utilisateur, aucun changement de seuil ni de formulation sans lui.
- **Test réel (`npm run test:chat:live`, utilisateur, 15 questions, ≈ 0,09 $)** : cas actuels inchangés (12 sur 12) + c1 3/3 : réponse, Sources « FAQ comptabilité » ET « Note de réunion : finance de mars », « 15 jours » ET « 21 jours » dans le texte ; aucun repère `[P` dans un texte ; compteur +15.
- **Revue** : trois relecteurs (décision de l'utilisateur).

**Never:** panneau Source et action des puces (5.7) ; diffusion progressive et masquage en flux (5.5) ; nouvelle génération automatique ; changement du seuil 0,40 ; refus ou marqueur modifiés ; `service_role` ; délai de test augmenté ; commit, déploiement ou push sans accord.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Toutes valides | `A [P1]. B [P3].`, P1 et P3 de deux Documents | renvois 1 et 2, deux puces numérotées | — |
| Même Document | `A [P1][P2].`, P1 et P2 du même Document | un seul renvoi 1 ; puce « 1 · … · 2 Passages » | — |
| Partiellement invalide | `A [P1]. B [P9].` (8 Passages) | `[P9]` retiré, « B. » propre ; réponse enregistrée ; `unknown_citations: 1` journalisé | — |
| Mal formée | `A [P1, P2].` seule | aucune valide | `AI_CITATIONS_INVALID`, « Réessayer », unité consommée |
| Aucune | texte sans repère | idem | idem |
| Source supprimée | Document supprimé avant l'enregistrement | puce supprimée, numéro et renvoi gardés | — |
| Écran | réponse avec renvois | aucun `[P` ni `[S` visible ; lecteur d'écran : « Source 1 » | — |

</frozen-after-approval>

## Code Map

- `supabase/functions/_shared/rag/citations.ts` -- `readCitations` (candidats, `CITATION_LIKE`, ordre de première citation, `unknown`) : ajouter la réécriture du texte (retrait des invalides, renvois) ; garder le module pur. Commentaire d'en-tête à mettre à jour (« masquage en 5.5 »).
- `supabase/functions/chat/index.ts` -- l. ~436-490 : `readCitations(answer, …)`, `AI_CITATIONS_INVALID`, `sourcesToSave`, `save_assistant_answer` (`p_content: answer`), réponse JSON ; enregistrer et renvoyer le texte réécrit ; journal `chat_done` (`unknown_citations` existe).
- `supabase/functions/_shared/chat.ts` -- `sourcesToSave` (ordinal, passages) : inchangé sauf besoin.
- `supabase/functions/_shared/rag/prompt.ts` -- `CHAT_SYSTEM_PROMPT` l. ~20 (« Présentez une procédure en étapes numérotées ») : deux consignes.
- `supabase/functions/_shared/fake-generation.ts` -- repères de simulation ; ajouter un repère « citation invalide » (`[P9]` à côté de `[P1]`) lu dans la question seule.
- `src/lib/schemas/chat.ts` -- `chatResponseSchema` (`sources[].passageNumbers`, 1 à 8).
- `src/components/assistant/assistant-view.tsx` -- `Answer` : texte en `whitespace-pre-wrap`, puces en `li` ; découper le texte en segments (jamais `dangerouslySetInnerHTML`).
- `src/lib/texts.ts` -- `texts.assistant` (`sourcesLabel`, `passagesCount`, `sourceDeleted`) : libellés « Source », nom accessible.
- `scripts/measure-search.ts`, `scripts/test-chat-live.ts`, `demo/questions-mini.json` (`contradiction.expectedDocuments`, `expectedValues`) -- mesure et cas c1.
- Tests : `tests/unit/citations.test.ts`, `chat-function.test.ts`, `prompt.test.ts`, `assistant-view.test.tsx`, `test-chat-live.test.ts`, `tests/integration/chat.test.ts`, `tests/e2e/assistant.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/measure-search.ts` + test -- question c1 mesurée -- prérequis du critère c1 (arrêt si sous la marge). Fait le 2026-11-17 avant le reste du code ; mesure de l'utilisateur : c1 atteint, FAQ comptabilité 0,594, Note de réunion : finance de mars 0,486, les deux transmis ; seuil 0,40 gardé (r1-r6 rang 1, s1-s3 et « tarte » à 0). Ne pas retoucher ce script.
- [x] `_shared/rag/citations.ts` + tests unitaires (4 cas d'`epics.md` + même Document, mal formée, nettoyage des espaces) -- réécriture.
- [x] `chat/index.ts`, `_shared/rag/prompt.ts`, `_shared/fake-generation.ts` -- texte réécrit enregistré et renvoyé, consignes, repère simulé.
- [x] `src/lib/texts.ts`, `assistant-view.tsx` -- renvois et puces numérotées.
- [x] Tests unitaires, d'intégration (citation invalide retirée du texte enregistré) et e2e (renvois, puces, noms accessibles, axe, 375 px, frontière réseau).
- [x] `scripts/test-chat-live.ts` + test -- cas c1, aucun `[P` dans les textes, compteur +15.
- [x] Architecture AD-11 (format `[S{n}]` enregistré, écart avec la lettre et raison), note datée dans `epics.md` (décisions Q1, Q2 ; tâche « puces `button` » corrigée).

**Acceptance Criteria:**
- Given la mesure de c1 au-dessus du seuil avec marge, when l'utilisateur lance `npm run test:chat:live` après déploiement, then 15 sur 15, compteur +15, aucun terme du piège, aucun `[P` dans un texte.
- Given la production, when l'utilisateur pose q1 puis c1, then le texte montre des renvois ¹ (²) sans repère brut, les puces sont numérotées, q1 ne commence plus par « 1. » si elle n'a qu'un point.

## Design Notes

Ordre : mesure c1 (l'utilisateur la lance avant tout le reste du code), puis citations et `chat`, puis écran, puis test réel. Estimation : une journée. Coût réel : < 0,01 $ (mesure) + ≈ 0,09 $ (15 questions). Risques : classement de la Note finance (0,399 pour une question voisine le 16/11) ; contradiction non signalée par le modèle malgré les deux Passages (mesuré par le test réel ; aucune 2ᵉ formulation des consignes en production sans retour à l'utilisateur).

## Implementation Notes

**Correction des consignes après le premier test réel (2026-11-17, décision de l'utilisateur).** `test:chat:live` sur `3e2826b` : 14 sur 15, c1 #1 et #2 ne citent que la FAQ comptabilité (« 21 jours » ignoré, valeur unique dès la réponse directe), #3 cite les deux ; c1 #1 et #2 répètent aussi la réponse en liste numérotée. Formulations exactes validées par l'utilisateur, dans `CHAT_SYSTEM_PROMPT` :
- remplace « Si deux Passages se contredisent… » : « Avant de répondre, comparez les Passages entre eux. Si plusieurs Passages donnent des valeurs différentes pour un même fait (délai, montant, date, nombre, règle), ne choisissez jamais l'une d'elles : dès la réponse directe, donnez chaque valeur suivie de la citation de son Passage, puis signalez l'écart en une phrase, par exemple « Les Documents ne concordent pas : X selon [P1], Y selon [P3]. » » ;
- précise la règle de numérotation : « Commencez par la réponse directe. Ne répétez jamais la réponse sous forme de liste. Une liste numérotée n'est permise que pour une procédure d'au moins deux étapes distinctes, chacune apportant une action nouvelle. »
Un seul nouveau test réel ; si c1 échoue encore : retour à l'utilisateur avec les textes, sans autre formulation.

## Verification

**Commands:**
- `npx supabase db reset` puis `npm test` (PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run check:secrets`, `npm run test:e2e` (d'un seul tenant) -- expected : vert.
- `npm run measure:search` (utilisateur, avant le code de `chat`) -- expected : c1, deux Documents ≥ 0,42.
- Après `deploy:supabase` et push : `npm run test:chat:live` (utilisateur) -- expected : 15 sur 15.

**Manual checks (production) :**
- q1 : renvoi ¹, puce « 1 · Procédure de facturation », pas de « 1. » pour un seul point.
- c1 : deux puces (FAQ comptabilité, Note de réunion finance), « 15 jours » et « 21 jours », contradiction signalée.

## Review Triage Log

Revue du 2026-11-17 : trois relecteurs (Blind Hunter, Edge Case Hunter, Verification Gap). Constats regroupés par cause.

| # | Constat (relecteurs) | Verdict | Preuve | Suite |
|---|---------|---------|--------|-------|
| 1 | Repère `[P…]`/`[S…]` non fermé, de plus de 40 caractères ou coupé par une ligne : ni réécrit ni retiré (B, E ×2) | medium | `CANDIDATE` exige un crochet fermé sur une ligne ; contraire à la matrice (« aucun `[P` ni `[S` visible ») ; le test réel échouerait. | patch : corrigé (2026-11-17) |
| 2 | Réponses enregistrées avant la 5.4 avec `[P{n}]` bruts (B, V) | medium | Lignes de production des 5.2a à 5.3 ; aucun affichage actuel ne les relit ; l'Historique (5.6) les montrera. | defer (5.6) |
| 3 | Page : renvoi `[S{n}]` hors limites retiré en gardant l'espace (B, E) | false | `chat` ne produit que des numéros de Sources existantes ; cas inatteignable depuis le serveur (le reste relève du 2). | rejeté |
| 4 | Espace gardé avant un renvoi valide (« A ¹. ») (B) | low | Visible sur chaque réponse ; correction directe dans la réécriture. | patch : corrigé (2026-11-17) |
| 5 | Renvois côte à côte sans séparateur (« Source 2Source 1 », « ¹² ») (B) | low | Lecteur d'écran et lecture visuelle ambiguës ; séparateur masqué simple. | patch : corrigé (2026-11-17) |
| 6 | Parenthèses ou crochets vides, mot isolé après un retrait (B) | low | Citations invalides rares ; correctif à plusieurs branches. | rejeté |
| 7 | `[S…]` du modèle retirés sans compte journalisé (B) | low | AD-11 : retraits journalisés ; ajout d'un compteur. | patch : corrigé (2026-11-17) |
| 8 | c1 : arrondi avant la comparaison à 0,42 (B) | low | Mesure faite : 0,486 et 0,594, loin du seuil ; script figé par la spec. | rejeté |
| 9 | c1 non atteint : code de sortie 0 (B, E) | low | L'arrêt est une décision humaine sur la ligne affichée ; mesure faite ; script figé. | rejeté |
| 10 | Test réel : numéros des renvois non vérifiés ; « 1. » de q1 non automatisé (B ×2) | low | Contrôles simples qui transforment des vérifications manuelles en critères mesurés. | patch : corrigé (2026-11-17) |
| 11 | Contradiction « signalée » vérifiée à la main seulement (B) | low | Contrôle lexical peu fiable ; vérification manuelle prévue par la spec. | rejeté |
| 12 | `epic-5-context.md` décrit encore une puce `button` ; statuts spec et sprint différents (B) | low | Contexte compilé avant la note Q2 ; statut du sprint conforme au workflow (`review` à la présentation). | patch (contexte) : corrigé |
| 13 | Ligne de commentaire trop longue dans `chat/index.ts` (B) | low | Correction directe. | patch : corrigé (2026-11-17) |
| 14 | Section c1 du rapport non testée via `buildMeasureReport` / `main()` (V) | medium | Écart de vérification avéré ; mesure faite, script figé. | defer |
| 15 | `[S[P9]1]` : le retrait de `[P9]` forge un `[S1]` (E) | low | Sortie artificielle du modèle ; correctif par marque provisoire, plus complexe. | rejeté |
| 16 | Espaces insécables autour d'un repère retiré (E ×2) | low | Typographie française ; correction directe de la classe d'espaces. | patch : corrigé (2026-11-17) |
| 17 | `B[P9]C` : mots collés après retrait (E) | low | Citation collée entre deux mots : improbable ; branche en plus. | rejeté |
| 18 | `expectedDocuments` absent : `TypeError` non rattrapée (E) | low | Fichier du dépôt sous contrôle ; script figé. | rejeté |
