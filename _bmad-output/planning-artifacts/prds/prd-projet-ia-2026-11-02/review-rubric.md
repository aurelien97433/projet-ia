# PRD Quality Review — NexaMind AI (prd-projet-ia-2026-11-02)

## Overall verdict

Le PRD est solide. La thèse de la « confiance » (§1) tient de bout en bout : refus explicites, Sources vérifiables, contre-indicateurs, priorisation P0/P1/P2 avec critères conditionnels. Presque toutes les FR ont des critères réellement testables et aucune exigence P0 ne dépend d'une exigence P1/P2 en dehors des critères conditionnels déclarés. Les risques restent localisés : le tableau des priorités du §6.1 est mal formé et perd la liste des exigences au rendu ; plusieurs contradictions internes de niveau moyen sont à lever avant l'UX et l'architecture (NFR-4 face à FR-7, NFR-8 face à FR-23, « Résumé automatique » face à FR-23, UJ-3 et sa « même Conversation »). Il faut aussi trancher la visibilité des Documents non *prêts* des autres Auteurs. Aucun point n'est strictement bloquant, mais il vaut mieux corriger le constat high et les constats medium avant le découpage en stories.

## Decision-readiness — strong

Les décisions sont formulées comme des décisions, avec leur coût. Exemples : l'inscription ouverte est présentée comme une « Limite assumée » qui n'est acceptable qu'avec des données fictives (§4.1). L'absence de confirmation par e-mail est justifiée par la fiabilité de la démonstration (FR-1). La règle de coupe est explicite : « on coupe d'abord P2, puis P1. On ne coupe jamais P0 » (§6.1). Les options écartées sont tracées dans l'addendum (D1 B/C, D4). Les deux Questions ouvertes (§9) sont réellement ouvertes et renvoyées à une phase précise.

Un seul angle mort de décision : le quota d'appels IA (NFR-8) introduit un comportement visible par l'utilisateur sans priorité ni valeur. Or ce quota peut directement gêner la mesure des SM et la démonstration devant le jury.

### Findings
- **[medium]** Quota IA : comportement fonctionnel sans FR, sans priorité et sans borne (§5 NFR-8, §10). Le refus « avec un message indiquant quand le quota sera rétabli » est une exigence fonctionnelle à part entière, absente du tableau des priorités. Avec une valeur trop basse, ce quota peut faire échouer SM-1 à SM-3 (30 questions, plus 3 passages de UJ-2) ou la démonstration. *Fix :* donner une priorité au comportement de quota (P0 ou P1) dans le tableau du §6.1 et fixer dès maintenant un plancher, par exemple « quota ≥ 60 appels par Collaborateur et par jour, suffisant pour mesurer SM-1 à SM-3 en une session ». Seule la valeur exacte resterait alors à fixer en architecture.

## Substance over theater — strong

Aucun élément décoratif notable. Les trois profils JTBD (§2.1) sont tous utilisés : le Collaborateur porte UJ-1, le Nouvel arrivant porte UJ-3 et motive FR-19, le rôle d'Auteur fonde FR-11 à FR-13. Les NFR sont spécifiques au produit et chiffrées : 375 px (NFR-6), WCAG AA et parcours au clavier (NFR-7), 2 000 caractères (NFR-8), consigne piège du Jeu de démonstration (NFR-10). La Vision (§1) est propre à NexaWorks et à son problème de savoir éparpillé ; elle n'est pas interchangeable.

### Findings
Aucun.

## Strategic coherence — strong

La thèse est explicite : « La promesse du MVP n'est pas l'étendue des fonctionnalités mais la **confiance** » (§1). Elle se traduit dans le texte : FR-18 (refus), FR-16 (contradictions signalées, aucun fait inventé), FR-17 (Sources), SM-2 qui interdit qu'un échec contienne un fait inventé, contre-indicateurs SM-C1 et SM-C2. La priorisation suit la thèse : le PDF (risque d'échec de lecture) passe en P2, la modification en P1. Le périmètre du MVP relève de l'« expérience », avec un parcours de démonstration (UJ-2 / SM-3).

### Findings
- **[low]** Deux promesses de la thèse ne sont mesurées par aucun SM (§8, FR-16, FR-19, UJ-3). Le moment de valeur de UJ-3 (les questions de suivi) et le signalement des contradictions (FR-16) ne reposent que sur un exemple unique. *Fix :* ajouter au Jeu de démonstration 3 scénarios de questions de suivi et le cas des Documents contradictoires, puis les rattacher à un SM (par exemple un SM-1 étendu ou un nouveau SM-7 « 3/3 suivis compris, contradiction signalée »).

## Done-ness clarity — adequate

