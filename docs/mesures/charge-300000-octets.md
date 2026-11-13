# Test de charge : fichiers de 298273 à 298905 octets (story 2.7)

- Date : 2026-11-12T12:06:42.039Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Conditions (par fichier) : *prêt* en moins de 3 min ; moins de 50 Mo ajoutés ; base totale sous 400 Mo (1 Mo = 1 000 000 octets)
- Résultat : **au moins une condition échouée** (proposition ci-dessous, non appliquée)
- Coût estimé : 0,0029 $ (tokens ≈ caractères / 4, 0,02 $ par million, tarif du 2026-11-03)

| Fichier | Octets | Caractères | Passages | Statut | Durée | Ajouté | Base totale | Coût | < 3 min / < 50 Mo / < 400 Mo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| .txt | 298905 | 289487 | 0 | error (temporary) | 15,2 s | 0,2 Mo | 13,1 Mo | 0,0014 $ | **non** / oui / oui |
| .md | 298273 | 288906 | 0 | error (temporary) | 20,6 s | -0,2 Mo | 12,9 Mo | 0,0014 $ | **non** / oui / oui |

Durée : `updated_at - processing_started_at` (de la création du Document après vérification du fichier jusqu'à l'écriture finale).

## Tailles de la base

| Moment | Base | `documents` | `passages` (index HNSW compris) |
| --- | --- | --- | --- |
| Avant le premier import | 12,9 Mo | 0,2 Mo | 0,9 Mo |
| Après le .txt | 13,1 Mo | 0,2 Mo | 1,1 Mo |
| Après le .md | 12,9 Mo | 0,2 Mo | 0,9 Mo |
| Après nettoyage | 12,9 Mo | 0,2 Mo | 0,9 Mo |

Documents de test restants après nettoyage : 0. PostgreSQL ne rend pas aussitôt l'espace des lignes supprimées : la taille après nettoyage peut rester supérieure à celle d'avant le test jusqu'au passage de l'autovacuum.

## Journaux de process-document (relevés par l'utilisateur)

| Fichier | Document | `duration_ms` | Événements |
| --- | --- | --- | --- |
| .txt | a4d41595… | 14 355 | `process_document_work_failed` (`http_500`) ; aucun `fail_processing_failed` |
| .md | cf45a0ff… | 19 980 | `process_document_work_failed` (`http_500`) ; aucun `fail_processing_failed` |

Nettoyage réussi.

## Analyse

**Requête en échec : l'appel `POST /rest/v1/rpc/complete_processing`** (écriture finale des Passages). C'est le seul appel à la base qui peut finir en `http_500` après 14 à 20 s :
- la lecture du Document et le téléchargement du fichier ont lieu avant la vectorisation, en moins de 4 et 15 s ;
- `fail_processing`, appelé après, a réussi (Documents *en erreur* à 15,2 et 20,6 s).

**Cause : la limite de durée des requêtes de l'API, 8 s.** Relevé en lecture seule sur le projet distant (`pg_roles`) :

