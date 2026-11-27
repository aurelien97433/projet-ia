# Audit global de sécurité — NexaMind AI

État au 2026-11-27 (story 7.8). Revue de tout le code avant la mise en service, surface par surface, par des relecteurs indépendants. Ce rapport donne, pour chaque contrôle, son résultat et sa preuve.

## En bref

- **5 surfaces** revues, chacune par un relecteur distinct qui n'a écrit aucune ligne du code relu.
- **Aucune fuite** de données d'un autre Compte, **aucun contournement** de l'authentification, **aucun secret** exposé.
- **1 constat haut** (R1, verrou du Résumé contournable) : **corrigé et testé**.
- **18 constats retenus** : 9 corrigés (R1, R2, R5 à R11), 2 acceptés sur décision écrite de l'utilisateur (R3, R4), 7 reportés (R12 à R18) ; **10 écartés** (faux positifs, avec leur raison).
- Les 5 points renvoyés par le [bilan des anomalies](bilan-anomalies.md) (D08, D19, D38, D40, R73-F13) ont chacun un constat et une suite.

| Gravité | Corrigés | Acceptés | Reportés | Total |
|---|---|---|---|---|
| Haute | 1 | 0 | 0 | 1 |
| Moyenne | 3 | 2 | 1 | 6 |
| Basse | 5 | 0 | 6 | 11 |

R5 (basse à moyenne) est compté en basse.

## 1. Méthode

1. **Découpage en surfaces.** Le code est divisé en 5 groupes qui couvrent tout le dépôt, pas seulement le dernier changement.
2. **Relecture indépendante.** Un relecteur par surface (règle 11 du projet : aucun relecteur n'a écrit le code qu'il relit), en lecture seule, avec la même consigne : se mettre à la place d'un attaquant connecté ou anonyme, vérifier les appels à la frontière de chaque surface, et répondre sur les points du bilan (D08, D19, D38, D40, R73-F13) et sur les risques d'architecture AD-1 et AD-14.
3. **Triage.** Chaque constat est vérifié dans le code avant d'être retenu ; la gravité est recalculée selon l'échelle ci-dessous ; les faux positifs sont écartés avec leur raison (§ 5).
4. **Décisions.** Les constats hauts sont corrigés. Les autres sont tranchés par l'utilisateur (corriger, accepter ou reporter) ; ses décisions sont datées dans la [spec de la story](../../_bmad-output/implementation-artifacts/7-8-audit-global-de-sécurité.md).
5. **Correctifs.** Chacun a son test automatisé, qui échoue sans le correctif.

**Échelle de gravité.**
- **Haute** : fuite de données d'un autre Compte, contournement de l'authentification ou du quota, secret exposé, exécution de code.
- **Moyenne** : contournement limité, déni de service à faible coût.
- **Basse** : durcissement.

## 2. Surfaces et relecteurs

| Surface | Périmètre relu | Résultat |
|---|---|---|
| S1 — Base | RLS de toutes les tables, droits `anon` et `authenticated`, fonctions SQL (`security definer`, `search_path` vide, `EXECUTE`, signatures), vues (`security_invoker`), Storage (`supabase/migrations/`) | Aucune fuite entre Comptes. Fonctions du garde-fou trop ouvertes (R1, R2) ; aucune limite de volume (R3) |
| S2 — Edge Functions | Authentification de chaque fonction, secret de traitement, usage de `service_role`, encadrement des contenus envoyés au modèle (AD-13), délais et quotas (AD-14 à AD-16) (`supabase/functions/`) | Authentification correcte partout. Verrou du Résumé contournable (R1) ; vectorisation hors quota (R4) |
| S3 — Next.js | Route Handlers, Server Actions, `proxy.ts`, frontière AD-1 (aucune Edge Function ni OpenAI depuis le navigateur), validation des entrées, refus sans session (D08) (`src/`) | Frontière AD-1 respectée ; D08 fermé. Limite des Server Actions trop haute (R10) |
| S4 — Affichage et injection | Texte brut (AD-8), aucun HTML interprété depuis un Document ou une réponse, liens et URL signées, injection de consigne | Aucun HTML interprété. Caractères invisibles transmis au modèle (R5) ; aucun en-tête anti-cadre (R9) ; focus (R11) |
| S5 — Secrets et build | `check:secrets`, `build:ci`, fichiers ignorés, scripts (`scripts/`), procédures de rotation (D19) | Aucun secret dans le dépôt ni dans le build. Procédure et script de rotation à fiabiliser (R6, R7, R8) |

