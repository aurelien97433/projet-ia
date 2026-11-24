---
title: 'Story 7.3 : Parcours UJ-1 à UJ-3 au clavier et à 375 px'
type: 'feature'
created: '2026-11-24'
status: 'in-review'
baseline_commit: 'e341abb8dc638480ed21d99e86dfff327a77d2ae'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/tests/e2e/uj-2.spec.ts'
  - '{project-root}/tests/e2e/support/uj2.ts'
  - '{project-root}/playwright.config.ts'
  - '{project-root}/playwright.live.config.ts'
  - '{project-root}/scripts/check-secrets.ts'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** le jury doit pouvoir dérouler les trois parcours (PRD §2 : UJ-1 relance d'une facture, UJ-2 ajout puis question, UJ-3 nouvel arrivant) au clavier seul et sur un écran de 375 px, sans défilement horizontal ni violation d'accessibilité détectable ; le cloisonnement entre Comptes (SM-6), le refus des appels sans session et l'absence de secret côté navigateur doivent être prouvés sur la démo. Seul UJ-2 a aujourd'hui un test de bout en bout (6.2). Deux tests instables sous charge sont reportés à cette story.

**Approach:** deux tests Playwright `uj-1.spec.ts` et `uj-3.spec.ts` sur le modèle de `uj-2.spec.ts` (mode local, génération simulée, projets `ordinateur` 1 280 px et `mobile-375`), avec axe, contrôle du défilement horizontal et relevé réseau ; un script `npm run test:security:live` lancé par l'utilisateur sur la production (SM-6, appels sans session, code envoyé au navigateur) ; correction des deux tests instables. Aucun changement de l'application attendu ; s'il en faut un (violation axe, débordement, focus), il est minimal, signalé et relu.

## Boundaries & Constraints

**Always:**
- **UJ-1** (`tests/e2e/uj-1.spec.ts`, clavier seul : focus posé puis Entrée, Tab, flèches, frappe ; aucun clic) : Compte temporaire, Documents « Procédure de facturation » et « FAQ comptabilité » préchargés pour le test ; depuis le Tableau de bord, nouvelle Conversation, question « comment je relance un client qui n'a pas payé ? » ; réponse avec au moins une Source ; ouverture d'une Source au clavier → page du Document au Passage concerné ; Conversation présente dans l'Historique. Cas limite : « quel est le budget marketing 2027 ? » → refus « information absente », aucune Source.
- **UJ-3** (`tests/e2e/uj-3.spec.ts`, clavier seul) : création du Compte par `/inscription` ; Recherche « organisation des congés » depuis le Tableau de bord → résultats avec Passage mis en avant, ouverture de la Procédure congés et absences ; nouvelle Conversation « comment poser mes congés ? », suivi « et si je pose moins de 3 jours ? » dans la même Conversation ; réouverture depuis l'Historique, nouvelle question dans la même Conversation.
- Les deux tests, sur les deux projets : **axe** (`@axe-core/playwright`, règles WCAG 2 A et AA) sans violation sur chaque écran du parcours ; **aucun défilement horizontal** (`scrollWidth ≤ clientWidth`) sur la lecture d'un Document, la Recherche et la Conversation ; **relevé réseau du navigateur** : aucune requête vers `api.openai.com` ni vers `/functions/v1/`. Nettoyage du Compte temporaire comme `uj-2.spec.ts` (mode local).
- **`npm run test:security:live`** (nouveau script, lancé par l'utilisateur seul, production, `.env.seed`) :
  - **SM-6** avec les Comptes de démonstration A et B (sessions par mot de passe, jamais `service_role`) : A crée une Note marquée « — test SM-6 {horodatage} » ; B la voit (lecture) et la retrouve par `semantic-search` ; B ne peut ni la modifier ni la supprimer (0 ligne ou refus, Note inchangée relue par A) ; **Conversations (décision de l'utilisateur du 2026-11-24, aucun droit DELETE sur les Conversations depuis la 5.1) :** le script ne crée aucune Conversation ; A compte ses Conversations existantes (au moins 1 exigée, sinon arrêt et critère non prouvé, jamais un succès vide) ; B tente de lire les Conversations et les messages de A : 0 ligne attendue ; 0 unité. Même garantie de nettoyage qu'en 6.2 (décision de l'utilisateur du 2026-11-24) : la Note est créée par le Compte de démonstration A ; suppression par la session de A (Note) après chaque essai et même en cas d'échec ; contrôle final qu'il ne reste aucun Document « — test SM-6 » ; aucune trace, vidéo ni capture ; aucun mot de passe, e-mail ni jeton dans le rapport ni dans la sortie.
  - **Sans session** : chaque Route Handler de `src/app/api` (`chat`, `conversations`, `documents`, `documents/[id]`, `documents/[id]/status`, `documents/[id]/summary`, `documents/statuses`, `search`, `uploads`), avec sa méthode réelle → 401, code `UNAUTHENTICATED`, aucune donnée dans le corps. **Écart avec l'epic (validé par l'utilisateur le 2026-11-24)** : la route `quota` citée par l'epic n'existe pas (quota lu côté serveur) ; les 9 Route Handlers réels sont testés, écart consigné dans le rapport.
  - **Code envoyé au navigateur** : page de connexion et fichiers `/_next/static/` qu'elle charge, analysés avec les motifs de `check-secrets.ts` → aucun secret ; aucune adresse `api.openai.com` ni clé `service_role`.
  - Rapport `docs/mesures/securite-live.md` (jamais écrasé : `-2`…), sans secret, e-mail, jeton ni URL de production.
- **Reports à traiter :**
  - `search-page.spec.ts` « parcours réel au clavier » (focus du champ de Recherche absent après « Tableau de bord » sous charge) : trancher avec une trace (navigation côté client ou chargement complet), puis corriger le test (attente fiable de la navigation) ou l'application si le chargement complet est réel ; consigner la cause.
  - Constat C7 de la 5.10 : test « génération bornée au temps restant moins le délai d'enregistrement » (`tests/unit/chat-function.test.ts`) rendu déterministe (horloge contrôlée), comme le test « délais du flux » de la 5.5.
- **Relecteur séparé** (7.3, règle 11 du plan) sur le diff complet, en plus de la revue de Claude.
- SM-6 et les appels sans session sont consignés dans le rapport et dans le journal.

**Ask First:** toute modification du code de l'application (correctif d'accessibilité, de mise en page ou de focus) au-delà d'une correction évidente d'une ligne ; toute exécution contre la production autre que `test:security:live`.

**Never:** clic dans UJ-1 et UJ-3 ; Document du Jeu de démonstration modifié ou supprimé ; `service_role` dans un test live ; `test:security:live` lancé par l'agent ; délai d'attente allongé pour masquer une instabilité.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| UJ-1 nominal | question de relance | réponse sourcée, Source ouverte au Passage, Conversation dans l'Historique |
| UJ-1 cas limite | budget marketing 2027 | refus « information absente », aucune Source |
| UJ-3 suivi | « et si je pose moins de 3 jours ? » | réponse dans la même Conversation |
| 375 px | lecture, Recherche, Conversation | aucun défilement horizontal, axe sans violation |
| SM-6 écriture par B | modification ou suppression de la Note de A | refusée, Note inchangée |
| SM-6 Conversations | B lit les Conversations de A | aucune ligne |
| Sans session | chaque Route Handler | 401 `UNAUTHENTICATED`, aucune donnée |
| Échec de `test:security:live` en cours | assertion en échec | nettoyage par A, 0 Document « — test SM-6 » restant |

</frozen-after-approval>

## Code Map

- `tests/e2e/uj-1.spec.ts`, `tests/e2e/uj-3.spec.ts` (nouveaux) -- parcours, axe, défilement, relevé réseau ; support commun extrait de `tests/e2e/support/uj2.ts` si utile (clavier, sessions).
- `scripts/test-security-live.ts` (nouveau) + `package.json` -- SM-6, appels sans session, analyse du code envoyé ; réutilise `openLiveSession`, `cleanupMarkedDocuments` (marque « — test SM-6 »), motifs de `scripts/check-secrets.ts`.
- `tests/unit/test-security-live.test.ts` (nouveau) -- évaluation des réponses, rapport sans secret, liste des Route Handlers comparée à `src/app/api`.
- `tests/e2e/search-page.spec.ts`, `tests/unit/chat-function.test.ts` -- reports.
- `docs/environnements.md` -- ligne `test:security:live`.

## Tasks & Acceptance

**Execution:**
- [x] `uj-1.spec.ts` et `uj-3.spec.ts` (deux projets, clavier seul, axe, défilement, relevé réseau).
- [x] `test:security:live` (SM-6, sans session, code envoyé), tests unitaires, `docs/environnements.md`.
- [x] Report `search-page.spec.ts` : cause tranchée par une trace, correctif.
- [x] Report C7 : test déterministe.
- [x] Relecteur séparé, puis tri des constats.

**Acceptance Criteria:**
- Given la pile locale, when `npx playwright test uj-1.spec.ts uj-3.spec.ts` s'exécute, then les 4 exécutions (2 parcours × 2 largeurs) passent au clavier seul, sans violation axe, sans défilement horizontal ni requête vers OpenAI ou `/functions/v1/`.
- Given la production et `.env.seed`, when l'utilisateur lance `npm run test:security:live`, then les 3 critères de SM-6 sont vérifiés, chaque Route Handler sans session répond 401 `UNAUTHENTICATED` sans donnée, aucun secret n'est trouvé dans le code envoyé, et aucun Document « — test SM-6 » ne reste.
- Given la suite e2e complète et la suite Vitest complète, when elles s'exécutent deux fois de suite, then `search-page.spec.ts` et le test C7 passent les deux fois sans délai allongé.

## Design Notes

UJ-1 et UJ-3 restent locaux (génération simulée) : la production est déjà prouvée par `test:uj2:live`, `test:chat:live` et `measure:all`, et la répétition générale (7.5) les rejoue à la main. SM-6 demande l'environnement de démo : `test:security:live` y crée et supprime ses propres données (Note marquée), jamais celles du Jeu. Coût de `test:security:live` : aucune unité (vectorisation de la Note et Recherche seulement). La 7.8 (audit global) rejouera ces tests après ses corrections. **Estimation : 4 à 5 h** + passage de l'utilisateur (environ 5 min).

## Verification

**Commands:** `npx playwright test uj-1.spec.ts uj-3.spec.ts` ; `npm run test:e2e` deux fois ; `npm test` deux fois (depuis PowerShell) ; `npm run lint`, `npx tsc --noEmit`, `npm run check:secrets`, `npm run build:ci`.

**Utilisateur :** après le push et Vercel prêt, `npm run test:security:live` ; relecture du rapport ; Bibliothèque de production sans Document « — test SM-6 ».

## Review Triage Log

Relecteur séparé (règle 11) sur le diff complet, puis tri par Claude.

| # | Constat | Verdict | Preuve | Suite |
|---|---------|---------|--------|-------|
| F1 | Ctrl+C contourne le nettoyage (`finally` seul) | high | aucun gestionnaire SIGINT/SIGTERM ; Note « — test SM-6 » visible du jury jusqu'au passage suivant | patch : gestionnaires comme `load-test-1mo.ts` + pré-nettoyage |
| F2 | Conversation de A jamais supprimée (aucun droit DELETE) | high | migration `20261113120000_conversations.sql` sans DELETE | décision de l'utilisateur : aucune Conversation créée, Conversations existantes de A (spec mise à jour) |
| F3 | Critère 3 (Sources) pouvait passer à vide | medium | `bSources` sur une Conversation sans Source de la Note | rendu caduc par la décision F2 ; au moins 1 Conversation et 1 message de A exigés |
| F4 | Toute erreur comptée comme refus | low | `refused` ; `noteUnchanged` relu par A reste la preuve | patch : code d'erreur au détail |
| F5 | Hôte Supabase non masqué dans une ligne de sortie | low | l.556 hors `redact` | patch |
| F6 | Analyse du code envoyé limitée à `/connexion` | low | conforme à la lettre de la spec | patch : portée écrite dans le rapport |
| F7 | Verrou non libéré si le nettoyage échoue | medium | `releaseLock` hors `finally` | patch |
| F8 | Verrou abandonné (300 s) plus long que l'attente (240 s) | medium | relance après Ctrl+C : uj-1 et uj-2 en échec | patch : verrous effacés dans `global-setup` |
| F9 | La libération peut effacer le verrou d'un autre | low | `rmSync` sans contrôle du détenteur | patch : jeton |
| F10 | Suivi d'UJ-3 accepté s'il est refusé | medium | `replies` accepte `[data-refusal]` | patch : réponse et Source exigées |
| F11 | Historique par `page.goto`, Assistant vide hors axe | low | spec : clavier seul, axe sur chaque écran | patch |
| F12 | Refus « budget 2027 » dépendant de la base locale | low | vectorisation simulée, seuil 0,2 | defer (deferred-work) |
| F13 | Défaut de focus de l'application (`title-focus.ts`) sous navigation rapide | low | diagnostic confirmé, test corrigé | defer (deferred-work, proposé à la 7.8) |
| F14 | Défaut de l'application trouvé par UJ-1 au clavier (navigation vers « Assistant ») : après une Conversation, revenir sur « Assistant » réaffiche l'ancien fil sous « Que voulez-vous savoir ? » et la question suivante part dans l'ancienne Conversation | high | `AssistantView` passe l'adresse à `/assistant/{id}` par `history.replaceState` dans la route `/assistant`, que Next 16 (`cacheComponents`) garde en mémoire avec son état ; reproduit deux fois, deux largeurs | décision de l'utilisateur du 2026-11-24 (Ask First) : correctif de l'application, l'Assistant ouvert par la navigation repart d'une Conversation neuve ; tests ; relecteur séparé sur ce correctif |
| F15 | Revue séparée du correctif F14 : le nettoyage au masquage vide aussi la page réaffichée à `/assistant/{id}` par Retour (après « Ouvrir la page complète » d'une Source, par exemple) | high | après `replaceState`, l'entrée `/assistant/{id}` garde l'instance de `/assistant` ; fil vide sous une adresse de Conversation, question suivante dans une nouvelle Conversation | patch : remise à zéro au réaffichage, seulement si l'adresse est `/assistant` ; test « Retour » |
| F16 | Condition de remise à zéro limitée à une Conversation adoptée : un fil non vide sans Conversation (question en vol au départ, 409 en attente) reste affiché, « Réessayer » peut reprendre l'ancienne Conversation | medium | `conversationIdRef.current !== null` seul | patch : remise aussi sur fil non vide, sans saut de focus ; test « question en vol » |
| F17 | Brouillon du champ, mesures et Documents supprimés non remis à zéro | low | identique à « + Nouvelle Conversation » | accepté |

## Vérification (2026-11-24, après les correctifs de revue)

- `npm run test:e2e` complet : 407 réussis, 0 échec, 19 ignorés (tests réservés à un seul projet).
- `npm test` (PowerShell) : 106 fichiers, 2 242 tests réussis.
- `npx tsc --noEmit`, `npm run lint`, `npm run build:ci` (secrets du code envoyé : aucun) : verts.
- Code de l'application modifié (décision de l'utilisateur, F14) : `src/components/assistant/assistant-view.tsx` seulement ; relu par un second relecteur séparé (F15 à F17).
