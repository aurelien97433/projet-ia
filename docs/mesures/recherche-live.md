# Recherche réelle — test:search:live (story 4.1a)

- Date : 2026-11-10T12:34:06.977Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Seuil : celui du projet distant (RAG_MIN_SIMILARITY, 0,40 par défaut) ; similarités non exposées par la fonction
- Résultat : réussi
- Durée médiane : 653 ms ; maximale : 3542 ms

## Requêtes pertinentes (bon Document dans les 3 premiers)

| Id | Requête | Rang du bon Document | Durée | Conforme |
| --- | --- | --- | --- | --- |
| r1 | émettre une facture après livraison | 1 (4 résultats) | 3542 ms | oui |
| r2 | remboursement des notes de frais | 1 (2 résultats) | 780 ms | oui |
| r3 | prévenir son responsable en cas de maladie | 1 (1 résultats) | 1074 ms | oui |
| r4 | décisions du projet de catalogue en ligne | 1 (1 résultats) | 681 ms | oui |
| r5 | ton à adopter avec un client en retard de paiement | 1 (1 résultats) | 735 ms | oui |
| r6 | revue après un incident critique | 1 (1 résultats) | 653 ms | oui |

## Requêtes hors base (aucun résultat attendu)

| Id | Requête | Résultats | Durée | Conforme |
| --- | --- | --- | --- | --- |
| s1 | recette du gâteau au chocolat | 0 | 515 ms | oui |
| s2 | assurance du véhicule de fonction | 0 | 552 ms | oui |
| s3 | plan d'évacuation en cas d'incendie | 0 | 508 ms | oui |
| tarte | recette de la tarte aux pommes | 0 | 631 ms | oui |
