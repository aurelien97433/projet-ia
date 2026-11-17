---
title: 'Story 5.5 : Réponse progressive sur l''environnement Vercel'
type: 'feature'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'fa490c140079b3e20accc5595298130bfc7d1e83'
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
- **Événements SSE** : `delta` (`{ text }`, texte provisoire sans marqueur ni repère) ; `refusal` (`{ kind, content }`, message standard, d'un bloc) ; `done` (`{ conversationId, message }`, même forme que la réponse JSON de 5.4) ; `error` (`{ code, message, retryable }`, AD-19). Une demande rejouée (même `clientRequestId`) reçoit la réponse JSON 409 `REQUEST_IN_PROGRESS` de la 5.2a-2, dans les deux modes (décision de l'utilisateur du 2026-11-17, 2 = A ; renvoi de la réponse enregistrée en story 5.9).
- **Génération diffusée** (`streamAnswer`, `_shared/ai.ts`) : mêmes modèle, échantillonnage, raisonnement, borne de sortie que `generateAnswer` ; une seule nouvelle tentative sur 429/5xx reçus **avant le premier morceau**, aucune ensuite. Appel court sans Passage inchangé (non diffusé) → `refusal`.
- **Tampon du marqueur** : rien n'est envoyé avant la fin de la première ligne ou 40 caractères (`readMarker`, `MARKER_MAX_LENGTH`). `REPONSE` → diffusion ; refus → `refusal` d'un bloc, texte du modèle ignoré, lecture du fournisseur arrêtée ; invalide → `error` `AI_OUTPUT_INVALID`.
- **Masquage pendant le flux** (module pur `_shared/rag/stream-mask.ts`) : aucun `[P…]` ni `[S…]` (même coupé entre deux morceaux, même non fermé à la fin) n'est envoyé ; `[Procédure]` passe dès qu'il est reconnu ; tampon borné (au plus 41 caractères retenus). À la fin, `readCitations` (5.4) sur le texte complet : au moins une citation valide → enregistrement puis `done` ; aucune → `error` `AI_CITATIONS_INVALID`, échec enregistré.
- **Quota et enregistrement** : règles de 5.2a-2 à 5.4 inchangées (délai dépassé après envoi : unité consommée). Si le navigateur ou le relais se déconnecte, `chat` va au bout (génération lue, réponse ou échec enregistré ; `EdgeRuntime.waitUntil`).
- **Délais** : navigateur 20 s sans premier affichage (`delta`, `refusal`, `done` ou `error`) et 90 s au total → texte provisoire retiré, alerte de panne avec « Réessayer », question conservée. Serveur : échéance globale de `chat` 85 s ; génération 20 s jusqu'au premier morceau, 70 s au total ; relais : 25 s jusqu'aux en-têtes, corps non borné (`maxDuration = 120`). Chaîne testée : 20 s < 25 s ; 85 s < 90 s < 120 s.
  - **Premier affichage du serveur (décision de l'utilisateur du 2026-11-17, option A, après la revue)** : `chat` envoie son premier affichage (`delta`, `refusal`, `done` ou `error`) au plus **17 s** après la réception de la demande ; le délai de la génération jusqu'au premier morceau vaut **min(20 s, 17 s − temps déjà écoulé)** ; à l'échéance, `error` `AI_TIMEOUT` (enregistré, règle de quota inchangée). Chaîne testée : premier affichage de `chat` 17 s < navigateur 20 s. **Raison** : le serveur conclut toujours avant que le navigateur abandonne, pour que l'écran et la base concordent (jamais une panne à l'écran pour une réponse enregistrée et décomptée).
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
| Rejoué | même `clientRequestId`, déjà reçu | réponse JSON 409, aucune réservation ni appel, dans les deux modes (décision de l'utilisateur du 2026-11-17, 2 = A : renvoi de la réponse enregistrée en story 5.9) | `REQUEST_IN_PROGRESS` |
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
- [x] `_shared/rag/stream-mask.ts` + tests -- masquage par morceaux (repère coupé, non fermé, `[Procédure]`, borne du tampon).
- [x] `_shared/ai.ts`, `_shared/config.ts`, `_shared/fake-generation.ts` -- `streamAnswer`, délais, fournisseur simulé en flux.
- [x] `chat/index.ts` -- deux modes, événements SSE, tampon du marqueur, fin après déconnexion.
- [x] `_shared/rag/prompt.ts` + test -- exemple de contradiction.
- [x] `relay.ts`, `route.ts` -- relais du flux (base de la 5.0), B1 prêt dans le code mais inactif.
- [x] `assistant-view.tsx`, `schemas/chat.ts`, `texts.ts` -- client SSE, texte provisoire, délais 20 s / 90 s, instrument `?mesure=1` (résultat copié sans identifiant, jeton ni e-mail, testé).
- [x] `tests/unit/chat-route.test.ts` -- chaîne des délais de la 5.2b mise à jour.
- [~] Tests unitaires, d'intégration et e2e (matrice). Unitaires verts ; intégration et e2e écrits mais non exécutés (Docker indisponible le 2026-11-17, voir Implementation Notes).
- [x] `scripts/test-chat-live.ts` + test -- mode flux.
- [~] AD-11, AD-16, `epics.md` (note datée), `docs/mesures/flux-vercel.md` (section 5.5 à remplir après mesure). Faits ; section 5.5 du rapport préparée, résultats à remplir après la mesure de l'utilisateur ; journal de Vibe Coding à compléter à la clôture.

**Acceptance Criteria:**
- Given le déploiement, when l'utilisateur lance `npm run test:chat:live`, then 15 sur 15, compteur +15, aucun `delta` avec repère ou marqueur, aucun `delta` pour un refus.
- Given la version en ligne, when l'utilisateur mesure 10 questions, then premier affichage < 5 s en médiane, texte reçu en plusieurs morceaux, `fra1` ; sinon plan B ci-dessus.
- Given q1 et c1 sur le site, when la réponse s'écrit, then aucun repère ni marqueur visible pendant l'écriture, puis renvois et puces à la fin.

## Design Notes

Ordre : masquage pur, puis `streamAnswer` et `chat`, puis relais et client, puis test réel et mesure. Estimation : une journée (18/11), point de contrôle le soir (B3 éventuel). Coût réel : ≈ 0,09 $ (test réel) + ≈ 0,06 $ (mesure de 10 questions). Ordre de déploiement : `deploy:supabase` (le mode JSON garde la page en ligne fonctionnelle), puis push.

## Implementation Notes

Implémentation du 2026-11-17 (non commitée, non déployée).

- **`chat`, deux modes.** `Accept: text/event-stream` → flux ; sinon JSON de la 5.4. Les étapes avant génération (session, saisie, rejeu, réservation, Conversation) sont communes et renvoient leurs refus en JSON avec leur statut dans les deux modes. En flux, les en-têtes SSE partent dès la demande acceptée, suivis d'un commentaire `: flux` ; le reste (recherche, génération, citations, enregistrement) continue dans une promesse confiée à `EdgeRuntime.waitUntil` (`HandleOptions.waitUntil`) ; une déconnexion ferme seulement l'envoi (journal `chat_stream_disconnected`). Échéances : flux 85 s, génération 20 s au premier morceau et 70 s au plus ; **mode JSON gardé à 60 s / 40 s** (`CHAT_JSON_TIMEOUT_MS`, `CHAT_JSON_GENERATION_MAX_TIMEOUT_MS`) pour rester sous le délai de 70 s du relais JSON (ancien relais pendant le déploiement, onglet ouvert avant le push) ; la chaîne JSON a son propre test.
- **Tampon du marqueur et masquage** (`streamFilter` dans `chat`, `stream-mask.ts`) : en-tête mis en tampon jusqu'au saut de ligne ou 40 caractères ; refus ou marqueur invalide → lecture du fournisseur arrêtée (`onText` → false, flux annulé), aucun `delta`. Après la lecture, la logique de la 5.4 est reprise telle quelle sur le texte complet (`readMarker`, `readCitations`, enregistrement). Masque : au plus 2 caractères de repère retenus (`[`, `[P`, `[S`) plus 39 espaces, soit 41 ; un repère commencé n'est jamais rendu ; les espaces qui le précèdent sont retirés, sauf s'il est interrompu par une lettre (« x [P1a » → « x a »).
- **`streamAnswer`** : `rejectedStatus` est extrait de `callProvider` (même traitement des refus et du plafond) ; `checkOutput` est extrait de `complete` (mêmes contrôles de fin). Flux coupé après la réponse du fournisseur : `AI_UNAVAILABLE` « response_received » (unité consommée, jamais réessayé).
- **Relais** : `relayChatStream` (25 s jusqu'aux en-têtes, corps relayé tel quel) ; une réponse JSON de `chat` (refus avant le flux, ou `chat` encore en mode JSON) est relue comme dans `relayChat`. La route choisit le flux selon l'en-tête `Accept` du navigateur. B1 : `CHAT_STREAM_VARIANT = "base"`, `B1_STREAM_HEADERS`, `copyStream`, testés, inactifs.
- **Page** : `Accept: text/event-stream` ; lecteur SSE pur `src/lib/sse.ts` ; état `streaming` (texte provisoire `data-provisional`, `aria-busy`, hors de la région `role="status"`, texte masqué « Réponse en cours d'écriture ») ; délais 20 s sans premier affichage et 90 s au total, avec annulation explicite de la lecture à l'abandon. Instrument `?mesure=1` : `src/lib/stream-measure.ts` (seul le texte d'une question du mini Jeu est repris, reconnu à l'identique ; sinon « hors mini Jeu, texte non repris »), panneau « Mesure du flux » et « Copier le résultat ».
- **Génération simulée** : avec `stream: true`, réponse SSE en morceaux (marqueur coupé après 3 caractères, chaque `[P` séparé de son numéro) ; repère `[simulation:flux-lent]` (morceaux espacés de 400 ms) pour l'e2e.
- **Test réel** : `test:chat:live` appelle `chat` en flux ; nouveaux critères bloquants (termes interdits dans le texte provisoire, repère ou marqueur dans un `delta`, `delta` avant un refus) ; premier `delta` relevé. Délai de requête du script porté à 95 s (décision 3 = A du 2026-11-17 : chaîne `chat` 85 s < script 95 s, testée).
- **Écart avec la matrice, tranché le 2026-11-17 (2 = A, ligne corrigée) :** ligne « Rejoué » (même `clientRequestId`, déjà répondu → un `done`, aucun appel). `chat` ne sait pas encore renvoyer une réponse enregistrée : le rejeu reste le rejeu minimal de la 5.2a-2 (`REQUEST_IN_PROGRESS` 409 en JSON, sans réservation ni appel), le rejeu complet étant la story 5.9 (deferred-work : « le rejeu de `chat` ne fait que refuser »). La page envoie un nouvel identifiant à chaque envoi : le cas n'est pas atteignable depuis l'écran. Aucun `done` de rejeu n'a été implémenté pour ne pas anticiper la 5.9 ; à confirmer par l'utilisateur.
- **Vérification locale (2026-11-17)** : `npx tsc --noEmit` et `npm run lint` propres ; `npx vitest run tests/unit` : 68 fichiers, 1 405 tests réussis ; `npm run build:ci` vert (contrôle des secrets compris). **Non exécutés** : `npx supabase db reset`, tests d'intégration et `npm run test:e2e` : le moteur Docker Desktop répond « 500 Internal Server Error » (`docker info`), la pile Supabase locale ne démarre pas. Les tests d'intégration (`tests/integration/chat.test.ts`, « fonction chat en flux ») et e2e (`tests/e2e/assistant.spec.ts`, cinq tests « story 5.5 ») sont écrits mais jamais lancés : à exécuter avant le déploiement. Pas de `deno check` (Deno absent) : le code des fonctions est vérifié par `tsc` seulement.
- **Reste à faire (utilisateur)** : relance de Docker et des suites locales ; revue séparée (Q2 = A) ; commit ; `deploy:supabase` puis push ; `npm run test:chat:live` ; mesure de 10 questions sur `/assistant?mesure=1` et rapport ; point de contrôle B3 du 18/11 au soir ; journal de Vibe Coding.

### Point d'arrêt du 2026-11-17 (redémarrage de Windows : Docker indique « Windows hypervisor is not running »)

État exact, pour reprendre dans une nouvelle session sans rien perdre :
- **Code écrit, rien commité, rien déployé, rien poussé.** Arbre de travail : 25 fichiers modifiés et 5 nouveaux (`src/lib/sse.ts`, `src/lib/stream-measure.ts`, `supabase/functions/_shared/rag/stream-mask.ts`, `tests/unit/stream-mask.test.ts`, `tests/unit/stream-measure.test.ts`). HEAD = `fa490c1` (spec 5.5, **non poussé** ; `origin/main` = `a69d361`). Statut : spec et `sprint-status.yaml` à `in-progress`.
- **Vérifié** : `tsc`, lint, `build:ci`, tests unitaires (1 405) verts.
- **Jamais lancés** : `npx supabase db reset`, tests d'intégration, `npm run test:e2e` (Docker en panne). À lancer d'un seul tenant (`db reset`, `npm test` depuis PowerShell, lint, tsc, `build:ci`, `check:secrets`, e2e complète) **après** application des deux décisions ci-dessous. Après le redémarrage : démarrer Docker Desktop, `npx supabase start` si besoin, `docker start supabase_edge_runtime_projet-ia` si le conteneur est arrêté.
- **Décisions de l'utilisateur du 2026-11-17, appliquées le 2026-11-17** (ligne « Rejoué » et règle des événements corrigées ; `REQUEST_TIMEOUT_MS` = 95 s avec son test) :
  - **2 = A (ligne « Rejoué » de la matrice)** : garder `REQUEST_IN_PROGRESS` 409 en JSON, sans réservation ni appel ; corriger la ligne de la matrice en conséquence, avec une note datée (le renvoi de la réponse enregistrée reste dans la story 5.9) ; test correspondant.
  - **3 = A (délai de `test:chat:live`)** : `REQUEST_TIMEOUT_MS` de `scripts/test-chat-live.ts` porté de 75 s à **95 s**, pour la chaîne `chat` 85 s < script 95 s, vérifiée par un test (alignement sur l'échéance du serveur, pas un délai augmenté pour faire passer un test).
- **Ensuite, dans l'ordre** : vérification complète verte → étape 4 du workflow (spec `in-review`, diff depuis `fa490c1`, **un relecteur séparé** centré sur le masquage en flux, le tampon du marqueur, les délais, l'enregistrement après déconnexion et la règle « rien en `delta` de pire que le texte final ») → tri dans la spec → commit sur accord → `deploy:supabase` (utilisateur) → push → `test:chat:live` (utilisateur) → mesure `?mesure=1` → clôture. Point de contrôle B3 le 18/11 au soir.

## Verification

**Commands:**
- `npx supabase db reset` puis `npm test` (PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run check:secrets`, `npm run test:e2e` (d'un seul tenant) -- expected : vert.
- Après `deploy:supabase` et push : `npm run test:chat:live` (utilisateur) -- expected : 15 sur 15.

**Manual checks (production) :**
- 10 questions mesurées (Q1) ; q1, c1, h1, o1 : écriture progressive sans repère, refus d'un bloc.

## Review Triage Log

Revue du 2026-11-17 : un relecteur séparé (Edge Case Hunter), décision Q2 = A, centré sur le masquage en flux, le tampon du marqueur, les délais, l'enregistrement après déconnexion et la règle « rien en `delta` de pire que le texte final ».

| # | Constat | Verdict | Preuve | Suite |
|---|---------|---------|--------|-------|
| 1 | Repère à lettres mêlées (`[P1, S3]`) coupé à l'autre lettre : « S3] » dans un `delta` | medium | `isTokenChar` n'accepte que la lettre d'ouverture ; `readCitations` retire tout le repère du texte validé : contraire à la règle « rien en `delta` de pire ». | patch : corrigé (2026-11-17) |
| 2 | Espace Unicode hors `TOKEN_CHAR` dans un repère (`[P1\u20092]`) : « 2] » dans un `delta` | low | `CITATION_LIKE` utilise `\s` ; même règle ; correction directe de la classe. | patch : corrigé (2026-11-17) |
| 3 | Délai du premier affichage : le navigateur compte 20 s dès le clic, la génération 20 s seulement après recherche et relecture | medium | Un premier morceau lent (après ~17 s de génération) fait échouer l'écran à 20 s alors que `chat` va au bout, enregistre et décompte une réponse que l'utilisateur a vue en panne. Les valeurs sont dans la partie figée de la spec. | tranché par l'utilisateur le 2026-11-17 (option A : premier affichage de `chat` ≤ 17 s, note dans la partie figée) ; patch : corrigé (2026-11-17) |
| 4 | Échéance de 85 s + nettoyage (≤ 10 s) : l'événement `error` peut arriver après les 90 s du navigateur | low | Les deux issues affichent la même panne `AI_TIMEOUT` avec « Réessayer » ; aucune différence visible. | rejeté |
| 5 | `streamAnswer` : la nouvelle tentative relance les minuteurs de 20 s et 70 s | low | Bornes de la spec dépassables, seulement limitées par les 85 s de `chat` ; correction directe (échéance commune). | patch : corrigé (2026-11-17) |
| 6 | Relais : `chat` encore en mode JSON répondrait après les 25 s d'attente des en-têtes | false | Ordre de déploiement imposé par la spec : `deploy:supabase` avant le push ; le nouveau relais ne parle jamais à l'ancien `chat` ; les refus JSON avant flux sont immédiats. | rejeté |
| 7 | Lecture du corps JSON non bornée après les en-têtes | low | Seuls les refus avant flux (corps court, immédiat) passent par là ; borné par `maxDuration`. | rejeté |
| 8 | Refus ou marqueur invalide : lecture arrêtée avant le morceau d'usage, `chat_done` journalise 0 token | low | Sous-estimation du coût dans les journaux ; correction directe (usage inconnu, `usage_missing`). | patch : corrigé (2026-11-17) |

Cas limite connu après l'option A (constat de l'implémentation, 2026-11-17) : pour un refus, le minuteur de 17 s reste armé pendant `save_assistant_answer` ; s'il expire pendant cet enregistrement et que la base avait déjà validé le refus, la Conversation porte le refus et un échec. Très improbable (enregistrement qui se termine exactement à 17 s) ; même famille que le report de la 5.9 (« `save_assistant_answer` validé puis… `record_assistant_failure` »), à traiter avec lui.
