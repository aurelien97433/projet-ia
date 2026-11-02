# Réconciliation énoncé du challenge ↔ PRD — NexaMind AI

Date : 2026-11-02. Sources : `input-challenge.md`, `prd.md`, `addendum.md`.
Légende des statuts : **couvert** · **partiel** · **exclu explicitement** (choix de périmètre documenté, pas une lacune) · **non couvert**.

## Tableau de réconciliation

### A. Besoins métier (problème décrit par l'énoncé)

| # | Attente de l'énoncé | Statut | Référence PRD | Remarque |
|---|---|---|---|---|
| 1 | Les collaborateurs perdent trop de temps à rechercher l'information | partiel | §1 Vision, §2.1 JTBD (« en quelques secondes »), UJ-1, NFR-3 | Le besoin est bien posé et NFR-3 fixe des temps de réponse techniques, mais aucun indicateur (§8) ne mesure le gain de temps côté utilisateur (ex. durée du parcours UJ-1). |
| 2 | Les réponses ne sont pas homogènes | couvert | §1 Vision, D1 (Base commune unique), FR-16 (signalement des contradictions), FR-17 (Sources), FR-23 (Résumé conservé et identique pour tous) | Bien traité : une seule source de vérité, réponses vérifiables, contradictions visibles. Aucun critère sur la stabilité d'une même question posée deux fois, ce qui reste acceptable pour un MVP. |
| 3 | Des connaissances importantes restent inexploitées | couvert | Base commune (§3), FR-4 à FR-6, FR-14, FR-3 (5 derniers Documents) ; §6.2 « suggestion proactive de ressources » | La mise en avant proactive est exclue explicitement ; la Recherche sémantique et l'Assistant suffisent à rendre le savoir exploitable. |
| 4 | Les nouveaux arrivants ont du mal à monter en compétence | partiel | §2.1 JTBD Nouvel arrivant, UJ-3, FR-3 (état vide invitant à poser une question), FR-19 | Le persona et le parcours existent, mais aucune fonction ni aucun indicateur ne lui est propre : rien n'aide un arrivant qui ne sait pas quoi demander (ex. exemples de questions). |
| 5 | Types de contenus cités : documents internes, notes de réunion, FAQ, procédures, fiches projets, comptes rendus clients, historiques de tâches, ressources métier | partiel | §3 Catégorie (7 valeurs), Jeu de démonstration (couvre les 7 Catégories) | Il n'y a pas de Catégorie « Historique de tâches », et les « documents internes » tombent implicitement dans « Autre ». §7 précise que l'outil ne gère pas de tâches, mais le rattachement de ces contenus n'est pas dit. |

### B. Capacités attendues de l'application

| # | Attente de l'énoncé | Statut | Référence PRD | Remarque |
|---|---|---|---|---|
| 6 | Centraliser les informations utiles | couvert | §1, §3 Base commune, FR-4 à FR-8, D1 | |
| 7 | Retrouver rapidement des ressources | couvert | FR-9 (recherche par titre, filtres), FR-14, FR-15, NFR-3, D4 | D4 justifie bien la Recherche sémantique distincte de l'Assistant. |
| 8 | Assistant conversationnel intelligent | couvert | FR-16 à FR-19, UJ-1, UJ-3 | |
| 9 | Exploiter une base vectorielle pour interroger les contenus de manière contextuelle | couvert | FR-14, FR-16 ; addendum « Chaîne RAG » et « Contexte technique » (pgvector) | Le PRD reste au niveau des capacités ; la base vectorielle est explicitée dans l'addendum, ce qui est cohérent. |
| 10 | Expérience **moderne** | partiel | NFR-6, NFR-7, §0 (conception UX à venir) | Aucune exigence ni aucun renvoi explicite ne porte sur la qualité visuelle, la cohérence de l'interface ou le rendu des réponses (listes, étapes). C'est délégué implicitement à la phase UX. |
| 11 | Expérience **fluide** | couvert | FR-16 (affichage progressif), FR-7 (Statut mis à jour sans action), NFR-3, NFR-4, FR-3 (accès en un clic) | Les états de chargement ne sont traités qu'indirectement, par NFR-4 (« pas de chargement infini »). |
| 12 | Expérience **sécurisée** | couvert | FR-1, FR-2, FR-13, FR-22, NFR-1, NFR-2, NFR-8, NFR-10, §4.1 « Limite assumée », §6.2 | Solide, y compris l'injection de consignes (NFR-10). L'inscription ouverte est un choix assumé et documenté. |
| 13 | « Application web fullstack » utilisable par le jury (mise en ligne, données de démonstration chargées) | non couvert | — (seul le §8 mentionne le Jeu de démonstration, comme outil de mesure) | Rien ne dit que l'application est déployée et accessible par URL, ni que le Jeu de démonstration est préchargé avec des comptes de démonstration. Ce point conditionne la « crédibilité globale du MVP ». |