C'est la meilleure partie du document. La plupart des FR ont des critères binaires et observables : FR-1 (8 caractères, message explicite), FR-9 (recherche partielle sans tenir compte des majuscules, tri par défaut), FR-12 (Source « Document supprimé » non cliquable), FR-13 et FR-22 (tentative directe refusée), FR-23 (5 points clés au plus, conservé, non régénéré). Les seuils de réussite sont reliés au Jeu de démonstration (SM-1, SM-2, SM-4). Il reste quelques critères ambigus ou non mesurables, et un vrai trou de spécification sur la visibilité des Documents non *prêts*.

### Findings
- **[medium]** Visibilité des Documents non *prêts* des autres Auteurs non définie (FR-3, FR-9, FR-10). FR-9 précise que « Mes Documents » inclut les Documents *en cours de traitement* ou *en erreur*, ce qui laisse supposer que la liste générale les exclut, sans le dire. On ne sait pas non plus si le Collaborateur B voit dans le Tableau de bord ou peut ouvrir un Document *en erreur* du Collaborateur A. Cela conditionne les écrans de la Bibliothèque et les règles d'accès aux données (addendum D1). *Fix :* ajouter un critère à FR-9, par exemple « La liste générale affiche tous les Documents, quel que soit leur Statut de traitement » ou « n'affiche que les Documents *prêts* des autres Auteurs ». Aligner ensuite FR-3 (5 derniers Documents) et FR-10.
- **[medium]** Contradiction entre NFR-4 et FR-7 sur la possibilité de réessayer (§5 NFR-4, FR-7). NFR-4 impose pour « toute défaillance (… fichier illisible …) » un message et « une possibilité de réessayer ». FR-7 interdit toute relance pour un fichier sans texte exploitable et réserve la relance à l'Auteur. En outre, « message compréhensible » est un adjectif, pas une borne. *Fix :* reformuler NFR-4 ainsi : « … affiche un message indiquant la cause et l'action possible (réessayer, ou, pour un fichier sans texte exploitable, supprimer puis importer un autre fichier, voir FR-7) ».
- **[medium]** Statut ambigu du critère de latence de FR-16. Le critère « en moins de 5 secondes (seuil indicatif, voir NFR-3) » figure parmi les critères vérifiables, alors que NFR-3 précise que ces seuils « ne constituent pas un engagement ». Une story ne saura pas si le critère passe ou échoue. *Fix :* soit retirer la latence de FR-16 et la laisser dans NFR-3 seulement, soit la rendre binaire, par exemple « médiane < 5 s sur les 20 questions de SM-1 ».
- **[medium]** FR-15 n'est mesuré que sur un exemple, et « suffisamment pertinent » n'est pas défini (FR-15, Glossaire « Jeu de démonstration »). Le Jeu ne contient que 10 requêtes de recherche, qui attendent toutes un résultat (SM-4). Aucune requête hors base ne teste la Recherche sémantique, alors que le même seuil de pertinence conditionne aussi FR-18 (addendum). *Fix :* ajouter au Jeu 5 requêtes de recherche hors base avec une cible, par exemple « au moins 4 sur 5 affichent le message d'absence de résultat », et l'intégrer à SM-4.
- **[low]** FR-17 : « Seuls des Documents réellement utilisés pour la réponse apparaissent en Source » n'est pas observable de l'extérieur. *Fix :* « Chaque Source citée contient un Passage qui étaye au moins une affirmation de la réponse (vérifié par relecture lors de SM-1) ».
- **[low]** FR-14 ne borne pas le nombre de résultats (« les Documents les plus pertinents »). L'UX en a besoin. *Fix :* « au plus 10 résultats ».
- **[low]** Le critère de FR-3 « Un Document ajouté par n'importe quel Collaborateur apparaît dans la liste des derniers Documents » n'est vrai que tant que ce Document fait partie des 5 plus récents. *Fix :* « … apparaît en tête de la liste des derniers Documents juste après son ajout ».
- **[low]** NFR-3 : l'unité « Document de 20 pages » n'a pas de sens pour une Note ou un fichier .txt, et le Jeu de démonstration ne garantit pas la présence d'un tel Document. *Fix :* exprimer le seuil en caractères (par exemple 60 000) et prévoir un Document de cette taille dans le Jeu.
- **[low]** SM-5 mesure des « fichiers .txt et .md valides du Jeu de démonstration » et des fichiers invalides (format non pris en charge, plus de 10 Mo, fichier vide). Or la définition du Jeu de démonstration (§3) ne mentionne que des Documents et des questions. *Fix :* compléter la définition : « … et un lot de fichiers de test (fichiers .txt/.md valides, un fichier vide, un fichier de plus de 10 Mo, un format non pris en charge) ».

## Scope honesty — strong

