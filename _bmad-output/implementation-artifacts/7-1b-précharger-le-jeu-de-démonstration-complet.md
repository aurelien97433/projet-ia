---
title: 'Story 7.1b : Précharger le Jeu de démonstration complet'
type: 'chore'
created: '2026-11-23'
status: 'in-review'
route: 'direct'
review_loop_iteration: 0
baseline_commit: '0448a6792503473fa36483ce751c5ed9f8686a68'
context:
  - '{project-root}/demo/jeu-demonstration.json'
  - '{project-root}/scripts/seed-demo.ts'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `seed:demo` ne précharge que le mini Jeu (`--mini` obligatoire). Le Jeu complet de la 7.1a (15 Documents) doit être *prêt* en production pour la démonstration et les mesures de la 7.2, sans doublon et sans risque pour les données existantes.

**Approach (plan validé par l'utilisateur le 2026-11-23) :** extension de `scripts/seed-demo.ts` seulement (aucun code de l'application) : sans `--mini`, le script lit `demo/jeu-demonstration.json`. Commande de l'utilisateur : `npm run seed:demo -- --remote`. Même clé naturelle des Documents qu'aujourd'hui (Auteur + identifiant de demande dérivé de la clé) : les 8 Documents inchangés sont reconnus « déjà prêts », la « Procédure congés et absences » est mise à jour sur la même ligne (version du texte + 1, retraitée), les 6 nouveaux sont créés.

## Boundaries & Constraints