### C. Fonctionnalités attendues (« un utilisateur authentifié peut… »)

| # | Attente de l'énoncé | Statut | Référence PRD | Remarque |
|---|---|---|---|---|
| 14 | Créer un compte et se connecter de manière sécurisée | couvert | FR-1, FR-2, NFR-1 ; §6.2 (réinitialisation du mot de passe, confirmation de l'e-mail, 2FA exclues) | Exclusions explicites et justifiées. |
| 15 | Accéder à un tableau de bord | couvert | FR-3 | |
| 16 | Ajouter des contenus | couvert | FR-4, FR-5, FR-6 (P2), FR-7 ; §6.2 autres formats exclus | |
| 17 | Organiser des contenus | couvert | §3 Catégorie, FR-9, FR-11 ; §6.2 (étiquettes, dossiers, création de Catégories exclues) | |
| 18 | Consulter des contenus | couvert | FR-10 | |
| 19 | Effectuer des recherches dans les ressources | couvert | FR-9 (titre), FR-14, FR-15 | |
| 20 | Dialoguer avec une IA connectée aux données de la plateforme | couvert | FR-16 à FR-19, §7 (pas de chatbot généraliste) | L'IA est branchée sur le contenu des Documents, pas sur leurs métadonnées. Une question comme « quels comptes rendus ont été ajoutés cette semaine ? » serait refusée (FR-18) sans que ce cas soit documenté. |
| 21 | Obtenir des réponses contextualisées grâce au RAG | couvert | FR-16, FR-17, FR-18 ; addendum « Chaîne RAG » | |
| 22 | Retrouver l'historique des échanges **ou** recherches | couvert (échanges) + exclu explicitement (recherches) | FR-20, FR-21, FR-22 ; §4.7 ; §4.5 et §6.2 (historique des recherches) | L'énoncé dit « ou » : l'arbitrage est explicite et défendable. |
| 23 | Gérer son espace ou ses contenus de manière structurée | couvert | FR-9 (filtre « Mes Documents »), FR-11, FR-12, FR-13 ; §6.2 (espaces privés ou équipes exclus) | |

### D. Dimension IA (« une ou plusieurs »)

| # | Attente de l'énoncé | Statut | Référence PRD | Remarque |
|---|---|---|---|---|
| 24 | Q/R sur base documentaire | couvert | FR-16 à FR-19, SM-1, SM-2 | |
| 25 | Résumé automatique | couvert | FR-23, SM-3 | |
| 26 | Reformulation intelligente | exclu explicitement | §6.2 « Autres fonctions IA » ; addendum « Évolutions » | Remarque : une reformulation interne existe déjà (addendum, questions de suivi FR-19). On peut la mentionner comme argument devant le jury sans en faire une fonctionnalité. |
| 27 | Suggestion de ressources pertinentes | exclu explicitement (forme proactive) | §6.2 ; partiellement servie par FR-14 | |
| 28 | Aide à la rédaction | exclu explicitement | §6.2 | |
| 29 | Extraction d'informations utiles | exclu explicitement | §6.2 | |
| 30 | Assistant métier alimenté par les données de l'application | couvert | FR-16, §4.6 | Voir la remarque n° 20 sur les métadonnées. |

### E. Dimension RAG et base vectorielle

| # | Attente de l'énoncé | Statut | Référence PRD | Remarque |
|---|---|---|---|---|
| 31 | Ingestion de contenus | couvert | FR-4 à FR-7 ; addendum chaîne étape 1 | |
| 32 | Structuration ou découpage | couvert | §3 Passage ; addendum chaîne étape 2 (position des Passages conservée) | |
| 33 | Vectorisation et indexation | couvert | addendum chaîne étape 3, pgvector ; NFR-9 (fournisseur de vectorisation) | Ce sujet est absent du PRD, comme attendu, puisque c'est une implémentation. |
| 34 | Recherche sémantique | couvert | FR-14, FR-15, SM-4 ; addendum étape 4 (seuil de pertinence) | |
| 35 | Injection de contexte dans le prompt | couvert | NFR-8 (Passages seulement), NFR-10 ; addendum étape 5 | |
| 36 | Génération d'une réponse contextualisée | couvert | FR-16, FR-17, FR-18 ; addendum étape 6 | |

### F. Idées qualitatives de l'énoncé (risque de perte dans la structure en FR)

| # | Attente de l'énoncé | Statut | Référence PRD | Remarque |
|---|---|---|---|---|
| 37 | « Véritable copilote métier intelligent » | partiel | §0 et §1 (« copilote documentaire »), §7 | Le PRD resserre volontairement l'ambition (copilote **documentaire**). C'est cohérent, mais la nuance n'est pas assumée explicitement face à la formule de l'énoncé : le jury peut y voir un écart. |
| 38 | « Comprendre les besoins de l'utilisateur » | partiel | FR-14 (langage naturel, sans les mots exacts), FR-19 (questions de suivi), UJ-3 | La compréhension est couverte par la formulation libre et le suivi. Le comportement face à une question ambiguë (demander une précision ou répondre sur plusieurs pistes) n'est ni exigé ni exclu. |
| 39 | « Pas seulement afficher des données », « produire des réponses utiles » | couvert | FR-16, FR-23, SM-1, SM-3 | L'utilité est mesurée par l'exactitude (SM-1), pas par la forme (réponse actionnable, étapes). |
| 40 | Ton et ressenti de l'Assistant (questions « même naïves », posture d'aide) | non couvert | §2.1 JTBD Nouvel arrivant (évoqué seulement) ; NFR-5 (langue uniquement) | Rien ne fixe le ton (professionnel, bienveillant, concis), le registre (tutoiement ou vouvoiement) ni la structure des réponses. C'est pourtant ce que le jury perçoit en premier pendant la démonstration. |
| 41 | Confiance et vérifiabilité comme ressenti recherché | couvert | §1 (« la promesse… est la confiance »), FR-17, FR-18, SM-C1 | C'est un point fort du PRD. |

