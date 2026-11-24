# Plan de tests — NexaMind AI

État au 2026-11-24 (story 7.7). Ce document relie les parcours du produit et les risques connus aux tests qui les vérifient. Il est rédigé à partir des tests existants : aucun test n'a été ajouté pour l'écrire. Les anomalies et les reports encore ouverts sont dans le [bilan des anomalies](bilan-anomalies.md).

**Sources.** Parcours : [PRD §2.3](../../_bmad-output/planning-artifacts/prds/prd-projet-ia-2026-11-02/prd.md) ; risques : « Risque restant » des décisions AD-1 à AD-21 de l'[architecture](../../_bmad-output/planning-artifacts/architecture/architecture-projet-ia-2026-11-03/architecture-nexamind-ai.md) et indicateurs SM-1 à SM-6 du PRD (§8) ; commandes : [environnements.md](../environnements.md).

**Niveaux de test.**

| Niveau | Ce qu'il vérifie | Où | Volume |
|---|---|---|---|
| Unitaire | Une fonction ou un composant, isolé | Poste, Vitest ([tests/unit](../../tests/unit)) | 85 fichiers |
| Intégration | Base, règles d'accès (RLS) et fonctions serveur sur Supabase local | Poste, Vitest ([tests/integration](../../tests/integration)) | 21 fichiers |
| E2e local | L'application dans un vrai navigateur, à 1 280 px et à 375 px ; IA simulée | Poste, Playwright ([tests/e2e](../../tests/e2e)) | 22 fichiers |
| Live | Vraie IA et vraie base, sur le projet de démonstration | Production, scripts lancés par l'utilisateur seul | 8 commandes, rapports dans [docs/mesures](../mesures) |
| Manuel | Relecture humaine ou contrôle sur le site | Production | consigné dans les rapports |

Dernier passage complet (story 7.3, 2026-11-24) : e2e 407 réussis, 0 échec (19 ignorés : tests réservés à une seule largeur) ; Vitest 106 fichiers, 2 242 tests réussis ; `lint`, `tsc`, `build:ci` verts.

Les trois tests de parcours ([uj-1.spec.ts](../../tests/e2e/uj-1.spec.ts), [uj-2.spec.ts](../../tests/e2e/uj-2.spec.ts), [uj-3.spec.ts](../../tests/e2e/uj-3.spec.ts)) se jouent **au clavier seul**, aux deux largeurs, avec un contrôle d'accessibilité (axe, WCAG 2 A et AA) sur chaque écran et l'absence de défilement horizontal (NFR-6, NFR-7). Ils vérifient aussi que le navigateur n'appelle jamais OpenAI ni les fonctions Supabase directement.

## 1. Parcours UJ-1 — Camille retrouve une procédure

| Étape (PRD §2.3) | Tests | Niveau |
|---|---|---|
| Connectée, sur le Tableau de bord | [connexion.spec.ts](../../tests/e2e/connexion.spec.ts) (« bons identifiants : Tableau de bord ») ; [dashboard.spec.ts](../../tests/e2e/dashboard.spec.ts) | e2e local |
| Ouvre une nouvelle Conversation et pose « comment je relance un client qui n'a pas payé ? » | [uj-1.spec.ts](../../tests/e2e/uj-1.spec.ts) ; [assistant.spec.ts](../../tests/e2e/assistant.spec.ts) (« nominal », « clavier ») | e2e local |
| Réponse en quelques secondes, avec les étapes | [uj-1.spec.ts](../../tests/e2e/uj-1.spec.ts) (réponse simulée) ; [prompt.test.ts](../../tests/unit/prompt.test.ts) (procédure numérotée seulement si au moins deux étapes) ; délais réels : [indicateurs.md](../mesures/indicateurs.md) (premier affichage côté fonction : médiane 1,45 s) et [flux-vercel.md](../mesures/flux-vercel.md) (via Vercel : médiane 2,7 s) | e2e local, unitaire, live |
| Deux Sources sous la réponse ; un clic ouvre le Document au Passage | [uj-1.spec.ts](../../tests/e2e/uj-1.spec.ts) (« Procédure de facturation » et « FAQ comptabilité ») ; [source-panel.spec.ts](../../tests/e2e/source-panel.spec.ts) ; [document-page.spec.ts](../../tests/e2e/document-page.spec.ts) ; [citations.test.ts](../../tests/unit/citations.test.ts) | e2e local, unitaire |
| La Conversation reste dans l'Historique | [uj-1.spec.ts](../../tests/e2e/uj-1.spec.ts) ; [history.spec.ts](../../tests/e2e/history.spec.ts) | e2e local |
| Cas limite : « quel est le budget marketing 2027 ? » refusé, sans chiffre | [uj-1.spec.ts](../../tests/e2e/uj-1.spec.ts) ; [assistant.spec.ts](../../tests/e2e/assistant.spec.ts) (« hors base ») ; question h1 en réel : [indicateurs.md](../mesures/indicateurs.md) (SM-2, 10/10) et [assistant-live-2.md](../mesures/assistant-live-2.md) | e2e local, live |

