---
name: NexaMind AI
status: final
updated: 2026-11-03
sources:
  - ../../prds/prd-projet-ia-2026-11-02/prd.md
  - ../../prds/prd-projet-ia-2026-11-02/addendum.md
design: DESIGN.md
---

# NexaMind AI — Expérience

Ce document décrit le fonctionnement de l'interface : écrans, comportements, états, clavier et parcours. L'apparence est définie dans [DESIGN.md](DESIGN.md), et les jetons visuels y sont cités sous la forme `{chemin.du.jeton}`. Le vocabulaire (Document, Source, Passage, Statut de traitement…) reprend exactement le Glossaire du PRD (§3). Les hypothèses non confirmées portent la mention `[ASSUMPTION]` et sont regroupées à la fin du document.

En cas de désaccord entre ce document, [DESIGN.md](DESIGN.md) et une maquette, ce sont les deux documents qui font foi.

## Foundation

- **Support :** application web conçue pour ordinateur, utilisable à 375 px sans défilement horizontal (NFR-6). Pas d'application native.
- **Système d'interface :** shadcn/ui (Radix + Tailwind 4) sur Next.js 16. Les comportements de base (focus des dialogues, touche Échap, navigation au clavier dans les menus et onglets, annonces des notifications) viennent de Radix. Ce document ne décrit que ce qui s'ajoute à ce socle.
- **Langue :** tout est en français (NFR-5). La balise `<html>` doit porter `lang="fr"`.
- **Thème :** mode clair uniquement pour le MVP. Le mode sombre automatique présent dans `src/app/globals.css` est à retirer.
- **Périmètre :** UJ-1, UJ-2, UJ-3 et les 20 exigences P0. Les ajouts P1 (FR-11, FR-21) et P2 (FR-6, téléchargement de FR-10) sont décrits à part (§ Ajouts P1 et P2) : aucun parcours principal n'en dépend, et leur absence ne laisse aucun trou dans l'interface.
- **Principe directeur :** la confiance se voit. Chaque information tirée de la Base commune montre d'où elle vient, et chaque absence d'information est dite franchement (§ Confiance visible).

## Information Architecture

### Navigation

Une barre latérale fixe à gauche sur ordinateur, repliée en menu (`Sheet`) sous 1024 px.

1. **« + Ajouter »** : bouton principal en haut de la barre. C'est une action, pas une destination.
2. **Tableau de bord**
3. **Assistant**
4. **Recherche**
5. **Bibliothèque**
6. En bas de la barre : adresse e-mail du Collaborateur et lien « Se déconnecter ».

L'entrée correspondant à l'écran affiché est mise en évidence (`{components.nav-item-active}`) et porte `aria-current="page"`. L'Historique n'a pas d'entrée dans la barre : on y accède depuis l'Assistant.

### Écrans

Routes confirmées par l'architecture (§6) : routes d'écran en français, identifiants opaques (uuid).

| # | Écran | Route | Accès | Objectif |
|---|---|---|---|---|
| E1 | Connexion | `/connexion` | Visiteur | Se connecter |
| E2 | Création de Compte | `/inscription` | Visiteur | Créer un Compte et arriver sur le Tableau de bord |
| E3 | Tableau de bord | `/` | Collaborateur | Accéder en un clic aux trois actions clés, voir l'activité récente |
| E4 | Assistant | `/assistant`, `/assistant/{id}` | Collaborateur (ses Conversations uniquement) | Poser des questions et vérifier les Sources |
| E4a | Panneau Source | dans E4 | — | Lire le Passage utilisé sans quitter la Conversation |
| E4b | Panneau Historique | dans E4 | — | Retrouver et rouvrir une Conversation |
| E5 | Recherche | `/recherche?q=…` | Collaborateur | Retrouver des Documents par le sens, sans réponse rédigée |
| E6 | Bibliothèque | `/bibliotheque` | Collaborateur | Parcourir, filtrer et retrouver tous les Documents |
| E7 | Document | `/documents/{id}` | Collaborateur | Lire un Document, suivre son Statut, obtenir son Résumé |
| E8 | Ajouter | `/ajouter` | Collaborateur | Créer une Note ou importer un fichier |
| E9 | Accès refusé / introuvable | toute URL invalide | Collaborateur | Sortir proprement d'une impasse |

Toutes les routes sauf E1 et E2 exigent une session. Sans session, on est redirigé vers E1 (FR-2).

### Traçabilité

| Écran | Exigences P0 | UJ-1 | UJ-2 | UJ-3 | Ajouts P1 / P2 |
|---|---|---|---|---|---|
| E1 Connexion | FR-2 | | | | |
| E2 Création de Compte | FR-1 | | | ● entrée | |
| E3 Tableau de bord | FR-3 | ● entrée | ● entrée | ● Recherche | |
| E4 Assistant | FR-16, FR-17, FR-18, FR-19, FR-20, FR-22, NFR-8 | ● | ● | ● | |
| E4a Panneau Source | FR-10, FR-12, FR-17 | ● climax | ● | | FR-17 Note modifiée (P1) |
| E4b Panneau Historique | FR-20, FR-22 | ● résolution | | ● résolution | FR-21 (P1) |
| E5 Recherche | FR-8, FR-14, FR-15 | | | ● | |
| E6 Bibliothèque | FR-7, FR-9 | | ● | | FR-11 Catégorie (P1) |
| E7 Document | FR-7, FR-8, FR-10, FR-12, FR-13, FR-23, NFR-8 | ● (page complète) | ● climax et résolution | ● | FR-11, FR-23 obsolète (P1) ; téléchargement (P2) |
| E8 Ajouter | FR-4, FR-5, FR-7 | | ● | | FR-6 PDF (P2) |
| E9 Accès refusé | FR-2, FR-13, FR-22 | | | | |

Toutes les exigences P0 ont un écran, et chaque écran sert au moins un parcours ou une exigence d'accès.

## Voice and Tone

### Guide de contenu

Ces règles s'appliquent à tous les libellés, messages d'erreur, réponses de l'Assistant et Résumés.

1. **Vouvoiement partout.** « Posez une question », « Votre Document est prêt ».
2. **Ton professionnel, clair et chaleureux.** Phrases courtes et mots simples. Pas de jargon technique (« vectorisation », « embedding », « token », « RAG », « 500 »), pas de familiarité, pas d'humour, pas d'émoji.
3. **L'Assistant parle en « je »** quand il explique ce qu'il a trouvé ou non : « Je n'ai pas trouvé… ». L'interface, elle, ne dit jamais « je ».
4. **Les termes du Glossaire gardent leur majuscule et ne sont jamais remplacés par un synonyme :** Document, Note, Catégorie, Source, Passage, Statut de traitement, Base commune, Bibliothèque, Conversation, Historique, Résumé, Recherche sémantique (abrégée en « Recherche » dans la navigation).
5. **Un message d'erreur dit ce qui s'est passé, puis ce qu'on peut faire,** avec un bouton qui le fait. Jamais « Une erreur est survenue » seul.
6. **Les boutons commencent par un verbe à l'infinitif :** « Enregistrer », « Importer », « Réessayer », « Relancer le traitement ».
7. **Réponses de l'Assistant :** la réponse directe d'abord, en une phrase. Une procédure se présente en étapes numérotées. Un renvoi ¹ ² suit chaque affirmation tirée d'un Passage. Aucune question n'est jugée naïve. Aucune formule de politesse superflue (« Bien sûr ! », « Excellente question »).
8. **Résumés :** 5 points clés au plus, à la troisième personne (« La procédure prévoit… »), sans s'adresser au lecteur sauf si le Document lui-même le fait.
9. **Typographie française :** espace fine insécable (U+202F) avant `;` `!` `?` ; espace insécable (U+00A0) avant `:`, dans les nombres (« 2 000 ») et avant les unités (« 10 Mo », « 4 h 00 »). Le catalogue ci-dessous est écrit avec des espaces ordinaires pour rester lisible : la fonction `formatFr` (architecture, §6) applique cette règle au rendu de tous les textes.

| À écrire | À éviter |
|---|---|
| « Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer. » | « Désolé, je ne peux pas répondre à cette question 😕 » |
| « Ce fichier est vide : aucun texte exploitable n'a été trouvé. » | « Erreur d'ingestion : 0 chunk extrait » |
| « Le service d'IA ne répond pas pour le moment. Votre question est conservée. » | « Erreur 503 » |
| « Votre Document est prêt. » | « Succès ! 🎉 » |
| « Formats acceptés : .txt et .md, 10 Mo au maximum. » | « Format invalide » |

### Textes clés de l'interface

Ce catalogue fait référence : les écrans reprennent ces textes tels quels. `{…}` désigne une valeur insérée.

**Navigation et en-têtes**

| Élément | Texte |
|---|---|
| Logo | « NexaMind AI » |
| Action principale de la barre latérale | « + Ajouter » |
| Entrées de navigation | « Tableau de bord » · « Assistant » · « Recherche » · « Bibliothèque » |
| Pied de la barre latérale | « {adresse e-mail} » · « Se déconnecter » |
| Bouton menu (375 px) | ☰, nom accessible « Ouvrir le menu » |
| Barre du haut (sous 1024 px) | ☰ « Ouvrir le menu » · logo · « + », nom accessible « Ajouter un Document » ; identique sur tous les écrans |
| Lien d'évitement | « Aller au contenu » |
| En-tête de l'Assistant | « Historique » · « + Nouvelle Conversation » (à 375 px, sur une ligne sous la barre du haut) |
| Puce de Source | « {n} · {titre} » ; si plusieurs Passages du Document sont utilisés : « {n} · {titre} · {k} Passages » ; nom accessible « Source {n} : {titre}, {k} Passages » (points médians masqués) |
| Renvoi | numéro en exposant précédé du texte masqué « Source » (lu « Source 1 ») |
| Panneau Source | « Ouvrir la page complète » · ✕ « Fermer » · « ← Retour à la Conversation » (375 px) · étiquette « Passage utilisé » · texte masqué « Passage utilisé {j} sur {k} » devant chaque Passage surligné · « Passage {i} sur {k} » · « Précédent » / « Suivant » (si plusieurs Passages) |
| Résultat de Recherche | étiquette « Passage pertinent » |
| Titres d'écran | « Connexion » · « Créer votre Compte » · « Tableau de bord » · « Que voulez-vous savoir ? » (Assistant vide) · « Recherche » · « Bibliothèque » · « Ajouter un Document » · « Page introuvable » |

