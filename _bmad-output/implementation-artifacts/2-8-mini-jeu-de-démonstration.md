---
title: 'Story 2.8 : Mini Jeu de démonstration'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: 'd5b19c93e7fb2fd892e8c2180d7b04f703d9631f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Il n'existe aucun contenu de référence pour tester la Recherche et l'Assistant, ni de Compte de démo ou de mesure, et les variables du préchargement sont prévues dans `.env.local`, que Next.js charge.

**Approach:**
- **Variables.** Un fichier séparé `.env.seed`, ignoré par git et non lu par Next.js, reçoit la clé `service_role`, `PROCESS_DOCUMENT_SECRET` et les identifiants.
- **Contenus.** 8 Notes fictives dans `demo/documents/` : les 6 du mini Jeu et les 2 Documents de test (« .md piège », « piège à 375 px »), plus `demo/questions-mini.json`.
- **Script.** `npm run seed:demo -- --mini` crée les Comptes et les Documents, déclenche `process-document` comme Next.js et attend *prêt*, sans doublon.
- **Secret de production.** Une procédure PowerShell le régénère dans une seule session, sans jamais l'afficher ni le communiquer.

## Boundaries & Constraints

**Always:**
- **`.env.seed`.** Ignoré par git, avec `.env.seed.example` suivi et sans valeur. Le script lit ce fichier explicitement (`--seed-file`, par défaut `.env.seed`) et aucune variable d'environnement du terminal. Next.js ne le charge pas : un test le prouve avec `@next/env`.
- **Variables.** `SEED_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PROCESS_DOCUMENT_SECRET`, `DEMO_ACCOUNT_A_EMAIL`, `DEMO_ACCOUNT_A_PASSWORD`, `DEMO_ACCOUNT_B_EMAIL`, `DEMO_ACCOUNT_B_PASSWORD`, `MEASURE_ACCOUNT_1_EMAIL` … `MEASURE_ACCOUNT_3_PASSWORD`. Variable absente : échec clair, qui la nomme, sans rien écrire et sans afficher de valeur.
- **Cible.** Le script affiche l'hôte visé. Hors de `localhost` et `127.0.0.1`, il exige `--remote`, sinon il échoue sans rien écrire.
- **Comptes.** Créés par l'API d'administration avec e-mail confirmé et nom fictif ; relance : mot de passe et nom réalignés, aucun doublon.
- **Documents.** 8 Notes, jamais d'import de fichier. Auteurs : les deux Comptes de démo. Clé naturelle : Auteur + `client_request_id` dérivé du nom du Document (UUID déterministe).
- **Idempotence.** Document *prêt* au même texte (normalisé), au moins un Passage : ignoré, aucun appel. Texte différent : texte remplacé, `text_version` + 1, nouvelle tentative. *En erreur* ou *en cours* expiré : nouvelle tentative. Toujours en mettant à jour la ligne existante, jamais par une seconde ligne.
- **Traitement.** Même appel que Next.js : `POST /functions/v1/process-document`, `Bearer`, `document_id`, `attempt_id`, `202` attendu. Attente de *prêt* avec **échec explicite** au-delà de 3 min, ou si le Document passe *en erreur*. Le script n'appelle jamais OpenAI et ne lit aucune clé OpenAI.
- **Contenus.** Fictifs, en français, à NexaWorks. Un fait vérifiable par Document. FAQ : délai de relance de 15 jours ; le Document contradictoire annonce un autre délai. Document piège : la consigne exacte d'epics.md. « 99 jours » et « PERROQUET » n'existent que dans ce Document.
- **`demo/questions-mini.json`.** 5 questions avec réponse attendue et Document source, 3 questions hors base, 5 Requêtes avec Document attendu, 3 Requêtes hors base, la question de contradiction et ses deux Documents, 2 scénarios de suivi avec la Source attendue. Un test vérifie chaque fait dans le Document cité.
- **`check:secrets`.** Si `.env.seed` existe, ses valeurs secrètes et ses identifiants sont cherchés dans le dépôt et dans `.next/static`, sans jamais être affichés.
- **Sorties du script.** Hôte, comptes rendus par Document (titre, Statut, nombre de Passages, durée). Jamais de mot de passe, d'e-mail, de clé ni de secret.
- **Documents.** `.env.example`, AD-20, AD-21 et `docs/environnements.md` sont mis à jour : ces variables sortent de `.env.local`.
- **Procédure du secret.** `scripts/setup-seed-env.ps1` crée ou met à jour `.env.seed` : nouveau `PROCESS_DOCUMENT_SECRET` et mots de passe aléatoires, clé `service_role` saisie masquée, rien d'affiché ; pose le secret dans Supabase par un fichier temporaire hors du dépôt ; le copie dans le presse-papiers pour Vercel.

