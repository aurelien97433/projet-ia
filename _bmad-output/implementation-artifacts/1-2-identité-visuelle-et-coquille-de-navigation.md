---
title: 'Story 1.2 : Identité visuelle et coquille de navigation'
type: 'feature'
created: '2026-11-04'
status: 'done'
baseline_commit: '4b1a18742500018b894832d72da32799d74f51ff'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-03/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'application affiche encore la page de démarrage de create-next-app, en anglais, avec un mode sombre automatique, sans identité NexaMind AI ni navigation : un Collaborateur ne peut ni se repérer ni atteindre les écrans au clavier.

**Approach:** Initialiser shadcn/ui (Tailwind 4), appliquer les jetons de DESIGN.md en mode clair uniquement, poser `lang="fr"`, un catalogue de textes, et une coquille commune aux écrans protégés : barre latérale ≥ 1024 px, barre du haut et menu en `Sheet` en dessous, lien d'évitement, anneau de focus plein, et cinq pages vides avec leur titre.

## Boundaries & Constraints

**Always:** textes repris du catalogue d'EXPERIENCE.md, au vouvoiement, centralisés dans `src/lib/texts.ts` ; couleurs, typographie (Geist), rayons et espacements de DESIGN.md exprimés en jetons CSS ; anneau de focus `ring-2 ring-ring ring-offset-2 ring-offset-background` partout, jamais l'opacité 50 % de shadcn ; boutons inactifs en `aria-disabled`, jamais `disabled` ; aucun défilement horizontal à 375 px ; Tableau de bord à la route `/`. Décisions du 2026-11-04 : « Se déconnecter » reste visible et focalisable au clavier, en `aria-disabled`, tant que la session n’est pas branchée ; aucun libellé codé en dur hors de `src/lib/texts.ts` ; seuls les composants shadcn `Button` et `Sheet` sont ajoutés. Le composant qui lit `usePathname` est placé dans une frontière `Suspense` (exigence de `cacheComponents` pour les futures routes à paramètres).

**Never:** authentification, protection des routes ou lecture de session (stories 1.3, 1.4) ; `formatFr` (story 1.5) ; contenu métier des écrans ; icônes « IA » (robot, cerveau, étincelles), dégradés ou ombres marquées ; mode sombre.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ordinateur | largeur ≥ 1024 px, `/bibliotheque` | barre latérale : « + Ajouter », 4 entrées, pied « Se déconnecter » ; « Bibliothèque » porte `aria-current="page"` | — |
| Mobile | largeur 375 px | barre du haut ☰ · logo · « + » (« Ajouter un Document ») ; pas de barre latérale ; aucun défilement horizontal | — |
| Menu | ☰ activé à 375 px | `Sheet` de navigation ; Échap ou un lien le ferme ; le focus revient sur ☰ | — |
| Clavier | premier Tab sur une page | « Aller au contenu », visible au focus, mène au contenu principal | — |
| Focus | élément interactif focalisé au clavier | anneau plein de 2 px `{colors.ring}`, décalé de 2 px | — |
| Système sombre | `prefers-color-scheme: dark` | fond clair inchangé | — |
| Changement d'écran | clic sur une entrée de navigation | le focus va sur le `h1` du nouvel écran | — |
| Pas de session | toute page de la coquille (avant 1.4) | pied : « Non connecté » et « Se déconnecter » en `aria-disabled` | — |

</frozen-after-approval>

## Code Map