### G. Critères d'évaluation ayant une traduction produit

| # | Attente de l'énoncé | Statut | Référence PRD | Remarque |
|---|---|---|---|---|
| 42 | Compréhension du besoin métier | couvert | §1, §2.1, UJ-1 à UJ-3 | Le PRD n'établit pas de traçabilité explicite entre les quatre douleurs de l'énoncé et les FR. Ce rapport peut en tenir lieu. |
| 43 | Cohérence du produit | couvert | §3 Glossaire, §6.1 priorités, §5 et §6 de cohérence avec les UJ et SM | Défaut de forme : le tableau « Priorités de livraison » (§6.1) a une double ligne d'en-tête qui casse son rendu. |
| 44 | Pertinence de la stack *(processus)* | couvert (trace) | addendum « Contexte technique déjà en place », NFR-9 | Trace suffisante, avec un renvoi explicite à une stack citée par l'énoncé. |
| 45 | Démarche Vibe Coding, usage de l'IA pour produire, corriger, améliorer *(processus)* | couvert (trace) | §0 (« réalisé en Vibe Coding », « implémentation assistée par IA ») | Cela relève du processus, pas du PRD. Le journal d'itérations à rendre au jury devra figurer dans un plan de rendu, pas ici. |
| 46 | Intégration réelle d'une fonctionnalité IA utile | couvert | FR-16 à FR-19, FR-23, SM-1 à SM-3 | |
| 47 | Logique RAG et base vectorielle | couvert | FR-14 à FR-18, addendum « Chaîne RAG » | Les Sources cliquables avec Passage mis en évidence (FR-17, FR-10) rendent le RAG visible pendant la démonstration, ce qui est un bon choix. |
| 48 | Qualité de l'UX | partiel | NFR-4, NFR-6, NFR-7, états vides (FR-3, FR-9) | Voir les n° 10 et 40 : il n'y a aucune exigence ni aucun renvoi formel sur la qualité perçue. |
| 49 | Crédibilité globale du MVP | partiel | SM-3, SM-C2, §6.1 (P0/P1/P2), §7, Jeu de démonstration | La stratégie de stabilité est excellente, mais la condition de mise en ligne manque (n° 13). |

