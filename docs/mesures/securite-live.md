# Sécurité en production — test:security:live (story 7.3)

- Date : 2026-11-24T11:29:53.991Z
- Cible : production (URL non écrite) et projet Supabase distant lié
- Comptes : Comptes de démonstration A et B de .env.seed (sessions par mot de passe, jamais service_role)
- Résultat : réussi

## SM-6 — Cloisonnement entre Comptes

| Critère | Vérification | Détail | Conforme |
| --- | --- | --- | --- |
| 1 | B lit la Note de A et la retrouve par semantic-search | Note prête : oui ; lecture par B : oui ; Recherche de B : trouvée | oui |
| 2 | B ne peut ni modifier ni supprimer la Note de A | modification : 0 ligne(s) ; suppression : 0 ligne(s) ; Note relue par A : inchangée | oui |
| 3 | B ne voit ni les Conversations de A ni leurs messages | existants chez A : 1 Conversation(s), 2 message(s) ; vus par B : 0 Conversation(s), 0 message(s) ; aucune Conversation créée, 0 unité | oui |

### Nettoyage (session de A)

- Note « — test SM-6 » de A restante : 0
- Documents « — test SM-6 » restants (tous Auteurs, contrôle final) : 0

## Appels sans session (Route Handlers de src/app/api)

Écart avec l'epic (validé par l'utilisateur le 2026-11-24) : la route « quota » citée par l'epic n'existe pas (quota lu côté serveur) ; les 9 Route Handlers réels sont testés.

| Route | Méthode | Statut | Code | Corps limité à l'erreur | Conforme |
| --- | --- | --- | --- | --- | --- |
| /api/chat | POST | 401 | UNAUTHENTICATED | oui | oui |
| /api/conversations | GET | 401 | UNAUTHENTICATED | oui | oui |
| /api/documents | GET | 401 | UNAUTHENTICATED | oui | oui |
| /api/documents/[id] | GET | 401 | UNAUTHENTICATED | oui | oui |
| /api/documents/[id]/status | GET | 401 | UNAUTHENTICATED | oui | oui |
| /api/documents/[id]/summary | POST | 401 | UNAUTHENTICATED | oui | oui |
| /api/documents/statuses | GET | 401 | UNAUTHENTICATED | oui | oui |
| /api/search | POST | 401 | UNAUTHENTICATED | oui | oui |
| /api/uploads | POST | 401 | UNAUTHENTICATED | oui | oui |

## Code envoyé au navigateur (page de connexion et fichiers /_next/static/ chargés)

Portée : la page /connexion et les fichiers /_next/static/ qu'elle charge (et ceux qu'ils citent) ; les morceaux propres aux autres écrans ne sont pas lus (contrôlés au build par check:secrets --static).

- 14 fichier(s) analysé(s) ; lectures en échec : 0 ; constats : 0 ; conforme : oui
