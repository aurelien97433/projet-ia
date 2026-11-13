# Test de charge de la limite de 1 Mo (story 2.7)

- Date : 2026-11-12T11:35:54.095Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Conditions (par fichier) : *prêt* en moins de 3 min ; moins de 50 Mo ajoutés ; base totale sous 400 Mo (1 Mo = 1 000 000 octets)
- Résultat : **au moins une condition échouée** (proposition ci-dessous, non appliquée)
- Coût estimé : 0,0096 $ (tokens ≈ caractères / 4, 0,02 $ par million, tarif du 2026-11-03)

| Fichier | Octets | Caractères | Passages | Statut | Durée | Ajouté | Base totale | Coût | < 3 min / < 50 Mo / < 400 Mo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| .txt | 989984 | 958803 | 0 | error (temporary) | 54,1 s | 0,0 Mo | 12,9 Mo | 0,0048 $ | **non** / oui / oui |
| .md | 989208 | 958160 | 0 | error (temporary) | 57,2 s | 0,0 Mo | 12,9 Mo | 0,0048 $ | **non** / oui / oui |

Durée : `updated_at - processing_started_at` (de la création du Document après vérification du fichier jusqu'à l'écriture finale).

## Tailles de la base

| Moment | Base | `documents` | `passages` (index HNSW compris) |
| --- | --- | --- | --- |
| Avant le premier import | 12,9 Mo | 0,2 Mo | 0,9 Mo |
| Après le .txt | 12,9 Mo | 0,2 Mo | 0,9 Mo |
| Après le .md | 12,9 Mo | 0,2 Mo | 0,9 Mo |
| Après nettoyage | non mesurée | | |

Documents de test restants après nettoyage : non vérifié. PostgreSQL ne rend pas aussitôt l'espace des lignes supprimées : la taille après nettoyage peut rester supérieure à celle d'avant le test jusqu'au passage de l'autovacuum.

## Journaux de process-document (relevés par l'utilisateur)

| Fichier | Document | Accepté | `embed_ms` | `complete_ms` | `duration_ms` | Événements |
| --- | --- | --- | --- | --- | --- | --- |
| .txt | a495ed19-f1b9-4785-a062-694a19702e4e | 202 | non journalisé | non journalisé | 39 529 | `process_document_work_failed` (`TimeoutError`), puis `fail_processing_failed` (`TimeoutError`) |
| .md | fb5c990b-479f-47d6-91f2-a048fe56432d | 202 | non journalisé | non journalisé | 37 672 | `process_document_work_failed` (`TimeoutError`), puis `fail_processing_failed` (`TimeoutError`) |

`embed_ms` et `complete_ms` ne sont écrits que dans `process_document_work_done`, absent ici puisque le travail a échoué.

## Analyse

**Étape expirée : l'appel de `complete_processing`, au bout de son délai de 30 s** (`COMPLETE_TIMEOUT_MS`, `supabase/functions/_shared/processing.ts`).
- Le code `TimeoutError` est le nom de l'erreur levée par `AbortSignal.timeout` sur un appel à la base. Une expiration de la vectorisation aurait produit le code `AI_TIMEOUT` (`_shared/ai.ts`) ; une erreur de la base, un code `http_…`.
- Les appels à la base de `process-document` ont trois délais : 4 s (lecture du Document, `fail_processing`), 15 s (téléchargement du fichier), 30 s (`complete_processing`). Seul le dernier explique une fin à 37,7 et 39,5 s : environ 8 à 10 s pour lire, découper et vectoriser (13 lots de vecteurs, dans les délais), puis 30 s d'attente de `complete_processing`.
- `complete_processing` reçoit en un seul appel les 1 157 à 1 162 Passages et leurs vecteurs : environ **25 Mo de JSON** (21,8 ko par Passage, vecteurs de 1 536 nombres en texte). La base doit lire ce JSON, convertir chaque vecteur, insérer chaque ligne et mettre à jour l'index HNSW, sur l'instance partagée du plan gratuit. La même opération prend 1 à 2 s sur la pile locale, sur un poste bien plus rapide.

