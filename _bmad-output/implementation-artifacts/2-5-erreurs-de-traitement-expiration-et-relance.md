---
title: 'Story 2.5 : Erreurs de traitement, expiration et relance'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: 'f8901f78020e93a1b48687875db641d14fcd0b9b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un Document en erreur temporaire reste bloqué : le bouton « Relancer le traitement » est inactif, un texte provisoire annonce la relance, et le bandeau n'indique ni un traitement long ni une panne durable de l'interrogation du Statut.

**Approach:** Une fonction SQL `retry_processing`, fondée sur le Statut effectif et réservée à l'Auteur, crée une nouvelle tentative propre. Une Server Action la déclenche, et le bandeau gère la relance, le message des 60 s, « Actualiser » et la reprise du suivi.

## Boundaries & Constraints

**Always:**
- **`retry_processing(p_document_id, p_client_request_id)`** : `security definer`, `search_path = ''`, `EXECUTE` à `authenticated` seul (AD-5, AD-6, AD-16). Verrou de la ligne, puis lecture de `effective_status` et `effective_error_kind` **dans `documents_list`** : la règle des 3 min n'est pas recopiée.
- **Autorisation** : Statut effectif `error` et `temporary` seulement, y compris un Document expiré. Document absent : `P0002`. Non-Auteur : `42501`. `no_text`, *prêt* ou *en cours* non expiré : `55000`. Aucune écriture dans ces cas.
- **État propre** : nouveaux `attempt_id` et `processing_started_at`, `status = processing`, `error_kind` et `error_message` à `null`, anciens Passages supprimés, `last_retry_request_id` enregistré.
- **Idempotence** : même `client_request_id` : `null`, aucune nouvelle tentative, aucun déclenchement. Un nouveau clic après une réponse reçue porte un nouvel identifiant.
- **Vue** : `documents_list` expose aussi `effective_error_message` (dernière colonne, expiration comprise). Une tentative périmée n'écrit jamais rien après une relance.
- **Server Action** : `requireUser()`, validation des identifiants, jeton du Collaborateur, `triggerProcessing` attendu (abandon s'il échoue), puis Statut relu et renvoyé.
- **60 s** : durée = `server_now` − `processing_started_at`, calculée côté serveur à l'ouverture et à chaque interrogation. Aucune horloge du poste. Le message remplace le texte du bandeau *en cours*.
- **Trois échecs consécutifs** (réseau, 5xx, délai ; pas 401 ni 404) : « Le Statut n'a pas pu être actualisé. » + « Actualiser ». L'interrogation continue ; le premier succès retire le message. « Actualiser » interroge aussitôt, sans `router.refresh()`, qui rechargerait la page hors connexion.
- **Resynchronisation** : quand le Statut reçu du serveur change, l'état du bandeau s'aligne et, s'il repasse *en cours*, le suivi reprend ; « prêt » sera de nouveau annoncé.
- **Bouton** : actif pour l'Auteur, « Relance… » et `aria-disabled` pendant l'action, second clic sans effet.
- **Textes** : auteur « Le traitement n'a pas pu aboutir. Vous pouvez le relancer. » pour toute erreur temporaire (AD-5, critère de la story) ; texte provisoire retiré. `no_text` : raison lue en base, car 2.6b aura un message d'encodage. Autre Collaborateur : raison, sans action.

**Décisions du 2026-11-09 :**
- **Q1 = C.** Pour un `no_text`, aucun bouton « Supprimer » avant la story 3.4 : le bandeau indique seulement que le fichier ne contient aucun texte exploitable. Ce critère de 2.5 est reporté explicitement à 3.4, qui ajoute l'action « Supprimer » dans ce bandeau, avec son test. 2.6b crée les premiers cas `no_text` réels, la veille de 3.4.
- **Q2 = A.** Échec de la relance : « La relance n'a pas abouti. Veuillez réessayer. ». Refus d'un non-Auteur : « Cette action n'est pas autorisée. ».
- **Story gardée entière**, au-dessus du repère de taille.

**Never:** Relance d'un `no_text`. Action « Supprimer » et privilège `DELETE` (3.4). Modification de `process-document`. Lecteur de Document (3.1), Bibliothèque (3.3). Document long au mini Jeu, commit, push ou écriture sur le projet distant sans validation. Story 3.1.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Relance | Auteur, `temporary` | nouvelle tentative, *en cours* puis *prêt* | — |
| Expiré | `processing` > 3 min | relance acceptée | — |
| Non-Auteur | appel direct | refus, rien d'écrit | `42501` → `FORBIDDEN` |
| Sans texte | `no_text`, appel direct | refus, rien d'écrit | `55000` |
| En cours récent | < 3 min | refus, rien d'écrit | `55000` : Statut relu |
| Visiteur | sans session | refus | `42501` / `UNAUTHENTICATED` |
| Rejeu | même identifiant | `null`, une seule tentative | aucun déclenchement |
| Ancienne tentative | fin tardive après relance | ignorée | `false` |
| Déclenchement refusé | pas de `202` | abandon, *en erreur*, bouton de nouveau proposé | journal |
| Relecture impossible | après relance réussie | *en cours* supposé, l'interrogation corrige | — |
| Coupure puis retour | 3 échecs, puis succès | message affiché puis retiré | suivi continu |

</frozen-after-approval>

## Code Map

- `AGENTS.md`, `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` -- Next.js 16 : lire avant d'écrire la Server Action.
- Environnement : tests d'intégration et e2e sur Supabase local, déjà démarré ; appliquer la migration **en local seulement** (`npx supabase migration up --local`), jamais sur le projet lié. `tests/support/local-supabase.ts`. Ne jamais lire `supabase/functions/.env`, `.env.seed` ni `.env.local`. Aucun commit, aucun push, aucun `deploy:supabase`.
- `REVOKE EXECUTE` global de `PUBLIC` déjà en place : toute fonction appelable reçoit un `GRANT EXECUTE … TO authenticated` explicite. Chaque Server Action vérifie la session (`requireUser()`).

- `supabase/migrations/20261106090000_processing_functions.sql`, `20261106130000_passages.sql` -- modèles de fonctions et conditions de tentative ; ne pas modifier.
- `supabase/migrations/20261105105410_documents.sql:97` -- vue à reprendre à l'identique, colonne ajoutée en dernier.
- `src/components/documents/status-banner.tsx` -- état initialisé une seule fois, interrogation, boucle de rafraîchissement à conserver (`MAX_REFRESH_RETRIES`).
- `src/server/documents/get-document-status.ts`, `get-document.ts` -- ajouter durée et message.
- `src/server/documents/trigger-processing.ts`, `src/app/(app)/ajouter/actions.ts` -- à réutiliser ; même schéma d'action.
- `src/app/api/documents/[id]/status/route.ts` -- renvoie la vue telle quelle.
- `src/lib/texts.ts:118-131` -- `temporaryAuthor` provisoire, `temporaryReason` à fusionner.
- `tests/e2e/document-status.spec.ts:197`, `:160`, `:240` -- bouton inactif, `no_text`, forme de la réponse : à réécrire.
- `tests/integration/processing-functions.test.ts` -- modèle (deux Comptes, `EXPIRED`, `DENIED`, contrôle des privilèges).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261109090000_retry_processing.sql` -- colonne `last_retry_request_id`, vue, fonction, privilèges -- socle.
- [x] `src/lib/texts.ts` -- textes 60 s, « Relance… », « Actualiser », échec -- catalogue.
- [x] `src/server/documents/get-document-status.ts`, `get-document.ts` -- `processingElapsedMs`, `effectiveErrorMessage`.
- [x] `src/server/documents/retry-processing.ts`, `src/app/(app)/documents/[id]/actions.ts` -- relance et traduction des refus.
- [x] `src/components/documents/status-banner.tsx`, `src/app/(app)/documents/[id]/page.tsx` -- variantes, 60 s, « Actualiser », resynchronisation.
- [x] `tests/integration/retry-processing.test.ts` -- matrice, privilèges, tentative périmée, vue.
- [x] `tests/unit/retry-processing.test.ts`, `tests/unit/get-document-status.test.ts` -- traduction des refus, durée, rejeu sans déclenchement.
- [x] `tests/e2e/document-status.spec.ts` -- relance, 60 s après rechargement, trois échecs et reprise, resynchronisation, `no_text`, accessibilité.

**Acceptance Criteria:**
- Given un Document *en cours* depuis plus de 60 s, when sa page s'ouvre ou se recharge, then le message long s'affiche, calculé depuis l'horodatage serveur.
- Given un Document expiré, when un Collaborateur l'affiche, then l'Auteur voit le message et le bouton, un autre voit « Seul l'Auteur… », sans bouton.
- Given une erreur temporaire, when l'Auteur relance, then le bouton passe à « Relance… » et le Document redevient *en cours* puis *prêt*, sans rechargement manuel.
- Given un texte sans contenu exploitable, when il est traité, then `no_text` s'affiche avec sa raison, sans relance ni « Supprimer » (reporté à 3.4).
- Given un non-Auteur ou un `no_text`, when `retry_processing` est appelé directement, then l'appel est refusé (test d'intégration).
- Given trois échecs consécutifs, when ils surviennent, then le message et « Actualiser » s'affichent, et le suivi reprend au retour de la connexion.
- Given un Document repassé *en cours*, when le serveur le signale au bandeau, then l'interrogation reprend.

## Implementation Notes

- Implémentation par un sous-agent, à partir de la seule spec ; diff relu ensuite et contrôles complets relancés séparément.
- Choix non fixés par la spec : `client_request_id` nul refusé (`22023`) ; message d'échec aussi affiché quand le déclenchement est refusé ; repli sur le texte du catalogue si la raison `no_text` est absente.
- `temporaryReason` fusionné dans `temporaryAuthor` : trois tests existants renommés.
- « Actualiser » rejoint une interrogation déjà en cours : jamais deux requêtes à la fois.
- Environnement local : le conteneur `supabase_edge_runtime_projet-ia` était arrêté (`process-document` en 503) ; relancé avec `docker start`.
- Cas rare non traité : un rafraîchissement tardif ramenant une erreur juste après un clic sur « Relancer » arrête le suivi jusqu'à un nouveau clic ou un rechargement.

## Spec Change Log

## Review Triage Log

Revue du 2026-11-09 par trois relecteurs indépendants (règle 11) : Blind Hunter (B), Edge Case Hunter (E), Verification Gap (V). Aucun `intent_gap` ni `bad_spec`.

| # | Constat | Verdict | Preuve | Suite |
|---|---|---|---|---|
| V1 | Test « consécutifs » valide même sans remise à zéro du compteur | medium | assertion réessayée, passe à l'appel 6 | corrigé : `MutationObserver` |
| V2 | Branches `UNAUTHENTICATED` et `NOT_FOUND` de la relance jamais exécutées | medium | seul `route.abort()` échouait côté e2e | corrigé : deux tests e2e |
| V3 / B5 | Verrou de `retry_processing` non exercé | medium | appels tous séquentiels | corrigé : `Promise.all`, 5 Documents par cas |
| V4 / B4 | « Déclenchement refusé » non vérifié de bout en bout | medium | déclenchement simulé en unitaire | données corrigées (test d'intégration) ; branche du bandeau reportée : `deferred-work.md` |
| E1 | `crypto.randomUUID` absent hors contexte sécurisé | false | production en HTTPS, local sur `localhost` : contextes sécurisés | rejet |
| E2 / B3b | Identifiant conservé après une réponse perdue, nouvelle tentative échouée | low | un clic perdu avec message, puis nouvel identifiant ; cumul de deux pannes | rejet : rare, correctif plus large que direct |
| E3 / B3a | Action interrompue entre la validation SQL et le déclenchement | low | Document *en cours* jusqu'à l'expiration de 3 min, filet prévu par AD-6 | rejet : rare, ajout d'un état |
| E4 | Réponse de la RPC perdue, tentative non déclenchée | low | même filet de 3 min | rejet : rare |
| E5 / B10 | Un rafraîchissement tardif ramène « en cours » malgré le commentaire | low | réel, se corrige en un cycle ; une garde casserait « prêt puis en cours » | corrigé : commentaire exact |
| E6 / B9 | `retryError` non effacé à la resynchronisation | low | message ancien sous une nouvelle erreur | corrigé |
| E7 / B2 | Pas de délai sur la RPC ni la relecture | low | borné par la durée maximale de la fonction Vercel, puis message d'échec | rejet : rare, `getDocumentStatus` à modifier |
| E8 | Panne du service Auth : 401, l'interrogation s'arrête | low | comportement de 2.3 ; une panne Auth n'est pas une perte de connexion | rejet |
| B1 | Focus clavier perdu quand le bouton activé disparaît | medium | bouton démonté, focus sur `body` | corrigé : focus sur le bandeau après une action de l'utilisateur, test clavier |
| B6 | Délai dépassé non couvert par un test | low | même branche `catch` que la panne réseau | rejet |
| B7 | Test d'« Actualiser » satisfait par l'interrogation planifiée | false | clic juste après le 3ᵉ échec ; prochaine interrogation à 3 s, fenêtre de 1,5 s | rejet |
| B8 | « Actualiser » sans état occupé | low | cosmétique, état supplémentaire | rejet |
| B11 | 55000 journalisé en erreur ; relance acceptée sans `user_id` | low | cas attendu ; correctif direct | corrigé |
| B12 | Ordre migration puis code non imposé | false | indiqué au rapport de fin ; déjà suivi dans `deferred-work.md` depuis 1.3 | rejet |

## Verification

**Commands:**
- `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected: tout vert, aucun secret.

**Manual checks:**
- Production : voir le rapport de fin de story.

**Résultats du 2026-11-09 :** `lint`, `tsc`, `build:ci` et `check:secrets` verts ; `npm test` : 600 réussis. `npm run test:e2e` (193 tests exécutés, 5 sautés) : 2 échecs, puis 1, puis 0 sur trois suites complètes ; spec du Statut seule, répétée deux fois : 152 sur 152. Les échecs portent sur le badge qui suit le bandeau : voir `deferred-work.md`.
nProduction (2026-11-09, utilisateur) : traitement bloqué simulé, relance jusqu'à prêt sans rechargement et refus pour un autre Compte vérifiés ; message des 60 s, « Actualiser » et `no_text` couverts par les tests seulement.
