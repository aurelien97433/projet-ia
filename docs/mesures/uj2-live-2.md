# Parcours UJ-2 réel — test:uj2:live (story 6.2)

- Date : 2026-11-27T07:37:44.507Z
- Cible : production Vercel (UJ2_LIVE_URL de .env.seed, adresse non reproduite), vraie IA
- Projet Supabase : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed (sa session seulement)
- Largeur : ordinateur 1 280 px, clavier seul ; trace, vidéo et captures désactivées
- Résultat : 3 sur 3 (réussi)

## Exécutions

| Exécution | Résultat | Durée | Compteur avant | Compteur après | Écart | *en cours* observé |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | réussie | 53,8 s | 15 | 17 | +2 | oui |
| 2 | réussie | 30,3 s | 17 | 19 | +2 | non (traitement plus rapide) |
| 3 | réussie | 31,9 s | 19 | 21 | +2 | oui |

## Durée de chaque étape

| Étape | Exécution 1 | Exécution 2 | Exécution 3 |
| --- | --- | --- | --- |
| 1. Connexion | 12,2 s | 3,8 s | 3,1 s |
| 2. Ajout de la Note | 5,3 s | 3,3 s | 3,0 s |
| 3. Traitement jusqu'à « prêt » | 3,4 s | 0,0 s | 3,4 s |
| 4. Question à l'Assistant | 7,5 s | 3,7 s | 3,3 s |
| 5. Source et page complète | 3,1 s | 2,4 s | 2,9 s |
| 6. Résumé | 3,5 s | 3,0 s | 2,4 s |
| 7. Compteur du jour | 0,7 s | 0,3 s | 0,4 s |
| 8. Suppression du Document | 2,1 s | 1,6 s | 1,6 s |
| 9. Cas limite : .txt vide | 13,5 s | 10,6 s | 10,7 s |

## Contrôle manuel

- Bibliothèque de production sans Document « — test UJ-2 » : à consigner après le passage.