Le §6.2 justifie chaque exclusion (« indispensable avant tout usage avec de vraies données », « risque d'échec de lecture pour peu de valeur en démonstration »). Le §7 ferme les dérives (chatbot généraliste, gestion documentaire). Les critères conditionnels du §6.1 rendent explicites les dépendances P0 → P1/P2 : FR-17 et FR-23 dépendent de FR-11, les critères liés au PDF dépendent de FR-6. Une seule `[ASSUMPTION]` reste ouverte, ce qui convient pour un PRD destiné à lancer la réalisation. Aucune FR ne contredit le hors-périmètre.

### Findings
- **[low]** Renvois au §6.2 qui ne retrouvent pas leur cible (FR-2 « Hors périmètre », §4.3, §4.6). FR-2 renvoie au §6.2 pour « connexion via Google ou un autre fournisseur, double authentification », qui n'y figurent pas. De même, « import de plusieurs fichiers à la fois » (§4.3) ainsi que « limitation des réponses à une Catégorie, actions de l'Assistant sur les Documents, réponse vocale, pièces jointes » (§4.6) sont absents du §6.2. *Fix :* ajouter ces éléments au §6.2, ou retirer « (évolutions listées en §6.2) » de FR-2.
- **[low]** Tension entre le hors-périmètre « Versions de Documents et historique des modifications » (§6.2, §7) et le critère conditionnel de FR-17 sur une Note modifiée, qui suppose de détecter un changement de version (addendum : « référencer … une version du texte »). *Fix :* préciser au §6.2 « aucune version visible par les Collaborateurs ; un marqueur interne de modification reste nécessaire pour FR-17 et FR-23 ».

## Downstream usability — adequate

Le Glossaire (§3) est complet et majoritairement respecté. Les IDs sont contigus et les UJ ont des protagonistes nommés (Camille, Lucas). Les FR indiquent les UJ qu'elles réalisent (« Réalise UJ-n »). En revanche, le tableau des priorités, qui sert de base au découpage en epics, s'affiche mal. UJ-3 décrit aussi une transition qu'aucune FR ne couvre, et un terme de section contredit le Glossaire.

### Findings
- **[high]** Tableau des priorités mal formé (§6.1, « Priorités de livraison »). Le tableau commence par deux en-têtes successifs : `| Priorité | Exigences |` / `|---|---|`, puis `| Priorité | Nombre | Exigences |` / `|---|---|---|`. En Markdown standard, la table compte alors 2 colonnes et la 3ᵉ cellule de chaque ligne est ignorée : au rendu, la colonne « Exigences » disparaît, avec la liste des 20 FR P0. Les comptes sont pourtant justes (20 + 2 + 1, plus une partie de FR-10 = 23 FR). *Fix :* supprimer les deux premières lignes du tableau pour ne garder que l'en-tête à 3 colonnes.
- **[medium]** UJ-3 incohérent avec les FR (§2.3 UJ-3). Lucas passe de la Recherche sémantique à la lecture de la procédure RH, puis « pose plusieurs questions de suivi à l'Assistant dans la même Conversation ». Or aucune Conversation n'a été ouverte à ce stade, et aucune FR ne prévoit d'accéder à l'Assistant depuis un Document ou un résultat de recherche (FR-3 ne le permet que depuis le Tableau de bord). *Fix :* réécrire UJ-3, par exemple « … puis ouvre une nouvelle Conversation et pose une question, suivie de questions de suivi », ou ajouter à FR-16 un critère « un accès à une nouvelle Conversation est disponible depuis la page d'un Document » (avec une priorité explicite).
- **[medium]** « Résumé automatique » contredit le Glossaire et FR-23 (titre du §4.8, puce du §6.1). Le Glossaire définit le Résumé comme produit « à la demande » et FR-23 précise « jamais automatiquement à l'ajout ». *Fix :* renommer le §4.8 et la puce du §6.1 en « Résumé d'un Document ».
- **[low]** Collision de vocabulaire entre le type de Document « Note » et la Catégorie « Note de réunion » (§3). Une story ou un modèle de données peut les confondre, par exemple pour un Fichier importé de Catégorie « Note de réunion ». *Fix :* ajouter au Glossaire « Note désigne un type de Document, indépendant de la Catégorie Note de réunion », ou renommer la Catégorie (« Compte rendu de réunion ») si l'utilisateur le souhaite.
- **[low]** Un critère P0 est défini par analogie avec une exigence P2 (FR-5 : « comme un PDF sans texte (FR-6) »). Le comportement attendu est suffisamment décrit par ailleurs, mais la référence crée une dépendance apparente vers le P2. *Fix :* supprimer « comme un PDF sans texte (FR-6) ».

## Shape fit — adequate

La forme convient à un PRD en tête de chaîne pour un produit avec une vraie UX : 3 UJ avec protagonistes, FR avec critères, SM rattachés au Jeu de démonstration. La rigueur est proportionnée à un MVP réalisé en solo pour un jury. La séparation entre PRD et addendum est globalement tenue (Next.js, Supabase, chaîne RAG, décalages de Passages, reformulation des questions de suivi sont bien dans l'addendum). Il reste toutefois quelques formulations de mécanisme technique dans le PRD, dont une crée une contradiction.

### Findings
- **[medium]** NFR-8 décrit un mécanisme technique qui contredit FR-23. La phrase « seuls les Passages pertinents sont transmis au modèle, pas les Documents entiers » est une décision d'implémentation RAG. Prise au pied de la lettre, elle interdit le Résumé d'un Document (FR-23), qui doit porter sur le Document entier. *Fix :* remplacer dans le PRD par un résultat observable (« le coût d'une question ne dépend pas de la taille de la Base commune ») et déplacer le mécanisme dans l'addendum (section « Coûts »), en y précisant le traitement du Résumé, par exemple des Documents longs résumés par morceaux.
- **[low]** Formulations techniques résiduelles dans le PRD : « Elle utilise le même moteur que l'Assistant » (§4.5), « génération et vectorisation » (NFR-9), « clé d'administration de la base de données … versionnée dans le dépôt » (NFR-2), « côté serveur et au niveau des données » (NFR-1). *Fix :* reformuler en résultats observables (par exemple, NFR-1 : « vérifiable par les tentatives directes de FR-2, FR-13 et FR-22 ») et laisser le mécanisme dans l'addendum (D4 et « Points d'attention » le couvrent déjà).

## Mechanical notes

- **Rendu du tableau du §6.1 :** voir le constat high ci-dessus. Le décompte (P0 : 20, P1 : 2, P2 : 1 + une partie de FR-10) est exact et couvre les 23 FR.
- **Dépendances P0 → P1/P2 :** à part les critères conditionnels déclarés (FR-17 et FR-23 dépendant de FR-11, critères PDF dépendant de FR-6), aucune exigence P0 ne dépend d'une P1/P2. UJ-1 à UJ-3, SM-1 à SM-4 et SM-6 ne reposent bien que sur des exigences P0. SM-5 « Valide FR-5 à FR-7 » inclut FR-6 (P2), ce qui est couvert par la clause conditionnelle.
- **Continuité des IDs :** FR-1 à FR-23, UJ-1 à UJ-3, NFR-1 à NFR-10, SM-1 à SM-6 et SM-C1 à SM-C2 sont contigus et uniques. Dans l'addendum, les décisions sont numérotées D1 et D4 : D2 et D3 manquent. Renuméroter ou indiquer qu'elles ont été intégrées au PRD.
- **Renvois croisés :** tous les renvois FR/UJ/SM/NFR et les numéros de sections se résolvent. Seule exception : le renvoi de FR-2 vers le §6.2 (voir Scope honesty).
- **Dérives par rapport au Glossaire :**
  - « Résumé automatique » (§4.8, §6.1) contredit la définition du Glossaire.
  - « fiches projets » en minuscules (§7) alors que la Catégorie s'appelle « Fiche projet ».
  - « Auteur (rôle tenu par tout Collaborateur) » (§2.1) s'écarte de la définition du Glossaire (« Collaborateur qui a ajouté un Document »).
  - « utilisateur principal / secondaire » (§2.1), « Nouvel arrivant », « fournisseur d'IA », « message(s) » (FR-20), « requête » et « résultat de recherche » ne sont pas définis au Glossaire. Ajouter au moins « fournisseur d'IA » et « requête », ou les reformuler.
  - « fichier texte » (titre de FR-5) et « PDF texte » (FR-6, §6.1) sont des variantes non définies de « Fichier importé ».
  - « recherche » sans qualificatif (FR-2 « résultat de recherche », §4.7 « historique des recherches ») peut se confondre avec la recherche par titre de la Bibliothèque.
- **Récapitulatif du §6.1 :** la puce Bibliothèque omet le filtre « Mes Documents » (FR-9).
- **Aller-retour avec l'Index des hypothèses :** il est correct. Il y a une `[ASSUMPTION]` dans le texte (NFR-8) et une entrée dans l'index (§10).
- **Protagonistes des UJ :** tous sont nommés et contextualisés (Camille pour UJ-1 et UJ-2, Lucas pour UJ-3).
- **Sections requises :** toutes sont présentes pour les enjeux et le type de produit (Vision, utilisateurs, UJ, Glossaire, FR, NFR, périmètre, non-objectifs, SM et contre-indicateurs, questions ouvertes, hypothèses).
