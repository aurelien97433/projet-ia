---
title: "Revue UX — États, impasses et règles d'accès"
reviewed: [DESIGN.md, EXPERIENCE.md, mockups/key-assistant.html]
sources: [prd.md, addendum.md, .memlog.md]
date: 2026-11-03
---

# Revue UX — États, impasses et règles d'accès

## Verdict global

**Aucun constat bloquant. 12 constats importants et 11 mineurs.** Les spines peuvent passer en architecture à condition de trancher d'abord les constats importants.

Les spines sont solides sur l'essentiel. Chaque écran a ses états de base. Le refus honnête est bien séparé de la panne. Les actions de l'Auteur ne sont jamais montrées aux autres (FR-13). E9 ne révèle rien (FR-22). Les Documents non *prêts* sont exclus de la Recherche, des Sources et du Résumé (FR-8). Je n'ai trouvé aucune fuite de Conversation vers un autre Collaborateur.

Les défauts se concentrent sur quatre familles :
1. **Délais de garde manquants** pour les opérations longues. NFR-4 interdit le chargement infini.
2. **Interruptions et concurrence** : Document supprimé pendant sa lecture, deux Collaborateurs, double envoi, deux onglets.
3. **Cas d'interruption dans l'Assistant** : Conversation créée sans réponse, réponse sans Source, marqueur REPONSE/REFUS trop pauvre.
4. **Textes et actions vus par un non-Auteur** sur un Document en erreur.

Aucune correction ne remet en cause une décision du `.memlog.md`. Deux d'entre elles complètent le mécanisme X12 (Trou B), signalé « oui, à la marge ».

---

## Constats importants

### S1 — Délais de garde absents pour les opérations longues (NFR-4)

- **Emplacement :** EXPERIENCE.md › State Patterns › Chargement (10 s, H7) ; E4 › « État neutre » et « Rédaction » ; E7 › « Résumé : génération » ; E8 › « Chargement » ; E7 › « Relancer le traitement ».
- **Problème :**
  - La règle des 10 s ne vise que les squelettes (« Chargement »).
  - L'état neutre « Recherche dans les Documents… », la rédaction progressive, « Génération du Résumé… » et « Enregistrement… » (formulaire verrouillé) n'ont aucune borne.
  - Si le serveur garde la connexion ouverte sans répondre, ou si le flux s'arrête au milieu, l'état dure indéfiniment.
  - À l'inverse, appliquer les 10 s au Résumé d'un long Document (résumé par morceaux, addendum) afficherait « Réessayer » alors que la génération continue. On obtiendrait alors un double appel et une double consommation du quota.
- **Scénario :** Camille envoie sa question (UJ-1). Le Fournisseur d'IA ne répond pas mais ne renvoie pas d'erreur. « Recherche dans les Documents… » reste affiché et « Envoyer » reste inactif. Elle ne peut plus poursuivre la Conversation sans recharger la page.
- **Correction :** fixer un délai de garde par type d'opération.
  - **Assistant :** aucun premier affichage en N s (par exemple 20 s), ou aucun nouveau texte pendant N s en cours de rédaction → alerte de panne existante avec « Réessayer ».
  - **Enregistrement d'un Document :** au-delà de N s → alerte « Le Document n'a pas pu être enregistré. Votre saisie est conservée. » et formulaire déverrouillé (voir S9 pour éviter le doublon).
  - **Résumé :** délai propre plus long → « Le Résumé n'a pas pu être généré. »
  - **Message « Le chargement prend plus de temps que prévu » :** le réserver aux lectures, qu'on peut relancer sans risque.
  - Les valeurs exactes sont à fixer en architecture.
- **Touche une décision déjà prise :** non (précise H7).

### S2 — Échange interrompu : Conversation sans réponse et navigation pendant la génération

