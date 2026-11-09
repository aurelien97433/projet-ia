---
title: 'Proposition de changement de sprint : séquences 10 à 13'
date: '2026-11-09'
status: 'approuvée'
mode: 'batch'
---

# Proposition de changement de sprint : séquences 10 à 13

## 1. Déclencheur

Le 11/11 n'est pas travaillé, et le workshop comporte aussi les séquences 10 à 13, absentes du découpage. Il faut les relier aux stories existantes, ajouter seulement ce qui manque et refaire le calendrier, sans retirer d'exigence P0.

**État au 09/11.** 12 P0 sur 42 terminées (1.1 à 1.4, 2.1 à 2.5, 2.8, 3.1, 3.2). Le point de contrôle de la règle 8 est déjà atteint : il ne se déclenchera pas le 13/11.

## 2. Séquences et stories

| Séquence | Date | Stories existantes | Déjà couvert | Livrable manquant |
|---|---|---|---|---|
| 9 Développement | jusqu'au 20/11 | 2.6 à 6.2 | tout | — |
| 10 Tests | 23/11 | 6.2 (UJ-2), 7.3 (UJ-1, UJ-3, clavier, 375 px), 7.1b (Jeu préchargé) | tests e2e | **plan de tests**, **bilan des anomalies** (nouvelle story 7.7) |
| 11 Sécurité | 24/11 | 7.3 (SM-6, accès sans session, contrôle des secrets), règles 1 et 11 | contrôles ciblés | **audit global** avec `bmad-code-review`, corrections, contrôle avant publication (nouvelle story 7.8) |
| 13 Mesure | 25/11 | 7.1a, 7.1b, 7.2 (SM-1, SM-2, SM-4, SM-5, faits inventés, citations, NFR-3, coût) | qualité, hallucinations, citations, latence, coûts | **cas ambigus, sensibles, hostiles et dégradés** (7.1a, 7.2) ; **seuils, alertes, repli, décision de mise en service** (nouvelle story 7.9) |
| 12 Livraison | 26 et 27/11 | 7.5 (SM-3, liste de contrôle, vidéo, accès public), 7.6 (README, démarche) | déploiement, vérification en ligne, démonstration | **guide de reprise** (7.6) |

**Ordre.** La séquence 13 précède la 12 : on mesure après les corrections de sécurité, et on livre après la décision de mise en service.

**Dépendance à corriger.** 7.3 dépend aujourd'hui de 7.2, or 7.3 sert aux séquences 10 et 11, avant 7.2. Elle dépendra de 7.1b. 7.1b passe au matin du 23/11.

## 3. Impact

- **Epics.** E7 reçoit 3 stories et 3 extensions. E1 à E6 : aucun critère modifié. E8 et E9 : inchangés, non livrés sauf avance réelle.
- **Volume.** 45 P0 au lieu de 42 ; il en reste 33 pour 13 jours ouvrés (10/11, 12/11, 13/11, 16/11 au 20/11, 23/11 au 27/11), soit 78 h.
- **PRD, architecture, UX.** Aucune exigence ni décision modifiée.
- **Code et déploiement.** Aucun impact avant les stories concernées.
- **Coût.** Les cas ajoutés restent à mesurer sous le plafond de 10 $, déjà exigé par 7.2.

## 4. Approche recommandée : ajustement direct

Modifier `epics.md` et `sprint-status.yaml`, sans retour arrière ni réduction du MVP. Effort faible sur la documentation ; **risque élevé** sur le calendrier (section 6).

## 5. Changements proposés

### 5.1 Calendrier (`epics.md`, « Calendrier : appréciation »)

ANCIEN : lignes du 10/11 au 27/11 (11/11 : 2.6a, 2.6b ; 12/11 : 2.7, 3.4 ; 13/11 : 4.1a, 4.2 ; 16/11 au 20/11 : 16 P0 ; 23/11 au 27/11 : stories 7 et rattrapage).