**Décisions du 2026-11-06 :**
- **Q1 = A.** 8 Notes : les 6 du mini Jeu et les 2 Documents de test.
- **Q2 = A.** Les Notes de test de production sont supprimées avant le préchargement, par l'utilisateur : une requête `SELECT` d'abord, puis une requête `DELETE` séparée, lancée seulement après sa vérification. Le script ne supprime jamais rien.
- **Revue à trois relecteurs** et spec gardée entière.
- **`setup-seed-env.ps1`.** Refuse de s'exécuter hors de la racine du projet, n'affiche jamais de valeur, vérifie le format de la clé `service_role` sans l'afficher, et efface le presse-papiers après une confirmation de l'utilisateur.
- **Ordre en production.** Pose du secret, Vercel, redéploiement, vérification, puis préchargement distant.
- **Après le préchargement.** Le script vérifie que les 8 Documents sont *prêts* et ont de vrais Passages ; en distant, les vecteurs doivent être denses, donc réels.

**Never:**
- Fonction SQL ou migration, changement de `process-document` : le mini Jeu passe par le chemin existant.
- Jeu de démonstration complet (7.1a, 7.1b). Résultat de la Recherche ou de l'Assistant (E4, E5). Lecteur de Document (3.1).
- Clé `service_role` ou identifiant de démo dans `.env.local`, Vercel, un fichier suivi, un journal ou une conversation.
- Suppression automatique de Documents qui ne sont pas au mini Jeu.
- Commit, push ou écriture sur le projet distant sans validation. Story 2.5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Premier passage | base sans mini Jeu | 2 + 3 Comptes, 8 Documents *prêts*, avec Passages | — |
| Relance | mini Jeu complet | aucun doublon, aucun appel à `process-document` | — |
| Texte modifié | fichier changé | même ligne, `text_version` + 1, *prêt* | — |
| Reprise | Document *en erreur* ou expiré | nouvelle tentative sur la même ligne, *prêt* | — |
| Compte existant | e-mail déjà présent | réaligné, sans doublon | — |
| Variable absente | `.env.seed` incomplet | échec avant toute écriture, variable nommée | code 1 |
| Fichier absent | pas de `.env.seed` | échec clair avec la procédure | code 1 |
| Projet distant sans `--remote` | URL distante | échec avant toute écriture | code 1 |
| `202` refusé | mauvais secret | échec explicite, statut HTTP indiqué | code 1, secret jamais affiché |
| Traitement en erreur | `fail_processing` | échec explicite, Document nommé | code 1 |
| Plus de 3 min | Document jamais prêt | échec explicite | code 1 |
| Next.js | `.env.seed` présent | variables absentes de `process.env` | test `@next/env` |
| Fuite | identifiant de `.env.seed` copié dans le dépôt | `check:secrets` échoue, valeur masquée | code 1 |

</frozen-after-approval>

## Code Map

- `src/server/documents/trigger-processing.ts` -- appel à reproduire côté script (mêmes en-têtes, même corps). Le script ne l'importe pas : `server-only`.
- `supabase/functions/_shared/rag/normalize.ts` -- à réutiliser pour comparer le texte (déjà importé par des tests).
- `supabase/migrations/20261104094731_profiles.sql` -- `handle_new_user` dérive `display_name` de l'e-mail : le script écrit ensuite le nom fictif dans `profiles`, avec la clé `service_role`.
- `tests/support/local-supabase.ts` -- `localSupabase`, `localProcessSecret`.
- `tests/support/e2e-auth.ts` -- modèle `auth.admin.createUser` avec `email_confirm`.
- `scripts/check-secrets.ts` -- `secretValuesFromEnv`, `scanFiles` : ajouter les valeurs de `.env.seed`.
- `.gitignore` -- `.env*`, `!.env.example` : ajouter `!.env.seed.example`.
- `.env.example`, `docs/environnements.md` (l. 126, 143, 144, 148), architecture AD-20 et AD-21 : à mettre à jour.
- `scripts/generate-measure-note.ts` -- modèle d'un script exécutable et importable par les tests.
- `tests/unit/process-secret-boundaries.test.ts` -- attend `PROCESS_DOCUMENT_SECRET` vide dans `.env.example` : reste vrai.

## Tasks & Acceptance