**Pourquoi `fail_processing` a aussi expiré (délai de 4 s).**
- `complete_processing` commence par verrouiller la ligne du Document (`select … for update`). Quand `process-document` abandonne l'appel à 30 s, la transaction continue côté base, verrou compris.
- `fail_processing` doit modifier cette même ligne : il attend le verrou, et l'appel expire à 4 s.
- La base a pourtant exécuté `fail_processing` plus tard : les deux Documents sont *en erreur* temporaire, avec le message de `process-document`, écrit 54,1 et 57,2 s après leur création. La transaction de `complete_processing` a donc pris fin environ 45 s après son début, sans valider : 0 Passage, aucun Mo ajouté.
- Non établi : si cette fin vient de la déconnexion du client ou d'une limite de durée des requêtes côté base. Dans les deux cas, la conclusion est la même : un seul appel d'environ 25 Mo prend plus de 30 s, et environ 40 s de travail en base, pour un fichier de 1 Mo.

**Conséquence pour les Notes.** Une Note de 1 000 000 octets suit exactement le même chemin (`complete_processing` en un appel) : elle échouerait de la même façon. La limite actuelle des Notes est aussi de 1 000 000 octets.

**Lien avec le `http_500` vu sous charge locale (story 3.2).** Probable, sans preuve : il s'agissait aussi d'échecs de `process-document` après 15 à 27 s, sous charge. La même écriture unique et lourde, ralentie par les suites e2e en parallèle, est l'explication la plus simple.

**Mesures disponibles** (production) :

| Texte | Passages | JSON de `complete_processing` | Résultat |
| --- | --- | --- | --- |
| 60 000 caractères (story 2.4) | 73 | 1,6 Mo | *prêt* en 1,98 s au total |
| 958 803 caractères (.txt) | 1 162 | 25,3 Mo | échec : plus de 30 s, environ 40 s de travail en base |
| 958 160 caractères (.md) | 1 157 | 25,2 Mo | échec : idem |

Coût en base observé : au moins 26 ms par Passage (30 s pour 1 162), plus probablement 35 à 40 ms (environ 40 à 45 s de travail).

Nettoyage de cette exécution : il a échoué pendant le test, la base étant encore occupée par les écritures abandonnées. Le message affichait « undefined » (corrigé : cause réelle, et trois essais espacés de 10 s). `--cleanup`, lancé ensuite par l'utilisateur, confirme qu'aucun Document de test ne reste.

## Propositions (non appliquées)

### A. Écriture des Passages par lots, limite de 1 Mo conservée