- **Emplacement :** E4 › états « Vide » (« Aucune Conversation n'est créée avant l'envoi de la première question »), « Succès » (« à la première réponse, elle prend le titre… et entre dans l'Historique ») et « Erreur » ; E4b.
- **Problème :** plusieurs comportements ne sont pas définis.
  - Si la première question reçoit un refus, une panne ou un refus pour quota, on ne sait pas si une Conversation existe. Un refus compte-t-il comme « première réponse » ?
  - On ne sait pas comment une Conversation rouverte affiche une question restée sans réponse : l'alerte et « Réessayer » sont-ils conservés ?
  - On ne sait pas ce qui arrive à une réponse en cours si le Collaborateur clique sur « + Nouvelle Conversation », ouvre une autre Conversation de l'Historique ou quitte l'Assistant. Le serveur termine-t-il et enregistre-t-il la réponse, ou l'abandonne-t-il ?
  - « Réessayer » peut ajouter une seconde bulle de question.
- **Scénario :** Lucas pose sa question (UJ-3). Le service tombe en panne et il ferme l'onglet. Le lendemain (UJ-3, résolution), l'Historique peut montrer une Conversation sans réponse et sans moyen de reprise, ou ne rien montrer du tout. Le comportement dépendra du développeur.
- **Correction :** écrire la règle complète.
  - La Conversation est créée côté serveur au premier envoi accepté (hors quota et hors question trop longue). Elle est titrée d'après la première question et entre dans l'Historique quelle que soit l'issue : réponse, refus ou panne.
  - Une question sans réponse enregistrée se rouvre avec l'alerte de panne et « Réessayer ».
  - « Réessayer » remplace la tentative précédente au lieu d'ajouter un message.
  - Si l'on quitte pendant la génération, le serveur termine et enregistre la réponse. Sinon, l'échange est enregistré comme interrompu et suit la règle ci-dessus.
- **Touche une décision déjà prise :** non.

### S3 — Réponse sourcée sans Source valide à la fin de la rédaction

- **Emplacement :** EXPERIENCE.md › Component Patterns › Réponse de l'Assistant (« les puces de Source apparaissent à la fin, d'après les Sources réellement citées ») ; X12.
- **Problème :**
  - Le marqueur REPONSE déclenche l'affichage progressif avant que l'on sache quelles Sources seront citées.
  - Si la réponse se termine sans citer de Source valide (aucun renvoi, ou des renvois vers un numéro de Passage inexistant), elle reste affichée sans Source.
  - Cela viole FR-17 (« au moins une Source ») et la promesse de confiance. Aucun état ne couvre ce cas.
- **Scénario :** le modèle écrit REPONSE puis rédige un paragraphe plausible sans aucun renvoi. Camille lit une réponse « vérifiable » qui ne l'est pas.
- **Correction :**
  - Traiter ce cas comme une « sortie inexploitable » détectée en fin de rédaction : le texte affiché est retiré.
  - Afficher à la place le bloc de refus standard (de préférence à la panne : « Réessayer » reproduirait probablement le même résultat).
  - Les renvois vers un Passage inexistant sont ignorés.
  - Assumer explicitement cette seule exception à la règle « jamais de refus après une rédaction » : le refus s'affiche alors en bloc, pas progressivement.
- **Touche une décision déjà prise :** oui, à la marge. Cela complète Trou B / X12 sans le contredire.

### S4 — Marqueur REPONSE/REFUS trop pauvre : hors cadre et contradiction

- **Emplacement :** X12 ; Pour l'architecture, point 4 ; E4 › « Contradiction » (« Note de contradiction en tête de réponse ») ; refus « Hors cadre » (sans boutons).
- **Problème :**
  - Avec deux valeurs seulement, le serveur ne sait pas s'il doit afficher le refus « information absente » (avec trois actions) ou « hors cadre » (sans action). Ce sont deux critères distincts de FR-18.
  - La note de contradiction a un rendu propre (`contradiction-note`) et se place en tête d'une réponse écrite progressivement. Rien ne dit comment l'interface sait, au début du flux, qu'il s'agit d'une contradiction.
