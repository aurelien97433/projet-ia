---
title: 'Story 5.9 : Idempotence des questions'
type: 'feature'
created: '2026-11-20'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a701c5ed4e5b5ba01843c3f4068ece93774ddfb9'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-8-questions-de-suivi.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-6-conversations-et-historique.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-5-réponse-progressive-sur-vercel.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Depuis la 5.2b, « Réessayer » renvoie la question avec un **nouvel** `clientRequestId` (décision du 2026-11-16) : chaque essai ajoute une question et une bulle, l'échec reste dans l'Historique, et un rechargement ou un double envoi ne retrouve jamais la réponse déjà enregistrée. Le rejeu actuel est minimal (AD-16, 5.2a-2) : toute question existante avec ce `clientRequestId` reçoit `REQUEST_IN_PROGRESS` (409), même réglée depuis longtemps, et une question restée sans issue (échéance tombée après `start_conversation`) reçoit 409 indéfiniment.

**Approach:** Première tâche, sans lien avec l'idempotence : la **consigne de refus renforcée** validée le 2026-11-20 (réserve de clôture de la 5.8). Puis le **rejeu complet d'AD-16** en tête de `chat`, avant `reserve_ai_call` : la recherche du `clientRequestId` classe la demande en *rejeu* (réponse ou refus enregistré : renvoyé tel quel, sans appel ni quota), *en cours* (moins de 90 s : 409 avec le `conversationId`), *réessai* (dernier résultat en échec, ou sans résultat depuis plus de 90 s : la question existante est réutilisée, le quota réservé, et le nouveau résultat **remplace** l'échec), ou *nouvelle question*. Côté page, « Réessayer » renvoie le **même** `clientRequestId` que la question en échec ; un 409 fait patienter puis recharge la Conversation.

## Boundaries & Constraints

**Always:**
- **Tâche 1 — consigne de refus** (`REFUSAL_SYSTEM_PROMPT`, `_shared/rag/prompt.ts`) : les deux lignes REFUS_INFO_ABSENTE et REFUS_HORS_CADRE remplacées mot pour mot par le texte validé le 2026-11-20 (`deferred-work.md`, entrée « Story 5.9, première tâche ») ; les autres lignes inchangées ; test unitaire mot pour mot. Aucun autre changement de consigne, de modèle ni d'échantillonnage.
- **Ordre dans `chat`** (AD-16) : validation → session → existence de la Conversation si `conversationId` (5.6) → **classement du `clientRequestId`** → selon le cas : rejeu ou 409 (sans réservation), ou `reserve_ai_call` puis réessai ou nouvelle question (historique et reformulation de la 5.8 → génération). Aucun appel au fournisseur sans unité réservée ; aucune réservation pour un rejeu ni pour un 409 (AD-14).
- **Classement** (question du Compte avec ce `clientRequestId`, RLS ; messages de l'Assistant rattachés par `client_request_id`, puis par date pour les messages d'avant la 5.6, mêmes règles que `conversation-thread.ts` et `conversation_list`) :
  - réponse ou refus enregistré → **rejeu** : renvoyé sans appel ni quota (Q3) ; une réponse ou un refus l'emporte sur un échec (règle existante) ;
  - réessai déjà en cours depuis moins de 90 s, ou question sans aucun message de l'Assistant depuis moins de 90 s → **409** `REQUEST_IN_PROGRESS`, avec le `conversationId` ;
  - dernier message en échec, ou question sans résultat depuis plus de 90 s → **réessai** (Q1, Q2) ;
  - aucune question → nouvelle question (chemin actuel).
- **Réessai** : la question existante est réutilisée (aucune question ni Conversation nouvelle ; `conversationId` lu en base, même si la page ne l'a pas envoyé) ; même texte de question que celui enregistré (le texte reçu est ignoré pour la recherche et la génération ; différent → `VALIDATION_FAILED`, Q2) ; pour une question de suivi, l'historique est relu **avant** la question réessayée et la reformulation refaite (5.8), la question autonome n'étant pas réécrite si elle existe déjà (Q2) ; le résultat (réponse, refus ou nouvel échec) **remplace** le message d'échec (Q1) ; règle de libération d'AD-14 inchangée.
- **Concurrence** : deux réessais simultanés du même `clientRequestId` → un seul passe, l'autre reçoit 409 (Q2) ; deux questions identiques avec deux `clientRequestId` différents → enregistrées toutes les deux ; `23505` à l'insertion d'une nouvelle question → 409 comme aujourd'hui (unité rendue).
- **Page** (`assistant-view.tsx`) : « Réessayer » renvoie le `clientRequestId` de la question en échec (fin de la décision du 2026-11-16), sans ajouter de bulle ; le résultat remplace l'alerte. 409 → état « en cours » (texte existant), puis rechargement de la Conversation (`/assistant/{id}`) jusqu'à un résultat, dans la limite des 90 s (AD-16) ; plus de « Réessayer » absent pour `REQUEST_IN_PROGRESS` quand le rechargement aboutit à un échec. Bouton « Envoyer » occupé dès le premier clic (existant, vérifié).
- **Rapports de la 5.2a-2 et de la 5.6 traités ici** (`deferred-work.md`) : (a) réponse validée en base puis réponse HTTP perdue ou échéance : `chat` n'enregistre plus d'échec après un enregistrement validé (et le rejeu renvoie la réponse) ; (b) question restée sans issue après `start_conversation` : réglé par le réessai après 90 s ; (c) `/assistant` abandonné à 20 s sans `conversationId` : réglé par le réessai avec le même `clientRequestId` (le `conversationId` est lu en base), sans nouvel événement SSE (Q4).
- **Données** : aucune écriture sur les anciennes lignes hors du remplacement d'un échec par son propriétaire (politique existante) ; toute fonction SQL nouvelle ou modifiée : `drop` puis `create` (jamais de surcharge, leçon de la 5.6), `security invoker` sauf nécessité justifiée, `search_path` vide, `EXECUTE` à `authenticated` seul, contrôle distant en lecture seule après `deploy:supabase`.
- **Tests** : unitaires (`chat` : classement, ordre, aucune réservation pour un rejeu ou un 409, réessai qui remplace l'échec, réessai d'une question de suivi ; page : même `clientRequestId` au réessai, 409 → attente puis rechargement) ; intégration sur Supabase local avec la simulation (critères de l'epic : rejeu, en cours, plus de 90 s, réessai après panne, réessai réussi après citations invalides, doublons volontaires, index partiel ; concurrence de deux réessais ; compteur du jour) ; e2e : réessai après une panne simulée sans bulle supplémentaire, rechargement pendant une demande en cours ; `test:chat:live` rejoué une fois après déploiement (tâche 1 et non-régression).
- **Revue** : **un relecteur séparé** (décision de l'utilisateur du 2026-11-20 ; la 5.9 figure parmi les stories sensibles, règle 11 des epics), centré sur le quota (aucun appel sans réservation, aucune réservation pour un rejeu ou un 409, double réessai), la concurrence, la migration (droits, signatures uniques), le remplacement de l'échec et la non-régression des flux 5.5 à 5.8.

**Ask First:** toute modification de la règle de quota ; toute écriture sur les anciennes lignes de `messages` autre que le remplacement d'un échec ; une fonction `security definer` ; tout changement de délai (90 s, 17 s, 20 s) ; découpage de la story ; un autre changement de consigne que la tâche 1.

**Never:** nouvel appel au fournisseur ou nouvelle réservation pour une question déjà réglée ; nouvelle question ou nouvelle bulle pour un réessai ; deux réessais du même `clientRequestId` qui appellent tous deux le fournisseur ; échec enregistré après une réponse validée ; `service_role` dans Next.js ou dans `chat` ; délai de test augmenté pour faire passer un test ; commit, déploiement ou push sans accord.

## Décisions de l'utilisateur (2026-11-20)

Spec approuvée en entier : **Q1 = A**, **Q2 = A**, **Q3 = A**, **Q4 = A**. Précisions :
- **Q1** — même règle qu'en 5.6 et 5.8 : `drop function` de l'ancienne signature de `save_assistant_answer` et de `record_assistant_failure`, puis `create` avec `p_replace_message_id uuid default null` ; `security invoker`, `search_path` vide, `REVOKE` de `public`, `anon`, `service_role`, `GRANT EXECUTE` à `authenticated` seul. Test d'intégration : **une seule signature** de chaque fonction (pg_proc) et **un appel sans le paramètre** (forme du `chat` en production avant son redéploiement) fonctionne. Contrôle distant en lecture seule après `deploy:supabase`.
- **Q2** — périmètre du relecteur : `begin_retry` ne permet pas à un Collaborateur B de réclamer ni de remplacer l'échec d'un Collaborateur A, que B envoie le même `client_request_id` que A ou un identifiant forgé (RLS, `auth.uid()` dans la clé du verrou et dans chaque lecture ou écriture ; `p_replace_message_id` d'un autre Compte refusé) ; la réclamation ne peut pas rester bloquée au-delà de 90 s (verrou consultatif **transactionnel**, libéré à la fin de l'appel ; ligne `REQUEST_IN_PROGRESS` de plus de 90 s traitée comme un échec, donc réessayable). Tests d'intégration correspondants.
- **Revue** — un relecteur séparé, conforme à la décision de l'utilisateur du 2026-11-16 (relecteurs séparés sur les stories sensibles restantes).

## Questions à trancher avant le code (tranchées, voir ci-dessus)

- **Q1 — Remplacement de l'échec.** **A (recommandé)** : remplacement en place, comme le prévoient AD-16 et la politique « Le propriétaire remplace un échec de l'Assistant » : `save_assistant_answer` et `record_assistant_failure` reçoivent `p_replace_message_id uuid default null` (`drop` puis `create`) ; avec ce paramètre, la ligne d'échec est mise à jour (type, contenu, code, date) au lieu d'une insertion, et les Sources sont ajoutées à la ligne remplacée. Historique et liste de Conversations inchangés (une seule bulle par échange). B : insérer le nouveau résultat à côté de l'échec (l'affichage fait déjà gagner la réponse) : plus simple, mais l'échec reste en base et un échec suivi d'un nouvel échec laisse deux lignes.
- **Q2 — Un seul réessai à la fois.** **A (recommandé)** : nouvelle fonction SQL `begin_retry(p_client_request_id uuid)` (`security invoker`, verrou transactionnel consultatif sur le Compte et l'identifiant, `pg_advisory_xact_lock`, sans privilège supplémentaire) qui classe la demande et, pour un réessai, **réclame** la ligne d'échec dans la même transaction : elle la passe à `error_code = 'REQUEST_IN_PROGRESS'` avec la date du moment (ou insère cette ligne pour une question sans résultat depuis plus de 90 s), puis renvoie le cas, la Conversation, la question (texte et question autonome) et l'identifiant de la ligne à remplacer. Un second réessai voit « en cours depuis moins de 90 s » et reçoit 409. Affichage : une ligne d'échec `REQUEST_IN_PROGRESS` de moins de 90 s s'affiche « en cours », au-delà comme un `AI_TIMEOUT` (`conversation-thread.ts` et `conversation_list` adaptés, tests). B : sans verrou (lecture puis écriture) : deux réessais simultanés peuvent appeler deux fois le fournisseur (rare : double clic bloqué par le bouton occupé), contraire au « Never ».
- **Q3 — Ce que renvoie un rejeu.** **A (recommandé)** : la réponse ou le refus enregistré, sous la même forme qu'aujourd'hui (`done` ou `refusal` en flux, JSON sinon), Sources reconstruites depuis `message_sources` comme le fait la page de Conversation (5.6, 5.7 : positions et version seulement pour un Document existant) ; la page l'affiche comme une réponse normale, sans texte progressif. B : 200 avec le seul `conversationId`, la page recharge la Conversation (moins de code dans `chat`, un aller-retour de plus).
- **Q4 — Rapports de la 5.2a-2, de la 5.6 et de la 5.8.** **A (recommandé)** : (a), (b) et (c) ci-dessus traités dans la 5.9 ; l'échéance commune qui tombe pendant `reserve_ai_call` (unité réservée jamais rendue, rapport de la 5.8 « 5.9 ou 5.10 ») va en **5.10** (quota) ; l'événement SSE `conversation` proposé en revue de la 5.6 n'est pas fait (le réessai avec le même identifiant suffit). B : tout traiter en 5.9 (story plus longue, journée du 20/11 dépassée).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Refus frontière (tâche 1) | h1 « Quel est le budget marketing de NexaWorks pour 2027 ? » | `refusal_info_absente` | — |
| Hors cadre (tâche 1) | o1 « Quelle est la capitale de l'Australie ? » | `refusal_hors_cadre` | — |
| Rejeu d'une réponse | même `clientRequestId`, réponse enregistrée | même réponse et mêmes Sources, aucun appel, compteur inchangé | — |
| Rejeu d'un refus | même `clientRequestId`, refus enregistré | même refus, aucun appel, compteur inchangé | — |
| En cours | même `clientRequestId`, question de moins de 90 s sans résultat | 409 avec `conversationId` ; la page patiente puis recharge | `REQUEST_IN_PROGRESS` |
| Sans résultat > 90 s | question de plus de 90 s sans message de l'Assistant | réessai : question réutilisée, unité réservée, résultat enregistré | — |
| Réessai après panne | dernier message `failure` (`AI_UNAVAILABLE`) | nouveau résultat à la place de l'échec, aucune question ni bulle en plus | — |
| Réessai après citations invalides | `failure` `AI_CITATIONS_INVALID`, nouvelle réponse valide | la réponse remplace l'échec | — |
| Réessai qui échoue encore | nouvelle panne | l'échec remplacé par le nouvel échec, « Réessayer » de nouveau | AD-14 |
| Réessai d'une question de suivi | échec sur la 2ᵉ question d'une Conversation | historique d'avant cette question, reformulation refaite si besoin | 5.8 |
| Double réessai simultané | deux demandes, même `clientRequestId`, échec enregistré | une seule appelle le fournisseur, l'autre 409 | `REQUEST_IN_PROGRESS` |
| Doublons volontaires | même texte, deux `clientRequestId` | deux questions enregistrées | — |
| Réponse et question, même identifiant | `save_assistant_answer` avec le `client_request_id` de sa question | enregistrement réussi (index limité à `role = user`) | — |
| Texte différent au réessai | même `clientRequestId`, autre question | refusé, rien d'enregistré | `VALIDATION_FAILED` |
| Quota épuisé au réessai | réessai, quota atteint | 429, l'échec reste affiché | `QUOTA_EXCEEDED` |
| `/assistant` abandonné à 20 s | nouvelle Conversation, `conversationId` inconnu de la page | « Réessayer » (même identifiant) retrouve la question et sa Conversation | — |
| Réponse validée puis échéance | `save_assistant_answer` validé, réponse HTTP perdue | aucun échec enregistré en plus ; le rejeu renvoie la réponse | — |
| `chat` non redéployé | ancien `chat`, nouvelle migration | comportement de la 5.8 (paramètres nouveaux à `null` par défaut) | — |

</frozen-after-approval>

## Code Map

- `supabase/functions/_shared/rag/prompt.ts` -- tâche 1 : deux lignes de `REFUSAL_SYSTEM_PROMPT`.
- `supabase/migrations/<nouvelle>_idempotence.sql` -- `begin_retry` (Q2) ; `save_assistant_answer` et `record_assistant_failure` avec `p_replace_message_id` (Q1, `drop` puis `create`) ; `conversation_list` (ligne `REQUEST_IN_PROGRESS`), droits.
- `supabase/functions/chat/index.ts` -- classement en tête (remplace `questionExists`), rejeu (Q3), réessai (question réutilisée, historique d'avant la question, remplacement), aucun échec après un enregistrement validé, 409 avec `conversationId`.
- `supabase/functions/_shared/chat.ts` -- historique d'avant une question donnée (réessai d'une question de suivi) ; reconstruction des Sources d'un rejeu si elle est partagée.
- `src/components/assistant/assistant-view.tsx` -- même `clientRequestId` au réessai, remplacement de l'alerte, 409 → attente et rechargement.
- `src/lib/conversation-thread.ts` -- ligne `REQUEST_IN_PROGRESS` : « en cours » moins de 90 s, puis `AI_TIMEOUT`.
- `src/server/chat/relay.ts`, `src/lib/errors.ts` -- 409 avec `conversationId` relayé (si la forme change).
- Tests : `tests/unit/prompt.test.ts`, `tests/unit/chat-function.test.ts`, `tests/unit/assistant-view.test.tsx`, `tests/unit/conversation-thread.test.ts` ; `tests/integration/chat.test.ts`, `tests/integration/conversations-rls.test.ts` (signatures, droits, `begin_retry`) ; `tests/e2e/assistant.spec.ts`.
- AD-16 (cas du rejeu précisés : réclamation du réessai, remplacement, rejeu renvoyé), `deferred-work.md` (rapports traités, reprise de l'échéance pendant `reserve_ai_call` en 5.10).

## Tasks & Acceptance

**Execution:**
- [x] **Tâche 1** : consigne de refus renforcée + test unitaire mot pour mot.
- [x] Migration (Q1, Q2) + tests d'intégration (signatures uniques, droits, réclamation, remplacement, concurrence).
- [x] `chat` : classement, rejeu (Q3), réessai, 409 avec `conversationId`, aucun échec après un enregistrement validé + tests unitaires et d'intégration.
- [x] Page : même `clientRequestId` au réessai, 409 → attente et rechargement, affichage de la ligne en cours + tests unitaires et e2e.
- [x] AD-16, deferred-work.

**Acceptance Criteria:**
- Given h1 (« Quel est le budget marketing de NexaWorks pour 2027 ? »), when `test:chat:live` est rejoué après le déploiement, then h1 est classé `refusal_info_absente` à chaque essai et les 15 questions sont conformes (un rejeu réussi ne prouve que l'absence de régression).
- Given un même `client_request_id` envoyé deux fois, when la première demande est terminée (réponse ou refus), then la seconde renvoie le résultat enregistré, sans nouvel appel au fournisseur ni nouvelle question, compteur inchangé.
- Given une demande en cours depuis moins de 90 s, when le même `client_request_id` arrive, then `REQUEST_IN_PROGRESS` (409) est renvoyé et la page patiente puis recharge la Conversation.
- Given une question sans réponse depuis plus de 90 s, ou dont le dernier résultat est un échec, when je clique « Réessayer », then la question existante est réutilisée et le nouveau résultat remplace l'échec, sans bulle supplémentaire.
- Given un échec `AI_CITATIONS_INVALID`, when je clique « Réessayer » et que la nouvelle réponse est valide, then elle remplace l'échec sans ajouter de question ni de bulle.
- Given deux questions identiques envoyées volontairement (deux `client_request_id`), when elles arrivent, then elles sont enregistrées toutes les deux.
- Given l'index unique partiel, when une réponse de l'Assistant est enregistrée avec le `client_request_id` de sa question, then l'enregistrement réussit.

## Design Notes

Ordre : tâche 1 d'abord (courte, isolée, testée seule), puis la migration et `chat` (déployables avant le push : l'ancienne page continue d'envoyer un nouvel identifiant à chaque réessai, ce qui reste le comportement de la 5.8), puis la page. Partie la plus risquée : la concurrence et le remplacement (Q1, Q2), et la cohérence entre `chat`, `conversation-thread.ts` et `conversation_list` sur la ligne « en cours ». **Estimation : 5 à 7 h** ; le calendrier prévoyait 5.8 et 5.9 le 20/11 avec un point de contrôle le soir : la 5.9 risque de déborder sur le tampon du 21/11.

Déploiement : commit → `deploy:supabase` (migration + `chat`) → contrôle distant en lecture seule (signatures uniques, droits d'`authenticated` seul, `search_path` vide) → push → `npm run test:chat:live` (15 questions, ≈ 0,09 $) → vérification en production → clôture.

## Verification

**Commands:**
- Supabase local à neuf, `npx supabase db reset`, puis `npm test` (PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run check:secrets`, `npm run test:e2e` (d'un seul tenant ; échec connu et accepté : `search-page` « parcours réel au clavier » sous charge, story 7.3) -- expected : vert.
- Après `deploy:supabase` et push : `npm run test:chat:live` (15 sur 15) (utilisateur).

**Manual checks (production) :**
- Panne provoquée impossible en production : réessai vérifié par les tests ; en production, double clic sur « Envoyer » (une seule question), rechargement de la page pendant une réponse (pas de doublon, la réponse apparaît), Historique sans échec résiduel.
- q1 et h1 sur la page en ligne : réponse et refus « information absente ».

## Implementation Notes

**2026-11-20 (implémentation, avant revue ; rien commité, rien déployé) :**
- **Tâche 1** : `REFUSAL_SYSTEM_PROMPT` (`_shared/rag/prompt.ts`), deux lignes remplacées mot pour mot (texte de `deferred-work.md`) ; test unitaire de la consigne entière, ligne par ligne (`tests/unit/prompt.test.ts`).
- **Migration** `20261120090000_idempotence.sql` :
  - `begin_retry(p_client_request_id uuid, p_question text, p_conversation_id uuid default null)` : `security invoker`, `search_path` vide, `EXECUTE` à `authenticated` seul ; verrou `pg_advisory_xact_lock(hashtextextended(auth.uid() || '/' || identifiant))`, transactionnel ; issues `new`, `mismatch` (texte ou Conversation différents : contrôlé **avant** toute réclamation, donc rien d'écrit), `replay` (avec Sources), `in_progress` (avec Conversation), `retry` (ligne réclamée, code précédent).
  - Réclamation : seul un échec rattaché par le **même identifiant** est passé à `REQUEST_IN_PROGRESS` ; échec d'avant la 5.6 sans identifiant (rattaché par date) ou aucun échec → une ligne d'échec `REQUEST_IN_PROGRESS` est insérée (les anciennes lignes ne sont jamais modifiées).
  - **Date de la réclamation (choix non dicté par la spec)** : `authenticated` n'a pas le droit de modifier `created_at` ; plutôt que de l'accorder, un déclencheur `BEFORE UPDATE` (`stamp_replaced_failure`, `security invoker`, `search_path` vide, **aucun EXECUTE accordé**, pas même à `authenticated` : une fonction de déclencheur n'est pas appelable) pose `created_at = clock_timestamp()` sur toute modification d'une ligne d'échec dont la date n'est pas changée explicitement (l'administrateur peut toujours la fixer, ce que font les tests).
  - `save_assistant_answer` et `record_assistant_failure` : `drop` puis `create` avec `p_replace_message_id uuid default null` ; avec le paramètre, mise à jour de la ligne d'échec du Compte, de la Conversation et de la question (`client_request_id` identique) ; sinon `P0002`, rien d'écrit (ligne d'un autre Compte, d'une autre question, ou déjà remplacée par un résultat).
  - Vue `conversation_list` (`drop` puis `create`, `security_invoker`, `SELECT` à `authenticated` seul) : le dernier échec d'un échange, s'il est `REQUEST_IN_PROGRESS` de moins de 90 s, compte « en cours ».
- **`chat`** : `questionExists` remplacé par `classifyRequest` (`begin_retry`) après la vérification de la Conversation ; rejeu → JSON ou `done`/`refusal` en flux (Sources reconstruites par `replaySources`, `_shared/chat.ts` ; `passageNumbers` = 1..k car les numéros du contexte ne sont pas enregistrés) ; 409 avec `conversationId` (`errorResponse` accepte la Conversation ; le 409 du `23505` concurrent la relit aussi) ; réessai : Conversation et question lues en base, réservation, historique lu avant la date de la question (`created_at=lt.`), question autonome reprise si elle existe sinon reformulation refaite (non enregistrée), aucun `add_question`/`start_conversation`, résultat ou échec avec `p_replace_message_id` ; quota refusé → `record_assistant_failure` rétablit le code précédent. **Rapport a** : `save_assistant_answer` passe avec son propre délai (5 s), hors de l'échéance commune ; si une erreur suit son envoi, `chat` lit s'il existe déjà une réponse ou un refus pour l'identifiant avant d'enregistrer un échec (aucun échec après un résultat validé). Comble aussi le cas limite de la 5.5 (refus enregistré pendant l'échéance des 17 s).
- **Relais et erreurs** : `AppError.error.conversationId` facultatif ; relayé seulement pour `REQUEST_IN_PROGRESS` et seulement si c'est un UUID.
- **Fil** (`conversation-thread.ts`) : échec `REQUEST_IN_PROGRESS` = « en cours » 90 s après sa date, puis `AI_TIMEOUT` ; `ThreadExchange.clientRequestId` transmis à la page.
- **Page** : chaque échange garde son `clientRequestId` ; « Réessayer » le renvoie (même bulle). 409 avec `conversationId` : sur la page de cette Conversation, l'échange devient « en cours » enregistré (état neutre « Recherche dans les Documents… », rechargement toutes les 5 s, règles du fil pour la limite de 90 s) ; ailleurs, `router.replace('/assistant/{id}')` (rechargement complet si l'adresse a déjà été prise par `replaceState`). 409 sans Conversation : texte « déjà en cours » **avec** « Réessayer » (même identifiant, donc sans risque de doublon). Le texte affiché pendant l'attente est l'état neutre existant, pas le texte `inProgress` (choix à faire relire).
- **Tests** : unitaires (`chat-function` : 19 nouveaux cas 5.9 ; `chat-route`, `conversation-thread`, `assistant-view`, `prompt`) ; intégration (`conversations-rls` : 10 cas — signatures uniques et droits, appels sans le nouveau paramètre, classement, réclamation et verrou non bloquant, réclamation de plus de 90 s, insertion après 90 s, trois classements simultanés → un seul réessai, remplacement et `P0002`, B contre A avec le même identifiant ou un identifiant forgé ; `chat` : 11 cas — rejeu réponse et refus, en cours, plus de 90 s, réessai après `AI_UNAVAILABLE` et `AI_CITATIONS_INVALID` sans `conversationId`, réessai qui échoue encore, suivi, autre texte, doublons volontaires, deux réessais simultanés, quota au réessai ; compteur du jour contrôlé) ; e2e (`assistant.spec.ts` : « Réessayer » après une réponse HTTP perdue → même identifiant, une bulle, une question et une réponse en base ; rechargement de la page pendant une réponse en flux ; 409 sans Conversation avec « Réessayer »).
- **Vérification locale (2026-11-20)** : migration appliquée par `supabase migration up` (le `db reset` a été **refusé par le contrôle des permissions de l'agent** ; le déclencheur, corrigé après une première application, a été recréé à l'identique de la migration, définition contrôlée) ; `npm test` sous PowerShell (95 fichiers, 1 949 tests), `lint`, `tsc`, `build:ci` (dont `check:secrets --static`), `check:secrets`, e2e complète à 8 workers (373 passés, 19 ignorés, 0 échec) : vert.
- **Reste à faire** : `db reset` à neuf par l'utilisateur et vérification rejouée ; relecteur séparé ; commit sur accord ; `deploy:supabase` (migration + `chat`) ; contrôle distant en lecture seule (une signature de `begin_retry`, `save_assistant_answer`, `record_assistant_failure` ; `authenticated` seul ; `search_path` vide ; déclencheur présent ; vue `security_invoker`) ; push ; `npm run test:chat:live` ; vérifications en production.

## Review Triage Log

Relecteur séparé unique (2026-11-20, décision de l'utilisateur du 2026-11-16, à la place des trois couches) : aucun bloquant ; quota, cloisonnement entre Comptes (Q2), verrou, migration, forme du rejeu et non-régression 5.5 à 5.8 jugés corrects, avec tests relancés (310 unitaires, 10 d'intégration) et un scénario SQL en transaction annulée.

| # | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|
| R1 | Deux réessais du même identifiant peuvent appeler tous deux le fournisseur : `begin_retry` ne regarde que le **dernier** échec rattaché ; un échec tardif du `chat` d'origine (inséré sans remplacement, daté après la réclamation) masque une réclamation `REQUEST_IN_PROGRESS` de moins de 90 s, et un second classement renvoie `retry` | medium | reproduit en SQL par le relecteur (question de 95 s, réclamation, échec tardif inséré, second `begin_retry` → `retry`) ; atteignable surtout à cause de R2 (échec d'origine enregistré jusqu'à ~100 s) ; viole le « Never » de la spec | patch : `in_progress` dès qu'une ligne rattachée `REQUEST_IN_PROGRESS` a moins de 90 s, quelle que soit sa place ; même règle dans `exchangeReply` et `conversation_list` ; test |
| R2 | Chaîne des délais (AD-16) rompue : `save_assistant_answer` passe avec son propre délai de 5 s hors de l'échéance commune de 85 s, alors que la génération reçoit tout le temps restant → `done` jusqu'à ~90 s côté `chat` (navigateur 90 s), JSON jusqu'à ~75 s (relais 70 s) ; commentaire de `config.ts` faux ; un test unitaire inscrit le dépassement | medium | `chat/index.ts` : génération `Math.min(generationMaxMs, remaining())`, puis `saveResult` sur `AbortSignal.timeout(5 s)` ; changement de délai non demandé (Ask First de la spec) | **décision de l'utilisateur** (Ask First) : voir ci-dessous |
| R3 | Le Collaborateur peut re-dater ses propres échecs par un PATCH REST direct (déclencheur `stamp_replaced_failure`) : garder une question « en cours » en réécrivant `REQUEST_IN_PROGRESS` toutes les 89 s, ou rattacher un échec d'avant la 5.6 à une question plus récente | low | droits existants (`UPDATE` de `kind`, `content`, `error_code` sur ses échecs, 5.1) + déclencheur ; ses seules données, sans quota, appel ni autre Compte ; passer un échec en réponse par PATCH était déjà possible depuis la 5.1 | rejeté (accepté) : à consigner dans AD-16 ; le commentaire de la 5.1 sur les horodatages est à corriger |
| R4 | Réessai d'une question de suivi : `created_at=lt.` exclut une réponse antérieure re-datée par un remplacement plus tardif | low (hypothèse) | exige un second onglet ou l'API (« Réessayer » ne vise que le dernier échange) ; correctif = découpage dans `buildHistory`, plus de code | rejeté : improbable en usage normal, correctif non trivial |
| R5 | Trous de tests : test d'intégration « suivi » qui ne vérifie pas l'historique ; `window.location.reload()` non testé ; remplacement d'un échec enregistré non couvert en e2e ; plafond global au réessai non testé | low | lu dans les tests (aucune occurrence de `reload`) ; le reste couvert en unitaire ou en intégration | patch : renforcer le test d'intégration « suivi » (historique transmis) ; le reste accepté (jsdom ne navigue pas, même chemin que le quota) |
| R6 | Deux demandes « new » simultanées du même identifiant sur une question de suivi : les deux réservent et reformulent ; le perdant (`23505`) rend son unité alors que sa reformulation a été envoyée | low | existant depuis la 5.8 ; double clic bloqué par `busyRef` | defer (`deferred-work.md`) |
| R7 | Attente après un 409 : état neutre « Recherche dans les Documents… » au lieu du texte « déjà en cours » | false (acceptable) | choix de l'agent, cohérent avec l'état « en cours » du fil | — |

**2026-11-20, correctifs de revue :** (1) réclamation `REQUEST_IN_PROGRESS` de moins de 90 s → « en cours » quelle que soit sa place parmi les échecs (`begin_retry`, `exchangeReply`, `conversation_list`) ; tests d'intégration (échec tardif après réclamation) et unitaire du fil. (2) Option A de l'utilisateur : génération et appel court bornés à min(maximum, temps restant − 5 s), l'enregistrement gardant ses 5 s hors échéance ; tests de la chaîne (85 s < 90 s, 60 s < 70 s, génération coupée à échéance − 5 s, enregistrement non interrompu). (3) Test d'intégration de l'historique d'avant la question réessayée. (4) AD-16 : notes datées (enregistrement réservé, R3 accepté). Migration et vue réappliquées en local par `db query -f` (`create or replace`, même signature) ; le fichier garde `create`.

## Vérification complète (2026-11-20, après les correctifs de revue)

`npx supabase db reset` lancé par l'utilisateur (migration `20261120090000` rejouée depuis une base vide : une seule signature de `begin_retry`, `save_assistant_answer`, `record_assistant_failure` et `add_question`, déclencheur `messages_stamp_replaced_failure` présent), edge runtime redémarré. `npm test` sous PowerShell (95 fichiers, 1 953 tests), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` (dont `check:secrets --static`), `npm run check:secrets`, `npm run test:e2e` à 8 workers (373 passés, 19 ignorés par conception, 0 échec) : vert. Décisions de revue de l'utilisateur (2026-11-20) : R2 option A, R1 et R5 corrigés, R3 accepté (AD-16), R4 rejeté, R6 reporté en 5.10. Reste : commit sur accord, `deploy:supabase` (migration + `chat`), contrôle distant en lecture seule, push, `test:chat:live` (h1 et non-régression), vérification en production, clôture.

## Production : h1 et consigne de la génération (2026-11-20)

`c59c236` déployé (migration `20261120090000`, `chat` 72 kB), contrôle distant conforme, poussé. `test:followup:live` : 14 sur 14 (compteur 44 → 58). `test:chat:live` : **13 sur 15**, h1 #1 et #3 en `refusal_hors_cadre` malgré la consigne de la tâche 1 (compteur 29 → 44).

**Diagnostic (lecture seule) :** h1 passe par la **génération complète**, pas par l'appel court : mesure ponctuelle (h1 vectorisé par la fonction locale `measure-embed`, `match_passages` en production avec les paramètres de `chat`, session du Compte de mesure 1) : 5 Passages au-dessus du seuil de 0,40 (« Compte rendu client : Atelier Lumen » 0,545, « Procédure de facturation » 0,501, « Note de réunion : finance de mars » 0,500, « FAQ comptabilité » 0,449, « Procédure congés et absences » 0,428) ; o1 : aucun (appel court). Aucun Document modifié depuis le 2026-11-10. La consigne de la tâche 1 (`REFUSAL_SYSTEM_PROMPT`) n'a donc jamais été appliquée à h1 ; le diagnostic de la 5.8 (appel court comparé) visait le mauvais chemin (corrigé à la clôture). Sur ce chemin, l'entrée du modèle est identique depuis la 5.4 (`CHAT_SYSTEM_PROMPT` et `buildChatMessages` inchangés ; sans historique, `buildFollowUpChatMessages` renvoie les mêmes messages).

**Journaux de `chat` lus par l'utilisateur (19/11 au 20/11)** : `model` = `gpt-5.4-mini-2026-03-17` partout (aucun changement de version côté fournisseur).

| Version de `chat` | h1 : chemin | `passages` | `input_tokens` (h1) | Résultat h1 | o1 : `input_tokens` (appel court) |
|---|---|---|---|---|---|
| v7 (19/11) | génération complète | 5 | 1 504 | `refusal_info_absente` ×3 | 185 |
| v8 (19/11) | génération complète | 5 | 1 504 | `refusal_info_absente` ×3 | 185 |
| v9 (5.8, 20/11 matin) | génération complète | 5 | 1 504 | `refusal_hors_cadre` ×1 sur 3 | 185 |
| v10 (5.9, 20/11 soir) | génération complète | 5 | 1 504 | `refusal_hors_cadre` ×2 sur 3 | 229 |

Conclusion de l'utilisateur : même entrée, même modèle, `temperature` 0 et `seed` → **non-déterminisme du modèle sur une question frontière**, pas une régression de notre code. Le passage de 185 à 229 `input_tokens` pour o1 en v10 confirme que la consigne du matin ne s'applique qu'à l'appel court.

**Correctif (décision de l'utilisateur du 2026-11-20) :** même règle dans la ligne des refus de `CHAT_SYSTEM_PROMPT` (« une question qui nomme NexaWorks n'est jamais hors cadre » ; « Entre ces deux refus, en cas de doute, choisissez REFUS_INFO_ABSENTE », borné aux deux refus pour ne pas pousser au refus quand les Passages permettent de répondre) ; test unitaire de la consigne entière, ligne par ligne ; `npm test` (95 fichiers, 1 954 tests), `tsc` verts. Commit local séparé, puis redéploiement de `chat` par l'utilisateur, compteur du Compte de mesure 1 remis à zéro et un seul rejeu de `test:chat:live`.
