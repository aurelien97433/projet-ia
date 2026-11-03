---
name: NexaMind AI
description: Copilote documentaire interne de NexaWorks. shadcn/ui sur Next.js 16 + Tailwind 4 ; ce DESIGN.md ne décrit que la couche de marque ajoutée aux valeurs par défaut de shadcn. Mode clair uniquement.
status: final
updated: 2026-11-03
sources:
  - ../../prds/prd-projet-ia-2026-11-02/prd.md
  - ../../prds/prd-projet-ia-2026-11-02/addendum.md
colors:
  # Surcharges de la couche de marque. Les jetons shadcn non listés (popover, card, input…)
  # héritent de shadcn puis sont alignés sur les neutres ci-dessous.
  background: '#FFFFFF'
  surface: '#F7F8FA'
  border: '#E3E7EC'
  input-border: '#7B8794'
  foreground: '#1F2933'
  muted-foreground: '#52606D'
  primary: '#0E5A6B'
  primary-foreground: '#FFFFFF'
  primary-soft: '#E3F0F2'
  ring: '#0E5A6B'
  accent-text: '#92400E'
  accent-soft: '#FEF5E1'
  accent-line: '#F3D9A4'
  accent-mark: '#FDECC8'
  success: '#166534'
  success-soft: '#E8F5EC'
  destructive: '#B42318'
  destructive-soft: '#FDECEA'
  destructive-line: '#F5C2BD'
  pending: '#52606D'
  pending-soft: '#EEF1F4'
typography:
  # Geist Sans est déjà chargée par next/font dans src/app/layout.tsx.
  title:
    fontFamily: 'Geist Sans'
    fontSize: 20px
    fontWeight: '650'
    lineHeight: '1.3'
  title-sm:
    fontFamily: 'Geist Sans'
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1.4'
  body:
    fontFamily: 'Geist Sans'
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
  reading:
    fontFamily: 'Geist Sans'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.7'
  label:
    fontFamily: 'Geist Sans'
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
  caption:
    fontFamily: 'Geist Sans'
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px
spacing:
  # Échelle Tailwind (base 4 px) héritée ; jetons nommés ci-dessous.
  gutter-mobile: 16px
  gutter-desktop: 24px
  sidebar-width: 232px
  source-panel-width: 380px
  history-panel-width: 300px
  reading-max: 72ch
  content-max: 960px
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.lg}'
  button-secondary:
    background: '{colors.background}'
    foreground: '{colors.primary}'
    border: '{colors.input-border}'
    radius: '{rounded.md}'
  nav-item-active:
    background: '{colors.primary-soft}'
    foreground: '{colors.primary}'
    indicator: '3px {colors.primary}'
  source-chip:
    background: '{colors.accent-soft}'
    foreground: '{colors.accent-text}'
    border: '{colors.accent-line}'
    radius: '{rounded.md}'
  source-chip-selected:
    background: '{colors.accent-mark}'
    foreground: '{colors.accent-text}'
    border: '1px {colors.accent-text}'
  source-chip-deleted:
    background: '{colors.surface}'
    foreground: '{colors.muted-foreground}'
    border: '{colors.border}'
  citation-marker:
    background: '{colors.accent-soft}'
    foreground: '{colors.accent-text}'
    border: '{colors.accent-line}'
    radius: '{rounded.sm}'
  passage-highlight:
    background: '{colors.accent-mark}'
    foreground: '{colors.foreground}'
    border-left: '3px {colors.accent-text}'
  passage-highlight-inactive:
    background: '{colors.accent-soft}'
    foreground: '{colors.foreground}'
    border-left: '2px dashed {colors.accent-text}'
  refusal-block:
    background: '{colors.surface}'
    foreground: '{colors.foreground}'
    border: '{colors.border}'
    radius: '{rounded.lg}'
  status-badge-ready:
    background: '{colors.success-soft}'
    foreground: '{colors.success}'
    radius: '{rounded.full}'
  status-badge-processing:
    background: '{colors.pending-soft}'
    foreground: '{colors.pending}'
    radius: '{rounded.full}'
  status-badge-error:
    background: '{colors.destructive-soft}'
    foreground: '{colors.destructive}'
    radius: '{rounded.full}'
  error-alert:
    background: '{colors.destructive-soft}'
    border: '{colors.destructive-line}'
    title: '{colors.destructive}'
  focus-ring:
    color: '{colors.ring}'
    width: 2px
    offset: 2px
  question-bubble:
    background: '{colors.surface}'
    border: '{colors.border}'
    radius: '{rounded.xl}'
---

# NexaMind AI — Identité visuelle

