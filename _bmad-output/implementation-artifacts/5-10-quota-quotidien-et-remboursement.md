---
title: 'Stories 5.10 + 5.11 : Quota quotidien, remboursement et états de l''Assistant'
type: 'feature'
created: '2026-11-20'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f84bb5740231f1f665a36a6b1b6cf8fcba3c13d1'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-9-idempotence-des-questions.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-2b-page-assistant.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le quota existe côté serveur depuis la 5.2a-2 (réservation atomique, 60 par Compte, plafond global de 300, libération selon AD-14, 61ᵉ appel refusé, plafond du fournisseur traduit en `AI_BUDGET_EXHAUSTED`, tout cela testé). Mais la page ne le découvre qu'à l'envoi : un Collaborateur au quota écrit sa question avant d'apprendre qu'il ne peut pas l'envoyer, l'heure de rétablissement est donnée en UTC, et la page ne se réactive pas d'elle-même. Deux cas laissent encore une unité mal comptée (rapports de la 5.8 et de la 5.9), et deux défauts d'affichage connus restent ouverts (alertes lues deux fois, date d'ajout des Documents).

**Approach (mode essentiel, plan du 2026-11-16 : 5.10 et 5.11 fusionnées) :** pas de nouvelle logique de quota côté serveur ; la page de l'Assistant lit le quota du Collaborateur au chargement (lecture serveur, RLS), affiche d'emblée le bloc de limite atteinte avec l'heure **locale** du rétablissement et se réactive seule à ce moment. `chat` corrige les deux comptes faux. Les deux défauts d'affichage sont corrigés au plus simple. Tout le reste de l'epic déjà livré est seulement vérifié par les tests existants.

## Boundaries & Constraints

