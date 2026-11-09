---
title: 'Story 3.1 : Lecteur de Document et mise en évidence (Passages de test)'
type: 'feature'
created: '2026-11-09'
status: 'in-review'
baseline_commit: '470b177d0f75953580b375f87b496242b8025d7b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La page Document affiche le texte dans un simple paragraphe : aucun composant ne sait mettre en évidence des Passages, pourtant nécessaires à la Recherche et aux Sources.

**Approach:** Un Lecteur unique découpe le texte par positions, le rend en nœuds texte, met les Passages dans des `<mark>` et défile jusqu'au Passage actif. La page Document l'utilise dès maintenant, sans Passage.

## Boundaries & Constraints

**Always:**
- **Texte brut** (AD-8) : nœuds texte React seulement, retours à la ligne conservés, `overflow-wrap: anywhere`.
- **Contrat** : `DocumentReader({ text, passages = [], activeIndex = 0 })`, avec `passages: { start, end }[]` en unités de code JavaScript. Le découpage est une fonction pure, sans DOM.
- **Passage valide** : entiers, `0 <= start < end <= text.length`, sans couper une paire de substitution, sans chevaucher un Passage déjà retenu (ordre des positions : le premier reste).
- **`<mark>`** précédé du texte masqué « Passage utilisé j sur k », `j` et `k` comptés sur les Passages retrouvés, dans l'ordre du texte. `tabindex="-1"` sur le Passage actif.
- **Actif** : classe `passage-highlight` et étiquette visible « Passage utilisé » (masquée aux lecteurs d'écran, le texte masqué suffit). Autres : `passage-highlight-inactive`, sans étiquette (DESIGN.md). Si le Passage demandé est invalide, le premier retrouvé devient actif.
- **Défilement** au montage et quand `activeIndex` change : centré, ou aligné en haut si le Passage dépasse la hauteur visible ; saut immédiat si `prefers-reduced-motion`. Aucun déplacement du focus (3.2).
- **Messages en tête** (EXPERIENCE.md) : aucun Passage retrouvé : « Le Passage cité n'a pas pu être retrouvé dans ce Document. Le Document est affiché en entier. » ; au moins un retrouvé : « Un des Passages cités n'a pas pu être retrouvé dans ce Document. », et les Passages retrouvés restent mis en évidence.
- **Texte du Document envoyé une seule fois au navigateur** : le Lecteur n'est pas un composant client ; seul un petit composant client gère le défilement.

**Décisions du 2026-11-09 :**
- **Dépendances.** Les nouveaux paquets sont strictement en `devDependencies`, avec des versions exactes (sans `^` ni `~`). `check:secrets` reste vert.
- **Aucun contenu de Document n'est interprété comme du HTML**, y compris dans les étiquettes et les messages : ils sont rendus en nœuds texte.
- **Emplacement accepté** : `src/components/documents/`, architecture et `epics.md` alignés sur ce chemin.
- **3.1 seule**, spec gardée entière.

**Never:** `dangerouslySetInnerHTML`, interprétation Markdown ou HTML. Navigation « Précédent / Suivant » (5.12). Paramètres d'URL, focus, `Skeleton`, barre d'actions, source d'état unique (3.2). Migration SQL. Commit ou push sans validation. Story 3.3.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sans Passage | `passages = []` | texte seul, aucun message | — |
| Un Passage | positions valides | un `<mark>` actif, « 1 sur 1 » | — |
| Plusieurs | désordonnés, `activeIndex` 1 | ordre du texte, un seul actif | — |
| Bord | `start = 0`, `end = text.length` | texte entier surligné, sans segment vide | — |
| Tous invalides | hors texte, `end <= start`, décimal | texte seul | message « Le Passage cité… » |
| Chevauchement | deux Passages croisés | le premier retenu, « 1 sur 1 » | message « Un des Passages… » |
| Paire de substitution | position au milieu d'un emoji | Passage rejeté | message correspondant |
| Actif invalide | `activeIndex` hors liste ou invalide | premier retrouvé actif | — |
| Mouvement réduit | `prefers-reduced-motion` | saut immédiat | — |
| `.md piège` | `<script>`, `onerror`, `javascript:` | balisage visible en texte, aucune exécution | — |
| Piège à 375 px | longues chaînes | aucun défilement horizontal | — |

</frozen-after-approval>

## Code Map

- `src/app/(app)/documents/[id]/page.tsx:60-65` -- paragraphe à remplacer par le Lecteur, section et `aria-label` conservés.
- `src/components/documents/` -- dossier du domaine, créé avant cette story : le Lecteur y va (l'architecture écrit `document/`), pour ne pas scinder le domaine.
- `src/lib/texts.ts` -- ajouter un bloc `reader` au catalogue : aucun texte en dur.
- `src/app/globals.css:34-37,80-83` -- jetons `accent-*` ; ajouter `passage-highlight` et `passage-highlight-inactive` (DESIGN.md §`passage-highlight`, `box-decoration-break: clone`).
- `vitest.config.mts` -- `include` limité à `.test.ts`, environnement `node` : ajouter `.test.tsx`, avec `// @vitest-environment jsdom` par fichier, sans changer les tests existants.
- `demo/documents/test-md-piege.md`, `test-piege-375.md` -- contenus réels des tests.
- `tests/e2e/document-status.spec.ts:17-36` -- modèle d'insertion par le client admin. Tester avec `status: "ready"` : pas de traitement.
- `AGENTS.md` : lire `node_modules/next/dist/docs/` avant d'écrire un composant serveur ou client. Tests sur Supabase local déjà démarré ; le conteneur `supabase_edge_runtime_projet-ia` peut demander un `docker start`. Ne jamais lire `.env.local`, `.env.seed` ni `supabase/functions/.env`. Aucun commit ni push.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `vitest.config.mts` -- `@testing-library/react`, `@testing-library/dom`, `jsdom` en dépendances de développement, versions exactes ; `.test.tsx`.
- [x] `src/lib/passages.ts` -- validation et découpage, fonction pure.
- [x] `src/lib/texts.ts`, `src/app/globals.css` -- textes et styles.
- [x] `src/components/documents/document-reader.tsx`, `passage-scroller.tsx` -- Lecteur et défilement client.
- [x] `src/app/(app)/documents/[id]/page.tsx` -- utiliser le Lecteur, sans Passage.
- [x] `tests/unit/passages.test.ts` -- matrice sur la fonction pure.
- [x] `tests/unit/document-reader.test.tsx` -- `<mark>`, texte masqué, actif, messages, défilement, Document piège réel.
- [x] `tests/e2e/document-reader.spec.ts` -- `.md piège` (aucune exécution, aucun `img` ni lien créé) et piège à 375 px, axe sans violation.

**Acceptance Criteria:**
- Given des Passages valides, when le Lecteur s'affiche, then chaque Passage est dans un `<mark>` avec son texte masqué, l'actif a l'étiquette et le style actif, les autres sont en pointillés, et la vue défile jusqu'à l'actif.
- Given des positions invalides, when le Lecteur s'affiche, then le texte reste entier et le message correspondant s'affiche, sans erreur.
- Given le Document « .md piège » sur la page Document, when il s'affiche, then le balisage apparaît en texte et aucun script ne s'exécute.
- Given le Document « piège à 375 px », when il s'affiche à 375 px, then il n'y a aucun défilement horizontal.
- Given le code livré, when il est recherché, then `dangerouslySetInnerHTML` n'apparaît nulle part dans `src/`.

## Implementation Notes

- Implémentation par un sous-agent, à partir de la seule spec ; diff relu ensuite et contrôles complets relancés séparément.
- `activeIndex` désigne un élément de `passages` tel que reçu : la 3.2 doit transmettre `actif` de la même façon.
- `DocumentReader` est un composant serveur ; seul `PassageScroller` est un composant client, et il ne reçoit jamais le texte du Document.
- La zone `role="status"` du Lecteur est toujours présente : le sélecteur `banner` de `tests/e2e/document-status.spec.ts` cible désormais le bandeau seul.
- Défilement toujours immédiat : EXPERIENCE.md limite ce défilement à 200 ms et un défilement natif ne peut pas être borné.

## Spec Change Log

## Review Triage Log

Revue ciblée du 2026-11-09 (sécurité de l'affichage et accessibilité), un seul relecteur à la demande de l'utilisateur. Sécurité de l'affichage : aucun constat.

| # | Constat | Verdict | Preuve | Suite |
|---|---|---|---|---|
| R1 | Message « Passage introuvable » hors zone vivante | low | `<p>` inséré seul, non annoncé si le Lecteur reste monté | corrigé : zone `role="status"` toujours présente |
| R2 | Texte masqué copié dans le presse-papiers | low | mesuré dans Chromium | corrigé : `select-none` |
| R3 | Défilement animé au-delà de 200 ms | medium | 1,5 s mesurée ; EXPERIENCE.md limite à 200 ms | corrigé : défilement immédiat |
| R4 | Étiquette « Passage pertinent » non prévue | low | seule l'arrivée depuis la Recherche la demande | reporté : `deferred-work.md` |

## Verification

**Commands:**
- `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected: tout vert, aucun secret.
- Après `build:ci` -- `/documents/[id]` n'est pas prérendue avec des données : aucun texte de Document dans `.next/server/app`.

**Manual checks:**
- Visibilité complète du Passage dans un vrai navigateur : à prouver en 3.2, première story qui transmet des Passages à une page.

**Résultats du 2026-11-09 :** `lint`, `tsc`, `build:ci` et `check:secrets` verts ; `npm test` : 641 sur 642 ; `npm run test:e2e` : 197 réussis, 5 sautés. Échec restant : `seed-demo` « en cours et vivant », hors de cette story (voir `deferred-work.md`). `/documents/[id]` est partiellement prérendue (`◐`), sans aucun texte de Document dans `.next/server/app`. `dangerouslySetInnerHTML` absent de `src/`.
