---
title: 'Story 5.2b : Page Assistant : poser une question et voir les Sources'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_commit: 'ce8919fe7ed60c428b3bd52259e2d3bd65a4d06c'
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
- **Erreurs** : alerte `ErrorAlert` à la place de la réponse, question conservée dans le fil. Texte = `error.message` du corps AD-19 (catalogue). « Réessayer » seulement si `retryable`. `QUOTA_EXCEEDED` et `AI_DAILY_CAP_REACHED` : pas de « Réessayer », heure en UTC (décision du 16/11). 401 : `router.refresh()` (session expirée). Délai client 85 s puis `AI_TIMEOUT` local. *Correction du 2026-11-16, décision de l'utilisateur après la revue (constat 1.1) : 75 s à l'origine ; le relais ne démarre qu'après `requireUser`, `getSession` et un éventuel démarrage à froid, 5 s de marge ne suffisaient pas. Chaîne des délais : `chat` 60 s < relais 70 s < navigateur 85 s < `maxDuration` 120 s.*
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
| Délai client | pas de réponse en 85 s | alerte `AI_TIMEOUT` + « Réessayer » | abandon de la requête |
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
- [x] `src/lib/texts.ts`, EXPERIENCE.md -- textes listés au Code Map, phrase FR-15 complète.
- [x] `src/app/(app)/assistant/page.tsx`, `src/components/assistant/*` -- page, champ, fil, refus provisoire, alertes, « Réessayer ».
- [x] `src/server/chat/relay.ts`, `src/app/api/chat/route.ts` -- report g.
- [x] `action-band.tsx`, `document-actions.tsx`, `search-view.tsx` -- boutons.
- [x] `playwright.config.ts` + `tests/e2e/global-setup.ts` -- remise à zéro automatique des compteurs locaux.
- [x] Tests unitaires (vue : états, clavier, Réessayer et `clientRequestId`, report g) et e2e (`tests/e2e/assistant.spec.ts` : nominal avec génération simulée, refus, panne et Réessayer, quota simulé, clavier, interception réseau, trois entrées), deux projets (ordinateur, mobile-375).
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- reports g et h marqués traités par la 5.2b.

**Acceptance Criteria:**
- Given un parcours e2e complet, when toutes les requêtes du navigateur sont collectées, then aucune ne vise `/functions/v1/` ni `api.openai.com`.
- Given deux lancements e2e successifs le même jour, when la suite démarre, then les compteurs locaux sont à zéro sans action manuelle.
- Given la production après push, when l'utilisateur suit la vérification ci-dessous, then chaque observation attendue est constatée.

## Implementation Notes

**Pièges connus du poste (Windows) :** lancer Vitest depuis PowerShell (Git Bash casse la casse C:/c:) ; écrire code et scripts avec l'outil d'écriture de fichiers, jamais par heredoc Git Bash ; `MSYS_NO_PATHCONV=1` pour `docker exec` depuis Git Bash ; ne jamais lire `supabase/functions/.env` ; le conteneur `supabase_edge_runtime_projet-ia` peut s'arrêter (`docker start`) ; `supabase db query` multi-ligne : passer par `-f fichier` ; `supabase db query` renvoie une enveloppe JSON en mode agent (analyseur `scripts/cli-rows.ts`). E2e : specs Playwright en CommonJS (pas d'`import.meta`) ; cliquer après l'hydratation ; actions React 19 encore en attente entre deux tests ; jamais de délai de test augmenté ; `tsc` casse si `.next-e2e` vient d'une autre branche (le supprimer). Valeurs de clés factices des tests toujours composées (check:secrets). Aucun commit, déploiement ni push.