**Trou de couverture (réel).** La question exacte d'UJ-1 n'est mesurée par aucun script live sur le Jeu complet. Le 2026-11-16, sur le mini Jeu, elle renvoyait « Guide des relances clients » et « FAQ comptabilité », pas « Procédure de facturation » (voir le bilan, N1). À vérifier pendant la répétition générale (7.5).

## 2. Parcours UJ-2 — Camille ajoute un compte rendu et l'interroge (parcours de démonstration, SM-3)

| Étape (PRD §2.3) | Tests | Niveau |
|---|---|---|
| « Ajouter » → Note : titre, Catégorie « Compte rendu client », texte collé | [uj-2.spec.ts](../../tests/e2e/uj-2.spec.ts) ; [ajouter.spec.ts](../../tests/e2e/ajouter.spec.ts) (« crée une Note », champs manquants, 100 Ko) | e2e local, live |
| *en cours de traitement* puis *prêt* dans la Bibliothèque | [uj-2.spec.ts](../../tests/e2e/uj-2.spec.ts) (*en cours* observé 3 fois sur 3 en production : [uj2-live.md](../mesures/uj2-live.md)) ; [document-status.spec.ts](../../tests/e2e/document-status.spec.ts) ; [library.spec.ts](../../tests/e2e/library.spec.ts) (« en cours puis prêt ») ; [process-document.test.ts](../../tests/integration/process-document.test.ts) | e2e local, intégration, live |
| Question sans les mots de la Note ; la réponse cite le nouveau Document | [uj-2.spec.ts](../../tests/e2e/uj-2.spec.ts) (en production : question u1, « 72 heures », Source = la Note créée) | e2e local, live |
| Génération du Résumé | [uj-2.spec.ts](../../tests/e2e/uj-2.spec.ts) ; [document-summary.spec.ts](../../tests/e2e/document-summary.spec.ts) ; [summary.test.ts](../../tests/integration/summary.test.ts) ; Résumés réels relus : [resume-live.md](../mesures/resume-live.md) | e2e local, intégration, live, manuel |
| Cas limite : .txt vide → *en erreur* avec message, puis suppression | [uj-2.spec.ts](../../tests/e2e/uj-2.spec.ts) ; [sm5.spec.ts](../../tests/e2e/sm5.spec.ts) (`vide.txt`) ; [delete-document.spec.ts](../../tests/e2e/delete-document.spec.ts) (« sans texte exploitable : suppression depuis le bandeau ») ; [file-decoding.test.ts](../../tests/integration/file-decoding.test.ts) | e2e local, intégration, live |
| Variante PDF scanné | Sans objet : FR-6 (PDF) est hors périmètre (décision du 2026-11-16) | — |
| Parcours complet 3 fois de suite (SM-3) | `npm run test:uj2:live` : 3 sur 3, de 35 à 49 s ([uj2-live.md](../mesures/uj2-live.md)) | live |

## 3. Parcours UJ-3 — Lucas, nouvel arrivant

