---
title: 'Tâche préalable à 4.1a : Document long au mini Jeu'
type: 'chore'
created: '2026-11-10'
status: 'done'
baseline_commit: 'f59518edfd3155339512791fb7a427a45e8170ac'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les 8 Documents du mini Jeu ne produisent qu'un Passage chacun : le calibrage (4.2), le panneau Source (5.7) et la navigation entre Passages (5.12) n'ont aucun Document à plusieurs Passages réels.

**Approach:** Ajouter une 9ᵉ Note fictive NexaWorks, d'environ 4 000 caractères, qui donne 4 à 5 Passages réels, avec un fait précis en fin de texte, une Requête et une question associées, sans changer le script de préchargement.

**Contraintes :**
- Note `procedure`, Auteur B (Karim Benali), titre « Procédure de gestion des incidents » : traitement des incidents signalés par les clients sur les sites livrés par NexaWorks (niveaux de priorité, délais de prise en charge, communication client, rétablissement, clôture).
- Aucune contradiction involontaire avec les 8 Documents (facturation, congés, relances, notes de frais, Atelier Lumen) ; aucun des termes hors base (`marketing`, `télétravail`, `mutuelle`, `chocolat`, `véhicule`, `incendie`) ; ni « 99 jours » ni « PERROQUET ».
- **Fait final**, dans le dernier paragraphe, donc dans le dernier Passage : la revue post-incident d'un incident de priorité 1 est présentée au comité qualité le premier jeudi du mois suivant.
- `demo/questions-mini.json` : Requête `r6` (« revue après un incident critique », Document attendu `procedure-incidents`, terme « revue post-incident ») et question `q6` (« Quand la revue post-incident d'un incident de priorité 1 est-elle présentée ? », réponse « premier jeudi du mois suivant »).
- `tests/unit/demo-set.test.ts` : 9 Notes, 6 questions, 6 Requêtes ; nouveau test : le Document donne 4 à 5 Passages par `chunkText`, et le fait final est dans le dernier Passage.
- `tests/integration/seed-demo.test.ts` et `docs/environnements.md` : 8 → 9.
- Préchargement inchangé : clé naturelle (Auteur, identifiant de demande tiré de la clé) ; les 8 Documents existants restent « déjà prêt », seul le nouveau est créé et traité.

**Décision de l'utilisateur (2026-11-10) :**
- Un second fait précis dans un Passage du début ou du milieu : le délai de prise en charge d'un incident de priorité 1.
- Question `q7` dont la réponse correcte exige ce fait et le fait final, donc deux Passages différents du même Document. Le test vérifie que les deux faits sont dans deux Passages distincts.

**Never:** modifier les 8 Documents existants ou `scripts/seed-demo.ts` ; lancer le préchargement distant (l'utilisateur le fait après validation) ; commencer 4.1a ; commit ou push sans validation.

</frozen-after-approval>

## Implementation Notes

- **Note** `demo/documents/procedure-incidents.md` : 3 914 caractères, 5 Passages par `chunkText` (1 011, 617, 747, 1 020 et 511 caractères environ). Délai de 30 minutes (priorité 1) dans le 3ᵉ Passage ; revue post-incident présentée « le premier jeudi du mois suivant » dans le 5ᵉ et dernier.
- **Chiffres propres au Document** : les premières versions reprenaient « 10 jours ouvrés » et « 5 jours ouvrés », réponses attendues de q3 et q1 dans d'autres Documents. Remplacés par 8 et 3 jours ouvrés pour ne pas brouiller les mesures de 4.2 ; aucun nouveau chiffre ne figure dans les 8 autres Documents. Aucun terme hors base, ni « 99 jours » ni « PERROQUET ».
- **`questions-mini.json`** : `q6` dans `questions` ; `q7` dans une nouvelle section `multiPassage` (`expectedFacts` : « 30 minutes », « premier jeudi du mois suivant ») ; `r6` dans `searchQueries`.
- **Tests** : `demo-set.test.ts` (9 Notes, 6 questions, 6 Requêtes, identifiants uniques avec q7 ; nouveau : longueur 3 500 à 4 500, 4 à 5 Passages, fait final dans le dernier ; nouveau : chaque fait de q7 dans un seul Passage, deux Passages distincts, le premier hors du dernier Passage) ; `tests/integration/seed-demo.test.ts` (9 Notes, relance : 9 « déjà prêt », aucun appel à `process-document`).
- **`docs/environnements.md`** : 9 Notes, résultat attendu `9 Documents prêts, 13 Passages`, titre ajouté aux deux listes SQL du nettoyage initial (sinon cette requête supprimerait la nouvelle Note).
- **Découpage** : deux intertitres terminent un Passage au lieu d'ouvrir le suivant. Comportement de `chunkText`, non modifié ici : noté dans `deferred-work.md`.
- **`scripts/seed-demo.ts` inchangé** : la clé naturelle (Auteur, identifiant de demande tiré de la clé) laisse les 8 Documents existants « déjà prêt » ; seul le nouveau est créé et traité.

## Review Triage Log

Vérification ciblée du contenu et des tests (2026-11-10), sans les trois relecteurs, à la demande de l'utilisateur.

| # | Constat | Verdict | Preuve | Suite |
|---|---|---|---|---|
| V1 | « 10 jours ouvrés » et « 5 jours ouvrés » repris de q3 et q1 dans un autre sens | low | risque de confusion au calibrage, pas une contradiction | corrigé (8 et 3 jours ouvrés) |
| V2 | Intertitres en fin de Passage | low | comportement de `chunkText`, commun à tout Document à intertitres | différé (`deferred-work.md`) |
| V3 | Termes hors base, piège, contradiction de relance | false | tests `demo-set` existants verts sur 9 Documents | aucune |
| V4 | Liste SQL du nettoyage initial dans `docs/environnements.md` | medium | sans le nouveau titre, cette requête supprimerait la Note | corrigé |
