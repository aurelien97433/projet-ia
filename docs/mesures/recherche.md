# Mesure de la Recherche — measure:search (story 4.2)

- Date : 2026-11-17T08:43:09.690Z
- Cible : lkjjtcfegplipalraqml.supabase.co ; Compte de mesure 1 de .env.seed (aucun quota consommé)
- Vectorisation des Requêtes : fonction locale measure-embed, text-embedding-3-small, version 1, 1536 dimensions — identique à la production
- Seuil de référence : 0,40 ; marge basse 0,055 ; marge haute 0,061
- Décision : 0,40 gardé (critères atteints, marges d'au moins 0,05). Aucune modification de la production.

## Requêtes pertinentes

| Id | Requête | Similarité du bon Document | Rang sans seuil | Rang réel (semantic-search) | Durée |
| --- | --- | --- | --- | --- | --- |
| r1 | émettre une facture après livraison | 0,568 | 1 | 1 | 1165 ms |
| r2 | remboursement des notes de frais | 0,461 | 1 | 1 | 561 ms |
| r3 | prévenir son responsable en cas de maladie | 0,468 | 1 | 1 | 600 ms |
| r4 | décisions du projet de catalogue en ligne | 0,603 | 1 | 1 | 588 ms |
| r5 | ton à adopter avec un client en retard de paiement | 0,567 | 1 | 1 | 487 ms |
| r6 | revue après un incident critique | 0,621 | 1 | 1 | 1247 ms |

## Requêtes hors base

| Id | Requête | Meilleure similarité | Résultats réels (semantic-search) | Durée |
| --- | --- | --- | --- | --- |
| s1 | recette du gâteau au chocolat | 0,207 | 0 | 555 ms |
| s2 | assurance du véhicule de fonction | 0,345 | 0 | 519 ms |
| s3 | plan d'évacuation en cas d'incendie | 0,307 | 0 | 584 ms |
| tarte | recette de la tarte aux pommes | 0,270 | 0 | 472 ms |

## Balayage des seuils (calculé hors ligne)

| Seuil | Bon Document dans le top 3 | Hors base avec résultat | Critères |
| --- | --- | --- | --- |
| 0,30 | 6/6 | 2/4 | non atteints |
| 0,35 | 6/6 | 0/4 | atteints |
| 0,40 | 6/6 | 0/4 | atteints |
| 0,45 | 6/6 | 0/4 | atteints |
| 0,50 | 4/6 | 0/4 | non atteints |

## Durées

- semantic-search : premier appel 1165 ms ; médiane 561 ms ; médiane hors premier appel 561 ms ; maximum 1247 ms
- match_passages seule (projet distant, médiane) : 301 ms
- Analyse : Médiane sous 3 s (561 ms) : critère de vitesse atteint. Premier appel 1165 ms contre 561 ms ensuite, alors que match_passages seule prend 301 ms en médiane : démarrage à froid probable (chargement de l'Edge Function, première connexion au fournisseur), ni la base ni le réseau. Action : réchauffer la Recherche avant une démonstration (une Recherche lancée une à deux minutes avant), sans code ; vérifier dans les journaux Supabase le démarrage (« booted ») et `embed_ms` du premier `semantic_search_done`.

## Contradiction c1 (story 5.4)

Question : « Quel est le délai avant la première relance d'une facture impayée ? ». Critère : chaque Document attendu ≥ 0,42 (seuil 0,40 + 0,02) et transmis au modèle par chat (8 Passages au plus, 3 par Document).

- Résultat : atteint : les 2 Documents dépassent 0,42 et sont transmis au modèle

| Document attendu | Similarité | Rang sans seuil | Transmis par chat | Conforme |
| --- | --- | --- | --- | --- |
| FAQ comptabilité | 0,594 | 2 | oui | oui |
| Note de réunion : finance de mars | 0,486 | 3 | oui | oui |

Classement complet (meilleur Passage par Document, sans seuil) :

1. Guide des relances clients : 0,606
2. FAQ comptabilité : 0,594
3. Note de réunion : finance de mars : 0,486
4. Procédure de facturation : 0,462
5. Procédure de gestion des incidents : 0,460
6. Compte rendu client : Atelier Lumen : 0,334
7. Procédure congés et absences : 0,307
8. Document de test : piège à 375 px : 0,295
9. Document de test : .md piège : 0,144