**Execution:**
- [x] `.gitignore`, `.env.seed.example`, `.env.example` -- fichier séparé, en premier.
- [x] `demo/documents/*.md`, `demo/documents-mini.json` -- 8 Notes et leur manifeste.
- [x] `demo/questions-mini.json` -- jeu de questions.
- [x] `scripts/seed-demo.ts`, `package.json` -- `seed:demo`, logique exportée et testable.
- [x] `scripts/check-secrets.ts` -- valeurs de `.env.seed`.
- [x] `scripts/setup-seed-env.ps1` -- préparation et régénération sans affichage.
- [x] `docs/environnements.md`, `architecture-nexamind-ai.md` -- AD-20, AD-21, procédure.
- [x] `tests/unit/seed-demo.test.ts` -- configuration, cible, UUID déterministe, sorties sans secret, chemins d'échec.
- [x] `tests/unit/demo-set.test.ts` -- comptes, faits vérifiables, piège, contradiction, cohérence du manifeste.
- [x] `tests/unit/seed-env-boundaries.test.ts` -- git, `@next/env`, `check:secrets`.
- [x] `tests/integration/seed-demo.test.ts` -- deux passages réels sur Supabase local, reprise, texte modifié, CLI avec `--seed-file`.

**Acceptance Criteria:**
- Given la story, when `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit` et `npm run build:ci` sont lancés, then tout passe, sans appel à OpenAI.
- Given Supabase local, when le script tourne deux fois, then l'état est identique et aucun appel n'a lieu au second passage.
- Given `.env.seed` préparé et le secret régénéré, when `npm run seed:demo -- --mini --remote` est lancé, then les 8 Documents sont *prêts* sur le projet distant, avec des Passages et de vrais embeddings.

## Implementation Notes

