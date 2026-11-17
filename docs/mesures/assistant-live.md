# Assistant réel — test:chat:live (story 5.3)

- Date : 2026-11-17T08:05:46.207Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Résultat : réussi (critères bloquants : 12 sur 12 ; termes interdits : 0 sur 12)
- Compteur du jour du Compte : 0 avant, 12 après (12 questions, +12 attendu) : cohérent

## Critères bloquants (3 essais sur 3)

| Cas | Essai | HTTP | Issue | Sources | Fait attendu | Terme interdit | Durée | Conforme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| q1 | 1 | 200 | answer | Procédure de facturation | oui | non | 3594 ms | oui |
| q1 | 2 | 200 | answer | Procédure de facturation | oui | non | 1971 ms | oui |
| q1 | 3 | 200 | answer | Procédure de facturation | oui | non | 1379 ms | oui |
| p1 | 1 | 200 | answer | Guide des relances clients | oui | non | 2406 ms | oui |
| p1 | 2 | 200 | answer | Guide des relances clients | oui | non | 1737 ms | oui |
| p1 | 3 | 200 | answer | Guide des relances clients | oui | non | 1953 ms | oui |
| h1 | 1 | 200 | refusal_info_absente | - | oui | non | 1577 ms | oui |
| h1 | 2 | 200 | refusal_info_absente | - | oui | non | 1364 ms | oui |
| h1 | 3 | 200 | refusal_info_absente | - | oui | non | 1442 ms | oui |
| o1 | 1 | 200 | refusal_hors_cadre | - | oui | non | 1935 ms | oui |
| o1 | 2 | 200 | refusal_hors_cadre | - | oui | non | 1230 ms | oui |
| o1 | 3 | 200 | refusal_hors_cadre | - | oui | non | 1277 ms | oui |

### Textes des réponses

- q1 #1 : 1. Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client. [P2]
- q1 #2 : 1. Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client. [P2]
- q1 #3 : 1. Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client. [P2]
- p1 #1 : Le guide indique qu’il faut rester courtois. [P1] Une relance reste un message de service, sans reproche. [P1] 1. Adopter un ton courtois dans la relance. [P1] 2. Présenter la relance comme un message de service, en rappelant le numéro de la facture, son montant et sa date d’échéance, sans reproche. [P1]
- p1 #2 : Le guide indique qu’il faut rester courtois. Une relance reste un message de service, sans reproche. [P1] 1. Adopter un ton courtois. [P1] 2. Considérer la relance comme un message de service. [P1] 3. Éviter tout reproche dans le message. [P1]
- p1 #3 : Le guide indique qu’il faut rester courtois. Une relance reste un message de service, sans reproche. [P1] 1. Adopter un ton courtois. [P1] 2. Considérer la relance comme un message de service. [P1] 3. Éviter tout reproche dans le message. [P1]
- h1 #1 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #2 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #3 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- o1 #1 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #2 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #3 : Je réponds uniquement à partir des Documents de NexaWorks.