| Rôle | Réglages |
| --- | --- |
| `authenticator` (connexion de l'API PostgREST) | `statement_timeout=8s` ; `lock_timeout=8s` |
| `authenticated` | `statement_timeout=8s` |
| `anon` | `statement_timeout=3s` |
| `service_role` | aucun : il hérite des 8 s de la connexion `authenticator` |

`process-document` appelle la base par l'API avec la clé `service_role`. Toute instruction, dont `complete_processing`, est donc **annulée par Postgres après 8 s** ; l'API répond 500 (erreur Postgres `57014`, « canceling statement due to statement timeout »). Le délai de 30 s fixé côté `process-document` n'est jamais atteint.

**Cette cause explique aussi l'échec à 1 Mo.** Le fichier était 3,3 fois plus lourd (25 Mo de JSON) :
- l'envoi et la lecture du corps ont dépassé à eux seuls les 30 s du client (`TimeoutError`) ;
- l'instruction a ensuite été annulée à 8 s côté base, en gardant le verrou du Document entre-temps (expiration de `fail_processing`, puis Document *en erreur* vers 45 à 57 s).

À 300 000 octets, le corps (environ 7,6 Mo) passe en quelques secondes, et l'instruction atteint les 8 s.

**Coût observé en base** :
- plus de 23 ms par Passage (8 s pour environ 350 Passages) ;
- environ 20 ms au plus pour la Note de 60 000 caractères (73 Passages, 1,98 s en tout).

On retient **23 à 30 ms par Passage** sur l'instance gratuite.

**Confirmation dans le tableau de bord Supabase** (facultative, la configuration suffit à l'établir) :
- **Logs → Postgres** : chercher « statement timeout », vers 12:06–12:08 UTC le 2026-11-12. Attendu : `canceling statement due to statement timeout`, avec le code `57014`.
- **Logs → API** (ou PostgREST) : requêtes `POST /rest/v1/rpc/complete_processing`, statut **500**, aux mêmes heures.

**Journalisation à améliorer (proposée, non appliquée)** : `process-document` ne journalise que le statut HTTP (`http_500`) ; ajouter le code Postgres de la réponse (`57014`), qui ne contient aucune donnée, aurait donné la cause directement.

## Options (non appliquées)

Budget réel : **8 s par instruction**. Marge visée : une instruction de 4 s au plus (moitié du budget). Taille moyenne : environ 850 octets par Passage.

### 1. Limite plus basse, mesurée avant décision

| Limite | Passages | Instruction estimée (23 à 30 ms par Passage) | Marge sous 8 s |
| --- | --- | --- | --- |
| 150 000 octets | environ 175 | 4,0 à 5,3 s | 1,5 à 2 : **juste** |
| 100 000 octets | environ 118 | 2,7 à 3,5 s | 2,3 à 3 : **suffisante** |

- **Mesure** : deux commandes, environ 1 min chacune, moins de 0,002 $ ; rapports `charge-150000-octets.md` et `charge-100000-octets.md`.
- **Critère proposé** : Documents *prêts* et `complete_ms` de 4 s au plus.
- **Résultat probable** : 100 000 octets, soit environ 33 pages de texte.
- **Application** : la même que pour 300 000 octets (migration du bucket, de la contrainte et de la fonction d'import, `process-document`, contrôles, schéma de la Note, messages, PRD, addendum, architecture, epics, tests), soit **une à deux heures**, **risque faible**.
- **Effet produit** : un document de plus de 100 Ko n'est plus importable. Les Documents actuels font 4 036 octets au plus, et le Jeu de démonstration est à vérifier pour 7.1a.

### 2. Écriture des Passages par lots, maintenant

- **Principe** : chaque lot doit rester sous 4 s. Avec 100 Passages, environ 2,2 Mo de JSON, cela fait **2,3 à 3 s par lot**.
- **Temps de traitement** :
  - 300 000 octets : 4 lots, soit 10 à 15 s ;
  - 1 Mo : 12 lots, soit 30 à 40 s d'écriture, plus environ 10 s de vectorisation, **environ 1 min**, sous les 3 min.
  La limite de 1 Mo peut alors être gardée.
- **Travail** : migration (Passages rattachés à leur tentative, fonction d'écriture d'un lot, `complete_processing` réduite à la validation), boucle et nettoyage des lots d'une tentative abandonnée dans `process-document`, reprise des tests de tentative périmée, de relance et d'expiration, `deploy:supabase`, nouvelle mesure. **Une demi-journée à une journée.**
- **Risque : moyen.** Ce chemin traite tous les Documents (Notes, fichiers, préchargement du Jeu).
- **Calendrier** : vendredi 13/11 était réservé à 2.6a et 2.6b, déjà livrées. Les lots peuvent donc tenir dans la journée de vendredi **sans décaler l'Epic 5**. Mais tout imprévu (atomicité, tests instables) déborderait sur lundi, jour de 5.0, juste avant 5.2a qui s'appuie sur ce traitement.

### Piste complémentaire : relever la limite de durée de `service_role` seulement

Une ligne de migration : `alter role service_role set statement_timeout = '60s'`. Seuls `process-document` et le script de préchargement utilisent cette clé.
- **Effet probable** : 300 000 octets passent ; 1 Mo reste bloqué par l'envoi de 25 Mo.
- **À vérifier avant** : que l'API applique bien les réglages du rôle `service_role` (selon la version de PostgREST).
- **Inconvénients** : une transaction longue, qui garde le verrou du Document ; une instance partagée plus chargée.

## Recommandation

**Option 1 maintenant** : mesurer 150 000 puis 100 000 octets, et retenir la plus grande taille dont `complete_ms` reste à 4 s au plus, probablement 100 000. On l'applique ensuite, ce qui protège l'Epic 5 dès lundi sans toucher au cœur du traitement.

**Option 2 après l'Epic 5**, si des Documents plus grands deviennent nécessaires. Elle se mesure alors avec le même script et la même limite de 8 s.

La décision revient à l'utilisateur. Rien n'a été appliqué.

## Suite (2026-11-12)

Option 1 mesurée : 150 000 octets rejetés (`complete_ms` de 3,3 s et 7,0 s), **100 000 octets retenus** (`complete_ms` de 2,6 s et 3,0 s pour 116 et 115 Passages). Voir `charge-100000-octets.md`. Marge à surveiller : environ 3 s pour 115 Passages, sous une limite de 8 s. Option 2 reportée après l'Epic 5.
