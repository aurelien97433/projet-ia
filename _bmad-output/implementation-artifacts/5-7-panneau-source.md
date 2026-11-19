---
title: 'Story 5.7 : Panneau Source'
type: 'feature'
created: '2026-11-19'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0fb3afebe27168e981a4902e85c6437c2647c63f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-6-conversations-et-historique.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-4-validation-des-citations.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Une réponse de l'Assistant affiche ses puces de Source (5.4), mais elles ne s'ouvrent pas : pour vérifier une réponse, le Collaborateur doit quitter la Conversation et retrouver le Document lui-même, sans le Passage utilisé (FR-10, CH-6, « climax » de UJ-1). Les positions des Passages cités sont enregistrées (`message_sources.passages`), mais ni l'événement `done` ni le fil relu (5.6) ne les transmettent au navigateur.

**Approach:** Puce de Source → panneau E4a à droite (`aside` non modal ≥ 1024 px, `Sheet` modal en dessous, plein écran sous 768 px), qui affiche les métadonnées du Document et le Lecteur de Document (AD-8) avec les Passages utilisés mis en évidence, « Précédent » / « Suivant » s'il y en a plusieurs, et « Ouvrir la page complète » vers E7 avec les mêmes Passages. Les positions (`start`, `end`) et la `text_version` de chaque Source sont transmises avec la Source (Q1) ; le texte du Document est lu à l'ouverture par une route Next.js avec la session du Collaborateur. Report de la 3.4 traité : les `passage_id` d'une Source dont `document_id` est nul ne sont jamais relus.

## Boundaries & Constraints