| Étape (PRD §2.3) | Tests | Niveau |
|---|---|---|
| Crée son Compte | [uj-3.spec.ts](../../tests/e2e/uj-3.spec.ts) (par `/inscription`) ; [inscription.spec.ts](../../tests/e2e/inscription.spec.ts) ; [profiles-rls.test.ts](../../tests/integration/profiles-rls.test.ts) | e2e local, intégration |
| Recherche « organisation des congés » depuis le Tableau de bord ; Passage pertinent mis en avant | [uj-3.spec.ts](../../tests/e2e/uj-3.spec.ts) ; [search-page.spec.ts](../../tests/e2e/search-page.spec.ts) (« Passage pertinent ») ; [semantic-search.test.ts](../../tests/integration/semantic-search.test.ts) (même Requête, vecteurs simulés) | e2e local, intégration |
| Ouvre la procédure RH | [uj-3.spec.ts](../../tests/e2e/uj-3.spec.ts) ; [document-page.spec.ts](../../tests/e2e/document-page.spec.ts) | e2e local |
| Nouvelle Conversation, « comment poser mes congés ? », puis « et si je pose moins de 3 jours ? » | [uj-3.spec.ts](../../tests/e2e/uj-3.spec.ts) (réponse et Source exigées au suivi) ; [chat-function.test.ts](../../tests/unit/chat-function.test.ts) (reformulation) ; scénario f4 en réel : [suivi-live-2.md](../mesures/suivi-live-2.md) et [indicateurs.md](../mesures/indicateurs.md) | e2e local, unitaire, live |
| Le lendemain, rouvre la Conversation depuis l'Historique et la poursuit | [uj-3.spec.ts](../../tests/e2e/uj-3.spec.ts) ; [history.spec.ts](../../tests/e2e/history.spec.ts) (« rouvrir puis poursuivre ») | e2e local |

**Trou de couverture (réel).** La Requête « organisation des congés » n'est pas dans les 10 Requêtes mesurées en production (SM-4). Elle n'est testée qu'avec des vecteurs simulés. À vérifier pendant la répétition générale (7.5, bilan N1).

## 4. Risques et leur couverture

