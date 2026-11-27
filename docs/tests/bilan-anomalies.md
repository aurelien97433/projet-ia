# Bilan des anomalies — NexaMind AI

État au 2026-11-27 (story 7.7, mis à jour par l'audit de sécurité de la story 7.8). Une ligne par anomalie, report ou écart relevé pendant le projet. Les tests qui couvrent chaque parcours sont décrits dans le [plan de tests](plan-de-tests.md).

## En bref

| Gravité | Ouvertes | Dont acceptées (décision écrite) | Fermées |
|---|---|---|---|
| Haute | **0** | 0 | 8 |
| Moyenne | **7** | 3 | 39 |
| Basse | **42** | 23 | 37 |
| **Total** | **49** | 26 | 84 |

Aucune anomalie de gravité haute n'est ouverte. Les 8 anomalies hautes relevées ont été corrigées, avec un test ou une mesure à l'appui (dont R78-R1, trouvée par l'audit).

**Audit de sécurité (story 7.8, [audit-securite.md](audit-securite.md))** : les 5 points renvoyés ont chacun une suite. D08 fermé (vérifié dans le code), D19 corrigé (R78-R8), R73-F13 corrigé, D40 et D38 acceptés avec R78-R3. L'audit ajoute 18 constats `R78-R1` à `R78-R18` : 9 corrigés, 2 acceptés (R78-R3, R78-R4), 7 reportés. Les risques AD-1 et AD-14 ont été revus : appel direct des fonctions du garde-fou fermé (R78-R1, R78-R2).

**Portées par d'autres stories** : 7.5, répétition générale (N1, D37, M3) ; 7.9, seuils et alertes (D46). Les autres reports ouverts sont acceptés ou renvoyés après la démonstration.

## Légende

- **Gravité.** Haute : fuite de données, coût non maîtrisé ou démonstration bloquée. Moyenne : parcours dégradé, résultat faux possible ou disponibilité en jeu. Basse : confort, accessibilité fine, outillage ou test manquant sur un cas improbable.
- **Origine.** *Story* : relevé pendant l'implémentation ; *revue* : relecture du code ; *mesure* : rapport de [docs/mesures](../mesures) ; *plan* : relevé en écrivant le plan de tests.
- **Suite.** *Corrigée* : traitée par un changement prouvé ; *reportée* : à faire, avec le porteur indiqué ; *acceptée* : on vit avec, sur décision écrite.
- **État.** *Fermée* : plus rien à faire. *Ouverte* : reportée ou acceptée.
- **Identifiants.** `D01` à `D85` : les 85 entrées de [deferred-work.md](../../_bmad-output/implementation-artifacts/deferred-work.md), dans l'ordre du fichier ; `D86` : report ajouté à la clôture de la 7.8 ; `D87` : défaut trouvé le 2026-11-27 par `bmad-qa-generate-e2e-tests` (deux dernières entrées du fichier). `R72-`, `R72b-`, `R73-` : constats des revues des stories [7.2](../../_bmad-output/implementation-artifacts/7-2-calibrage-final-et-mesures-sm-1-sm-2-sm-4-sm-5.md), [7.2b](../../_bmad-output/implementation-artifacts/7-2b-contradiction-entre-documents-differents.md) et [7.3](../../_bmad-output/implementation-artifacts/7-3-parcours-uj-1-à-uj-3-au-clavier-et-à-375-px.md) (numéros de leur « Review Triage Log »). `R78-R1` à `R78-R18` : constats de l'[audit de sécurité](audit-securite.md) (story 7.8). `M` : mesures. `N` : plan de tests.

**Règle de classement.** Une entrée de `deferred-work.md` marquée « Traité… », « Fait… », « Mesuré… » ou « Tranché… » est fermée. Les autres sont ouvertes, **sauf** les entrées qui ne portent pas cette mention mais dont le traitement est prouvé par un test, un fichier ou un rapport (24 entrées : D01, D07, D12, D14, D17, D20, D21, D22, D26, D28, D30, D39, D41, D44, D47, D48, D52, D62, D63, D65, D73, D75, D79, D82) : la preuve est donnée dans la ligne.

## 1. Anomalies ouvertes

| Id | Anomalie | Gravité | Origine | Suite | Porteur | Preuve de l'état |
|---|---|---|---|---|---|---|
| D15 | Le verrou de `complete_processing` face à un abandon concurrent n'est pas testé avec deux transactions | moyenne | story 2.4 | reportée | après la démo | Cas voisin : [delete-document.test.ts](../../tests/integration/delete-document.test.ts) (« pendant le traitement ») |
| D40 | Aucune limite au nombre d'URL de dépôt ni de fichiers déposés par Collaborateur | moyenne | revue 2.6a | acceptée | — | Décision de l'utilisateur du 2026-11-25 (audit R78-R3) : [audit-securite.md](audit-securite.md) |
| R78-R3 | Aucune limite de volume par Compte (Notes, Conversations, messages, fichiers déposés jamais purgés) | moyenne | audit 7.8 | acceptée | — | Décision de l'utilisateur du 2026-11-25 : [audit-securite.md](audit-securite.md) |
| R78-R4 | Vectorisation (Recherche, traitement des Documents) hors quota et sans limite de débit | moyenne | audit 7.8 | acceptée | — | Décision de l'utilisateur du 2026-11-25 : [audit-securite.md](audit-securite.md) |
| R78-R13 | Limites de l'Auth peut-être appliquées à l'adresse de sortie de Vercel | moyenne | audit 7.8 | reportée | après la démo | Non vérifié ; [audit-securite.md](audit-securite.md) |
| D46 | Marge de l'écriture finale à 100 Ko (environ 3 s sous une limite de 8 s, jusqu'à 7 s observés à 150 Ko) à remesurer avant la démonstration | moyenne | story 2.7 | reportée | **7.9** | Dernière mesure : [charge-100000-octets-2.md](../mesures/charge-100000-octets-2.md) (2026-11-13) |
| N1 | La question exacte d'UJ-1 et la Requête d'UJ-3 ne sont jamais mesurées avec la vraie IA sur le Jeu complet ; sur le mini Jeu, UJ-1 citait « Guide des relances clients » au lieu de « Procédure de facturation » attendue par le PRD | moyenne | plan | reportée | **7.5** | [plan-de-tests.md](plan-de-tests.md) §1 et §3 ; observation du 2026-11-16 (entrée D62) |
| D02 | Non vérifié : le paquet `supabase` exécute-t-il son script d'installation sur Vercel ? | basse | story 1.1 | reportée | après la démo | Aucun relevé des journaux de build |
| D04 | `major_version` de `supabase/config.toml` (17) non comparé à la version du projet distant | basse | story 1.1 | reportée | après la démo | [config.toml](../../supabase/config.toml) |
| D05 | Après une réponse perdue à l'inscription, le réessai affiche « e-mail déjà utilisé » au lieu de proposer la connexion | basse | story 1.3 | reportée | après la démo | Cas rare (coupure après création) |
| D06 | L'ordre « migration distante puis déploiement Vercel » repose sur la procédure, sans contrôle automatique | basse | story 1.3 | acceptée | — | Ordre obligatoire écrit dans [environnements.md](../environnements.md) |
| D09 | L'alerte « La connexion n'a pas abouti… » et la redirection de `SessionGate` n'ont que des tests unitaires | basse | story 1.4 | acceptée | — | [sign-in.test.ts](../../tests/unit/sign-in.test.ts) |
| D10 | Un Document inconnu affiche « Page introuvable » avec le statut HTTP 200 au lieu de 404 | basse | story 2.2 | acceptée | — | Décision de l'utilisateur du 2026-11-05 ; page non indexée ([ajouter.spec.ts](../../tests/e2e/ajouter.spec.ts), « Document inconnu ») |
| D13 | Passage d'un Document à un autre sans rechargement du bandeau de Statut non testé | basse | story 2.3 | reportée | après la démo | — |
| D18 | Plafond de 6 rafraîchissements du bandeau si le serveur reste périmé non testé | basse | story 2.8 | acceptée | — | Cas jugé très improbable |
| D29 | Le message « Le Passage cité n'a pas pu être retrouvé… » n'est pas annoncé à l'arrivée sur la page | basse | story 3.2 | reportée | après la démo | Message relié au Passage actif seulement ([document-reader.tsx](../../src/components/documents/document-reader.tsx)) |
| D31 | Position collante du message en tête (`top-14`) prévue pour la page Document, pas pour le panneau Source | basse | story 3.2 | reportée | après la démo | [document-reader.tsx](../../src/components/documents/document-reader.tsx) |
| D32 | Recherche par titre de la Bibliothèque sans index | basse | story 3.3 | acceptée | — | Décision du 2026-11-10 ; liste plafonnée à 200 lignes |
| D33 | Un Passage peut se terminer par un intertitre seul | basse | spec avant 4.1a | acceptée | — | Voir D36 |
| D34 | `match_passages` n'utilise pas l'index HNSW | basse | story 4.1a | acceptée | — | Voir D35 |
| D35 | Index HNSW reporté tant que la Recherche reste rapide | basse | story 4.2 | acceptée | — | Médiane 572 ms sur 15 Documents ([indicateurs.md](../mesures/indicateurs.md)) |
| D36 | Intertitres en fin de Passage gardés : sans effet mesuré sur la pertinence | basse | story 4.2 | acceptée | — | SM-4 10/10 ([indicateurs.md](../mesures/indicateurs.md)) |
| D37 | Premier appel de la Recherche lent (3,5 s, démarrage à froid) : réchauffer avant la démonstration | basse | mesure 4.2 | reportée | **7.5** | [recherche-live.md](../mesures/recherche-live.md) |
| D38 | Fichiers déposés mais jamais importés, jamais nettoyés (2 objets constatés en production) | basse | story 2.6a | acceptée | — | Décision de l'utilisateur du 2026-11-25 (audit R78-R3) : [audit-securite.md](audit-securite.md) |
| D45 | Écriture des Passages par lots, seulement si des Documents de plus de 100 Ko deviennent nécessaires | basse | story 2.7 | acceptée | — | Décision du 2026-11-12 ([charge-1mo.md](../mesures/charge-1mo.md)) |
| D57 | Délai commun expiré entre deux tentatives de génération : unité consommée sans génération facturée | basse | story 5.2a-2 | acceptée | — | Cas rare, impact d'une unité |
| D58 | Document retraité entre la recherche et la relecture : Source enregistrée avec des positions de l'ancienne version | basse | story 5.2a-2 | reportée | après la démo | Fenêtre de quelques secondes ; non testé |
| D59 | `ai_reservations` et `ai_usage` grossissent sans purge | basse | story 5.2a-2 | reportée | après la démo | Aucune purge dans [20261116090000_chat.sql](../../supabase/migrations/20261116090000_chat.sql) |
| D67 | Aucun test n'écrit la section « Contradiction c1 » du rapport de `measure:search` | basse | revue 5.4 | acceptée | — | À ajouter si le script est retouché |
| D71 | Panneau Historique non plein écran entre 640 et 767 px | basse | revue 5.7 | reportée | après la démo | Toujours présent : [history-sheet.tsx](../../src/components/assistant/history-sheet.tsx), ligne 111, sans `sm:max-w-none` |
| D72 | Une puce de Source qui passe à « supprimé » peut faire relire toute la réponse par un lecteur d'écran | basse | revue 5.7 | reportée | après la démo | Non vérifié avec un lecteur d'écran |
| D80 | Recherches r2 et r3 : bon Document au rang 2, derrière le Guide d'accueil | basse | story 7.1b | acceptée | — | Décision de l'utilisateur en 7.2 : gardé tant qu'il reste dans les 3 premiers ([indicateurs.md](../mesures/indicateurs.md)) |
| D81 | Questions ambiguës a1, a2 et demande hostile y3 : refus au lieu de distinguer les cas ou de donner les valeurs sourcées | basse | mesure 7.2 | acceptée | — | Relecture de l'utilisateur du 2026-11-24 : « conforme sur la sécurité, écart sur l'attendu », aucun correctif ([indicateurs.md](../mesures/indicateurs.md)) |
| D85 | Les tests e2e locaux dépendent de toute la base locale (refus « budget 2027 » d'UJ-1 sensible aux Passages des autres tests) | basse | revue 7.3 (F12) | acceptée | — | Verrou commun aux parcours ([journey-lock.ts](../../tests/e2e/support/journey-lock.ts)) ; e2e 407/0 en 7.3 |
| M3 | Premier affichage de l'Assistant à 5,2 s pour la première question (démarrage à froid), au-dessus de 5 s | basse | mesure 5.5 | reportée | **7.5** | [flux-vercel.md](../mesures/flux-vercel.md) ; même parade que D37 |
| R72-5 | Nettoyage des Documents « — test SM-5 » après un échec prouvé par construction seulement | basse | revue 7.2 | acceptée | — | Contrôle manuel de la Bibliothèque par l'utilisateur, aucun reste |
| R72-6 | Aucun rapport écrit si `measure:all` échoue en cours de passage | basse | revue 7.2 | acceptée | — | Seuls les contrôles sans coût peuvent l'arrêter |
| R72b-2 | `test:followup:live` refuse tout argument inconnu | basse | revue 7.2b | acceptée | — | Voulu : évite un passage complet par faute de frappe |
| R72b-3 | `measure:all` n'interdit pas la phrase d'écart au premier tour de f2 (seul `--only` le fait) | basse | revue 7.2b | acceptée | — | `measure:all` non rejoué |
| R72b-4 | Deux Documents différents de même titre seraient vus comme un seul pour les contradictions | basse | revue 7.2b | acceptée | — | Titres uniques dans le Jeu complet |
| R72b-5 | `tests/integration/summary.test.ts` a expiré une fois (396 s) dans la suite complète | basse | revue 7.2b | acceptée | — | Réussi seul 27/27 ; suite complète verte en 7.3 ; à surveiller |
| R73-F17 | Brouillon du champ de question non remis à zéro au retour sur l'Assistant | basse | revue 7.3 | acceptée | — | Même comportement que « + Nouvelle Conversation » |
| R78-R12 | Paramètres de `match_passages` sans bornes (coût limité par le délai de 8 s) | basse | audit 7.8 | reportée | après la démo | [audit-securite.md](audit-securite.md) |
| R78-R14 | Fonctions locales `ai-health` et `measure-embed` exclues du déploiement par une liste seulement | basse | audit 7.8 | reportée | après la démo | [audit-securite.md](audit-securite.md) |
| R78-R15 | Nom affiché = partie locale de l'e-mail, lisible par tous | basse | audit 7.8 | reportée | après la démo | [audit-securite.md](audit-securite.md) |
| R78-R16 | Une injection réussie dans un Résumé serait conservée et montrée à tous | basse | audit 7.8 | reportée | **7.9** | [audit-securite.md](audit-securite.md) |
| R78-R17 | Motifs absents de `check:secrets` (`sbp_`, `postgres://…@`, `ghp_`) | basse | audit 7.8 | reportée | après la démo | [audit-securite.md](audit-securite.md) |
| D86 | `test:summary:live` conclut « ÉCHEC » quand les Résumés visés existent déjà (chemin de génération non exercé) et écrase son rapport | basse | story 7.8 | reportée | après la démo | [resume-live-2.md](../mesures/resume-live-2.md) ; génération vérifiée à la main sur le site ([audit-securite.md](audit-securite.md) §7) |
| D87 | Retour sur l'écran du premier chargement : pas de focus de changement d'écran (ordinateur et 375 px) | basse | séquence 10 (bmad-qa-generate-e2e-tests) | reportée | après la démo | [shell.spec.ts](../../tests/e2e/shell.spec.ts), test « D87 (défaut connu) » en échec attendu ; [test-summary.md](../../_bmad-output/implementation-artifacts/tests/test-summary.md) |

## 2. Anomalies fermées

| Id | Anomalie | Gravité | Origine | Suite | Preuve |
|---|---|---|---|---|---|
| R73-F1 | Ctrl+C pendant `test:security:live` laissait une Note de test visible du jury | haute | revue 7.3 | corrigée | Commit `dd47465` ; 0 Note restante ([securite-live.md](../mesures/securite-live.md)) |
| R73-F2 | `test:security:live` créait une Conversation impossible à supprimer | haute | revue 7.3 | corrigée | Décision de l'utilisateur : aucune Conversation créée ; [securite-live.md](../mesures/securite-live.md) (0 unité) |
| R73-F14 | Revenir sur « Assistant » réaffichait l'ancienne Conversation, et la question suivante y partait | haute | revue 7.3 | corrigée | Commit `dd47465` ([assistant-view.tsx](../../src/components/assistant/assistant-view.tsx)) ; [assistant-view.test.tsx](../../tests/unit/assistant-view.test.tsx) (« F14 ») et [uj-1.spec.ts](../../tests/e2e/uj-1.spec.ts) ; vérifié sur le site par l’utilisateur |
| R73-F15 | Le correctif F14 vidait la Conversation réaffichée par « Retour » | haute | revue 7.3 | corrigée | Commit `dd47465` ; [assistant-view.test.tsx](../../tests/unit/assistant-view.test.tsx) (« réaffichée à l’adresse /assistant/{id} ») ; vérifié sur le site |
| D43 | Un fichier de 1 Mo échouait en production (écriture des Passages trop longue) | haute | story 2.7 | corrigée | Limite abaissée à 100 Ko : [charge-1mo.md](../mesures/charge-1mo.md), [charge-100000-octets-2.md](../mesures/charge-100000-octets-2.md) |
| D50 | Aucun garde-fou du crédit d'IA avec une inscription ouverte | haute | story 5.2a-1 | corrigée | Quota 60 et plafond 300 : [chat.test.ts](../../tests/integration/chat.test.ts) (« 70 réservations concurrentes ») |
| D52 | Un Collaborateur pouvait effacer son compteur en appelant `release_ai_call` | haute | story 5.2a-2 | corrigée | Rendu lié à la réservation : [chat.test.ts](../../tests/integration/chat.test.ts) |
| R78-R1 | Verrou du Résumé contournable par appel direct de `end_summary` : N générations facturées en parallèle | haute | audit 7.8 | corrigée | Fonctions réservées à `service_role`, unité gardée après génération ; [summary.test.ts](../../tests/integration/summary.test.ts) (42501) ; [audit-securite.md](audit-securite.md) |
| R73-F3 | Critère 3 de SM-6 pouvait passer à vide | moyenne | revue 7.3 | corrigée | Au moins 1 Conversation et 1 message de A exigés ([securite-live.md](../mesures/securite-live.md) : 1 et 2) |
| R73-F7 | Verrou des parcours non libéré si le nettoyage échoue | moyenne | revue 7.3 | corrigée | Commit `dd47465` ([journeys.ts](../../tests/e2e/support/journeys.ts)) |
| R73-F8 | Verrou abandonné plus long que l'attente : parcours en échec après Ctrl+C | moyenne | revue 7.3 | corrigée | Verrous effacés par [global-setup.ts](../../tests/e2e/global-setup.ts) |
| R73-F10 | Le suivi d'UJ-3 était accepté même refusé | moyenne | revue 7.3 | corrigée | [uj-3.spec.ts](../../tests/e2e/uj-3.spec.ts) : réponse et Source exigées |
| R73-F16 | Fil non vide sans Conversation non remis à zéro | moyenne | revue 7.3 | corrigée | Commit `dd47465` ; [assistant-view.test.tsx](../../tests/unit/assistant-view.test.tsx) (« départ pendant la première question ») |
| M1 | Contradiction c1 : 2 réponses sur 3 sans la seconde valeur (13/15) | moyenne | mesure 5.4 | corrigée | Commit `0c32162` ; [assistant-live-5-4-passage-1.md](../mesures/assistant-live-5-4-passage-1.md) puis [assistant-live-2.md](../mesures/assistant-live-2.md) (15/15, c1 3/3) |
| D03 | Clé `service_role` du préchargement lue par Next.js en local | moyenne | story 1.1 | corrigée | Story 2.8 : fichier `.env.seed` séparé ([environnements.md](../environnements.md)) |
| D07 | Chaque Server Action doit vérifier la session elle-même | moyenne | story 1.4 | corrigée | [require-user.ts](../../src/server/auth/require-user.ts), utilisé par les actions et les routes ; [require-user.test.ts](../../tests/unit/require-user.test.ts) |
| D11 | Notification « Document ajouté » restée affichée après le passage *en erreur* | moyenne | story 2.2 | corrigée | Story 2.3 (bandeau de Statut) |
| D12 | Sortie JSON de `supabase functions deploy` jamais relevée | moyenne | story 2.3 | corrigée | Sortie réelle relevée dans [deploy-supabase.ts](../../scripts/deploy-supabase.ts) (ligne 63) ; [deploy-supabase.test.ts](../../tests/unit/deploy-supabase.test.ts) ; déploiements réussis jusqu'en 7.2b |
| D14 | Écriture des Passages en un seul appel à évaluer | moyenne | story 2.4 | corrigée | Mesurée en 2.7 (voir D43) |
| D16 | Bandeau de Statut figé après une relance | moyenne | story 2.8 | corrigée | Story 2.5 ; [document-status.spec.ts](../../tests/e2e/document-status.spec.ts) (« erreur puis en cours ») |
| D20 | Le Jeu complet doit contenir des Documents longs (Sources à plusieurs Passages) | moyenne | story 2.8 | corrigée | Commit `572a8ba` ; [jeu-demonstration.json](../../demo/jeu-demonstration.json) ; [source-panel.spec.ts](../../tests/e2e/source-panel.spec.ts) (« deux Passages ») |
| D21 | « Supprimer » absent du bandeau d'un Document sans texte | moyenne | story 2.5 | corrigée | [delete-document.spec.ts](../../tests/e2e/delete-document.spec.ts) (« sans texte exploitable : suppression depuis le bandeau ») |
| D23 | Deux tests e2e du badge instables | moyenne | story 2.5 | corrigée | Story 3.2 (source d'état unique) |
| D24 | Badge et bandeau de Statut alimentés par deux sources | moyenne | story 2.5 | corrigée | Story 3.2 |
| D30 | Erreur `http_500` de `process-document` sous charge, appel inconnu | moyenne | story 3.2 | corrigée | Cause établie en 2.7 (voir D44) |
| D39 | Objet Storage laissé après suppression d'un Document importé | moyenne | story 2.6a | corrigée | [delete-document.spec.ts](../../tests/e2e/delete-document.spec.ts) (« retire aussi son objet du Storage ») ; [delete-document.test.ts](../../tests/integration/delete-document.test.ts) |
| D41 | Fichier non UTF-8 qui dépasse la limite une fois converti | moyenne | revue 2.6a | corrigée | Voir D42 |
| D42 | Texte converti trop long : erreur définitive avec message propre | moyenne | story 2.6b | corrigée | [file-decoding.test.ts](../../tests/integration/file-decoding.test.ts) (« Windows-1252 ») |
| D44 | `http_500` causé par la limite de 8 s par instruction | moyenne | story 2.7 | corrigée | [charge-300000-octets.md](../mesures/charge-300000-octets.md) ; code Postgres journalisé |
| D47 | Sources d'un Document supprimé dans les Conversations | moyenne | story 3.4 | corrigée | Stories 5.1, 5.2a-2, 5.7 ; [conversations-rls.test.ts](../../tests/integration/conversations-rls.test.ts), [chat.test.ts](../../tests/integration/chat.test.ts) |
| D48 | Identifiants de Passages d'un Document supprimé relus | moyenne | story 5.1 | corrigée | Story 5.7 ; [chat.test.ts](../../tests/integration/chat.test.ts) (« course 23503 ») |
| D49 | Titre et version d'une Source fournis par le modèle | moyenne | revue 5.1 | corrigée | [chat-function.test.ts](../../tests/unit/chat-function.test.ts) ; [chat.test.ts](../../tests/integration/chat.test.ts) |
| D51 | Délai total de `chat` jusqu'à 135 s ; double paiement possible | moyenne | revue 5.2a-1 | corrigée | [ai-generate.test.ts](../../tests/unit/ai-generate.test.ts) ; [chat-function.test.ts](../../tests/unit/chat-function.test.ts) |
| D54 | Réponse enregistrée ET échec dans la même Conversation | moyenne | story 5.2a-2 | corrigée | Story 5.9 ; [chat-function.test.ts](../../tests/unit/chat-function.test.ts) ; [assistant.spec.ts](../../tests/e2e/assistant.spec.ts) |
| D55 | Question bloquée en `REQUEST_IN_PROGRESS` indéfiniment | moyenne | story 5.2a-2 | corrigée | Story 5.9 (réessai après 90 s) ; tests d'intégration |
| D62 | La contradiction c1 n'apparaissait pas avec la formulation d'UJ-1 | moyenne | story 5.2a-2 | corrigée | c1 mesurée avec sa propre question : 3/3 ([assistant-live-2.md](../mesures/assistant-live-2.md)) ; UJ-1 suivi par N1 |
| D63 | Fait attribué au mauvais Document dans le texte de la réponse | moyenne | mesure 5.2a-2 | corrigée | Consigne « Ne nommez jamais un Document autre que celui du Passage » ([prompt.ts](../../supabase/functions/_shared/rag/prompt.ts), ligne 28) ; [prompt.test.ts](../../tests/unit/prompt.test.ts) |
| D73 | La question de suivi d'UJ-3 (« moins de 3 jours ») sans réponse dans le mini Jeu | moyenne | story 5.8 | corrigée | Règle ajoutée au Jeu complet ; f4 conforme ([suivi-live-2.md](../mesures/suivi-live-2.md), [indicateurs.md](../mesures/indicateurs.md)), un essai par passage |
| D75 | Test `search-page.spec.ts` instable sous charge | moyenne | story 5.8 | corrigée | Voir D83 |
| D76 | Question h1 (budget 2027) classée hors cadre une fois sur 15 | moyenne | mesure 5.8 | corrigée | Commit `d938d06` ; SM-2 10/10 ([indicateurs.md](../mesures/indicateurs.md)) |
| D82 | Fausse contradiction au premier tour de f2 (règle et exception d'un même Document) | moyenne | mesure 7.2 | corrigée | Story 7.2b, commit `f21fc82` ; [suivi-live-2.md](../mesures/suivi-live-2.md) (phrase d'écart absente) |
| D83 | Test `search-page.spec.ts` instable : clic avant le montage du titre | moyenne | story 7.3 | corrigée | [search-page.spec.ts](../../tests/e2e/search-page.spec.ts) ; 24/24 sous ralentissement ; défaut d'application suivi par R73-F13 |
| D08 | Une Server Action envoyée après l'expiration de la session reçoit peut-être une redirection 307 au lieu d'un refus `UNAUTHENTICATED` | moyenne | story 1.4 | corrigée | Vérifié par l'audit 7.8 : le Proxy ne redirige pas une Server Action (`next-action`) et `requireUser` refuse avant toute écriture ; [audit-securite.md](audit-securite.md) §4 |
| D19 | La copie du secret de traitement par le presse-papiers (`setup-seed-env.ps1`) a échoué une fois ; recopie manuelle nécessaire | moyenne | story 2.8 | corrigée | Copie relue, 3 essais, échec signalé (audit R78-R8) ; [seed-env-boundaries.test.ts](../../tests/unit/seed-env-boundaries.test.ts) (« Copy-Verified ») |
| R78-R2 | `reserve_ai_call` appelable directement : plafond global vidé sans aucun appel au fournisseur | moyenne | audit 7.8 | corrigée | [chat.test.ts](../../tests/integration/chat.test.ts) (« appel direct (42501) ») ; [audit-securite.md](audit-securite.md) |
| R78-R6 | Script de rotation : secret de traitement demandé aussi en Preview | moyenne | audit 7.8 | corrigée | [seed-env-boundaries.test.ts](../../tests/unit/seed-env-boundaries.test.ts) (« Production seulement ») |
| R78-R7 | Procédure manuelle de rotation lancée depuis la racine : variables de simulation envoyées en production | moyenne | audit 7.8 | corrigée | [environnements.md](../environnements.md) ; [seed-env-boundaries.test.ts](../../tests/unit/seed-env-boundaries.test.ts) (« dossier temporaire ») |
| D01 | `check:secrets --static` ne lisait pas les pages prérendues | basse | story 1.1 | corrigée | [check-secrets.ts](../../scripts/check-secrets.ts) (`.html`, `.rsc`, `.body` de `.next/server/app`) |
| D17 | `setup-seed-env.ps1` jamais exécuté de bout en bout | basse | story 2.8 | corrigée | Exécuté par l'utilisateur le 2026-11-06 (voir D19) ; commit `f8901f7` |
| D22 | Branche « déclenchement refusé » après une relance non testée en e2e | basse | story 2.5 | corrigée | [document-status.spec.ts](../../tests/e2e/document-status.spec.ts) (« échec de l'action : message, bouton de nouveau proposé ») |
| D25 | Passage actif entièrement visible non prouvé dans un navigateur | basse | story 3.1 | corrigée | Story 3.2 ; [document-page.spec.ts](../../tests/e2e/document-page.spec.ts) |
| D26 | Étiquette « Passage pertinent » à l'arrivée depuis la Recherche | basse | story 3.1 | corrigée | [search-page.spec.ts](../../tests/e2e/search-page.spec.ts) (« Document « Passage pertinent » ») |
| D27 | Test « en cours et vivant » de `seed-demo.test.ts` dépendant du temps | basse | story 3.1 | corrigée | Traité après 3.1 |
| D28 | `ajouter.spec.ts` en échec une fois sur le badge « prêt » | basse | story 3.1 | corrigée | Cause établie (voir D44) ; e2e 407/0 en 7.3 |
| D53 | Question de relance inadaptée aux critères de 5.2a | basse | story 5.2a-2 | corrigée | Décision du 2026-11-16 : critères sur q1 |
| D56 | Unité consommée si le délai expire pendant `reserve_ai_call` | basse | story 5.2a-2 | corrigée | Story 5.10 ; [chat-function.test.ts](../../tests/unit/chat-function.test.ts) |
| D60 | Saisie invalide affichée comme une panne du service | basse | story 5.2a-2 | corrigée | Story 5.2b ; [chat-route.test.ts](../../tests/unit/chat-route.test.ts) |
| D61 | `test:chat:live` ne passait pas par la route Next.js | basse | story 5.2a-2 | corrigée | Vérification de l'utilisateur du 2026-11-16 ; [assistant.spec.ts](../../tests/e2e/assistant.spec.ts) |
| D64 | Alerte d'erreur lue deux fois par les lecteurs d'écran | basse | revue 5.2b | corrigée | Stories 5.10 et 5.11 ; [error-alert.test.tsx](../../tests/unit/error-alert.test.tsx) |
| D65 | Repères bruts « [P2] » et « 1. » sur une réponse d'un seul point | basse | mesure 5.2b | corrigée | [prompt.test.ts](../../tests/unit/prompt.test.ts) ; 0 repère brut, 0 « 1. » initial sur 15 ([assistant-live-2.md](../mesures/assistant-live-2.md)) |
| D66 | Anciennes réponses avec repères bruts dans l'Historique | basse | revue 5.4 | corrigée | Story 5.6 ; [history.spec.ts](../../tests/e2e/history.spec.ts) (« sans [P{n}] ») |
| D68 | Exemple de la consigne de contradiction recopié par le modèle | basse | mesure 5.4 | corrigée | Story 5.5 ; [prompt.test.ts](../../tests/unit/prompt.test.ts) |
| D69 | « Réessayer » créait une seconde Conversation après 20 s | basse | revue 5.6 | corrigée | Story 5.9 |
| D70 | Date d'ajout des Documents rendue avec le fuseau du serveur | basse | revue 5.6 | corrigée | [added-on.test.tsx](../../tests/unit/added-on.test.tsx) |
| D74 | Unité jamais rendue si le délai tombe pendant `reserve_ai_call` | basse | story 5.8 | corrigée | Story 5.10 (voir D56) |
| D77 | Course de deux demandes identiques : unité rendue à tort | basse | revue 5.9 | corrigée | Story 5.10 ; [chat-function.test.ts](../../tests/unit/chat-function.test.ts) |
| D78 | Quota illisible au chargement de l'Assistant | basse | story 5.10 | corrigée | [20261120150000_ai_limits_read.sql](../../supabase/migrations/20261120150000_ai_limits_read.sql) ; [assistant.spec.ts](../../tests/e2e/assistant.spec.ts) (« quota quotidien ») |
| D79 | Test unitaire de délai instable sous charge | basse | revue 5.10 | corrigée | Voir D84 |
| D84 | Test « génération bornée » rendu déterministe | basse | revue 7.3 | corrigée | [chat-function.test.ts](../../tests/unit/chat-function.test.ts) (horloge contrôlée) |
| M2 | SM-1 à 18/20 : apostrophes typographiques non reconnues par le contrôle automatique | basse | mesure 7.2 | corrigée | Commit `9b22fd1` ; 20/20 après correction, 0 fait inventé ([indicateurs.md](../mesures/indicateurs.md)) |
| R72-1 | Rapport de `measure:all` annonçant une vectorisation « en un appel » au lieu de lots de 20 | basse | revue 7.2 | corrigée | [measure-all.ts](../../scripts/measure-all.ts) |
| R72-2 | Fonction locale injoignable : arrêt sans message clair | basse | revue 7.2 | corrigée | [measure-all.test.ts](../../tests/unit/measure-all.test.ts) |
| R73-F4 | Toute erreur comptée comme un refus dans SM-6 | basse | revue 7.3 | corrigée | Code d'erreur consigné ([test-security-live.ts](../../scripts/test-security-live.ts)) |
| R73-F5 | Hôte Supabase non masqué dans une ligne de sortie | basse | revue 7.3 | corrigée | Valeurs masquées (`redact`) : [test-security-live.test.ts](../../tests/unit/test-security-live.test.ts) |
| R73-F6 | Portée de l'analyse du code envoyé au navigateur non écrite | basse | revue 7.3 | corrigée | Portée écrite dans [securite-live.md](../mesures/securite-live.md) |
| R73-F9 | La libération d'un verrou pouvait effacer celui d'un autre | basse | revue 7.3 | corrigée | Jeton de détenteur ([journey-lock.ts](../../tests/e2e/support/journey-lock.ts)) |
| R73-F11 | Historique ouvert par adresse au lieu du clavier dans les parcours | basse | revue 7.3 | corrigée | [uj-1.spec.ts](../../tests/e2e/uj-1.spec.ts), [uj-3.spec.ts](../../tests/e2e/uj-3.spec.ts) |
| R73-F13 | Focus du nouvel écran perdu si l'on navigue avant que le titre soit prêt (machine lente) | basse | revue 7.3 | corrigée | Adresse relevée au chargement ([title-focus.ts](../../src/components/shell/title-focus.ts)) ; [page-title.test.tsx](../../tests/unit/page-title.test.tsx) (« adresse changée avant le premier titre ») ; menu mobile : R78-R11 |
| R78-R5 | Caractères Unicode invisibles et bidi transmis au modèle | basse | audit 7.8 | corrigée | [prompt.test.ts](../../tests/unit/prompt.test.ts) (« caractères invisibles ») |
| R78-R8 | Copie du secret par le presse-papiers sans vérification (cause probable de D19) | basse | audit 7.8 | corrigée | [seed-env-boundaries.test.ts](../../tests/unit/seed-env-boundaries.test.ts) (« Copy-Verified ») |
| R78-R9 | Aucun en-tête de sécurité (affichage dans un cadre, `nosniff`, `Referrer-Policy`) | basse | audit 7.8 | corrigée | [next-config.test.ts](../../tests/unit/next-config.test.ts) ; [en-tetes.spec.ts](../../tests/e2e/en-tetes.spec.ts) |
| R78-R10 | Limite des Server Actions à 2 Mo, justifiée par l'ancienne taille d'une Note | basse | audit 7.8 | corrigée | [next-config.test.ts](../../tests/unit/next-config.test.ts) (1 Mo, valeur par défaut de Next.js, > 10 fois une Note ; 512 Ko proposés au triage) |
| R78-R11 | Focus du titre perdu après un clic sur l'écran courant dans le menu mobile | basse | audit 7.8 | corrigée | [mobile-nav-focus.test.tsx](../../tests/unit/mobile-nav-focus.test.tsx) |
| R78-R18 | Procédures de rotation absentes (clé `service_role`, mots de passe, révocation après fuite) | basse | audit 7.8 | corrigée | [guide-de-reprise.md](../guide-de-reprise.md) § 7 (story 7.6) |

R73-F12 est la même anomalie que D85 (une seule ligne, comptée une fois).
