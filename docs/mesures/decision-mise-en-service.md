# Décision de mise en service — NexaMind AI

Story 7.9, 2026-11-27. **Décision : Go avec réserves** (porteur du produit, 2026-11-27 ; § 6). Seuils et actions de repli proposés par Claude et validés par le porteur du produit.

Pour chaque critère : la valeur mesurée, le seuil de décision, l'alerte qui signale qu'il est manqué, et l'action de repli. Les valeurs mesurées viennent des rapports de [docs/mesures](.) ; aucune n'a été mesurée pour ce document.

## 1. Qualité des réponses (SM-1, SM-2, faits inventés, citations)

| Critère | Mesuré | Go | Go avec réserves | No-Go | Alerte | Repli |
|---|---|---|---|---|---|---|
| SM-1 — Exactitude sourcée | 20/20 ([indicateurs.md](indicateurs.md)) | ≥ 16/20 | — | < 16/20 | `measure:all` ou relecture d'une réponse | Revenir à la dernière consigne validée ; démonstration limitée aux questions mesurées |
| Faits inventés (SM-1 et SM-2) | 0 | 0 | — | ≥ 1 | Relecture humaine des réponses écrites dans les rapports | No-Go tant que la cause n'est pas corrigée et rejouée |
| SM-2 — Refus justes | 10/10 | ≥ 9/10 | — | < 9/10 ou une information inventée | `measure:all` | Idem SM-1 |
| Citations | 15/15 renvois valides, 0 repère brut ([assistant-live-3.md](assistant-live-3.md)) | 0 Source inventée | — | une Source citée absente des Passages | `test:chat:live` (critère bloquant) | Déjà en place : réponse refusée (`AI_CITATIONS_INVALID`) plutôt que publiée sans preuve |
| Consigne cachée du Document piège | 0/50 réponses, 0/15 | 0 | — | ≥ 1 | Termes bloquants de `test:chat:live` et `measure:all` | Retirer le Document piège de la démonstration ; corriger la consigne (AD-13) |

## 2. Parcours et sécurité (SM-3 à SM-6)

| Critère | Mesuré | Go | Go avec réserves | No-Go | Alerte | Repli |
|---|---|---|---|---|---|---|
| SM-3 — Parcours UJ-2 | 3/3 ([uj2-live.md](uj2-live.md)) | 3/3 | 2/3, cause hors application (réseau, démarrage à froid) | < 2/3 | `test:uj2:live` | Vidéo de secours (7.5) pour la partie en échec |
| SM-4 — Pertinence de la Recherche | 10/10 ; 4/4 hors base sans résultat | ≥ 8/10 | — | < 8/10 | `measure:all` | Seuil 0,40 gardé ; Requêtes de la démonstration choisies parmi les mesurées |
| SM-5 — Fiabilité de l'ajout | 5/5 | 100 % | — | < 100 % | `measure:all` ; Statut « en erreur » sur le site | « Réessayer » ; Note courte préparée à l'avance |
| SM-6 — Cloisonnement | 3/3 ([securite-live-2.md](securite-live-2.md)) | 3/3 | — | < 3/3 | `test:security:live` | **No-Go** sans exception : un défaut de cloisonnement n'a pas de repli |
| Audit de sécurité | 0 constat haut ouvert ([audit-securite.md](../tests/audit-securite.md)) | 0 haut ouvert | moyens acceptés par écrit (R3, R4) | ≥ 1 haut ouvert | Bilan des anomalies | Corriger avant toute mise en service |

## 3. Latence (NFR-3, indicatifs)

| Critère | Mesuré | Go | Go avec réserves | No-Go | Alerte | Repli |
|---|---|---|---|---|---|---|
| Recherche | médiane 572 ms, max. 1 027 ms ; 3,5 s à froid (D37) | médiane < 3 s | 1re Recherche > 3 s à froid | médiane ≥ 3 s | `test:search:live` | Réchauffer : une Recherche et une question 5 min avant la démonstration |
| Assistant, premier affichage | médiane 1 450 ms, max. 3 099 ms ; 5,2 s à froid (M3) | médiane < 5 s | 1re question > 5 s à froid | médiane ≥ 5 s | `test:chat:live` | Idem ; garde-fou des 17 s déjà en place (message et « Réessayer ») |
| Écriture finale d'un Document de 100 Ko (D46) | 2,6 à 3,0 s sous la limite de 8 s (12/11, [charge-100000-octets.md](charge-100000-octets.md)) ; limite de 100 Ko confirmée en production le 13/11 ([charge-100000-octets-2.md](charge-100000-octets-2.md)). Non remesuré pour la décision (choix du porteur du produit) : le traitement des Documents n'a pas changé depuis | < 5 s | 5 à 7 s | ≥ 7 s ou échec | `npm run load:1mo -- --remote` (< 0,001 $) ; Document « en erreur » sur le site | Démonstration avec des Documents de moins de 50 Ko ; limite abaissée si l'échec se répète |

## 4. Coût et quotas (NFR-8, AD-14, AD-15)

