# Mesure de la Recherche — measure:search (story 4.2)

- Date : 2026-11-10T12:55:37.003Z
- Cible : lkjjtcfegplipalraqml.supabase.co ; Compte de mesure 1 de .env.seed (aucun quota consommé)
- Vectorisation des Requêtes : fonction locale measure-embed, text-embedding-3-small, version 1, 1536 dimensions — identique à la production
- Seuil de référence : 0,40 ; marge basse 0,055 ; marge haute 0,061
- Décision : 0,40 gardé (critères atteints, marges d'au moins 0,05). Aucune modification de la production.

## Requêtes pertinentes

| Id | Requête | Similarité du bon Document | Rang sans seuil | Rang réel (semantic-search) | Durée |
| --- | --- | --- | --- | --- | --- |
| r1 | émettre une facture après livraison | 0,568 | 1 | 1 | 959 ms |
| r2 | remboursement des notes de frais | 0,461 | 1 | 1 | 797 ms |
| r3 | prévenir son responsable en cas de maladie | 0,468 | 1 | 1 | 717 ms |
| r4 | décisions du projet de catalogue en ligne | 0,603 | 1 | 1 | 530 ms |
| r5 | ton à adopter avec un client en retard de paiement | 0,567 | 1 | 1 | 594 ms |
| r6 | revue après un incident critique | 0,621 | 1 | 1 | 864 ms |

## Requêtes hors base

| Id | Requête | Meilleure similarité | Résultats réels (semantic-search) | Durée |
| --- | --- | --- | --- | --- |
| s1 | recette du gâteau au chocolat | 0,207 | 0 | 546 ms |
| s2 | assurance du véhicule de fonction | 0,345 | 0 | 619 ms |
| s3 | plan d'évacuation en cas d'incendie | 0,307 | 0 | 564 ms |
| tarte | recette de la tarte aux pommes | 0,270 | 0 | 678 ms |

## Balayage des seuils (calculé hors ligne)

| Seuil | Bon Document dans le top 3 | Hors base avec résultat | Critères |
| --- | --- | --- | --- |
| 0,30 | 6/6 | 2/4 | non atteints |
| 0,35 | 6/6 | 0/4 | atteints |
| 0,40 | 6/6 | 0/4 | atteints |
| 0,45 | 6/6 | 0/4 | atteints |
| 0,50 | 4/6 | 0/4 | non atteints |

## Durées

- semantic-search : premier appel 959 ms ; médiane 619 ms ; médiane hors premier appel 619 ms ; maximum 959 ms
- match_passages seule (projet distant, médiane) : 308 ms
- Analyse : Médiane sous 3 s (619 ms) : critère de vitesse atteint. Premier appel 959 ms, proche des suivants (619 ms) : pas de démarrage à froid observé lors de cette exécution. Action : réchauffer la Recherche avant une démonstration (une Recherche lancée une à deux minutes avant), sans code ; vérifier dans les journaux Supabase le démarrage (« booted ») et `embed_ms` du premier `semantic_search_done`.
