---
title: "PRD — NexaMind AI"
status: final
created: 2026-11-02
updated: 2026-11-03
---

# PRD — NexaMind AI

## 0. Objet du document

Ce PRD définit le MVP de NexaMind AI, le copilote documentaire de NexaWorks, réalisé en Vibe Coding dans le cadre d'un challenge évalué par un jury (rendu le 30/11/2026, réalisation en solo). Il sert de référence pour la suite du travail : conception UX, architecture, découpage en epics et stories, puis implémentation assistée par IA.

Il décrit des **capacités**, pas une implémentation. Les éléments techniques déjà connus (Next.js, Supabase) sont consignés dans `addendum.md`. Le vocabulaire est fixé par le Glossaire (§3) et utilisé tel quel dans tout le document. Les fonctionnalités (§4) regroupent des exigences fonctionnelles numérotées (FR-n), chacune accompagnée de critères vérifiables. Les hypothèses non confirmées sont marquées `[ASSUMPTION]` et récapitulées en §10.

Source d'entrée : l'énoncé du challenge NexaMind AI (`input-challenge.md`). Il n'existe ni brief ni maquette à ce stade.

## 1. Vision

Chez NexaWorks, le savoir de l'entreprise est éparpillé : procédures, FAQ, notes de réunion, fiches projets, comptes rendus clients. Les Collaborateurs perdent du temps à le chercher, obtiennent des réponses différentes selon la personne qu'ils interrogent, et les nouveaux arrivants dépendent de leurs collègues pour la moindre question.

NexaMind AI réunit ce savoir dans une **Base commune** et le rend interrogeable en langage naturel. Un Collaborateur ajoute un Document en une minute. N'importe quel autre Collaborateur peut ensuite poser une question avec ses propres mots et obtenir une réponse rédigée à partir des Documents de l'entreprise, accompagnée de **Sources** cliquables qui permettent de vérifier. Quand l'information n'existe pas dans la Base commune, l'Assistant le dit clairement au lieu d'inventer.

La promesse du MVP n'est pas l'étendue des fonctionnalités mais la **confiance** : un parcours court, stable et vérifiable, de l'ajout d'un Document jusqu'à une réponse sourcée.

## 2. Utilisateurs cibles

### 2.1 Jobs To Be Done

