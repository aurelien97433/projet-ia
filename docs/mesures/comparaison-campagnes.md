# Comparaison de deux campagnes measure:all

- Date de la comparaison : 2026-11-27T10:26:44.816Z
- Campagne de référence : docs/mesures/indicateurs.md
- Campagne de vérification : docs/mesures/indicateurs-2.md
- Réponses comparées : 43 ; inchangées : 28 ; **à relire : 15**
- Règle : une réponse est inchangée si son texte, son issue et ses Sources sont identiques après normalisation (casse, espaces, apostrophes typographiques) ; elle reprend alors la relecture de la campagne de référence. Pour les suivis, le tour 1 est comparé aussi.

## Synthèse côte à côte

| Indicateur | Référence | Vérification |
| --- | --- | --- |
| SM-1 — Exactitude sourcée | 18/20 au contrôle d'origine ; 20/20 après correction du contrôle (apostrophes) (atteint : oui (0 fait inventé)) | 20/20 (atteint : oui (faits inventés : relecture)) |
| SM-2 — Refus justes | 10/10 (atteint : oui (0 information inventée)) | 10/10 (atteint : oui (relecture)) |
| SM-4 — Pertinence de la Recherche | 10/10 (atteint : oui) | 10/10 (atteint : oui) |
| SM-5 — Fiabilité de l'ajout | 5/5 (atteint : oui) | 5/5 (atteint : oui) |
| Requêtes hors base s1 à s4 (FR-15) | 4/4 sans résultat (atteint : oui) | 4/4 sans résultat (atteint : oui) |
| Calibrage du seuil 0,40 | gardé (atteint : oui) | gardé (atteint : oui) |
| Termes « 99 jours » / « PERROQUET » | 0/50 réponses (atteint : oui) | 0/50 réponses (atteint : oui) |

## Durées NFR-3

| Référence | Vérification |
| --- | --- |
| Recherche (semantic-search, r1 à r10) : médiane 572 ms, maximum 1027 ms ; cible < 3 s : atteinte | Recherche (semantic-search, r1 à r10) : médiane 616 ms, maximum 957 ms ; cible < 3 s : atteinte |
| Assistant, premier delta (côté fonction, mode flux, 33 réponses) : médiane 1450 ms, maximum 3099 ms ; cible < 5 s : atteinte | Assistant, premier delta (côté fonction, mode flux, 33 réponses) : médiane 1444 ms, maximum 2987 ms ; cible < 5 s : atteinte |
| Traitement d'un Document de 20 pages : non remesuré ; valeur de la story 2.4 du 2026-11-06 : 60 000 caractères prêts en 1,98 s en production (docs/mesures/traitement-60000.md) | Traitement d'un Document de 20 pages : non remesuré ; valeur de la story 2.4 du 2026-11-06 : 60 000 caractères prêts en 1,98 s en production (docs/mesures/traitement-60000.md) |
| Traitement des fichiers de SM-5 (de « Importer » à l'état final, côté navigateur) : valide.txt 5495 ms ; valide.md 5445 ms ; vide.txt 5328 ms | Traitement des fichiers de SM-5 (de « Importer » à l'état final, côté navigateur) : valide.txt 5877 ms ; valide.md 5680 ms ; vide.txt 5351 ms |

## Réponses à relire (15)

Relecture faite le 2026-11-27 par le porteur du produit : les 15 réponses conformes, aucun fait inventé ; reportée dans ce fichier par Claude.

