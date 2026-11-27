# Checklist du rendu et de la démonstration — NexaMind AI

Rendu le lundi 30/11. Aucun identifiant, mot de passe, e-mail ni URL de production dans ce fichier : l'URL publique de démonstration est dans le [README](../../README.md), les identifiants des Comptes de démo sont transmis hors du dépôt.

## 1. Livrables du rendu du 30/11

La formation ne fixe pas de format précis. Livrables retenus par le porteur du produit :

| Livrable | Où | État |
|---|---|---|
| URL de l'application, accessible sans authentification Vercel | URL publique de démonstration ([README](../../README.md)) | en ligne ; accès public à revérifier 48 h avant et la veille (§ 2) |
| Dépôt GitHub, avec le README (besoin, URL, stack, chaîne RAG, installation, tests, limites) | dépôt GitHub, [README](../../README.md) | prêt |
| Dossier de démarche Vibe Coding, avec la correspondance aux attendus du challenge | [demarche-vibe-coding.md](../demarche-vibe-coding.md) ; preuves dans [journal](../journal-vibe-coding.md), [docs/tests](../tests), [docs/mesures](../mesures), [guide de reprise](../guide-de-reprise.md) | prêt |
| Vidéo de secours, UJ-1 à UJ-3 en moins de 5 minutes, sur l'environnement final | fichier local hors du dépôt : `nexamind-demo-2026-11-27T07-52-54-454Z.webm` (`npm run demo:video`) | **prête** (27/11 ; § 6) |
| Présentation orale avec démonstration en direct | parcours UJ-1 à UJ-3 sur le site, Comptes de démo A et B (identifiants hors du dépôt) | à répéter (story 7.5) ; checklist du jour J (§ 3) et plan B (§ 4) |

**Identifiants transmis** (jamais dans le dépôt) : Compte de démo B, transmis au formateur par canal privé le 27/11, connexion vérifiée par le porteur du produit. Compte de démo A : réservé à la démonstration en direct, non transmis (décision du porteur du produit, 27/11).

## 2. Vérifications 48 h avant (samedi 28/11) et la veille (dimanche 29/11)

30 min chacune. Consigner le résultat dans le tableau du § 5.

1. **Supabase actif** : le projet Free se met en pause après une période sans activité ; le réactiver depuis le tableau de bord si besoin.
2. **URL publique** : dans une fenêtre privée, sans session Vercel ni Supabase, depuis un autre appareil ou un autre réseau : la page de connexion s'affiche directement, en HTTPS, sans authentification Vercel.
3. **Comptes de démo** : A et B se connectent.
4. **OpenAI** : crédit prépayé restant (≥ 3 $, seuil Go de la [décision](../mesures/decision-mise-en-service.md)), modèles autorisés (`gpt-5.4-mini`, `text-embedding-3-small`), tarifs inchangés.
5. **Plafond global** non atteint (lecture seule, [environnements.md](../environnements.md), « Lire les limites et la consommation du jour »).
6. **UJ-2 rejoué** après les vérifications : `npm run test:uj2:live` (porteur du produit, environ 0,02 $).

## 3. Jour J, 30 min avant

- [ ] **Crédit OpenAI** ≥ 3 $ (page Billing).
- [ ] **Quota du Compte de démo** : le compteur repart à 0 à 00:00 UTC. S'il a servi le jour même (répétition), le remettre à zéro, sur décision du porteur du produit, dans l'éditeur SQL de Supabase :
  ```sql
  update public.ai_usage set count = 0
  where day_utc = (now() at time zone 'utc')::date
    and user_id = (select id from auth.users where email = '<e-mail du Compte de démo, lu dans .env.seed>');
  ```