**Always:**
- **Puce (UX-DR10)** : Source d'un Document existant = `button` (Entrée, Espace, clic), `aria-expanded`, `aria-controls` vers le panneau, nom accessible « Source {n} : {titre}, {k} Passages » (texte du catalogue de la 5.4) ; « sélectionnée » (fond `{colors.accent-mark}`) tant que le panneau la montre ; une autre puce remplace le contenu du panneau. Source supprimée (`document_id` nul) : texte simple, non focalisable, « {titre} — Document supprimé » (déjà en place).
- **Report de la 3.4 (passage_id)** : pour une Source dont `document_id` est nul, la lecture serveur (`get-conversation.ts`) et `chat` ne transmettent **ni** `passage_id`, **ni** positions, **ni** `text_version` : seuls le titre et le nombre de Passages. Jamais de requête sur `passages` à partir d'un `passage_id` de `message_sources` (le Lecteur n'utilise que `start`/`end`). Test unitaire et d'intégration (Source d'un Document supprimé : aucune position dans le fil).
- **Panneau E4a (UX-DR15)** : en-tête : titre (h2, focus à l'ouverture), Catégorie, Auteur, date d'ajout, Statut, ✕ « Fermer », lien « Ouvrir la page complète ». Défile jusqu'au premier Passage utilisé ; chaque Passage surligné précédé du texte masqué « Passage utilisé {j} sur {k} » ; plusieurs Passages : « Passage {i} sur {k} », « Précédent » / « Suivant » (`aria-live="polite"`, `aria-disabled` aux extrémités, focus conservé sur le bouton), comme la page Document (4.1b). Fermeture (✕, Échap) : focus rendu à la puce d'origine. ≥ 1024 px : `aside` non modal à droite, la Conversation reste visible et utilisable. < 1024 px : `Sheet` modal (fond inerte, focus piégé), plein écran sous 768 px, avec « ← Retour à la Conversation ». Un seul panneau à la fois : ouvrir une Source ferme l'Historique, et inversement (EXPERIENCE.md). `prefers-reduced-motion` : saut immédiat. 375 px : aucun défilement horizontal (`overflow-wrap: anywhere`).
- **Lecteur** : le Lecteur de Document existant (`document-reader.tsx`, `layoutPassages`, `PassageScroller`), un seul composant pour E4a et E7 ; texte brut, nœuds texte React, jamais `dangerouslySetInnerHTML` (AD-8).
- **Lecture du Document** : `GET /api/documents/[id]` (nouvelle) : session vérifiée, client Supabase de la session (RLS, jamais `service_role`), réponse `{ id, title, category, authorName, createdAt, status, textVersion, content }` via `get-document.ts` ; identifiant non UUID ou Document absent → 404 `NOT_FOUND` (forme AD-19), `no-store`. Chargement : squelettes + message des 10 s ; erreur : message + « Réessayer » ; 404 : « Ce Document a été supprimé. » **sans** « Réessayer », et la puce passe aussitôt au style supprimé (non cliquable) pour la suite de la visite.
- **Passages** : positions de la Source appliquées seulement si `textVersion` du Document = `text_version` de la Source (Q2) ; sinon, et si les positions sont invalides : Document affiché en entier, sans surlignage, avec « Le Passage cité n'a pas pu être retrouvé dans ce Document. Le Document est affiché en entier. » (catalogue existant).
- **« Ouvrir la page complète »** : `/documents/{id}?passages={s-e,…}&actif={i}` (format de la 4.1b, `parsePassageParams`) : la page E7 met en évidence les mêmes Passages, Passage actif conservé. Navigation réelle vérifiée en e2e.
- **Textes** : catalogue `texts.ts` ; textes d'EXPERIENCE.md déjà prévus (« Ouvrir la page complète », « Fermer », « ← Retour à la Conversation », « Passage utilisé », « Passage {i} sur {k} », « Ce Document a été supprimé. ») ; tout texte nouveau ajouté à EXPERIENCE.md dans le même commit.
- **Next.js 16** : lire `node_modules/next/dist/docs/` (route handlers, `params` asynchrones) avant d'écrire la route.
- **Tests** : unitaires (schémas avec positions, `get-conversation` sans position pour une Source supprimée, route `GET /api/documents/[id]`, panneau : états, clavier, focus, puce sélectionnée, suppression pendant l'ouverture, Q2) ; `chat` (positions et version dans `done` ; aucune pour une Source réinsérée avec `document_id` nul) ; e2e sur les deux largeurs, limités à 4 parcours (comme la 5.6) : ouvrir une Source au clavier puis Échap (focus rendu, puce sélectionnée, défilement jusqu'au Passage), deux Passages avec « Suivant », 375 px en `Sheet` plein écran avec « ← Retour à la Conversation » sans défilement horizontal, « Ouvrir la page complète » vers E7 avec les mêmes Passages ; Document supprimé avant et pendant l'ouverture, et Passage introuvable, couverts par les tests unitaires.
- **Revue** : un relecteur séparé (décision de l'utilisateur du 2026-11-19), centré sur le report `passage_id`, la route de lecture (exigences R1 à R5 ci-dessous), la cohérence positions/version, l'accessibilité du panneau (focus, `aria-expanded`, modal ou non selon la largeur) et la non-régression des flux 5.5 et 5.6.

**Ask First:** tout changement de la règle de quota ; toute écriture sur `message_sources` ; découpage de la story ; toute lecture du texte d'un Document ailleurs qu'à l'ouverture du panneau.

**Never:** `service_role` dans Next.js ; navigateur appelant une Edge Function ; relecture d'un `passage_id` d'une Source dont `document_id` est nul ; texte du Document interprété (Markdown, HTML) ; affichage « Document modifié » (FR-17, P1) ; modification du marqueur, des citations, du masquage en flux ou des délais de la 5.5 ; délai de test augmenté pour faire passer un test ; commit, déploiement ou push sans accord.

## Décisions de l'utilisateur (2026-11-19)

Spec approuvée en entier : **Q1 = A**, **Q2 = A**, **Q3 = A** ; découpage 5.7a / 5.7b seulement si nécessaire. Exigences ajoutées au périmètre du relecteur séparé, pour `GET /api/documents/[id]` :
- **R1** — lecture avec le client Supabase de la session du Collaborateur, **jamais** `service_role` ;
- **R2** — en-tête `Cache-Control: no-store` sur toutes les réponses (succès et erreurs) ;
- **R3** — **401** sans session (forme AD-19), sans aucune lecture ;
- **R4** — **404 neutre, identique** (statut et corps) pour un Document supprimé, inexistant ou un identifiant non UUID ;
- **R5** — vérification du code envoyé au navigateur par `check:secrets` (`build:ci`) : aucun secret, aucune clé `service_role` dans le bundle client du panneau.

## Questions à trancher avant le code (tranchées, voir ci-dessus)

- **Q1 — Transport des positions des Passages vers le navigateur.** **A (recommandé)** : chaque Source porte `passages: [{ start, end }]` et `textVersion` (seulement si `document_id` n'est pas nul) : dans l'événement `done` de `chat` (redéploiement de `chat`, `deploy:supabase` avant le push ; la page en ligne ignore ces clés, son schéma zod retirant les clés non déclarées) et dans le fil relu par `get-conversation.ts`. Le panneau n'a besoin que du texte du Document. B : nouvelle route par message (`/api/conversations/[id]/messages/[messageId]/sources/[n]`) qui relit `message_sources` à l'ouverture ; `chat` inchangé, mais l'événement `done` ne porte pas l'identifiant du message : il faudrait l'ajouter quand même, ou recharger le fil. A est plus simple et ne relit rien à l'ouverture.
- **Q2 — Document dont le texte a changé depuis la réponse** (`text_version` différente ; aujourd'hui seulement après un « Relancer le traitement », la modification étant P1). **A (recommandé)** : traité comme « Passage introuvable » (Document entier, message existant), les positions n'étant plus fiables. B : positions appliquées quand même (surlignage possiblement faux). Le message « Document modifié » reste P1 (FR-17).
- **Q3 — Rendu du Lecteur dans le panneau.** Le Lecteur est aujourd'hui rendu côté serveur (le texte n'est jamais transmis à un composant client), alors que le panneau s'ouvre dans la vue cliente de l'Assistant. **A (recommandé)** : le même composant rendu côté client dans le panneau, avec le texte lu par `GET /api/documents/[id]` (le texte reste un nœud texte React, AD-8 respecté ; le commentaire « composant serveur » du Lecteur est mis à jour). B : panneau rendu côté serveur (segment de route dédié ou Server Action renvoyant du RSC) : texte jamais en JSON, mais plus complexe, et l'`aside` non modal ne serait plus un simple état de la vue.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ouvrir une Source | puce « 1 · Procédure de facturation » | panneau à droite, métadonnées, Passage surligné à l'écran, focus sur le titre, puce `aria-expanded="true"` | — |
| Fermer | Échap ou ✕ | panneau fermé, focus sur la puce, `aria-expanded="false"` | — |
| Autre Source | clic sur la puce 2, panneau ouvert | contenu remplacé, puce 2 sélectionnée, puce 1 non | — |
| Plusieurs Passages | Source « · 2 Passages » | « Passage 1 sur 2 », « Suivant » fait défiler et annonce | extrémités `aria-disabled` |
| 375 px | ouverture | `Sheet` plein écran, « ← Retour à la Conversation », sans défilement horizontal | — |
| Page complète | « Ouvrir la page complète » | `/documents/{id}?passages=…&actif=i`, mêmes Passages | — |
| Supprimé avant | `document_id` nul | « {titre} — Document supprimé », non cliquable, aucune position transmise | — |
| Supprimé pendant | 404 à l'ouverture | « Ce Document a été supprimé. », sans « Réessayer » ; puce au style supprimé | `NOT_FOUND` |
| Passage introuvable | positions hors du texte | Document entier, message « Passage introuvable » | — |
| Texte modifié | `textVersion` ≠ version de la Source | comme « Passage introuvable » (Q2 = A) | — |
| Lecture en panne | 500 ou réseau | message + « Réessayer » | AD-19 |
| Historique ouvert | ouverture d'une Source | l'Historique se ferme | — |
| Ancienne réponse | Conversation d'avant la 5.7 rouverte | positions relues en base (Q1 = A), panneau identique | — |

</frozen-after-approval>

## Code Map

- `supabase/functions/chat/index.ts` -- Sources de l'événement `done` : `passages: [{ start, end }]`, `textVersion` (Q1 = A ; rien pour une Source réinsérée avec `document_id` nul).
- `src/lib/schemas/chat.ts` -- Source avec positions et version facultatives ; schéma de la réponse de `GET /api/documents/[id]`.
- `src/server/conversations/get-conversation.ts`, `src/lib/conversation-thread.ts` -- `ThreadSource` avec positions et version (Document existant seulement ; report `passage_id`).
- `src/app/api/documents/[id]/route.ts` (nouveau) -- lecture du Document, modèle : `src/app/api/documents/[id]/status/route.ts` ; `src/server/documents/get-document.ts` (lit déjà métadonnées, Statut effectif et `content_text` ; ajouter `text_version`, sans changer la page Document).
- `src/components/assistant/source-panel.tsx` (nouveau) -- `aside` / `Sheet`, en-tête, états, Lecteur ; `src/components/assistant/assistant-view.tsx` -- `SourceChip` en `button`, sélection, un seul panneau à la fois avec l'Historique.
- `src/components/documents/document-reader.tsx`, `passage-scroller.tsx` -- rendu côté client (Q3 = A), défilement dans le conteneur du panneau (déjà prévu par `PassageScroller`).
- `src/lib/passages.ts` -- construction de `?passages=…&actif=` pour « Ouvrir la page complète ».
- `src/lib/texts.ts`, EXPERIENCE.md si texte nouveau.
- Tests : `tests/unit/` (`assistant-view`, `chat-function`, `conversation-thread`, nouveaux `source-panel`, `document-route`) ; `tests/integration/chat.test.ts` (positions dans `done`) ; `tests/e2e/source-panel.spec.ts` (nouveau).

## Tasks & Acceptance

**Execution:**
- [x] `chat` : positions et version dans `done` + tests ; schémas.
- [x] Fil relu : positions et version, rien pour une Source supprimée (report `passage_id`) + tests.
- [x] `GET /api/documents/[id]` + tests.
- [x] Panneau E4a (`aside` / `Sheet`), puce `button`, sélection, Historique exclusif, Lecteur côté client.
- [x] États : chargement, erreur, supprimé pendant, Passage introuvable, texte modifié (Q2).
- [x] « Ouvrir la page complète » + e2e (4 parcours, deux largeurs).
- [x] Textes, EXPERIENCE.md si besoin ; deferred-work (report `passage_id` traité).

**Acceptance Criteria:**
- Given une réponse avec la Source « 1 · Procédure de facturation », when j'active la puce, then le panneau s'ouvre à droite (Conversation visible), avec titre, Catégorie, Auteur, date, Statut et « Ouvrir la page complète », défile jusqu'au Passage surligné, la puce est `aria-expanded="true"` et le focus est sur le titre du panneau.
- Given le panneau ouvert, when j'appuie sur Échap ou ✕, then il se ferme et le focus revient sur la puce.
- Given une largeur sous 1024 px (et 375 px), when j'ouvre une Source, then le panneau est un `Sheet` modal (plein écran sous 768 px) avec « ← Retour à la Conversation », sans défilement horizontal.
- Given « Ouvrir la page complète », when je l'active, then la page Document s'ouvre avec les mêmes Passages mis en évidence.
- Given une Source dont le Document a été supprimé, when la Conversation se charge, then la puce affiche « {titre} — Document supprimé », non cliquable, et aucune position ni `passage_id` n'est transmis ; si la suppression survient pendant l'ouverture, « Ce Document a été supprimé. » s'affiche sans « Réessayer ».
- Given un Passage introuvable (ou un texte modifié, Q2 = A), when le panneau s'ouvre, then le Document s'affiche en entier avec le message prévu.

## Design Notes

Ordre : `chat` et schémas d'abord (déployables seuls : la page en ligne ignore les clés nouvelles), puis fil relu, route, panneau, page complète. Partie la plus risquée : le Lecteur rendu côté client dans un conteneur défilant (`aside` ou `Sheet`), avec le défilement jusqu'au Passage actif, déjà prévu par `PassageScroller` (« conteneur défilant le plus proche (panneau Source) »). **Estimation : 5 à 6 h** de travail (calendrier : 5.7 prévue le 19/11 ; point de contrôle le 20/11 au soir). Si la journée ne suffit pas, découpage possible à proposer : 5.7a (panneau avec un Passage, page complète) puis 5.7b (plusieurs Passages, états de suppression).

Déploiement : commit → `deploy:supabase` par l'utilisateur (`chat`, sans migration) → Note de test « Prête » et q1 sur la page en ligne → push → `npm run test:chat:live` (non-régression, ≈ 0,09 $, compteur +15) → vérification en production → clôture.

## Verification

**Commands:**
- `npx supabase db reset` puis `npm test` (PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run check:secrets`, `npm run test:e2e` (d'un seul tenant) -- expected : vert.
- Après `deploy:supabase` et push : `npm run test:chat:live` (utilisateur) -- expected : 15 sur 15.

**Manual checks (production) :**
- q1 : ouvrir la puce « Procédure de facturation » : Passage « 5 jours ouvrés » surligné, focus sur le titre ; Échap rend le focus à la puce.
- Une Conversation de la 5.2b rouverte : le panneau s'ouvre aussi (positions relues en base).
- 375 px : `Sheet` plein écran, « ← Retour à la Conversation », sans défilement horizontal.
- « Ouvrir la page complète » : mêmes Passages sur la page Document.

## Implementation Notes

**2026-11-19 (implémentation, avant revue) :**
- `chat` : chaque Source d'un Document existant porte `passages: [{ start, end }]` (sans `passage_id`) et `textVersion` dans `done` et la réponse JSON ; rien de plus pour une Source réinsérée avec `document_id` nul. **Redéploiement de `chat` nécessaire** (`deploy:supabase`, sans migration) ; la page en ligne ignore les clés nouvelles.
- Fil relu : `toThreadSource` (`get-conversation.ts`) lit `text_version` et ne garde que `start`/`end` ; Document supprimé → titre et nombre de Passages seulement. Positions illisibles → liste vide (panneau : « Passage introuvable »).
- `GET /api/documents/[id]` (R1 à R4) ; `get-document.ts` lit `text_version` dans la même ligne que le texte (page Document inchangée).
- Panneau `source-panel.tsx` : `aside` non modal ≥ 1024 px (Échap global), `Sheet` modal en dessous (plein écran sous 768 px, « ← Retour à la Conversation »). Ouverture sur le premier Passage dans l'ordre du texte (« Passage 1 sur {k} », « Précédent » inactif), même si la réponse cite d'abord un Passage plus loin. `layoutPassages` renvoie désormais l'`index` de chaque Passage (navigation).
- **« Précédent » / « Suivant » dans le panneau seulement** : la page Document (E7) ne les a pas encore (UX-DR32, story 5.12, FINITION) ; elle reçoit les mêmes Passages et le Passage actif (`?passages=…&actif=i`), tous surlignés, l'actif distingué.
- Textes nouveaux (`texts.sourcePanel`), ajoutés à EXPERIENCE.md : « Ce Document n'a pas pu être chargé. » (erreur du panneau) et le nom accessible « Passages utilisés » du groupe de navigation.
- E2e : `tests/e2e/source-panel.spec.ts` (4 parcours, deux largeurs). Navigation côté client vers E7 : la page Assistant quittée reste montée et masquée (Cache Components), d'où `mark:visible` dans le test. `assistant.spec.ts` (5.4 : « aucune puce cliquable ») mis à jour.

## Review Triage Log

Relecteur séparé unique (décision de l'utilisateur du 2026-11-19, à la place des trois couches standard), 2026-11-19 : aucun bloquant ; axes 1 à 3 (R1 à R5, report `passage_id`, positions et version) jugés corrects, aucun secret dans `.next/static`.

| # | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|
| I1 | `Sheet` du panneau non plein écran entre 640 et 767 px | medium | `sheet.tsx` : `sm:max-w-sm` (côté droit) conservé par `cn` face à `max-w-none` (variantes différentes) ; 384 px au lieu de la largeur de l'écran. | patch (`sm:max-w-none`) |
| I1b | Même défaut dans le panneau Historique (`history-sheet.tsx`) | medium | même classe de base, présent depuis la 5.6. | defer (antérieur à la story) |
| I2 | Échap global (aside) : vole le focus du champ et fait défiler jusqu'à la puce ; Échap d'une composition IME ferme le panneau | medium | `source-panel.tsx` : écouteur `keydown` sur `document`, sans filtre `isComposing` ni test de l'emplacement du focus ; `focusSourceChip` sans `preventScroll`. | patch |
| M1 | Exception levée avant le `try` de la route : 500 sans `no-store` ni corps AD-19 (R2 « toutes les réponses ») | low | `requireUser()` et `await params` hors du `try` ; Next répond alors `Response(null, 500)`. | patch (gestionnaire entier dans le `try`) |
| M2 | Passage de < 1024 à ≥ 1024 px panneau ouvert : `onCloseAutoFocus` du Sheet démonté remet le focus sur la puce | low | déduit du démontage du `FocusScope` de Radix (appel différé de `onUnmountAutoFocus`), non reproduit ; garde triviale. | patch (rendre le focus seulement si `selection === null`) |
| M3a | « Ce Document a été supprimé. » inséré avec son texte dans une région `status` créée pleine : annonce non garantie | low | `source-panel.tsx` : `<p role="status">` monté avec le texte. | patch (région `status` montée vide dès l'ouverture, texte écrit ensuite) |
| M3b | Puce passée au style supprimé dans la région `status` atomique de la réponse : réponse entière relue | low | région `role="status"` du dernier échange (5.4/5.5) contenant les puces ; changer sa sémantique touche le flux de la 5.5. | defer |
| M4 | 401 dans le panneau : « Ce Document n'a pas pu être chargé. » + « Réessayer » en boucle | low | `source-panel.tsx` : seul le 404 est distingué ; le chat fait `router.refresh()` sur 401. | patch (`router.refresh()` sur 401) |
| M5 | Une position illisible vide toute la liste (fil relu) ou retire les paramètres du lien | low | inatteignable aujourd'hui : la base impose `start < end` sur `message_sources.passages` ; correctif plus large qu'une correction directe. | rejeté |
| M6 | `accountArea` (`tests/support/e2e-auth.ts`) cible `aside` : deux `aside` quand le panneau est ouvert | low | piège pour un futur test, correction directe d'un sélecteur. | patch (cibler l'`aside` qui contient la navigation) |
| M7 | Test « un seul panneau à la fois » annonce deux sens, n'en vérifie qu'un ; branche `if (historyOpen)` de `openSource` inatteignable (Historique modal) | low | `source-panel.test.tsx` ; l'Historique rend le fil inerte. | patch (intitulé du test ; branche gardée, défensive) |

**Vérification complète d'un seul tenant (2026-11-19, 13:55-14:04), après les correctifs de revue :** `db reset`, `npm test` (PowerShell : 94 fichiers, 1 849 tests), `lint`, `tsc`, `build:ci` (`check:secrets` : aucun secret dans le dépôt ni dans le code envoyé au navigateur, R5), e2e complet (371 passés, 19 ignorés par conception, 0 échec, dont `document-page` « chargement lent », échec isolé de la première passe non reproduit) : vert.