**Totaux (49 attentes)** : 35 couvertes (dont 2 par simple trace de processus) · 8 partielles · 4 exclues explicitement (sans compter les exclusions complémentaires notées sur des lignes couvertes) · 2 non couvertes.

## Lacunes

### Bloquant

Aucune. Toutes les fonctionnalités attendues et toutes les étapes RAG sont couvertes ou exclues de façon argumentée.

### Important

1. **Mise en ligne et préparation de la démonstration absentes** (n° 13, 49).
   *Correction :* ajouter une NFR-11 « Disponibilité pour la démonstration » : l'application est déployée et accessible par une URL HTTPS au plus tard le 30/11/2026 ; le Jeu de démonstration y est préchargé ; au moins deux comptes de démonstration existent pour montrer SM-6 (cloisonnement A/B). Ajouter la tâche correspondante en §9 si l'hébergeur n'est pas choisi.

2. **Ton, registre et forme des réponses de l'Assistant non spécifiés** (n° 40, et en partie n° 37, 39).
   *Correction :* ajouter à FR-16 (ou une NFR « Voix de l'Assistant ») des critères vérifiables : ton professionnel et bienveillant, sans jugement sur les questions simples ; registre fixé (vouvoiement ou tutoiement, à choisir) ; réponse directe en premier puis détails ; procédures rendues en étapes numérotées ; mise en forme (listes, gras) affichée correctement dans l'interface.

3. **« Expérience moderne » et qualité UX sans ancrage** (n° 10, 48).
   *Correction :* ajouter une NFR « Qualité perçue » qui renvoie explicitement aux livrables UX à venir (DESIGN.md / EXPERIENCE.md), avec trois critères minimaux vérifiables : un indicateur de chargement sur toute action de plus d'une seconde ; un retour visuel après chaque action (ajout, suppression, enregistrement) ; une interface cohérente (mêmes composants, mêmes libellés du Glossaire) sur tous les écrans.

### Mineur

4. **Nouvel arrivant sans aide pour démarrer** (n° 4).
   *Correction :* compléter FR-3 : dans son état vide, le Tableau de bord propose 3 à 5 exemples de questions cliquables (statiques, sans appel IA). Le coût est faible et le gain est visible dans UJ-3.

5. **Gain de temps non mesuré** (n° 1).
   *Correction :* ajouter un indicateur secondaire SM-7 : « UJ-1, de la question à l'ouverture de la Source, se fait en moins de 30 secondes », ou bien rattacher explicitement NFR-3 au besoin de « perte de temps » dans §8.

6. **Questions sur les métadonnées non traitées** (n° 20, 30).
   *Correction :* ajouter en hors périmètre de §4.6 : « questions portant sur les métadonnées (auteurs, dates, listes de Documents) : l'Assistant ne répond qu'à partir du contenu des Documents ; ces besoins sont servis par la Bibliothèque (FR-9) ». Ajouter si besoin une question de ce type dans les 10 questions hors base de SM-2.

7. **Questions ambiguës** (n° 38).
   *Correction :* trancher en une ligne dans FR-16 ou en hors périmètre : soit l'Assistant peut demander une précision quand une question est trop vague, soit le cas est explicitement reporté.

8. **« Copilote métier » recadré sans le dire** (n° 37).
   *Correction :* ajouter une phrase au §1 qui assume le choix : « Le copilote métier de l'énoncé est abordé par son socle, le savoir documentaire ; les fonctions d'action et de rédaction viendront ensuite (§6.2). »

9. **Types de contenus « historiques de tâches » et « documents internes » sans rattachement** (n° 5).
   *Correction :* préciser dans le Glossaire, à l'entrée Catégorie, qu'un historique de tâches est classé en « Fiche projet » ou « Autre », ou ajouter une Catégorie dédiée.

10. **Tableau de priorités mal formé** (§6.1, n° 43).
    *Correction :* supprimer la première ligne d'en-tête et son séparateur (« | Priorité | Exigences | / |---|---| ») pour ne garder que l'en-tête à trois colonnes.