- `src/app/layout.tsx` -- racine : Geist déjà chargé ; passer `lang="fr"`, métadonnées françaises, retirer Geist Mono si inutilisé.
- `src/app/globals.css` -- `@import "tailwindcss"` + mode sombre à supprimer ; recevra les jetons shadcn alignés sur DESIGN.md.
- `src/app/page.tsx` -- page create-next-app à supprimer : remplacée par `src/app/(app)/page.tsx` (route `/`).
- `src/proxy.ts`, `src/lib/supabase/*` -- inchangés (1.4).
- `next.config.ts` -- `cacheComponents: true`, `partialPrefetching: true` : ne pas modifier.
- `tests/e2e/smoke.spec.ts` -- attend un `h1` sur `/` ; reste valable.
- `public/*.svg` -- fichiers create-next-app non utilisés ensuite ; à supprimer.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md` -- `Suspense` requis avec `cacheComponents` pour les routes à paramètres.

## Tasks & Acceptance

**Execution:**
- [x] `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, `src/components/ui/sheet.tsx` -- `npx shadcn@latest init` puis `add button sheet` ; remplacer leurs classes de focus par l'anneau de DESIGN.md.
- [x] `src/app/globals.css` -- jetons DESIGN.md (couleurs, `--radius`, typographie de base 15 px), mode clair seul, `scroll-padding`, `overflow-wrap: anywhere` sur le texte, `prefers-reduced-motion`.
- [x] `src/app/layout.tsx` -- `lang="fr"`, titre « NexaMind AI », description française.
- [x] `src/lib/texts.ts` -- catalogue : logo, navigation, menu, lien d'évitement, titres d'écran, pied de barre latérale.
- [x] `src/components/shell/` -- `AppShell`, `Sidebar`, `TopBar`, `NavLinks` (client, `usePathname`, `aria-current`), `MobileNav` (`Sheet` contrôlé, fermé à la navigation), `SkipLink`, `Logo` (texte + symbole SVG à trait de trois nœuds), `PageTitle` (`h1` focalisé au changement d'écran).
- [x] `src/app/(app)/layout.tsx`, `(app)/page.tsx`, `(app)/assistant`, `recherche`, `bibliotheque`, `ajouter` -- pages vides avec `h1` du catalogue ; suppression de `src/app/page.tsx` et des SVG inutilisés.
- [x] `tests/e2e/shell.spec.ts` -- matrice ci-dessus à 1 280 et 375 px, plus axe (contraste, noms accessibles) ; `playwright.config.ts` : projets ordinateur et mobile si utile.

**Acceptance Criteria:**
- Given n'importe quelle page, when je l'ouvre, then `<html lang="fr">`, fond clair même en système sombre, couleurs, Geist et rayons de DESIGN.md, logo et symbole visibles.
- Given le contrôle axe, when Playwright s'exécute à 1 280 et 375 px, then aucune violation n'est remontée.
- Given les tests existants, when `npm test`, `npm run test:e2e`, `npm run build:ci` et `npm run lint`, then tout passe.

## Spec Change Log

## Review Triage Log

## Design Notes

Le pied de la barre latérale ne peut pas afficher l'e-mail avant l'authentification : il affiche « Non connecté » en texte secondaire et « Se déconnecter » en `aria-disabled` ; la story 1.4 y branchera la session. Le focus au changement d'écran passe par `PageTitle` (`h1` en `tabIndex={-1}`, focalisé au montage s'il ne s'agit pas du premier chargement), pour ne pas voler le focus du lien d'évitement au chargement initial.

## Verification

**Commands:**
- `npm run test:e2e` -- expected: smoke + shell verts aux deux largeurs, axe sans violation
- `npm test` -- expected: 30 tests verts (Supabase local démarré)
- `npm run build:ci` -- expected: succès, aucun secret
- `npm run lint` -- expected: 0 erreur

**Manual checks (if no CLI):**
- Ordinateur, 375 px (outils de développement), clavier seul : navigation, menu, lien d'évitement, anneau de focus.

## Implementation Notes

- shadcn CLI 4.23.0 (`init -t next -b radix`) ; seuls `Button` et `Sheet` ajoutés. Le CLI installe le paquet `cn` (éditeur shadcn, dépôt shadcn-ui/cn, sans dépendance ni script d’installation) : épinglé en `0.5.2` car publié le 2026-11-02.
- `Button` : classes `ring/50` retirées, `transition-colors` au lieu de `transition-all` (l’anneau s’animait), variante principale en `rounded-lg`, variante `outline` en bouton secondaire de DESIGN.md. `Sheet` : bouton de fermeture 40 × 40, opaque, nommé « Fermer » depuis le catalogue.
- Anneau de focus global dans `globals.css` (`:focus-visible`, ombre 2 px fond + 2 px `--ring`, équivalent de `ring-2 ring-offset-2`) ; `@custom-variant dark` conservé pour que les classes `dark:` ne réagissent jamais au réglage du système.
- Focus au changement d’écran : `PageTitle` + `title-focus.ts` ; pas de focus au premier chargement (lien d’évitement en premier arrêt) ; après un lien du menu mobile, le focus revient sur ☰. Décision figée une fois par titre (StrictMode rejoue les effets en développement).
- `NavLinks` (lit `usePathname`) dans une frontière `Suspense` avec un rendu de repli sans entrée active.
- Libellés ajoutés au catalogue hors EXPERIENCE.md : « Navigation » (titre masqué du menu), « Navigation principale » (`aria-label` du `nav`), « Non connecté » (pied avant 1.4).
- `src/app/page.tsx` et `public/*.svg` supprimés ; cache `.next` à vider après cette suppression (types générés périmés).
- Vérifié : `npm test` 30/30, `npm run test:e2e` 23 réussis (5 sautés : tests propres à l’autre largeur), axe sans violation sur les 5 pages aux 2 largeurs, `lint` 0, `tsc` 0, `build:ci` vert.

- Vérification manuelle validée par l'utilisateur le 2026-11-04 (ordinateur, 375 px, clavier) ; revue par relecteurs non lancée, à sa demande.