## Brand & Style

NexaMind AI est un copilote professionnel, clair, calme et digne de confiance. Dès le premier regard, il doit paraître crédible et laisser toute la place au contenu : les Documents de NexaWorks et les réponses qui en sont tirées. La marque reste discrète. Un fond clair, un bleu pétrole pour orienter et agir, un ambre unique pour signaler « ceci vient d'un Document », et rien d'autre.

L'interface s'appuie sur les valeurs par défaut de shadcn/ui (Button, Card, Dialog, Sheet, Tabs, Select, Toast, Skeleton, Alert, Badge, DropdownMenu, Tooltip). Ce document ne fixe que la couche de marque : couleurs, typographie, rayons, et les composants propres à la confiance (Sources, Passage, refus, Statut de traitement). Les règles de comportement sont dans [EXPERIENCE.md](EXPERIENCE.md).

**Logo :** le texte « NexaMind AI » en `{typography.title-sm}`, couleur `{colors.primary}`, précédé d'un symbole discret de trois nœuds reliés par des traits fins (connaissances reliées). Le symbole est monochrome et à trait, sans remplissage ni dégradé.

## Colors

Tous les couples texte/fond ci-dessous ont été vérifiés au niveau AA des WCAG (NFR-7). Un comparatif des quatre pistes étudiées se trouve dans [mockups/color-themes.html](mockups/color-themes.html). La piste B a été retenue.

| Rôle | Jeton | Usage | Interdit | Contraste |
|---|---|---|---|---|
| Fond | `{colors.background}` | Fond des écrans et des panneaux | — | — |
| Surface | `{colors.surface}` | Barre latérale, bulles de question, bloc de refus | Cartes cliquables mises en avant | — |
| Texte | `{colors.foreground}` | Tout le texte courant (anthracite) | — | 14,76:1 sur fond |
| Texte secondaire | `{colors.muted-foreground}` | Métadonnées, aides, dates | Texte de plus de deux lignes | 6,46:1 sur fond ; 6,08:1 sur surface |
| Principale | `{colors.primary}` | Navigation active, boutons principaux, liens, focus | Sources, Passages, états | 7,80:1 (blanc dessus et sur fond) |
| Accent ambre | `{colors.accent-text}` · `{colors.accent-soft}` · `{colors.accent-line}` · `{colors.accent-mark}` | **Uniquement** les Sources, les renvois ¹ ² et le Passage mis en évidence | Boutons, alertes, décoration, survols | 7,09:1 texte ; 6,54:1 sur puce ; texte sur surlignage 12,65:1 |
| Succès | `{colors.success}` sur `{colors.success-soft}` | Statut *prêt*, confirmations | Décoration | 6,35:1 |
| Erreur | `{colors.destructive}` sur `{colors.destructive-soft}` | Statut *en erreur*, pannes, champs invalides, suppression | **Refus honnête de l'Assistant**, quota atteint | 5,75:1 |
| En cours | `{colors.pending}` sur `{colors.pending-soft}` | Statut *en cours de traitement* | — | 5,69:1 |

