# Assistant réel — test:chat:live (story 5.4)

- Date : 2026-11-17T10:21:33.980Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Résultat : réussi (critères bloquants : 15 sur 15 ; termes interdits : 0 sur 15 ; repères [P bruts : 0 sur 15)
- Compteur du jour du Compte : 27 avant, 42 après (15 questions, +15 attendu) : cohérent

## Critères bloquants (3 essais sur 3)

| Cas | Essai | HTTP | Issue | Sources | Source attendue | Fait attendu | Terme interdit | Repère [P | Renvois valides | « 1. » initial | Durée | Conforme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| q1 | 1 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 5375 ms | oui |
| q1 | 2 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 2851 ms | oui |
| q1 | 3 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 2281 ms | oui |
| p1 | 1 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 2136 ms | oui |
| p1 | 2 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 1725 ms | oui |
| p1 | 3 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 2188 ms | oui |
| h1 | 1 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 1482 ms | oui |
| h1 | 2 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 1910 ms | oui |
| h1 | 3 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 1358 ms | oui |
| o1 | 1 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 1711 ms | oui |
| o1 | 2 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 1345 ms | oui |
| o1 | 3 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 1281 ms | oui |
| c1 | 1 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 1890 ms | oui |
| c1 | 2 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 1586 ms | oui |
| c1 | 3 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 1440 ms | oui |

### Textes des réponses

- q1 #1 : Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- q1 #2 : Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- q1 #3 : Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- p1 #1 : Le guide indique qu’une relance reste un message de service, à adresser avec courtoisie et sans reproche.[S1]
- p1 #2 : Le guide indique qu’une relance reste un message de service, qu’elle doit rappeler le numéro de la facture, son montant et sa date d’échéance, sans reproche.[S1]
- p1 #3 : Le guide indique qu’une relance reste un message de service, qu’elle doit rappeler le numéro de la facture, son montant et sa date d’échéance, sans reproche.[S1]
- h1 #1 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #2 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #3 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- o1 #1 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #2 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #3 : Je réponds uniquement à partir des Documents de NexaWorks.
- c1 #1 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance selon[S1], et de 21 jours après la date d’échéance selon[S2]. Les Documents ne concordent pas : 15 jours selon[S1], 21 jours selon[S2].
- c1 #2 : La première relance d’une facture impayée est envoyée 15 jours après la date d’échéance selon[S1], et 21 jours après la date d’échéance selon[S2]. Les Documents ne concordent pas : 15 jours selon[S1], 21 jours selon[S2].
- c1 #3 : La première relance d’une facture impayée est envoyée 15 jours après la date d’échéance selon[S1], et 21 jours après la date d’échéance selon[S2]. Les Documents ne concordent pas : 15 jours selon[S1], 21 jours selon[S2].
