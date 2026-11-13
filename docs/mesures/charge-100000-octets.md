# Test de charge : fichiers de 98221 à 98707 octets (story 2.7)

- Date : 2026-11-12T12:20:21.459Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Conditions (par fichier) : *prêt* en moins de 3 min ; moins de 50 Mo ajoutés ; base totale sous 400 Mo (1 Mo = 1 000 000 octets)
- Résultat : **limite de 100000 octets confirmée**
- Coût estimé : 0,0010 $ (tokens ≈ caractères / 4, 0,02 $ par million, tarif du 2026-11-03)

| Fichier | Octets | Caractères | Passages | Statut | Durée | Ajouté | Base totale | Coût | < 3 min / < 50 Mo / < 400 Mo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| .txt | 98707 | 95593 | 116 | ready | 3,9 s | 1,1 Mo | 16,6 Mo | 0,0005 $ | oui / oui / oui |
| .md | 98221 | 95135 | 115 | ready | 3,2 s | 1,1 Mo | 17,6 Mo | 0,0005 $ | oui / oui / oui |

Durée : `updated_at - processing_started_at` (de la création du Document après vérification du fichier jusqu'à l'écriture finale).

## Tailles de la base

| Moment | Base | `documents` | `passages` (index HNSW compris) |
| --- | --- | --- | --- |
| Avant le premier import | 15,5 Mo | 0,2 Mo | 3,5 Mo |
| Après le .txt | 16,6 Mo | 0,2 Mo | 4,5 Mo |
| Après le .md | 17,6 Mo | 0,2 Mo | 5,6 Mo |
| Après nettoyage | 17,6 Mo | 0,2 Mo | 5,6 Mo |

Documents de test restants après nettoyage : 0. PostgreSQL ne rend pas aussitôt l'espace des lignes supprimées : la taille après nettoyage peut rester supérieure à celle d'avant le test jusqu'au passage de l'autovacuum.

## Journaux de process-document (relevés par l'utilisateur)

Dans le tableau de bord Supabase, journaux de la fonction `process-document`, filtrer sur l'identifiant de chaque Document :

| Fichier | Document | `embed_ms` | `complete_ms` | `duration_ms` | Échec (`process_document_work_failed`, code) |
| --- | --- | --- | --- | --- | --- |
| .txt | d48a0560-deca-4b8d-a3ef-f65805437f37 | à relever | à relever | à relever | à relever |
| .md | b0f59d7f-f8b1-40b0-98e5-75bc05849c09 | à relever | à relever | à relever | à relever |

## Proposition

Aucune : les trois conditions sont réunies pour les deux fichiers.

## Décision (2026-11-12, utilisateur) : retenu

`complete_ms` relevés dans les journaux de `process-document` : **2 556 ms** (.txt, 116 Passages) et **3 047 ms** (.md, 115 Passages), sous le critère de 4 s. **Limite retenue : 100 000 octets pour les fichiers `.txt` et `.md` et pour les Notes** (Note mesurée après normalisation).

**Marge à surveiller** : écriture finale d'environ **3 s pour 115 Passages**, sous une limite de **8 s** par instruction (`statement_timeout` de la connexion `authenticator` de l'API, dont `service_role` hérite). À remesurer avec `npm run load:1mo -- --remote --size=100000` si le plan Supabase, la taille des Passages, le modèle de vectorisation ou la charge de la base changent. L'écart observé entre les deux fichiers à 150 000 octets (3,3 s et 7,0 s) montre que la durée varie fortement d'une exécution à l'autre sur l'instance gratuite.

**Option 2 (écriture des Passages par lots)** : reportée après l'Epic 5, seulement si des Documents de plus de 100 000 octets deviennent nécessaires.