**Boutons principaux et actions**

| Écran | Texte |
|---|---|
| Connexion | « Se connecter » (pendant l'envoi : « Connexion… ») · « Créer un compte » · « Afficher le mot de passe » / « Masquer le mot de passe » |
| Création de Compte | « Créer mon Compte » (pendant l'envoi : « Création… ») · « J'ai déjà un Compte » |
| Tableau de bord | champ de libellé masqué « Rechercher dans les Documents » (indication « Rechercher dans les Documents… ») · « Poser une question » · « Ajouter un Document » · « Voir la Bibliothèque » · « Voir tout l'Historique » |
| Assistant | champ « Votre question » (indication « Posez une question sur les Documents de NexaWorks… ») · « Envoyer » · aide « Entrée pour envoyer · Maj + Entrée pour aller à la ligne » (masquée sur écran tactile) · compteur « {n} / 2 000 » |
| Recherche | champ de libellé visible « Votre recherche » (indication « Décrivez ce que vous cherchez avec vos propres mots. ») · « Rechercher » · « Poser la question à l'Assistant » |
| Bibliothèque | « + Ajouter un Document » · liste de libellé « Catégorie » (valeur par défaut « Toutes les Catégories ») · « Mes Documents » · champ de libellé « Rechercher un titre » · liste de libellé « Trier par » (« Plus récents d'abord » / « Plus anciens d'abord ») · « Filtres ({n}) » (375 px) · « Réinitialiser les filtres » |
| Document | « Poser une question » · « Générer le Résumé » (pendant la génération : « Génération du Résumé… ») · « Relancer le traitement » (pendant l'action : « Relance… ») · « Actualiser » · « Supprimer » · « ← Retour à la Conversation » |
| Ajouter | onglets « Note » / « Fichier » · « Titre * » · « Catégorie * » (« Choisir une Catégorie ») · « Texte * » · « Choisir un fichier » · « Enregistrer » (« Enregistrement… ») · « Importer » (« Import… ») · « Annuler » · légende « * Champ obligatoire » |
| Accès refusé | « Retour au Tableau de bord » · « Ouvrir l'Assistant » |

**Confirmations**

| Situation | Texte |
|---|---|
| Document enregistré ou importé | « Document ajouté. Traitement en cours. » |
| Statut *en cours de traitement* | « Le Document sera interrogeable dans quelques instants. » |
| Statut *en cours de traitement* depuis plus de 60 s | « Le traitement prend plus de temps que prévu. Vous pouvez quitter cette page sans l'interrompre. » |
| Statut *prêt* | « Votre Document est prêt. » |
| Relance lancée | « Traitement relancé. » |
| Résumé affiché (annonce aux lecteurs d'écran) | « Résumé généré. » |
| Saisie restaurée après reconnexion | « Votre saisie a été restaurée. » |
| Document supprimé | « Document supprimé. » |
| Résumé généré (mention sous le Résumé) | « Résumé généré par l'IA à partir de ce Document · {date} » |
| Recherche aboutie | « {n} Documents pertinents » (« 1 Document pertinent ») |
| Déconnexion | « Vous êtes déconnecté. » sur l'écran de Connexion |

**Dialogues de confirmation**

| Situation | Texte |
|---|---|
| Supprimer un Document | Titre « Supprimer « {titre} » ? » · texte « Ce Document disparaîtra de la Bibliothèque, de la Recherche et des réponses futures de l'Assistant. Cette action est définitive. » · « Annuler » / « Supprimer » |
| Quitter l'ajout en cours | Titre « Abandonner ce Document ? » · texte « Votre saisie sera perdue. » · « Continuer la saisie » / « Abandonner » |
| Supprimer une Conversation (P1) | Titre « Supprimer cette Conversation ? » · texte « Elle sera définitivement retirée de votre Historique. » · « Annuler » / « Supprimer » |

**États vides**

| Écran | Texte |
|---|---|
| Tableau de bord : Conversations | « Vous n'avez pas encore posé de question. » + exemples cliquables |
| Tableau de bord : Documents | « La Base commune est encore vide. » + « Ajouter un Document » |
| Assistant sans Conversation active | « Que voulez-vous savoir ? » + « L'Assistant répond uniquement à partir des Documents de NexaWorks et cite ses Sources. » |
| Historique | « Aucune Conversation pour le moment. » + « Poser une première question » |
| Recherche (avant la Requête) | « Décrivez ce que vous cherchez avec vos propres mots. » + exemples de Requêtes |
| Bibliothèque : Base vide | « La Base commune est encore vide. » + « Ajouter un Document » |
| Bibliothèque : « Mes Documents » | « Vous n'avez encore ajouté aucun Document. » + « Ajouter un Document » |
| Document pas encore prêt (bloc Résumé) | « Le Résumé sera disponible quand le Document sera prêt. » |

**Réponses de l'Assistant sans contenu sourcé**

| Situation | Texte |
|---|---|
| Information absente | « Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer. » + « Reformuler la question » · « Rechercher dans les Documents » · « Ajouter un Document » |
| Hors cadre | « Je réponds uniquement à partir des Documents de NexaWorks. » + « Reformuler la question » |
| En attente | « Recherche dans les Documents… » |

Une contradiction entre Passages n'a pas de texte d'interface : c'est une réponse sourcée, que l'Assistant formule lui-même en citant les deux Sources (consignes du modèle, architecture AD-10).

**Résultat absent et accès**

| Situation | Texte |
|---|---|
| Recherche sans résultat | « Aucun Document ne correspond suffisamment à votre recherche. Essayez d'autres mots ou posez la question à l'Assistant. » |
| Filtres de Bibliothèque sans résultat | « Aucun Document ne correspond à ces filtres. » |
| Passage introuvable | « Le Passage cité n'a pas pu être retrouvé dans ce Document. Le Document est affiché en entier. » |
| Un des Passages introuvable (plusieurs Passages) | « Un des Passages cités n'a pas pu être retrouvé dans ce Document. » (compteur ramené aux Passages retrouvés) |
| Document modifié depuis la réponse (P1) | « Ce Document a été modifié depuis cette réponse. Le Passage cité n'est plus mis en évidence. » |
| Résumé obsolète (P1) | « Résumé obsolète : le Document a changé. » + « Générer un nouveau Résumé » |
| Source supprimée | « {titre} — Document supprimé » |
| Accès refusé / introuvable | « Cette page n'existe pas ou ne vous est pas accessible. » |
| Action refusée par le serveur | « Cette action n'est pas autorisée. » |
| Document supprimé pendant la consultation | « Ce Document a été supprimé. » (panneau Source : sans action ; page Document : + « Retour à la Bibliothèque ») |

**Erreurs**

| Situation | Texte |
|---|---|
| Panne de l'Assistant (y compris délai dépassé) | Titre « La réponse n'a pas pu être générée. » · texte « Le service d'IA ne répond pas pour le moment. Votre question est conservée. » · « Réessayer » |
| Réponse non vérifiable (aucune citation valide) | « Je n'ai pas pu vérifier cette réponse à partir des Documents. Veuillez réessayer. » · « Réessayer » |
| Plafond du fournisseur atteint (`AI_BUDGET_EXHAUSTED`) | « Le service d'IA est momentanément indisponible. Réessayez plus tard. » (traité comme une panne, distinct du quota) |
| Panne du Résumé | « Le Résumé n'a pas pu être généré. » · « Réessayer » |
| Panne de la Recherche | « La Recherche n'a pas pu aboutir. » · « Réessayer » |
| Liste non chargée (Tableau de bord, Bibliothèque) | « Cette liste n'a pas pu être chargée. » · « Réessayer » |
| Historique non chargé | « L'Historique n'a pas pu être chargé. » · « Réessayer » |
| Chargement long | « Le chargement prend plus de temps que prévu. » · « Réessayer » |
| Erreur temporaire de traitement | Auteur : « Le traitement n'a pas pu aboutir, le service d'IA étant momentanément indisponible. » + « Relancer le traitement » ; autres Collaborateurs : même phrase + « Seul l'Auteur de ce Document peut relancer le traitement. » |
| Traitement bloqué plus de 3 min | Auteur : « Le traitement n'a pas pu aboutir. Vous pouvez le relancer. » + « Relancer le traitement » ; autres Collaborateurs : « Le traitement n'a pas pu aboutir. Seul l'Auteur de ce Document peut relancer le traitement. » |
| Statut non actualisé | « Le Statut n'a pas pu être actualisé. » · « Actualiser » |
| Fichier sans texte exploitable | « Ce fichier ne contient aucun texte exploitable. Il ne peut pas être interrogé. » + « Supprimer » (Auteur) |
| Encodage illisible | « Le texte de ce fichier n'a pas pu être lu (encodage non pris en charge). » + « Supprimer » (Auteur) ; même traitement que le fichier sans texte exploitable (AD-8) |
| Format refusé | « Ce format n'est pas pris en charge. Formats acceptés : .txt et .md. » |
| Fichier trop lourd | « Ce fichier dépasse 10 Mo, la taille maximale. » |
| Échec de l'envoi d'un ajout | « Le Document n'a pas pu être enregistré. Votre saisie est conservée. » · « Réessayer » |
| Champs du formulaire d'ajout | « Indiquez un titre. » · « Choisissez une Catégorie. » · « Le texte ne peut pas être vide. » · « Choisissez un fichier. » |
| Question trop longue | « Votre question dépasse 2 000 caractères. Raccourcissez-la pour l'envoyer. » |
| Identifiants invalides | « E-mail ou mot de passe incorrect. » |
| Création de Compte | « Cette adresse e-mail n'est pas valide. » · « Le mot de passe doit contenir au moins 8 caractères. » · « Cette adresse e-mail est déjà utilisée. » |
| Session expirée | « Votre session a expiré. Reconnectez-vous pour continuer. » |
| Perte de connexion | « Connexion perdue. Vérifiez votre réseau, puis réessayez. » |

**Quota (NFR-8)**

| Situation | Texte |
|---|---|
| Quota atteint : Assistant | « Vous avez atteint votre limite quotidienne de questions et de Résumés. Elle sera rétablie {moment}. La Recherche reste disponible. » · raison « Limite quotidienne atteinte », reliée au champ par `aria-describedby` · lien « Ouvrir la Recherche » |
| Quota atteint : Résumé | « Vous avez atteint votre limite quotidienne de questions et de Résumés. Elle sera rétablie {moment}. » · bouton « Générer le Résumé » désactivé |
| Format de `{moment}` | Heure locale, dans le fuseau du navigateur, du prochain 00:00 UTC renvoyé par le serveur (`resetAt`, architecture AD-14) : « demain à {heure} » ou « aujourd'hui à {heure} » (ex. « demain à 4 h 00 » à La Réunion, « demain à 1 h 00 » à Paris en hiver) |

## Confiance visible

Les quatre marques de confiance du produit et leur rendu dans l'interface.

| Marque | Où | Comportement | Visuel |
|---|---|---|---|
| **Sources cliquables** | Sous chaque réponse fondée sur la Base commune (E4) | Au moins une puce de Source numérotée, une seule par Document, avec son titre (et « · {k} Passages » si plusieurs Passages de ce Document sont utilisés). Les renvois ¹ ² dans le texte correspondent aux numéros, donc aux Documents. Un clic ouvre le panneau Source (E4a) sur le premier Passage utilisé. La Source d'un Document supprimé reste affichée mais n'est plus cliquable. | `{components.source-chip}`, `{components.citation-marker}`, `{components.source-chip-deleted}` |
| **Passage mis en évidence** | Panneau Source (E4a), page Document (E7) ouverte depuis une Source ou un résultat, résultats de Recherche (E5) | Défilement automatique jusqu'au Passage, surligné et précédé de l'étiquette « Passage utilisé » ou « Passage pertinent ». Si plusieurs Passages du Document sont utilisés, tous sont surlignés, le Passage actif plus fortement que les autres, et « Précédent » / « Suivant » font défiler de l'un à l'autre. Le reste du Document reste lisible autour. Si le Passage est introuvable, le Document s'ouvre sans surlignage, avec un message. | `{components.passage-highlight}`, `{components.passage-highlight-inactive}` |
| **Refus honnête** | Fil de la Conversation (E4) | L'Assistant répond dans le fil, sans Source, d'un ton calme, puis propose des suites : reformuler, rechercher, ajouter pour une information absente ; reformuler seulement pour une question hors cadre. Le refus se distingue clairement de la panne technique, qui est rouge et propose « Réessayer ». | `{components.refusal-block}` contre `{components.error-alert}` |
| **Statut de traitement** | Bibliothèque (E6), page Document (E7), Tableau de bord (E3) | Badge avec symbole et texte, mis à jour sans recharger la page, et changement annoncé aux lecteurs d'écran. Seul un Document *prêt* propose « Poser une question » et « Générer le Résumé ». | `{components.status-badge-ready}`, `{components.status-badge-processing}`, `{components.status-badge-error}` |

Une **contradiction** entre Passages (FR-16) est une réponse sourcée : l'Assistant la signale dans son texte en citant les deux Sources, sans trancher (architecture AD-10). Aucune mise en forme dédiée. Une réponse n'est affichée comme définitive, avec ses Sources, qu'après validation des citations par le serveur (AD-11).

## Component Patterns

Règles de comportement. L'apparence est décrite dans `DESIGN.md › Components`.

| Composant | Où | Règles |
|---|---|---|
| Barre latérale | Partout sauf E1, E2, E9 | Fixe sur ordinateur. Sous 1024 px, une seule barre du haut globale, identique partout : ☰ · logo · « + » (nom accessible « Ajouter un Document ») ; la barre latérale devient un `Sheet` ouvert par ☰ ; il se ferme à la navigation, par Échap ou par un clic à l'extérieur, et le focus revient sur ☰. |
| Bouton « + Ajouter » | Barre latérale ; barre du haut sur mobile | Ouvre E8. Toujours visible, quel que soit l'écran. |
| Champ de question | E4 | Clavier physique : Entrée envoie, Maj+Entrée va à la ligne. Écran tactile (`pointer: coarse`) : Entrée va à la ligne, l'envoi passe par « Envoyer », l'aide « Maj + Entrée » est masquée. Entrée et Échap sont ignorés pendant une composition de texte (IME, touches mortes : `isComposing`). Le champ grandit jusqu'à 6 lignes sur ordinateur, 4 à 375 px. Le compteur « n / 2 000 » est toujours visible. Au-delà de 2 000 caractères, l'envoi est bloqué et le message s'affiche sous le champ (lié par `aria-describedby`). Pendant la génération, « Envoyer » est inactif (`aria-disabled`) et Entrée ne fait rien. Si la session expire pendant la saisie, le texte est conservé (State Patterns › Session expirée). Après un refus, « Reformuler la question » remet la question dans le champ et y place le curseur. |
| Réponse de l'Assistant | E4 | Trois temps. (1) **État neutre** « Recherche dans les Documents… » pendant la recherche et la préparation, sans rien qui préjuge de l'issue. (2) **Réponse sourcée** (marqueur `REPONSE`) : le texte s'écrit progressivement (FR-16) et reste **provisoire** (`aria-busy="true"`) jusqu'à la confirmation du serveur ; les puces de Source n'apparaissent qu'à ce moment, d'après les citations validées (architecture AD-11). Les citations invalides sont retirées sans message. Si aucune citation n'est valide, le texte provisoire est retiré et remplacé par l'alerte « Je n'ai pas pu vérifier cette réponse à partir des Documents. Veuillez réessayer. » + « Réessayer », sans quota consommé. Une contradiction reste une réponse sourcée, signalée dans le texte. (3) **Refus** (`REFUS_INFO_ABSENTE` ou `REFUS_HORS_CADRE`, AD-10) : aucun texte ne s'écrit ; le bloc de refus standard correspondant s'affiche d'un coup, sans Source. Marqueur absent ou invalide, ou délai dépassé (§ State Patterns › Attente IA) : panne. Le lecteur d'écran n'annonce la réponse qu'une fois confirmée. |
| Puce de Source | E4 | Une puce par Document cité : les Passages d'un même Document sont regroupés, et leur nombre est indiqué s'il y en a plusieurs (« Procédure de facturation · 2 Passages »). Seules les Sources réellement citées par la réponse apparaissent. `button` (Entrée, Espace ou clic) avec `aria-expanded` et `aria-controls` vers le panneau, de nom accessible « Source {n} : {titre}, {k} Passages » ; elle ouvre E4a et reste « sélectionnée » (fond `{colors.accent-mark}`, voir DESIGN.md) tant que le panneau la montre. Un clic sur une autre Source remplace le contenu du panneau. Une Source supprimée est un simple texte, non focalisable ; si le Document est supprimé pendant que la Conversation est ouverte, la puce prend ce style dès l'échec d'ouverture (E4a). |
| Renvoi ¹ ² | E4 | Simple repère, non cliquable, pour ne pas multiplier les arrêts de tabulation. Il est précédé du texte masqué « Source » (lu « Source 1 »). Le lien se fait par la puce de même numéro. |
| Bloc de refus | E4 | Trois boutons secondaires : « Reformuler la question » (remet la question dans le champ), « Rechercher dans les Documents » (ouvre E5 avec la question en Requête), « Ajouter un Document » (ouvre E8). La variante hors cadre n'a que « Reformuler la question ». |
| Panneau Source (E4a) | E4 | S'ouvre à droite, la Conversation reste visible. En-tête : titre, Catégorie, Auteur, date, Statut, bouton ✕ « Fermer », lien « Ouvrir la page complète ». Défile jusqu'au premier Passage utilisé dans la réponse. Chaque Passage surligné est précédé d'un texte masqué « Passage utilisé {j} sur {k} ». **Plusieurs Passages :** tous sont mis en évidence, le Passage actif se distingue des autres (`{components.passage-highlight}` contre `{components.passage-highlight-inactive}`) ; sous l'en-tête, « Passage {i} sur {k} » avec les boutons « Précédent » et « Suivant », qui font défiler le Document jusqu'au Passage suivant et le rendent actif. Le défilement place toujours le Passage actif entièrement à l'écran, même si deux Passages sont proches. Au clavier, le focus reste sur le bouton actionné et le nouveau repère « Passage {i} sur {k} » est annoncé (`aria-live="polite"`) ; aux extrémités, le bouton concerné passe en `aria-disabled` et garde le focus. Avec un seul Passage, ni compteur ni boutons. Avec `prefers-reduced-motion`, le saut est immédiat. À l'ouverture, le focus va sur le titre du panneau ; à la fermeture (✕ ou Échap), il revient sur la puce d'origine. Sur ordinateur, c'est un `aside` non modal. Sous 1024 px, c'est un `Sheet` modal (fond inerte, focus piégé), en plein écran sous 768 px, avec « ← Retour à la Conversation ». |
| Panneau Historique (E4b) | E4 | Ouvert par le bouton « Historique » de l'en-tête de l'Assistant, il se superpose à gauche de la Conversation ; sous 1024 px, c'est un `Sheet` modal (fond inerte, focus piégé). Il est placé avant le fil dans le DOM. À l'ouverture, le focus va sur la Conversation active, sinon sur la première ligne. Liste de la plus récente à la plus ancienne ; chaque ligne affiche le titre (tiré de la première question) et la date du dernier échange. La Conversation active est mise en évidence. Un clic ouvre la Conversation, referme le panneau et place le focus dans le champ de question. Échap ferme le panneau, et le focus revient sur « Historique ». |
| Lecteur de Document | E4a, E7 | Composant unique, partagé par le panneau et la page. Il reçoit un Document, une liste de Passages (0 à k), l'index du Passage actif et l'indicateur « Document modifié » (P1) ; il gère le défilement, le surlignage, la navigation entre Passages et les messages « Passage introuvable » et « Document modifié ». Il affiche le texte enregistré en **texte brut** : retours à la ligne conservés, Markdown et HTML jamais interprétés (architecture AD-8). Les longues chaînes passent à la ligne (`overflow-wrap: anywhere`). « Ouvrir la page complète » transmet à E7 la liste des Passages et le Passage actif. |
| Résultat de Recherche | E5 | Une carte par Document : titre, Catégorie, Passage pertinent en extrait surligné. Toute la carte est un seul lien vers E7, positionné sur le Passage. L'extrait suit les règles du Lecteur (texte brut, `overflow-wrap: anywhere`). Aucun score affiché. |
| Badge de Statut | E3, E6, E7 | Toujours en texte et symbole, jamais en couleur seule. Mis à jour automatiquement ; un passage à *prêt* ou à *en erreur* est annoncé une fois (`aria-live="polite"`). |
| Bandeau de Statut | E7 | En haut de la page Document. Il porte le message et l'action correspondant au Statut (voir E7). |
| Bloc Résumé | E7 | Placé au-dessus du texte du Document. Bouton « Générer le Résumé » si aucun Résumé n'existe ; sinon, 5 points au plus avec la mention « Résumé généré par l'IA à partir de ce Document · {date} ». Jamais généré automatiquement. Si un Résumé à jour existe déjà (généré entre-temps par un autre Collaborateur, ou double clic), le serveur le renvoie sans nouvel appel ni quota (architecture AD-18) et l'interface l'affiche simplement. Fin de génération annoncée : « Résumé généré. ». |
| Filtres de Bibliothèque | E6 | Liste des Catégories (« Toutes » par défaut), interrupteur « Mes Documents », champ « Rechercher un titre » (sans tenir compte de la casse, correspondance partielle, filtrage pendant la saisie après 250 ms), tri « Plus récents d'abord » ou « Plus anciens d'abord ». Les filtres se cumulent et figurent dans l'URL pour survivre au retour arrière `[ASSUMPTION]`. |
| Confirmation de suppression | E7 (et Historique en P1) | `AlertDialog` : « Supprimer « {titre} » ? » + conséquence + « Annuler » (focus par défaut) et « Supprimer » (destructif). Annuler ne change rien. |
| Notification | Partout | Message bref de confirmation ou d'erreur (Sonner), annoncé aux lecteurs d'écran, qui disparaît après 5 s (erreur : reste jusqu'à fermeture). Pas de centre de notifications. Une notification ne porte jamais une information qui n'existe nulle part ailleurs. |
| Bouton d'envoi | Partout | Dès la première activation, le bouton passe à l'état occupé (`aria-disabled`, libellé d'attente : « Connexion… », « Enregistrement… », « Import… », « Génération du Résumé… », « Relance… ») ; une seconde activation est ignorée. Chaque demande porte un identifiant unique ; « Réessayer » réutilise celui de la tentative échouée, sans doublon de Document, de question ni de décompte de quota (architecture AD-16). |
| Formulaire | E1, E2, E8 | Chaque champ a un libellé visible (exception : un champ unique accompagné de son bouton, voir Accessibility Floor) ; un champ obligatoire est marqué « * » et la légende « * Champ obligatoire » figure en tête. Erreurs sous le champ, liées par `aria-describedby`, avec `aria-invalid`. Le bouton de validation reste focalisable (`aria-disabled`) tant que des champs obligatoires manquent ; s'il est activé, le focus va au premier champ manquant, qui affiche son message `[ASSUMPTION]`. |

## State Patterns

Règles communes à tous les écrans. Le détail par écran est dans la section suivante.

| État | Traitement commun |
|---|---|
| Chargement | `Skeleton` de shadcn reprenant la forme du contenu attendu (lignes, cartes). Jamais d'écran blanc. Pour les lectures (listes, Document, Conversation) et l'enregistrement d'un Document : au-delà de 10 s, message « Le chargement prend plus de temps que prévu. » avec « Réessayer » (NFR-4) `[ASSUMPTION]`. |
| Attente IA | Délais maximaux (architecture AD-16) : Recherche 10 s ; Assistant 20 s jusqu'au premier affichage, 90 s au total ; Résumé 120 s. Au-delà : alerte de panne (`{components.error-alert}`) avec « Réessayer », saisie conservée, aucun quota consommé. « Réessayer » rejoue la même demande, sans doublon. |
| Vide | Une phrase qui explique et une seule action principale. Pas d'illustration. |
| Succès | Résultat visible sur place. Une notification brève seulement si le résultat n'est pas visible à l'écran (ex. suppression → retour à la Bibliothèque). |
| Erreur | `{components.error-alert}` sur place : ce qui s'est passé, puis « Réessayer » si l'erreur est temporaire. La saisie en cours est toujours conservée. |
| Quota atteint (NFR-8) | S'applique à l'Assistant et au Résumé. L'état du quota est lu au chargement de l'Assistant et de la page Document (architecture AD-14) : s'il est atteint, le bloc neutre (pas de rouge) avec le moment du rétablissement s'affiche d'emblée et l'action est désactivée (`aria-disabled`). Si le serveur refuse malgré tout à l'envoi, la question reste dans le champ, n'entre pas dans le fil, et aucune Conversation n'est créée. L'action se réactive d'elle-même au moment indiqué ou au retour sur l'onglet. Aucun appel n'est fait. La Recherche, la Bibliothèque et l'ajout restent disponibles. Le plafond du fournisseur (`AI_BUDGET_EXHAUSTED`, AD-15) n'est pas un quota : il s'affiche comme une panne. |
| Résultat absent | Assistant : refus honnête. Recherche : état FR-15. Bibliothèque : « Aucun Document ne correspond à ces filtres. » + « Réinitialiser les filtres ». |
| Accès refusé / introuvable | E9, avec le même texte pour une ressource inexistante et pour une ressource interdite (on ne révèle pas son existence). Les actions de l'Auteur ne sont jamais montrées à un autre Collaborateur (FR-13). |
| Session expirée | Toute saisie en cours (Note, titre, Catégorie, question) est d'abord copiée dans `sessionStorage`, puis redirection vers E1 avec le message de session expirée. Après connexion : retour à la page demandée (chemin interne uniquement), restauration de la saisie et notification « Votre saisie a été restaurée. ». Le brouillon est effacé après un envoi réussi. |
| Actualisation du Statut | Interrogation toutes les 3 s tant qu'un Document affiché est *en cours de traitement* (architecture AD-6). Après 3 échecs consécutifs : « Le Statut n'a pas pu être actualisé. » + « Actualiser », dans le bandeau (E7) ou au-dessus de la liste (E3, E6) ; reprise automatique au retour de la connexion. |
| Document supprimé pendant la consultation | Panneau Source et page Document : « Ce Document a été supprimé. », sans « Réessayer » (page Document : + « Retour à la Bibliothèque », actions retirées). Listes : la ligne disparaît à la prochaine actualisation. |
| Perte de connexion | Notification d'erreur ; l'action en cours affiche « Réessayer » et la saisie est conservée. |

## Écrans

Pour chaque écran : objectif, composants, actions, états, comportement à 375 px et règles clavier propres à l'écran.

### E1 · Connexion

- **Objectif :** se connecter et arriver sur le Tableau de bord (FR-2).
- **Composants :** logo ; titre « Connexion » ; champs « Adresse e-mail » et « Mot de passe » (avec un bouton « Afficher le mot de passe ») ; bouton principal « Se connecter » ; lien « Créer un compte ».
- **Actions :** se connecter ; aller vers E2.

| État | Traitement |
|---|---|
| Chargement | « Se connecter » devient « Connexion… », inactif. |
| Erreur | « E-mail ou mot de passe incorrect. » au-dessus du formulaire, sans préciser quel champ est faux. Les champs sont conservés et le focus va sur le message. |
| Succès | Redirection vers E3 (ou vers la page demandée). La session dure jusqu'à la déconnexion. |
| Erreur réseau | Message de perte de connexion, avec « Réessayer ». |

- **375 px :** une colonne centrée, champs pleine largeur.
- **Clavier :** focus initial sur « Adresse e-mail » ; Entrée envoie le formulaire.

### E2 · Création de Compte

- **Objectif :** créer un Compte et accéder immédiatement au Tableau de bord (FR-1).
- **Composants :** titre « Créer votre Compte » ; « Adresse e-mail » ; « Mot de passe » avec l'aide visible « 8 caractères minimum » et un bouton « Afficher » ; bouton principal « Créer mon Compte » ; lien « J'ai déjà un Compte ».
- **Actions :** créer le Compte ; aller vers E1.

| État | Traitement |
|---|---|
| Chargement | Bouton « Création… », inactif. |
| Erreur | Sous le champ concerné : « Cette adresse e-mail n'est pas valide. », « Le mot de passe doit contenir au moins 8 caractères. », « Cette adresse e-mail est déjà utilisée. » + lien « Se connecter ». Aucun Compte n'est créé. |
| Succès | Arrivée directe sur E3, sans confirmation par e-mail, dans l'état vide d'un nouveau Collaborateur. |

- **375 px et clavier :** identiques à E1.

### E3 · Tableau de bord

- **Objectif :** donner accès en un clic aux trois actions clés et montrer l'activité récente (FR-3).
- **Composants :**
  1. titre « Tableau de bord » ;
  2. bande d'actions : grand champ « Rechercher dans les Documents… » (Entrée → E5), bouton « Poser une question » (→ nouvelle Conversation E4), bouton « Ajouter un Document » (→ E8) ;
  3. deux listes côte à côte :
     - « Derniers Documents » : les 5 derniers de la Base commune, tous Statuts confondus, avec titre, Catégorie, Auteur et badge de Statut ; lien « Voir la Bibliothèque » ;
     - « Mes dernières Conversations » : les 5 dernières du Collaborateur, avec titre et date ; lien « Voir tout l'Historique ».
- **Actions :** rechercher, poser une question, ajouter, ouvrir un Document (→ E7), ouvrir une Conversation (→ E4).

| État | Traitement |
|---|---|
| Chargement | Squelettes de 5 lignes dans chaque liste ; la bande d'actions est utilisable tout de suite. |
| Vide : Conversations | « Vous n'avez pas encore posé de question. » + deux exemples cliquables tirés du Jeu de démonstration (ex. « Comment poser mes congés ? », « Comment relancer un client qui n'a pas payé ? »), qui ouvrent une nouvelle Conversation avec la question déjà envoyée. |
| Vide : Documents | « La Base commune est encore vide. » + « Ajouter un Document ». |
| Erreur | Erreur dans une liste : l'alerte s'affiche dans cette liste, avec « Réessayer » ; l'autre liste et les actions restent utilisables. |
| Succès | Un Document ajouté par n'importe quel Collaborateur apparaît en tête de liste ; son badge de Statut se met à jour. |

- **375 px :** la bande d'actions s'empile (champ, puis deux boutons pleine largeur) ; les listes s'empilent, Conversations d'abord `[ASSUMPTION]`.
- **Clavier :** focus initial sur le champ de Recherche (UJ-3 commence par une Requête ; règle, voir Interaction Primitives).

### E4 · Assistant

- **Objectif :** poser une question en langage naturel, obtenir une réponse sourcée ou un refus honnête, et poursuivre l'échange (FR-16 à FR-20, FR-22).
- **Composants :**
  - en-tête : titre de la Conversation (tiré de la première question), boutons secondaires « Historique » et « + Nouvelle Conversation » ;
  - fil : bulles de question à droite ; réponses de l'Assistant libres à gauche, avec renvois et puces de Source, ou bloc de refus ;
  - champ de question en bas, toujours visible ;
  - panneau Source (E4a) à droite, panneau Historique (E4b) à gauche, chacun ouvert à la demande.
- **Actions :** envoyer une question ou une question de suivi ; ouvrir une Source ; ouvrir la page complète d'un Document ; reformuler, rechercher ou ajouter après un refus ; réessayer après une panne ; ouvrir l'Historique ; démarrer une nouvelle Conversation.

| État | Traitement |
|---|---|
| Vide (sans Conversation active) | Titre « Que voulez-vous savoir ? » ; phrase « L'Assistant répond uniquement à partir des Documents de NexaWorks et cite ses Sources. » ; champ de question ; deux exemples de questions ; sous le champ, les 5 Conversations les plus récentes et « Voir tout l'Historique ». La Conversation est créée au premier envoi accepté (validation et quota passés), avec le titre de cette question (architecture AD-17). |
| Chargement d'une Conversation | Squelettes de deux échanges ; le champ apparaît une fois les messages chargés. |
| État neutre | La question s'affiche aussitôt dans le fil, puis « Recherche dans les Documents… » avec un indicateur discret. Cet état ne laisse deviner ni une réponse ni un refus. Premier affichage (texte ou bloc de refus) en moins de 5 s (NFR-3) ; délai maximal : § State Patterns › Attente IA. |
| Rédaction | Uniquement pour une réponse sourcée : le texte s'écrit progressivement et reste provisoire ; « Envoyer » reste inactif (`aria-disabled`) jusqu'à la confirmation du serveur. |
| Succès | Réponse confirmée par le serveur, avec renvois et puces de Source validés (architecture AD-11). La Conversation figure dans l'Historique depuis le premier envoi accepté, quelle que soit l'issue. |
| Contradiction | La réponse signale dans son texte que les Documents ne s'accordent pas et cite les deux Sources (FR-16). Aucun rendu dédié. |
| Résultat absent | Refus honnête, affiché directement en bloc après l'état neutre, jamais écrit progressivement, sans Source : information absente (trois suites) ou hors cadre (« Reformuler la question » seulement). |
| Erreur | Panne technique, délai dépassé, sortie inexploitable ou réponse non vérifiable (aucune citation valide) : alerte rouge à la place de la réponse, texte provisoire retiré, question conservée, aucun quota consommé. « Réessayer » rejoue la même demande et remplace la tentative échouée, sans ajouter de bulle. Le serveur enregistre la réponse ou l'échec même si le Collaborateur quitte l'écran : une question restée sans réponse se rouvre avec l'alerte et « Réessayer » (architecture AD-17). |
| Plafond du fournisseur atteint | Alerte de panne « Le service d'IA est momentanément indisponible. Réessayez plus tard. », distincte du quota. |
| Quota atteint | Bloc neutre avec le moment du rétablissement, affiché d'emblée si le quota est déjà atteint au chargement ; champ et « Envoyer » en `aria-disabled`, raison « Limite quotidienne atteinte » reliée au champ ; lien « Ouvrir la Recherche ». Refus à l'envoi : la question reste dans le champ et aucune Conversation n'est créée ; réactivation automatique au moment indiqué. |
| Question trop longue | Envoi bloqué, compteur et bordure en rouge, message sous le champ. |
| Accès refusé | URL d'une Conversation d'un autre Collaborateur, ou supprimée : E9 (FR-22). |

- **375 px :** barre du haut globale (☰ · logo · « + » Ajouter un Document) ; dessous, une ligne d'en-tête avec le titre de la Conversation, « Historique » et « + Nouvelle Conversation ». L'entrée « Assistant » du menu ouvre toujours l'état vide. Fil pleine largeur ; champ fixé en bas, limité à 4 lignes ; viewport `interactive-widget=resizes-content` (ou `visualViewport`) pour que le champ reste au-dessus du clavier virtuel ; `scroll-padding-bottom` égal à la hauteur du champ et `scroll-padding-top` égal à la barre, pour qu'aucun élément focalisé ne soit masqué (WCAG 2.4.11). Panneaux Source et Historique en `Sheet` modaux plein écran.
- **Clavier :** à l'ouverture d'une nouvelle Conversation, focus dans le champ ; Entrée envoie (clavier physique) ; le fil précède le champ dans le DOM : depuis le champ, Maj+Tab remonte vers les puces de Source de la dernière réponse ; Échap ferme le panneau ouvert.
- **Maquette :** [mockups/key-assistant.html](mockups/key-assistant.html).

#### E4a · Panneau Source

| État | Traitement |
|---|---|
| Chargement | Squelette de l'en-tête et de trois paragraphes. |
| Succès : un Passage | Document affiché, défilé jusqu'au Passage utilisé, surligné et étiqueté. Ni compteur ni boutons. |
| Succès : plusieurs Passages | Défilé jusqu'au premier Passage utilisé, actif ; les autres surlignés plus légèrement ; « Passage 1 sur {k} », « Précédent » (inactif) et « Suivant ». |
| Passage introuvable | Document affiché en entier depuis le début, sans surlignage, avec le message « Passage introuvable » en tête. La consultation n'est pas bloquée. |
| Un des Passages introuvable | Les Passages retrouvés sont surlignés et parcourables (compteur ramené à leur nombre) ; message « Un des Passages cités n'a pas pu être retrouvé dans ce Document. » en tête. |
| Document modifié (P1, si FR-11 livré) | Comportement FR-17 inchangé : Document affiché sans aucune mise en évidence ni compteur, avec le message : « Ce Document a été modifié depuis cette réponse. Le Passage cité n'est plus mis en évidence. » |
| Document supprimé | Connu au chargement de la Conversation : puce non cliquable (FR-12). Supprimé pendant la consultation : « Ce Document a été supprimé. », sans « Réessayer » ; la puce passe aussitôt au style supprimé. |
| Erreur | Alerte dans le panneau avec « Réessayer » ; la Conversation reste utilisable. |

#### E4b · Panneau Historique

| État | Traitement |
|---|---|
| Chargement | Squelette de 6 lignes. |
| Vide | « Aucune Conversation pour le moment. » + « Poser une première question » (place le focus dans le champ). |
| Succès | Liste complète, du plus récent au plus ancien. Conversations du Collaborateur connecté uniquement (FR-22). |
| Erreur | « L'Historique n'a pas pu être chargé. » + « Réessayer ». |

### E5 · Recherche

- **Objectif :** retrouver des Documents par le sens et voir le Passage pertinent, sans texte rédigé par l'IA (FR-14, FR-15).
- **Composants :** titre « Recherche » ; phrase d'aide « Décrivez ce que vous cherchez avec vos propres mots. » ; champ de Requête avec bouton « Rechercher » ; liste de 5 Documents au plus, au-dessus du seuil de pertinence, classés par pertinence, un Document par ligne.
- **Actions :** lancer une Requête ; ouvrir un résultat (→ E7 au Passage) ; depuis l'état sans résultat, « Poser la question à l'Assistant » (→ E4, question pré-remplie).

| État | Traitement |
|---|---|
| Vide (pas encore de Requête) | Phrase d'aide et trois exemples de Requêtes. |
| Chargement | Trois cartes squelettes ; résultats attendus en moins de 3 s (NFR-3). |
| Succès | « {n} Documents pertinents » (annoncé aux lecteurs d'écran), puis les cartes. Il peut y en avoir moins de 5. Seuls les Documents *prêts* figurent (FR-8). |
| Résultat absent | Message de Recherche sans résultat + « Poser la question à l'Assistant ». Jamais de liste de résultats sans rapport (FR-15). |
| Erreur | Alerte « La Recherche n'a pas pu aboutir. » + « Réessayer » ; la Requête est conservée. |
| Quota | Sans objet : la Recherche ne consomme pas d'appel de génération (addendum, D4). |

- **375 px :** champ et bouton empilés ; cartes pleine largeur ; le Passage revient à la ligne, sans défilement horizontal.
- **Clavier :** focus initial dans le champ (ou sur l'annonce du nombre de résultats si l'on arrive avec `?q=`) ; Entrée lance la Requête ; chaque carte est un seul arrêt de tabulation.

### E6 · Bibliothèque

- **Objectif :** parcourir tous les Documents de la Base commune, quel que soit leur Statut, et les retrouver (FR-9).
- **Composants :** titre « Bibliothèque » et « + Ajouter un Document » ; barre de filtres (Catégorie, « Mes Documents », recherche par titre, tri) ; tableau avec les colonnes Titre, Catégorie, Auteur, Date d'ajout, Statut de traitement.
- **Actions :** filtrer, rechercher par titre, trier, ouvrir un Document (→ E7), réinitialiser les filtres.

| État | Traitement |
|---|---|
| Chargement | Squelette de 8 lignes. |
| Vide (Base vide) | « La Base commune est encore vide. » + « Ajouter un Document ». |
| Vide (« Mes Documents ») | « Vous n'avez encore ajouté aucun Document. » + « Ajouter un Document » (FR-9). |
| Résultat absent | « Aucun Document ne correspond à ces filtres. » + « Réinitialiser les filtres ». |
| Succès | Liste, les plus récents d'abord par défaut. Les Statuts se mettent à jour sans rechargement. Le nombre de Documents affichés est annoncé à chaque changement de filtre. |
| Erreur | Alerte + « Réessayer » ; les filtres sont conservés. |

- **375 px :** le tableau devient une liste de cartes (titre, puis Catégorie · Auteur · date, puis badge de Statut) ; les filtres se replient sous un bouton « Filtres ({n}) » ; la recherche par titre reste visible.
- **Clavier :** chaque ligne est un seul lien (le titre), la ligne entière étant cliquable à la souris ; les en-têtes de colonne ne servent pas au tri (le tri passe par sa propre liste).

### E7 · Document

- **Objectif :** lire un Document et ses informations, suivre son Statut de traitement, obtenir son Résumé et, pour l'Auteur, le gérer (FR-7, FR-8, FR-10, FR-12, FR-13, FR-23).
- **Composants :**
  - en-tête : titre ; Catégorie, Auteur, date d'ajout ; badge de Statut ;
  - bandeau de Statut (sauf pour *prêt* déjà vu) ;
  - barre d'actions : « Poser une question » et « Générer le Résumé » (si *prêt*) ; « Supprimer » (Auteur seulement) ; « Modifier » (Auteur, P1) ; « Télécharger le fichier d'origine » (P2) ;
  - bloc Résumé ;
  - lecteur de Document (texte en `{typography.reading}`) ;
  - si l'on arrive depuis une Source : lien « ← Retour à la Conversation ».
- **Actions :** poser une question (nouvelle Conversation sur toute la Base commune, la réponse n'étant pas limitée à ce Document) ; générer le Résumé ; relancer le traitement (Auteur, erreur temporaire) ; supprimer (Auteur).

| État | Traitement |
|---|---|
| Chargement | Squelette de l'en-tête et du texte. |
| Juste ajouté | Notification « Document ajouté. Traitement en cours. » ; contenu et informations visibles tout de suite. |
| En cours de traitement (0 à 60 s) | Bandeau « ◔ En cours de traitement » + « Le Document sera interrogeable dans quelques instants. » ; « Poser une question » et « Générer le Résumé » absents, remplacés par « Le Résumé sera disponible quand le Document sera prêt. ». Quitter la page n'interrompt pas le traitement. Mise à jour automatique. |
| En cours de traitement (au-delà de 60 s) | Même bandeau, avec le message « Le traitement prend plus de temps que prévu. Vous pouvez quitter cette page sans l'interrompre. » Le délai se compte depuis le début du traitement enregistré par le serveur, pas depuis l'ouverture de la page : le message reste exact après un rechargement et pour un autre Collaborateur. Le seuil de 60 s est indicatif (NFR-3). |
| Traitement bloqué (au-delà de 3 min) | Le **serveur** fait passer le Document *en erreur* temporaire. Message pour l'Auteur : « Le traitement n'a pas pu aboutir. Vous pouvez le relancer. » ; pour les autres : « Le traitement n'a pas pu aboutir. Seul l'Auteur de ce Document peut relancer le traitement. » Ce Statut est enregistré, donc identique pour tous et après rechargement. Le Document n'est pas interrogeable (FR-8). L'Auteur voit « Relancer le traitement » ; les autres voient le Statut et le message, sans action. Un traitement qui aboutirait en retard ne remet pas le Document à *prêt* : seule une relance, repartant d'un état propre, peut le rendre *prêt* (architecture AD-5, AD-6). |
| Statut non actualisé | Voir State Patterns › Actualisation du Statut. |
| Prêt | Bandeau vert « Votre Document est prêt. » s'il vient de changer d'état (annoncé), puis les actions apparaissent. Ouverture ultérieure : badge seul, sans bandeau. |
| En erreur : temporaire | Bandeau rouge avec la raison ; « Relancer le traitement » pour l'Auteur, qui fait repasser le Document *en cours de traitement* puis *prêt*. Un autre Collaborateur voit la raison suivie de « Seul l'Auteur de ce Document peut relancer le traitement. », sans action (FR-7). Pendant la relance, le bouton affiche « Relance… » (`aria-disabled`) jusqu'au changement de Statut. |
| En erreur : sans texte exploitable | Bandeau rouge avec la raison ; « Supprimer » pour l'Auteur ; aucune relance. |
| Passage mis en évidence | Arrivée depuis E5 : un Passage, étiquette « Passage pertinent ». Arrivée par « Ouvrir la page complète » : la liste des Passages et le Passage actif sont transmis ; même navigation « Passage {i} sur {k} » + « Précédent » / « Suivant » que le panneau. Passage introuvable : même message que E4a. |
| Résumé : génération | Le bouton devient « Génération du Résumé… » (`aria-disabled`), puis 3 lignes squelettes ; délai maximal 120 s (§ State Patterns › Attente IA). |
| Résumé : succès | 5 points au plus, mention de génération par l'IA, annonce « Résumé généré. » ; réaffiché à tous les Collaborateurs, sans régénération (FR-23). Résumé déjà généré entre-temps : il est simplement affiché, sans appel ni quota (architecture AD-18). |
| Résumé : erreur | Alerte dans le bloc « Le Résumé n'a pas pu être généré. » + « Réessayer ». |
| Résumé : quota atteint | Lu au chargement de la page : bloc neutre avec le moment du rétablissement, bouton en `aria-disabled` d'emblée ; réactivation automatique au moment indiqué. |
| Suppression | `AlertDialog` ; en cas de confirmation, retour à E6 et notification « Document supprimé. ». Annuler laisse tout intact. |
| Accès refusé / introuvable | Identifiant invalide ou Document supprimé avant l'ouverture : E9. |
| Supprimé pendant la consultation | Bandeau « Ce Document a été supprimé. » + « Retour à la Bibliothèque », actions retirées, sans « Réessayer ». |

- **375 px :** les métadonnées passent à la ligne ; la barre d'actions s'empile en boutons pleine largeur ; le texte est limité à la largeur de l'écran, sans défilement horizontal (`overflow-wrap: anywhere` : longues URL et mots sans espace passent à la ligne).
- **Clavier :** focus initial sur le titre ; si un Passage est visé, focus sur le Passage (`tabindex="-1"`) pour qu'il soit lu en premier.

### E8 · Ajouter

- **Objectif :** créer une Note ou importer un fichier en une minute (FR-4, FR-5, FR-7).
- **Composants :** titre « Ajouter un Document » ; légende « * Champ obligatoire » ; onglets « Note » (par défaut) et « Fichier » ; bouton « Annuler ».
  - **Onglet Note :** « Titre * », « Catégorie * » (liste fixe des 7 Catégories, sans valeur par défaut), « Texte * » (grande zone), bouton principal « Enregistrer ».
  - **Onglet Fichier :** zone de dépôt avec bouton « Choisir un fichier » et mention « Formats acceptés : .txt et .md, 10 Mo au maximum. » (le PDF n'est annoncé que lorsque FR-6 est livré) ; « Titre * » prérempli avec le nom du fichier sans extension, modifiable ; « Catégorie * » ; bouton principal « Importer ».
- **Actions :** enregistrer ou importer ; changer de fichier ; annuler.

| État | Traitement |
|---|---|
| Vide | Onglet Note, champs vides, focus sur « Titre ». |
| Validation | Bouton actif seulement si les champs obligatoires sont remplis (rendu `aria-disabled`, voir Formulaire). Erreurs sous le champ concerné : « Indiquez un titre. », « Choisissez une Catégorie. », « Le texte ne peut pas être vide. » |
| Refus immédiat du fichier | Format non pris en charge ou fichier de plus de 10 Mo : refus avant tout envoi, message dans la zone de dépôt, autres champs conservés (FR-7). |
| Dépôt du fichier | Dès le choix d'un fichier valide, il est déposé dans l'espace privé, avant toute création de Document (AD-7) : barre de progression « Dépôt du fichier… » dans la zone de dépôt, « Importer » inactif (`aria-disabled`) jusqu'à la fin. Échec du dépôt : « Le fichier n'a pas pu être déposé. » + « Réessayer », autres champs conservés. |
| Chargement | « Enregistrement… » ou « Import… », bouton occupé (`aria-disabled`), formulaire verrouillé. Au-delà de 10 s sans réponse : alerte « Le Document n'a pas pu être enregistré. Votre saisie est conservée. », formulaire déverrouillé ; « Réessayer » rejoue la même demande, sans doublon (architecture AD-16). |
| Succès | Redirection vers E7 (« Document ajouté. Traitement en cours. »). |
| Erreur | Échec de l'envoi : alerte au-dessus du bouton avec « Réessayer » ; toute la saisie est conservée. |
| Annuler | Retour à l'écran précédent ; si une saisie est en cours, `AlertDialog` « Abandonner ce Document ? Votre saisie sera perdue. » [Continuer la saisie] [Abandonner]. Le même dialogue s'affiche pour toute navigation interne pendant une saisie (barre latérale, « + Ajouter », retour arrière) ; fermeture ou rechargement de l'onglet : avertissement du navigateur (`beforeunload`). |

- **375 px :** onglets pleine largeur ; zone de dépôt réduite au bouton « Choisir un fichier » ; boutons empilés, le bouton principal en premier.
- **Clavier :** les onglets se parcourent aux flèches (Radix) ; la zone de dépôt est entièrement utilisable au clavier par le bouton « Choisir un fichier ».

### E9 · Accès refusé / introuvable

- **Objectif :** sortir d'une URL invalide ou interdite sans rien révéler (FR-13, FR-22).
- **Composants :** titre « Page introuvable » ; texte « Cette page n'existe pas ou ne vous est pas accessible. » ; boutons « Retour au Tableau de bord » et « Ouvrir l'Assistant ».
- **États :** un seul, identique pour une ressource inexistante, supprimée ou appartenant à un autre Collaborateur. Une tentative de modification ou de suppression refusée côté serveur (FR-13) affiche une notification d'erreur « Cette action n'est pas autorisée. » et ne change rien.
- **375 px et clavier :** une colonne ; focus sur le titre.

## Interaction Primitives

- **Souris et clavier à égalité :** aucune action n'existe seulement au survol ; tout est atteignable au clavier, dans l'ordre de lecture.
- **Touches propres à l'application :** Entrée envoie une question ou une Requête ; Maj+Entrée va à la ligne dans le champ de question (clavier physique ; écran tactile et composition IME : voir Champ de question) ; Échap ferme le panneau, le menu ou le dialogue du dessus. Aucun raccourci à une lettre, pour éviter les conflits avec les lecteurs d'écran `[ASSUMPTION]`.
- **Gestion du focus :**
  - à chaque changement d'écran, le focus va sur le titre de l'écran (h1), ou sur le champ principal quand l'écran sert à saisir (E1, E2, E3 — champ de Recherche, première étape d'UJ-3 —, E4 nouvelle Conversation, E5, E8) ;
  - à l'ouverture d'un panneau, le focus va dans le panneau ; à la fermeture, il revient sur l'élément qui l'a ouvert (exception : après le choix d'une Conversation dans l'Historique, il va dans le champ de question) ;
  - après un envoi qui échoue, le focus va sur le message d'erreur.
- **Boutons inactifs :** tout bouton qui peut devenir inactif en ayant le focus (« Précédent » / « Suivant », « Envoyer », « Générer le Résumé », « Se connecter », « Enregistrer ») utilise `aria-disabled`, jamais `disabled`, pour ne pas perdre le focus.
- **Lien d'évitement :** « Aller au contenu » en premier arrêt de tabulation, visible au focus.
- **Mises à jour automatiques :** le Statut de traitement se met à jour sans action (interrogation toutes les 3 s, architecture AD-6) ; aucune mise à jour ne déplace le focus ni le défilement.
- **Pas de panneaux empilés :** un seul panneau ou dialogue ouvert à la fois. Ouvrir l'Historique ferme le panneau Source, et inversement.
- **Animations :** fonctionnelles et brèves (≤ 200 ms : ouverture de panneau, défilement vers le Passage). `prefers-reduced-motion` les supprime, défilement compris.

## Accessibility Floor

Objectif : NFR-7 (UJ-1 à UJ-3 réalisables au clavier seul, texte au contraste AA, libellé pour chaque champ), visé au niveau WCAG 2.2 AA sur les points ci-dessous.

- **Contraste :** valeurs vérifiées dans `DESIGN.md › Colors` (texte ≥ 4,5:1, éléments d'interface ≥ 3:1).
- **Clavier seul :** les trois parcours (§ Key Flows) sont réalisables de bout en bout sans souris ; anneau de focus plein `{colors.ring}` de 2 px avec un décalage de 2 px sur tout élément interactif, sans l'opacité de 50 % appliquée par défaut par shadcn (sinon 2,42:1).
- **Libellés :** chaque champ a un `<label>` visible, sauf un champ unique accompagné de son bouton (question à l'Assistant, Recherche du Tableau de bord), qui a un libellé masqué (« Votre question », « Rechercher dans les Documents ») en plus de son texte indicatif. Listes de la Bibliothèque : « Catégorie », « Trier par ». En quota atteint, la raison « Limite quotidienne atteinte » est reliée au champ par `aria-describedby`. Les boutons faits d'une icône seule (☰, ✕, « + ») ont un nom accessible (« Ouvrir le menu », « Fermer », « Ajouter un Document »).
- **Sources et Passages :** renvoi précédé du texte masqué « Source » ; puce de nom accessible « Source {n} : {titre}, {k} Passages » ; chaque Passage surligné précédé du texte masqué « Passage utilisé {j} sur {k} ».
- **Débordement :** `overflow-wrap: anywhere` sur le Lecteur, les titres, les puces, les bulles, les réponses et les cartes ; `min-width: 0` sur les éléments flex et grid. Tests au Jeu de démonstration : Document « .md piège » (HTML et JavaScript affichés en texte, aucun script exécuté, mise en évidence correcte) et Document « piège à 375 px » (URL de 120 caractères, mot sans espace, tableau Markdown de 5 colonnes affiché en texte brut).
- **Couleur jamais seule :** Statuts, Sources supprimées et erreurs combinent couleur, symbole et texte.
- **Structure :** un h1 par écran ; repères `nav`, `main`, `aside` (panneaux) ; le fil de Conversation est une liste de messages, chacun précédé de « Vous » ou « Assistant » pour les lecteurs d'écran.
- **Annonces (`aria-live="polite"`) :** fin de réponse de l'Assistant, changement de Statut de traitement, nombre de résultats de Recherche et de Bibliothèque, notifications. Erreurs bloquantes : `role="alert"`.
- **Zoom :** utilisable à 200 % de zoom et à 375 px de large sans perte de contenu ni défilement horizontal.
- **Cibles tactiles :** 40 × 40 px minimum à 375 px `[ASSUMPTION]`.

## Responsive & Platform

| Largeur | Comportement |
|---|---|
| ≥ 1024 px | Barre latérale fixe. Assistant : Conversation au centre, panneau Source à droite et panneau Historique à gauche, superposés au besoin. Bibliothèque en tableau. |
| 768–1023 px | Barre latérale repliée (☰), barre du haut globale. Les panneaux Source et Historique sont des `Sheet` modaux superposés à la Conversation (fond inerte, focus piégé). Bibliothèque en tableau resserré (colonne Auteur masquée et reportée sous le titre). |
| < 768 px (référence 375 px) | Barre du haut globale : ☰ · logo · « + » (nom accessible « Ajouter un Document »), identique sur tous les écrans ; l'Assistant ajoute dessous sa ligne d'en-tête (« Historique », « + Nouvelle Conversation »). Une seule colonne, marges `{spacing.gutter-mobile}`. Panneaux en `Sheet` modaux plein écran avec un bouton de retour. Bibliothèque en cartes. Champ de question fixé en bas. Aucun défilement horizontal : lecture d'un Document, Recherche et Conversation vérifiées à 375 px (NFR-6). |

## Inspiration & Anti-patterns

- **À reprendre :** la disposition des assistants conversationnels courants (barre latérale, fil, champ en bas), parce qu'elle est familière ; le panneau latéral de vérification, pour que contrôler une Source ne coûte pas le fil de la Conversation.
- **Rejeté :** dégradés violets, néon, robots, cerveaux et étincelles « IA », illustrations futuristes, effets de frappe artificiels. Ces codes donnent un air de gadget et nuisent à la crédibilité.
- **Rejeté :** refus de l'Assistant présenté comme une erreur (rouge, icône d'alerte). Un refus juste est une qualité du produit (SM-C1), pas une panne.
- **Rejeté :** score de pertinence affiché dans la Recherche, qui donnerait une fausse précision.
- **Rejeté :** centre de notifications, animations décoratives, célébrations de succès.
- **Rejeté :** Résumé généré automatiquement à l'ajout (FR-23).

## Key Flows

### UJ-1. Camille retrouve une procédure sans déranger personne.

Camille, cheffe de projet, déjà connectée, doit relancer un client pour une facture impayée.

1. Sur le Tableau de bord, elle active « Poser une question ». E4 s'ouvre sur une nouvelle Conversation, le curseur dans le champ.
2. Elle tape « comment je relance un client qui n'a pas payé ? » puis Entrée. Sa question s'affiche, puis « Recherche dans les Documents… ».
3. En moins de 5 s, la réponse commence : une phrase directe, puis les étapes numérotées avec leurs renvois ¹ ².
4. Sous la réponse apparaissent deux puces de Source : « 1 · Procédure de facturation · 2 Passages » (les étapes J+15 et J+45 en viennent) et « 2 · FAQ comptabilité ».
5. **Climax :** elle clique sur la Source 1. Le panneau s'ouvre à droite, déjà défilé jusqu'au premier Passage, surligné : « … une relance amiable est envoyée par e-mail 15 jours après l'échéance ». Elle vérifie le délai exact sans quitter la Conversation. « Suivant » l'amène au Passage J+45, qui devient actif. Elle ferme le panneau (Échap) ; le focus revient sur la Source.
6. **Résolution :** elle applique la procédure. La Conversation est déjà dans son Historique.

**Cas limite :** elle demande « quel est le budget marketing 2027 ? ». L'Assistant répond dans le fil, d'un ton calme et sans Source : « Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer. » Trois suites lui sont proposées ; aucun chiffre n'apparaît.

**Échec :** le service d'IA ne répond pas → alerte rouge « La réponse n'a pas pu être générée. », question conservée, « Réessayer ».

### UJ-2. Camille ajoute un compte rendu et l'interroge aussitôt. *(parcours de démonstration)*

Camille sort d'une réunion client et veut que l'équipe en profite.

1. Elle clique sur « + Ajouter » dans la barre latérale. E8 s'ouvre sur l'onglet Note, focus sur « Titre ».
2. Elle saisit « CR réunion Dupont — 3 novembre », choisit la Catégorie « Compte rendu client » et colle son texte. « Enregistrer » devient actif.
3. Elle enregistre. Elle arrive sur la page du Document : notification « Document ajouté. Traitement en cours. », bandeau « ◔ En cours de traitement », texte déjà lisible. Dans la Bibliothèque, le même Document apparaît en tête avec le même badge.
4. Quelques secondes plus tard, sans recharger, le bandeau passe au vert : « Votre Document est prêt. » (annoncé). « Poser une question » et « Générer le Résumé » apparaissent.
5. Elle clique sur « Poser une question » et écrit une question formulée autrement que dans sa note (« qu'a-t-on promis au client sur les délais de livraison ? »).
6. **Climax :** la réponse cite comme Source « CR réunion Dupont — 3 novembre » : le Document ajouté une minute plus tôt est déjà interrogeable et sert de preuve.
7. **Résolution :** via la Source puis « Ouvrir la page complète », elle revient au Document et clique sur « Générer le Résumé ». Cinq points clés s'affichent au-dessus du texte ; ses collègues les verront en ouvrant le Document.

**Cas limite :** elle importe par erreur un fichier .txt vide (onglet Fichier, titre prérempli, Catégorie choisie, « Importer »). Sur la page du Document, le bandeau passe *en erreur* : « Ce fichier ne contient aucun texte exploitable. Il ne peut pas être interrogé. », avec seulement « Supprimer ». Elle confirme ; elle revient à la Bibliothèque avec la notification « Document supprimé. ». *Variante si FR-6 est livré :* le même cas avec un PDF scanné.

**Échec :** service d'IA indisponible pendant le traitement → *en erreur* temporaire, « Relancer le traitement » ; le Document repasse *en cours* puis *prêt*, sans nouvel import.

### UJ-3. Lucas, nouvel arrivant, découvre les usages de l'entreprise.

Lucas, arrivé lundi, ne sait pas encore où se trouve quoi.

1. Sur E2, il crée son Compte (e-mail, mot de passe de 8 caractères ou plus) et arrive directement sur le Tableau de bord. La liste de ses Conversations est vide et propose des exemples de questions.
2. Le focus est déjà dans le champ de Recherche. Il tape « organisation des congés » puis Entrée. E5 s'ouvre : « 3 Documents pertinents ».
3. La première carte, « Procédure congés et absences » (Procédure), montre le Passage pertinent surligné. Il l'ouvre : la page du Document défile jusqu'à ce Passage.
4. Il clique sur « Poser une question » et demande « comment poser mes congés ? ». La réponse arrive en étapes numérotées, avec ses Sources.
5. Il enchaîne : « et si je pose moins de 3 jours ? ».
6. **Climax :** l'Assistant comprend qu'il parle toujours des congés et répond sur la même procédure, Sources à l'appui. Lucas n'a rien eu à reformuler.
7. **Résolution :** le lendemain, il ouvre l'Assistant. Sous le champ figurent ses Conversations récentes ; il rouvre la veille (ou passe par « Historique »). Tous les messages et Sources sont là ; il pose une nouvelle question dans la même Conversation.

**Clavier seul :** chaque étape se fait sans souris : Tab jusqu'au champ, Entrée, Tab jusqu'à la carte, Entrée, Tab jusqu'à « Poser une question », etc. (NFR-7).

**Échec :** aucun résultat pertinent → « Aucun Document ne correspond suffisamment à votre recherche… » + « Poser la question à l'Assistant ».

## Ajouts P1 et P2

Ces ajouts se branchent sur les écrans existants. S'ils ne sont pas livrés, leur emplacement reste simplement vide.

| Priorité | Exigence | Emplacement | Comportement |
|---|---|---|---|
| P1 | FR-11 Modifier son Document | E7, bouton « Modifier » (Auteur) | Passe la page en édition (titre, Catégorie, texte pour une Note) avec « Enregistrer » / « Annuler ». Après modification du texte, le Statut repasse *en cours* puis *prêt*. Un Résumé existant est signalé « Résumé obsolète : le Document a changé. » avec « Générer un nouveau Résumé ». Dans les Conversations, les Sources vers ce Document affichent le message « Document modifié » (E4a). |
| P1 | FR-21 Supprimer une Conversation | E4b, menu « ⋯ » sur chaque ligne | `AlertDialog` « Supprimer cette Conversation ? Elle sera définitivement retirée de votre Historique. ». La Conversation disparaît de l'Historique et du Tableau de bord ; si elle était ouverte, l'écran revient à l'état vide de l'Assistant. |
| P2 | FR-6 Importer un PDF | E8, onglet Fichier | « .pdf » ajouté à la mention des formats. Un PDF sans texte exploitable suit le même parcours que le .txt vide. |
| P2 | FR-10 Téléchargement | E7, « Télécharger le fichier d'origine » (Fichiers importés seulement) | Télécharge le fichier identique ; erreur → notification avec « Réessayer ». |

## Hypothèses et questions ouvertes

| # | Hypothèse | Où |
|---|---|---|
| H1 | *(résolue, architecture §6)* Routes d'écran en français, identifiants opaques (uuid), jamais tirés d'un titre | IA |
| H3 | *(résolue, AD-14)* Le quota se rétablit à 00:00 UTC ; l'interface affiche l'heure locale de `resetAt` dans le fuseau du navigateur | Voice and Tone, E4, E7 |
| H4 | *(confirmée, AD-11)* Les puces de Source apparaissent à la confirmation du serveur, d'après les citations validées | E4 |
| H5 | *(résolue, AD-11, AD-17)* Une réponse interrompue ou non vérifiable est retirée et remplacée par l'alerte ; l'échec est enregistré et réessayable | E4 |
| H6 | Le bouton de validation inactif reste focalisable (`aria-disabled`) et renvoie au premier champ manquant | Formulaire, E8 |
| H7 | Au-delà de 10 s de chargement (lectures et enregistrement), message et « Réessayer » ; les attentes IA suivent AD-16 | State Patterns |
| H8 | Après une session expirée, saisie restaurée depuis `sessionStorage` et retour à la page demandée (chemin interne) | State Patterns |
| H9 | Les filtres de la Bibliothèque sont conservés dans l'URL | E6 |
| H10 | À 375 px, sur le Tableau de bord, les Conversations passent avant les Documents (le focus initial sur la Recherche est désormais une règle) | E3 |
| H11 | Aucun raccourci clavier à une lettre | Interaction Primitives |
| H12 | Cibles tactiles de 40 × 40 px minimum à 375 px | Accessibility Floor |
| H13 | *(confirmée, AD-11)* Les renvois ¹ ² s'appuient sur les citations `[P{n}]` validées par le serveur | E4, DESIGN.md |
| H14 | Les exemples de questions et de Requêtes des états vides viennent du Jeu de démonstration (PRD §9.6) | E3, E4, E5 |

H2 (police Geist Sans) est retirée : `src/app/layout.tsx` charge bien Geist.

### Écarts et précisions par rapport au PRD

Aucun écart ne contredit une exigence. Les points ci-dessous précisent ou complètent le PRD ; certains sont à reporter dans le PRD s'ils sont validés.

| # | Sujet | PRD | UX | Nature |
|---|---|---|---|---|
| X1 | Arrivée après l'ajout (UJ-2) | « Le Document apparaît dans la Bibliothèque avec le Statut *en cours*, puis *prêt* » | Redirection vers la page du Document, où l'on suit le Statut ; le Document figure aussi dans la Bibliothèque, avec le même Statut à jour | Précision du récit d'UJ-2, critères FR-7 respectés |
| X2 | Statut sur le Tableau de bord | FR-7 : visible dans la Bibliothèque et sur la page du Document | Également sur les 5 derniers Documents du Tableau de bord | Ajout cohérent avec FR-3 (« quel que soit leur Statut ») |
| X3 | Bornes du §9.7 | Nombre maximal de résultats de Recherche à fixer | 5 Documents au plus, au-dessus du seuil, sans pagination ni score | Borne fixée par l'UX |
| X4 | Ton des réponses (§9.4) | Point ouvert | Vouvoiement, réponse directe d'abord, étapes numérotées, « je » pour l'Assistant | Point fermé par l'UX ; à refléter dans le prompt de l'Assistant |
| X5 | Accès refusé (FR-22) | « Une tentative directe […] est refusée » | Même page pour « introuvable » et « interdit », pour ne pas révéler l'existence d'une Conversation | Précision |
| X6 | Quota (NFR-8) | Quota sur les questions et les Résumés | Recherche, Bibliothèque et ajout restent disponibles quand le quota est atteint, et l'écran le dit | Précision conforme à D4 (la Recherche n'appelle pas la génération) |
| X7 | « Poser une question » depuis un Document | Non décrit | Ouvre une nouvelle Conversation sur toute la Base commune, sans limiter la réponse au Document | Ajout ; la limitation reste hors périmètre (§6.2) |
| X8 | Nom dans la navigation | Glossaire : « Recherche sémantique » | Entrée de navigation « Recherche » ; le terme complet figure dans les textes d'aide | Abréviation d'interface |
| X9 | Inscription : e-mail déjà utilisé | FR-1 exige un message explicite | Message explicite conservé. Il révèle qu'un Compte existe, ce qui est acceptable avec des données fictives (§4.1) | Signalé pour un usage réel |
| X10 | Dépendance au Jeu de démonstration | Contenu produit après le PRD | Les états vides en reprennent les exemples (H14) | Dépendance à planifier |
| X11 | Traitement bloqué | FR-7 ne prévoit que deux causes d'erreur (temporaire, sans texte exploitable) ; NFR-4 interdit le chargement infini | Message après 60 s ; au-delà de 3 min, passage *en erreur* temporaire décidé par le serveur ; un traitement tardif n'est jamais promu à *prêt* sans relance | Reporté dans l'addendum (« Traitement non bloquant ») ; arbitré en architecture (AD-5, AD-6) |
| X12 | Refus décidé pendant la rédaction | FR-18 décrit le refus, pas le moment où il est connu | Après l'état neutre, deux présentations seulement : réponse écrite progressivement (provisoire jusqu'à la validation des citations), ou bloc de refus affiché d'un coup. Marqueur interne à trois valeurs (`REPONSE`, `REFUS_INFO_ABSENTE`, `REFUS_HORS_CADRE`), consommé par le serveur et jamais affiché ; une contradiction reste une `REPONSE` signalée dans le texte ; marqueur absent ou invalide → panne avec « Réessayer » | Reporté dans l'addendum (chaîne RAG, étape 6) ; arbitré en architecture (AD-10, AD-11) |

**Points tranchés par l'architecture** ([architecture-nexamind-ai.md](../../architecture/architecture-projet-ia-2026-11-03/architecture-nexamind-ai.md)) : actualisation du Statut et horodatage serveur → AD-6 ; expiration à 3 min et rejet d'un résultat tardif → AD-5, AD-6 ; quota et `resetAt` → AD-14 ; plafond du fournisseur → AD-15 ; marqueur et refus → AD-10 ; validation des citations et renvois → AD-11 ; texte brut, Passage introuvable et Document modifié → AD-8 ; délais et identifiants de demande → AD-16 ; création des Conversations et échecs enregistrés → AD-17 ; Résumé unique → AD-18 ; format d'erreur → AD-19.
