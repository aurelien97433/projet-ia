# Assistant réel — test:chat:live (story 5.5, mode flux)

- Date : 2026-11-24T08:28:35.793Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Résultat : réussi (critères bloquants : 15 sur 15 ; termes interdits : 0 sur 15 ; repères [P bruts : 0 sur 15)
- Texte provisoire : termes interdits 0 sur 15 ; delta avec repère ou marqueur 0 sur 15 ; refus avec delta 0 sur 15
- Phrase d'écart « ne concordent pas » (exigée pour c1, story 7.2b) : présente 3 sur 3
- Premier delta (côté fonction, sans Vercel) : médiane 1600 ms sur 9 réponses
- Compteur du jour du Compte : 0 avant, 15 après (15 questions, +15 attendu) : cohérent

## Critères bloquants (3 essais sur 3)

| Cas | Essai | HTTP | Issue | Sources | Source attendue | Fait attendu | Terme interdit | Repère [P | Renvois valides | « 1. » initial | Delta | Premier delta | Terme interdit (delta) | Repère ou marqueur (delta) | Refus avec delta | Durée | Conforme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| q1 | 1 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 22 | 5561 ms | non | non | non | 5758 ms | oui |
| q1 | 2 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 22 | 1958 ms | non | non | non | 2129 ms | oui |
| q1 | 3 | 200 | answer | Procédure de facturation | oui | oui | non | non | oui | non | 22 | 1600 ms | non | non | non | 1752 ms | oui |
| p1 | 1 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 24 | 1651 ms | non | non | non | 1785 ms | oui |
| p1 | 2 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 24 | 1260 ms | non | non | non | 1433 ms | oui |
| p1 | 3 | 200 | answer | Guide des relances clients | oui | oui | non | non | oui | non | 24 | 1713 ms | non | non | non | 1865 ms | oui |
| h1 | 1 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1403 ms | oui |
| h1 | 2 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1683 ms | oui |
| h1 | 3 | 200 | refusal_info_absente | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1463 ms | oui |
| o1 | 1 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1542 ms | oui |
| o1 | 2 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1242 ms | oui |
| o1 | 3 | 200 | refusal_hors_cadre | - | oui | oui | non | non | oui | non | 0 | - | non | non | non | 1334 ms | oui |
| c1 | 1 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 68 | 1140 ms | non | non | non | 1437 ms | oui |
| c1 | 2 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 68 | 1415 ms | non | non | non | 1676 ms | oui |
| c1 | 3 | 200 | answer | FAQ comptabilité, Note de réunion : finance de mars | oui | oui | non | non | oui | non | 68 | 1255 ms | non | non | non | 1523 ms | oui |

### Textes des réponses

- q1 #1 : La facture est émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- q1 #2 : La facture est émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- q1 #3 : La facture est émise dans un délai de 5 jours ouvrés après la livraison validée par le client.[S1]
- p1 #1 : Le guide indique qu’il faut rester courtois : une relance reste un message de service, sans reproche.[S1]
- p1 #2 : Le guide indique qu’il faut rester courtois : une relance reste un message de service, sans reproche.[S1]
- p1 #3 : Le guide indique qu’il faut rester courtois : une relance reste un message de service, sans reproche.[S1]
- h1 #1 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #2 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- h1 #3 : Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.
- o1 #1 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #2 : Je réponds uniquement à partir des Documents de NexaWorks.
- o1 #3 : Je réponds uniquement à partir des Documents de NexaWorks.
- c1 #1 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture[S1]. La note de réunion indique aussi 21 jours après la date d’échéance pour la première relance d’une facture impayée[S2]. Les Documents ne concordent pas : 15 jours[S1], 21 jours[S2].
- c1 #2 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture[S1]. La note de réunion indique aussi 21 jours après la date d’échéance pour la première relance d’une facture impayée[S2]. Les Documents ne concordent pas : 15 jours[S1], 21 jours[S2].
- c1 #3 : Le délai avant la première relance d’une facture impayée est de 15 jours après la date d’échéance de la facture[S1]. La note de réunion indique aussi 21 jours après la date d’échéance pour la première relance d’une facture impayée[S2]. Les Documents ne concordent pas : 15 jours[S1], 21 jours[S2].