- **Scénario :** « Quelle est la capitale du Pérou ? » produit REFUS. Le serveur affiche « Je n'ai pas trouvé cette information… » avec « Ajouter un Document », ce qui est absurde pour une question hors cadre. Une contradiction s'affiche, elle, comme du texte ordinaire.
- **Correction :**
  - Marqueur à trois valeurs : `REPONSE`, `REFUS_ABSENT`, `REFUS_HORS_CADRE`.
  - Pour la contradiction, choisir entre deux options : un indicateur en début de flux (`REPONSE_CONTRADICTION`), ou une phrase de contradiction écrite progressivement comme du texte ordinaire, la mise en forme en note étant appliquée à la fin.
- **Touche une décision déjà prise :** oui, à la marge (mécanisme X12, déjà « à confirmer en architecture »).

### S5 — Document supprimé pendant qu'un autre Collaborateur le consulte : boucle « Réessayer »

- **Emplacement :** E4a › « Document supprimé : Impossible : la puce n'est pas cliquable » et « Erreur : alerte avec Réessayer » ; E7 (mise à jour automatique, Résumé) ; E6 et E3 (lignes déjà affichées).
- **Problème :**
  - La puce n'est marquée « supprimée » qu'au chargement de la Conversation. Si l'Auteur supprime le Document pendant que B a la Conversation ouverte, la puce reste cliquable.
  - Le panneau reçoit alors « introuvable » et tombe dans l'état Erreur. « Réessayer » échoue indéfiniment : c'est une impasse.
  - Même problème si le panneau est déjà ouvert (« Ouvrir la page complète » mène à E9 sans explication), si B est sur E7 (« Générer le Résumé » échoue avec « Réessayer » en boucle, mise à jour du Statut en échec) ou s'il clique sur une ligne obsolète de la Bibliothèque.
- **Scénario :** Camille supprime « FAQ comptabilité » pendant que Lucas lit la Source 2 dans sa Conversation. Lucas clique sur « Suivant », puis rouvre la Source. L'erreur et « Réessayer » reviennent sans fin.
- **Correction :** ajouter un état « Document supprimé depuis l'ouverture », distinct de l'erreur temporaire. Les Documents sont lisibles par tous, donc le dire ne révèle rien.
  - **Panneau :** « Ce Document a été supprimé. », sans « Réessayer », et la puce passe au style supprimé.
  - **E7 :** bandeau « Ce Document a été supprimé. » + « Retour à la Bibliothèque », actions retirées.
  - **Bibliothèque et Tableau de bord :** la ligne disparaît à la prochaine actualisation.
  - **Texte à corriger :** « Impossible » dans E4a devient « Puce non cliquable, sauf si la suppression survient pendant la consultation : voir ci-dessus ».
- **Touche une décision déjà prise :** non (complète la décision du panneau Source).

### S6 — Texte « Vous pouvez le relancer » montré au non-Auteur

- **Emplacement :** Textes clés › Erreurs › « Traitement bloqué plus de 3 min » et « Erreur temporaire de traitement » ; E7 › « Traitement bloqué » (« les autres voient le Statut et le message, sans action ») et « En erreur : temporaire ».
- **Problème :**
  - Le message destiné à tous dit « Vous pouvez le relancer », alors que le non-Auteur n'a pas l'action (FR-7). Il cherche donc un bouton qui n'existe pas.
  - La variante « service d'IA momentanément indisponible » laisse croire que la situation se rétablira seule. Or rien ne se passe sans relance de l'Auteur : le non-Auteur attend pour rien.
- **Scénario :** Lucas ouvre un Document de Camille bloqué depuis 4 min. Il lit « Vous pouvez le relancer » et ne trouve aucune action.
- **Correction :** prévoir deux variantes.
  - **Auteur :** texte actuel + « Relancer le traitement ».
  - **Autres :** « Le traitement de ce Document n'a pas pu aboutir. Seul son Auteur ({nom}) peut le relancer. »
  - Même logique pour l'erreur temporaire.
