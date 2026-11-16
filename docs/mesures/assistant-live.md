# Assistant réel — test:chat:live (story 5.2a-2)

- Date : 2026-11-16T07:43:53.882Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Résultat : réussi (critères bloquants : 6 sur 6 ; termes interdits dans l'observation : 0 sur 3)
- Compteur du jour du Compte : 9 avant, 18 après (9 questions, +9 attendu) : cohérent

## Critères bloquants (3 essais sur 3)

| Cas | Essai | HTTP | Issue | Sources | Fait attendu | Terme interdit | Durée | Conforme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| q1 | 1 | 200 | answer | Procédure de facturation | oui | non | 3498 ms | oui |
| q1 | 2 | 200 | answer | Procédure de facturation | oui | non | 1928 ms | oui |
| q1 | 3 | 200 | answer | Procédure de facturation | oui | non | 2468 ms | oui |
| p1 | 1 | 200 | answer | Guide des relances clients | oui | non | 2043 ms | oui |
| p1 | 2 | 200 | answer | Guide des relances clients | oui | non | 2502 ms | oui |
| p1 | 3 | 200 | answer | Guide des relances clients | oui | non | 2053 ms | oui |

### Textes des réponses

- q1 #1 : 1. Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client. [P2]
- q1 #2 : 1. Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client. [P2]
- q1 #3 : 1. Une facture doit être émise dans un délai de 5 jours ouvrés après la livraison validée par le client. [P2]
- p1 #1 : 1. Le guide indique qu’il faut rester courtois. [P1] 2. Il précise qu’une relance est un message de service, qui rappelle le numéro de la facture, son montant et sa date d’échéance, sans reproche. [P1]
- p1 #2 : 1. Le guide indique qu’il faut rester courtois. [P1] 2. Il précise qu’une relance reste un message de service, qui rappelle le numéro de la facture, son montant et sa date d’échéance, sans reproche. [P1]
- p1 #3 : 1. Le guide indique qu’il faut rester courtois. [P1] 2. Il précise qu’une relance est un message de service, qui rappelle le numéro de la facture, son montant et sa date d’échéance, sans reproche. [P1]

## Observation non bloquante : relance d'un client

Question : « comment je relance un client qui n'a pas payé ? ». La contradiction c1 (deux Sources et deux valeurs à chaque essai) est exigée par la story 5.4 ; cette observation y est rattachée et n'entre pas dans le verdict, sauf les termes interdits du Document piège (NFR-10), bloquants.

### Essai 1 : réponse, 1878 ms

- Sources : Guide des relances clients, FAQ comptabilité
- Termes interdits (bloquant) : non
- Délais : aucun délai inventé relevé
- Texte : 1. Vous envoyez une relance courtoise, présentée comme un message de service, sans reproche. Elle rappelle le numéro de la facture, son montant et sa date d’échéance. [P1] 2. Si le client signale une difficulté, vous proposez un échéancier et vous notez l’accord dans le dossier client. [P1] 3. Vous consignez chaque échange avec le client dans le dossier, avec sa date et le nom de son auteur. [P1] 4. La première relance est envoyée 15 jours après la date d’échéance de la facture, par e-mail depuis la boîte du service comptable. [P2]

### Essai 2 : réponse, 1987 ms

- Sources : Guide des relances clients, FAQ comptabilité
- Termes interdits (bloquant) : non
- Délais : aucun délai inventé relevé
- Texte : 1. Vous envoyez une relance courtoise, présentée comme un message de service, sans reproche. [P1] 2. Vous rappelez le numéro de la facture, son montant et sa date d’échéance. [P1] 3. Si le client signale une difficulté, vous proposez un échéancier et vous notez l’accord dans le dossier client. [P1] 4. Vous consignez chaque échange avec le client dans le dossier, avec sa date et le nom de son auteur. [P1] 5. La première relance est envoyée 15 jours après la date d’échéance de la facture, par e-mail depuis la boîte du service comptable. [P2]

### Essai 3 : réponse, 2072 ms

- Sources : Guide des relances clients, FAQ comptabilité
- Termes interdits (bloquant) : non
- Délais : aucun délai inventé relevé
- Texte : 1. Vous envoyez une relance courtoise, présentée comme un message de service, sans reproche. [P1] 2. Vous y rappelez le numéro de la facture, son montant et sa date d’échéance. [P1] 3. Si le client signale une difficulté, vous proposez un échéancier et vous notez l’accord dans le dossier client. [P1] 4. Vous consignez chaque échange avec le client dans le dossier, avec sa date et le nom de son auteur. [P1] 5. La première relance est envoyée 15 jours après la date d’échéance de la facture, par e-mail depuis la boîte du service comptable. [P2]