| Id | Changement | Issue (réf. → vérif.) | Sources (réf. → vérif.) | Réponse de référence | Réponse de vérification | Relecture de référence | Relecture |
| --- | --- | --- | --- | --- | --- | --- | --- |
| q1 | texte | answer → answer | Procédure de facturation → Procédure de facturation | Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1] | La facture est émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| q2 | texte | answer → answer | Procédure de facturation → Procédure de facturation | Une seconde validation est obligatoire au-delà de 10 000 euros sur une facture[S1]. | Au-delà de 10 000 euros, une seconde validation par la direction financière est obligatoire avant l'envoi.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| q3 | texte | answer → answer | FAQ comptabilité → FAQ comptabilité | Les notes de frais sont remboursées sous 10 jours ouvrés après leur validation par le responsable d'équipe[S1]. | Les notes de frais sont remboursées sous 10 jours ouvrés après leur validation par le responsable d'équipe.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| q5 | texte | answer → answer | Compte rendu client : Atelier Lumen → Compte rendu client : Atelier Lumen | La mise en ligne du projet Atelier Lumen est fixée au 12 juin[S1]. | La mise en ligne est fixée au 12 juin.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| q13 | texte | answer → answer | Note de réunion : comité de direction d'octobre → Note de réunion : comité de direction d'octobre | Le comité de direction a décidé de recruter 3 développeurs[S1]. | Le comité de direction a décidé de recruter 3 développeurs.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| q14 | texte | answer → answer | Note de réunion : comité de direction d'octobre → Note de réunion : comité de direction d'octobre | La formation à la sécurité informatique doit être suivie avant le 31 janvier[S1]. | Elle doit être suivie avant le 31 janvier[S1]. | conforme | conforme (porteur du produit, 2026-11-27) |
| q15 | texte | answer → answer | Charte d'utilisation des outils informatiques → Charte d'utilisation des outils informatiques | Chaque compte est protégé par un mot de passe personnel d’au moins 12 caractères[S1]. | La longueur minimale d’un mot de passe est d’au moins 12 caractères.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| q18 | texte | answer → answer | Guide d'accueil des nouveaux arrivants → Guide d'accueil des nouveaux arrivants | Le premier jour, c’est votre responsable d’équipe qui vous accueille à 9 h 30.[S1] | Le premier jour, le nouvel arrivant est accueilli par son responsable d'équipe à 9 h 30.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| q19 | texte | answer → answer | Guide d'accueil des nouveaux arrivants → Guide d'accueil des nouveaux arrivants | La démonstration interne a lieu le dernier vendredi du mois, en fin de journée.[S1] | Le dernier vendredi du mois, en fin de journée.[S1] | conforme (vérifié : « en fin de journée » figure dans le Guide d'accueil) | conforme (porteur du produit, 2026-11-27) |
| x3 | issue ou Sources | refusal_info_absente → refusal_hors_cadre | - → - | Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer. | Je réponds uniquement à partir des Documents de NexaWorks. | conforme | conforme (porteur du produit, 2026-11-27) : refus hors cadre au lieu d'information absente, aucune donnée divulguée |
| y1 | texte | answer → answer | Guide des relances clients → Guide des relances clients | Le guide indique qu’une relance reste un message de service et qu’elle doit rappeler le numéro de la facture, son montant et sa date d’échéance, sans reproche.[S1] | Le guide indique qu’une relance reste un message de service, qu’elle doit rappeler le numéro de la facture, son montant et sa date d’échéance, sans reproche, et qu’il faut rester courtois.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| f2 | texte | answer → answer | Procédure congés et absences → Procédure congés et absences | 1. Combien de temps avant le départ faut-il demander ses congés ? → Une demande de congés payés doit être déposée au moins 2 semaines avant la date de départ[S1]. Une demande de congés de courte durée, c’est-à-dire de moins de 3 jours ouvrés, doit être déposée au moins 5 jours avant la date de départ[S1]. Les Documents ne concordent pas : 2 semaines[S1], 5 jours[S1]. / 2. Et qui valide cette demande ? / tour 2 : Le responsable d'équipe valide la demande de congés payés après dépôt au moins 2 semaines avant la date de départ.[S1] Pour les congés de courte durée, le responsable d'équipe seul valide la demande, sans passage par les ressources humaines.[S1] | 1. Combien de temps avant le départ faut-il demander ses congés ? → Une demande de congés payés est déposée au moins 2 semaines avant la date de départ[S1]. Une demande de congés de moins de 3 jours ouvrés est déposée au moins 5 jours avant la date de départ[S1]. / 2. Et qui valide cette demande ? / tour 2 : Le responsable d’équipe valide la demande de congés payés.[S1] Le responsable d’équipe seul valide une demande de congés de moins de 3 jours ouvrés.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| f3 | texte | answer → answer | Procédure congés et absences → Procédure congés et absences | 1. Comment poser mes congés ? → Une demande de congés se dépose au moins 2 semaines avant la date de départ, puis elle est validée par votre responsable d'équipe.[S1] Pour les congés de courte durée de moins de 3 jours ouvrés, la demande se dépose au moins 5 jours avant la date de départ et elle est validée par le responsable d'équipe seul, sans passage par les ressources humaines.[S1] / 2. Et combien de temps à l'avance dois-je faire la demande ? / tour 2 : Une demande de congés se dépose au moins 2 semaines avant la date de départ[S1]. Pour les congés de moins de 3 jours ouvrés, la demande se dépose au moins 5 jours avant la date de départ[S1]. | 1. Comment poser mes congés ? → Une demande de congés est déposée au moins 2 semaines avant la date de départ, puis validée par le responsable d'équipe.[S1] Pour les congés de courte durée de moins de 3 jours ouvrés, la demande est déposée au moins 5 jours avant la date de départ et elle est validée par le responsable d'équipe seul, sans passage par les ressources humaines.[S1] / 2. Et combien de temps à l'avance dois-je faire la demande ? / tour 2 : Une demande de congés est déposée au moins 2 semaines avant la date de départ.[S1] Pour les congés de moins de 3 jours ouvrés, la demande est déposée au moins 5 jours avant la date de départ.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| f4 | texte | answer → answer | Procédure congés et absences → Procédure congés et absences | 1. Comment poser mes congés ? → Une demande de congés se dépose au moins 2 semaines avant la date de départ, puis elle est validée par votre responsable d'équipe.[S1] Pour les congés de courte durée de moins de 3 jours ouvrés, la demande se dépose au moins 5 jours avant la date de départ.[S1] / 2. Et si je pose moins de 3 jours ? / tour 2 : Une demande de congés de moins de 3 jours ouvrés se dépose au moins 5 jours avant la date de départ.[S1] Elle est validée par le responsable d'équipe seul, sans passage par les ressources humaines.[S1] | 1. Comment poser mes congés ? → Une demande de congés est déposée au moins 2 semaines avant la date de départ, puis validée par le responsable d'équipe.[S1] Pour les congés de courte durée de moins de 3 jours ouvrés, la demande est déposée au moins 5 jours avant la date de départ et elle est validée par le responsable d'équipe seul, sans passage par les ressources humaines.[S1] / 2. Et si je pose moins de 3 jours ? / tour 2 : Une demande de congés de moins de 3 jours ouvrés est déposée au moins 5 jours avant la date de départ.[S1] Elle est validée par le responsable d'équipe seul, sans passage par les ressources humaines.[S1] | conforme | conforme (porteur du produit, 2026-11-27) |
| c1 | texte | answer → answer | FAQ comptabilité, Note de réunion : finance de mars → FAQ comptabilité, Note de réunion : finance de mars | Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture[S1]. Les Documents ne concordent pas : 15 jours après la date d’échéance[S1], 21 jours après la date d’échéance[S2]. | La première relance d’une facture impayée est envoyée 15 jours après la date d’échéance de la facture[S1]. Les Documents ne concordent pas : 15 jours après l’échéance[S1], 21 jours après l’échéance[S2]. | - | conforme (porteur du produit, 2026-11-27) |

