---
title: 'Story 2.3 : Déclencher le traitement et suivre le Statut'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: 'b9022cfddb88e0fd38951e7ee60fabf69b9b012d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Une Note enregistrée ne déclenche rien : elle reste *en cours* jusqu'à l'expiration de 3 min, sans suivi automatique, et la notification `?ajoute=1` reste affichée même quand le Statut change.

**Approach:**
- **Base.** Une migration ajoute `fail_processing` (`service_role`) et `abandon_processing` (Auteur).
- **Edge Function.** `process-document` contrôle le secret et la tentative, lance un travail réduit à une journalisation avec `EdgeRuntime.waitUntil`, et répond `202`.
- **Next.js.** La Server Action appelle la fonction, attend sa réponse 5 s au plus, sinon appelle `abandon_processing` avec le jeton de l'Auteur, puis redirige.
- **Interface.** `GET /api/documents/[id]/status` et un `StatusBanner` qui interroge le Statut toutes les 3 s et remplace la notification `?ajoute=1`.

## Boundaries & Constraints

**Always:**
- **Secret.** `PROCESS_DOCUMENT_SECRET` n'est lu que par `src/server/documents/trigger-processing.ts` (`server-only`) et par la fonction. Jamais de préfixe `NEXT_PUBLIC_`, jamais de valeur dans un fichier suivi, un journal ou une réponse. Envoyé en `Authorization: Bearer`, comparé à durée constante. Secret non configuré côté fonction : tout appel est refusé.
- **Fonction.** `verify_jwt = false` ; seul le secret fait foi. Ordre des contrôles : méthode `POST`, secret, corps (`document_id`, `attempt_id` en UUID), tentative. La tentative est valable si les deux identifiants correspondent à un Document `processing` commencé il y a moins de 3 min. Aucun refus ne modifie la base. Erreurs dans la forme unique (AD-19).
- **Accusé.** La réponse `202` part après `EdgeRuntime.waitUntil(...)`. Si le travail échoue, il appelle `fail_processing` (`temporary`).
- **Appel Next.js.** Un seul `fetch`, attendu, limité à 5 s. Toute issue autre que `202` (délai, réseau, refus, secret absent côté Next.js) mène à `abandon_processing` avec le client du Collaborateur, jamais `service_role`. `triggerProcessing` ne lève jamais d'exception : la redirection vers la page Document a toujours lieu.
- **Rejeu.** Un rejeu de `client_request_id` ne redéclenche pas la fonction : il renvoie vers la page du Document existant. Le premier appel a été fait ; s'il n'a pas abouti, l'expiration de 3 min s'applique.
- **`abandon_processing(document_id, attempt_id)`.** `security definer`, `search_path` vide, `EXECUTE` pour `authenticated` seulement. Une seule mise à jour conditionnelle : Auteur (`auth.uid()`), tentative courante, `processing`, commencée il y a moins de 3 min. Écrit `error`, `temporary` et le message du catalogue. Renvoie `false` si rien n'a été modifié.
- **`fail_processing(document_id, attempt_id, kind, message)`.** `security definer`, `EXECUTE` pour `service_role` seulement, mêmes conditions de tentative.
- **Route `GET /api/documents/[id]/status`.** Session exigée (`requireUser`), lecture de `documents_list` avec le jeton du Collaborateur, `Cache-Control: no-store`. Renvoie `effectiveStatus` et `effectiveErrorKind`. Sans session : `401 UNAUTHENTICATED` en JSON, jamais de redirection : le proxy laisse passer `/api/`. Document absent ou identifiant invalide : `404 NOT_FOUND`.
- **Bandeau.**
  - *En cours* : « ◔ En cours de traitement » + « Le Document sera interrogeable dans quelques instants. ».
  - *En erreur* temporaire : Auteur : « Le traitement n'a pas pu aboutir. La relance sera bientôt disponible. » et « Relancer le traitement » ; autre Collaborateur : « Le traitement n'a pas pu aboutir. Seul l'Auteur de ce Document peut relancer le traitement. », sans bouton.
  - *Prêt* : rien (le message arrive en 2.4).
  - Pleine largeur sous l'en-tête, couleurs du badge, `role="status"`, annonce du changement.
