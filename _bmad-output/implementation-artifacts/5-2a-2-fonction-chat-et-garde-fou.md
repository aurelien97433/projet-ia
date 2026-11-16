---
title: 'Story 5.2a-2 : Fonction chat, enregistrement et garde-fou du crédit (seconde moitié de la 5.2a)'
type: 'feature'
created: '2026-11-13'
status: 'in-review'
baseline_commit: '3515d80dbf12c3e428fff74de0c478fe5d649781'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-2a-1-consignes-generation-et-citations.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La question d'un Collaborateur n'aboutit encore à rien : aucune fonction ne relie la Recherche (4.1a), les consignes et la génération (5.2a-1) au stockage privé des Conversations (5.1). Et l'inscription est ouverte : sans garde-fou, le crédit OpenAI prépayé (9,98 $) peut être vidé par un Compte ou par des Comptes créés en série.

**Approach:** Une migration ajoute le garde-fou (quota par Compte et par jour, plafond global du projet par jour, réservés ensemble et de façon atomique avant tout appel à OpenAI) et l'enregistrement atomique d'une réponse avec ses Sources. Une Edge Function `chat` (jeton du Collaborateur) enchaîne : contrôle de rejeu, réservation, Conversation et question, Recherche, consignes, génération, citations, enregistrement de la réponse ou de l'échec. Un Route Handler `app/api/chat` la relaie (réponse JSON non diffusée ; la diffusion arrive en 5.5). Aucun écran (5.2b).

## Boundaries & Constraints

**Always:**
- **Garde-fou A + B (décision du 2026-11-13), dans `…_chat.sql`** :
  - tables `ai_usage (user_id, day_utc, count)` (clé primaire `(user_id, day_utc)`, propriétaire en lecture seule) et `ai_usage_global (day_utc, count)` (aucun accès direct) ;
  - limites dans une table `ai_limits (key, value)` (aucun accès direct), remplie par la migration : `ai_daily_quota = 60` (AD-14), `ai_global_daily_cap = 300` (≈ 1,80 $ par jour au coût estimé de 0,006 $ par question). **Jamais fournies par l'appelant.** Changer une limite = une instruction SQL documentée dans `docs/environnements.md`, sans redéploiement ;
  - `reserve_ai_call()` (`security definer`, `auth.uid()`, EXECUTE pour `authenticated` seul) : en une transaction, verrou des deux compteurs du jour UTC, refus si l'un est atteint, sinon les deux incrémentés. Renvoie `{ ok, reason ('user' | 'global'), reset_at }` (prochain 00:00 UTC). `release_ai_call()` rend une unité aux deux, jamais sous 0, **seulement si aucun appel facturable à OpenAI n'a abouti** (règle ci-dessous) ;
  - **appelée avant tout appel à OpenAI** (génération) ; la vectorisation de la question n'est faite qu'après une réservation acceptée ;
  - quota personnel atteint : `QUOTA_EXCEEDED` (429, `resetAt`), message du catalogue (« Vous avez atteint votre limite quotidienne… ») ; **plafond global atteint : nouveau code `AI_DAILY_CAP_REACHED`** (503, `resetAt`), message distinct : « L'Assistant a atteint sa limite d'utilisation pour aujourd'hui. Il sera de nouveau disponible {moment}. La Recherche reste disponible. » (texte absent d'EXPERIENCE.md, à valider) ; le code est ajouté aux deux listes AD-19 (`src/lib/errors.ts`, `_shared/errors.ts`) ;
  - dans les deux cas : aucune Conversation créée (AD-17), aucun appel au fournisseur.