Hypothèse de consommation restante : répétition générale (7.5) et démonstration, environ 100 questions et 10 Résumés, soit **environ 0,70 $** (0,006 $ par question mesuré en 5.4 et 5.5).

| Critère | Mesuré | Go | Go avec réserves | No-Go | Alerte | Repli |
|---|---|---|---|---|---|---|
| Crédit OpenAI prépayé restant | **9,70 $**, sans recharge automatique ; dépense du mois : 0,29 $ (page Billing, relevé du porteur du produit, 2026-11-27) : **Go** | ≥ 3 $ (plus de 4 fois la consommation prévue) | 1 à 3 $ | < 1 $ sans recharge | Courriels d'OpenAI à 5 $ et 10 $ de dépense ; `AI_BUDGET_EXHAUSTED` (503) sur le site quand le crédit est épuisé | Recharger le crédit (sans recharge automatique) ; sinon vidéo de secours |
| Limite de dépense du projet chez OpenAI | 10 $, **non bloquante** (relevé du 2026-11-27) : elle déclenche une alerte, elle n'arrête pas les appels ; alertes par e-mail actives à 5 $ et 10 $ | — | réserve (§ 6) | — | Courriels à 5 $ et 10 $ | La borne réelle est le crédit prépayé, sans recharge automatique. **Écart avec NFR-8**, qui prévoyait un plafond bloquant de 10 $ chez le fournisseur ; c'est le repli prévu par AD-15 (« crédit prépayé limité » si le plafond n'est pas strictement bloquant) qui s'applique |
| Modèles autorisés pour le projet | `gpt-5.4-mini` et `text-embedding-3-small` seulement, confirmés par le porteur du produit (aucun autre modèle utilisable, même avec une clé dérobée) : **Go** | les deux modèles autorisés | — | un des deux refusé | `AI_UNAVAILABLE` ; Documents « en erreur » ; Recherche sans résultat | Ajouter le modèle manquant dans les réglages du projet OpenAI |
| Plafond global du projet | 300 appels par jour | non atteint pendant la démonstration | — | — | `AI_DAILY_CAP_REACHED` (503, message distinct) | Relever `ai_global_daily_cap` par une instruction SQL ([environnements.md](../environnements.md)) |
| Quota par Compte | 60 par jour | Comptes de démonstration sous 60 | — | — | `QUOTA_EXCEEDED` (429, heure de rétablissement) | Basculer sur un autre Compte de démonstration |
| Espace de la base et du Storage (R3) | non relevé pour ce document : à lire au tableau de bord avant la répétition générale (7.5) | < 80 % du plan gratuit | 80 à 90 % | > 90 % | Tableau de bord Supabase | Supprimer les Documents de test ; fermer l'inscription le jour J si un Compte inconnu remplit l'espace |

## 5. Disponibilité

| Événement | Alerte | Repli |
|---|---|---|
| Vercel, Supabase ou OpenAI indisponible | Page en erreur ; `AI_UNAVAILABLE` sur le site | Vidéo de secours (7.5) ; reprise du site dès le retour du service |
| Déploiement défectueux | Parcours manuel échoué après un push | Revenir au déploiement précédent dans Vercel (« Instant Rollback ») ; ne rien déployer le jour J |

## 6. Décision

**Go avec réserves**, décidé par le porteur du produit le 2026-11-27.

**Raisons.**
- SM-1 : 20/20, 0 fait inventé ; SM-2 : 10/10 ; SM-4 : 10/10 ; SM-5 : 5/5 ([indicateurs.md](indicateurs.md)).
- SM-6 réussi en production ([securite-live-2.md](securite-live-2.md)).
- Aucune anomalie haute ouverte après l'audit de sécurité ([audit-securite.md](../tests/audit-securite.md)).
- Crédit prépayé de 9,70 $ pour un coût mesuré de quelques centimes par jour de tests (0,29 $ dépensés ce mois-ci, 50 questions de `measure:all` pour environ 0,30 $).

**Réserves.**
1. **Non-déterminisme du modèle** : prouvé par les journaux et atténué par la consigne (rejeu 15 sur 15), jamais nul ; une question frontière peut changer de classement d'un essai à l'autre.
2. **Volume et vectorisation** bornés seulement par le crédit prépayé : aucune limite de volume par Compte, vectorisation hors quota (audit R3 et R4, acceptés).
3. **Limite de dépense OpenAI non bloquante** : écart avec NFR-8 (repli d'AD-15 appliqué) ; la borne réelle est le crédit prépayé sans recharge automatique, sous les alertes à 5 $ et 10 $.
4. **Questions ambiguës** : pour a1, a2 et y3, l'Assistant refuse au lieu de distinguer les cas (D81, accepté) ; sûr, mais moins utile.

**Points suivis sans être des réserves** : démarrage à froid de la première Recherche et de la première question (D37, M3), traité par le réchauffage à la répétition générale (7.5) ; `test:summary:live` à adapter (D86), génération du Résumé vérifiée à la main sur le site ; D46 non remesuré, traitement inchangé depuis la mesure du 13/11.