- **Principe** : `process-document` écrit les Passages par lots de 100 (environ 2,2 Mo de JSON chacun) pour la tentative courante, puis une opération finale courte vérifie le nombre de Passages et passe le Document à *prêt*. Une tentative périmée ne peut toujours pas rendre un Document prêt.
- **Temps estimé pour 1 Mo** : 12 lots d'environ 3,5 à 4 s chacun, soit 45 à 50 s d'écriture, plus 8 à 10 s de vectorisation : **environ 1 min**. C'est sous les 3 min, et chaque appel reste loin de sa limite de 30 s.
- **Travail** : une migration (colonne de tentative sur `passages` ou table d'attente, fonction d'écriture d'un lot, `complete_processing` réduite à la validation), la boucle dans `process-document`, le nettoyage des lots d'une tentative abandonnée, les tests unitaires et d'intégration, `deploy:supabase`, puis une nouvelle exécution de `load:1mo`. Environ une story, soit une demi-journée à une journée.
- **Risque : moyen.** Le chemin modifié sert à **tous** les Documents (Notes, fichiers, préchargement du Jeu). Une erreur d'atomicité laisserait des Passages partiels, ou un Document *prêt* incomplet. Les tests existants (tentative périmée, relance, expiration de 3 min) doivent tous être repris.
- **Charge sur la base** : le travail total est inchangé (environ 40 s pour 1 Mo sur le plan gratuit, 10 à 19 Mo ajoutés par fichier d'après la pile locale). Il est seulement découpé : des transactions courtes, et la ligne du Document n'est verrouillée qu'à la validation finale. Pendant ce temps, les autres requêtes (Recherche, Assistant) restent ralenties sur une instance partagée. Avec le budget de 400 Mo, il faudrait environ 20 fichiers de 1 Mo pour l'atteindre.
- **Variante plus légère (A')** : garder l'appel unique et porter son délai de 30 s à 120 s (limite de 150 s des Edge Functions). Une ligne à changer, mais une transaction d'environ 45 s qui verrouille le Document, et aucune marge si l'instance est plus lente. Non recommandée.

### B. Limite plus basse pour les .txt et .md

- **Taille réellement prouvée** : seulement **60 000 caractères** (73 Passages, *prêt* en 1,98 s).
- **Taille estimée sûre : 300 000 octets.** Elle représente environ 360 Passages et 7,9 Mo de JSON. Avec 35 à 40 ms par Passage, l'écriture prendrait environ 13 à 15 s, soit **une marge de 2** sous le délai de 30 s.
  - Point d'équilibre estimé : 750 à 850 Passages, soit 600 000 à 700 000 octets.
  - Au-dessus de 400 000 octets, la marge passe sous 1,5.
- **Condition avant de l'appliquer** : une exécution de `load:1mo` à 300 000 octets, qui transformerait cette estimation en mesure.
- **Ce que la baisse change** :
  - la limite de 1 Mo du bucket (migration) ;
  - le contrôle avant envoi et le contrôle du serveur ;
  - les messages « dépasse 1 Mo » ;
  - FR-5 et EXPERIENCE.md ;
  - les tests.

  **La même limite devrait s'appliquer aux Notes**, qui ont le même chemin d'écriture.
- **Temps** : une à deux heures. **Risque : faible** (valeurs et messages, aucun changement du traitement).
- **Effet produit** : un document de plus de 300 Ko (environ 100 pages) n'est plus importable. Les Documents du Jeu de démonstration doivent rester sous cette limite (à vérifier pour 7.1a).

## Recommandation

L'Epic 5 commence lundi 16/11 et repose sur un traitement des Documents stable (Assistant, Sources, préchargement du Jeu). Je recommande **B maintenant**, à **300 000 octets**, pour les fichiers **et** les Notes, après une exécution de confirmation de `load:1mo` à cette taille. Cette option ne touche pas au traitement et protège la démonstration.

**A est à garder comme amélioration ultérieure**, à planifier après l'Epic 5, par exemple avec les finitions, si une limite de 1 Mo reste nécessaire. Elle modifie le cœur du traitement : la faire maintenant ferait entrer un risque de régression juste avant 5.2a.

La décision revient à l'utilisateur. Rien n'a été appliqué.

## Complément (2026-11-12, après la mesure à 300 000 octets)

La cause est précisée dans `charge-300000-octets.md`. La connexion de l'API (`authenticator`) limite chaque instruction à **8 s** (`statement_timeout`), et `service_role` en hérite. À 1 Mo, l'envoi des 25 Mo de JSON a dépassé les 30 s du client, puis l'instruction a été annulée à 8 s côté base. Les estimations de la proposition B ci-dessus (budget de 30 s) sont donc trop optimistes : elles sont remplacées par les options de `charge-300000-octets.md`.

## Décision finale (2026-11-12)

Limite retenue : **100 000 octets** pour les fichiers `.txt` et `.md` et pour les Notes (`charge-100000-octets.md`). Écriture par lots reportée après l'Epic 5.
