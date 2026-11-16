---
title: 'Story 5.2b : Page Assistant : poser une question et voir les Sources'
type: 'feature'
created: '2026-11-16'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-2a-2-fonction-chat-et-garde-fou.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La fonction `chat` et la route `/api/chat` (5.2a-2) répondent, mais aucun écran ne permet à un Collaborateur de poser une question ; la page `/assistant` n'affiche qu'un titre, et les entrées prévues depuis le Tableau de bord (3.5), la page Document (3.2) et la Recherche sans résultat (4.1b) attendent cette story. La route `/api/chat` n'a jamais été exercée en production.

**Approach:** Page `/assistant` cliente : champ de question, fil (question, état neutre, réponse d'un bloc avec puces de Source non cliquables, refus provisoire, alertes), appel de `/api/chat` seulement. Boutons « Poser une question » et « Poser la question à l'Assistant » aux emplacements réservés. Aucun changement de base ni de fonction : push seul.

## Boundaries & Constraints

**Always:**
- **Frontière (AR-21, NFR-2)** : le navigateur n'appelle que `/api/chat` ; jamais `/functions/v1/` ni `api.openai.com` (interception Playwright sur tout le parcours).
- **Fil** : question affichée dès l'envoi ; état neutre « Recherche dans les Documents… » (`aria-busy="true"`) ; réponse affichée d'un bloc, texte brut (jamais interprété comme HTML), citations `[P{n}]` laissées telles quelles jusqu'à 5.4 ; puces de Source sous la réponse, titre du Document, non cliquables (5.7) ; Source de Document supprimé : « {titre} — Document supprimé ».
- **Refus provisoire (décision de l'utilisateur du 2026-11-16)** : `kind = refusal_info_absente` → texte du refus seul, dans un bloc visuellement distinct d'une réponse (autre fond ou bordure, icône d'information), **sans zone Sources**, sans les boutons de la 5.3.
- **Un seul échange à l'écran (décision de l'utilisateur du 2026-11-16, avant la 5.8)** : chaque question crée sa Conversation ; une nouvelle question remplace l'échange précédent à l'écran (rien n'est perdu en base, l'Historique arrive en 5.6). Aucun empilement qui laisserait croire à un suivi.
- **Champ** : Entrée envoie, Maj+Entrée va à la ligne (Entrée ignorée pendant une composition IME) ; compteur « n / 2 000 » visible ; « Envoyer » `aria-disabled` dès le premier clic jusqu'à la fin ; question vide ou faite d'espaces : pas d'appel, message `texts.assistant.questionEmpty` ; plus de 2 000 caractères : pas d'appel, `questionTooLong`.
- **Erreurs** : alerte `ErrorAlert` à la place de la réponse, question conservée dans le fil. Texte = `error.message` du corps AD-19 (catalogue). « Réessayer » seulement si `retryable`. `QUOTA_EXCEEDED` et `AI_DAILY_CAP_REACHED` : pas de « Réessayer », heure en UTC (décision du 16/11). 401 : `router.refresh()` (session expirée). Délai client 75 s (relais 70 s) puis `AI_TIMEOUT` local.
- **« Réessayer » (décision de l'utilisateur du 2026-11-16)** : envoie la **même question avec un nouveau `clientRequestId`**. Raison : la question échouée est déjà enregistrée avec l'ancien identifiant (index unique `messages_owner_request_question_key`) ; le renvoyer donnerait toujours `409 REQUEST_IN_PROGRESS` jusqu'à la 5.9. Conséquences : une **nouvelle Conversation** est créée à chaque essai, la Conversation échouée reste en base avec son échec (visible dans l'Historique en 5.6, regroupée par la 5.9) ; le quota réserve une **nouvelle unité** (l'unité de l'essai échoué a été rendue ou consommée selon la règle de libération). À l'écran : l'alerte disparaît, la bulle de question n'est **pas** dupliquée, l'état neutre reprend à la place de l'alerte, puis la réponse ou une nouvelle alerte. Un `409 REQUEST_IN_PROGRESS` (double envoi) affiche son texte sans « Réessayer ».
- **Report g (5.2a-2)** : textes propres pour la saisie invalide : `questionEmpty` (« Écrivez votre question avant de l'envoyer. ») côté navigateur et route ; `VALIDATION_FAILED` de la route et de `chat` (vide, `clientRequestId` invalide, corps illisible, 405) → `texts.assistant.invalidRequest` (« Votre question n'a pas pu être envoyée. Vérifiez-la puis réessayez. »), jamais « Le service d'IA ne répond pas ». Textes ajoutés à EXPERIENCE.md, ainsi que `inProgress`.
- **Accessibilité** : réponse annoncée une seule fois, quand elle est confirmée (région `role="status"` toujours montée) ; erreur : focus sur l'alerte ; après une réponse ou un refus, le focus reste dans le champ ; à l'ouverture par un bouton, focus dans le champ (`PageTitle focusTargetId`).
- **Entrées** : « Poser une question » dans la bande d'actions du Tableau de bord et dans `readyActions` de la page Document (Document *prêt* seulement) → `/assistant`, nouvelle Conversation, focus dans le champ. Recherche sans résultat : phrase complète de FR-15 rétablie **avec** le bouton « Poser la question à l'Assistant » → `/assistant?question={Requête}`, Requête pré-remplie (2 000 caractères au plus), jamais envoyée d'office.
- **Tests e2e** : remise à zéro **automatique** des compteurs (`ai_usage`, `ai_usage_global`, `ai_reservations`) dans la préparation des tests (`globalSetup` Playwright), refusée si la cible n'est pas la pile locale (127.0.0.1) ; jamais de manipulation à la main.
- **Revue** : un relecteur séparé (pas l'agent qui implémente ni Claude principal), centré sur le relais `/api/chat` (session, erreurs, délai, abandon), l'absence d'appel direct à Supabase Functions ou à OpenAI depuis le navigateur, l'accessibilité du fil (annonces, focus, état occupé).
- Note du journal sur la clôture manuelle de la 5.2a-2 incluse dans le premier commit de la story.

**Never:** diffusion (5.5) ; marqueurs et bloc de refus complet (5.3) ; retrait ou rendu des citations (5.4) ; Historique et `/assistant/[id]` (5.6) ; puces cliquables et panneau Source (5.7) ; questions de suivi (5.8) ; rejeu et dédoublonnage (5.9) ; affichage du quota restant et fuseau du navigateur (5.10) ; changement de base, de `chat` ou de `_shared/` ; `deploy:supabase` ; appel du navigateur à une Edge Function ; texte de réponse interprété comme HTML ; délai de test augmenté ; commit ou push sans accord.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nominal | q1 envoyée | question, état neutre, réponse « 5 jours ouvrés », puce « Procédure de facturation » ; annonce unique | — |
| Hors base | aucun Passage | bloc de refus distinct, sans zone Sources | — |
| Panne | `/api/chat` 503 `AI_UNAVAILABLE` | alerte + « Réessayer » ; focus sur l'alerte | Réessayer : nouveau `clientRequestId`, une seule bulle de question |
| Quota / plafond | 429 / 503 avec `resetAt` | texte du catalogue, heure UTC, sans « Réessayer » | — |
| Double envoi | 409 `REQUEST_IN_PROGRESS` | texte « déjà en cours », sans « Réessayer » | — |
| Vide | espaces seuls | aucun appel, `questionEmpty` | — |
| Trop longue | 2 001 caractères | aucun appel, compteur et `questionTooLong` | — |
| Session expirée | 401 | rafraîchissement, page de connexion | — |
| Délai client | pas de réponse en 75 s | alerte `AI_TIMEOUT` + « Réessayer » | abandon de la requête |
| Recherche sans résultat | Requête r | phrase FR-15 complète + bouton ; champ pré-rempli, non envoyé | — |
| Seconde question | réponse affichée, nouvelle question envoyée | l'échange précédent disparaît de l'écran ; seul le nouvel échange est affiché | — |

</frozen-after-approval>

## Code Map

- `src/app/(app)/assistant/page.tsx` -- page existante (titre seul) ; modèle `recherche/page.tsx` : `PageTitle focusTargetId`, vue cliente sous `Suspense`, aucune donnée dans la partie prérendue ; lire `searchParams.question`.
- `src/components/shell/nav-items.ts:9` -- entrée `/assistant` déjà présente.
- `src/components/search/search-view.tsx` -- modèle d'appel client : `AbortController` (l. 63-105, 116), `isCurrent`, 401 → `router.refresh()`, `safeParse`, focus vers `role="status"` ou `ErrorAlert` (l. 120-128) ; emplacement du bouton l. 232-234.
- `src/components/forms/error-alert.tsx`, `submit-button.tsx` -- alerte (`role="alert"`, `action`) et `aria-disabled`.
- `src/components/dashboard/action-band.tsx:18-19`, `src/components/documents/document-actions.tsx:10-13` (`readyActions`) -- emplacements réservés.
- `src/lib/texts.ts` -- `assistant` (l. 234-250), `search.noResults` (l. 229-231), `titles.assistantEmpty` ; à ajouter : libellé et aide du champ, « Envoyer », compteur, état neutre, « Poser une question », « Poser la question à l'Assistant », `questionEmpty`, `invalidRequest`, « Document supprimé ».
- `src/lib/schemas/chat.ts` -- `chatRequestSchema`, `chatResponseSchema`, `CHAT_MAX_QUESTION_LENGTH` : réutiliser côté navigateur.
- `src/app/api/chat/route.ts`, `src/server/chat/relay.ts`, `supabase/functions/chat/index.ts` -- seul changement permis : texte de `VALIDATION_FAILED` (report g) ; `chat/index.ts` ne change pas (le relais remplace déjà le message par le catalogue : vérifier que `chatMessage()` couvre `VALIDATION_FAILED`).
- `playwright.config.ts`, `tests/support/local-supabase.ts` (`localSupabase`, `localSqlRows`), `tests/support/e2e-auth.ts` (Compte par worker) -- ajouter `globalSetup` ; Documents prêts créés par client `service_role` local comme `tests/e2e/search-page.spec.ts:21-27` ; panne simulée par `page.route("**/api/chat")` ; génération simulée locale (`FAKE_NO_CITATION_MARKER`).
- `_bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-03/EXPERIENCE.md` -- E4, textes.
- `docs/journal-vibe-coding.md` -- note déjà écrite (clôture manuelle de la 5.2a-2).

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/texts.ts`, EXPERIENCE.md -- textes listés au Code Map, phrase FR-15 complète.
- [ ] `src/app/(app)/assistant/page.tsx`, `src/components/assistant/*` -- page, champ, fil, refus provisoire, alertes, « Réessayer ».
- [ ] `src/server/chat/relay.ts`, `src/app/api/chat/route.ts` -- report g.
- [ ] `action-band.tsx`, `document-actions.tsx`, `search-view.tsx` -- boutons.
- [ ] `playwright.config.ts` + `tests/e2e/global-setup.ts` -- remise à zéro automatique des compteurs locaux.
- [ ] Tests unitaires (vue : états, clavier, Réessayer et `clientRequestId`, report g) et e2e (`tests/e2e/assistant.spec.ts` : nominal avec génération simulée, refus, panne et Réessayer, quota simulé, clavier, interception réseau, trois entrées), deux projets (ordinateur, mobile-375).
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- reports g et h marqués traités par la 5.2b.

**Acceptance Criteria:**
- Given un parcours e2e complet, when toutes les requêtes du navigateur sont collectées, then aucune ne vise `/functions/v1/` ni `api.openai.com`.
- Given deux lancements e2e successifs le même jour, when la suite démarre, then les compteurs locaux sont à zéro sans action manuelle.
- Given la production après push, when l'utilisateur suit la vérification ci-dessous, then chaque observation attendue est constatée.

## Design Notes

Ordre : textes et vue avec `/api/chat` simulée, puis boutons, puis e2e sur la pile locale, puis push et vérification en production. Estimation : une journée. Coût en production : moins de 0,01 $.

## Verification

**Commands:**
- `npm test` (PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run check:secrets`, `npm run test:e2e` -- expected : vert.

**Manual checks (production, navigateur de l'utilisateur, après push et déploiement Vercel ; onglet Réseau ouvert, filtre « Fetch/XHR ») :**
1. `/assistant`, « Sous quel délai une facture doit-elle être émise après la livraison ? » → état neutre, puis réponse contenant « 5 jours ouvrés », puce « Procédure de facturation » ; Réseau : un seul `POST /api/chat` (200), aucune requête vers `supabase.co/functions` ni `openai.com` ; en-tête `x-vercel-id` de `/api/chat` contenant `::fra1::`.
2. « recette du gâteau au chocolat » (s1, 0 résultat mesuré au seuil 0,40) → bloc de refus distinct, sans zone Sources ; Réseau : un `POST /api/chat` (200).
3. Question faite d'espaces seuls → message « Écrivez votre question avant de l'envoyer. », **aucune** requête `/api/chat` ; puis 2 001 caractères (coller un texte long) → compteur et message de longueur, aucune requête.
4. Recherche « recette du gâteau au chocolat » → phrase FR-15 complète et bouton ; clic → `/assistant` avec la Requête dans le champ, rien d'envoyé (aucune requête `/api/chat`).
5. Tableau de bord et page d'un Document prêt → « Poser une question » ouvre `/assistant`, focus dans le champ.
