---
title: 'Story 6.2 : Parcours UJ-2 de bout en bout'
type: 'test'
created: '2026-11-23'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/6-1-générer-et-conserver-le-résumé.md'
  - '{project-root}/demo/jeu-demonstration.json'
  - '{project-root}/docs/environnements.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le parcours de démonstration UJ-2 (ajout d'un compte rendu → *prêt* → question → Source → Résumé, plus le cas du `.txt` vide) n'est vérifié que par morceaux, story par story, et jamais d'un seul tenant sur l'environnement que verra le jury. Rien ne prouve qu'il passe au clavier seul, ni qu'il passe trois fois de suite (SM-3).

**Approach:** un seul fichier Playwright `tests/e2e/uj-2.spec.ts`, au clavier seul, exécuté en deux modes : **local** (suite e2e habituelle, pile locale, génération simulée) et **production** (nouvelle configuration `playwright.live.config.ts`, URL de production Vercel, vraie IA, Compte de mesure 1). Il utilise la Note `demo/uj2/compte-rendu-dorval.md` et les questions u1 et u2 du Jeu (`journeys.UJ-2`). Aucun code de production n'est modifié, sauf défaut révélé par le test (alors : Ask First).

## Boundaries & Constraints

**Always:**
- **Environnement réel : la production.** La prévisualisation est exclue : `PROCESS_DOCUMENT_SECRET` n'y est pas posé (Production seulement, relevé du 2026-11-13), donc aucune Note n'y serait traitée. URL de production lue dans `.env.seed` (`UJ2_LIVE_URL`, à ajouter par l'utilisateur), jamais écrite dans le dépôt.
- **Compte :** production : Compte de mesure 1 de `.env.seed` (Q2), sa session seulement ; ni `service_role`, ni clé OpenAI côté test. Local : un Compte temporaire de la fixture `account`, comme les autres e2e.
- **Aucun secret enregistré :** en mode production, `trace`, `video` et `screenshot` désactivés (la saisie du mot de passe serait capturée) ; identifiants jamais journalisés ni écrits dans le rapport.
- **Titre marqué :** « Compte rendu client : Pharmacies Dorval — test UJ-2 {horodatage} », pour ne jamais toucher un Document du Jeu ni la Note collée pendant la vraie démonstration.
- **Étapes et vérifications** (clavier seul : Tab, Entrée, Espace, Échap ; aucun `click`) :
  1. **Connexion** : formulaire `/connexion` (production) ; Tableau de bord affiché.
  2. **Ajout** : « Ajouter » → Note → titre, Catégorie « Compte rendu client », texte de la Note collé → envoi. Vérifié : page du Document avec le titre saisi, Catégorie, Auteur = le Compte connecté.
  3. **Traitement** : badge et bandeau *en cours de traitement* (s'il est observé : le traitement réel peut durer moins de 2 s), puis *prêt* en 60 s au plus ; aucun message d'erreur.
  4. **Question** : nouvelle Conversation, question posée. Production : u1 « Combien de temps une commande réservée attend-elle le patient au comptoir ? » (formulée sans les mots de la Note) ; réponse contenant « 72 heures », Sources contenant le titre du Document créé, ni « 99 jours » ni « PERROQUET ». Local : question qui partage des mots avec la Note (vectorisation simulée par mots communs) ; seule la Source est vérifiée (réponse simulée).
  5. **Source** : ouverture de la Source du Document créé au clavier → panneau Source avec le titre et le Passage contenant « 72 heures » ; Échap referme et rend le focus ; « Ouvrir la page complète » → page du Document, Passage mis en avant.
  6. **Résumé** : « Générer le Résumé » → « Génération du Résumé… » → bloc Résumé de 1 à 5 points avec la mention de génération, annonce « Résumé généré. ». Production : aucun point ne contient « 99 jours » ni « PERROQUET ».
  7. **Compteur** (production) : compteur du jour du Compte +2 exactement par exécution (une question, un Résumé), lu avec sa session (`ai_usage`).
  8. **Suppression** : « Supprimer » → confirmation → Document absent de la Bibliothèque ; son URL affiche E9.
  9. **Cas limite** : import de `demo/fichiers-test/vide.txt` → Document *en erreur* avec le message « aucun texte exploitable » (texte du catalogue) → « Supprimer » → Document absent.
- **Nettoyage garanti :** `afterAll` (et en cas d'échec) supprime, avec la session du Compte (politique Auteur de la 3.4), tout Document du Compte dont le titre contient « — test UJ-2 » ainsi que ses fichiers ; puis vérifie qu'il n'en reste aucun. Les Conversations créées restent dans l'Historique du Compte (aucune suppression de Conversation n'existe, décision de la 5.1) ; leur Source s'affiche « Document supprimé ».
- **SM-3 :** `npm run test:uj2:live` exécute le test 3 fois de suite (`--repeat-each=3 --workers=1`, ordinateur 1 280 px) ; rapport `docs/mesures/uj2-live.md` (date, cible sans secret, résultat de chaque exécution, durée de chaque étape, compteur avant et après), jamais écrasé (`-2`, `-3`…).
- **Coût :** par exécution, une génération de réponse et un Résumé sur une Note de moins de 1 Ko (≈ 0,007 $) ; 3 exécutions ≈ 0,02 $, 6 unités de quota.

**Ask First:** toute modification du code de production (un défaut trouvé par le test est présenté avant correction) ; exécution sur un autre Compte ; plus de 3 exécutions réelles.

**Never:** test sur la prévisualisation ; `service_role`, mot de passe ou jeton dans le dépôt, le rapport ou les journaux ; Document de test laissé en production ; suppression d'un Document dont le titre ne contient pas « — test UJ-2 » ; `npm run test:uj2:live` lancé par l'agent.

## Décisions de l'utilisateur (2026-11-23)

Spec validée. **Q2 = A** (Compte de mesure 1), **Q3 = A** (mode local dans `npm run test:e2e`). **Q1** : réponse reçue sous la forme du modèle (« publique / protégée par Vercel » non tranché) ; la configuration live gère donc les deux cas : `VERCEL_AUTOMATION_BYPASS_SECRET` **facultatif** dans `.env.seed`, envoyé (en-tête `x-vercel-protection-bypass`) seulement s'il est présent, jamais journalisé ; sans lui, une page d'authentification Vercel fait échouer le test dès la connexion avec un message explicite (« production protégée par Vercel : poser VERCEL_AUTOMATION_BYPASS_SECRET »). Rappels : aucune trace, vidéo ni capture en mode production ; mot de passe dans aucun rapport ni journal ; un défaut qui oblige à modifier l'application est présenté à l'utilisateur avant toute correction.

## Questions à trancher avant le code (tranchées, voir ci-dessus)

- **Q1 — Protection Vercel de la production.** Le test doit atteindre l'URL de production sans l'authentification Vercel. **A (recommandé)** : l'utilisateur vérifie d'abord dans une fenêtre privée ; si la production est publique, rien à faire ; si elle est protégée, il crée un secret « Protection Bypass for Automation » (Vercel › Settings › Deployment Protection), posé dans `.env.seed` (`VERCEL_AUTOMATION_BYPASS_SECRET`), envoyé par la seule configuration live (en-tête `x-vercel-protection-bypass`). B : attendre l'ouverture publique de la 7.5.
- **Q2 — Compte de production.** **A (recommandé)** : Compte de mesure 1 (déjà utilisé par les tests réels ; quota du jour : 19 sur 60 après la 6.1). B : un Compte de mesure dédié, pour garder un Historique propre (à créer).
- **Q3 — Mode local.** **A (recommandé)** : le même fichier tourne dans `npm run test:e2e` sur les deux largeurs (critère « local puis Vercel »), avec la question adaptée à la vectorisation simulée. B : production seulement.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Parcours nominal (production) | Note Dorval, Compte de mesure 1 | prêt, « 72 heures » sourcé par le Document créé, Source, page complète, Résumé, suppression ; compteur +2 | — |
| Parcours nominal (local) | Note Dorval, Compte temporaire | prêt, Source = Document créé, Résumé simulé, suppression | — |
| Traitement très rapide | *prêt* avant toute observation | *en cours* non exigé ; *prêt* exigé | — |
| `.txt` vide | `vide.txt` | *en erreur*, message « aucun texte exploitable », supprimé | `PROCESSING_NO_TEXT` |
| Échec en cours de test | une étape échoue | nettoyage exécuté, aucun Document « — test UJ-2 » restant | — |
| 3 exécutions | `test:uj2:live` | 3 sur 3, consignées (SM-3) | — |

</frozen-after-approval>

## Code Map

- `tests/e2e/uj-2.spec.ts` (nouveau) -- parcours au clavier, deux modes (local / production), nettoyage.
- `playwright.live.config.ts` (nouveau) -- `baseURL` = `UJ2_LIVE_URL`, aucun `webServer`, pas de `globalSetup` local, trace/vidéo/captures désactivées, projet ordinateur seul, en-tête de contournement Vercel si Q1 l'exige.
- `tests/e2e/support/` -- connexion au clavier, lecture de `.env.seed` (réutiliser le chargement de `scripts/test-search-live.ts` › `openLiveSession`), écriture du rapport.
- `package.json` -- `test:uj2:live` ; `docs/environnements.md` -- commande, variables de `.env.seed`, coût ; `docs/mesures/uj2-live.md` (écrit par l'exécution de l'utilisateur).

## Tasks & Acceptance

**Execution:**
- [ ] Fonctions de parcours au clavier et nettoyage, partagées par les deux modes.
- [ ] Mode local dans la suite e2e (Q3) : vert sur les deux largeurs, trois fois de suite (`--repeat-each=3`).
- [ ] Configuration live, script `test:uj2:live`, rapport ; `docs/environnements.md`.
- [ ] Revue ciblée (par Claude, aucun code de production touché) : clavier seul, aucun secret capturé, nettoyage borné au titre marqué, compteur.

**Acceptance Criteria:**
- Given la pile locale, when `npm run test:e2e` s'exécute, then `uj-2.spec.ts` passe sur les deux largeurs, au clavier seul, sans laisser de Document.
- Given la production et le Compte de mesure 1, when l'utilisateur lance `npm run test:uj2:live`, then les 3 exécutions passent, chacune avec « 72 heures » sourcé par le Document créé, un Résumé sans terme interdit et le compteur +2, et le rapport est écrit.
- Given un échec à n'importe quelle étape, when le test se termine, then aucun Document « — test UJ-2 » ne reste sur le Compte.
- Given le `.txt` vide, when il est importé, then le Document passe *en erreur* avec le message attendu et il est supprimé.

## Design Notes

Le risque principal n'est pas le code mais l'environnement : protection Vercel (Q1), données de test laissées en production, mot de passe capturé dans une trace. Le titre marqué et le nettoyage par la session du Compte (jamais `service_role`) bornent ce qui peut être supprimé. **Estimation : 3 à 4 h.** Relecteur séparé : seulement si un défaut oblige à toucher le code de production ; sinon revue ciblée par Claude.

## Verification

**Commands:**
- `npx playwright test tests/e2e/uj-2.spec.ts --repeat-each=3` (local) -- expected : 6 sur 6 (2 largeurs × 3).
- `npm run test:e2e` à 8 workers, `npm run lint`, `npx tsc --noEmit`, `npm run check:secrets` -- expected : vert (échec connu : `search-page`, 7.3).
- Utilisateur, après push et Vercel prêt : `npm run test:uj2:live` -- expected : 3 sur 3, rapport `docs/mesures/uj2-live.md`.

**Manual checks:**
- Après le passage réel : Bibliothèque de production sans Document « — test UJ-2 ».