NOUVEAU :

| Jour | Contenu | Remarque |
|---|---|---|
| Mar. 10/11 | 3.3, 3.5 | rappel règle 1 : `check:secrets` sur les pages prérendues, si elles affichent des données |
| Mer. 11/11 | non travaillé | — |
| Jeu. 12/11 | 9ᵉ Document, 4.1a, 4.2 | calibrage sur plusieurs Passages réels |
| Ven. 13/11 | 2.6a, 2.6b | 2.6b crée les premiers cas `no_text` réels |
| Lun. 16/11 | 2.7, 3.4, 4.1b, 5.0 | 2.7 tranchée avant 5.2a (règle 3) ; 3.4 ajoute « Supprimer » |
| Mar. 17/11 | 5.1, 5.2a, 5.2b | |
| Mer. 18/11 | 5.3, 5.4, 5.5, 5.6 | **point de contrôle le soir** |
| Jeu. 19/11 | 5.7, 5.8, 5.9 | |
| Ven. 20/11 | 5.10, 5.11, 6.1, 6.2 | fin de la séquence 9 ; 7.1a terminée ; **point de contrôle le soir** |
| Lun. 23/11 | 7.1b, 7.7, tests de 7.3 | séquence 10 |
| Mar. 24/11 | 7.8, contrôles de 7.3, corrections | séquence 11 |
| Mer. 25/11 | 7.2, 7.9 | séquence 13 |
| Jeu. 26/11 | déploiement final, vérification en ligne, 7.6 | séquence 12 |
| Ven. 27/11 | 7.5 (répétition, vidéo), guide de reprise, 7.6 finalisée | séquence 12 |

Disponibilité : 17 jours et 102 h du 04/11 au 27/11. Vérifications des 28 et 29/11 inchangées.

### 5.2 Règle 8 (`epics.md`)

Ajout : « Point du 13/11 atteint le 09/11, sans déclenchement. Nouveaux points de contrôle le 18/11 et le 20/11 au soir : voir la section Risque. »

### 5.3 Story 7.1a

