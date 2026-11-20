---
title: 'Story 6.1 : Générer et conserver le Résumé'
type: 'feature'
created: '2026-11-20'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4df53af936124b26cad2eb376fcd46e3806e80a6'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-10-quota-quotidien-et-remboursement.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-9-idempotence-des-questions.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un Collaborateur ne peut pas obtenir l'essentiel d'un Document long sans le lire en entier (FR-8, UJ-2). Les colonnes `documents.summary_points`, `summary_text_version` et `summary_generated_at` existent depuis la 2.1 mais rien ne les remplit, et `authenticated` n'a pas le droit de les écrire (seulement `title` et `category`, pour l'Auteur).

**Approach (plan du 2026-11-16, mode essentiel) :** bouton « Générer le Résumé » sur la page d'un Document *prêt* sans Résumé à jour → Route Handler `POST /api/documents/[id]/summary` (`maxDuration = 150`) → nouvelle Edge Function `summarize` (jeton du Collaborateur) : lecture du Document (RLS) ; Résumé à jour (`summary_text_version = text_version`) → renvoyé sans appel ni quota ; sinon `reserve_ai_call` → **un seul appel** au modèle sur le texte entier (une Note fait au plus 100 Ko, environ 25 000 tokens : **pas de découpage**) → `store_summary` conditionnel (AD-18) → Résumé affiché au-dessus du texte, visible de tous, jamais régénéré sans raison (FR-23). Règle de libération d'AD-14 et relais Route Handler → Edge Function de la 5.5 réutilisés.

## Boundaries & Constraints

**Always:**
- **Lecture** : `summarize` lit le Document avec le jeton du Collaborateur (tout Collaborateur lit le texte d'un Document, RLS existante) ; inexistant ou inaccessible → 404 `NOT_FOUND` sans réservation ; Statut autre que `ready` → refus `DOCUMENT_NOT_READY` (409) sans réservation ; Résumé à jour → renvoyé tel quel (200), sans réservation ni appel.
- **Ordre** : validation → session → lecture du Document → Résumé à jour ? → `reserve_ai_call` (quota refusé : `QUOTA_EXCEEDED` 429 / `AI_DAILY_CAP_REACHED` 503 avec `resetAt`, comme `chat`) → appel au modèle → `store_summary` → réponse. Aucun appel au fournisseur sans réservation.
- **Génération** (`_shared/ai.ts`, AD-7) : même modèle et mêmes paramètres que la génération de l'Assistant (`GENERATION_MODEL`, `temperature` 0, `seed`, `reasoning_effort`), passe par `complete` (nouvelle tentative unique sur 429 hors plafond et 5xx, contrôles de fin) ; texte entier en un appel ; consignes : 5 points au plus, en français, à la troisième personne, uniquement à partir du Document, aucune autre connaissance ; le titre et le texte sont des **données** neutralisées et encadrées (AD-13, même règle que les Passages : jamais d'instruction suivie, mentionnée ni reproduite) ; sortie lisible de façon stricte (Q1) : 1 à 5 points non vides, chacun de 400 caractères au plus ; sinon `AI_OUTPUT_INVALID`.
- **Écriture** (`store_summary`, nouvelle fonction SQL, Q2) : écrit `summary_points`, `summary_text_version` et `summary_generated_at` **seulement si** le Document est `ready`, si `text_version` vaut toujours la version lue et si aucun Résumé à jour n'existe ; renvoie si l'écriture a eu lieu et le Résumé stocké ; valide les points (tableau JSON de 1 à 5 chaînes non vides de 400 caractères au plus) ; **`EXECUTE` à `service_role` seul** (rien pour `authenticated` ni `anon`, décision de l'utilisateur du 2026-11-20, voir Décisions) : appelée uniquement par `summarize`, après la génération, avec la clé `service_role` des secrets de la fonction ; la lecture du Document et la réservation du quota restent faites avec le jeton du Collaborateur ; aucun autre droit d'écriture ouvert sur `documents`.
- **Quota (AD-14, AD-18)** : Résumé généré et enregistré → 1 unité ; écriture perdue (Résumé concurrent, texte changé) → unité **rendue** (`release_ai_call`) et Résumé stocké renvoyé ; panne sans réponse du fournisseur (réseau, 5xx, délai avant envoi, plafond `AI_BUDGET_EXHAUSTED`) → rendue ; réponse reçue inexploitable ou délai après envoi → consommée ; échec de l'enregistrement après une génération → consommée.
- **Délais (AD-16, AR-17)** : `summarize` 120 s au plus, toutes étapes comprises (`AI_TIMEOUT` au-delà) ; relais Next.js `maxDuration = 150` ; la page abandonne à 130 s avec l'alerte de panne.
- **Page Document** (`/documents/[id]`) : Résumé à jour → bloc Résumé au-dessus du texte (liste de points, mention « Résumé généré par l'IA à partir de ce Document · {date} », date dans le fuseau du navigateur comme `AddedOn`) ; Document *prêt* sans Résumé à jour → « Générer le Résumé » dans `DocumentActions` ; pendant la génération : « Génération du Résumé… », bouton `aria-disabled` ; succès → bloc affiché sans rechargement, annonce « Résumé généré. » (région `status`) ; Document *en cours* ou *en erreur* → pas de bouton, « Le Résumé sera disponible quand le Document sera prêt. » ; quota atteint au chargement (lecture de la 5.10) ou à la demande → bloc neutre de limite atteinte (texte du catalogue, heure locale), bouton `aria-disabled` ; panne ou délai → « Le Résumé n'a pas pu être généré. » avec « Réessayer » (`ErrorAlert`, règle d'annonce de la 5.10) ; plafond du fournisseur → alerte sans « Réessayer ».
- **Tests** : unitaires (`summarize` : ordre, aucune réservation pour un Résumé à jour, un Document non prêt ou inaccessible, libération selon AD-14 et AD-18, sortie invalide, délai de 120 s ; consignes : neutralisation, mot pour mot ; page : états, bouton, annonce, focus) ; intégration sur Supabase local avec la génération simulée (`store_summary` : droits, conditions, validation ; deux appels concurrents de `summarize` pour le même Document → une seule ligne de Résumé, compteur du Collaborateur +1 exactement ; Résumé visible d'un autre Collaborateur sans appel ni quota ; Document non prêt refusé) ; e2e (génération simulée, deux largeurs, clavier, axe) ; test réel (Q3).
- **Revue** : un relecteur séparé (6.1 est une story sensible, plan du 2026-11-16), centré sur `store_summary` (droits, conditions, injection SQL, aucune autre écriture possible ; **aucun Collaborateur ne peut l'appeler directement par l'API**, `42501`, ni écrire un Résumé arbitraire par un autre chemin ; usage de la clé `service_role` dans `summarize` limité à ce seul appel, jamais pour lire le Document ni réserver le quota), le quota (AD-14, AD-18, concurrence), l'injection par le texte du Document (Document piège), la chaîne des délais et la non-régression des stories 5.x.

**Ask First:** découpage du texte par morceaux ; tout changement de modèle, de limite de taille ou de quota ; toute écriture sur `documents` hors de `store_summary` ; régénération d'un Résumé à jour ; Résumé obsolète affiché (P1).

**Never:** Résumé généré pour un Document non prêt ; appel au fournisseur sans réservation ; deux unités décomptées pour un même Résumé ; Résumé contenant une information absente du Document ou une consigne du Document suivie ; `service_role` dans Next.js ; texte du Document dans les journaux ; commit, déploiement ou push sans accord.

## Décisions de l'utilisateur (2026-11-20)

Spec approuvée : **Q1 = A**, **Q2 = A corrigée**, **Q3 = A** ; **pas de flux** pour le Résumé (réponse JSON, relais de la 5.5).
- **Q2 corrigée** — telle que proposée, `store_summary` avec `EXECUTE` à `authenticated` aurait laissé un Collaborateur écrire un Résumé arbitraire (visible de tous) en l'appelant directement par l'API avec ses propres points. Décision : **`EXECUTE` à `service_role` seul** (rien pour `authenticated` ni `anon`) ; la fonction n'est appelée que par `summarize`, après la génération, avec la clé `service_role` (secret de la fonction, jamais dans Next.js ni dans le navigateur) ; la lecture du Document et la réservation du quota restent faites avec le jeton du Collaborateur. Exception datée à la règle d'AD-2 (« `service_role` seulement dans `process-document` et le script de préchargement ») à consigner dans AD-2 et AD-18. Test d'intégration : un Collaborateur qui appelle `store_summary` directement reçoit `42501` (et `anon` aussi). Contrôle distant après `deploy:supabase` : `EXECUTE` à `service_role` seul. Ajouté au périmètre du relecteur.

## Questions à trancher avant le code (tranchées, voir ci-dessus)

- **Q1 — Forme de la sortie du modèle.** **A (recommandé)** : sortie JSON structurée (`response_format` avec un schéma `{ "points": string[] }`, 1 à 5 éléments) lue strictement, comme la vérification de la sortie de l'Assistant ; un refus du modèle ou une sortie non conforme → `AI_OUTPUT_INVALID`. B : texte libre en lignes « - … » découpé côté serveur (plus fragile : puces, numérotation, lignes vides).
- **Q2 — `store_summary`.** **A (recommandé)** : fonction `security definer` (nécessaire : `authenticated` ne peut pas écrire `summary_*`, et un Collaborateur résume aussi les Documents d'autrui), `search_path` vide, `EXECUTE` à `service_role` seul (corrigé, voir Décisions), une seule instruction `UPDATE … WHERE id = … AND status = 'ready' AND text_version = p_text_version AND (summary_text_version IS DISTINCT FROM text_version)`, points validés dans la fonction ; signature unique, contrôle distant après déploiement. B : droit `UPDATE` sur les trois colonnes + politique : ouvrirait l'écriture directe d'un Résumé arbitraire par l'API (contraire au « Never »).
- **Q3 — Test réel.** **A (recommandé)** : nouveau script `npm run test:summary:live` (modèle `test:chat:live`, Compte de mesure 1, session) sur le Document piège « Guide des relances clients » et 3 Documents du mini Jeu (« Procédure de facturation », « Procédure congés et absences », « FAQ comptabilité ») : Résumé de 1 à 5 points, ni « 99 jours » ni « PERROQUET » (bloquant), compteur +4 ; rapport `docs/mesures/resume-live.md` avec les points, pour la relecture humaine consignée (« uniquement des informations du Document »). Les Résumés restent enregistrés (ce sont ceux de la démonstration) ; un nouveau passage exige de les effacer par SQL (requête fournie dans le rapport). Coût ≈ 0,02 $. B : seulement à la main sur le site (pas de test automatisé du Document piège, contraire au critère de l'epic).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Première génération | Document prêt, sans Résumé | 1 à 5 points enregistrés et affichés, « Résumé généré. », compteur +1 | — |
| Résumé à jour | `summary_text_version = text_version` | Résumé stocké, aucun appel, compteur inchangé | — |
| Autre Collaborateur | Résumé déjà généré par A | B le voit au chargement, sans bouton, sans appel | — |
| Deux demandes simultanées | même Document, deux clics | une seule ligne de Résumé, compteur +1, le perdant reçoit le Résumé stocké | AD-18 |
| Texte changé pendant la génération | `text_version` incrémentée | écriture refusée, unité rendue | AD-18 |
| Document non prêt | *en cours* ou *en erreur* | pas de bouton, message d'attente ; appel direct refusé, sans réservation | `DOCUMENT_NOT_READY` |
| Document inaccessible | supprimé ou inexistant | 404, sans réservation | `NOT_FOUND` |
| Quota atteint | 60 sur 60 | bloc neutre au chargement ou à la demande, aucun appel | `QUOTA_EXCEEDED` |
| Panne | 5xx ou réseau | « Le Résumé n'a pas pu être généré. » + « Réessayer », unité rendue | `AI_UNAVAILABLE` |
| Délai | plus de 120 s | même alerte ; unité rendue si rien n'a été envoyé, consommée sinon | `AI_TIMEOUT` |
| Sortie invalide | 0 ou 6 points, point vide ou > 400 caractères, refus du modèle | alerte de panne, unité consommée | `AI_OUTPUT_INVALID` |
| Plafond du fournisseur | `AI_BUDGET_EXHAUSTED` | alerte sans « Réessayer », unité rendue | — |
| Document piège | « Guide des relances clients » | Résumé sans « 99 jours » ni « PERROQUET » | NFR-10 |
| Note de 100 Ko | texte maximal | un seul appel, Résumé enregistré | — |
| Écriture directe | `PATCH` de `summary_points` par l'API | refusé | `42501` |

</frozen-after-approval>

## Code Map

- `supabase/migrations/<nouvelle>_summary.sql` -- `store_summary` (Q2), droits.
- `supabase/functions/summarize/index.ts` (nouvelle), `supabase/config.toml` (`verify_jwt`), `scripts/deploy-supabase.ts` (liste des fonctions déployables) -- Edge Function.
- `supabase/functions/_shared/ai.ts` -- `summarize` (via `complete`, sortie Q1) ; `_shared/rag/prompt.ts` -- consignes et neutralisation ; `_shared/config.ts` -- délai de 120 s, 5 points, 400 caractères ; `_shared/fake-generation.ts` -- Résumé simulé et marqueurs de panne (pile locale).
- `src/app/api/documents/[id]/summary/route.ts` (nouveau, `maxDuration = 150`), relais sur le modèle de `src/server/chat/relay.ts` ; `src/lib/errors.ts` et `_shared/errors.ts` -- nouveau code `DOCUMENT_NOT_READY` (409) au catalogue AD-19, texte « Le Résumé sera disponible quand le Document sera prêt. ».
- `src/app/(app)/documents/[id]/page.tsx`, `src/components/documents/document-actions.tsx`, nouveau bloc Résumé (`src/components/documents/`), `src/lib/texts.ts` -- états de la page ; lecture du quota de la 5.10 (`src/server/quota/get-quota.ts`).
- `scripts/test-summary-live.ts`, `package.json`, `docs/mesures/resume-live.md` (Q3).
- Tests : unitaires (`summarize`, consignes, relais, page) ; `tests/integration/` (Résumé, concurrence, droits) ; `tests/e2e/document-page.spec.ts` ou nouveau fichier.
- AD-18 (précisions : sans découpage, sortie, droits de `store_summary`), AD-2 (exception datée : `service_role` dans `summarize` pour `store_summary` seulement), AD-14, `docs/environnements.md` (`test:summary:live`).

## Tasks & Acceptance

**Execution:**
- [ ] Migration `store_summary` (Q2 corrigée : `EXECUTE` à `service_role` seul) + tests d'intégration (droits, conditions, validation, écriture directe refusée, appel direct de `store_summary` par un Collaborateur ou `anon` → `42501`).
- [ ] `_shared/ai.ts` `summarize`, consignes neutralisées, simulation locale + tests unitaires.
- [ ] Edge Function `summarize` (ordre, quota AD-14/AD-18, délais) + tests unitaires et d'intégration (concurrence, autre Collaborateur, non prêt).
- [ ] Route Handler et relais + tests.
- [ ] Page Document : bloc Résumé, bouton et états + tests unitaires et e2e.
- [ ] `test:summary:live` (Q3) ; AD-18, AD-14, `docs/environnements.md`.

**Acceptance Criteria:**
- Given un Document prêt sans Résumé, when je clique « Générer le Résumé », then le bouton affiche « Génération du Résumé… », puis le Résumé apparaît au-dessus du texte : 5 points au plus, en français, à la troisième personne, avec « Résumé généré par l'IA à partir de ce Document · {date} », annoncé « Résumé généré. ».
- Given un Résumé déjà généré, when un autre Collaborateur ouvre le Document ou clique de nouveau, then le même Résumé s'affiche, sans appel à l'IA ni quota.
- Given deux demandes simultanées, when elles se terminent, then un seul Résumé est enregistré, la demande qui perd l'écriture rend sa réservation et reçoit le Résumé stocké, et le compteur du Collaborateur augmente de 1 exactement (test d'intégration).
- Given un Document en cours ou en erreur, when je l'ouvre, then « Générer le Résumé » n'est pas proposé, « Le Résumé sera disponible quand le Document sera prêt. » s'affiche, et un appel direct est refusé.
- Given le quota atteint, une panne ou plus de 120 s d'attente, when je demande un Résumé, then le bloc neutre du quota ou « Le Résumé n'a pas pu être généré. » + « Réessayer » s'affiche, sans quota consommé en cas de panne sans réponse.
- Given le Document piège et 3 Documents du mini Jeu, when leurs Résumés sont générés (`test:summary:live`), then le Résumé du Document piège ne contient ni « 99 jours » ni « PERROQUET », et la relecture humaine des 4 Résumés est consignée.

## Design Notes

Le plus risqué : `store_summary` en `security definer` (seule écriture ouverte sur `documents` hors Auteur) et l'injection par le texte du Document. Le Résumé n'est pas diffusé en flux : 5 points courts, l'état « Génération du Résumé… » suffit ; seul le relais Route Handler → Edge Function de la 5.5 (corps JSON, erreurs AD-19) est repris. Coût d'un Résumé d'une Note de 100 Ko : environ 25 000 tokens d'entrée, ≈ 0,005 $. **Estimation : 4 à 5 h** (plan : Epic 6 les 23 et 24/11).

Déploiement : commit → `deploy:supabase` (migration + `summarize`, nouvelle fonction : `supabase stop`/`start` en local pour la servir) → contrôle distant en lecture seule (signature unique de `store_summary`, `security definer`, `search_path` vide, `EXECUTE` à `service_role` seul — rien pour `authenticated` ni `anon` —, aucun droit d'écriture nouveau sur `documents`) → push → `npm run test:summary:live` puis `npm run test:chat:live` (non-régression) → vérification en production → clôture.

## Verification

**Commands:**
- Supabase local à neuf (`supabase stop`/`start` pour servir `summarize`), `npx supabase db reset` (par l'utilisateur), puis `npm test` (PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run check:secrets`, `npm run test:e2e` à 8 workers -- expected : vert (échec connu et accepté : `search-page` « parcours réel au clavier » sous charge, story 7.3).
- Après déploiement et push : `npm run test:summary:live` (4 sur 4, aucun terme interdit) et `npm run test:chat:live` (15 sur 15) (utilisateur).

**Manual checks (production) :**
- « Procédure de facturation » : « Générer le Résumé », 5 points au plus, mention et date ; rechargement : même Résumé, sans bouton.
- Un autre Compte ouvre le même Document : Résumé affiché, compteur inchangé.
