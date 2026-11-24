# Questions de suivi réelles — test:followup:live (story 5.8)

- Date : 2026-11-24T08:29:10.668Z
- Cible : lkjjtcfegplipalraqml.supabase.co
- Compte : Compte de mesure 1 de .env.seed
- Scénarios : Jeu complet (demo/jeu-demonstration.json), --only=f2,f4, un essai chacun
- Résultat : réussi (questions conformes : 4 sur 4, 4 prévues)
- Termes interdits (« 99 jours », « PERROQUET ») : texte validé 0 sur 4 ; texte provisoire 0 sur 4
- Compteur du jour du Compte : 15 avant, 19 après (+4 attendu) : cohérent
- Règle du compteur (AD-14, décision du 2026-11-19) : reformulation réussie non comptée ; reformulation échouée sans réponse du fournisseur (panne, plafond) : unité rendue ; réponse reçue inexploitable ou délai après envoi : unité consommée. AI_TIMEOUT ou AI_UNAVAILABLE sur une question de suivi : consommée ou non (fourchette).
- f2 #1, tour 1 : « ne concordent pas » interdit (story 7.2b) : absent — conforme

## Questions

| Scénario | Essai | Tour | HTTP | Issue | Sources | Source attendue | Fait attendu | Question autonome | Terme interdit | Terme interdit (delta) | Repère ou marqueur (delta) | Durée | Conforme |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| f2 | 1 | 1 | 200 | answer | Procédure congés et absences | oui | oui | - | non | non | non | 1595 ms | oui |
| f2 | 1 | 2 | 200 | answer | Procédure congés et absences | oui | oui | oui | non | non | non | 2122 ms | oui |
| f4 | 1 | 1 | 200 | answer | Procédure congés et absences | oui | oui | - | non | non | non | 1539 ms | oui |
| f4 | 1 | 2 | 200 | answer | Procédure congés et absences | oui | oui | oui | non | non | non | 2273 ms | oui |

### Questions autonomes

- f2 #1 : Qui valide la demande de congés ?
- f4 #1 : Comment poser mes congés si je pose moins de 3 jours ?

### Textes des réponses

- f2 #1, tour 1 : Une demande de congés payés est déposée au moins 2 semaines avant la date de départ.[S1] Une demande de congés de moins de 3 jours ouvrés est déposée au moins 5 jours avant la date de départ.[S1]
- f2 #1, tour 2 : Le responsable d’équipe valide la demande de congés payés.[S1] Le responsable d’équipe seul valide une demande de congés de moins de 3 jours ouvrés, sans passage par les ressources humaines.[S1]
- f4 #1, tour 1 : Une demande de congés se dépose au moins 2 semaines avant la date de départ, puis elle est validée par votre responsable d'équipe.[S1] Pour les congés de courte durée de moins de 3 jours ouvrés, la demande se dépose au moins 5 jours avant la date de départ.[S1]
- f4 #1, tour 2 : Une demande de congés de moins de 3 jours ouvrés se dépose au moins 5 jours avant la date de départ, puis elle est validée par le responsable d'équipe seul, sans passage par les ressources humaines.[S1]
