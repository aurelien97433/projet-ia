---
title: 'Story 3.2 : Page Document complète'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: '4edffcd98a5bdd250b7a7e55b372451cfcb3f172'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La page Document n'accepte aucun Passage dans son URL, n'a ni message de chargement long ni barre d'actions, et son badge dépend d'un rafraîchissement serveur distinct du bandeau, ce qui rend deux tests e2e intermittents.

**Approach:** La page lit et valide `passages` et `actif` côté serveur, transmet des positions au Lecteur, et place badge et bandeau sous une même source d'état client.

## Boundaries & Constraints

**Always:**
- **Format d'URL** : `?passages=120-340,900-1100&actif=1`. Seuls des entiers en sortent : aucune valeur de l'URL n'est affichée.
- **Validation serveur**, fonction pure : au plus 20 éléments et 2 000 caractères. Chaque élément de forme `début-fin` en chiffres donne une position ; tout autre élément reste une entrée invalide **à sa place**, pour que `actif` reste un indice dans la liste reçue. Liste trop longue, `passages` répété : une seule entrée invalide. `passages` absent ou vide : aucune entrée, aucun message. `actif` invalide ou absent : 0. `layoutPassages` reste la barrière finale sur les limites du texte.
- **Focus** : avec un Passage actif, focus sur le `<mark>` (sans défilement supplémentaire), y compris au premier chargement ; sinon, règle existante du titre (`PageTitle`), le titre ne reprenant jamais le focus au Passage.
- **Message en tête quand un Passage manque** (`some`) : reste visible pendant la lecture (collant sous la barre du haut, sans masquer le Passage), et le `<mark>` actif y renvoie par `aria-describedby`. Aucun Passage retrouvé (`all`) : ni défilement ni focus de Passage.
- **Une seule source d'état** : un fournisseur client unique détient Statut, interrogation, resynchronisation et rafraîchissement (repris de `StatusBanner`). Badge, bandeau et actions le lisent ; le texte reste rendu côté serveur, sans passer en propriété à un composant client.
- **Passage actif entièrement visible** : prouvé dans un vrai navigateur, aux deux largeurs, sous la barre du haut.
- **Chargement** : squelette existant, puis à 10 s « Le chargement prend plus de temps que prévu. » et « Réessayer » (rechargement complet).
- **375 px** : métadonnées et actions empilées, aucun défilement horizontal.

**Décisions du 2026-11-09 :**
- **Q1 = C.** Barre d'actions préparée dans le code (`DocumentActions`), rôle Auteur et Statut transmis, **aucun bouton affiché** : les stories 3.4, 5.2b et 6.1 y ajoutent leurs boutons.
- **Positions d'URL** : bornées à la longueur du texte dès la validation (position au-delà : entrée invalide), au plus 20 éléments, 2 000 caractères, et 7 chiffres au plus par nombre.
- **Si un test intermittent échoue encore après la source unique** : présenter les traces à l'utilisateur, sans modifier aucun délai.
- **Story gardée entière**, au-dessus du repère de taille.

**Never:** Délai de test augmenté pour stabiliser. Suppression (3.4), Résumé (6.1), navigation entre Passages (5.12). Migration SQL. Commit ou push sans validation. Story 3.3.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sans paramètre | URL simple | Lecteur sans Passage, aucun message | — |
| Valide | `passages=0-10,20-30&actif=1` | 2 `<mark>`, le 2ᵉ actif et focalisé | — |
| Élément invalide | `abc,20-30&actif=1` | actif = `20-30`, « 1 sur 1 » | « Un des Passages… » |
| Tous invalides | `9999999-9999999` | texte seul, focus non déplacé sur un Passage | « Le Passage cité… » |
| Trop d'éléments | 21 éléments | texte seul | « Le Passage cité… » |
| Répété | `passages=a&passages=b` | texte seul | « Le Passage cité… » |
| `actif` invalide | `actif=x`, `-1`, `99` | premier retrouvé actif | — |
| Balisage dans l'URL | `passages=<script>` | rien d'affiché ni exécuté | « Le Passage cité… » |
| Identifiant | inconnu, mal formé, autre Auteur absent | page E9 neutre, identique | — |
| Autre Auteur | B ouvre le Document de A | informations et Lecteur, aucune action d'Auteur | — |
| Passage du Statut | *en cours* puis *prêt* | badge et bandeau changent au même rendu | — |

</frozen-after-approval>

## Code Map

