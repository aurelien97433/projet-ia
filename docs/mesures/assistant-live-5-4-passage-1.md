# Assistant réel — test:chat:live (story 5.4)

- Date : 2026-11-17T09:32:19.447Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Résultat : ÉCHEC (critères bloquants : 13 sur 15 ; termes interdits : 0 sur 15 ; repères [P bruts : 0 sur 15)
- Compteur du jour du Compte : 12 avant, 27 après (15 questions, +15 attendu) : cohérent

## Critères bloquants (3 essais sur 3)

| Cas | Essai | HTTP | Issue | Sources | Source attendue | Fait attendu | Terme interdit | Repère [P | Renvois valides | « 1. » initial | Durée | Conforme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| q1 | 1 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 4902 ms | oui |
| q1 | 2 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 1971 ms | oui |
| q1 | 3 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 1781 ms | oui |
| p1 | 1 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 1881 ms | oui |
| p1 | 2 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 2017 ms | oui |
| p1 | 3 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 1894 ms | oui |
| h1 | 1 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 1314 ms | oui |
| h1 | 2 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 1862 ms | oui |
| h1 | 3 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 1766 ms | oui |
| o1 | 1 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 1344 ms | oui |
| o1 | 2 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 1854 ms | oui |
| o1 | 3 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 1388 ms | oui |
| c1 | 1 | 200 | answer | FAQ comptabilité | NON | NON | non | non | oui | non | 1554 ms | NON |
| c1 | 2 | 200 | answer | FAQ comptabilité | NON | NON | non | non | oui | non | 1637 ms | NON |
| c1 | 3 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 1556 ms | oui |

### Textes des réponses

- q1 #1 : Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- q1 #2 : Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- q1 #3 : Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- p1 #1 : Le guide indique qu’il faut rester courtois.[S1] Une relance est présentée comme un message de service, qui rappelle le numéro de la facture, son montant et sa date d’échéance, sans reproche.[S1]
- p1 #2 : Le guide indique qu’il faut rester courtois.[S1] Une relance doit rester un message de service, rappeler le numéro de la facture, son montant et sa date d’échéance, sans reproche.[S1]
- p1 #3 : Le guide indique qu’il faut rester courtois.[S1] Une relance est présentée comme un message de service, qui rappelle le numéro de la facture, son montant et sa date d’échéance, sans reproche.[S1]
- h1 #1 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #2 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #3 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- o1 #1 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #2 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #3 : Je réponds uniquement à partir des Documents de NexaWorks.
- c1 #1 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture.[S1] 1. Vérifiez la date d’échéance de la facture.[S1] 2. Envoyez la première relance 15 jours après cette date, par e-mail depuis la boîte du service comptable.[S1]
- c1 #2 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture.[S1] 1. La première relance est envoyée 15 jours après la date d’échéance de la facture.[S1] 2. Cette information figure dans la FAQ comptabilité de NexaWorks.[S1]
- c1 #3 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture.[S1] 1. La première relance est envoyée 15 jours après la date d’échéance de la facture.[S1] 2. Une autre note indique 21 jours après la date d’échéance pour la première relance, ce qui contredit la FAQ comptabilité.[S2][S1]