- ANCIEN : « du 10/11 au 22/11 ». NOUVEAU : « du 10/11 au 20/11 ».
- Ajout d'un critère : **Étant donné** `demo/jeu-demonstration.json` **Quand** je l'ouvre **Alors** il contient aussi des cas **ambigus, sensibles, hostiles** (injection, Document piège) et **dégradés** (service d'IA indisponible, Document *en erreur* ou expiré), au moins 3 par famille, avec le résultat attendu.

### 5.4 Story 7.2

Ajout d'un critère : **Étant donné** les cas ambigus, sensibles, hostiles et dégradés **Quand** les mesures tournent **Alors** le rapport donne leur résultat par famille, avec le nombre de faits inventés et de citations invalides.

### 5.5 Story 7.3

- ANCIEN : **Dépendances :** 7.2. NOUVEAU : **Dépendances :** 7.1b.

### 5.6 Story 7.6

Ajout d'un critère : **Étant donné** `docs/guide-de-reprise.md` **Quand** une autre personne le suit **Alors** elle sait installer le projet, relancer les services, redéployer, restaurer le Jeu de démonstration et faire tourner les secrets, sans qu'aucun secret n'y figure.

### 5.7 Nouvelles stories, à ajouter à E7

**Story 7.7 : Plan de tests et bilan des anomalies (P0, séquence 10).** `docs/tests/plan-de-tests.md` relie chaque parcours et risque à ses tests. `bmad-qa-generate-e2e-tests` complète les tests e2e manquants. `docs/tests/bilan-anomalies.md` liste chaque anomalie, sa gravité et sa suite. Dépendances : 7.1b.

**Story 7.8 : Audit global de sécurité (P0, séquence 11, relecteurs de la règle 11).** Revue complète du code avec `bmad-code-review` : RLS, privilèges, fonctions SQL, Edge Functions, secrets, affichage, injection. Rapport `docs/tests/audit-securite.md`, anomalies hautes corrigées, autres décidées, contrôle avant publication rejoué. Dépendances : 7.7.

**Story 7.9 : Seuils, alertes, repli et décision de mise en service (P0, séquence 13).** `docs/mesures/decision-mise-en-service.md` donne les seuils de décision (à partir de SM-1 à SM-6, faits inventés, citations, latence, coût), les alertes (dont le plafond OpenAI), l'action de repli pour chaque seuil manqué, et la décision **Go / Go avec réserves / No-Go** de l'utilisateur. Dépendances : 7.2.

### 5.8 `sprint-status.yaml`

Ajout en E7, en `backlog` : `7-7-plan-de-tests-et-bilan-des-anomalies`, `7-8-audit-global-de-sécurité`, `7-9-seuils-alertes-repli-et-décision-de-mise-en-service`.

## 6. Risque sur l'Epic 5 et coupes possibles

**Risque élevé.** Du 16/11 au 20/11 : 18 P0 en 5 jours, soit 3,6 par jour, dont 13 de E5 et six stories sensibles (5.1, 5.2a, 5.4, 5.9, 5.10, 6.1).

- **Mesure du 09/11.** 3 P0 en une journée (environ 1 h 20, 1 h 15 et 2 h 30). À ce rythme moyen de 1 h 40, 18 stories demandent 30 h, soit toute la semaine, sans marge, alors que E5 est plus difficile. Une limite d'utilisation a aussi interrompu le travail près de 2 h le 09/11.
- **Absence de tampon.** La semaine du 23/11, qui absorbait le retard, est désormais occupée par les séquences 10 à 13. Un retard probable d'environ un jour touche directement ces séquences.

**Coupes, par ordre.** Aucune exigence P0 n'est retirée sans ton accord, et ni UJ-2 ni CH-1 à CH-19 ne sont retirés.

| Palier | Déclencheur | Coupe | Effet |
|---|---|---|---|
| 1 | dès maintenant | FINITION (5.12, 7.4, 3.6, 2.9, 1.5) faites seulement si un jour se libère ; E8 et E9 non livrés | aucune heure P0 gagnée |
| 2 | 18/11 soir, 5.4 non terminée | 7.1a à 10 Documents ; 3 cas par famille, sans plus ; rapports courts pour 7.7 à 7.9 | environ une demi-journée |
| 3 | 20/11 soir, 6.2 non terminée | 23/11 utilisé pour finir E5 et E6 ; séquence 10 réduite à une demi-journée (plan et bilan) | jusqu'à un jour, au prix de moins de tests supplémentaires |
| 4 | sur ta décision seulement | fusion de 5.0 dans 5.5 (CH-18 reste couvert) ; 2.7 réduite à une seule mesure | environ une story |

**À ne pas couper :** 7.2, 7.8, 7.5, et la décision de mise en service.

## 7. Mise en œuvre

**Portée : modérée** (réorganisation du backlog, sans remise en cause du produit). Après approbation : modification de `epics.md` et `sprint-status.yaml`, puis entrée au journal. Critère de réussite : dépendances antérieures à chaque date, `epics.md` et le suivi synchronisés, aucune exigence P0 retirée.

## 8. Approbation (2026-11-09)

Proposition approuvée par l'utilisateur, avec ces précisions, qui priment sur les sections précédentes :

- Week-ends des 14-15/11 et 21-22/11 : tampon partiel, principalement pour l'Epic 5, sans être prévus comme jours pleins.
- **5.0 reste séparée** : le palier 4 ne propose plus sa fusion dans 5.5.
- Les coupes ne sont examinées qu'aux points de contrôle des 18/11 et 20/11 au soir, et présentées à l'utilisateur avant toute décision. Le palier 1 n'est donc plus applicable « dès maintenant ».