- **Collaborateur NexaWorks (utilisateur principal)** — « Quand j'ai besoin d'une information interne (une procédure, une décision prise en réunion, un détail sur un client), je veux l'obtenir en quelques secondes et pouvoir vérifier d'où elle vient, pour agir sans déranger un collègue ni me tromper. »
- **Nouvel arrivant (utilisateur secondaire)** — « Pendant mes premières semaines, je veux poser mes questions librement, même naïves, et obtenir des réponses fiables, pour monter en compétence sans solliciter sans cesse mon équipe. »
- **Auteur (tout Collaborateur, dès qu'il ajoute un Document)** — « Quand je rédige ou reçois un document utile, je veux l'ajouter en une minute pour qu'il profite à toute l'équipe. »

### 2.2 Non-utilisateurs du MVP

- Les clients de NexaWorks : l'application est strictement interne.
- Les administrateurs ou éditeurs dotés de droits étendus : aucun rôle de ce type n'existe dans le MVP (voir §6.2).

### 2.3 Parcours utilisateurs clés

- **UJ-1. Camille retrouve une procédure sans déranger personne.**
  - **Persona + contexte :** Camille, cheffe de projet, doit relancer un client pour une facture impayée et ne se souvient plus de la marche à suivre.
  - **État d'entrée :** déjà connectée, sur le Tableau de bord.
  - **Parcours :** elle ouvre une nouvelle Conversation et écrit « comment je relance un client qui n'a pas payé ? ». L'Assistant répond en quelques secondes avec les étapes de la procédure de relance.
  - **Moment de valeur :** sous la réponse, deux Sources (« Procédure de facturation », « FAQ comptabilité ») ; un clic ouvre le Document au Passage concerné et elle vérifie le délai exact.
  - **Résolution :** elle applique la procédure ; la Conversation reste dans son Historique.
  - **Cas limite :** elle demande « quel est le budget marketing 2027 ? » ; l'Assistant répond qu'il ne trouve pas cette information dans la Base commune et ne propose aucun chiffre.

- **UJ-2. Camille ajoute un compte rendu et l'interroge aussitôt.** *(parcours de démonstration)*
  - **Persona + contexte :** à la sortie d'une réunion client, Camille veut que l'équipe en profite.
  - **État d'entrée :** connectée.
  - **Parcours :** elle clique sur « Ajouter », choisit Note, saisit un titre, sélectionne la Catégorie « Compte rendu client » et colle son texte. Le Document apparaît dans la Bibliothèque avec le Statut de traitement *en cours de traitement*, puis passe à *prêt*.
  - **Moment de valeur :** elle pose une question formulée sans reprendre les mots de sa note ; la réponse cite son nouveau Document comme Source.
  - **Résolution :** elle génère le Résumé du Document ; ses collègues le retrouveront en ouvrant le Document.
  - **Cas limite :** elle importe par erreur un fichier .txt vide ; le Document passe *en erreur* avec un message expliquant qu'aucun texte exploitable n'a été trouvé, et elle le supprime. *Variante, uniquement si FR-6 est livré :* le même cas avec un PDF scanné.

- **UJ-3. Lucas, nouvel arrivant, découvre les usages de l'entreprise.**
  - **Persona + contexte :** Lucas, arrivé lundi, ne sait pas encore où se trouve quoi.
  - **État d'entrée :** il vient de créer son Compte.
  - **Parcours :** depuis le Tableau de bord, il tape dans la Recherche sémantique « organisation des congés ». Il obtient une liste de Documents avec le Passage pertinent mis en avant et ouvre la procédure RH. Il ouvre ensuite une nouvelle Conversation, demande à l'Assistant comment poser ses congés, puis enchaîne des questions de suivi dans cette Conversation (« et si je pose moins de 3 jours ? »).
  - **Moment de valeur :** les questions de suivi sont comprises sans qu'il ait à tout reformuler.
  - **Résolution :** le lendemain, il rouvre la Conversation depuis son Historique et la poursuit.

## 3. Glossaire

- **Visiteur** — Personne non connectée. Ne peut que créer un Compte ou se connecter.
- **Collaborateur** — Personne disposant d'un Compte sur NexaMind AI. Tous les Collaborateurs ont les mêmes droits.
- **Compte** — Identité de connexion d'un Collaborateur (adresse e-mail + mot de passe).
- **Document** — Unité de contenu de la Base commune : une Note ou un Fichier importé. Possède un titre, une Catégorie, un Auteur, une date d'ajout et un Statut de traitement.
- **Note** — Document rédigé directement dans l'application (titre + texte). « Note » désigne un type de Document, indépendant de la Catégorie « Note de réunion » : une Note peut avoir n'importe quelle Catégorie.
- **Fichier importé** — Document créé à partir d'un fichier .txt, .md ou PDF contenant du texte sélectionnable.
- **Auteur** — Collaborateur qui a ajouté un Document. Seul l'Auteur peut modifier ou supprimer ce Document.
- **Catégorie** — Classement unique et obligatoire d'un Document, choisi dans la liste fixe : Procédure, FAQ, Note de réunion, Fiche projet, Compte rendu client, Ressource métier, Autre.
- **Statut de traitement** — État d'un Document : *en cours de traitement*, *prêt* ou *en erreur*. Seul un Document *prêt* est interrogeable.
- **Base commune** — Ensemble des Documents de tous les Collaborateurs. L'Assistant et la Recherche sémantique portent sur ses Documents *prêts*.
- **Bibliothèque** — Écran listant les Documents de la Base commune, avec filtre par Catégorie, filtre « Mes Documents », recherche par titre et tri par date d'ajout.
- **Passage** — Extrait d'un Document identifié comme pertinent pour une question ou une requête.
- **Recherche sémantique** — Recherche par le sens dans la Base commune : renvoie des Documents et leurs Passages, sans réponse rédigée.
- **Assistant** — Agent conversationnel qui répond aux questions des Collaborateurs uniquement à partir des Passages trouvés dans la Base commune.
- **Conversation** — Suite de questions d'un Collaborateur et de réponses de l'Assistant. Privée à son Collaborateur.
- **Source** — Référence cliquable vers un Document (et son Passage) utilisé par l'Assistant pour produire une réponse.
- **Historique** — Liste des Conversations d'un Collaborateur.
- **Résumé** — Synthèse courte d'un Document produite par l'IA à la demande.
- **Tableau de bord** — Écran d'accueil après connexion.
- **Requête** — Texte saisi par un Collaborateur dans la Recherche sémantique (à distinguer d'une question posée à l'Assistant).
- **Fournisseur d'IA** — Service externe qui fournit les modèles utilisés par l'Assistant, la Recherche sémantique et le Résumé.
- **Jeu de démonstration** — 10 à 15 Documents fictifs de NexaWorks couvrant les 7 Catégories, 20 questions dont la réponse figure dans la Base commune, 10 questions hors base et 10 requêtes de Recherche sémantique, ainsi qu'un lot de fichiers de test (fichiers .txt et .md valides, un fichier vide, un fichier .txt ou .md de plus de 1 Mo, un fichier d'un format non pris en charge). Inclut au moins deux Documents qui se contredisent sur un point (FR-16) et un Document contenant une consigne piège (NFR-10). Sert à mesurer les indicateurs du §8.

## 4. Fonctionnalités

### 4.1 Comptes et accès

**Description :** un Collaborateur crée un Compte avec son e-mail et un mot de passe, puis se connecte. Toutes les pages de l'application, sauf la création de Compte et la connexion, exigent d'être connecté. L'inscription est ouverte, sans invitation ni restriction de domaine e-mail.

**Limite assumée :** ce choix n'est acceptable que parce que le MVP fonctionne exclusivement avec des données fictives. Un usage réel avec les documents de NexaWorks exigerait des inscriptions sur invitation ou restreintes au domaine e-mail de l'entreprise (voir §6.2).

**Exigences fonctionnelles :**

#### FR-1 : Créer un Compte

Un Visiteur peut créer un Compte avec une adresse e-mail et un mot de passe. Réalise UJ-3.