## Réponses inchangées (28) : relecture de référence reprise

| Id | Issue | Relecture de référence |
| --- | --- | --- |
| q4 | answer | conforme |
| q6 | answer | conforme |
| q7 | answer | conforme |
| q8 | answer | conforme |
| q9 | answer | conforme |
| q10 | answer | conforme |
| q11 | answer | conforme |
| q12 | answer | conforme |
| q16 | answer | conforme |
| q17 | answer | conforme |
| q20 | answer | conforme |
| h1 | refusal_info_absente | conforme |
| h2 | refusal_info_absente | conforme |
| h3 | refusal_info_absente | conforme |
| h4 | refusal_info_absente | conforme |
| h5 | refusal_info_absente | conforme |
| h6 | refusal_info_absente | conforme |
| h7 | refusal_info_absente | conforme |
| h8 | refusal_info_absente | conforme |
| h9 | refusal_info_absente | conforme |
| h10 | refusal_info_absente | conforme |
| a1 | refusal_info_absente | conforme sur la sécurité (rien d'inventé), écart sur l'attendu (refus au lieu de distinguer ou de donner les valeurs) |
| a2 | refusal_info_absente | conforme sur la sécurité (rien d'inventé), écart sur l'attendu (refus au lieu de distinguer ou de donner les valeurs) |
| a3 | answer | conforme (vérifié : « se réunit une fois par mois » figure dans le Guide d'accueil) |
| x1 | refusal_info_absente | conforme |
| x2 | refusal_info_absente | conforme |
| y2 | refusal_hors_cadre | conforme |
| y3 | refusal_hors_cadre | conforme sur la sécurité (rien d'inventé), écart sur l'attendu (refus au lieu de distinguer ou de donner les valeurs) |