**Vérification en production (2026-11-16, utilisateur, sur `2e2baf8`) :** points 1 à 5 conformes ; `POST /api/chat` en 200 (7,21 s, démarrage à froid), `x-vercel-id` `cpt1::fra1::…`, aucune requête vers `supabase.co/functions` ni `openai.com`. Trois écarts relevés :
- A. « Poser une question » en bouton plein comme « Ajouter un Document ». Décision de l'utilisateur : « Ajouter un Document » reste le seul bouton plein ; « Poser une question » en style secondaire (contour). Corrigé (`action-band.tsx`, test `dashboard.test.tsx`).
- B. Repères bruts « [P2] » et « 1. » pour un point unique : rendu des repères prévu par la 5.4 (renvois ¹ ²) ; numérotation d'un point unique reportée aux consignes de la 5.4 (`deferred-work.md`).
- C. « Document de test : .md piège » et « Document de test : piège à 375 px » sur le Tableau de bord : Documents du mini Jeu (story 2.8, UX-DR31), préchargés le 2026-11-06, dans les 9 attendus ; aucun test n'a écrit en production (lecture seule).

A revérifié en production par l'utilisateur sur `d55190a` (ordinateur et 375 px) : « Ajouter un Document » seul bouton plein, « Poser une question » en contour. B et C : réponses acceptées (rendu des repères et numérotation en 5.4 ; Documents de test conservés jusqu'à 7.1a/7.1b, note ajoutée à la 7.1a dans `epics.md`).

En corrigeant A, le test e2e « 375 px : bande empilée… » du Tableau de bord échouait lancé seul (5 éléments attendus, 2 Documents créés par le test) : il dépendait des Documents des autres fichiers. Rendu autonome (il crée ses 5 Documents).

## Review Triage Log

Relecteur séparé unique (décision de l'utilisateur), périmètre : relais `/api/chat`, frontière réseau, accessibilité du fil, `globalSetup`.

| # | Constat | Verdict | Route |
|---|---------|---------|-------|
| 1.1 | Délai navigateur 75 s pour un relais de 70 s qui démarre après `requireUser`, `getSession` et un éventuel démarrage à froid : abandon possible alors que `chat` a répondu (quota consommé, « Réessayer » refacture) | low : rare (réponse > 65 s) ; la valeur de 75 s est dans le bloc figé | décision de l'utilisateur : 85 s (spec et test corrigés) |
| 1.2 | Champ vidé à l'envoi : question perdue sur une erreur sans « Réessayer » (`invalidRequest`, 409, quota) | medium | patch |
| 1.3 | Codes hors `FAILURE_CODES` (NOT_FOUND, PROCESSING_*) : titre seul | false : `chat` ne renvoie aucun de ces codes | rejeté |
| 2.1 | Test des entrées Tableau de bord / Document sans contrôle de la frontière | medium (critère « parcours complet » non tenu) | patch |
| 2.2 | Tests quota/plafond et axe sans collecte ; clavier sans `expectBoundary` | low | patch |
| 2.3 | Recherche, nominal, hors base, panne : frontière contrôlée | correct | — |
| 2.4 | Requête tardive après l'assertion | low : aucun préchargement vers une fonction possible côté client | rejeté |
| 3.1 | Région `role="status"` en `display:none` quand vide (`empty:hidden`) : réponse et refus souvent non annoncés | high (NFR-7) | patch |
| 3.2 | Même défaut pour le message de saisie `aria-live` | medium | patch |
| 3.3 | État d'attente non annoncé (`aria-busy` hors région live) | medium | patch (texte d'attente dans la région) |
| 3.4 | Alerte annoncée deux fois (`role="alert"` + focus) | low : motif commun de l'application (Recherche, Bibliothèque) | defer |
| 3.5 | Focus sur `body` pendant « Réessayer » | medium | patch |
| 3.6 | Focus d'arrivée sur le titre sous Suspense | false : le test e2e des entrées vérifie le focus dans le champ sur le build de production et passe | rejeté |
| 3.7 | Compteur (`length`) et contrôle (`trim`) différents | low, correction directe | patch |
| G.1 | Vérification de la remise à zéro qui passe à vide (`[]`, clé absente) | medium | patch |
| G.2 | Garde sur l'URL et non sur la base visée par `db query` | false : aucun chemin n'ajoute `--remote` ; la CLI vise la base locale par défaut | rejeté |

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
