# Assistant réel — test:chat:live (story 5.5, mode flux)

- Date : 2026-11-19T08:59:37.693Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Résultat : réussi (critères bloquants : 15 sur 15 ; termes interdits : 0 sur 15 ; repères [P bruts : 0 sur 15)
- Texte provisoire : termes interdits 0 sur 15 ; delta avec repère ou marqueur 0 sur 15 ; refus avec delta 0 sur 15
- Premier delta (côté fonction, sans Vercel) : médiane 1339 ms sur 9 réponses
- Compteur du jour du Compte : 0 avant, 15 après (15 questions, +15 attendu) : cohérent

## Critères bloquants (3 essais sur 3)

| Cas | Essai | HTTP | Issue | Sources | Source attendue | Fait attendu | Terme interdit | Repère [P | Renvois valides | « 1. » initial | Delta | Premier delta | Terme interdit (delta) | Repère ou marqueur (delta) | Refus avec delta | Durée | Conforme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| q1 | 1 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 23 | 2857 ms | non | non | non | 3074 ms | oui |
| q1 | 2 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 22 | 1781 ms | non | non | non | 2031 ms | oui |
| q1 | 3 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 22 | 1687 ms | non | non | non | 1882 ms | oui |
| p1 | 1 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 25 | 1228 ms | non | non | non | 1468 ms | oui |
| p1 | 2 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 24 | 1299 ms | non | non | non | 1523 ms | oui |
| p1 | 3 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 24 | 1197 ms | non | non | non | 1409 ms | oui |
| h1 | 1 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 2157 ms | oui |
| h1 | 2 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1756 ms | oui |
| h1 | 3 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1841 ms | oui |
| o1 | 1 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1284 ms | oui |
| o1 | 2 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1358 ms | oui |
| o1 | 3 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1897 ms | oui |
| c1 | 1 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 51 | 1339 ms | non | non | non | 1692 ms | oui |
| c1 | 2 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 51 | 1601 ms | non | non | non | 1971 ms | oui |
| c1 | 3 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 41 | 1219 ms | non | non | non | 1611 ms | oui |

### Textes des réponses

- q1 #1 : Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client[S1].
- q1 #2 : Une facture est émise dans un délai de 5 jours ouvrés après la livraison validée par le client[S1].
- q1 #3 : Une facture est émise dans un délai de 5 jours ouvrés après la livraison validée par le client[S1].
- p1 #1 : Le guide indique qu’une relance reste un message de service, à adresser avec courtoisie, sans reproche.[S1]
- p1 #2 : Le guide indique qu’il faut rester courtois : une relance reste un message de service, sans reproche.[S1]
- p1 #3 : Le guide indique qu’il faut rester courtois : une relance reste un message de service, sans reproche.[S1]
- h1 #1 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #2 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #3 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- o1 #1 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #2 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #3 : Je réponds uniquement à partir des Documents de NexaWorks.
- c1 #1 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture[S1]. Les Documents ne concordent pas : 15 jours après l’échéance[S1], 21 jours après l’échéance[S2].
- c1 #2 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture[S1]. Les Documents ne concordent pas : 15 jours après l’échéance[S1], 21 jours après l’échéance[S2].
- c1 #3 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture[S1]. Les Documents ne concordent pas : 15 jours[S1], 21 jours[S2].