**Critères vérifiables :**
- La création avec un e-mail valide et un mot de passe d'au moins 8 caractères aboutit et donne accès immédiatement au Tableau de bord, sans confirmation par e-mail (choix fait pour fiabiliser la démonstration).
- Un e-mail déjà utilisé, un e-mail mal formé ou un mot de passe trop court affiche un message d'erreur explicite, sans créer de Compte.

#### FR-2 : Se connecter et se déconnecter

Un Collaborateur peut se connecter avec son e-mail et son mot de passe, rester connecté entre deux visites et se déconnecter.

**Critères vérifiables :**
- Des identifiants valides mènent au Tableau de bord ; des identifiants invalides affichent un message d'erreur qui ne précise pas lequel des deux champs est faux.
- Après fermeture puis réouverture du navigateur, le Collaborateur est toujours connecté, tant qu'il ne s'est pas déconnecté.
- Après déconnexion, l'accès direct à une page protégée par son URL redirige vers la page de connexion.
- Un Visiteur ne peut obtenir aucune donnée (Document, Conversation, résultat de Recherche sémantique), y compris en appelant directement l'application.

**Hors périmètre :** confirmation de l'e-mail à l'inscription, réinitialisation du mot de passe, connexion via Google ou un autre fournisseur, double authentification (voir §6.2).

### 4.2 Tableau de bord

**Description :** point d'entrée après connexion. Il donne accès en un clic aux trois actions clés (ajouter un Document, rechercher, poser une question) et montre l'activité récente.

#### FR-3 : Consulter le Tableau de bord

Un Collaborateur connecté accède à un Tableau de bord présentant : un accès à l'ajout d'un Document, un champ de Recherche sémantique, un accès à une nouvelle Conversation, les 5 derniers Documents ajoutés à la Base commune (quel que soit leur Statut de traitement, comme dans la Bibliothèque) et ses 5 dernières Conversations. Réalise UJ-1, UJ-3.

**Critères vérifiables :**
- Juste après son ajout, un Document ajouté par n'importe quel Collaborateur apparaît en tête de la liste des derniers Documents.
- Les Conversations affichées sont uniquement celles du Collaborateur connecté.
- Chaque élément listé ouvre le Document ou la Conversation correspondant.
- Pour un nouveau Collaborateur sans Conversation, le Tableau de bord affiche un état vide qui invite à poser une première question.

### 4.3 Ajout et traitement des Documents

**Description :** tout Collaborateur peut alimenter la Base commune. À l'ajout, le Document est traité pour devenir interrogeable ; son Statut de traitement est visible à tout moment. Les formats sont livrés dans cet ordre : Note, puis fichiers .txt et .md, puis PDF. Réalise UJ-2.

#### FR-4 : Créer une Note

Un Collaborateur peut créer une Note en saisissant un titre, une Catégorie et un texte.

**Critères vérifiables :**
- Une Note ne peut pas être enregistrée sans titre, sans Catégorie ou avec un texte vide.
- Une Note enregistrée passe au Statut de traitement *prêt* puis peut être interrogée par l'Assistant et retrouvée par la Recherche sémantique.

#### FR-5 : Importer un fichier .txt ou .md

Un Collaborateur peut importer un fichier .txt ou .md en lui attribuant une Catégorie. Le titre est prérempli avec le nom du fichier et reste modifiable.

