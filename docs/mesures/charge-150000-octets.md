# Test de charge : fichiers de 148671 à 148973 octets (story 2.7)

- Date : 2026-11-12T12:12:21.330Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Conditions (par fichier) : *prêt* en moins de 3 min ; moins de 50 Mo ajoutés ; base totale sous 400 Mo (1 Mo = 1 000 000 octets)
- Résultat : **limite de 150000 octets confirmée**
- Coût estimé : 0,0014 $ (tokens ≈ caractères / 4, 0,02 $ par million, tarif du 2026-11-03)

| Fichier | Octets | Caractères | Passages | Statut | Durée | Ajouté | Base totale | Coût | < 3 min / < 50 Mo / < 400 Mo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| .txt | 148973 | 144277 | 175 | ready | 4,7 s | 2,7 Mo | 15,6 Mo | 0,0007 $ | oui / oui / oui |
| .md | 148671 | 144001 | 174 | ready | 5,2 s | 3,1 Mo | 18,7 Mo | 0,0007 $ | oui / oui / oui |

Durée : `updated_at - processing_started_at` (de la création du Document après vérification du fichier jusqu'à l'écriture finale).

## Tailles de la base

| Moment | Base | `documents` | `passages` (index HNSW compris) |
| --- | --- | --- | --- |
| Avant le premier import | 12,9 Mo | 0,2 Mo | 0,9 Mo |
| Après le .txt | 15,6 Mo | 0,2 Mo | 3,6 Mo |
| Après le .md | 18,7 Mo | 0,2 Mo | 6,7 Mo |
| Après nettoyage | 18,7 Mo | 0,2 Mo | 6,7 Mo |

Documents de test restants après nettoyage : 0. PostgreSQL ne rend pas aussitôt l'espace des lignes supprimées : la taille après nettoyage peut rester supérieure à celle d'avant le test jusqu'au passage de l'autovacuum.

## Journaux de process-document (relevés par l'utilisateur)

Dans le tableau de bord Supabase, journaux de la fonction `process-document`, filtrer sur l'identifiant de chaque Document :

| Fichier | Document | `embed_ms` | `complete_ms` | `duration_ms` | Échec (`process_document_work_failed`, code) |
| --- | --- | --- | --- | --- | --- |
| .txt | e3a869e0-33d6-4dce-8f78-3ecc33215d8e | à relever | à relever | à relever | à relever |
| .md | c2b650e3-d6c9-40eb-9a7b-0deb8935e326 | à relever | à relever | à relever | à relever |

## Proposition

Aucune : les trois conditions sont réunies pour les deux fichiers.

## Décision (2026-11-12, utilisateur) : rejeté

`complete_ms` relevés dans les journaux de `process-document` : **3 339 ms** (.txt, 175 Passages) et **7 005 ms** (.md, 174 Passages). Le second est trop proche de la limite de **8 s** par instruction de l'API (`statement_timeout` de la connexion `authenticator`, voir `charge-300000-octets.md`). Le critère retenu (écriture de 4 s au plus) n'est pas tenu. Les trois conditions de la story sont remplies, mais la marge est insuffisante.