## 3. Constats

Ordre : gravité, puis numéro. La colonne « Preuve » donne le test qui prouve le correctif, ou le document de la décision.

| Id | Surface | Constat | Gravité | Suite | Preuve |
|---|---|---|---|---|---|
| R1 | S1, S2 | Un Collaborateur pouvait appeler `end_summary` lui-même, libérer le verrou du Résumé et lancer N générations facturées en parallèle ; les N−1 écritures perdues rendaient leur unité. | haute | **corrigé** : `begin_summary` et `end_summary` réservées à `service_role` (migration [20261127090000_service_only_quota.sql](../../supabase/migrations/20261127090000_service_only_quota.sql)), appelées par `summarize` avec l'identifiant vérifié auprès d'Auth ; une écriture perdue consomme désormais l'unité | [summary.test.ts](../../tests/integration/summary.test.ts) (Collaborateur et `anon` : `42501` ; droits du catalogue ; unité consommée si le texte change) ; [summarize-function.test.ts](../../tests/unit/summarize-function.test.ts) |
| R2 | S1, S2 | `reserve_ai_call` était exécutable par tout Collaborateur : 5 Comptes × 60 réservations directes vidaient le plafond global du projet, sans aucun appel au fournisseur. | moyenne | **corrigé** : `reserve_ai_call` et `release_ai_call` réservées à `service_role`, même migration ; `chat` et `summarize` passent l'identifiant renvoyé par Auth, jamais une valeur du navigateur | [chat.test.ts](../../tests/integration/chat.test.ts) (« appel direct (42501) ») ; [chat-function.test.ts](../../tests/unit/chat-function.test.ts) (identifiant d'Auth, clé utilisée pour ces deux appels seulement) ; [process-secret-boundaries.test.ts](../../tests/unit/process-secret-boundaries.test.ts) |
| R3 | S1, S3 | Aucune limite de volume par Compte : Notes, Conversations, messages et fichiers déposés (y compris en dépôt direct dans le Storage), jamais purgés. Un Compte peut remplir la base ou le Storage du plan gratuit. | moyenne | **accepté** pour la démonstration (décision de l'utilisateur du 2026-11-25) : 5 Comptes connus ; l'espace est surveillé au tableau de bord Supabase | Décision écrite : [spec 7.8](../../_bmad-output/implementation-artifacts/7-8-audit-global-de-sécurité.md) ; limites connues du [dossier de démarche](../demarche-vibe-coding.md#8-limites-connues) |
| R4 | S1, S2, S3 | La Recherche et le traitement des Documents (création, modification, relance) appellent OpenAI pour la vectorisation sans réservation ni limite de débit. | moyenne | **accepté** (décision de l'utilisateur du 2026-11-25) : coût unitaire très faible ; le crédit prépayé de 10 $ chez le fournisseur reste la borne | Décision écrite : [spec 7.8](../../_bmad-output/implementation-artifacts/7-8-audit-global-de-sécurité.md) ; limites connues du [dossier de démarche](../demarche-vibe-coding.md#8-limites-connues) |
| R5 | S4 | Les caractères Unicode invisibles et de direction (bidi) n'étaient jamais retirés : une consigne invisible au Lecteur partait au modèle. | basse à moyenne | **corrigé** : retirés dans `escapeContent` et `escapeTitle`, donc dans tout ce qui part au modèle ; le texte enregistré et affiché est inchangé | [prompt.test.ts](../../tests/unit/prompt.test.ts) (« caractères invisibles et bidirectionnels retirés ») |
| R6 | S5 | Le script de rotation demandait de poser le secret de traitement en Production **et en Preview**, contre la règle documentée (Production seulement). | moyenne | **corrigé** : consigne « Production seulement (jamais Preview) » | [seed-env-boundaries.test.ts](../../tests/unit/seed-env-boundaries.test.ts) (« Production seulement ») |
| R7 | S5 | La procédure manuelle de rotation lançait `supabase secrets set` depuis la racine, sans dossier de travail ni projet explicite : les variables de simulation du `config.toml` local partaient en production. | moyenne | **corrigé** : dossier temporaire (`--workdir`) et projet visé par `--remote`, comme le script | [seed-env-boundaries.test.ts](../../tests/unit/seed-env-boundaries.test.ts) (« chaque commande passe par un dossier temporaire ») ; [environnements.md](../environnements.md) |
| R8 | S5 | Copie du secret dans le presse-papiers sans vérification ni nouvel essai (cause probable de D19). | basse | **corrigé** : copie relue, 3 essais, échec signalé sans afficher le secret ; effacement vérifié | [seed-env-boundaries.test.ts](../../tests/unit/seed-env-boundaries.test.ts) (« Copy-Verified ») |
| R9 | S3, S4, S5 | Aucun en-tête de sécurité : les pages pouvaient être affichées dans un cadre d'un autre site (détournement de clic). | basse | **corrigé** : `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` sur toutes les routes | [next-config.test.ts](../../tests/unit/next-config.test.ts) ; [en-tetes.spec.ts](../../tests/e2e/en-tetes.spec.ts) (page, redirection, Route Handler) ; Source, Lecteur et flux de l'Assistant vérifiés par la suite e2e |
| R10 | S3 | Limite des Server Actions à 2 Mo, justifiée par l'ancienne taille maximale d'une Note (1 000 000 octets, ramenée à 100 000 le 2026-11-12). | basse | **corrigé** : 1 Mo. Le triage du 2026-11-25 proposait 512 Ko ; valeur finale retenue par l'utilisateur le 2026-11-27 : 1 Mo, valeur par défaut de Next.js (écrite pour qu'aucune mise à jour ne la change) et plus de 10 fois la taille maximale d'une Note | [next-config.test.ts](../../tests/unit/next-config.test.ts) ; [ajouter.spec.ts](../../tests/e2e/ajouter.spec.ts) (Note de 100 000 et 100 001 octets) |
| R11 | S4 | Après un clic sur l'entrée de l'écran courant dans le menu mobile, le titre de l'écran suivant ne recevait pas le focus (accessibilité, R73-F13). | basse | **corrigé** | [mobile-nav-focus.test.tsx](../../tests/unit/mobile-nav-focus.test.tsx) |
| R12 | S1 | Paramètres de `match_passages` sans bornes (coût limité par le délai de 8 s par instruction). | basse | reporté (demande une migration) | [deferred-work.md](../../_bmad-output/implementation-artifacts/deferred-work.md) |
| R13 | S3 | Les limites de l'Auth Supabase s'appliquent peut-être à l'adresse de sortie de Vercel, commune à tous les Collaborateurs. | moyenne (non vérifiée) | reporté : à trancher en lisant les limites Auth du projet distant | [deferred-work.md](../../_bmad-output/implementation-artifacts/deferred-work.md) |
| R14 | S2, S5 | Fonctions locales `ai-health` et `measure-embed` exclues du déploiement par une liste seulement. | basse | reporté : vérifier une fois la liste des fonctions distantes, en lecture seule | [deferred-work.md](../../_bmad-output/implementation-artifacts/deferred-work.md) |
| R15 | S1 | Le nom affiché vaut la partie locale de l'e-mail, lisible par tous les Collaborateurs. | basse | reporté (vie privée ; changement de l'inscription après la démo) | [deferred-work.md](../../_bmad-output/implementation-artifacts/deferred-work.md) |
| R16 | S4 | Une injection réussie dans un Résumé serait conservée et montrée à tous. | basse | reporté : risque résiduel d'AD-13, mesuré à la story 7.9 | [deferred-work.md](../../_bmad-output/implementation-artifacts/deferred-work.md) |
| R17 | S5 | Motifs absents de `check:secrets` (`sbp_`, `postgres://…@`, `ghp_`). | basse | reporté (les tests demandent d'abord des valeurs fictives) | [deferred-work.md](../../_bmad-output/implementation-artifacts/deferred-work.md) |
| R18 | S5 | Pas de procédure de rotation pour la clé `service_role`, les mots de passe des Comptes et de la base, ni de révocation après fuite. | basse | reporté au guide de reprise (story 7.6) ; **traité** le 2026-11-27 : [guide-de-reprise.md](../guide-de-reprise.md) § 7 | [deferred-work.md](../../_bmad-output/implementation-artifacts/deferred-work.md) |

## 4. Points du bilan et risques d'architecture

| Point | Constat de l'audit | Suite |
|---|---|---|
| **D08** — Server Action envoyée après l'expiration de la session | Le Proxy ne redirige pas une requête de Server Action (en-tête `next-action`), et les 4 Server Actions appellent `requireUser`, qui refuse avant toute écriture. | **Fermé** (lecture du code par S3 ; cas voisins couverts par [ajouter.spec.ts](../../tests/e2e/ajouter.spec.ts) et [document-status.spec.ts](../../tests/e2e/document-status.spec.ts)) |
| **D19** — Copie du secret par le presse-papiers non fiable | Copie jamais relue, aucun nouvel essai. | **Corrigé** par R8 |
| **D38** — Fichiers déposés jamais nettoyés | Partie de R3. | **Accepté** avec R3 |
| **D40** — Aucune limite de dépôts par Collaborateur | Partie de R3. | **Accepté** avec R3 |
| **R73-F13** — Focus du nouvel écran perdu | Deux cas : clic sur l'écran courant dans le menu mobile (R11), et navigation avant que le premier titre soit prêt, sur une machine lente (cas d'origine). | **Corrigé** : R11, et cas d'origine par l'adresse relevée au chargement ([title-focus.ts](../../src/components/shell/title-focus.ts), test « adresse changée avant le premier titre » de [page-title.test.tsx](../../tests/unit/page-title.test.tsx)) |
| **AD-1** — Fonctions Supabase appelables directement | Respectée côté navigateur : aucun appel d'Edge Function ni d'OpenAI depuis un composant client. Mais l'appel direct, par l'API, de 3 fonctions SQL du garde-fou donnait plus de droits que l'interface. | **Corrigé** par R1 et R2 |
| **AD-14** — Plafond global épuisable | Épuisable sans aucun appel au fournisseur (R2) ; vectorisation hors quota (R4). | R2 **corrigé** ; R4 **accepté** |

## 5. Constats écartés

| Id | Constat proposé | Raison |
|---|---|---|
| S1-5 | Colonnes internes des Documents lisibles | Aucune exploitation : aucune décision ne repose sur la seule connaissance de `attempt_id`. |
| S1-8 | Course entre l'import d'un fichier et sa suppression | Limitée au propre Document de l'auteur. |
| S3-5 | Falsification de requête intersite (CSRF) | Cookie de session `SameSite=Lax` vérifié ; Server Actions contrôlées par l'origine. |
| S3-6 | Flux de l'Assistant non revalidé par le relais | Source de confiance (Edge Function `chat`), forme testée. |
| S3-8 | `getClaims` sans contrôle de révocation | Comportement de PostgREST pour tout jeton signé, accepté. |
| S4-5 | Entités HTML recopiées telles quelles dans une réponse | Qualité d'affichage, pas sécurité : le texte reste brut. |
| S4-6 | Paramètre `?question=` prérempli | Rien n'est envoyé sans clic du Collaborateur. |
| S5-6 | URL de démonstration comparée exactement par `check:secrets` | Adresse publique par décision (README). |
| S5-8 | `db push --yes` dans le déploiement | Décision documentée dans [environnements.md](../environnements.md). |
| S5-9 | Clé `service_role` locale présente dans les tests | Clé de la pile locale, sans valeur en production. |

## 6. Risques restants

- **Volume (R3)** et **vectorisation (R4)** : acceptés pour la démonstration ; bornes : 5 Comptes connus, surveillance de l'espace, crédit prépayé de 10 $.
- **Injection de consigne (AD-13, R16)** : réduite (contenus encadrés et neutralisés, caractères invisibles retirés), jamais nulle avec un modèle de langage ; mesurée à la story 7.9.
- **`service_role` dans `chat` et `summarize`** : depuis R1 et R2, ces deux fonctions lisent la clé `service_role`, pour 4 fonctions SQL précises et `store_summary` seulement. Des tests vérifient qu'aucun autre appel ne l'utilise ([process-secret-boundaries.test.ts](../../tests/unit/process-secret-boundaries.test.ts)).
- **Reports R12 à R18** : bas, sauf R13 (moyen, non vérifié) ; suivis dans [deferred-work.md](../../_bmad-output/implementation-artifacts/deferred-work.md).

## 7. Vérification

| Contrôle | Résultat |
|---|---|
Vérification complète du 2026-11-27, d'un seul tenant, après `db reset` de la pile locale (migrations jusqu'à `20261127090000_service_only_quota.sql`).