- **Touche une décision déjà prise :** non (le texte de Trou A est conservé pour l'Auteur).

### S7 — Session expirée pendant une saisie longue : perte de la Note

- **Emplacement :** State Patterns › « Session expirée » (redirection vers E1, H8) et « Erreur » (« La saisie en cours est toujours conservée ») ; E8 › Erreur.
- **Problème :**
  - Les deux règles se contredisent : la redirection vers E1 perd le formulaire.
  - FR-2 rend l'expiration rare, mais elle reste possible : déconnexion dans un autre onglet, session révoquée, cookie effacé.
  - Même risque pour une question longue dans l'Assistant.
- **Scénario :** Camille colle un compte rendu de 3 pages (UJ-2). Elle s'est déconnectée par erreur dans un autre onglet. Elle clique sur « Enregistrer », est redirigée vers E1, et son texte est perdu.
- **Correction :**
  - Si la session a expiré au moment de l'envoi, ne pas quitter la page.
  - Afficher le message de session expirée avec « Se reconnecter » (dialogue ou nouvel onglet), puis permettre de renvoyer.
  - À défaut, sauvegarder le brouillon (`sessionStorage`) et le restaurer au retour (H8).
- **Touche une décision déjà prise :** non.

### S8 — Échec de la mise à jour automatique du Statut : « en cours » figé

- **Emplacement :** Interaction Primitives › Mises à jour automatiques ; Badge et Bandeau de Statut (E3, E6, E7) ; Pour l'architecture, point 1.
- **Problème :**
  - Si l'interrogation périodique échoue (perte de connexion, session expirée, erreur serveur), l'écran garde « ◔ en cours de traitement » et son icône qui tourne sans fin.
  - Le passage à *prêt* ou à *en erreur* n'apparaît jamais. Rien n'indique que l'information est périmée.
- **Scénario :** UJ-2, le Wi-Fi coupe 20 s pendant le traitement. Le Document passe *prêt* côté serveur, mais l'écran de Camille reste « en cours ». Le moment de valeur de la démonstration est raté.
- **Correction :**
  - Après N échecs consécutifs, afficher dans le bandeau ou au-dessus de la liste : « Le Statut n'a pas pu être actualisé. » + « Actualiser ».
  - Reprendre automatiquement au retour de la connexion.
  - Sur une session expirée, suivre S7.
- **Touche une décision déjà prise :** non.

### S9 — Double envoi et « Réessayer » non idempotents : doublons

- **Emplacement :** E4 › Champ de question (Entrée) ; E8 › Chargement et Erreur (« Réessayer ») ; E3 › exemples cliquables (« question déjà envoyée ») ; E7 › « Relancer le traitement » (pas d'état pendant l'action).
- **Problème :**
  - Une double activation avant que le bouton passe inactif peut se produire : Entrée maintenue, double clic sur un exemple ou sur « Relancer ».
  - « Réessayer » après une erreur réseau survenue *après* l'enregistrement côté serveur crée un second Document, visible par tous dans la Base commune.
  - De la même façon, une seconde question peut être créée et compter deux fois dans le quota.
  - « Relancer le traitement » n'a pas d'état pendant l'action : rien ne montre que le clic a été pris en compte avant l'arrivée de la notification.
- **Scénario :** l'envoi de « CR réunion Dupont » expire après l'enregistrement en base. Camille clique sur « Réessayer » et la Bibliothèque affiche deux Documents identiques.
- **Correction :**
  - Rendre le bouton inactif dès la première activation, de façon synchrone.
  - Joindre à chaque soumission une clé unique générée par le client, réutilisée par « Réessayer ». Le serveur ignore les doublons.
  - « Relancer le traitement » affiche « Relance… » et reste inactif jusqu'au changement de Statut.
- **Touche une décision déjà prise :** non.

### S10 — Résumé généré par deux Collaborateurs ou sur une page non actualisée

- **Emplacement :** E7 › Bloc Résumé ; FR-23 (« conservé et réaffiché… sans être régénéré »).
- **Problème :**
  - Le bloc Résumé ne se met pas à jour automatiquement.
  - B, qui a ouvert la page avant que A génère le Résumé, voit encore « Générer le Résumé ». S'il clique, il régénère : c'est contraire à FR-23, et cela consomme son quota pour rien.
  - Même chose si A et B cliquent en même temps.
- **Scénario :** Camille génère le Résumé (UJ-2, résolution). Lucas, qui avait le Document ouvert, clique à son tour et obtient un second Résumé, peut-être différent.
- **Correction :**
  - Règle serveur : si un Résumé existe déjà (et n'est pas obsolète en P1), le renvoyer sans appel à l'IA ni décompte du quota.
  - Si une génération est en cours, attendre son résultat.
  - L'interface affiche le Résumé reçu, sans message d'erreur.
- **Touche une décision déjà prise :** non.

### S11 — Quota : moment de détection, sort de la question, rétablissement

- **Emplacement :** State Patterns › Quota atteint ; E4 › Quota atteint ; E7 › Résumé : quota atteint ; Textes clés › Quota.
- **Problème :** plusieurs points restent ouverts.
  - On ne sait pas si l'état « quota atteint » est connu au chargement de l'écran (action désactivée d'avance) ou seulement après un refus du serveur.
  - Dans le second cas, la question « s'affiche aussitôt dans le fil » : on ne sait pas si elle reste dans le fil, si une Conversation est créée (voir S2), ni si le texte saisi est conservé dans le champ désactivé.
  - « Réessayer » après une panne, quand le quota est atteint entre-temps, n'est pas décrit.
  - Une fois `{moment}` passé (minuit), le champ reste désactivé tant que la page n'est pas rechargée.
  - Quota atteint dans un autre onglet : E7 montre encore « Générer le Résumé » actif.
- **Scénario :** répétition de SM-3, quota atteint au milieu d'UJ-2. Camille clique sur « Poser une question ». Sa question apparaît, puis le bloc de quota s'affiche, et une Conversation vide titrée apparaît dans son Historique.
- **Correction :**
  - Récupérer l'état du quota au chargement d'E4 et d'E7 et désactiver d'avance.
  - Si le serveur refuse quand même : la question n'entre pas dans le fil, reste dans le champ (lisible et copiable), aucune Conversation n'est créée.
  - « Réessayer » sur quota : le bloc de quota remplace l'alerte.
  - Réactiver à `{moment}` ou au retour sur l'onglet.
- **Touche une décision déjà prise :** non.

### S12 — Quitter E8 autrement que par « Annuler » perd la saisie sans confirmation

- **Emplacement :** E8 › Annuler (dialogue « Abandonner ce Document ? ») ; barre latérale (« + Ajouter » et entrées toujours visibles).
- **Problème :**
  - Seul le bouton « Annuler » est protégé.
  - Un clic sur une entrée de la barre latérale, sur « + Ajouter » (qui réinitialise ?), le retour arrière du navigateur ou la fermeture de l'onglet perdent une Note longue sans avertissement.
- **Scénario :** Camille colle son texte puis clique sur « Assistant » pour vérifier une information. Son texte est perdu.
- **Correction :**
  - Appliquer le même dialogue à toute navigation interne quand une saisie est en cours.
  - Ajouter un avertissement natif du navigateur (`beforeunload`) à la fermeture ou au rechargement.
- **Touche une décision déjà prise :** non (étend la règle « Annuler »).

---

## Constats mineurs

### S13 — « Votre Document est prêt. » affiché à un non-Auteur

- **Emplacement :** E7 › Prêt ; Textes clés › Confirmations.
- **Problème :** le bandeau s'affiche pour toute personne présente sur la page au changement de Statut. Le possessif est faux pour un non-Auteur.
- **Correction :** « Le Document est prêt. » pour les autres Collaborateurs.
- **Touche une décision déjà prise :** non.

### S14 — Ce que voit un non-Auteur sur un Document *en erreur* sans texte exploitable

- **Emplacement :** E7 › « En erreur : sans texte exploitable ».
- **Problème :** seule la vue de l'Auteur est décrite. Le lecteur de Document reçoit un texte vide, et aucun état vide n'est prévu pour lui.
- **Correction :**
  - Ajouter : « Autres Collaborateurs : raison seule, aucune action. »
  - Lecteur vide : « Aucun texte à afficher. »
- **Touche une décision déjà prise :** non.

### S15 — Contenu privé dans les URL

- **Emplacement :** maquette (`nexamind.app/assistant/c/relance-client`) ; Bloc de refus › « Rechercher dans les Documents » (`/recherche?q=<question>`) ; H8 (retour à la page demandée).
- **Problème :**
  - Le slug de la maquette reprend la question et peut être deviné.
  - La question d'une Conversation privée se retrouve dans l'historique du navigateur, les journaux serveur et les liens copiés.
  - Le retour après connexion peut aussi transporter `?q=` et servir de redirection ouverte vers un site externe.
  - Il n'y a pas de fuite vers un autre Collaborateur : E9 protège la Conversation.
- **Correction :**
  - Identifiants de Conversation opaques (UUID), jamais tirés du titre.
  - Accepter `?q=` pour la Recherche en le documentant, ou transmettre la question par l'état de navigation.
  - Limiter le retour après connexion aux chemins internes.
- **Touche une décision déjà prise :** non.

### S16 — Même Conversation ouverte dans deux onglets

- **Emplacement :** E4.
- **Problème :** l'onglet B ne voit pas l'échange envoyé depuis A. Une question de suivi envoyée depuis B s'appuie, côté serveur, sur un historique que B n'affiche pas. En P1, une Conversation supprimée dans A et utilisée dans B pose le même problème.
- **Correction :**
  - Le contexte de suivi est toujours lu en base.
  - À l'envoi ou au retour sur l'onglet, compléter le fil avec les messages manquants.
  - Conversation supprimée : E9.
- **Touche une décision déjà prise :** non.

### S17 — Seuil de 60 s calculé avec l'horloge du client

- **Emplacement :** E7 › « au-delà de 60 s » ; Pour l'architecture, point 1.
- **Problème :** comparer l'horodatage serveur à l'heure du poste fausse le message si l'horloge du poste est décalée. Rien ne dit non plus que la relance remet le compteur à zéro.
- **Correction :**
  - Le serveur renvoie le temps écoulé (ou son heure courante).
  - L'horodatage de début de traitement est remis à zéro à chaque relance, ce qui vaut aussi pour la limite de 3 min.
- **Touche une décision déjà prise :** non (précise Trou A).

### S18 — Plusieurs Passages : ordre, compteur et page complète

- **Emplacement :** E4a › Succès plusieurs Passages et « Un des Passages introuvable » ; Lecteur de Document (« éventuellement un Passage ») ; maquette (« Passage utilisé · 1 sur 2 »).
- **Problème :**
  - « Premier Passage utilisé » peut désigner l'ordre de citation ou l'ordre dans le Document.
  - Quand un des deux Passages est introuvable, la puce dit « 2 Passages », le compteur passe à 1, et la règle « un seul Passage → ni compteur ni boutons » entre en conflit avec ce compteur.
  - « Ouvrir la page complète » perd la navigation entre Passages, car le lecteur reçoit un seul Passage.
  - L'étiquette de la maquette diffère du catalogue.
- **Correction :**
  - Utiliser l'ordre dans le Document.
  - Si un seul Passage est retrouvé, appliquer le rendu « un Passage » avec le message existant.
  - Le lecteur reçoit la liste des Passages et le Passage actif ; E7 garde la même navigation.
  - Aligner l'étiquette de la maquette sur « Passage utilisé ».
- **Touche une décision déjà prise :** non (précise Trou C).

### S19 — La puce d'un Document supprimé perd son numéro

- **Emplacement :** Textes clés › « Source supprimée » ; DESIGN › `source-chip-deleted` ; maquette.
- **Problème :** le renvoi ² du texte ne correspond plus à aucune puce numérotée.
- **Correction :** « {n} · {titre} — Document supprimé ».
- **Touche une décision déjà prise :** non.

### S20 — États de chargement et d'erreur manquants dans E4

- **Emplacement :** E4 › « Chargement d'une Conversation » (« le champ apparaît une fois les messages chargés ») ; E4 › Vide (liste des 5 Conversations récentes).
- **Problème :**
  - L'échec du chargement d'une Conversation n'a pas d'état propre : le champ reste absent.
  - La liste des Conversations récentes affichée sous le champ n'a ni état de chargement ni état d'erreur.
- **Correction :**
  - Conversation non chargée : alerte « Cette Conversation n'a pas pu être chargée. » + « Réessayer » + « + Nouvelle Conversation ».
  - Liste des Conversations récentes : squelettes, puis le message d'erreur de l'Historique.
- **Touche une décision déjà prise :** non.

### S21 — Exemples de questions : comportement différent entre E3 et E4

- **Emplacement :** E3 › Vide (« question déjà envoyée ») ; E4 › Vide (comportement non précisé).
- **Problème :** l'envoi automatique depuis E3 consomme le quota sans confirmation, et E4 ne dit pas s'il envoie ou s'il pré-remplit.
- **Correction :** harmoniser les deux écrans. Pré-remplir le champ, qui reçoit le focus, est le plus sûr pour le quota et pour S9.
- **Touche une décision déjà prise :** non (le choix ne figure pas au `.memlog.md`).

### S22 — Écarts de texte entre la maquette et le catalogue sur le quota

- **Emplacement :** maquette, carte « Quota atteint ».
- **Problème :** la maquette dit « La Recherche sémantique reste disponible » sans le lien « Ouvrir la Recherche ». Le catalogue dit « La Recherche reste disponible » et prévoit ce lien.
- **Correction :** aligner la maquette sur le catalogue. Les spines font déjà foi.
- **Touche une décision déjà prise :** non.

### S23 — E1 et E2 ouverts par un Collaborateur déjà connecté

- **Emplacement :** E1, E2.
- **Problème :** aucun comportement décrit (par exemple un lien « Créer un compte » ouvert pendant une session).
- **Correction :** rediriger vers E3.
- **Touche une décision déjà prise :** non.

---

## Points vérifiés sans défaut

- **FR-13 :** aucune action d'Auteur dans la Bibliothèque ni sur le Tableau de bord. « Supprimer » et « Relancer le traitement » ne figurent que sur E7, pour l'Auteur seul. Le refus serveur est notifié par « Cette action n'est pas autorisée. »
- **FR-22 :** Historique, Tableau de bord et panneau Historique filtrés sur le Collaborateur connecté. E9 identique pour « inexistant », « supprimé » et « interdit ». Le panneau Source ne montre que des Documents, qui sont publics en interne.
- **FR-2 :** toutes les routes sauf E1 et E2 exigent une session, avec redirection vers E1.
- **FR-8 :** Recherche limitée aux Documents *prêts*. « Poser une question » et « Générer le Résumé » absents tant que le Document n'est pas *prêt*. Un traitement qui aboutit en retard n'est jamais promu à *prêt*.
- **Refus en bloc et réponse progressive :** l'état neutre ne préjuge pas de l'issue, le refus n'est jamais écrit progressivement, une sortie illisible est traitée comme une panne. La règle est cohérente, sous réserve de S3 et S4.
- **Cas limite et échec d'UJ-2 :** le parcours fichier vide → *en erreur* → « Supprimer » → Bibliothèque est complet, tout comme le parcours panne de traitement → « Relancer le traitement ».