- [ ] **Documents de test à ne pas montrer** : aucun ne doit rester. Vérifier en lecture seule :
  ```sql
  select title, status from public.documents
  where title like '%— test UJ-2%' or title like '%— test SM-5%' or title like '%— test SM-6%' or title = 'Test de charge 1 Mo';
  ```
  Résultat attendu : 0 ligne. Sinon, les supprimer depuis la session de leur Auteur (les scripts le font en cas d'échec ; `npm run load:1mo -- --remote --cleanup` pour le test de charge).
- [ ] **Documents hors du Jeu** : `npm run seed:demo -- --remote` affiche, en lecture seule, les Documents hors manifeste ; répondre « non » pour ne rien écrire.
- [ ] **Document piège** (« Guide des relances clients ») : le montrer seulement pour illustrer l'injection refusée ; ne pas le présenter comme une procédure réelle.
- [ ] **Réchauffage** : une Recherche et une question 5 min avant (le premier appel à froid prend 3,5 s et 5,2 s, D37 et M3).
- [ ] **Onglets ouverts** :
  1. URL de démonstration, page de connexion, fenêtre privée ;
  2. tableau de bord Supabase (projet actif, espace utilisé) ;
  3. page Billing d'OpenAI ;
  4. README sur GitHub ;
  5. [dossier de démarche](../demarche-vibe-coding.md) et [décision de mise en service](../mesures/decision-mise-en-service.md) ;
  6. vidéo de secours, ouverte dans le lecteur, en pause au début.
- [ ] **Matériel du parcours** : la question exacte d'UJ-1, la Requête d'UJ-3, le fichier `demo/uj2/compte-rendu-dorval.md` pour l'ajout d'UJ-2.

## 4. Plan B

| Problème pendant la démonstration | Action |
|---|---|
| Site, Supabase ou OpenAI indisponible (`AI_UNAVAILABLE`, page en erreur) | Passer à la vidéo de secours ; revenir au site s'il répond de nouveau |
| Crédit épuisé (`AI_BUDGET_EXHAUSTED`) | Vidéo de secours ; recharge du crédit après la démonstration |
| Quota du Compte atteint (`QUOTA_EXCEEDED`) | Continuer avec le Compte de démo B |
| Plafond global atteint (`AI_DAILY_CAP_REACHED`) | Relever `ai_global_daily_cap` par SQL ([environnements.md](../environnements.md)) ou vidéo de secours |
| Première réponse lente (démarrage à froid) | Attendre : le garde-fou des 17 s affiche « Réessayer » ; sinon reposer la question |
| Document ajouté qui reste « en cours » ou passe « en erreur » | « Réessayer » ; sinon montrer un Document déjà prêt |

## 5. Résultats des vérifications

| Vérification | Date | Supabase actif | URL publique (fenêtre privée, autre réseau) | Comptes A et B | OpenAI (crédit, modèles, tarifs) | Plafond | UJ-2 rejoué |
|---|---|---|---|---|---|---|---|
| Répétition générale (matin) | 27/11 | oui | vérifiée l'après-midi (ligne suivante) | vérifiés l'après-midi | crédit 9,70 $, modèles confirmés ([décision](../mesures/decision-mise-en-service.md)) | relevé l'après-midi | 3 sur 3 (53,8 s, 30,3 s, 31,9 s), [uj2-live-2.md](../mesures/uj2-live-2.md) ; Documents de test restants : 0 |
| Vérifications de la 7.5 (après-midi) | 27/11 | oui | oui : téléphone en 4G, fenêtre privée, URL ouverte sans authentification Vercel ; Compte B connecté, réponse avec Sources | A : connecté sur PC en fenêtre privée (aucune question posée) ; B : connecté sur téléphone | crédit prépayé 9,62 $ (seuil Go ≥ 3 $) | 86 unités sur 300 dans la journée (UTC), lecture seule | 3 sur 3 (42,4 s, 34,7 s, 33,8 s), [uj2-live-3.md](../mesures/uj2-live-3.md) ; Documents de test restants en base : 0 (lecture seule, après les vérifications) |

Les vérifications de 48 h avant et de la veille (§ 2) ont été faites le 27/11, au plus près de la répétition générale. **Veille de la soutenance : vérifier que Supabase est actif et que le crédit OpenAI est d'au moins 3 $.**

## 6. Vidéo de secours (critère 3 de la story 7.5 : validé)

| Date | Fichier (hors du dépôt) | Durée | Contenu | Unités | Écarts | Nettoyage | Relecture |
|---|---|---|---|---|---|---|---|
| 27/11 | `nexamind-demo-2026-11-27T07-52-54-454Z.webm`, produit par `npm run demo:video` (production, Compte de démo A, 1 280 × 720) | 98 s (< 5 min) | UJ-1 (connexion, Tableau de bord, q1 et sa Source, contradiction c1, refus h1), UJ-2 (Note Dorval, prêt, question, Résumé, suppression), UJ-3 (Recherche, question et suivi, Historique) | 7 (7 prévues) | aucun | Note Dorval supprimée | visionnée en entier par le porteur du produit : conforme et lisible |