- **Interrogation.** Toutes les 3 s tant que le Statut est *en cours*, sans rechargement ; arrêt dès qu'il ne l'est plus. Une requête lente ne s'empile pas sur la suivante. Au changement, `router.refresh()` met à jour le badge. Changer de Document repart d'un état neuf.
- **Notification.** `?ajoute=1` et `texts.document.added` sont retirés : le bandeau suit l'état réel (décision de l'utilisateur, demande du 2026-11-06 ; lève le report de 2.2 dans `deferred-work.md`).
- **Déploiement.** `npm run deploy:supabase` applique la migration et déploie la fonction **avant** le push. Le secret est posé côté Supabase et Vercel avant ce déploiement, par l'utilisateur.

**Décisions du 2026-11-06 :**
- **Q1 = A.** « Relancer le traitement » est visible pour l'Auteur seulement, avec `aria-disabled`, sans effet, et accompagné d'une explication courte indiquant que la relance arrive bientôt : il ne doit pas paraître cassé. 2.5 le branchera.
- **Message de l'Auteur (validation de l'utilisateur).** Tant que `retry_processing` n'existe pas, « Vous pouvez le relancer. » n'est pas affiché : le message annonce que la relance sera bientôt disponible. La raison enregistrée en base garde le texte d'AD-5, pour la story 2.5.
- **Q2 = A.** Le secret local est généré sans être affiché, uniquement dans un fichier ignoré par git (`supabase/functions/.env`), sans lire ce fichier.
- **Spec gardée entière.**
- **Routes `/api/`.** Chaque route vérifie elle-même la session.
- **Appel de `process-document`.** Uniquement côté serveur.
- **Production.** Procédure exacte de création de `PROCESS_DOCUMENT_SECRET` dans Supabase et Vercel, sans que l'utilisateur communique sa valeur. Ordre : secret, puis `deploy:supabase`, puis push.