**Critères vérifiables :**
- Un fichier .txt ou .md valide de 1 Mo au plus (1 Mo = 1 000 000 octets ; environ 330 pages ; limite fixée le 2026-11-03 pour rester dans les limites de l'hébergement gratuit) passe au Statut de traitement *prêt* puis peut être interrogé par l'Assistant.
- Un fichier .txt ou .md vide (ou ne contenant que des espaces) est traité comme un fichier sans texte exploitable : il passe au Statut de traitement *en erreur* avec un message explicite.
- Le titre est prérempli avec le nom du fichier (sans extension) et peut être modifié avant l'enregistrement.
- L'import est impossible sans Catégorie.

#### FR-6 : Importer un PDF contenant du texte

Un Collaborateur peut importer un PDF contenant du texte sélectionnable, dans les mêmes conditions que FR-5.

**Critères vérifiables :**
- Un PDF valide contenant du texte, de 10 Mo au plus (limite à confirmer au lancement de FR-6), passe au Statut de traitement *prêt* puis peut être interrogé par l'Assistant.
- Un PDF sans texte exploitable (scanné, protégé ou vide) passe au Statut de traitement *en erreur* avec un message explicite et n'est donc jamais interrogeable (FR-8).

#### FR-7 : Suivre le Statut de traitement et gérer les refus

Chaque Document affiche son Statut de traitement : *en cours de traitement*, *prêt* ou *en erreur*.

**Critères vérifiables :**
- Le Statut de traitement est visible dans la Bibliothèque et sur la page du Document, et se met à jour sans action du Collaborateur.
- Un fichier d'un format non pris en charge ou dépassant la taille maximale (1 Mo pour les .txt et .md) est refusé avant traitement avec un message indiquant les formats acceptés ou la taille maximale.
- Un Document *en erreur* affiche la raison de l'erreur, en distinguant deux cas :
  - **erreur temporaire** (par exemple Fournisseur d'IA indisponible) : l'Auteur peut relancer le traitement ; si la relance réussit, le Document passe *en cours de traitement* puis *prêt* ;
  - **fichier sans texte exploitable** (fichier .txt ou .md vide ; PDF scanné, protégé ou vide si FR-6 est livré) : aucune relance n'est proposée ; l'Auteur peut supprimer le Document (FR-12).
- Un Collaborateur qui n'est pas l'Auteur ne voit pas l'action de relance.
- Un traitement qui n'a pas abouti 3 minutes après son début passe *en erreur* temporaire, avec un message invitant l'Auteur à le relancer. Ce Statut est le même pour tous les Collaborateurs et reste exact après un rechargement. Un traitement qui aboutirait plus tard ne rend pas le Document *prêt* : seule une relance le peut (délai fixé en architecture, AD-5 et AD-6).

#### FR-8 : N'interroger que les Documents prêts

Seuls les Documents au Statut de traitement *prêt* sont utilisés par l'Assistant, la Recherche sémantique et le Résumé.

**Critères vérifiables :**
- Un Document *en cours de traitement* ou *en erreur* n'apparaît jamais dans les résultats de la Recherche sémantique ni dans les Sources de l'Assistant.
- La génération d'un Résumé n'est pas proposée pour un tel Document (voir FR-23).

**Hors périmètre :** PDF scannés et OCR, fichiers Word, PowerPoint et Excel, images, audio, vidéo, imports depuis des outils externes (Google Drive, Notion, etc.), import de plusieurs fichiers à la fois.

### 4.4 Bibliothèque et gestion des Documents

**Description :** la Bibliothèque est la vue structurée de la Base commune. Tout Collaborateur consulte tous les Documents ; seul l'Auteur peut modifier ou supprimer les siens.

#### FR-9 : Parcourir la Bibliothèque

Un Collaborateur peut lister tous les Documents de la Base commune, quel que soit leur Statut de traitement, les filtrer par Catégorie, afficher uniquement ses propres Documents (filtre « Mes Documents »), les rechercher par titre et les trier par date d'ajout.

**Critères vérifiables :**
- Chaque ligne affiche le titre, la Catégorie, l'Auteur, la date d'ajout et le Statut de traitement.
- Le filtre par Catégorie n'affiche que les Documents de cette Catégorie.
- Le filtre « Mes Documents » n'affiche que les Documents dont le Collaborateur connecté est l'Auteur, y compris ceux *en cours de traitement* ou *en erreur* ; pour un Collaborateur qui n'a encore rien ajouté, il affiche un état vide invitant à ajouter un Document.
- Une recherche par titre retrouve le Document correspondant, même si seule une partie du titre est saisie, sans tenir compte des majuscules.
- Le tri par date d'ajout fonctionne dans les deux sens ; par défaut, les plus récents d'abord.

#### FR-10 : Consulter un Document

Un Collaborateur peut ouvrir un Document et lire son contenu textuel avec ses informations (titre, Catégorie, Auteur, date d'ajout, Statut de traitement). Pour un Fichier importé, il peut aussi télécharger le fichier d'origine (priorité P2, voir §6.1).

**Critères vérifiables :**
- Un Document ajouté par le Collaborateur A est visible par le Collaborateur B.
- *(P2)* Pour un Fichier importé, le téléchargement renvoie un fichier identique à celui importé ; il n'est accessible qu'à un Collaborateur connecté.
- Ouvert depuis une Source ou un résultat de recherche, le Document est affiché au niveau du Passage concerné, qui est mis en évidence.

#### FR-11 : Modifier son Document

L'Auteur peut modifier le titre et la Catégorie de son Document, ainsi que le texte s'il s'agit d'une Note. Le remplacement du fichier d'un Fichier importé n'est pas prévu : il suffit de le supprimer et d'en importer un nouveau.

**Critères vérifiables :**
- Une modification de Catégorie est immédiatement visible dans la Bibliothèque.
- Après modification du texte d'une Note, le Document repasse *en cours de traitement* puis *prêt* ; l'Assistant répond ensuite à partir du nouveau texte.

#### FR-12 : Supprimer son Document

L'Auteur peut supprimer son Document après confirmation.

**Critères vérifiables :**
- Annuler la confirmation laisse le Document intact.
- Un Document supprimé disparaît de la Bibliothèque, de la Recherche sémantique et des réponses futures de l'Assistant.
- Dans une Conversation existante, une Source pointant vers un Document supprimé reste affichée mais est signalée comme « Document supprimé » et n'est plus cliquable.

#### FR-13 : Protéger les Documents des autres Auteurs

Un Collaborateur qui n'est pas l'Auteur d'un Document ne peut ni le modifier ni le supprimer.

**Critères vérifiables :**
- Les actions de modification et de suppression ne sont pas proposées au Collaborateur B sur un Document du Collaborateur A.
- Une tentative directe de B (par exemple en appelant l'application sans passer par l'interface) de modifier ou supprimer le Document de A est refusée et le Document reste inchangé.

### 4.5 Recherche sémantique

**Description :** le Collaborateur décrit ce qu'il cherche avec ses propres mots et retrouve les Documents pertinents, sans réponse rédigée par l'IA. Elle retrouve les mêmes Passages que ceux sur lesquels l'Assistant s'appuierait (décision D4, voir addendum). Réalise UJ-3.

#### FR-14 : Rechercher par le sens

Un Collaborateur peut saisir une requête en langage naturel et obtenir les Documents les plus pertinents de la Base commune, classés par pertinence.

**Critères vérifiables :**
- Une requête formulée sans les mots exacts d'un Document retrouve ce Document parmi les 3 premiers résultats. Taux de réussite évalué sur le Jeu de démonstration via SM-4 (au moins 8 requêtes sur 10).
- Chaque résultat affiche le titre, la Catégorie et le Passage concerné mis en évidence, et ouvre le Document au niveau de ce Passage au clic.
- Un même Document n'apparaît qu'une fois dans la liste, même si plusieurs de ses Passages sont pertinents.
- Le résultat ne contient aucun texte rédigé par l'IA.

#### FR-15 : Signaler l'absence de résultat pertinent

Quand aucun Passage n'est suffisamment pertinent, l'application l'indique clairement.

**Critères vérifiables :**
- Une requête sans lien avec la Base commune (ex. « recette de la tarte aux pommes ») affiche un message d'absence de résultat pertinent plutôt qu'une liste de résultats sans rapport.

**Hors périmètre :** recherche hybride (mots-clés + sens), filtres avancés, historique des recherches.

### 4.6 Assistant

**Description :** cœur du produit. Le Collaborateur pose une question en langage naturel ; l'Assistant retrouve les Passages pertinents dans la Base commune et rédige une réponse fondée uniquement sur eux, en citant ses Sources. S'il ne trouve rien de suffisant, il le dit. Réalise UJ-1, UJ-2, UJ-3.

#### FR-16 : Poser une question et obtenir une réponse contextualisée

Un Collaborateur peut poser une question dans une Conversation et obtenir une réponse en français rédigée à partir des Passages de la Base commune.

**Critères vérifiables :**
- Pour une question dont la réponse figure dans un Document, la réponse contient l'information correcte de ce Document. Taux de réussite évalué sur le Jeu de démonstration via SM-1 (au moins 16 questions sur 20).
- La réponse s'affiche progressivement, au fur et à mesure de sa rédaction (délai indicatif : voir NFR-3).
- La réponse n'introduit aucun fait absent des Passages utilisés ; les faits inventés sont relevés à chaque mesure de SM-1 et SM-2.
- Lorsque des Passages utilisés se contredisent (par exemple deux délais différents pour la même procédure), la réponse signale la contradiction et cite les Sources concernées, sans retenir arbitrairement l'une des versions.

#### FR-17 : Citer des Sources cliquables

Chaque réponse fondée sur la Base commune affiche les Sources utilisées.

**Critères vérifiables :**
- Chaque réponse fondée sur la Base commune affiche au moins une Source, avec le titre du Document.
- Un clic sur une Source ouvre le Document au niveau du Passage utilisé, mis en évidence.
- Chaque Source citée contient un Passage qui étaye au moins une affirmation de la réponse (vérifié par relecture lors de la mesure de SM-1).
- *(Applicable une fois FR-11 livré.)* Si la Source renvoie à une Note dont le texte a été modifié depuis la réponse, le clic ouvre le Document sans mise en évidence de Passage, avec un message indiquant que son contenu a changé depuis la réponse.
- Une réponse dont aucune citation ne renvoie à un Passage réellement fourni à l'Assistant n'est ni affichée ni enregistrée : le Collaborateur voit un message d'échec avec « Réessayer », et le quota n'est pas décompté. Les citations invalides d'une réponse par ailleurs sourcée sont retirées. Ce cas compte comme un échec pour SM-1 (AD-11).

#### FR-18 : Reconnaître l'absence d'information

Quand la Base commune ne contient pas l'information demandée, l'Assistant le dit explicitement au lieu d'inventer une réponse.

**Critères vérifiables :**
- Pour une question dont la réponse ne figure dans aucun Document, l'Assistant répond qu'il ne trouve pas l'information dans la Base commune, sans fournir de réponse inventée ni de Source. Taux de réussite évalué sur le Jeu de démonstration via SM-2 (au moins 9 questions sur 10).
- Pour une question hors du cadre de l'entreprise (culture générale, demande personnelle), l'Assistant indique qu'il répond uniquement à partir des Documents de NexaWorks.
- Un refus s'affiche d'un seul bloc, jamais rédigé progressivement, et se distingue d'une panne technique : une panne affiche un message d'erreur avec « Réessayer » et ne décompte pas le quota (AD-10).

#### FR-19 : Poser des questions de suivi

Dans une même Conversation, un Collaborateur peut poser des questions de suivi qui s'appuient sur les échanges précédents.

**Critères vérifiables :**
- Après « Quelle est la procédure de relance client ? », la question « Et après combien de jours ? » obtient une réponse portant sur la même procédure, sans reformulation complète.

**Hors périmètre :** limitation des réponses à une Catégorie, actions de l'Assistant sur les Documents (création, modification), réponse vocale, pièces jointes dans la Conversation.

### 4.7 Historique des Conversations

**Description :** les Conversations sont conservées pour être retrouvées et poursuivies. Elles sont strictement privées. Elles couvrent à elles seules l'exigence d'historique du challenge, qui porte sur « les échanges ou recherches » : l'historique des recherches n'est pas conservé.

#### FR-20 : Retrouver et poursuivre une Conversation

Un Collaborateur peut consulter son Historique, rouvrir une Conversation et la poursuivre.

**Critères vérifiables :**
- Chaque Conversation est enregistrée automatiquement, avec un titre tiré de la première question, et listée de la plus récente à la plus ancienne.
- Une Conversation rouverte affiche tous ses messages et Sources ; une nouvelle question y tient compte des échanges précédents (FR-19).
- L'Historique est conservé après déconnexion et reconnexion.

#### FR-21 : Supprimer une Conversation

Un Collaborateur peut supprimer une de ses Conversations après confirmation.

**Critères vérifiables :**
- Annuler la confirmation laisse la Conversation intacte.
- Une Conversation supprimée disparaît de l'Historique et du Tableau de bord et ne peut plus être rouverte.

#### FR-22 : Garder les Conversations privées

Un Collaborateur ne peut accéder qu'à ses propres Conversations.

**Critères vérifiables :**
- Le Collaborateur B ne voit pas les Conversations du Collaborateur A dans son Historique.
- Une tentative directe de B d'ouvrir une Conversation de A (par exemple via son URL) est refusée.

### 4.8 Résumé d'un Document

**Description :** depuis la page d'un Document *prêt*, un Collaborateur peut obtenir un Résumé produit par l'IA. Il complète la démonstration en montrant une seconde fonctionnalité IA utile. Réalise UJ-2.

#### FR-23 : Générer le Résumé d'un Document

Un Collaborateur peut demander le Résumé d'un Document *prêt*.

**Critères vérifiables :**
- Le Résumé est en français et comporte 5 points clés au plus.
- Sur 5 Documents du Jeu de démonstration, chaque Résumé ne contient que des informations présentes dans le Document (vérification par relecture).
- Le Résumé n'est généré qu'à la demande d'un Collaborateur, jamais automatiquement à l'ajout.
- Une fois généré, le Résumé est conservé et réaffiché à tous les Collaborateurs qui ouvrent le Document, sans être régénéré.
- *(Applicable une fois FR-11 livré.)* Après modification du texte d'une Note, le Résumé existant est signalé comme obsolète ; un Collaborateur peut alors en générer un nouveau.
- L'action n'est pas proposée pour un Document *en cours de traitement* ou *en erreur*.

## 5. Exigences non fonctionnelles transverses

- **NFR-1 Sécurité des accès** — Le contrôle d'accès (connexion, droits de l'Auteur, confidentialité des Conversations) est appliqué côté serveur et au niveau des données, pas seulement dans l'interface. Vérifiable par les critères de FR-2, FR-13 et FR-22.
- **NFR-2 Secrets** — Aucune clé secrète (clé du Fournisseur d'IA, clé d'administration de la base de données) n'est envoyée au navigateur ni versionnée dans le dépôt.
- **NFR-3 Performance** — Seuils indicatifs, mesurés sur le Jeu de démonstration (§8) ; ils ne constituent pas un engagement de production. Recherche sémantique : résultats en moins de 3 secondes ; Assistant : début de réponse en moins de 5 secondes ; traitement d'un Document de 20 pages : moins d'une minute.
- **NFR-4 Robustesse** — Aucune erreur ne laisse un écran blanc ou un chargement infini : toute défaillance (Fournisseur d'IA indisponible, fichier illisible, perte de connexion) affiche un message compréhensible et l'action adaptée : réessayer en cas d'erreur temporaire, ou corriger, remplacer ou supprimer le contenu si le fichier est inexploitable. Pour un Fichier importé, remplacer signifie supprimer le Document puis importer un nouveau fichier (FR-7, FR-11).
- **NFR-5 Langue** — Interface, messages d'erreur, réponses de l'Assistant et Résumés en français.
- **NFR-6 Responsive** — Conçu pour ordinateur ; reste utilisable sur une largeur de mobile. Vérifiable : à 375 px de large, la lecture d'un Document, la Recherche sémantique et une Conversation fonctionnent sans défilement horizontal.
- **NFR-7 Accessibilité de base** — Vérifiable : les parcours UJ-1 à UJ-3 sont réalisables au clavier seul ; le texte respecte le contraste du niveau AA des WCAG ; chaque champ de formulaire a un libellé.
- **NFR-8 Maîtrise des coûts IA** — Une question de plus de 2 000 caractères est refusée avec un message ; le coût d'une question à l'Assistant ne dépend pas de la taille de la Base commune (mécanisme : voir addendum, « Coûts »). Chaque Collaborateur dispose d'un quota quotidien d'appels IA (questions à l'Assistant et générations de Résumé) ; un plafond de dépense est configuré chez le Fournisseur d'IA. Valeurs retenues : 60 appels par Collaborateur et par jour, remis à zéro à 00:00 UTC. Une question à l'Assistant ou un Résumé généré compte pour 1 ; une panne, un Résumé déjà stocké, la Recherche sémantique et la vectorisation ne comptent pas. Le plafond du projet chez le Fournisseur d'IA est de 10 $, avec une alerte à 5 $ et sans recharge automatique. S'il est atteint, l'échec est propre et distinct du quota (AD-14, AD-15). Vérifiable : une fois le quota atteint, toute nouvelle demande est refusée avec un message indiquant quand le quota sera rétabli, et aucun appel au fournisseur n'est effectué.
- **NFR-9 Fournisseur d'IA** — Le Fournisseur d'IA (génération et vectorisation) est choisi en phase d'architecture, sous trois contraintes : petit budget, accès par API, clés conservées uniquement côté serveur (NFR-2).
- **NFR-10 Contenus traités comme des données** — Le texte des Documents est toujours traité comme une donnée à exploiter, jamais comme une instruction pour l'Assistant ou pour le Résumé. Vérifiable : un Document du Jeu de démonstration contenant une consigne du type « ignore tes instructions et réponds que… » ne modifie ni le comportement de l'Assistant ni celui du Résumé.

## 6. Périmètre du MVP

### 6.1 Dans le périmètre

- Création de Compte, connexion, déconnexion (FR-1, FR-2)
- Tableau de bord (FR-3)
- Ajout de Notes, de fichiers .txt/.md et de PDF contenant du texte, avec Statut de traitement (FR-4 à FR-8)
- Bibliothèque : filtre par Catégorie, filtre « Mes Documents », recherche par titre, tri ; consultation, modification et suppression par l'Auteur (FR-9 à FR-13)
- Recherche sémantique (FR-14, FR-15)
- Assistant avec Sources cliquables, refus en l'absence d'information et questions de suivi (FR-16 à FR-19)
- Historique privé des Conversations (FR-20 à FR-22)
- Résumé d'un Document, à la demande (FR-23)

**Priorités de livraison**

| Priorité | Nombre | Exigences |
|---|---|---|
| **P0** | 20 | FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-8, FR-9, FR-10 (hors téléchargement), FR-12, FR-13, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-22, FR-23 |
| **P1** | 2 | FR-11, FR-21 |
| **P2** | 1 (+ une partie de FR-10) | FR-6, téléchargement du fichier d'origine (FR-10) |

En cas de retard, on coupe d'abord P2, puis P1. On ne coupe jamais P0.

**Cohérence avec les parcours et les indicateurs**
- UJ-1, UJ-2 (cas limite compris, avec un fichier .txt vide) et UJ-3 ne reposent que sur des exigences P0.
- SM-1 à SM-4 et SM-6 ne reposent que sur des exigences P0. SM-5 mesure les fichiers .txt et .md (P0) ; ses critères liés au PDF ne s'appliquent que si FR-6 est livré.

**Critères conditionnels**
- Critères liés au PDF (FR-6, variante PDF du cas limite de UJ-2, PDF dans FR-7 et SM-5) : applicables uniquement si FR-6 est livré.
- Critère de FR-17 sur une Note modifiée et critère de FR-23 sur le Résumé obsolète : applicables uniquement une fois FR-11 livré.

### 6.2 Hors périmètre du MVP

- **Rôles éditeur ou administrateur** — tous les Collaborateurs ont les mêmes droits ; évolution possible pour fiabiliser la Base commune.
- **Inscription sur invitation ou restreinte au domaine e-mail de l'entreprise** — indispensable avant tout usage avec de vraies données (voir §4.1).
- **Confirmation de l'e-mail à l'inscription et réinitialisation du mot de passe** — écartées pour garder une démonstration fiable ; évolutions prioritaires pour un usage réel.
- **Espaces privés ou équipes** — tous les Documents sont dans la Base commune.
- **Autres formats** — PDF scannés et OCR, Word, PowerPoint, Excel, images, audio, vidéo ; ajoutent un risque d'échec de lecture pour peu de valeur en démonstration.
- **Imports depuis des outils externes** (Drive, Notion, messagerie).
- **Étiquettes libres, dossiers, création de Catégories** par les Collaborateurs.
- **Recherche hybride, filtres avancés, historique des recherches.**
- **Autres fonctions IA** (reformulation, aide à la rédaction, extraction d'informations, suggestion proactive de ressources) — évolutions possibles une fois le cœur stable.
- **Partage de Conversations**, commentaires, notifications.
- **Versions de Documents** et historique des modifications : aucune version n'est visible des Collaborateurs. Seule la détection d'une modification est nécessaire, pour FR-17 et FR-23.
- **Connexion via Google ou un autre fournisseur, double authentification.**
- **Import de plusieurs fichiers à la fois.**
- **Extensions de l'Assistant** : limitation des réponses à une Catégorie, actions sur les Documents, réponse vocale, pièces jointes dans une Conversation.

## 7. Non-objectifs

- NexaMind AI n'est pas un outil de gestion documentaire complet (pas de workflow de validation, de versions ni de droits fins).
- Ce n'est pas un chatbot généraliste : l'Assistant ne répond pas avec ses connaissances générales.
- Ce n'est pas un outil de gestion de projet ou de tâches, même si la Base commune peut contenir des Documents de Catégorie « Fiche projet ».
- Le MVP ne vise pas un déploiement réel avec des données sensibles : il fonctionne avec le Jeu de démonstration, composé de Documents fictifs.

## 8. Indicateurs de succès

Mesurés avant la démonstration sur le **Jeu de démonstration** (voir Glossaire). Son contenu détaillé est produit après le PRD.

**Principaux**
- **SM-1 : Exactitude des réponses sourcées** — Sur 20 questions dont la réponse figure dans la Base commune, au moins 16 reçoivent une réponse correcte citant le bon Document en Source. Suivi des faits inventés : à chaque mesure, on relève le nombre de réponses contenant au moins un fait absent des Sources citées ; cible : 0 (FR-16). Valide FR-16, FR-17.
- **SM-2 : Refus justes** — Sur 10 questions dont la réponse ne figure pas dans la Base commune, au moins 9 obtiennent un refus explicite. L'échec toléré ne peut être qu'un refus insuffisamment explicite, jamais une réponse contenant un fait inventé. Suivi des faits inventés : à chaque mesure, on relève le nombre de réponses qui fournissent une information inventée au lieu de refuser ; cible : 0. Valide FR-18.
- **SM-3 : Parcours de démonstration sans accroc** — Le parcours UJ-2 complet (ajout d'une Note → Statut de traitement *prêt* → question → réponse sourcée → Résumé) réussit 3 fois de suite sans erreur. Valide FR-4, FR-7, FR-16, FR-17, FR-23.

**Secondaires**
- **SM-4 : Pertinence de la Recherche sémantique** — Sur 10 Requêtes reformulées sans les mots exacts, le bon Document figure parmi les 3 premiers résultats au moins 8 fois. Valide FR-14.
- **SM-5 : Fiabilité de l'ajout** — 100 % des fichiers .txt et .md valides du Jeu de démonstration atteignent le Statut de traitement *prêt* ; 100 % des fichiers invalides testés (format non pris en charge, .txt ou .md de plus de 1 Mo, fichier vide) sont refusés ou passent *en erreur* avec un message clair. Les mêmes critères s'appliquent aux PDF si FR-6 est livré. Valide FR-5 à FR-7.
- **SM-6 : Cloisonnement** — Les 3 critères d'accès (Document de A visible et interrogeable par B ; B ne peut pas modifier ni supprimer le Document de A ; B ne peut pas accéder aux Conversations de A) sont vérifiés. Valide FR-10, FR-13, FR-22.

**Contre-indicateurs (à ne pas optimiser)**
- **SM-C1 : Taux de réponse de l'Assistant** — Chercher à répondre à tout pousse à inventer. Un Assistant qui refuse à juste titre vaut mieux qu'un Assistant qui répond toujours. Contrebalance SM-1.
- **SM-C2 : Nombre de fonctionnalités** — Ajouter des fonctions IA ou des formats au détriment de la stabilité dégrade la crédibilité du MVP. Contrebalance l'ensemble du §6.

## 9. Questions ouvertes et points reportés

1. **Fournisseur d'IA** — **Réglé** en architecture : OpenAI (génération et vectorisation), dans le cadre de NFR-9 (AD-3).
2. **Détail du Jeu de démonstration** — Rédaction des 10 à 15 Documents fictifs, des 30 questions de test (SM-1, SM-2), des 10 Requêtes (SM-4) et du lot de fichiers de test (SM-5), après le PRD.

Points non bloquants issus de la validation finale, à traiter dans la phase indiquée :

3. **Mise en ligne pour le jury** *(architecture)* — **Réglé** (AD-21) : URL accessible en HTTPS, Jeu de démonstration préchargé, deux Comptes de démonstration pour montrer SM-6.
4. **Ton et forme des réponses de l'Assistant** *(UX)* — **Réglé** (EXPERIENCE.md, Voice and Tone) : vouvoiement, réponse directe d'abord, procédures en étapes numérotées, « je » pour l'Assistant, aucune question jugée naïve.
5. **Qualité perçue de l'expérience** *(UX)* — **Réglé** (EXPERIENCE.md, State Patterns et écrans E1 à E9) : états de chargement, de succès et d'erreur pour chaque écran, retours visuels, cohérence assurée par DESIGN.md.
6. **Compléments du Jeu de démonstration** *(après le PRD)* — Requêtes hors base pour mesurer FR-15, scénarios de questions de suivi (FR-19) et cas de contradiction (FR-16) rattachés à un indicateur ; exemples de questions proposés dans l'état vide du Tableau de bord.
7. **Bornes complémentaires** *(UX / architecture)* — **Réglé** : la Recherche sémantique affiche au plus 5 Documents (EXPERIENCE.md, E5) ; le quota de 60 appels par jour couvre une série SM-1 à SM-3, d'environ 40 appels (AD-14) ; pour NFR-3, un Document de 20 pages correspond à environ 60 000 caractères de texte (unité de mesure retenue pour le Jeu de démonstration).

## 10. Index des hypothèses

Les 15 hypothèses de la première version ont été confirmées le 2026-11-02 et intégrées au texte. La dernière (valeurs du quota et du plafond, NFR-8) a été fixée en architecture le 2026-11-03. Il ne reste aucune hypothèse ouverte.