**Always:**
- **Lecture du quota au chargement** (`/assistant` et `/assistant/[id]`, composant serveur) : compteur du jour UTC du Collaborateur (`ai_usage`, politique « Le propriétaire lit ses compteurs d'IA ») et limite (`ai_limits.ai_daily_quota`), avec le jeton du Collaborateur, jamais `service_role` ; `resetAt` = prochain 00:00 UTC. Lecture en échec : la page s'affiche comme aujourd'hui (le refus à l'envoi reste le filet), sans erreur visible (Q1).
- **Bloc de limite atteinte** (quota personnel atteint au chargement, ou `QUOTA_EXCEEDED` reçu à l'envoi) : texte du catalogue « Vous avez atteint votre limite quotidienne… Elle sera rétablie {moment}. La Recherche reste disponible. », bloc neutre (pas une alerte d'erreur), lien « Ouvrir la Recherche » ; champ et « Envoyer » en `aria-disabled` avec la raison « Limite quotidienne atteinte » reliée par `aria-describedby` ; la question tapée reste dans le champ et n'entre pas dans le fil ; le fil existant (Conversation rouverte) reste lisible et ses Sources ouvrables.
- **Heure locale** (report de la 5.2b, décision du 16/11 « heure UTC » levée) : `{moment}` est calculé **dans le navigateur** à partir de `resetAt` (fuseau du navigateur, formats de `formatResetMoment`, sans « (UTC) ») ; même règle pour `AI_DAILY_CAP_REACHED`. Le relais garde un texte de repli en UTC pour un client qui n'aurait pas `resetAt`.
- **Réactivation sans rechargement** : à `resetAt` (minuterie), et au retour sur l'onglet (`visibilitychange`) si `resetAt` est passé, le bloc disparaît, le champ et « Envoyer » se réactivent ; la question conservée reste dans le champ.
- **Plafond global atteint au chargement** (Q2) : non lu au chargement ; découvert à l'envoi comme aujourd'hui (`AI_DAILY_CAP_REACHED`, sans « Réessayer », heure locale).
- **R6 de la 5.9** (`chat`, deux demandes « new » simultanées du même identifiant sur une question de suivi) : le perdant (`23505` sur `add_question`) applique la règle de libération d'AD-14 à sa reformulation (rendue seulement si aucune requête de reformulation n'a été envoyée ou si elle a échoué sans réponse ; consommée sinon), au lieu de rendre l'unité sans condition.
- **Échéance pendant `reserve_ai_call`** (rapport de la 5.8 et de la 5.2a-2) : la réponse de `reserve_ai_call` est lue avec le délai de nettoyage, hors de l'échéance commune (comme `add_question` après une reformulation), pour que l'identifiant de réservation soit toujours connu ; si l'échéance est passée à la lecture, l'unité est rendue aussitôt (`release_ai_call`) et la réponse est l'échec de délai habituel (`AI_TIMEOUT`, JSON 504 ou `error`) ; garde-fou des 17 s inchangé.
- **Alertes lues deux fois** (report de la 5.2b, motif commun à l'application, Q3) : une seule annonce par alerte d'erreur qui reçoit le focus.
- **Date d'ajout des Documents** (report de la 5.6) : `AddedOn` suit le correctif de `ConversationDate` (fuseau fixe au rendu serveur et à l'hydratation, fuseau du navigateur ensuite) ; aucun avertissement d'hydratation.
- **Tests** : unitaires (page : bloc au chargement, `aria-disabled` et `aria-describedby`, question conservée, heure locale calculée dans un fuseau donné, réactivation à `resetAt` et au retour sur l'onglet, `QUOTA_EXCEEDED` à l'envoi → bloc ; `chat` : R6, échéance pendant `reserve_ai_call` → unité rendue ; `AddedOn` ; alerte annoncée une fois) ; intégration (lecture du quota par le Collaborateur, jamais celui d'un autre ; R6 ; échéance pendant la réservation → compteur inchangé) ; e2e (quota simulé atteint au chargement à 375 px et 1 280 px, clavier, axe sans violation ; réactivation par horloge simulée) ; tests existants du quota serveur inchangés et verts.
- **Revue** : un relecteur séparé (décision de l'utilisateur du 2026-11-16, story sensible : quota), centré sur la lecture du quota (RLS, jamais `service_role`, aucun autre Compte), R6 et l'échéance de réservation (règle d'AD-14, chaîne des délais, garde-fou des 17 s), l'accessibilité du bloc et des alertes, et la non-régression des flux 5.5 à 5.9.

**Ask First:** toute modification de la limite, du plafond ou de la règle de libération ; toute nouvelle fonction SQL ou migration ; toute route d'API nouvelle ; tout changement de délai.

**Never:** quota lu ou affiché pour un autre Compte ; `service_role` dans Next.js ; appel au fournisseur sans réservation ; unité rendue après une requête de reformulation ou de génération qui a reçu une réponse ; bloc de quota pour `AI_BUDGET_EXHAUSTED` ; question perdue au refus de quota ; commit, déploiement ou push sans accord.

## Décisions de l'utilisateur (2026-11-20)

Spec approuvée en entier : **Q1 = A**, **Q2 = A**, **Q3 = A**. Précision pour la revue :
- **Cloisonnement du quota** — périmètre du relecteur : la lecture du quota côté serveur ne révèle jamais le compteur d'un autre Compte, même avec un identifiant forgé (paramètre, cookie, en-tête ou corps manipulé : l'identité vient uniquement de la session vérifiée, la RLS filtre `ai_usage`) ; le bloc « limite atteinte » n'apparaît jamais pour un Collaborateur parce qu'un autre Compte a atteint son quota. Tests d'intégration et e2e à deux Comptes (A au quota, B sous le quota : B voit la page normale).
- **Correction de la spec (2026-11-20, décision de l'utilisateur, option A)** — erreur de la spec initiale : elle prévoyait de lire `ai_limits.ai_daily_quota` avec le jeton du Collaborateur, alors que la migration de la 5.2a-2 retire tout droit sur `ai_limits` (`revoke all`, test d'intégration « … ni les limites » qui attend `42501`) ; la lecture échouait donc toujours et le bloc n'apparaissait jamais au chargement. Relevé par l'agent d'implémentation, qui n'a rien ajouté (Ask First). Décision : **une migration** (seule exception à « toute nouvelle migration » de l'Ask First) : `grant select (key, value) on public.ai_limits to authenticated` (droits de colonnes : aucune autre colonne), politique RLS de lecture limitée à `key = 'ai_daily_quota'` ; rien pour `anon` ; aucun droit d'écriture (ni `insert`, ni `update`, ni `delete`). Tests d'intégration : un Collaborateur lit `ai_daily_quota` et rien d'autre (`ai_global_daily_cap` invisible, autres colonnes refusées, `insert`/`update`/`delete` refusés), `anon` ne lit rien ; le test existant « … ni les limites » est adapté en ce sens. Contrôle distant en lecture seule après `deploy:supabase` : droits et politique sur `ai_limits`.

## Questions à trancher avant le code (tranchées, voir ci-dessus)

- **Q1 — Lecture du quota.** **A (recommandé, essentiel)** : lecture par le composant serveur de la page (jeton du Collaborateur, RLS), passée à la vue ; pas de route d'API. La réactivation ne dépend que de `resetAt`, connu sans nouvel appel. B : `GET /api/quota` (critère de l'epic) appelé par la page au chargement et au retour sur l'onglet : une route de plus à sécuriser et à tester, sans usage pour la démonstration.
- **Q2 — Plafond global au chargement.** **A (recommandé)** : non lu ; il n'est atteint que si tous les Comptes cumulent 300 questions dans la journée, improbable pendant la démonstration, et le refus à l'envoi existe déjà. B : lu aussi au chargement (lecture de `ai_usage_global`, droits à vérifier, probablement une migration).
- **Q3 — Alertes lues deux fois.** **A (recommandé)** : l'alerte qui reçoit le focus perd `role="alert"` (le focus suffit à la faire lire, avec son titre comme nom accessible) ; celles qui ne reçoivent pas le focus le gardent ; un seul composant (`ErrorAlert`, propriété explicite), appliqué à l'Assistant, à la Recherche et à la Bibliothèque. B : garder `role="alert"` partout et ne plus déplacer le focus (contraire à EXPERIENCE.md). C : laisser en l'état et vérifier avec un vrai lecteur d'écran en 7.3.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Quota atteint au chargement | 60 sur 60 aujourd'hui | bloc neutre d'emblée, heure locale, champ et « Envoyer » `aria-disabled`, « Ouvrir la Recherche » | — |
| Quota non atteint | 59 sur 60 | page normale | — |
| Refus à l'envoi | 61ᵉ envoi (autre onglet) | bloc affiché, question gardée dans le champ, pas dans le fil | `QUOTA_EXCEEDED` |
| Rétablissement | `resetAt` atteint, page ouverte | bloc retiré, champ réactivé, sans rechargement | — |
| Retour sur l'onglet | onglet caché pendant `resetAt` | réactivé au retour | — |
| Lecture du quota en échec | erreur de lecture | page normale, refus à l'envoi en filet | — |
| Heure locale | `resetAt` 00:00 UTC, navigateur à Paris | « à 01:00 » ou « demain à 01:00 » selon le moment, sans « (UTC) » | — |
| Plafond global | 300 atteint | à l'envoi seulement : message du plafond, heure locale, sans « Réessayer » | `AI_DAILY_CAP_REACHED` |
| Plafond du fournisseur | `AI_BUDGET_EXHAUSTED` | alerte de panne « Réessayez plus tard », sans bloc de quota, question conservée, focus sur l'alerte | — |
| Question de 2 001 caractères | saisie | envoi bloqué, compteur et bordure en rouge (existant, vérifié) ; appel direct refusé | `VALIDATION_FAILED` |
| R6 | deux « new » simultanées, même identifiant, question de suivi | le perdant consomme son unité si sa reformulation a reçu une réponse | AD-14 |
| Échéance pendant la réservation | réponse de `reserve_ai_call` lue après l'échéance | unité rendue, compteur inchangé | `AI_TIMEOUT` |
| Alerte avec focus | panne affichée | annoncée une seule fois | — |
| Date d'ajout | Document ajouté à 23:30 UTC, navigateur à Paris | date du lendemain (heure de Paris) après hydratation, sans avertissement | — |
| Autre Compte | lecture du quota | seulement le compteur du Collaborateur connecté | RLS |

</frozen-after-approval>

## Code Map

- `src/app/(app)/assistant/page.tsx`, `src/app/(app)/assistant/[id]/page.tsx` -- lecture du quota (Q1), passée à `AssistantView`.
- `src/server/` (module de lecture du quota, jeton du Collaborateur) -- compteur du jour UTC et limite.
- `supabase/migrations/<nouvelle>_ai_limits_read.sql` (correction du 2026-11-20) -- `grant select (key, value)` sur `ai_limits` à `authenticated`, politique de lecture `key = 'ai_daily_quota'` ; `tests/integration/chat.test.ts` (test « … ni les limites » adapté, nouveaux cas de droits).
- `src/components/assistant/assistant-view.tsx` -- bloc de limite atteinte, `aria-disabled` et `aria-describedby`, réactivation (`resetAt`, `visibilitychange`), `QUOTA_EXCEEDED` et `AI_DAILY_CAP_REACHED` avec heure locale.
- `src/lib/reset-moment.ts`, `src/lib/texts.ts`, `src/server/chat/relay.ts` -- moment local calculé dans le navigateur, repli UTC du relais.
- `supabase/functions/chat/index.ts` -- R6 (règle d'AD-14 pour le perdant du `23505`), lecture de `reserve_ai_call` hors de l'échéance commune et libération.
- `src/components/forms/error-alert.tsx` et ses usages (Assistant, Recherche, Bibliothèque) -- Q3.
- `src/components/documents/added-on.tsx` -- même correctif que `ConversationDate` (`conversation-rows.tsx`).
- Tests : `tests/unit/assistant-view.test.tsx`, `tests/unit/chat-function.test.ts`, `tests/unit/chat-route.test.ts`, tests de `ErrorAlert` et `AddedOn` ; `tests/integration/chat.test.ts` ; `tests/e2e/assistant.spec.ts`.
- AD-14 / AD-16 (lecture de la réservation hors échéance), `deferred-work.md` (reports traités ; purge d'`ai_reservations`, alerte des puces de Source (5.7, M3b) et route `GET /api/quota` si Q1 = A restent reportées).

## Tasks & Acceptance

**Execution:**
- [x] Lecture du quota au chargement (Q1) + bloc de limite atteinte, accessibilité, réactivation, heure locale + tests unitaires et e2e.
- [x] Migration de lecture de `ai_limits` (correction du 2026-11-20, option A) + tests d'intégration des droits ; les tests e2e du quota au chargement s'exécutent (plus ignorés) et passent ; plus de `quota_read_failed` à l'ouverture de l'Assistant.
- [x] `chat` : R6 et échéance pendant `reserve_ai_call` + tests unitaires et d'intégration.
- [x] Alertes lues une seule fois (Q3) + tests.
- [x] `AddedOn` + test.
- [x] AD-14 / AD-16, deferred-work.

**Acceptance Criteria:**
- Given 60 questions consommées aujourd'hui (UTC), when j'ouvre l'Assistant, then le bloc « Vous avez atteint votre limite quotidienne… Elle sera rétablie {moment}. » s'affiche d'emblée avec l'heure locale du prochain 00:00 UTC, le champ et « Envoyer » sont `aria-disabled` avec la raison « Limite quotidienne atteinte » reliée par `aria-describedby`, et « Ouvrir la Recherche » est proposé.
- Given un refus de quota à l'envoi, when il survient, then la question reste dans le champ et n'entre pas dans le fil.
- Given le moment de rétablissement atteint, ou le retour sur l'onglet après ce moment, when il arrive, then le champ se réactive sans rechargement.
- Given `AI_BUDGET_EXHAUSTED`, `AI_UNAVAILABLE` ou `AI_TIMEOUT`, when l'erreur est reçue, then l'alerte de panne du catalogue s'affiche (sans bloc de quota), la question est conservée, le focus va sur le message et il est annoncé une seule fois.
- Given deux demandes simultanées de suivi avec le même identifiant, when la seconde perd sur `23505` après une reformulation qui a reçu une réponse, then son unité est consommée (AD-14).
- Given l'échéance commune qui tombe pendant `reserve_ai_call`, when la réservation a été validée en base, then l'unité est rendue et le compteur du jour est inchangé.

## Design Notes

Partie la plus risquée : la réactivation (minuterie longue, onglet en veille, horloge du poste) ; la page ne fait confiance qu'à `resetAt` du serveur et revérifie au retour sur l'onglet. Le reste de l'epic 5.10 (concurrence au 60ᵉ appel, 61ᵉ appel, tableau d'AD-14, plafond du fournisseur) est déjà livré et testé depuis la 5.2a-2 et la 5.3 : aucun code, seulement la vérification complète. **Estimation : 3 à 4 h.**

Déploiement (corrigé le 2026-11-20) : commit → `deploy:supabase` (migration de lecture de `ai_limits` + `chat`) → contrôle distant en lecture seule (droits de colonnes et politique sur `ai_limits`, rien pour `anon`, aucun droit d'écriture) → push → `npm run test:chat:live` (non-régression) → vérification en production (Compte au quota simulé par SQL sur un Compte de test, puis remis à zéro) → clôture.

## Verification

**Commands:**
- Supabase local à neuf, `npx supabase db reset` (par l'utilisateur), puis `npm test` (PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run check:secrets`, `npm run test:e2e` à 8 workers -- expected : vert (échec connu et accepté : `search-page` « parcours réel au clavier » sous charge, story 7.3).
- Après déploiement et push : `npm run test:chat:live` (15 sur 15) (utilisateur).

**Manual checks (production) :**
- Compte de test mis au quota par SQL : bloc d'emblée sur `/assistant`, heure locale, « Ouvrir la Recherche » ; compteur remis à 0 puis retour sur l'onglet : champ réactivé.
- q1 normale sur un Compte sous le quota.

## Implementation Notes

**2026-11-20 (implémentation, avant revue ; rien commité, rien déployé) :**
- **Écart bloquant (Ask First) — tranché le 2026-11-20, option A, voir ci-dessous :** `ai_limits` n'est lisible par aucun rôle de l'API (`revoke all`, migration de la 5.2a-2 ; le test d'intégration existant « ni les limites » attend `42501`). La lecture de `ai_limits.ai_daily_quota` avec le jeton du Collaborateur, demandée par la spec, échoue donc toujours : `getQuota` renvoie `null` (« lecture en échec → page normale »), et le bloc n'apparaît qu'au refus à l'envoi. Aucune migration, fonction SQL ni constante n'a été ajoutée. Options : (A) migration `grant select` sur `ai_limits` à `authenticated` + politique limitée à `ai_daily_quota` (test « ni les limites » à adapter) ; (B) fonction SQL qui renvoie la limite ; (C) constante 60 dans Next.js.
- **Lecture du quota (Q1 = A)** : `src/server/quota/get-quota.ts` (`ai_usage` du jour UTC filtré par la RLS seule, aucun identifiant fourni ; `ai_limits` ; `resetAt` = prochain 00:00 UTC ; toute erreur → `null`, journalisée `quota_read_failed`). Appelée par `/assistant` (composant serveur `AssistantWithQuota` sous la frontière Suspense existante, `connection()`) et `/assistant/[id]` (en parallèle de la Conversation). Note : tant que l'écart ci-dessus n'est pas tranché, chaque chargement de l'Assistant journalise `quota_read_failed` (`42501`).
- **Page** (`assistant-view.tsx`) : prop `quota` ; état `quotaUntil` (au chargement si `used >= limit`, ou `QUOTA_EXCEEDED` reçu, `resetAt` du serveur) ; nouvelle lecture du serveur (rafraîchissement) fait foi, une lecture en échec ne change rien. Bloc neutre `QuotaBlock` (texte du catalogue, moment local par `formatResetMoment` dans le fuseau du navigateur ; fuseau fixe au rendu serveur et à l'hydratation), lien « Ouvrir la Recherche », dans une région `aria-live="polite"` toujours rendue (pas `role="status"`, déjà pris par le fil). Champ `aria-disabled` + `readOnly` (question lisible et copiable), placeholder et raison visible « Limite quotidienne atteinte » reliée par `aria-describedby` au champ et à « Envoyer » ; Entrée/« Envoyer »/« Réessayer » sans effet, « Réessayer » retiré. Réactivation : minuterie jusqu'à `resetAt` ; `visibilitychange` : après `resetAt` → réactivé ; avant → `router.refresh()` (relecture du quota) seulement si l'adresse est celle de la page rendue. `QUOTA_EXCEEDED` à l'envoi : la question sort du fil et revient dans le champ ; sur « Réessayer », l'échec précédent est rétabli (5.9). `AI_DAILY_CAP_REACHED` : alerte comme avant, message recalculé avec l'heure locale à partir de `resetAt` ; texte UTC du relais gardé en repli sans `resetAt`.
- **`chat`** : R6 — drapeau `rewriteBilled` (reformulation réussie, ou échec avec réponse reçue) ; au `23505`, unité consommée si vrai, rendue sinon. Réservation — `reserve_ai_call` lue avec `AbortSignal.timeout(cleanupMs)` hors de `within()` ; échéance passée avant la réservation → `AI_TIMEOUT` sans réserver ; réservation validée et échéance passée à la lecture → `reservationId` gardé, `AI_TIMEOUT` levé, `fail()` rend l'unité (génération non envoyée) ; quota refusé après l'échéance → 429 comme avant.
- **Q3** : `ErrorAlert` reçoit `focused` (sans `role="alert"`, `role="group"` nommé par le titre, décrit par le texte) et `data-error-alert`. Assistant : `focused` pour le dernier échange envoyé depuis la page ; Recherche : quand le résultat recevra le focus ; Bibliothèque inchangée (le focus ne va jamais sur son alerte). Formulaires d'authentification et d'ajout non modifiés (hors périmètre).
- **`AddedOn`** : crochet commun `src/lib/use-hydrated.ts` (`useDisplayTimeZone`), partagé avec `ConversationDate`.
- **Tests** : unitaires (`chat-function` : R6 ×3, échéance pendant la réservation ×3, test du garde-fou « réservation lente » qui exige maintenant la libération ; `assistant-view` : 11 cas 5.10 ; `get-quota`, `error-alert`, `added-on`, `search-view`) ; intégration (`chat.test.ts`, 3 cas : lecture du quota à deux Comptes, échéance pendant la réservation → compteurs inchangés, R6 déterministe par `handle()` contre la base locale → +2) ; e2e (`assistant.spec.ts` : `QUOTA_EXCEEDED` simulé + réactivation par horloge + axe, plafond à l'heure locale ; deux cas au chargement à deux Comptes, clavier, axe, réactivation — ignorés tant que la limite est illisible ; `search-page.spec.ts` adapté à Q3). Tests existants modifiés seulement là où ils inscrivaient l'ancien comportement (R6, réservation non lue, `role="alert"` d'une alerte focalisée, quota affiché en alerte UTC).

**2026-11-20 (correction de la spec, option A de l'utilisateur ; rien commité, rien déployé) :**
- Migration `supabase/migrations/20261120150000_ai_limits_read.sql` : `grant select (key, value) on public.ai_limits to authenticated` (droits de colonnes seulement, aucun droit sur la table entière) et politique « Le Collaborateur lit la limite quotidienne d'IA » (`for select to authenticated using (key = 'ai_daily_quota')`) ; rien pour `anon` ni `public` ; aucun droit d'écriture. Appliquée en local par `npx supabase migration up --local` (pas de `db reset`).
- Tests d'intégration (`chat.test.ts`) : le test « … ni les limites » devient « … des limites, seulement ai_daily_quota ; ni écriture » (le Collaborateur lit `[{ key: 'ai_daily_quota', value: 60 }]`, `ai_global_daily_cap` invisible même demandé, `insert`/`update`/`delete` → `42501`, valeur inchangée) ; nouveau cas de droits en SQL (pas de `SELECT` sur la table entière, donc aucune autre colonne présente ou future ; `key` et `value` seulement ; aucune écriture ; rien pour `anon` ; une seule politique, sur `ai_daily_quota`) ; « anon : ni compteurs, ni limites » inchangé et vert ; lecture du quota à deux Comptes resserrée (A : `{ used: 60, limit: 60, resetAt }`, B : `{ used: 1, limit: 60, resetAt }`, jamais bloqué). `chat.test.ts` : 51 sur 51 (dont 8 relancés après la dernière retouche).
- E2e : garde `test.skip` retirée ; les 4 tests du quota (`assistant.spec.ts`, « quota quotidien (story 5.10) » et « plafond simulé ») s'exécutent et passent sur les deux largeurs (8 sur 8, aucun ignoré) ; aucune ligne `quota_read_failed` dans le journal du serveur pendant cette exécution.

## Review Triage Log

Relecteur séparé unique (2026-11-20, décision de l'utilisateur du 2026-11-16). **Cloisonnement du quota conforme** (exigence de l'utilisateur) : aucun identifiant fourni par la page, RLS sur la session vérifiée, aucun cache Next.js, prérendu sans quota ; vérifié en navigateur sur le build du jour (A au quota voit le bloc ; déconnexion, B connecté dans le même onglet : aucun bloc). **Migration conforme**, vérifiée en base (colonnes `key` et `value` seulement, ligne `ai_daily_quota` seulement, rien pour `anon`, aucune écriture). R6, réservation (aucune double libération, aucun appel sans réservation), garde-fou des 17 s, page, `AddedOn` : corrects.

| # | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|
| C1 | Alerte ni annoncée ni focalisée : `focused` retire `role="alert"` dès que le focus est **prévu** (`isLast && !exchange.stored` ; Recherche : drapeau pris au départ de la requête), alors que l'effet ne le déplace que si le focus est « libre » (`body` ou conteneur) ; focus dans le panneau Source (≥ 1 024 px) ou dans la navigation pendant la requête → panne muette | medium | `assistant-view.tsx` l. 543-549 et 899, `search-view.tsx` l. 123-131 et 204 ; relu par moi | patch : décider une seule fois si le focus sera déplacé (condition « libre » au moment du résultat), stocker ce drapeau avec le résultat, l'utiliser pour `focused` ET pour l'effet ; sinon `role="alert"` ; tests (Assistant et Recherche) |
| C2 | Lecture de `reserve_ai_call` plafonnée à 5 s même loin de l'échéance (avant : tout le temps restant) : base lente → `INTERNAL` au lieu d'une réussite, et unité perdue si la réservation est validée | low | `chat/index.ts` l. 704 `AbortSignal.timeout(cleanupMs)` | patch : `remaining() + cleanupMs` (rétablit le budget d'avant, plus la marge de lecture ; garde-fou des 17 s inchangé) ; test |
| C3 | JSON : échéance pendant la réservation → pire cas ~75 s (60 + 5 + 5 + 5) contre 70 s du relais (avant : 70 s) | low | calcul du relecteur ; exige ~60 s avant la réservation | rejeté (quasi théorique) ; note dans AD-16 |
| C4 | Réactivation fondée sur l'horloge du poste (`resetMs - Date.now()`) : poste en avance → bloc qui clignote ; en retard, onglet visible → bloc après 00:00 UTC | low | `assistant-view.tsx` l. 342 ; aucune unité consommée, le refus serveur reste juste | rejeté (improbable en démonstration, correctif non trivial) |
| C5 | Libellé « demain »/« aujourd'hui » figé après minuit local ; écart d'hydratation possible autour de minuit | low (hypothèse) | `QuotaBlock` calculé au rendu | rejeté (improbable, correctif non trivial) |
| C6 | Tests : l'e2e de l'Assistant ne vérifie plus aucun rôle accessible (`[data-error-alert]`) ; test SQL des droits aveugle aux droits de colonne en écriture ; espace manquante `RefusalActionsProps ={` ; test `AI_DAILY_CAP_REACHED` presque tautologique | low | lu dans les tests | patch : `getByRole("group", { name })` (alerte focalisée) et `getByRole("alert")` (non focalisée) dans `assistant.spec.ts` ; `has_any_column_privilege('authenticated', 'public.ai_limits', 'INSERT, UPDATE') = false` ; espace ; le test du plafond est accepté (l'e2e réglé sur Paris fait la preuve) |
| C7 | Test unitaire de la 5.9 « génération bornée au temps restant » instable sous charge (750 ms attendus, 1 356 ms mesurés avec 6 fichiers en parallèle ; 3 sur 3 seul) | low | antérieur à cette story | defer (7.3, avec `search-page`) |

## Vérification complète (2026-11-20, après les correctifs de revue)

`npx supabase db reset` lancé par l'utilisateur (migrations rejouées depuis une base vide ; `ai_limits` : `SELECT` des colonnes `key` et `value` pour `authenticated` seulement, une politique `key = 'ai_daily_quota'`), edge runtime redémarré. `npm test` sous PowerShell (98 fichiers, 1 992 tests), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` (dont `check:secrets --static`), `npm run check:secrets`, `npm run test:e2e` à 8 workers (381 passés, 19 ignorés par conception, 0 échec ; aucun `quota_read_failed` dans les journaux du serveur) : vert. Tri de revue : C1, C2 et C6 corrigés, C3 rejeté avec note dans AD-16, C4 et C5 rejetés, C7 reporté en 7.3. Reste : commit sur accord, `deploy:supabase` (migration `20261120150000_ai_limits_read.sql` + `chat`), contrôle distant en lecture seule des droits et de la politique sur `ai_limits`, push, `test:chat:live`, vérification en production, clôture.

## Déploiement et vérification en production (2026-11-20)

Commit `b53355e`. `deploy:supabase` par l'utilisateur : migration `20261120150000_ai_limits_read.sql` appliquée, `chat` redéployée (73 kB), `process-document` et `semantic-search` inchangées. Contrôle distant en lecture seule (`has_column_privilege`, la vue `information_schema.column_privileges` n'étant pas visible du rôle de lecture seule) : `authenticated` lit seulement `key` et `value` (les deux seules colonnes), aucun `INSERT`, `UPDATE` ni `DELETE` ; `anon` rien ; une seule politique « Le Collaborateur lit la limite quotidienne d'IA » (`authenticated`, `SELECT`, `key = 'ai_daily_quota'`) ; RLS active. Push de `b53355e`.

Vérification par l'utilisateur :
- `npm run test:chat:live` : **15 sur 15**, compteur du Compte de mesure 1 15 → 30 (cohérent), `docs/mesures/assistant-live.md`.
- Heures des Conversations affichées en heure de La Réunion (fuseau du navigateur).
- Compte de l'utilisateur mis à 60 par SQL : bloc « limite atteinte » dès le chargement de l'Assistant, avec l'heure locale, champ désactivé, lien « Ouvrir la Recherche ».
- Remise à 0 : le champ se réactive seul au retour sur l'onglet, sans rechargement.
- Compte de mesure 1 : une requête « mise à 60 » lui avait d'abord été appliquée par erreur (elle ne visait pas le compte connecté sur le site) ; remis à 0 et contrôlé par un select.

Conforme. Stories 5.10 et 5.11 `done` le 2026-11-20.