**Always:**
- **Plan avant toute écriture :** le script calcule en lecture seule, puis affiche, la cible (hôte, ici `lkjjtcfegplipalraqml.supabase.co`), les Comptes (existants réalignés / à créer), chaque Document du Jeu avec l'action prévue (à créer, texte mis à jour, titre ou Catégorie mis à jour, à reprendre, en cours, inchangé) et la liste des Documents **hors manifeste** (titre, Auteur affiché, Statut ; jamais d'e-mail). Une même fonction pure décide de l'action, pour le plan et pour l'écriture.
- **Confirmation :** sur une cible distante, aucune écriture sans la saisie de « oui » au terminal ; `--yes` la remplace (jamais utilisé par l'agent). Sans terminal interactif et sans `--yes` : arrêt, rien d'écrit.
- **Aucune suppression :** les Documents hors manifeste sont seulement affichés ; le script ne supprime jamais rien.
- **Résumés :** le script n'en génère aucun et n'appelle jamais OpenAI. Le Résumé de la « Procédure congés et absences » devient obsolète (non affiché) ; il est regénéré par l'utilisateur sur le site après coup.
- **Mini Jeu inchangé :** `--mini` garde son comportement (tests d'intégration, Assistant, suivi).
- **Rapport final** : comme aujourd'hui (Documents prêts, Passages, vrais vecteurs en distant).

**Ask First:** toute suppression ; tout changement de la clé naturelle des Documents.

**Never:** écriture avant confirmation ; suppression automatique ; e-mail, mot de passe ou clé affichés ; lancement distant par l'agent.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Production actuelle | 9 Documents du mini Jeu prêts | plan : 6 à créer, 1 texte mis à jour, 8 inchangés ; après « oui » : 15 prêts |
| Relance | Jeu complet déjà prêt | plan : 15 inchangés ; aucun retraitement |
| Refus | réponse autre que « oui » | arrêt, rien d'écrit |
| Sans terminal ni `--yes` | entrée non interactive | arrêt, rien d'écrit |
| Document hors manifeste | Note personnelle, reste de test | listé, jamais supprimé |
| Document en erreur | Statut *en erreur* | plan : à reprendre ; repris sur la même ligne |

</frozen-after-approval>

## Code Map

- `scripts/seed-demo.ts` -- `loadFullSet`, action décidée par une fonction pure (`planAction`), plan en lecture seule (`planSeed`), affichage, confirmation, `--yes`, `--mini` facultatif.
- `tests/unit/seed-demo*.test.ts` -- action, arguments, chargement du Jeu complet, affichage du plan sans secret.
- `tests/integration/seed-demo.test.ts` -- plan puis écriture sur la pile locale (Jeu complet), relance sans doublon.
- `docs/environnements.md` -- commande, plan, confirmation, contrôles après coup.

## Tasks & Acceptance

**Execution:**
- [x] Extension du script et tests.
- [x] `docs/environnements.md`.
- [x] Revue ciblée (Claude) : aucune écriture avant confirmation, aucune suppression, rien de secret affiché.

**Acceptance Criteria:**
- Given la production actuelle, when l'utilisateur lance `npm run seed:demo -- --remote`, then le plan affiche la cible, 6 Documents à créer, 1 texte mis à jour, 8 inchangés et les Documents hors manifeste, et rien n'est écrit avant « oui ».
- Given « oui », when le script se termine, then les 15 Documents sont *prêts* avec de vrais vecteurs, sans doublon.
- Given le script relancé, when le plan s'affiche, then les 15 Documents sont « inchangés ».

## Verification

**Commands:** tests unitaires et d'intégration du script, `npm run lint`, `npx tsc --noEmit`, `npm run check:secrets`.

**Après le lancement par l'utilisateur :** contrôle distant en lecture seule par Claude (15 Documents prêts, sans doublon, Passages, version de la Procédure congés et « 5 jours », Documents hors manifeste, fichiers orphelins, taille de la base) ; `npm run test:search:live` et `npm run test:chat:live` par l'utilisateur (changement de comportement de h1, o1 ou c1 avec les 6 nouveaux Documents) ; Résumé de la Procédure congés regénéré sur le site.

## Implementation Notes

**2026-11-23 (Claude, implémentation directe ; aucun code de l'application) :** `scripts/seed-demo.ts` : `loadFullSet` (même normalisation, mêmes clés que le mini Jeu) ; `planAction`, fonction pure partagée par le plan et l'écriture (`prepareDocument` lit l'état par `readExisting`, puis applique l'action décidée) ; `planSeed` (lecture seule : Comptes par e-mail, état de chaque Document, Documents hors manifeste avec le nom affiché de l'Auteur) ; `formatPlan` (cible, Comptes, résumé par action, liste par Document, hors manifeste « affichés seulement, jamais supprimés », jamais d'e-mail) ; `confirmRemote` (« oui » au terminal, `--yes`, refus sans terminal interactif) ; `--mini` devenu facultatif. Le plan est affiché avant **toute** écriture, y compris le réalignement des Comptes (qui précède les Documents). `docs/environnements.md` : section « Préchargement du Jeu complet ».

## Review Triage Log

Revue ciblée par Claude (aucun code de l'application modifié).

| Point | Verdict | Preuve |
| --- | --- | --- |
| Aucune écriture avant confirmation | conforme | `seedMini` : `planSeed` (lectures seules) → `formatPlan` → `confirm` → seulement ensuite `ensureAccount` et les Documents ; test d'intégration « refus : rien n'est écrit » (nombre de Documents inchangé). |
| Aucune suppression | conforme | aucun `delete` dans le script ; les Documents hors manifeste ne sont qu'affichés. |
| Rien de secret affiché | conforme | plan sans e-mail (test unitaire sans « @ », test d'intégration sans l'e-mail du Compte A) ; aucune clé ni mot de passe. |
| Même décision pour plan et écriture | conforme | `planAction` unique, 9 cas en test unitaire ; relance du Jeu complet : 15 « déjà prêt », aucun retraitement (intégration). |
| Mini Jeu inchangé | conforme | tests `--mini` existants verts ; `loadFullSet` contient les 9 Documents du mini Jeu à l'identique (test unitaire). |
| Lecture de tous les Documents par `planSeed` | accepté (low) | limite de 1 000 lignes de PostgREST ; la production en compte une vingtaine. |

**Vérification (2026-11-23) :** `npm test` 104 fichiers, 2 162 tests verts ; `npm run lint`, `npx tsc --noEmit`, `npm run check:secrets` verts.
