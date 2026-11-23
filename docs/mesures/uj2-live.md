# Parcours UJ-2 réel — test:uj2:live (story 6.2)

- Date : 2026-11-23T11:37:19.612Z
- Cible : production Vercel (UJ2_LIVE_URL de .env.seed, adresse non reproduite), vraie IA
- Projet Supabase : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed (sa session seulement)
- Largeur : ordinateur 1 280 px, clavier seul ; trace, vidéo et captures désactivées
- Résultat : 3 sur 3 (réussi)

## Exécutions

| Exécution | Résultat | Durée | Compteur avant | Compteur après | Écart | *en cours* observé |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | réussie | 48,9 s | 19 | 21 | +2 | oui |
| 2 | réussie | 37,1 s | 21 | 23 | +2 | oui |
| 3 | réussie | 35,5 s | 23 | 25 | +2 | oui |

## Durée de chaque étape

| Étape | Exécution 1 | Exécution 2 | Exécution 3 |
| --- | --- | --- | --- |
| 1. Connexion | 10,7 s | 3,8 s | 3,9 s |
| 2. Ajout de la Note | 4,8 s | 3,9 s | 3,2 s |
| 3. Traitement jusqu'à « prêt » | 3,5 s | 3,5 s | 3,5 s |
| 4. Question à l'Assistant | 7,8 s | 4,5 s | 4,0 s |
| 5. Source et page complète | 4,0 s | 3,1 s | 2,7 s |
| 6. Résumé | 3,6 s | 3,6 s | 3,6 s |
| 7. Compteur du jour | 0,7 s | 0,4 s | 0,4 s |
| 8. Suppression du Document | 1,8 s | 2,3 s | 1,7 s |
| 9. Cas limite : .txt vide | 9,7 s | 10,4 s | 11,5 s |

## Contrôle manuel

- Bibliothèque de production sans Document « — test UJ-2 » : vérifiée par l'utilisateur le 2026-11-23, aucun Document restant.
