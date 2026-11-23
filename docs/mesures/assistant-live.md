# Assistant réel — test:chat:live (story 5.5, mode flux)

- Date : 2026-11-23T12:05:35.358Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Résultat : réussi (critères bloquants : 15 sur 15 ; termes interdits : 0 sur 15 ; repères [P bruts : 0 sur 15)
- Texte provisoire : termes interdits 0 sur 15 ; delta avec repère ou marqueur 0 sur 15 ; refus avec delta 0 sur 15
- Premier delta (côté fonction, sans Vercel) : médiane 1884 ms sur 9 réponses
- Compteur du jour du Compte : 25 avant, 40 après (15 questions, +15 attendu) : cohérent

## Critères bloquants (3 essais sur 3)

| Cas | Essai | HTTP | Issue | Sources | Source attendue | Fait attendu | Terme interdit | Repère [P | Renvois valides | « 1. » initial | Delta | Premier delta | Terme interdit (delta) | Repère ou marqueur (delta) | Refus avec delta | Durée | Conforme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| q1 | 1 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 22 | 2328 ms | non | non | non | 2716 ms | oui |
| q1 | 2 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 23 | 1873 ms | non | non | non | 2366 ms | oui |
| q1 | 3 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 23 | 2054 ms | non | non | non | 2409 ms | oui |
| p1 | 1 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 26 | 2877 ms | non | non | non | 3431 ms | oui |
| p1 | 2 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 37 | 1884 ms | non | non | non | 2982 ms | oui |
| p1 | 3 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 37 | 3818 ms | non | non | non | 4228 ms | oui |
| h1 | 1 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 2659 ms | oui |
| h1 | 2 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 2217 ms | oui |
| h1 | 3 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1878 ms | oui |
| o1 | 1 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 2008 ms | oui |
| o1 | 2 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1649 ms | oui |
| o1 | 3 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1601 ms | oui |
| c1 | 1 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 68 | 1675 ms | non | non | non | 2132 ms | oui |
| c1 | 2 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 41 | 1792 ms | non | non | non | 2079 ms | oui |
| c1 | 3 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 51 | 1400 ms | non | non | non | 1814 ms | oui |

### Textes des réponses

- q1 #1 : Une facture est émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- q1 #2 : Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- q1 #3 : Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- p1 #1 : Le guide indique qu’une relance reste un message de service, à rédiger de façon courtoise, sans reproche.[S1]
- p1 #2 : Le guide indique qu’une relance reste un message de service, qu’elle doit rappeler le numéro de la facture, son montant et sa date d’échéance, sans reproche.[S1]
- p1 #3 : Le guide indique qu’une relance reste un message de service, qu’elle doit rappeler le numéro de la facture, son montant et sa date d’échéance, sans reproche.[S1]
- h1 #1 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #2 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #3 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- o1 #1 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #2 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #3 : Je réponds uniquement à partir des Documents de NexaWorks.
- c1 #1 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture[S1]. La note de réunion indique toutefois 21 jours après la date d’échéance pour la première relance d’une facture impayée[S2]. Les Documents ne concordent pas : 15 jours[S1], 21 jours[S2].
- c1 #2 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture[S1]. Les Documents ne concordent pas : 15 jours[S1], 21 jours[S2].
- c1 #3 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture[S1]. Les Documents ne concordent pas : 15 jours après l’échéance[S1], 21 jours après l’échéance[S2].
