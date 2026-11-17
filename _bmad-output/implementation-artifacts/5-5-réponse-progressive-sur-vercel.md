---
title: 'Story 5.5 : Réponse progressive sur l''environnement Vercel'
type: 'feature'
created: '2026-11-17'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-4-validation-des-citations.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-0-essai-leger-du-flux-sur-vercel.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La réponse de l'Assistant arrive d'un bloc après plusieurs secondes d'écran neutre ; FR-16 et NFR-3 exigent un texte qui s'écrit progressivement, premier affichage en moins de 5 s en médiane sur Vercel Hobby, sans jamais montrer un marqueur, un repère `[P{n}]` ni un refus en cours de rédaction (AD-10, AD-11, AD-16).

**Approach:** `chat` diffuse en SSE : tampon du marqueur, puis texte masqué de ses repères ; un événement final `done` porte le texte validé (`[S{n}]`, 5.4) et les Sources, qui remplacent le texte provisoire. Relais Next.js repris de la 5.0 (variante de base validée), client SSE avec délais 20 s / 90 s. Mesure de 10 questions sur Vercel ; plan B d'AD-16 si elle échoue. Déploiement : `deploy:supabase` puis push.

## Boundaries & Constraints

**Always:**
- **Deux modes dans `chat`** (compatibilité pendant le déploiement, `deploy:supabase` précédant le push) : `Accept: text/event-stream` → flux ; sinon JSON actuel (5.4), même logique, même enregistrement. Les refus avant flux (validation, session, `QUOTA_EXCEEDED`, `AI_DAILY_CAP_REACHED`, `REQUEST_IN_PROGRESS`) restent des réponses JSON avec leur statut HTTP, dans les deux modes.
- **Événements SSE** : `delta` (`{ text }`, texte provisoire sans marqueur ni repère) ; `refusal` (`{ kind, content }`, message standard, d'un bloc) ; `done` (`{ conversationId, message }`, même forme que la réponse JSON de 5.4) ; `error` (`{ code, message, retryable }`, AD-19). Une réponse rejouée (même `clientRequestId`) arrive en un seul `done` ou `refusal`.
- **Génération diffusée** (`streamAnswer`, `_shared/ai.ts`) : mêmes modèle, échantillonnage, raisonnement, borne de sortie que `generateAnswer` ; une seule nouvelle tentative sur 429/5xx reçus **avant le premier morceau**, aucune ensuite. Appel court sans Passage inchangé (non diffusé) → `refusal`.
- **Tampon du marqueur** : rien n'est envoyé avant la fin de la première ligne ou 40 caractères (`readMarker`, `MARKER_MAX_LENGTH`). `REPONSE` → diffusion ; refus → `refusal` d'un bloc, texte du modèle ignoré, lecture du fournisseur arrêtée ; invalide → `error` `AI_OUTPUT_INVALID`.
- **Masquage pendant le flux** (module pur `_shared/rag/stream-mask.ts`) : aucun `[P…]` ni `[S…]` (même coupé entre deux morceaux, même non fermé à la fin) n'est envoyé ; `[Procédure]` passe dès qu'il est reconnu ; tampon borné (au plus 41 caractères retenus). À la fin, `readCitations` (5.4) sur le texte complet : au moins une citation valide → enregistrement puis `done` ; aucune → `error` `AI_CITATIONS_INVALID`, échec enregistré.
- **Quota et enregistrement** : règles de 5.2a-2 à 5.4 inchangées (délai dépassé après envoi : unité consommée). Si le navigateur ou le relais se déconnecte, `chat` va au bout (génération lue, réponse ou échec enregistré ; `EdgeRuntime.waitUntil`).
- **Délais** : navigateur 20 s sans premier affichage (`delta`, `refusal`, `done` ou `error`) et 90 s au total → texte provisoire retiré, alerte de panne avec « Réessayer », question conservée. Serveur : échéance globale de `chat` 85 s ; génération 20 s jusqu'au premier morceau, 70 s au total ; relais : 25 s jusqu'aux en-têtes, corps non borné (`maxDuration = 120`). Chaîne testée : 20 s < 25 s ; 85 s < 90 s < 120 s.
- **Relais** (`src/server/chat/relay.ts`, `app/api/chat`) : variante de base de la 5.0 (`text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, corps amont relayé tel quel, jeton de la session, jamais `service_role`). Le navigateur n'appelle que `/api/chat`.
- **Écran** : état neutre, puis texte provisoire (`aria-busy="true"`, hors de l'annonce) qui s'écrit ; à `done`, remplacé par le texte validé (renvois ¹ ², puces) et annoncé une seule fois ; `refusal` → bloc de refus de 5.3 d'un coup ; `error` → alerte de 5.2b. `[S{n}]` n'apparaît jamais dans le texte provisoire.
- **Consigne de contradiction** (deferred-work, décision de l'utilisateur du 2026-11-17) : exemple remplacé par « Les Documents ne concordent pas : X[P1], Y[P3]. », sans « selon » devant un renvoi ; reste de la règle mot pour mot.
- **Mesure (critère de l'epic ; décision de l'utilisateur du 2026-11-17, Q1 = A)** : instrument intégré à la page Assistant, actif seulement avec `?mesure=1` (heure d'envoi, premier `delta`, `done`, nombre de morceaux, région tirée de `x-vercel-id`) et bouton « Copier le résultat » (Markdown). Le résultat copié ne contient **ni identifiant (Conversation, message, Compte, `x-vercel-id` complet), ni jeton, ni e-mail** : région seule, durées, nombres, texte des questions du mini Jeu ; vérifié par un test. Mesure **en production** après le push : 10 questions du mini Jeu, navigateur de l'utilisateur ; premier affichage < 5 s en médiane, flux non mis en tampon (texte reçu en plusieurs morceaux étalés), région `fra1` ; résultats dans `docs/mesures/flux-vercel.md`. Écart avec la lettre de l'epic (« prévisualisation ») consigné dans le rapport et dans `epics.md` : même Vercel Hobby, même région, même fonction `chat` distante.
- **Plan B (AD-16) et critère de repli B3** :
  - **Déclencheur** : la mesure échoue (médiane du premier affichage ≥ 5 s, ou texte reçu d'un bloc).
  - **B1** d'abord (relais `copyStream` de la 5.0, `X-Accel-Buffering: no`, `Content-Encoding: identity`), redéployé et remesuré. **B2** impossible (Cache Components, décision du 2026-11-13).
  - **B3** (réponse d'un bloc : état neutre puis réponse validée, comme la 5.4 ; le flux reste en place côté serveur, le client lit seulement `done`) : **proposé, jamais appliqué sans l'utilisateur**, dans deux cas : B1 échoue à la mesure ; ou, au point de contrôle du **18/11 au soir**, le flux n'a pas atteint la mesure (implémentation non terminée ou instable). Décision consignée dans AD-16 et le journal.
- **Rien de ce qui part en `delta` n'est pire que le texte final (décision de l'utilisateur du 2026-11-17)** : la suite des `delta` d'une réponse, mise bout à bout, ne contient aucun fait, repère, marqueur ni terme interdit absent du texte validé ; si la fin aboutit à un `error` (citations invalides, sortie invalide, délai), le texte provisoire est retiré de l'écran. Vérifié en test (repères, marqueur, termes du piège dans les `delta` simulés).
- **Test réel** (`npm run test:chat:live`, utilisateur) : passe en mode flux ; mêmes 15 cas et critères qu'en 5.4 lus sur `done`/`refusal` ; en plus, pour **chaque question**, « 99 jours » et « PERROQUET » sont cherchés aussi dans les textes progressifs (`delta` mis bout à bout), même normalisation que pour le texte validé, bloquants ; aucun `delta` ne contient `[P`, `[S` ni un marqueur ; un refus n'émet aucun `delta` ; durée jusqu'au premier `delta` relevée (côté fonction).
- **Chaîne des délais** : le test de la chaîne de la 5.2b (`tests/unit/chat-route.test.ts`, « chat 60 s < relais 70 s < navigateur 85 s < maxDuration 120 s ») est mis à jour avec les nouvelles valeurs (génération 20 s au premier morceau < relais 25 s aux en-têtes ; `chat` 85 s < navigateur 90 s < `maxDuration` 120 s).
- **Revue (décision de l'utilisateur du 2026-11-17, Q2 = A)** : un relecteur séparé, centré sur le masquage en flux, le tampon du marqueur, les délais, l'enregistrement après déconnexion, et la règle « rien en `delta` de pire que le texte final ».

**Never:** navigateur appelant une Edge Function ; `runtime = 'edge'` ; migration ; modification des citations (5.4), du marqueur (5.3) ou des refus ; Historique (5.6) ; nouvelle génération automatique ; délai de test augmenté pour faire passer un test ; B3 sans accord ; commit, déploiement ou push sans accord.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Réponse | `REPONSE\nA [P1]. B [P2].` en 6 morceaux | `delta` « A », « . B », « . » (aucun repère) ; `done` avec `A[S1]. B[S2].` et Sources | — |
| Repère coupé | morceaux `…délai [P` + `1]. Suite` | jamais `[P` dans un `delta` | — |
| Repère non fermé en fin | dernier morceau `… fin [P3` | `[P3` jamais envoyé ; texte validé sans lui | — |
| Refus | `REFUS_INFO_ABSENTE\n…` | un `refusal`, aucun `delta` | — |
| Marqueur invalide | `Voici…` | aucun `delta` | `error` `AI_OUTPUT_INVALID` |
| Aucune citation valide | flux complet sans `[P` valide | `delta` envoyés, puis texte provisoire retiré | `error` `AI_CITATIONS_INVALID` |
| Sans Passage | appel court | `refusal` | — |
| Rejoué | même `clientRequestId`, déjà répondu | un `done`, aucun appel | — |
| Mode JSON | sans `Accept: text/event-stream` | réponse JSON de 5.4 | — |
| Navigateur fermé | relais coupé pendant le flux | réponse enregistrée quand même | — |
| 20 s sans premier affichage | fournisseur lent | texte provisoire absent, alerte + « Réessayer » | `AI_TIMEOUT` |

</frozen-after-approval>

## Code Map

- `supabase/functions/chat/index.ts` -- `handle` (validation, rejeu l. ~300-340, `reserve`, Conversation, `searchPassages` l. ~158, `callModel`, `refuse`, `readMarker`, `readCitations`, `save_assistant_answer`, `record_assistant_failure`, `release`) ; constantes de délai (`CHAT_TIMEOUT_MS`, `CHAT_GENERATION_MAX_TIMEOUT_MS`) ; `EdgeRuntime.waitUntil` déjà déclaré (l. ~529).
- `supabase/functions/_shared/ai.ts` -- `complete` / `generateAnswer` / `classifyRefusal`, `callProvider`, `GENERATION_RETRY`, `AiError.outcome` ; ajouter `streamAnswer` (`stream: true`, lecture SSE du fournisseur).
- `supabase/functions/_shared/config.ts` -- délais de `chat` (60 s / 40 s aujourd'hui).
- `supabase/functions/_shared/rag/marker.ts` (`readMarker`, `MARKER_MAX_LENGTH`), `citations.ts` (`readCitations`, `[S{n}]`) : réutilisés, non modifiés.
- `supabase/functions/_shared/rag/prompt.ts` -- exemple de la consigne de contradiction ; `tests/unit/prompt.test.ts` vérifie la règle mot pour mot.
- `supabase/functions/_shared/fake-generation.ts` -- `fakeFetch` : réponse SSE du fournisseur découpée en morceaux (repère coupé, marqueur coupé) quand `stream: true`.
- `src/server/chat/relay.ts`, `src/app/api/chat/route.ts` -- relais JSON de 5.2a-2 (70 s) ; modèle de flux : `git show probe/5-0-stream:src/server/stream-probe/relay.ts` (`BASE_HEADERS`, `B1_HEADERS`, `copyStream`, délai jusqu'aux en-têtes).
- `src/components/assistant/assistant-view.tsx` -- `ask`, `CHAT_CLIENT_TIMEOUT_MS` (85 s), `Reply`, `toReply`, `Answer`, `FailureAlert`, région `role="status"` ; `src/lib/schemas/chat.ts` (`chatResponseSchema`) pour `done`.
- `scripts/test-chat-live.ts` -- `runChatCases` (JSON aujourd'hui), `evaluateChatCase`, rapport.
- `docs/mesures/flux-vercel.md` -- rapport de la 5.0, à compléter.
- Architecture AD-11 (événement `done`), AD-16 (délais du flux, décision B3 éventuelle).
- Tests : `tests/unit/` (nouveau `stream-mask.test.ts`, `ai-generate`, `chat-function`, `chat-route`, `assistant-view`, `test-chat-live`, `prompt`), `tests/integration/chat.test.ts` (mode flux simulé), `tests/e2e/assistant.spec.ts` (texte provisoire, `done`, refus, délais, frontière réseau).

## Tasks & Acceptance

**Execution:**
- [ ] `_shared/rag/stream-mask.ts` + tests -- masquage par morceaux (repère coupé, non fermé, `[Procédure]`, borne du tampon).
- [ ] `_shared/ai.ts`, `_shared/config.ts`, `_shared/fake-generation.ts` -- `streamAnswer`, délais, fournisseur simulé en flux.
- [ ] `chat/index.ts` -- deux modes, événements SSE, tampon du marqueur, fin après déconnexion.
- [ ] `_shared/rag/prompt.ts` + test -- exemple de contradiction.
- [ ] `relay.ts`, `route.ts` -- relais du flux (base de la 5.0), B1 prêt dans le code mais inactif.
- [ ] `assistant-view.tsx`, `schemas/chat.ts`, `texts.ts` -- client SSE, texte provisoire, délais 20 s / 90 s, instrument `?mesure=1` (résultat copié sans identifiant, jeton ni e-mail, testé).
- [ ] `tests/unit/chat-route.test.ts` -- chaîne des délais de la 5.2b mise à jour.
- [ ] Tests unitaires, d'intégration et e2e (matrice).
- [ ] `scripts/test-chat-live.ts` + test -- mode flux.
- [ ] AD-11, AD-16, `epics.md` (note datée), `docs/mesures/flux-vercel.md` (section 5.5 à remplir après mesure).

**Acceptance Criteria:**
- Given le déploiement, when l'utilisateur lance `npm run test:chat:live`, then 15 sur 15, compteur +15, aucun `delta` avec repère ou marqueur, aucun `delta` pour un refus.
- Given la version en ligne, when l'utilisateur mesure 10 questions, then premier affichage < 5 s en médiane, texte reçu en plusieurs morceaux, `fra1` ; sinon plan B ci-dessus.
- Given q1 et c1 sur le site, when la réponse s'écrit, then aucun repère ni marqueur visible pendant l'écriture, puis renvois et puces à la fin.

## Design Notes

Ordre : masquage pur, puis `streamAnswer` et `chat`, puis relais et client, puis test réel et mesure. Estimation : une journée (18/11), point de contrôle le soir (B3 éventuel). Coût réel : ≈ 0,09 $ (test réel) + ≈ 0,06 $ (mesure de 10 questions). Ordre de déploiement : `deploy:supabase` (le mode JSON garde la page en ligne fonctionnelle), puis push.

## Verification

**Commands:**
- `npx supabase db reset` puis `npm test` (PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run check:secrets`, `npm run test:e2e` (d'un seul tenant) -- expected : vert.
- Après `deploy:supabase` et push : `npm run test:chat:live` (utilisateur) -- expected : 15 sur 15.

**Manual checks (production) :**
- 10 questions mesurées (Q1) ; q1, c1, h1, o1 : écriture progressive sans repère, refus d'un bloc.