| Risque | Source | Couvert par | Niveau |
|---|---|---|---|
| Un intermédiaire de plus (Next.js) ralentit la Recherche et l'Assistant | AD-1 | [indicateurs.md](../mesures/indicateurs.md) (Recherche : médiane 572 ms, cible 3 s ; premier affichage côté fonction : 1,45 s, cible 5 s) ; [flux-vercel.md](../mesures/flux-vercel.md) (via Vercel : 2,7 s) | live |
| Fonctions Supabase appelées directement, sans passer par l'interface | AD-1 | [semantic-search.test.ts](../../tests/integration/semantic-search.test.ts) (401 sans jeton) ; [process-document.test.ts](../../tests/integration/process-document.test.ts) (401 sans secret, jeton de Collaborateur refusé) ; 9 routes en 401 sans session : [securite-live.md](../mesures/securite-live.md) | intégration, live |
| Une règle d'accès (RLS) oubliée | AD-2, SM-6 | [documents-rls.test.ts](../../tests/integration/documents-rls.test.ts), [passages-rls.test.ts](../../tests/integration/passages-rls.test.ts), [conversations-rls.test.ts](../../tests/integration/conversations-rls.test.ts), [profiles-rls.test.ts](../../tests/integration/profiles-rls.test.ts), [anon-access.test.ts](../../tests/integration/anon-access.test.ts), [delete-document.test.ts](../../tests/integration/delete-document.test.ts) (tous à deux Comptes) ; SM-6 en production : [securite-live.md](../mesures/securite-live.md) (3 critères sur 3) | intégration, live |
| Modèles hébergés hors UE | AD-3 | **Non couvert** : sans enjeu, les données sont fictives | — |
| Changement de modèle de vectorisation | AD-4 | [match-passages.test.ts](../../tests/integration/match-passages.test.ts) (autre modèle ou autre version jamais renvoyés). L'outil de re-vectorisation n'est pas couvert : hors MVP | intégration |
| Limites des fonctions du plan gratuit ; écriture finale à environ 3 s sous une limite de 8 s | AD-5 | [charge-100000-octets-2.md](../mesures/charge-100000-octets-2.md), [traitement-60000.md](../mesures/traitement-60000.md) (20 pages en 1,98 s) ; [ajouter.spec.ts](../../tests/e2e/ajouter.spec.ts) et [documents-rls.test.ts](../../tests/integration/documents-rls.test.ts) (100 000 octets acceptés, au-delà refusés). Marge non remesurée depuis le 2026-11-13 (bilan D46) | live, e2e local, intégration |
| Interrogation du Statut toutes les 3 s ; expiration à 3 min | AD-6 | [document-status.spec.ts](../../tests/e2e/document-status.spec.ts) (« interrogation toutes les 3 s », « expiration ») | e2e local |
| Fichiers déposés jamais importés | AD-7 | **Non couvert** : nettoyage non construit (bilan D38) | — |
| `.md` affiché avec ses symboles bruts ; balisage piégé | AD-8 | [document-reader.spec.ts](../../tests/e2e/document-reader.spec.ts) (« .md piège : aucune exécution ») | e2e local |
| Seuil de similarité 0,40 non calibré | AD-9, SM-4 | Calibrage sur 15 Documents : [indicateurs.md](../mesures/indicateurs.md) (0,40 gardé, marges 0,050 et 0,027) ; [match-passages.test.ts](../../tests/integration/match-passages.test.ts) (« seuil appliqué ») | live, intégration |
| Le marqueur retarde le premier affichage | AD-10 | [indicateurs.md](../mesures/indicateurs.md) (maximum 3,1 s côté fonction) ; [assistant.spec.ts](../../tests/e2e/assistant.spec.ts) (« réponse progressive ») | live, e2e local |
| Réponse sans citation valide (compte comme échec SM-1) | AD-11, SM-1 | [citations.test.ts](../../tests/unit/citations.test.ts) ; [assistant.spec.ts](../../tests/e2e/assistant.spec.ts) (« citation invalide ») ; SM-1 20/20 : [indicateurs.md](../mesures/indicateurs.md) | unitaire, e2e local, live |
| Reformulation des suivis : un appel de plus | AD-12 | [suivi-live-2.md](../mesures/suivi-live-2.md) (suivi : 2,1 à 2,3 s, contre 1,5 s au premier tour) ; [chat-function.test.ts](../../tests/unit/chat-function.test.ts) | live, unitaire |
| Injection de consignes par un Document | AD-13, NFR-10 | Document piège : 0 réponse sur 50 avec « 99 jours » ou « PERROQUET » ([indicateurs.md](../mesures/indicateurs.md)) ; Résumé du piège relu ([resume-live.md](../mesures/resume-live.md)) ; [prompt.test.ts](../../tests/unit/prompt.test.ts) (contenus = données) | live, manuel, unitaire |
| Quota contourné ; plafond global épuisé par des Comptes jetables | AD-14 | [chat.test.ts](../../tests/integration/chat.test.ts) (70 réservations simultanées : 60 acceptées ; plafond global jamais dépassé). L'épuisement volontaire par des Comptes jetables n'est **pas couvert** par un test : risque accepté (disponibilité seulement), procédure de remise à niveau dans [environnements.md](../environnements.md) ; à revoir en 7.8 | intégration |
| Crédit du fournisseur épuisé | AD-15 | [ai-generate.test.ts](../../tests/unit/ai-generate.test.ts) (`AI_BUDGET_EXHAUSTED`, sans nouvelle tentative). Surveillance du crédit avant la démonstration : non automatisée, portée par 7.9 | unitaire |
| Délais maximaux mal réglés | AD-16 | [flux-vercel.md](../mesures/flux-vercel.md) ; [assistant.spec.ts](../../tests/e2e/assistant.spec.ts) (« 20 s sans premier affichage ») ; [chat-function.test.ts](../../tests/unit/chat-function.test.ts) (délais sous horloge contrôlée) | live, e2e local, unitaire |
| Conversation réduite à une question en échec | AD-17 | [history.spec.ts](../../tests/e2e/history.spec.ts) (« Sans réponse ») | e2e local |
| Résumé bloqué 130 s ; double génération | AD-18 | [summary.test.ts](../../tests/integration/summary.test.ts) (« deux demandes simultanées » : un seul Résumé) | intégration |
| Forme d'erreur unique | AD-19 | Aucun risque restant déclaré | — |
| Secret publié par erreur | AD-20, NFR-2 | `npm run check:secrets` et [check-secrets.test.ts](../../tests/unit/check-secrets.test.ts) ; `build:ci` (code envoyé au navigateur) ; [securite-live.md](../mesures/securite-live.md) (0 constat sur 14 fichiers) | unitaire, build, live |
| Pause du projet ou limite d'hébergement inattendue | AD-21 | **Non couvert** par un test : seuils, alertes et repli portés par 7.9 | — |
| Réponses fausses ou faits inventés | SM-1 | `measure:all` : 20/20, 0 fait inventé, relu par l'utilisateur ([indicateurs.md](../mesures/indicateurs.md)) ; `test:chat:live` : 15/15, 3 essais par cas ([assistant-live-2.md](../mesures/assistant-live-2.md)). Un seul passage de `measure:all` | live, manuel |
| Refus manquants ou chiffres inventés | SM-2 | `measure:all` : 10/10, 0 information inventée ([indicateurs.md](../mesures/indicateurs.md)) ; [assistant.spec.ts](../../tests/e2e/assistant.spec.ts) (refus « information absente » et « hors cadre ») | live, e2e local |
| Démonstration UJ-2 qui échoue | SM-3 | [uj2-live.md](../mesures/uj2-live.md) : 3 sur 3 | live |
| Recherche qui rate le bon Document | SM-4 | `measure:all` : 10/10, hors base 4/4 sans résultat ([indicateurs.md](../mesures/indicateurs.md)) ; [recherche-live.md](../mesures/recherche-live.md) | live |
| Fichier valide refusé ou fichier invalide accepté | SM-5 | [sm5.spec.ts](../../tests/e2e/sm5.spec.ts) en production : 5/5 ([indicateurs.md](../mesures/indicateurs.md)) ; [ajouter-fichier.spec.ts](../../tests/e2e/ajouter-fichier.spec.ts) ; [file-import.test.ts](../../tests/integration/file-import.test.ts) | live, e2e local, intégration |
| Fuite entre Comptes | SM-6 | Voir AD-2 ci-dessus | intégration, live |