- **Ordre dans `chat`** (`supabase/functions/chat/index.ts`, `verify_jwt = true`, session revérifiée auprès d'Auth comme `semantic-search`) :
  1. validation : question 1 à 2 000 caractères, non vide ; `clientRequestId` UUID ;
  2. **rejeu avant réservation** (AD-16, minimal) : une question de ce Compte avec ce `client_request_id` existe déjà → `REQUEST_IN_PROGRESS` (409), sans réservation (le rejeu complet est la 5.9) ;
  3. `reserve_ai_call()` ; refus → 429 ou 503 ci-dessus ;
  4. Conversation (titre = question, 120 caractères au plus) et question ; `23505` concurrent → libération puis 409 ;
  5. vectorisation, `match_passages` (8 Passages au plus, 3 par Document, seuil commun, AD-9), puis titre et `text_version` relus dans `documents` avec le jeton : **jamais du modèle ni du navigateur** (point différé de la 5.1) ;
  6. **aucun Passage** : refus `refusal_info_absente` enregistré avec le texte du catalogue, **sans appel à OpenAI**, unité rendue (aucun appel facturable ; l'appel court qui départage les deux refus arrive en 5.3) ;
  7. consignes (`buildChatMessages`, même liste de Passages pour `readCitations`) puis génération ;
  8. citations : **aucune citation valide** → échec `AI_CITATIONS_INVALID`, **unité consommée** (génération reçue et facturée ; retrait des citations invalides et journalisation : 5.4) ; sinon Sources regroupées par Document ;
  9. enregistrement atomique (`save_assistant_answer`, `security invoker`) : réponse, Sources, `last_message_at` ; renvoie la réponse et ses Sources (titre, Document, numéros de Passage).
  - Tout échec après la réservation : échec `failure` enregistré avec son code AD-19 (AD-17), sans texte, même si le navigateur s'est déconnecté (travail terminé côté serveur). L'unité suit la **règle de libération** ci-dessous.
- **Règle de libération (décision de l'utilisateur du 2026-11-13)** : `release_ai_call()` ne rend l'unité **que si aucun appel facturable à OpenAI n'a abouti** :
  - **rendue** : réservation refusée en aval (conflit `23505`), panne avant l'appel de génération (vectorisation, `match_passages`, base), aucun Passage (aucun appel), erreur réseau ou `5xx` **sans réponse reçue**, plafond du fournisseur (`AI_BUDGET_EXHAUSTED`, refus avant génération) ;
  - **consommée** : génération reçue puis rejetée (`AI_CITATIONS_INVALID`, `AI_OUTPUT_INVALID` dont sortie tronquée ou filtrée, refus de sécurité du modèle), et délai dépassé **après envoi** de la génération (`AI_TIMEOUT` : le fournisseur peut l'avoir produite et facturée) ;
  - raison : sinon une question construite pour produire une réponse sans citation contournerait le quota tout en dépensant le crédit ;
  - `chat` décide à partir d'un indicateur « génération envoyée » (`generationSent`) et du type d'échec ; `callProvider` distingue « réponse reçue » et « aucune réponse » ;
  - **écart avec les documents de référence, à aligner avant l'implémentation** : AD-11 (« aucun quota n'est consommé » pour `AI_CITATIONS_INVALID`), le tableau des quotas d'AD-14 (`AI_CITATIONS_INVALID`, `AI_OUTPUT_INVALID`, `AI_TIMEOUT` à 0) et EXPERIENCE.md (« sans quota consommé » pour une réponse non vérifiable et un délai dépassé). Cette décision les remplace ; les trois textes seront corrigés avec la story (architecture, EXPERIENCE.md, note datée dans `epics.md`).
- **Points différés de la revue de la 5.2a-1** :
  - **durée totale au pire** : échéance globale de `chat` de 60 s ; chaque étape reçoit le temps restant (`timeoutMs`), la génération au plus 40 s ; relais Next.js 70 s ; `maxDuration = 120` (Vercel Hobby : 300 s) ;
  - **double paiement après une coupure ambiguë** : pour la génération, **une seule nouvelle tentative**, et seulement sur `429` (hors plafond) ou `5xx` reçus ; **aucune** sur erreur réseau ou délai dépassé après envoi. Option `retry` de `callProvider` par opération ; vectorisation et autres appels inchangés.
- **Point différé de la 5.1 : course `23503` → `null`** : dans `save_assistant_answer`, chaque Source est insérée dans un bloc qui intercepte `foreign_key_violation` sur `document_id` et réinsère avec `document_id` nul (titre et version gardés) ; test d'intégration (Document supprimé entre la Recherche et l'enregistrement).
- **Route Handler** `src/app/api/chat/route.ts` (runtime Node, modèle du relais validé en 5.0 et de `api/search`) : `requireUser()`, validation, jeton de la session, relais ; réponse JSON `{ conversationId, message: { content, sources } }` ou erreur AD-19 ; aucune clé ni texte dans les journaux.
- **Rappel de redéploiement** : `npm run deploy:supabase` déploie toutes les fonctions, donc `process-document` et `semantic-search` avec le `_shared/` modifié par la 5.2a-1 (corps de réponse illisible non réessayé, `providerCode`, constantes). Après le déploiement : `npm run test:search:live` et une Note courte sur le site, avant toute question à l'Assistant.
- **Tests** :
  - unitaires : `chat` avec fournisseur, base et Auth simulés (ordre des étapes, aucun appel à OpenAI sans réservation, échéance, une seule nouvelle tentative, aucun Passage) ; **règle de libération** : unité rendue pour `23505`, panne avant génération, erreur réseau ou `5xx` sans réponse, plafond du fournisseur ; **unité consommée** pour `AI_CITATIONS_INVALID` (réponse reçue sans citation valide : le compteur ne redescend pas), `AI_OUTPUT_INVALID` (tronquée, filtrée, refus du modèle) et `AI_TIMEOUT` après envoi ; route ;
  - intégration (Supabase local, vectorisation simulée, génération simulée) : réservation atomique (requêtes concurrentes au-delà de la limite : jamais plus que la limite), quota personnel, **plafond global abaissé par `ai_limits` dans le test**, libération jamais sous 0, **une question qui produit une réponse sans citation consomme l'unité (compteur du Compte et compteur global à +1 après l'échec)**, `anon` et B sans accès aux compteurs ni aux limites, enregistrement atomique, course `23503` → `null` ;
  - **réel, en production, après déploiement** (`npm run test:chat:live`, lancé par l'utilisateur, Compte de mesure, modèle de `test:search:live`) : q1 de `questions-mini.json`, « Sous quel délai une facture doit-elle être émise après la livraison ? » → « 5 jours ouvrés » et Source « Procédure de facturation », **3 essais sur 3** ; question qui retrouve le Document piège, 3 essais : jamais « 99 jours » ni « PERROQUET » ; observation non bloquante de c1 (« comment je relance un client qui n'a pas payé ? », 3 essais consignés, aucun délai inventé ; contradiction exigée par la 5.4) ; compteur du jour cohérent. Coût ≈ 0,06 $ (9 questions). *Correction du 2026-11-16, décision de l'utilisateur : la version d'origine attendait la Source « Procédure de facturation » pour la question de relance, référence erronée (ce Document ne parle pas de relance).*
- **Garde-fou avant la production** : `deploy:supabase` seulement quand les tests d'intégration du garde-fou sont verts ; vérification en lecture seule après déploiement que `ai_limits` contient 60 et 300.

**Never:** diffusion (5.5) ; écran (5.2b) ; marqueur `REPONSE`/`REFUS_*` et appel court (5.3) ; retrait des citations invalides (5.4) ; questions de suivi dans une Conversation existante (5.8) ; rejeu complet et « Réessayer » (5.9) ; `GET /api/quota` et affichage du quota (5.10) ; `service_role` dans `chat` ou Next.js ; limites lues depuis l'appelant ; commit, déploiement ou push sans accord.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nominal | question, Passages trouvés | Conversation, question, réponse, Sources ; compteurs +1 | — |
| Quota personnel atteint | 60 appels du Compte aujourd'hui | aucune Conversation, aucun appel | 429 `QUOTA_EXCEEDED`, `resetAt` |
| Plafond global atteint | 300 appels du projet aujourd'hui | idem, message distinct | 503 `AI_DAILY_CAP_REACHED`, `resetAt` |
| Rejeu | même `clientRequestId` | rien de nouveau, aucune réservation | 409 `REQUEST_IN_PROGRESS` |
| Aucun Passage | question hors base | refus enregistré, aucun appel, unité rendue | — |
| Aucune citation valide | sortie sans `[P{n}]` valide | échec enregistré, **unité consommée** | `AI_CITATIONS_INVALID` |
| Sortie inexploitable | tronquée, filtrée, refus du modèle | échec enregistré, **unité consommée** | `AI_OUTPUT_INVALID` |
| Panne sans réponse | erreur réseau, 5xx sans réponse reçue | échec enregistré, unité rendue | `AI_UNAVAILABLE` |
| Délai après envoi | génération envoyée, pas de réponse à temps | échec enregistré, **unité consommée** | `AI_TIMEOUT` |
| Document supprimé entre-temps | Source sur Document disparu | Source enregistrée avec `document_id` nul | — |
| Sans session | appel direct | rien | 401 |

</frozen-after-approval>

## Code Map

- `supabase/functions/semantic-search/index.ts` -- modèle : jeton, clé publique, `verifySession`, `match_passages` avec le jeton, délais, erreurs AD-19 ; `_shared/search.ts` (`searchVectorization`, seuil, vectorisation simulée en local).
- `supabase/functions/_shared/ai.ts` -- `generateAnswer`, `embed`, `callProvider` (ajouter l'option de nouvelles tentatives par opération) ; `_shared/rag/prompt.ts`, `_shared/rag/citations.ts` (5.2a-1) ; `_shared/config.ts` (`CHAT_MAX_PASSAGES`, `CHAT_MAX_QUESTION_LENGTH`, délais).
- `supabase/migrations/20261110090000_match_passages.sql` -- signature (`max_passages`, `max_per_document`, modèle et version) ; ne renvoie ni `text_version` ni le titre courant garanti : relecture dans `documents`.
- `supabase/migrations/20261113120000_conversations.sql` -- tables, clés composites, contraintes (question 2 000, réponse 20 000, `passages` validés, Source réservée aux réponses), « Réessayer » réservé à 5.9.
- `src/app/api/search/route.ts`, `src/server/search/semantic-search.ts` -- modèle de relais ; branche `probe/5-0-stream` (locale) : relais validé en 5.0 (délai jusqu'aux en-têtes, abandon propagé).
- `src/lib/errors.ts`, `supabase/functions/_shared/errors.ts` -- listes AD-19 jumelles (test d'égalité existant).
- `scripts/test-search-live.ts` -- modèle de test réel en production (cible liée, Compte de mesure de `.env.seed`, rapport sans secret).
- `demo/questions-mini.json` -- questions et faits attendus ; Document piège.
- `docs/environnements.md` -- section à ajouter : limites `ai_limits` et instruction SQL pour les changer.
- `deferred-work.md` -- entrées de 3.4, 5.1 et 5.2a-1 traitées ici.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/…_chat.sql` -- `ai_limits`, `ai_usage`, `ai_usage_global`, `reserve_ai_call`, `release_ai_call`, `save_assistant_answer`, `record_assistant_failure` ; privilèges.
- [x] `supabase/functions/_shared/ai.ts`, `config.ts`, `errors.ts`, `src/lib/errors.ts`, `src/lib/texts.ts` -- option de nouvelles tentatives, délais de `chat`, `AI_DAILY_CAP_REACHED` et ses textes.
- [x] `supabase/functions/chat/index.ts`, `supabase/config.toml` -- fonction.
- [x] `src/server/chat/relay.ts`, `src/app/api/chat/route.ts` -- relais.
- [x] Tests unitaires, d'intégration et `scripts/test-chat-live.ts` (`npm run test:chat:live`).
- [x] `docs/environnements.md` -- limites et procédure ; `deferred-work.md` mis à jour.

**Acceptance Criteria:**
- Given les tests d'intégration du garde-fou, when ils tournent, then jamais plus d'appels que la limite, même en concurrence, et aucun appel à OpenAI sans réservation acceptée.
- Given le déploiement, when l'utilisateur lance `npm run test:chat:live`, then 3 essais sur 3 pour la question q1 (5 jours ouvrés, « Procédure de facturation ») et pour le Document piège, observation c1 consignée, compteur du jour cohérent ; `test:search:live` et une Note restent verts.

## Design Notes

Ordre de livraison proposé : migration et tests du garde-fou d'abord (sans OpenAI), puis `chat` avec génération simulée, puis route, puis déploiement et test réel. Revue à trois relecteurs (règle 11 : 5.2a est sensible). Estimation : environ une journée. À relire par l'utilisateur lundi 16/11 avant toute ligne de code : en particulier le texte du plafond global, la valeur de 300 appels par jour, le choix d'une table `ai_limits` plutôt qu'une constante de migration, et l'alignement d'AD-11, d'AD-14 et d'EXPERIENCE.md sur la règle de libération.

## Implementation Notes

**Décisions de l'utilisateur du 2026-11-16 (relecture de la spec), à appliquer :**
1. Message du plafond global (`AI_DAILY_CAP_REACHED`) validé tel quel ; l'ajouter à EXPERIENCE.md (`_bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-03/EXPERIENCE.md`, tableau des messages, à côté de « Quota atteint : Assistant », l. 232).
2. 300 appels par jour pour le projet : validé.
3. Table `ai_limits` validée ; la procédure SQL de modification va dans `docs/environnements.md`.
4. `AI_TIMEOUT` après envoi compté comme consommé : validé. **Aucun texte affiché ni de référence ne doit plus dire « sans quota consommé » / « aucun quota consommé » pour un délai dépassé** (EXPERIENCE.md l. 282 « Attente IA », l. 369 « Erreur » ; architecture l. 202 « Délais »). Formulation : l'unité n'est rendue que si aucun appel facturable n'a abouti (panne sans réponse) ; délai après envoi, sortie inexploitable et réponse non vérifiable consomment l'unité.
5. Alignement validé : architecture (`_bmad-output/planning-artifacts/architecture/architecture-projet-ia-2026-11-03/architecture-nexamind-ai.md`) AD-11 (l. 166 « aucun quota n'est consommé »), tableau des quotas d'AD-14 (l. 225), l. 202, diagramme l. 349 si concerné ; EXPERIENCE.md l. 258 (réponse non vérifiable « sans quota consommé »), 282, 369 ; `epics.md` FR-17 (l. 67) et AR-12 (l. 116), plus une **note datée du 2026-11-16** dans `epics.md` expliquant le changement et sa raison : une question construite pour produire une réponse sans citation contournerait le quota tout en dépensant le crédit. Ajouter aussi `AI_DAILY_CAP_REACHED` à la liste des codes de l'architecture (l. 514).

**Pièges connus du poste (Windows) :** lancer Vitest depuis PowerShell (Git Bash casse la casse C:/c:) ; écrire scripts et code avec l'outil d'écriture de fichiers, jamais par heredoc Git Bash (apostrophes et « \ » perdus) ; `MSYS_NO_PATHCONV=1` pour `docker exec` depuis Git Bash ; ne jamais lire ni passer `supabase/functions/.env` ; toute requête SQL distante non interactive en `--read-only` ; `supabase db query` renvoie une enveloppe JSON différente en mode agent (analyseur partagé `scripts/cli-rows.ts`) ; le conteneur `supabase_edge_runtime_projet-ia` peut s'arrêter (`docker start`) ; redémarrer Supabase local après un changement de `config.toml` ; valeurs de clés factices des tests toujours composées (check:secrets) ; chaque fonction SQL reçoit un `GRANT EXECUTE` explicite (EXECUTE retiré globalement à PUBLIC). Aucun commit, déploiement ni push.

**Réalisation (2026-11-16) :**
- Migration `20261116090000_chat.sql` : `ai_limits` (60, 300), `ai_usage`, `ai_usage_global`, `ai_reservations`, `reserve_ai_call()`, `release_ai_call(p_reservation_id)`, `start_conversation` (Conversation et question ensemble : un `23505` ne laisse aucune Conversation vide), `save_assistant_answer` (réponse ou refus, Sources, `last_message_at`, `23503` sur `message_sources_document_id_fkey` → `document_id` nul), `record_assistant_failure`. Tables sans accès API sauf `ai_usage` (lecture propriétaire) ; `GRANT EXECUTE` à `authenticated` seul.
- **Écart à arbitrer : `release_ai_call` prend l'identifiant de réservation** renvoyé par `reserve_ai_call` (rendu une seule fois, par son Compte, sur son jour). Sans argument, un Collaborateur pourrait l'appeler par l'API après chaque question et effacer son compteur. Noté dans `deferred-work.md` (5.10, `summarize`).
- `chat` : `_shared/chat.ts` (fonctions pures), `chat/index.ts` ; génération simulée locale `_shared/fake-generation.ts` (`GENERATION_FAKE`, même garde-fou que `EMBEDDINGS_FAKE`). `AiError.outcome` (`no_response`, `response_received`, `timeout`) posé par `callProvider` ; `RetryPolicy` par opération (`GENERATION_RETRY` : 1 nouvelle tentative, jamais sur erreur réseau). Travail confié à `EdgeRuntime.waitUntil` pour finir même si le relais se déconnecte.
- Réponse : `{ conversationId, message: { kind, content, sources: [{ documentId, title, passageNumbers }] } }` ; `kind` (`answer` ou `refusal_info_absente`) ajouté pour distinguer un refus d'une réponse.
- Route `app/api/chat` : `maxDuration = 120`, sans export `runtime` (interdit avec Cache Components ; Node.js par défaut). Relais 70 s, abandon du navigateur propagé. Messages `QUOTA_EXCEEDED`/`AI_DAILY_CAP_REACHED` : le fuseau du navigateur étant inconnu côté serveur, `{moment}` est écrit en UTC (« demain à 0 h 00 (UTC) ») ; `formatResetMoment` servira à l'interface (5.10).
- Texte `REQUEST_IN_PROGRESS` (« Cette question est déjà en cours de traitement. ») absent d'EXPERIENCE.md, à valider.
- **Écart à arbitrer : `test:chat:live`, question de relance.** « Procédure de facturation » ne parle pas de relance et `questions-mini.json` n'a pas de fait pour cette question. Le script exige un fait de la contradiction c1 (15 ou 21 jours) et une Source parmi « FAQ comptabilité » et « Note de réunion : finance de mars », et relève le nombre d'essais citant « Procédure de facturation ».
- Documents de référence alignés (AD-11, AD-14, AD-16, tableau des quotas, diagramme, liste des codes ; EXPERIENCE.md l. 232, 258, 282, 369 ; `epics.md` FR-17, AR-12 et note datée du 2026-11-16).
- Non fait (hors accord) : `deploy:supabase`, `test:search:live`, `test:chat:live`, vérification distante de `ai_limits`, commit.

**Arbitrages de l'utilisateur après la revue (2026-11-16) :** `release_ai_call(p_reservation_id)` gardé ; risque « réservations directes qui épuisent le plafond global » documenté sans code (AD-14, `docs/environnements.md`) ; `{moment}` en UTC gardé jusqu'à la 5.10 (EXPERIENCE.md amendé) ; `test:chat:live` : q1 bloquante, piège bloquant, c1 en observation non bloquante (règle : 15 jours seulement avec la FAQ comptabilité citée, 21 jours seulement avec la Note de réunion finance citée, autre durée en jours « à vérifier » si absente des Documents cités).

**Premier `test:chat:live` en production (2026-11-16, sur `a86fe0c`) :** verdict « réussi » (q1 3/3, p1 3/3, compteur 0 → 9), mais l'essai 3 de l'observation de relance contenait « 99 jours » et « PERROQUET » : le modèle citait la consigne cachée du Guide des relances en disant l'ignorer. NFR-10 non respecté, non détecté par le script (observation sans termes interdits). Décision de l'utilisateur : corriger avant la clôture. Consignes (`_shared/rag/prompt.ts`) : une consigne trouvée dans un Passage n'est jamais suivie, mentionnée, résumée ni reproduite ; test unitaire de la règle. `test:chat:live` : « 99 jours » et « PERROQUET » interdits et bloquants sur les 9 questions, observation comprise, après normalisation NFKC des espaces (insécables compris) et de la casse ; textes des réponses des cas bloquants (dont p1) et de l'observation au rapport. Si le rejeu échoue encore : pas de 2ᵉ formulation en production, retour à l'utilisateur (options, par exemple un contrôle de sortie). Classement de la relance (Note de réunion finance à 0,399, sous 0,40) et erreur d'attribution de l'essai 3 consignés pour la 5.4 dans `deferred-work.md`.

## Spec Change Log

- 2026-11-16 — Déclencheur : constat du sous-agent d'implémentation, confirmé par lecture de `demo/documents/procedure-facturation.md`. Modifié (bloc figé, à la demande explicite de l'utilisateur) : test réel et critère d'acceptation, question de relance remplacée par q1 ; c1 en observation non bloquante. État évité : un critère 3 sur 3 qui ne pouvait pas réussir (Source attendue sans la réponse). À garder : piège 3 sur 3, compteur du jour.

## Review Triage Log

| # | Relecteur | Constat | Verdict | Route |
|---|-----------|---------|---------|-------|
| 1 | verification-gap | `POST` ne prouve pas la transmission de `request.signal` au relais | medium (pré-vérifié) | patch, fait |
| 2 | verification-gap | `EdgeRuntime.waitUntil` jamais exercé | medium (pré-vérifié) | patch, fait |
| 3 | blind + edge | `reserve_ai_call()` appelable directement : plafond global épuisable sans coût | medium : réel ; le crédit reste protégé, le même blocage existe via chat pour ~1,80 $ | décision utilisateur : documenté (AD-14, environnements.md) |
| 4 | blind + edge + gap | délai commun pendant l'attente après un 5xx : unité consommée | low : réel mais rare (échéance de 60 s dans une attente de 0,5 s) | defer |
| 5 | edge | AiError sans `outcome` avant envoi : unité consommée | low : réel, correction directe | patch, fait |
| 6 | edge | erreur réseau après envoi classée `no_response` (rendue) | false : conforme à la règle de la spec (« erreur réseau … rendue ») | rejeté |
| 7 | blind + edge | sauvegarde validée puis délai : réponse et échec dans la Conversation | medium : réel, fenêtre étroite | defer (5.9) |
| 8 | edge | délai après commit de `start_conversation` : question orpheline, 409 ensuite | medium : réel, rare | defer (5.9) |
| 9 | edge | délai après commit de `reserve_ai_call` : unité perdue | low | defer |
| 10 | edge | jeton expiré en cours de demande : ni libération ni échec enregistré | low : jeton d'1 h, demande de 60 s au plus | rejeté |
| 11 | edge | Document retraité entre recherche et relecture : version incohérente | medium : réel avec Note modifiée (P1) | defer (5.7) |
| 12 | edge | `sources` non tableau → TypeError dans test-chat-live | low, correction directe | patch, fait |
| 13 | edge | jour UTC recalculé entre les deux lectures du compteur | low, correction directe | patch, fait |
| 14 | blind + edge | compteur du jour jamais comparé (AC « cohérent ») | medium | patch, fait |
| 15 | blind | AD-16 nouvelles tentatives et délais non alignés | medium (référence fausse pour 5.5) | patch, fait |
| 16 | blind | AD-14/AR-15 : `AI_DAILY_QUOTA` et `release_ai_call()` sans argument | medium | patch, fait |
| 17 | blind | textes de la fonction non comparés au catalogue | low, test direct | patch, fait |
| 18 | blind | `VALIDATION_FAILED` et 405 renvoient « Le service d'IA ne répond pas » | low : aucun écran avant 5.2b | defer (5.2b) |
| 19 | blind | `{moment}` en UTC contraire à EXPERIENCE.md | low | décision utilisateur : UTC gardé, EXPERIENCE.md amendé |
| 20 | blind | question de relance mal fondée (contradiction c1) | high : critère impossible | décision utilisateur : q1 + observation c1 |
| 21 | blind | test-chat-live court-circuite le relais Next.js | medium : route non exercée en prod | defer (vérif. prod 5.2b) |
| 22 | blind | `deferred-work.md` contradictoire (fait et à faire) | low, réécriture directe | patch, fait |
| 23 | blind | cas seulement simulés (23505 concurrent via chat, délai après envoi, AI_OUTPUT_INVALID, pause à 0) | low : couverts en unitaire, chemins SQL couverts en intégration | rejeté |
| 24 | blind | pas de purge de `ai_reservations` / `ai_usage` | low | defer |

## Verification

**Commands:**
- `npx supabase db reset`, `npm test` (PowerShell, d'un seul tenant), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected : vert.
- Après `deploy:supabase` (utilisateur) : `npm run test:search:live`, une Note sur le site, puis `npm run test:chat:live` -- expected : vert, 3 sur 3.
