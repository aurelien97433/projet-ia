# Test de charge : fichiers de 98221 à 98707 octets (story 2.7)

- Date : 2026-11-13T03:32:38.131Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Conditions (par fichier) : *prêt* en moins de 3 min ; moins de 50 Mo ajoutés ; base totale sous 400 Mo (1 Mo = 1 000 000 octets)
- Résultat : **limite de 100 Ko confirmée**
- Coût estimé : 0,0010 $ (tokens ≈ caractères / 4, 0,02 $ par million, tarif du 2026-11-03)

| Fichier | Octets | Caractères | Passages | Statut | Durée | Ajouté | Base totale | Coût | < 3 min / < 50 Mo / < 400 Mo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| .txt | 98707 | 95593 | 116 | ready | 6,5 s | 1,1 Mo | 16,7 Mo | 0,0005 $ | oui / oui / oui |
| .md | 98221 | 95135 | 115 | ready | 2,9 s | 1,1 Mo | 17,7 Mo | 0,0005 $ | oui / oui / oui |

Durée : `updated_at - processing_started_at` (de la création du Document après vérification du fichier jusqu'à l'écriture finale).

## Tailles de la base

| Moment | Base | `documents` | `passages` (index HNSW compris) |
| --- | --- | --- | --- |
| Avant le premier import | 15,6 Mo | 0,2 Mo | 3,5 Mo |
| Après le .txt | 16,7 Mo | 0,2 Mo | 4,6 Mo |
| Après le .md | 17,7 Mo | 0,2 Mo | 5,7 Mo |
| Après nettoyage | 17,7 Mo | 0,2 Mo | 5,7 Mo |

Documents de test restants après nettoyage : 0. PostgreSQL ne rend pas aussitôt l'espace des lignes supprimées : la taille après nettoyage peut rester supérieure à celle d'avant le test jusqu'au passage de l'autovacuum.

## Journaux de process-document (relevés par l'utilisateur)

Dans le tableau de bord Supabase, journaux de la fonction `process-document`, filtrer sur l'identifiant de chaque Document :

| Fichier | Document | `embed_ms` | `complete_ms` | `duration_ms` | Échec (`process_document_work_failed`, code) |
| --- | --- | --- | --- | --- | --- |
| .txt | bf5bdcc5-cd3e-423e-96d3-170f569759b5 | à relever | à relever | à relever | à relever |
| .md | da618f97-96eb-4e65-ad83-861e5686bdfe | à relever | à relever | à relever | à relever |

Ces durées n'ont pas été relevées pour cette exécution de vérification. Les valeurs de référence à 100 000 octets restent celles de `charge-100000-octets.md` : `complete_ms` de 2 556 et 3 047 ms.

## Proposition

Aucune : les trois conditions sont réunies pour les deux fichiers.

## Vérification en production de la story 2.7 (2026-11-13, de 07:25 à 07:35, environ 10 min)

Exécution de vérification, après le déploiement de la limite de 100 000 octets : commit `ec8aa83` sur Vercel (*Ready*), puis `npm run deploy:supabase` par l'utilisateur (migration `20261112170000_limit_100000.sql` appliquée sur le projet distant, `process-document` redéployée, `semantic-search` inchangée).

- **Mesure** (`npm run load:1mo -- --remote`, ce rapport) : deux fichiers juste sous la limite, *prêts*. Le `.txt` a pris 6,5 s pour 116 Passages, le `.md` 2,9 s pour 115 Passages ; environ 1,1 Mo ajoutés par fichier ; base à 17,7 Mo. **Limite de 100 Ko confirmée.**
- **Refus dans l'interface** : un fichier de 100 001 octets est refusé aussitôt (« Ce fichier dépasse 100 Ko, la taille maximale. »), sans dépôt.
- **Nettoyage, contrôlé en lecture seule** (`supabase db query --remote --read-only`, après l'exécution) :
  - aucun Document « Test de charge 1 Mo », tous Comptes confondus ;
  - aucun Passage rattaché à un tel Document ;
  - aucun des deux Documents de cette mesure (`bf5bdcc5…`, `da618f97…`) ;
  - 13 Documents au total, comme avant le test.
- **Constat hors test de charge** : deux objets orphelins dans le bucket `documents` (34 et 0 octets), déposés le 2026-11-12 vers 08:28 UTC par le Compte des Documents de test de 2.6a et 2.6b, pendant la vérification de 2.6b. Ils ne viennent pas de `load:1mo`. C'est le risque connu du dépôt avant l'import (`deferred-work.md`, nettoyage des fichiers jamais importés).