- `src/app/(app)/documents/[id]/page.tsx` -- `searchParams`, fournisseur, barre d'actions.
- `src/components/documents/status-banner.tsx:56-187` -- état, interrogation, resynchronisation et boucle de rafraîchissement à déplacer dans le fournisseur ; relance et rendu restent dans le bandeau.
- `src/components/documents/status-badge.tsx` -- reste purement visuel : un petit composant client lit le fournisseur.
- `src/components/documents/document-reader.tsx`, `passage-scroller.tsx` -- propriété `focusActive` (la 5.7 focalise le titre du panneau), renvoi vers le message, collage.
- `src/components/shell/page-title.tsx`, `title-focus.ts` -- consommer l'état partagé, mais ne pas prendre le focus si un Passage est actif.
- `src/app/(app)/documents/[id]/loading.tsx` -- ajouter le message des 10 s (composant client).
- `src/components/shell/app-shell.tsx:35` -- barre collante `h-14`, seulement sous 1 024 px ; `src/app/globals.css:100` -- `scroll-padding-top`.
- `tests/e2e/document-status.spec.ts:59`, `:113` -- les deux tests à stabiliser, **délais inchangés**. `tests/e2e/ajouter.spec.ts:54` -- même symptôme.
- `AGENTS.md` : lire `node_modules/next/dist/docs/` pour `searchParams` avec `cacheComponents`. Supabase local déjà démarré ; `docker start supabase_edge_runtime_projet-ia` si besoin. Ne lire aucun fichier `.env*`. Aucun commit ni push.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/passages.ts` -- `parsePassageParams(params, textLength)`, fonction pure, positions bornées à la longueur du texte.
- [x] `src/components/documents/document-status-provider.tsx`, `status-banner.tsx`, badge client -- source unique.
- [x] `src/components/documents/document-reader.tsx`, `passage-scroller.tsx`, `src/components/shell/page-title.tsx` -- focus, message.
- [x] `src/components/documents/document-actions.tsx`, `page.tsx`, `src/lib/texts.ts` -- barre préparée sans bouton, rôle Auteur transmis, et intégration.
- [x] `loading.tsx`, nouveau composant client -- message des 10 s, « Réessayer ».
- [x] `tests/unit/passages.test.ts`, tests de composant -- matrice, 10 s.
- [x] `tests/e2e/document-page.spec.ts` -- Passage entièrement visible et focalisé aux deux largeurs, message collant, paramètres hostiles, E9, Autre Auteur, 375 px, chargement.

**Acceptance Criteria:**
- Given un Document de A, when B ouvre sa page, then titre, Catégorie, Auteur, date, badge, bandeau et Lecteur s'affichent.
- Given une URL avec Passages, when elle s'ouvre, then ils sont surlignés, le Passage actif est focalisé et entièrement visible.
- Given un chargement lent, when 10 s passent, then le message et « Réessayer » s'affichent.
- Given trois suites `test:e2e` complètes, when elles se terminent, then les deux tests sont verts à chaque fois, délais inchangés.

## Implementation Notes

- **Message des 10 s sans composant client (écart au Code Map).** Essai réel sur une ouverture directe d'URL avec un serveur retardé : le squelette s'affiche, mais un minuteur client placé dans `loading.tsx` ne démarre jamais, 17 s après le squelette le message est toujours absent. React n'hydrate pas le contenu de repli d'une frontière Suspense encore en attente. Le critère frozen (« à 10 s ») tiendrait seulement en navigation interne. `SlowLoadingNotice` est donc un composant serveur : délai porté par le CSS (`.slow-loading-notice`), « Réessayer » est un lien `href=""` vers l'URL courante (rechargement complet, sans JavaScript).
- **Le fournisseur n'englobe pas le Lecteur.** Il entoure l'en-tête, le bandeau et les actions ; le Lecteur est son voisin, le texte n'entre donc dans aucun composant client, pas même en `children`.
- **Réserve de hauteur.** `PassageScroller` pose `--passage-notice-height` sur le `<mark>` : `scroll-margin-top` réserve alors la hauteur du message collant, y compris pour un Passage plus haut que l'écran.
- **Test adapté : `le déclenchement porte un nouvel identifiant…`** Il attendait le badge pour savoir que le serveur avait rattrapé le bandeau ; le badge suit désormais le client et ne le prouve plus. Il redemande maintenant un rafraîchissement jusqu'à ce que la dernière réponse RSC, sans autre requête en cours, porte `"effectiveStatus":"ready"`. Aucun délai modifié.
- **Test adapté : `rafraîchissement périmé…`** Le badge étant immédiat, le test finissait pendant que son intercepteur attendait encore `route.fetch`, et l'erreur retombait sur le test suivant du worker. Il attend maintenant la fin de l'intercepteur (`unrouteAll({ behavior: "wait" })`), puis vérifie le badge. Aucun délai modifié.
- **Collage en `top-14 lg:top-0`** : valeurs de la page Document ; le panneau Source (5.7) devra les adapter s'il garde ce message collant.

## Spec Change Log

## Review Triage Log

Revue ciblée du 2026-11-09 (validation des paramètres, affichage, accessibilité), un seul relecteur à la demande de l'utilisateur. Validation des paramètres et affichage : aucun constat.

| # | Constat | Verdict | Preuve | Suite |
|---|---|---|---|---|
| R1 | Message des 10 s absent de l'arbre d'accessibilité avant d'apparaître, donc non annoncé | medium | `role="status"` et `visibility: hidden` sur le même élément | corrigé : zone toujours présente, seul le contenu apparaît |
| R2 | Cas « aucun Passage retrouvé » non annoncé à l'arrivée | low | zone créée avec son message ; le message précède le texte | reporté : `deferred-work.md` |

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, trois fois `npm run test:e2e` -- expected: tout vert, aucun secret.
- Après `build:ci` -- aucun texte de Document dans `.next/server/app`.

**Manual checks:**
- Production : voir le rapport de fin de story.

**Résultats du 2026-11-09 :** `lint`, `tsc`, `build:ci` et `check:secrets` verts ; `npm test` vert ; trois suites `npm run test:e2e` complètes : 235 réussis, 5 sautés, à chaque fois, délais inchangés. Dans le lot précédent de l'agent, sur le même code applicatif, `ajouter.spec.ts:54` a échoué une fois pour un vrai échec de traitement local (voir `deferred-work.md`). Aucun texte de Document dans `.next/server/app`. Correction R1 appliquée directement, sans repasser par l'agent, vu sa taille.

Production (2026-11-09, utilisateur, déploiement 445b4df) : page d un autre Compte, Passages depuis l URL, paramètre hostile, Page introuvable et 375 px vérifiés ; synchronisation du badge et du bandeau, message collant et message des 10 s couverts par les tests seulement.