## 5. Vrais trous

Un vrai trou est une étape de parcours ou un risque de gravité haute sans **aucun** test ni mesure. **Aucun n'a été trouvé** : chaque étape des trois parcours a au moins un test e2e local, et les risques non couverts (AD-3, AD-7, AD-14 pour les Comptes jetables, AD-21) sont de gravité basse ou moyenne, avec une décision écrite. Aucun test n'a donc été ajouté.

Deux couvertures partielles sont inscrites au bilan (N1) : la question exacte d'UJ-1 et la Requête d'UJ-3 ne sont vérifiées qu'avec une IA simulée. Les ajouter aux scripts live demanderait un passage en production, réservé à l'utilisateur : elles sont confiées à la répétition générale (7.5).

## 6. Commandes de test

| Commande | Quoi | Où | Qui lance | Coût |
|---|---|---|---|---|
| `npm run lint`, `npx tsc --noEmit` | Style et types | Poste | Agent | Gratuit |
| `npm test` | Vitest : unitaires puis intégration | Poste (Supabase local) | Agent | Gratuit |
| `npm run test:e2e` | Playwright, deux largeurs, IA simulée | Poste (Supabase local) | Agent | Gratuit |
| `npm run check:secrets`, `npm run build:ci` | Secrets dans le dépôt et dans le code envoyé au navigateur | Poste, build Vercel | Agent | Gratuit |
| `npm run check:env` | Docker et CLI Supabase | Poste | Agent | Gratuit |
| `npm run test:ai` | Accès aux deux modèles OpenAI | Fonction locale, vraie clé | Utilisateur | Quasi nul |
| `npm run load:1mo` | Test de charge de la limite de taille | Poste ; `--remote` : production | Agent (local) ; utilisateur (`--remote`) | Gratuit ; moins de 0,001 $ |
| `npm run measure:search` | Calibrage de la Recherche (mini Jeu) | Poste et production (lecture) | Utilisateur | Quasi nul |
| `npm run test:search:live` | 10 Recherches réelles | Production | Utilisateur | Quasi nul |
| `npm run test:chat:live` | Questions réelles à l'Assistant, 3 essais par cas | Production | Utilisateur | Environ 0,09 $ (15 questions) |
| `npm run test:followup:live` | Questions de suivi réelles | Production | Utilisateur | Environ 0,08 $ ; 0,02 $ avec `--only` |
| `npm run test:summary:live` | 4 Résumés réels | Production | Utilisateur | Environ 0,02 $ |
| `npm run test:uj2:live` | UJ-2 complet, 3 fois (SM-3) | Production Vercel | Utilisateur | Environ 0,02 $, 6 unités de quota |
| `npm run test:security:live` | SM-6, routes sans session, code envoyé au navigateur | Production | Utilisateur | Aucune unité |
| `npm run measure:all` | Calibrage final, SM-1, SM-2, SM-4, SM-5 | Production (et vectorisation locale) | Utilisateur | Environ 0,30 $, 50 unités |

Les scripts live écrivent leur rapport dans [docs/mesures](../mesures), sans jamais écraser un rapport existant, et suppriment les données qu'ils créent.