**Never:**
- Découpage, vectorisation, `complete_processing`, table `passages`, message « Votre Document est prêt. » (2.4).
- `retry_processing`, message après 60 s, « Actualiser » après 3 échecs, `no_text` affiché (2.5).
- Appel d'une Edge Function depuis le navigateur. `fetch` non attendu. Clé `service_role` dans Next.js. SDK ou import `npm:` dans la fonction (tout passe par `fetch`).
- Lecture ou affichage du contenu de `supabase/functions/.env`.
- Commit, push ou déploiement distant sans validation. Story 2.4.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Déclenchement | Note créée, fonction disponible | `202` en moins de 5 s, redirection, bandeau *en cours*, Document toujours `processing` | — |
| Sans secret, mauvais secret | appel direct | `401`, rien de modifié | aucun détail sur le secret |
| Tentative inconnue | mauvais `attempt_id` ou Document absent | `404`, rien de modifié | — |
| Document plus *en cours* | `ready`, `error`, ou commencé il y a plus de 3 min | `404`, rien de modifié | — |
| Corps invalide, autre méthode | JSON invalide, identifiant non UUID ; `GET` | `400` ; `405` | — |
| Pas de réponse en 5 s | fonction muette | appel abandonné à 5 s, `abandon_processing`, page en erreur temporaire + « Relancer le traitement » | journal sans secret |
| Refus ou panne | `401`, `5xx`, réseau, secret absent côté Next.js | même chemin | journal avec la cause |
| `abandon_processing` échoue | base injoignable | redirection quand même ; l'expiration de 3 min prend le relais | journal |
| Réponse tardive | `abandon` fait, le travail se termine ensuite | l'écriture de fin est ignorée (tentative plus *en cours*) | — |
| `abandon` refusé | non-Auteur, autre tentative, plus *en cours*, expiré | `false`, rien de modifié | — |
| `abandon` par `anon`, `fail` par `authenticated` | appel direct | refus `42501` | — |
| Rejeu | même `client_request_id` | Document existant, aucun nouvel appel | — |
| Suivi | page ouverte, *en cours* | une requête toutes les 3 s, arrêt au changement, badge et bandeau à jour sans rechargement | une requête en échec n'interrompt pas le suivi |
| Expiration | plus de 3 min | la réponse de la route donne *en erreur* temporaire, le bandeau remplace l'ancien message | — |
| Route sans session | `GET` sans cookie | `401` JSON, pas de 307 | — |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261105105410_documents.sql` -- colonnes de `documents`, vue `documents_list` (`effective_status`, `effective_error_kind`, `server_now`) : la vue suffit, pas de changement en 2.3. Modèle `revoke`/`grant` des fonctions.
- `supabase/functions/ai-health/index.ts` -- modèle de fonction (`handle` exporté, `Deno?.serve`). `sameSecret` à extraire vers `_shared/` pour le réutiliser, sans dupliquer.
- `supabase/functions/_shared/{config,errors}.ts` -- `readEnv`, `errorResponse`, `logEvent`.
- `supabase/config.toml` -- `policy = "per_worker"` déjà en place (l. 389) ; ajouter `[functions.process-document]`, modèle `[functions.ai-health]`.
- `scripts/deploy-supabase.ts` -- `listFunctions` trouvera la fonction sans modification. `checkTarget` n'a jamais été exercé sur `functions deploy` : la forme de sa sortie JSON n'a pas pu être relevée (commande « remote only »).
- `src/server/documents/create-note.ts` -- `select("id")` à étendre à `attempt_id` ; distinguer création et rejeu (23505).
- `src/app/(app)/ajouter/actions.ts` -- appel de `triggerProcessing` entre la création et `redirect`, redirection sans `?ajoute=1`.
- `src/app/(app)/documents/[id]/page.tsx` -- retirer la notification ; `StatusBanner` sous l'en-tête, `key={document.id}`.
- `src/server/documents/get-document.ts` -- ajouter `authorId` et `effectiveErrorKind`.
- `src/lib/auth/routes.ts` -- `accessRedirect` redirige aujourd'hui `/api/…` sans session : à laisser passer.
- `src/server/auth/require-user.ts`, `src/lib/errors.ts`, `src/lib/texts.ts` -- à réutiliser. `src/components/documents/status-badge.tsx` : symboles et couleurs à reprendre.
- `tests/support/local-supabase.ts`, `tests/integration/documents-rls.test.ts`, `tests/e2e/ajouter.spec.ts` (`DOCUMENT_URL` à modifier), `tests/unit/ai-boundaries.test.ts`, `tests/unit/proxy.test.ts`, `tests/unit/documents.test.ts`.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` -- à lire avant d'écrire la route (AGENTS.md).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<horodatage>_processing_functions.sql` -- `fail_processing`, `abandon_processing`, privilèges.
- [x] `supabase/functions/_shared/secret.ts` + `ai-health/index.ts` -- comparaison du secret partagée.
- [x] `supabase/functions/_shared/processing.ts` -- lecture de la tentative et `fail_processing` par `fetch` (service_role).
- [x] `supabase/functions/process-document/index.ts`, `supabase/config.toml` -- fonction, `verify_jwt = false`.
- [x] `src/server/documents/trigger-processing.ts` -- appel 5 s, abandon, journaux.
- [x] `src/server/documents/create-note.ts`, `src/app/(app)/ajouter/actions.ts` -- déclenchement sans rejeu, redirection.
- [x] `src/server/documents/get-document-status.ts`, `src/app/api/documents/[id]/status/route.ts`, `src/lib/auth/routes.ts` -- route et proxy.
- [x] `src/components/documents/status-banner.tsx`, page Document, `get-document.ts`, `src/lib/texts.ts` -- bandeau, interrogation, retrait de la notification.
- [x] `.env.example`, `docs/environnements.md` -- procédure du secret (Supabase, Vercel, local), noms seulement.
- [x] `tests/support/local-supabase.ts`, `playwright.config.ts` -- secret local lu à l'exécution (seule cette ligne), jamais écrit ni affiché.
- [x] `tests/unit/` -- fonction (secret, corps, tentative, `waitUntil`, échec du travail) ; `triggerProcessing` (202, délai, refus, réseau, secret absent, échec de l'abandon) ; rejeu sans appel ; proxy `/api/` ; frontières du secret ; `config.toml`.
- [x] `tests/integration/processing-functions.test.ts` -- SQL à deux Comptes, privilèges, `anon`.
- [x] `tests/integration/process-document.test.ts` -- fonction locale réelle : secret, tentative, `202`, rien de modifié.
- [x] `tests/integration/trigger-processing.test.ts` -- serveur local muet : abandon réel à 5 s avec le jeton de l'Auteur.
- [x] `tests/e2e/document-status.spec.ts` -- bandeau, 3 s, arrêt, erreur Auteur et non-Auteur, route sans session, axe à 1 280 et 375 px.

**Acceptance Criteria:**
- Given la story, when `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit` et `npm run build:ci` sont lancés, then tout passe, et `.next/static` ne contient ni la valeur ni le nom de `PROCESS_DOCUMENT_SECRET`.
- Given la CLI en local (`policy = "per_worker"`), when le travail d'arrière-plan s'exécute, then sa fin apparaît dans les journaux après le `202`.
- Given le secret posé et `npm run deploy:supabase` réussi **avant** le push, when une Note est créée sur Vercel, then elle reste `processing` sans abandon, et un appel direct sans secret reçoit le `401` de la fonction (`UNAUTHENTICATED`), pas celui de la passerelle.

## Implementation Notes

- **Implémentation directe**, sans sous-agent, le contexte étant déjà chargé. Les trois relecteurs sont bien des agents séparés (règle 11).
- **Migration** `20261106090000_processing_functions.sql` : pas encore appliquée à distance. Elle a été complétée après la revue (`service_role` retiré d'`abandon_processing`) ; le même `revoke` a été joué sur la base locale.
- **Fonction.** `_shared/secret.ts` (extrait d'`ai-health`), `_shared/processing.ts` (REST par `fetch`), `process-document/index.ts`. Le travail de 2.3 attend 200 ms avant de journaliser, pour finir réellement après le `202`.
- **Interrogation.** En `401` ou `404`, le suivi s'arrête et `router.refresh()` laisse le serveur choisir la page (connexion ou E9).
- **`check:secrets --static`** refuse désormais aussi le **nom** des secrets dans `.next/static`.
- **Secret local** : ajouté à `supabase/functions/.env` sans lire le fichier ni afficher la valeur.
- **Mesures locales** : `202` en 37 à 107 ms à chaud, environ 1 070 ms à froid.
- **Échec Vercel de `3973977`.** La valeur posée dans Vercel était le nom de la variable : `check:secrets` la trouvait dans 55 fichiers. Secret régénéré par l'utilisateur. Garde-fou `invalidSecretsFromEnv` ajouté à sa demande : moins de 32 caractères, ou valeur ressemblant au nom d'une variable, avec un échec clair avant tout parcours et sans afficher la valeur.
- **Journaux.** `logInfo` (`console.log`) ajouté pour les événements normaux, signalés au niveau Error par l'utilisateur sur Vercel : `process_document_accepted`, `process_document_work_done`, `create_note_replayed`.
- **`deploy:supabase`** a réussi au premier vrai déploiement de la fonction : la crainte sur la sortie de `functions deploy` ne s'est pas confirmée.

## Spec Change Log

## Review Triage Log

Revue du 2026-11-06 par trois relecteurs indépendants (règle 11) : Blind Hunter, Edge Case Hunter, Verification Gap. Aucune remise en cause de la spec : ni `intent_gap`, ni `bad_spec`.

| # | Constat | Verdict | Preuve | Suite |
|---|---|---|---|---|
| 1 | `abandon_processing` exécutable par `service_role`, test muet | medium | `revoke` sans ce rôle ; la spec dit `authenticated` seulement | corrigé, test renforcé |
| 2 | Interrogation sans fin sur `401` ou `404` | medium | toute réponse non OK reprogrammait une requête | corrigé : arrêt, `router.refresh()`, e2e |
| 3 | Pannes passagères répétées sans message | low | « Actualiser » est exclu de 2.3 par le bloc gelé | rejet : story 2.5 |
| 4 | `triggerProcessing` peut lever si l'URL Supabase est absente | false | `createClient` et l'insertion échouent avant, avec la même URL | rejet |
| 5 | Cause perdue dans les journaux de la fonction ; `false` de `fail_processing` ignoré | medium | `catch` sans erreur | corrigé : nom de l'erreur, jamais son message ; `fail_processing_refused` |
| 6 | `EdgeRuntime` absent : 500 hors format | false | toujours présent sur le runtime ; aucun chemin réel ne montre son absence | rejet |
| 7 | `requireUser` hors du `try` de la route | low | `getClaims` renvoie ses erreurs ; le bandeau traite toute panne de la même façon | rejet |
| 8 | Bandeau vide : double espacement | low | élément vide dans un `flex gap-6` | corrigé : `empty:-mb-6` |
| 9 | `.env.local` : documentation contradictoire | low | tableau, `.env.example` et nouvelle section divergeaient | corrigé |
| 10 | Procédure OpenAI : pousserait le secret local en production ; fenêtre de rotation non décrite | high | `--env-file supabase\functions\.env` contient désormais le secret local | corrigé dans `docs/environnements.md` |
| 11 | Message de `fail_processing` en trois exemplaires, non vérifié | medium | `p_message` non affirmé | corrigé : affirmation contre le catalogue |
| 12 | Journal du travail écrit **avant** le `202` : la preuve `per_worker` ne prouvait rien | high | `logOnlyWork` s'exécutait de façon synchrone dans l'argument de `waitUntil` | corrigé : attente de 200 ms, test d'intégration lisant l'ordre réel des journaux |
| 13 | `failProcessing` jamais exécuté sur la vraie base | medium | seuls des `fetch` simulés | corrigé : test d'intégration réel |
| 14 | Requête lente qui s'empile : non testé | low | aucune route retardée | corrigé : e2e à 4 s de latence |
| 15 | `no_text` : garde non testée | low | toujours `temporary` en e2e | corrigé : e2e |
| 16 | `no_text` : bandeau vide en cours de suivi | low | exclu de 2.3 par le bloc gelé | rejet : story 2.5 |
| 17 | AC « ni la valeur ni le nom » non automatisé | medium | `--static` ne cherchait pas le nom | corrigé : `forbiddenNames`, test ; valeur locale absente de `.next` et `.next-e2e`, vérifiée une fois |
| 18 | Sortie réelle de `functions deploy` jamais relevée | maybe-false (medium, non vérifié) | commande « remote only » | reporté : à relever au premier déploiement |
| 19 | Branche `500` de la lecture du Statut non testée | low | aucune trace dans les tests | corrigé : test unitaire de `getDocumentStatus` |
| 20 | `key={document.id}` non testé | low | aucun lien entre Documents à ce jour | reporté à la Bibliothèque |
| 21 | `abandon_processing` peut rester bloqué | medium | aucun délai sur l'appel | corrigé : `abortSignal` à 2 s |
| 22 | Limite de 10 s du formulaire proche du pire cas | low | en pratique environ 5,4 s ; « Réessayer » renvoie au bon Document | rejet : valeur fixée par l'UX |
| 23 | `router.refresh()` en échec : badge en retard | low | réseau coupé juste après le changement ; le rechargement corrige | rejet |
| 24 | Rejeu après une panne avant le déclenchement | low | décision du bloc gelé : l'expiration de 3 min s'applique | rejet |
| 25 | `body.cancel()` en échec après un `202` : abandon à tort | low | classé `network` | corrigé : erreur ignorée, test |
| 26 | `ENOENT` brut sur un dépôt neuf | low | `readFileSync` sans contrôle | corrigé |
| 27 | « Vous pouvez le relancer » à côté de « La relance sera bientôt disponible » | low | textes contradictoires tant que la relance n'existe pas | corrigé à la demande de l'utilisateur : un seul message provisoire, qui décrit aussi le bouton pour les lecteurs d'écran |
| 28 | `deferred-work.md` encore « à traiter en 2.3 » ; suivi à jour | low | fin de story | corrigé |

## Design Notes

- **`fetch` plutôt qu'un SDK dans la fonction.** Comme `_shared/ai.ts`. Un import `npm:` empêcherait Vitest de charger le module.
- **Badge par `router.refresh()`.** Le serveur reste la source de vérité et les actions de 2.4 suivront le même chemin. L'état du bandeau survit au rafraîchissement.
- **Délai de 5 s testé sans e2e.** Un serveur Next.js ne peut pas être intercepté par Playwright : l'intégration passe par un serveur HTTP muet, et l'affichage se teste en posant l'état en base.

## Verification

**Commands:**
- `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected: tout vert, aucun secret.
- `docker logs supabase_edge_runtime_projet-ia` -- expected: fin du travail journalisée après le `202`.

**Manual checks:**
- Local : fonction arrêtée, création d'une Note, *en erreur* temporaire en 5 s environ.
- Production : voir le rapport de fin de story.