- **Implémentation directe**, sans sous-agent, le contexte étant déjà chargé. Les trois relecteurs sont des agents séparés.
- **`--seed-file` et non `--env-file`.** `tsx` transmet `--env-file` à Node, qui charge alors le fichier dans `process.env`. Trouvé par les tests : toute option inconnue est désormais refusée.
- **`parseEnvLines` et non `util.parseEnv`.** Une valeur faite d'espaces y absorbe la ligne suivante.
- **Adresses de démo générées** par `setup-seed-env.ps1`, jamais écrites dans un fichier suivi.
- **Hors périmètre, correction de `status-banner.tsx` (stories 2.3 et 2.4).** Un test e2e a montré une page incohérente : bandeau « prêt », badge « en cours ». Un seul `router.refresh()` ne garantit pas que le serveur a rattrapé le Statut. Le bandeau rafraîchit maintenant jusqu'à ce que la page soit alignée, 6 fois au plus. Reproduit de façon déterministe par un test : échec avant, succès après. La cause exacte du cas observé sous charge n'est pas établie : le test reproduit le symptôme, par une réponse périmée. Une coupure du rafraîchissement ne le produit pas, car Next.js recharge alors la page.
- **Environnement local.** Plusieurs *workers* e2e peuvent saturer la passerelle locale (`invalid response … upstream server`).
- **Non testé automatiquement.** `Invoke-Setup` de bout en bout (saisie masquée, presse-papiers, vraie CLI) : procédure manuelle, reportée dans `deferred-work.md`.
- **Premier lancement de `setup-seed-env.ps1`.** La CLI a refusé sans `--yes` et annoncé 2 secrets, sans rien modifier. Le second serait `EMBEDDINGS_FAKE` de `config.toml` (hypothèse, vérification refusée par le contrôle automatique). Le script travaille désormais dans un dossier temporaire, contrôle la cible, puis passe `--yes`.
- **Résultat distant (relevé par l'utilisateur le 2026-11-06).** `contrôle final réussi : 8 Documents prêts, 8 Passages`, donc de vrais vecteurs. Requête de contrôle : 8 Documents `ready`, chacun avec au moins 1 Passage et `text-embedding-3-small`. Relance : tous `déjà prêt`, sans doublon.
- **Limite.** Chaque Document tient en un seul Passage (moins de 1 200 caractères) : aucune Source à plusieurs Passages n'est encore démontrable.

## Spec Change Log

## Review Triage Log

Revue du 2026-11-06 par trois relecteurs indépendants, demandée par l'utilisateur : Blind Hunter, Edge Case Hunter, Verification Gap. Aucune remise en cause de la spec : ni `intent_gap`, ni `bad_spec`.

| # | Constat | Verdict | Preuve | Suite |
|---|---|---|---|---|
| 1 | E-mails de démo en dur dans `setup-seed-env.ps1` : `build:ci` échouerait après l'étape 1, et un identifiant serait dans le dépôt | high | reproduit par deux relecteurs avec `scanFiles` | corrigé : adresses générées, test |
| 2 | Une relance remplaçait une tentative vivante | medium | `processing_started_at` jamais lu ; écart avec la spec | corrigé : Statut effectif de la base, attente, test |
| 3 | Déclenchement refusé : Document laissé *en cours* | medium | aucun équivalent de l'abandon | corrigé : passage *en erreur*, test |
| 4 | Durée absente du compte rendu | low | écart avec la spec | corrigé |
| 5 | Pas de scénario du piège dans `questions-mini.json` | medium | E4 et E5 n'avaient aucune entrée dédiée | corrigé : `promptInjection`, `forbiddenTerms` |
| 6 | Requêtes de recherche non reliées au contenu | medium | seule la clé était vérifiée | corrigé : `expectedTerm`, test |
| 7 | Isolement du terminal non vérifié | medium | commentaire sans assertion | corrigé : test en ligne de commande |
| 8 | Ctrl+C laissait le secret dans le presse-papiers | medium | effacement hors `finally` | corrigé |
| 9 | Secret posé dans Supabase avant l'écriture de `.env.seed` | medium | échec d'écriture = secret perdu | corrigé : fichier préparé puis déplacé |
| 10 | Relance du script : rotation non annoncée | medium | documentation incomplète | corrigé : étapes à reprendre indiquées |
| 11 | Pile locale non documentée | low | épic prévoit local puis distant | corrigé |
| 12 | Indentation SQL cassant la procédure | medium | lignes à 2 espaces dans un élément à 3 | corrigé |
| 13 | `DELETE` par titre : touche tout autre Document | low | `SELECT` préalable exigé par l'utilisateur, requête à usage unique | accepté, averti dans la procédure |
| 14 | Titre ou Catégorie ignorés sur un Document prêt | medium | sortie anticipée | corrigé : mise à jour sans traitement, test |
| 15 | Changement d'Auteur au manifeste : seconde ligne | low | manifeste stable | rejet |
| 16 | Erreurs de lecture ignorées (`count`, `documents`) | medium | `count ?? 0` déclenchait un traitement payant | corrigé |
| 17 | `--remote` accepté en `http://` | medium | clés en clair | corrigé : `https` exigé, test |
| 18 | Options inconnues ignorées | medium | `--seed-file=x` retombait sur `.env.seed` | corrigé, test |
| 19 | Deux Comptes à la même adresse | low | un Compte écrasé | corrigé, test |
| 20 | `--remote` sur une URL locale échoue au contrôle final | low | refus attendu : il prouve le câblage | rejet |
| 21 | Horloge du poste pour `processing_started_at` | low | décalage de 3 min improbable | rejet |
| 22 | `waitForReady` : lecture bloquée ou erreur passagère | low | cas rare, échec explicite | rejet |
| 23 | Valeurs entre guillemets | low | le fichier est généré sans guillemets | rejet |
| 24 | BOM en tête de `.env.seed` | low | correction directe | corrigé |
| 25 | `--seed-file` hors du contrôle `check:secrets` | low | usage local seulement | documenté |
| 26 | `realEmbeddings` et `--remote` non exercés | medium | aucun test avec de vrais vecteurs simulés | corrigé : intégration et ligne de commande |
| 27 | Réalignement d'un Compte non observé | medium | mot de passe jamais modifié | corrigé, test |
| 28 | Reprises *expiré* et *prêt sans Passage* non testées | medium | seule l'erreur était couverte | corrigé, tests |
| 29 | Analyse de `.env.seed` non testée en `--static` | medium | dépôt seulement | corrigé, test |
| 30 | `Read-SeedFile` jamais exécuté | medium | table construite à la main | corrigé, test |
| 31 | `Invoke-Setup` non exécuté de bout en bout | maybe-false (medium, non vérifié) | exige saisie masquée, presse-papiers et CLI réelle | reporté |
| 32 | Plafond de rafraîchissement du bandeau non testé | low | page et route lisent les mêmes colonnes | reporté |
| 33 | Bandeau incohérent après 6 rafraîchissements | low | très rare, un rechargement corrige | rejet |
| 34 | Statut du bandeau non resynchronisé si le Document repasse *en cours* | medium | atteignable avec la relance | reporté à 2.5 |
| 35 | `status-banner.tsx` hors périmètre et non consigné | low | correction d'un défaut réel | consigné ici, signalé à l'utilisateur |
| 36 | Délai de déclenchement de 30 s contre 5 s | low | voulu : démarrage à froid, script non interactif | rejet |
| 37 | Suivi de la story, `deferred-work.md` | low | fin de story | corrigé |

## Verification

**Commands:**
- `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected: tout vert, aucun secret.

**Manual checks:**
- Projet distant : voir le rapport de fin de story.
