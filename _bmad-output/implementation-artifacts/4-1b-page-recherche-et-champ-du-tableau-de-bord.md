---
title: 'Story 4.1b : Page Recherche et champ du Tableau de bord'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: 'd53316a9d6ea32fad0443820ee02f902fdca2eef'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `POST /api/search` (4.1a) existe, mais `/recherche` n'affiche qu'un titre et le Tableau de bord n'a pas de champ de Recherche : un Collaborateur ne peut ni chercher par le sens, ni ouvrir un résultat au bon Passage.

**Approach:** Page `/recherche` cliente pilotée par `?q=` (champ, exemples, squelettes, annonce du nombre, cartes, états vide et erreur) ; champ du Tableau de bord qui ouvre `/recherche?q=…` ; carte = lien vers la page Document au Passage, avec l'étiquette « Passage pertinent » (report de la 3.1).

## Boundaries & Constraints

**Always:**
- Textes du catalogue (`texts.ts`), repris d'EXPERIENCE.md : aide « Décrivez ce que vous cherchez avec vos propres mots. », libellé visible « Votre recherche », « Rechercher », « {n} Documents pertinents » / « 1 Document pertinent », « La Recherche n'a pas pu aboutir. » + « Réessayer » ; Tableau de bord : libellé masqué « Rechercher dans les Documents », indication « Rechercher dans les Documents… ».
- Carte : un seul lien (titre comme nom accessible, Catégorie et Passage en description), titre, Catégorie (libellé du catalogue, « Autre » si inconnue), Passage en `<mark class="passage-highlight">` rendu en texte, `[overflow-wrap:anywhere]`, `min-w-0` ; aucun score, aucun texte rédigé par l'IA.
- Lien : `/documents/{id}?passages={start}-{end}&actif=0&depuis=recherche`, construit seulement si `id` est un UUID et les positions des entiers valides (sinon carte non affichée) ; `q` encodé par `URLSearchParams`.
- Page Document : `depuis=recherche` (seule valeur reconnue) remplace l'étiquette visible et le texte masqué par « Passage pertinent » / « Passage pertinent {j} sur {k} » ; toute autre valeur garde « Passage utilisé ».
- `?q=` : espaces retirés ; vide → état initial ; > 500 caractères → état initial, champ pré-rempli des 500 premiers. Un nouvel envoi pousse l'URL ; le même `q` relance la Recherche. Une requête en cours est annulée par la suivante ; délai client de 15 s → erreur ; 401 → `router.refresh()`.
- Focus : à l'arrivée sur `/recherche` sans `q` (navigation), sur le champ ; quand le résultat arrive et que le focus est dans la zone de Recherche (champ, bouton, exemple, « Réessayer ») ou vient du changement d'écran, il va sur l'annonce (nombre ou message FR-15) ou sur l'alerte d'erreur. Premier chargement complet : focus non déplacé (règle du lien d'évitement). Annonce dans une zone `role="status"` toujours présente.
- Tableau de bord : champ en tête de la bande d'actions, focus au changement d'écran (comme le titre aujourd'hui), Entrée ou bouton → `/recherche?q=…` ; Requête vide : rien.
- 375 px : champ et bouton empilés, cartes pleine largeur, aucun défilement horizontal.
- HTML prérendu de `/recherche` et du Tableau de bord : ni résultat, ni Passage, ni annonce de nombre (lecture de `?q=` sous `Suspense`).

**Décisions (2026-11-12, reprises de la demande) :**
- « Poser la question à l'Assistant » : **aucun bouton** tant que l'Assistant n'est pas utilisable (règle de la 3.2) ; emplacement commenté dans le code ; ajout du bouton (Assistant ouvert avec la Requête en question) inscrit dans la **story 5.2b** d'`epics.md` (tâche et critère), qui crée la page Assistant.
- Exemples de l'état initial : « organisation des congés », « remboursement des notes de frais », « revue après un incident critique » (liens vers `/recherche?q=…`).
- **Q1 = B.** État sans résultat jusqu'à 5.2b : « Aucun Document ne correspond suffisamment à votre recherche. Essayez d'autres mots. » La story 5.2b rétablit la phrase complète de FR-15 (« …Essayez d'autres mots ou posez la question à l'Assistant. ») **en même temps** qu'elle ajoute le bouton : critère ajouté dans `epics.md`.
- **Story gardée entière**, au-dessus du repère de taille.
- `depuis` n'accepte que la valeur `recherche` ; toute autre valeur est ignorée.
- Le champ du Tableau de bord ne vole jamais le focus au lien d'évitement au premier chargement (même règle que les autres pages).

**Never:** changement de `/api/search`, de `semantic-search` ou de la base ; `deploy:supabase` ; score ou similarité affichés ; contenu de Document interprété comme HTML ; bouton « Poser une question » (5.2b) ; story 2.6a ; commit ou push sans validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Succès | « organisation des congés » | « {n} Documents pertinents » puis ≤ 5 cartes, ordre reçu | — |
| Vide | `results: []` | message FR-15, aucune liste | — |
| Erreur | 5xx, réseau, délai, réponse mal formée | alerte + « Réessayer », champ conservé | focus sur l'alerte |
| Session | 401 | `router.refresh()` | — |
| `q` invalide | absent, espaces, > 500 | état initial (champ pré-rempli si > 500) | aucun appel |
| Résultat douteux | `documentId` non UUID, positions invalides | carte écartée | — |
| `depuis` | `recherche` / autre | « Passage pertinent » / « Passage utilisé » | — |

</frozen-after-approval>

## Code Map

- `src/app/(app)/recherche/page.tsx` -- aujourd'hui `PageTitle` seul ; garder le `h1` statique, ajouter la vue sous `<Suspense>` (repli : phrase d'aide).
- `src/components/shell/page-title.tsx`, `title-focus.ts` -- décision unique de focus par écran (`shouldFocusTitle`, consommée une fois) ; ajouter `focusTargetId` (élément focalisé à la place du `h1` s'il existe) et exposer la dernière décision pour la vue de Recherche, sans consommer l'état deux fois.
- `src/components/dashboard/action-band.tsx:12` -- emplacement réservé du champ (4.1b) ; `src/app/(app)/page.tsx` passe `focusTargetId` à `PageTitle`.
- `src/components/documents/document-reader.tsx` -- prop `activeLabel` (`"used" | "relevant"`) ; `src/lib/texts.ts` `reader` (ajouter les variantes « Passage pertinent »), `search` (textes ci-dessus), `dashboard`.
- `src/app/(app)/documents/[id]/page.tsx` -- lire `depuis` dans `searchParams` (fonction pure dans `src/lib/passages.ts`).
- `src/lib/schemas/search.ts` -- `SEARCH_QUERY_MAX_LENGTH`, `SearchResult` ; ne pas modifier le schéma (tests de 4.1a).
- `src/components/library/library-view.tsx` -- modèle d'appel client (AbortController, délai, 401, version courante) ; `src/components/forms/error-alert.tsx` (focusable, `role="alert"`).
- `tests/e2e/dashboard.spec.ts`, `tests/e2e/search-api.spec.ts`, `tests/support/e2e-auth.ts` -- modèles ; `seedMini` (`scripts/seed-demo.ts`) comme dans `tests/integration/semantic-search.test.ts` pour le parcours réel local (vectorisation simulée, seuil 0,20).
- `_bmad-output/planning-artifacts/epics.md:1294` -- tâches de 5.2b (ajouter le bouton de l'état sans résultat).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/texts.ts`, `src/lib/passages.ts` -- textes ; `parsePassageOrigin`.
- [x] `src/components/shell/page-title.tsx`, `src/components/shell/title-focus.ts` -- `focusTargetId`, décision lisible.
- [x] `src/components/documents/document-reader.tsx`, `src/app/(app)/documents/[id]/page.tsx` -- étiquette « Passage pertinent ».
- [x] `src/lib/search-links.ts` -- validation de `q`, construction des liens (fonctions pures).
- [x] `src/components/search/search-view.tsx`, `search-result-card.tsx`, `search-skeleton.tsx`, `src/app/(app)/recherche/page.tsx` -- page E5.
- [x] `src/components/dashboard/dashboard-search.tsx`, `action-band.tsx`, `src/app/(app)/page.tsx` -- champ du Tableau de bord.
- [x] `tests/unit/search-links.test.ts`, `tests/unit/search-view.test.tsx`, `tests/unit/document-reader.test.tsx`, `tests/unit/passages.test.ts`, `tests/unit/page-title.test.tsx` -- matrice, états, focus, annulation.
- [x] `tests/e2e/search-page.spec.ts` -- parcours réel (mini Jeu local) Tableau de bord → résultats → Document « Passage pertinent » ; états vide, erreur, chargement par interception ; clavier ; 375 px ; axe ; HTML prérendu de `recherche.html` et `index.html` sans résultat ni Passage.
- [x] `_bmad-output/planning-artifacts/epics.md` -- bouton « Poser la question à l'Assistant » dans 5.2b.

**Acceptance Criteria:**
- Given le Tableau de bord ouvert par navigation, when je tape « organisation des congés » puis Entrée, then `/recherche?q=organisation+des+congés` s'ouvre, l'annonce du nombre reçoit le focus et « Procédure congés et absences » figure parmi les cartes.
- Given une carte, when je l'active au clavier, then la page Document défile jusqu'au Passage surligné, précédé de « Passage pertinent ».
- Given `/recherche` à 375 px avec des résultats, when je mesure la page, then `scrollWidth` ≤ largeur de la fenêtre.
- Given le build, when je lis le HTML prérendu de `/recherche` et du Tableau de bord, then il ne contient ni `passage-highlight`, ni « Documents pertinents », ni texte du mini Jeu.

## Spec Change Log

## Review Triage Log

Revue ciblée faite dans la session, sans les trois relecteurs (demande de l'utilisateur) : affichage, accessibilité, passage des paramètres.

| Constat | Verdict | Suite |
| --- | --- | --- |
| Carte entièrement enveloppée dans un lien dont le nom accessible était le seul titre : axe `label-content-name-mismatch` (WCAG 2.5.3), constaté en e2e. | medium | patch : lien sur le titre, zone `after:` couvrant la carte (un seul lien, carte cliquable partout), Catégorie et Passage dans l'ordre de lecture. |
| Après « Réessayer » ou un exemple, le bouton ou le lien disparaît dès le chargement : le focus tombait sur la page avant que la Recherche note l'intention, et n'allait pas sur l'annonce. | medium | patch : intention notée au moment de l'action (envoi, exemple, « Réessayer ») ; test e2e « Réessayer » → annonce focalisée. |
| Effet initial : `setState` synchrone dans un effet (règle `react-hooks/set-state-in-effect`), avec une issue ancienne affichable une image le temps d'une nouvelle Requête. | low | patch avant les tests : issue rattachée à sa clé (Requête et tentative), chargement dérivé du rendu. |
| Constantes d'identifiant exportées d'un module `"use client"` et lues par un composant serveur (référence client, pas la valeur). | low | patch : `components/search/constants.ts`, `components/dashboard/constants.ts`. |
| `depuis` répété (`?depuis=recherche&depuis=recherche`) arrive en tableau : ignoré, « Passage utilisé ». | low | gardé (décision : seule la valeur `recherche` est acceptée) ; testé. |
| Un exemple ouvert dans un nouvel onglet (Ctrl+clic) laisse l'intention de focus notée dans l'onglet d'origine : le prochain résultat de cet onglet prendrait le focus s'il est libre. | low | rejeté : effet limité au focus déjà dans la vue ou sur la page, sans perte de saisie. |
| Test 1.2 « changement d'écran : focus sur le titre » sur `/recherche`, devenu écran de saisie (EXPERIENCE.md : focus sur le champ). | low | test adapté : titre vérifié sur la Bibliothèque, nouveau test du champ de la Recherche. |
| Parcours réel e2e : clic parfois avant hydratation sous charge (chargement complet, aucun focus par conception). | low | test : attente du lien hydraté ; spec rejouée 3 fois. |
| Le HTML prérendu de `/recherche` et du Tableau de bord ne contient que la coquille (session vérifiée sous Suspense) : le contrôle passe sans dépendre de la vue. | false | vérifié dans `.next/server/app` et par le test e2e dédié. |

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run test:e2e` -- expected : tout vert, aucun secret.

## Implementation Notes

- **Focus** : `PageTitle` reçoit `focusTargetId` ; la décision reste unique par écran (`shouldFocusTitle`), donc ni le champ du Tableau de bord ni celui de la Recherche ne prennent le focus au premier chargement complet (testé en e2e : « Aller au contenu » reste le premier arrêt). Arrivée par navigation : le champ ; résultat : l'annonce (nombre ou message FR-15) ou l'alerte, si la Recherche vient de la vue (focus dans la vue ou sur le titre, ou intention notée par l'action) et que le focus n'a pas été posé ailleurs.
- **État** : l'URL (`?q=`) est la seule source de la Requête ; issue rattachée à la clé `tentative:Requête` ; requête précédente annulée (`AbortController`), délai client 15 s ; 401 → `router.refresh()`.
- **Carte** : lien sur le titre avec zone `after:absolute inset-0` (un seul lien, nom accessible = titre visible) ; extrait limité visuellement à 4 lignes (`line-clamp-4`), texte entier lu ; « Passage pertinent » visible (masqué aux lecteurs d'écran) et texte masqué « Passage pertinent : ». Lien construit seulement pour un UUID et des positions entières ordonnées.
- **Page Document** : `parsePassageOrigin` (`src/lib/passages.ts`) ; `DocumentReader` prop `origin` (`used` | `relevant`).
- **Tests** : 989 Vitest (dont `search-view`, `search-links`, `dashboard-search`) ; e2e `search-page.spec.ts` (parcours réel sur Supabase local avec un Document contrôlé : Passage au vecteur simulé de la Requête, supprimé après le test ; « organisation des congés {marqueur} » plutôt que le mini Jeu, pour un rang 1 déterministe et une Base commune propre). Le test 3.5 qui vérifiait l'absence du champ vérifie maintenant sa présence.
- **Prérendu** : `recherche.html` et `index.html` ne contiennent que la coquille (titre, navigation, lien d'évitement).
- **`epics.md`** : critère et tâche ajoutés à 5.2b (bouton « Poser la question à l'Assistant » et phrase complète de FR-15, ensemble).
- **Vérification** : 989 Vitest ; `lint`, `tsc`, `build:ci`, `check:secrets` verts ; e2e complets 285 réussis, 17 sautés, 0 échec.
- Pas de migration ni d'Edge Function : un push suffit, sans `deploy:supabase`.