Éléments d'interface (WCAG 1.4.11, 3:1 minimum) : bordure de champ et de bouton secondaire `{colors.input-border}` à 3,66:1 sur le fond (3,45:1 sur la surface) ; anneau de focus `{colors.ring}` plein à 7,80:1 (6,69:1 sur une puce sélectionnée). L'anneau par défaut de shadcn (`ring-ring/50`, 50 % d'opacité) ne fait que 2,42:1 : il est remplacé partout par `{components.focus-ring}`, plein, de 2 px, décalé de 2 px (`ring-2 ring-ring ring-offset-2 ring-offset-background`), décalage obligatoire sur les éléments à fond `{colors.primary}`. `{colors.border}` est purement décoratif (séparateurs) et n'est jamais la seule limite d'un élément cliquable.

Règle de lecture : **bleu = j'agis, ambre = je vérifie, vert/rouge = état**. Un refus de l'Assistant ou un quota atteint n'est pas une erreur. Ces cas utilisent les neutres, jamais le rouge.

## Typography

Une seule famille : **Geist Sans**, déjà chargée par `next/font` dans `src/app/layout.tsx`. Pas de police à empattement ni de police décorative.

| Rôle | Jeton | Où |
|---|---|---|
| Titre d'écran | `{typography.title}` | En-tête de chaque écran, titre d'un Document |
| Sous-titre | `{typography.title-sm}` | Titres de panneaux, de cartes, logo |
| Texte courant | `{typography.body}` | Interface, messages de la Conversation |
| Lecture | `{typography.reading}` | Contenu d'un Document (page et panneau Source), limité à `{spacing.reading-max}` |
| Libellé | `{typography.label}` | Libellés de champs, boutons, entrées de navigation |
| Légende | `{typography.caption}` | Badges de Statut, compteur de caractères, métadonnées |

Pas de texte en dessous de 12 px. Pas de capitales sur plus de trois mots (seule exception : l'étiquette « Passage utilisé »).

## Layout & Spacing

L'échelle Tailwind (base 4 px) est reprise telle quelle. Les espacements sont généreux : 16 à 24 px entre les blocs, 8 à 12 px à l'intérieur d'un composant.

- **Ordinateur (≥ 1024 px) :** barre latérale fixe de `{spacing.sidebar-width}`, puis la zone de contenu. Dans l'Assistant, le panneau Source occupe `{spacing.source-panel-width}` à droite et le panneau Historique `{spacing.history-panel-width}` à gauche de la Conversation.
- **Tablette (768–1023 px) :** barre latérale repliée en menu, barre du haut globale (☰ · logo · « + ») ; les panneaux Source et Historique sont des `Sheet` modaux superposés à la Conversation.
- **Mobile (< 768 px, référence 375 px) :** marge `{spacing.gutter-mobile}`, une seule colonne, aucun défilement horizontal (NFR-6). Les panneaux passent en `Sheet` modaux plein écran. Tout texte long (titre, URL, Passage, puce) passe à la ligne (`overflow-wrap: anywhere`).

Largeur de contenu maximale : `{spacing.content-max}` pour les listes, `{spacing.reading-max}` pour le texte d'un Document.

## Elevation & Depth

Ombres légères héritées de shadcn (`shadow-sm`), utilisées seulement pour séparer un élément superposé : panneau Source, tiroir, menu, notification. Les écrans sont plats et structurés par des bordures fines `{colors.border}`. On n'ajoute pas d'ombre pour faire de la hiérarchie.

## Shapes

`{rounded.sm}` pour les renvois ¹ ², `{rounded.md}` pour les champs, puces de Source et boutons secondaires, `{rounded.lg}` pour les boutons principaux, cartes, blocs de refus et d'erreur, `{rounded.xl}` pour les bulles de question. `{rounded.full}` est réservé aux badges de Statut et à l'avatar. Bordures de 1 px partout, sauf : anneau de focus de 2 px décalé de 2 px ; bordure gauche pleine de 3 px du Passage actif ; bordure gauche pointillée de 2 px du Passage non actif.

## Components

Repris de shadcn sans modification visuelle : `Button` (variantes outline, ghost, destructive), `Input`, `Textarea`, `Select`, `Tabs`, `Dialog`/`AlertDialog`, `Sheet`, `Skeleton`, `Toast` (Sonner), `Tooltip`, `DropdownMenu`, `Table`, `Card`, `Alert`.

Composants de la couche de marque :

| Composant | Anatomie et rendu |
|---|---|
| **Bouton principal** (`button-primary`) | Fond `{colors.primary}`, texte blanc, `{rounded.lg}`. Sert à « + Ajouter », « Envoyer », « Enregistrer », « Importer » et « Se connecter ». Un seul par zone. |
| **Bouton secondaire** (`button-secondary`) | Fond blanc, texte `{colors.primary}`, bordure `{colors.input-border}` (3,66:1). Sert aux actions de suite (« Reformuler la question », « Historique », « Réessayer »…). |
| **Entrée de navigation active** (`nav-item-active`) | Fond `{colors.primary-soft}`, texte `{colors.primary}` en 600, barre de 3 px à gauche. Icône à trait de 16 px devant chaque entrée. |
| **Puce de Source** (`source-chip`) | « {n} · {titre du Document} », suivi de « · {k} Passages » en poids normal si plusieurs Passages du Document sont utilisés, en `{typography.label}`, fond `{colors.accent-soft}`, bordure `{colors.accent-line}`, texte `{colors.accent-text}`. Quand elle est sélectionnée (panneau ouvert sur elle, `source-chip-selected`) : fond `{colors.accent-mark}` et bordure de 1 px `{colors.accent-text}`, sans contour, pour laisser le contour au seul anneau de focus. |
| **Puce de Source supprimée** (`source-chip-deleted`) | « {titre} — Document supprimé », texte `{colors.muted-foreground}` barré, fond `{colors.surface}`, sans curseur main. |
| **Renvoi** (`citation-marker`) | Petit numéro en exposant après la phrase étayée, aux couleurs de l'accent. Il correspond au numéro de la puce de Source. |
| **Passage mis en évidence** (`passage-highlight`) | Fond `{colors.accent-mark}`, bordure gauche de 3 px `{colors.accent-text}`, précédé de l'étiquette « PASSAGE UTILISÉ » (ou « PASSAGE PERTINENT » dans la Recherche) en `{typography.caption}` couleur `{colors.accent-text}`. Le reste du Document reste lisible autour. |
| **Passage non actif** (`passage-highlight-inactive`) | Quand plusieurs Passages du même Document sont utilisés : les Passages non actifs ont un fond `{colors.accent-soft}` plus léger, une bordure gauche **pointillée** de 2 px `{colors.accent-text}` (7,09:1 sur le fond) et pas d'étiquette visible ; un texte masqué « Passage utilisé {j} sur {k} » les signale aux lecteurs d'écran. Le Passage actif garde le rendu `passage-highlight` (bordure pleine de 3 px) et son étiquette : la forme de la bordure et l'étiquette les distinguent, pas la couleur seule. Texte sur fond léger : 13,60:1. |
| **Navigation entre Passages** | Sous l'en-tête du panneau : « Passage {i} sur {k} » en `{typography.caption}` `{colors.muted-foreground}`, puis deux boutons secondaires compacts « ↑ Précédent » et « ↓ Suivant ». Absente quand il n'y a qu'un seul Passage. |
| **Bloc de refus** (`refusal-block`) | Fond `{colors.surface}`, bordure `{colors.border}`, `{rounded.lg}`, texte normal. Ni icône d'alerte ni rouge. Les boutons secondaires de suite sont placés dessous. |
| **Badge de Statut** | Pastille `{rounded.full}` en `{typography.caption}`, avec un symbole en plus de la couleur : « ● prêt » (`status-badge-ready`), « ◔ en cours de traitement » (`status-badge-processing`, l'icône tourne lentement sauf si `prefers-reduced-motion`), « ▲ en erreur » (`status-badge-error`). |
| **Bandeau de Statut** (page Document) | Pleine largeur sous l'en-tête, avec les couleurs du badge correspondant et son symbole, un message et l'action éventuelle (« Relancer le traitement », « Supprimer »). |
| **Alerte d'erreur** (`error-alert`) | Fond `{colors.destructive-soft}`, bordure `{colors.destructive-line}`, titre en `{colors.destructive}` 600, texte normal en `{colors.foreground}`, bouton « Réessayer ». |
| **Anneau de focus** (`focus-ring`) | Plein, 2 px, `{colors.ring}`, décalé de 2 px, sur tout élément interactif ; jamais l'opacité de 50 % de shadcn. |
| **Bulle de question** (`question-bubble`) | Alignée à droite, fond `{colors.surface}`, `{rounded.xl}` avec l'angle inférieur droit à 2 px, largeur max 75 %. Les réponses de l'Assistant n'ont pas de bulle : texte libre précédé de l'étiquette « Assistant » en `{colors.primary}`. |
| **Champ de question** | `Textarea` shadcn de 1 à 6 lignes (4 au plus à 375 px), bordure `{colors.input-border}`, bouton « Envoyer » intégré à droite, compteur « n / 2 000 » en légende. Au-delà de la limite : bordure et compteur en `{colors.destructive}`. |

Maquette de référence : [mockups/key-assistant.html](mockups/key-assistant.html). En cas d'écart, ce document prévaut.

## Do's and Don'ts

| À faire | À éviter |
|---|---|
| Réserver l'ambre aux Sources, aux renvois et aux Passages | Utiliser l'ambre pour un bouton, un survol, une alerte ou de la décoration |
| Bleu pétrole pour naviguer et agir | Plus d'une couleur principale ou des variantes de bleu décoratives |
| Toujours doubler une couleur d'état par un symbole ou un texte | Signaler un Statut par la couleur seule |
| Anneau de focus plein, 2 px, décalé | L'anneau semi-transparent par défaut de shadcn |
| Refus et quota atteint en neutres calmes | Rouge, icône d'alerte ou mot « erreur » pour un refus de l'Assistant |
| Fond clair, bordures fines, ombres légères | Dégradés violets, effets néon, verre dépoli, ombres marquées |
| Pictogrammes à trait simples (lucide, fourni avec shadcn) | Robots, cerveaux, étincelles « IA », illustrations futuristes |
| Animations fonctionnelles brèves (≤ 200 ms) et respect de `prefers-reduced-motion` | Animations décoratives, effets de frappe artificiels, confettis |
| Laisser de l'air autour du contenu | Surcharge : plus de deux niveaux de cartes imbriquées |