| Contrôle | Résultat |
|---|---|
| `npm test` (unitaires et intégration sur Supabase local) | 108 fichiers, 2 261 tests réussis, 0 échec |
| `npm run test:e2e -- --workers=4` (ordinateur et 375 px, suite complète d'un seul tenant) | 409 réussis, 0 échec, 19 ignorés par conception (6,5 min). Un premier passage à 6 workers avait donné 7 échecs sous la charge (délais dépassés, connexions coupées), tous réussis ensuite. Le nouveau test des en-têtes ([en-tetes.spec.ts](../../tests/e2e/en-tetes.spec.ts)) passe sur les deux formats |
| `npm run build:ci` | build réussi ; aucun secret dans le dépôt (709 fichiers) ni dans le code envoyé au navigateur (`.next/static` et `.next/server/app`) |
| `npx tsc --noEmit`, `npm run lint` | sans erreur |
| `deploy:supabase` (par l'utilisateur, 2026-11-27) | migration `20261127090000_service_only_quota.sql` appliquée ; `chat` et `summarize` redéployées ; `process-document` et `semantic-search` inchangées |
| Contrôle distant des droits (lecture seule, `supabase db query --read-only` sur le catalogue de production) | conforme : `begin_summary`, `end_summary`, `release_ai_call`, `reserve_ai_call` ont chacune une seule signature (avec `p_user_id`), sont en `security definer` avec un `search_path` vide, et sont exécutables par `service_role` seulement (ni `authenticated`, ni `anon`, ni `public`) |
| Push | `origin/main` = `e8cd60c` |
| `test:security:live` (par l'utilisateur) | réussi : SM-6 critères 1 à 3, 9 Route Handlers en 401 sans session, aucun secret dans le code envoyé au navigateur, aucune Note de test restante ([securite-live-2.md](../mesures/securite-live-2.md)) |
| `test:chat:live` (par l'utilisateur) | réussi, 15 sur 15 ; compteur du jour du Compte de mesure de 0 à 15, soit une unité par question : la réservation et la consommation passent bien par le nouveau chemin `service_role` ([assistant-live-3.md](../mesures/assistant-live-3.md)) |
| `test:summary:live` (par l'utilisateur) | verdict « ÉCHEC » du script, **sans défaut de l'application** : les 4 Résumés visés existaient déjà et ont été renvoyés tels quels, sans appel au fournisseur ni unité (compteur 15 → 15, 4 réponses 200 conformes, aucun terme interdit). Le script exige une génération par ce passage, si bien que le chemin de génération modifié par R1 n'a pas été exercé ([resume-live-2.md](../mesures/resume-live-2.md)). Report ouvert pour adapter le script ([deferred-work.md](../../_bmad-output/implementation-artifacts/deferred-work.md)) |
| Génération du Résumé sur le site (vérification manuelle de l'utilisateur) | « Générer le Résumé » sur « Charte d'utilisation des outils informatiques » (Document sans Résumé) : Résumé généré et affiché ; au rechargement, le même Résumé, sans nouvelle génération. Le chemin de génération de R1 fonctionne en production |

## 8. Correspondance avec la séquence 11

Section ajoutée le 2026-11-27. La séquence 11 de la formation attend : identifier les principaux risques d'une application générée avec l'IA, vérifier les protections côté serveur, base et recherche documentaire, corriger puis contrôler la non-réapparition, faire une revue avec `bmad-code-review`, et vérifier qu'aucun bloquant ne reste avant publication.

### 8.1 Risques propres à une application générée avec l'IA

Le risque commun : du code qui fonctionne et passe ses tests fonctionnels, mais qui garde des droits par défaut ou des chemins d'accès qu'aucun écran n'utilise. Une IA produit vite le chemin attendu ; elle oublie plus facilement ce qu'un appel direct à l'API permet.

| Risque | Exemple réel du projet | Comment il a été trouvé | Correction | Preuve de non-réapparition |
|---|---|---|---|---|
| Droits par défaut trop larges | Story 1.3 : toute fonction SQL créée plus tard restait exécutable par `anon`, par le droit `EXECUTE` que PostgreSQL donne à `PUBLIC` | Revue séparée de la story, reproduit (`anon` pouvait exécuter une fonction neuve) | `REVOKE` d'`anon` et de `PUBLIC` sur l'existant et en privilèges par défaut ; chaque fonction appelable reçoit un `GRANT` explicite ([20261104094731_profiles.sql](../../supabase/migrations/20261104094731_profiles.sql)) | Tests de privilèges sur chaque fonction ([profiles-rls.test.ts](../../tests/integration/profiles-rls.test.ts), [summary.test.ts](../../tests/integration/summary.test.ts) et 6 autres fichiers d'intégration) |
| Vue qui contourne la RLS | Story 5.6 : une vue PostgreSQL s'exécute par défaut avec les droits de son propriétaire, donc sans la RLS ; `conversation_list` aurait montré les Conversations de tous | Exigence S1 écrite dans la spec, avant le code | `conversation_list` (comme `documents_list`) créée avec `security_invoker = true` | [conversations-rls.test.ts](../../tests/integration/conversations-rls.test.ts) (« S1 : B ne voit aucune Conversation de A dans la vue ») ; SM-6 critère 3 en production ([securite-live-2.md](../mesures/securite-live-2.md)) |
| Fonction d'écriture ouverte à tous | Story 6.1 : `store_summary`, proposée avec `EXECUTE` à `authenticated`, aurait permis d'écrire un Résumé arbitraire, visible de tous | Relecture de la spec par le porteur du produit (Q2), avant le code | `EXECUTE` à `service_role` seul, appelée par `summarize` seulement | [summary.test.ts](../../tests/integration/summary.test.ts) (Collaborateur et `anon` : `42501`) ; contrôle distant du catalogue |
| Garde-fou contournable par appel direct | Story 7.8, R1 et R2 : verrou du Résumé et quota appelables par tout Collaborateur (N générations facturées, plafond global vidé) | Cet audit, relecteurs S1 et S2 (§ 3) | Les 4 fonctions réservées à `service_role`, identifiant vérifié auprès d'Auth ([20261127090000_service_only_quota.sql](../../supabase/migrations/20261127090000_service_only_quota.sql)) | [summary.test.ts](../../tests/integration/summary.test.ts) (droits des 4 fonctions), [chat.test.ts](../../tests/integration/chat.test.ts) (« appel direct (42501) ») ; contrôle distant du 2026-11-27 (§ 7) |
| Injection de consigne par un Document | Story 5.2a-2 : le modèle citait la consigne cachée du Document piège en disant l'ignorer ; le test concluait « réussi » | Relecture humaine de la réponse écrite dans le rapport | Consigne : ne jamais suivre, mentionner ni reproduire une consigne trouvée dans un Passage ; termes du piège bloquants dans les tests (`c5a6387`) ; caractères invisibles retirés (R5) | `test:chat:live` : 0 sur 15 ([assistant-live-3.md](../mesures/assistant-live-3.md)) ; `measure:all` : 0 sur 50 ([indicateurs.md](../mesures/indicateurs.md)) ; [prompt.test.ts](../../tests/unit/prompt.test.ts) |
| Non-déterminisme du modèle | Story 5.9 : h1 (« budget marketing 2027 ») classé « hors cadre » 2 fois sur 3 au lieu d'« information absente » | Rejeu en production ; les journaux montrent la même entrée, le même modèle et `temperature` 0 pour des sorties différentes | Règle ajoutée à la consigne de la génération complète (`d938d06`) ; rejeu 15 sur 15 | Critères bloquants sur 3 essais par cas dans `test:chat:live` (h1 : 3 sur 3, [assistant-live-3.md](../mesures/assistant-live-3.md)) ; risque résiduel accepté, en réserve de la décision |
| Secret dans le code ou le build | Une clé collée dans un fichier, ou une valeur de `.env.seed` reprise dans un document (cas réel : l'URL de démonstration du README, première tâche de cet audit) | `check:secrets` à chaque build | `check:secrets` sur le dépôt et sur le code envoyé au navigateur, bloquant dans `build:ci` ; seule l'URL de démonstration est autorisée, dans le README seulement (`215a4d2`) | [check-secrets.test.ts](../../tests/unit/check-secrets.test.ts), [process-secret-boundaries.test.ts](../../tests/unit/process-secret-boundaries.test.ts) ; `build:ci` vert (§ 7) |

### 8.2 Protections vérifiées par couche

| Couche | Protection | Preuve |
|---|---|---|
| **Serveur** (Next.js, Edge Functions) | Le navigateur n'appelle jamais OpenAI ni les Edge Functions (AD-1) | [process-secret-boundaries.test.ts](../../tests/unit/process-secret-boundaries.test.ts) ; `test:security:live` ([securite-live-2.md](../mesures/securite-live-2.md)) |
| | Session exigée : pages protégées par `proxy.ts`, chaque Server Action et Route Handler appelle `requireUser` | 9 Route Handlers en 401 sans session ([securite-live-2.md](../mesures/securite-live-2.md)) ; D08 (§ 4) |
| | Edge Functions : jeton vérifié par la passerelle et revérifié auprès d'Auth ; `process-document` protégée par son secret | [process-secret-boundaries.test.ts](../../tests/unit/process-secret-boundaries.test.ts) ; [process-document.test.ts](../../tests/integration/process-document.test.ts) |
| | Entrées validées (`zod`), questions limitées à 2 000 caractères, Server Actions à 1 Mo, en-têtes anti-cadre et `nosniff` | [next-config.test.ts](../../tests/unit/next-config.test.ts) ; [en-tetes.spec.ts](../../tests/e2e/en-tetes.spec.ts) |
| **Base** (Postgres, Storage) | RLS sur toutes les tables, politiques `to authenticated`, aucun droit pour `anon` ; écriture des colonnes `title` et `category` seulement | [anon-access.test.ts](../../tests/integration/anon-access.test.ts), [documents-rls.test.ts](../../tests/integration/documents-rls.test.ts), [profiles-rls.test.ts](../../tests/integration/profiles-rls.test.ts) |
| | Conversations privées : seul leur propriétaire les lit | [conversations-rls.test.ts](../../tests/integration/conversations-rls.test.ts) ; SM-6 critère 3 en production |
| | Fonctions `security definer` à `search_path` vide, signature unique, `EXECUTE` explicite ; vues en `security_invoker` | Tests de catalogue d'intégration ; contrôle distant en lecture seule (§ 7) |
| | Storage privé : dépôt dans son propre dossier, lecture par URL signée | [file-import.test.ts](../../tests/integration/file-import.test.ts) |
| **Recherche documentaire** (RAG) | `match_passages` en `security invoker` : la RLS s'applique à la Recherche et à l'Assistant | [match-passages.test.ts](../../tests/integration/match-passages.test.ts) ; SM-6 critère 1 |
| | Seuls les Passages au-dessus du seuil partent au modèle, encadrés et neutralisés comme des données ; caractères invisibles retirés | [prompt.test.ts](../../tests/unit/prompt.test.ts) ; Document piège : 0 sur 50 |
| | Sans Passage pertinent, refus honnête (un appel court choisit le type de refus, sans génération de réponse) | SM-2 10 sur 10 ([indicateurs.md](../mesures/indicateurs.md)) |
| | Citations validées avant affichage : aucune Source inventée | `test:chat:live` (renvois valides 15 sur 15, [assistant-live-3.md](../mesures/assistant-live-3.md)) |
| | Coût borné : quota par Compte et plafond global, réservés avant tout appel facturé | [chat.test.ts](../../tests/integration/chat.test.ts) (70 réservations simultanées : 60 acceptées) |

### 8.3 Revue avec `bmad-code-review`, et constat avant publication

- **Mode** : revue de tout le code, pas seulement du dernier changement. Chaque surface a été présentée à son relecteur comme un diff depuis l'arbre vide, en lecture seule, avec la même consigne : se placer en attaquant connecté ou anonyme et vérifier les appels à la frontière de la surface.
- **5 relecteurs indépendants**, aucun auteur du code relu : S1 base, S2 Edge Functions, S3 Next.js, S4 affichage et injection, S5 secrets et build (§ 2).
- **Périmètre** : `supabase/migrations`, `supabase/functions`, `src/`, `scripts/`, `next.config.ts`, `vercel.json`, plus les 5 points du bilan et les risques AD-1 et AD-14.
- **Triage** : constats des relecteurs vérifiés dans le code, doublons fusionnés (un même défaut signalé par plusieurs surfaces) : 18 retenus, 10 écartés avec leur raison (§ 3 et § 5).
- **Non-réapparition** : chaque correctif a son test automatisé, relancé à chaque passage de la suite ; l'échec du test sans le correctif a été vérifié pour R11 et R73-F13 ([plan de tests](plan-de-tests.md) § 7.2). Les quatre fonctions du garde-fou ont aussi été contrôlées sur le catalogue de production après le déploiement (§ 7).

**Constat final avant publication.** **0 anomalie haute ouverte** : les 8 anomalies hautes relevées pendant le projet, dont R1, sont corrigées ([bilan](bilan-anomalies.md)). Les points moyens restants sont acceptés par écrit (R3, R4) ou reportés sans enjeu pour la démonstration. **Décision : Go avec réserves**, prise par le porteur du produit le 2026-11-27 ([decision-mise-en-service.md](../mesures/decision-mise-en-service.md)).
