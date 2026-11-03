---
title: Relecture indépendante — 375 px, clavier, accessibilité, textes
date: 2026-11-03
périmètre: DESIGN.md, EXPERIENCE.md, mockups/key-assistant.html, mockups/color-themes.html, PRD (NFR-5, NFR-6, NFR-7), .memlog.md
référentiel: WCAG 2.2 AA, NFR-5/6/7
---

# Relecture accessibilité, 375 px et textes

## Verdict global

**Favorable avec réserves : aucun constat bloquant, 12 importants et 21 mineurs.**

Le socle est solide : contrastes de texte tous conformes (vérifiés ci-dessous), couleur jamais seule pour les Statuts, refus distinct de la panne, gestion du focus prévue pour les panneaux, lien d'évitement, `aria-live` limité à la fin de la réponse, `prefers-reduced-motion`, cible de 375 px pensée écran par écran. UJ-1 à UJ-3 sont réalisables au clavier seul tels que décrits, à condition de lever les ambiguïtés A6 et A7.

Les réserves portent sur quatre zones :

- le champ de question à 375 px (clavier virtuel, Entrée sur mobile, IME, focus masqué) ;
- les débordements possibles dans la lecture d'un Document (Markdown, URL, titres) ;
- les états non perceptibles au lecteur d'écran ou en faible contraste : Passage non actif, renvois, puce sélectionnée, anneau de focus par défaut de shadcn ;
- l'absence totale d'espaces insécables dans un catalogue que les écrans « reprennent tels quels ».

### Contrastes recalculés (formule WCAG, node)

| Couple | Ratio | Seuil | Verdict |
|---|---|---|---|
| Texte `#1F2933` / fond · surface | 14,76 · 13,89 | 4,5 | OK |
| Secondaire `#52606D` / fond · surface · `primary-soft` · `pending-soft` · `accent-soft` | 6,46 · 6,08 · 5,54 · 5,69 · 5,95 | 4,5 | OK |
| Principale `#0E5A6B` / fond · surface · `primary-soft` ; blanc sur principale | 7,80 · 7,34 · 6,69 ; 7,80 | 4,5 | OK |
| Ambre `#92400E` / fond · puce · surlignage | 7,09 · 6,54 · 6,08 | 4,5 | OK |
| Texte / surlignage actif · fond léger (Passage non actif) | 12,65 · **13,60** (DESIGN annonce 14,9) | 4,5 | OK (valeur à corriger, A20) |
| Succès · Erreur · En cours sur leur fond | 6,35 · 5,75 · 5,69 | 4,5 | OK |
| Erreur `#B42318` / fond (compteur, bordure invalide) | 6,57 | 4,5 / 3 | OK |
| Bordure de champ `#7B8794` / fond | 3,66 | 3 | OK |
| Anneau `#0E5A6B` plein / fond · surface | 7,80 · 7,34 | 3 | OK |
| **Anneau shadcn par défaut `ring/50`** / fond · surface | **2,42 · 2,38** | 3 | **Échec** (A9) |
| **Contour puce sélectionnée (ambre) / anneau de focus (pétrole)** | **1,10** | distinction | **Indiscernables** (A9) |
| **Passage non actif : fond `accent-soft` / fond · bordure `accent-line` / fond** | **1,08 · 1,38** | 3 (1.4.11) | **Échec** (A8) |
| Bordure `{colors.border}` (bouton secondaire) / fond | 1,24 | — | Conforme WCAG (bouton à texte) mais contraire à la règle de DESIGN.md (A18) |
| État désactivé, opacité 0,55 : secondaire · principale | 2,41 · 2,71 | exempté (1.4.3) | Gênant pour un texte informatif (A19) |

---

## Constats bloquants

Aucun. Aucune lacune relevée n'empêche à elle seule NFR-6 ou NFR-7 sur UJ-1 à UJ-3, ni ne rend faux un texte d'un parcours principal. Plusieurs constats importants (A1, A3, A6, A8, A11) le deviendraient si le développement suivait la lettre actuelle des documents sans les corriger.

---

## Constats importants

### A1 · Champ de question : Entrée sur mobile, composition IME, Échap

- **Emplacement :** EXPERIENCE.md › Component Patterns › Champ de question ; Interaction Primitives (« Entrée envoie… Maj+Entrée va à la ligne ») ; catalogue Assistant (aide « Entrée pour envoyer · Maj + Entrée pour aller à la ligne »).
- **Problème :**
  1. Les claviers virtuels n'ont pas de Maj+Entrée : à 375 px, la règle actuelle interdit d'aller à la ligne, et l'aide affichée est fausse sur écran tactile.
  2. Rien n'interdit l'envoi pendant une composition de texte (IME, touches mortes sur macOS, saisie prédictive Android) : Entrée validerait la composition **et** enverrait la question.
  3. Échap « ferme le panneau ouvert » même quand le focus est dans le champ, alors qu'Échap annule aussi une composition IME.
- **Correction proposée :**
  - Sur pointeur grossier (`(pointer: coarse)`) ou sans clavier physique : Entrée va à la ligne, l'envoi se fait par « Envoyer ». L'aide est masquée sur mobile ou remplacée.
  - Ignorer Entrée et Échap si `event.isComposing` (ou `keyCode === 229`).
  - Pendant la génération, Entrée ne fait rien et ne vide pas le champ.
- **Décision produit touchée :** non (règle de spécification, pas de décision de l'utilisateur).

### A2 · Champ fixé en bas, clavier virtuel et focus masqué (WCAG 2.4.11)

- **Emplacement :** EXPERIENCE.md › E4 « 375 px : … champ fixé en bas » ; Responsive & Platform ; Accessibility Floor.
- **Problème :**
  - Le comportement avec le clavier virtuel n'est pas décrit. Avec `position: fixed`, iOS laisse le champ sous le clavier ou fait sauter la page.
  - Un champ de 6 lignes, avec l'aide et le compteur, peut occuper plus de la moitié des quelque 300 px visibles.
  - Au clavier physique (tablette, zoom 200 %), les puces de Source et les boutons du refus passent sous le champ fixé : c'est le critère 2.4.11 (Focus Not Obscured, AA).
- **Correction proposée :**
  - Ajouter `interactive-widget=resizes-content` au viewport, ou s'appuyer sur `visualViewport`.
  - À 375 px, limiter le champ à 4 lignes et masquer l'aide.
  - Ajouter `scroll-padding-bottom` égal à la hauteur du champ, et `scroll-padding-top` égal à la barre du haut, sur la zone qui défile.
  - Critère de recette : « tout élément qui reçoit le focus reste entièrement visible ».
- **Décision produit touchée :** non.

### A3 · Débordements horizontaux dans la lecture d'un Document, les Sources et la Conversation

- **Emplacement :** EXPERIENCE.md › E7 375 px (« les longues URL sont coupées ») ; Lecteur de Document ; E5 ; puces de Source ; bulle de question ; DESIGN.md › Layout.
- **Problème :**
  - Seul E7 traite les URL. Le Lecteur est pourtant partagé avec E4a, et les autres foyers de débordement ne sont pas couverts : titres longs sans espace, URL dans une question ou une réponse, puces de Source, Passages dans les cartes de Recherche.
  - Surtout, rien ne dit si un `.md` est rendu en Markdown. Les tableaux et blocs de code d'un `.md` du Jeu de démonstration provoqueraient un défilement horizontal de la page, ce qui fait échouer le critère vérifiable NFR-6 (« lecture d'un Document »).
- **Correction proposée :**
  - Règle globale : `overflow-wrap: anywhere` sur le texte du Lecteur, les titres, les puces, les bulles, les réponses et les cartes ; `min-width: 0` sur les éléments flex et grid.
  - Décider le rendu des `.md`. S'il est en Markdown, chaque `table` et chaque `pre` est placé dans un conteneur `overflow-x: auto` focalisable (`tabindex="0"`, rôle `region`, nom accessible). Le défilement reste interne au bloc, ce qu'autorise le critère 1.4.10, et la page ne défile jamais horizontalement.
  - Ajouter un Document de test « piège à 375 px » (URL de 120 caractères, tableau de 5 colonnes) au Jeu de démonstration.
- **Décision produit touchée :** non (sauf si le rendu Markdown n'était pas prévu : décision d'architecture).

### A4 · Barre du haut de l'Assistant à 375 px : contenu contradictoire, « + » sans nom, « Nouvelle Conversation » absente

- **Emplacement :**
  - EXPERIENCE.md › Responsive (« ☰, logo, « + » (Ajouter) ») ;
  - E4 375 px (« ☰, logo, « Historique » ») ;
  - Component Patterns › Bouton « + Ajouter » (« barre du haut sur mobile ») ;
  - maquette, vue mobile (☰, logo, Historique, sans « + »).
- **Problème :** trois versions différentes de la même barre.
  - Le bouton « + » n'a pas de nom accessible dans le catalogue (seul ☰ en a un).
  - « + Nouvelle Conversation » n'a pas de place à 375 px. Une fois dans une Conversation, l'utilisateur mobile ne peut en démarrer une autre qu'en passant par le menu, sans garantie que « Assistant » ouvre l'état vide.
- **Correction proposée :**
  - Fixer la barre de E4 à 375 px : ☰ · logo · « Historique » · bouton icône « + » de nom accessible « Nouvelle Conversation ». « Ajouter un Document » reste dans le menu.
  - Sinon, garder « + » (Ajouter) avec le nom accessible « Ajouter un Document » et placer « Nouvelle Conversation » en tête du panneau Historique.
  - Ajouter les noms accessibles au catalogue.
  - Préciser que l'entrée « Assistant » du menu ouvre l'état vide.
- **Décision produit touchée :** oui, partiellement : la décision « + Ajouter toujours visible » (memlog, Component Patterns) entre en tension avec la place disponible à 375 px.

### A5 · Panneaux plein écran et superposés : modalité et focus non spécifiés

- **Emplacement :** EXPERIENCE.md › Panneau Source (E4a), Panneau Historique (E4b), Interaction Primitives › Gestion du focus.
- **Problème :**
  - À 375 px, le panneau Source et l'Historique couvrent l'écran, mais rien ne rend l'arrière-plan `inert`. Tab peut atteindre le champ fixé et le fil, cachés sous le panneau, et le lecteur d'écran les lit.
  - Pour l'Historique, la cible du focus à l'ouverture n'est pas précisée (titre ? Conversation active ?).
  - Après le choix d'une Conversation, la règle générale (« le focus revient sur l'élément qui l'a ouvert », soit « Historique ») contredit la décision « saisie immédiatement disponible » (memlog, Historique).
  - La place de l'Historique dans le DOM n'est pas fixée : visuellement à gauche, il risque d'être placé après le champ dans l'ordre de tabulation.
- **Correction proposée :**
  - Sous 1024 px, les deux panneaux sont des `Sheet` modaux (Radix `Dialog` : `aria-modal`, piège de focus, arrière-plan inerte).
  - Sur ordinateur, le panneau Source reste un `aside` non modal (décision conservée).
  - Historique : focus à l'ouverture sur la Conversation active, sinon sur la première. Après un choix, focus dans le champ de question. Le panneau est inséré dans le DOM avant le fil.
- **Décision produit touchée :** non (précise la décision « saisie immédiatement disponible »).

### A6 · Boutons qui deviennent inactifs sous le focus : perte du focus dans UJ-1 et UJ-2

- **Emplacement :** EXPERIENCE.md › Panneau Source (« le focus reste sur le bouton actionné … aux extrémités, le bouton concerné est inactif ») ; Champ de question (« Envoyer » inactif pendant la génération) ; E1 (« Connexion… », inactif) ; E7 (« Génération du Résumé… ») ; E8 (« Enregistrement… »).
- **Problème :**
  - Dans UJ-1, le Document a 2 Passages. « Suivant » amène au Passage 2 et devient aussitôt inactif alors qu'il a le focus. Avec l'attribut `disabled`, le focus tombe sur `body` au moment du climax, juste avant « Elle ferme le panneau (Échap) ». La règle dit « inactif » sans préciser le mécanisme ; la maquette utilise `aria-disabled`.
  - Le même cas se produit pour tout bouton qui passe en chargement après une activation au clavier (« Générer le Résumé » dans UJ-2, « Envoyer » si on le déclenche par Tab puis Entrée).
  - Dans UJ-2, la fin de génération du Résumé n'est ni annoncée ni accompagnée d'un déplacement du focus.
- **Correction proposée :**
  - Règle générale : un bouton qui devient inactif alors qu'il a le focus utilise `aria-disabled="true"` (il reste focalisable et l'activation est ignorée), jamais `disabled`.
  - « Précédent » et « Suivant » : `aria-disabled` aux extrémités.
  - Résumé : annoncer « Résumé généré. » (`aria-live="polite"`) et laisser le focus sur le bouton, ou le placer sur le titre du bloc Résumé (`tabindex="-1"`).
  - Échec : focus sur l'alerte (déjà prévu).
- **Décision produit touchée :** non.

### A7 · Ordre de tabulation : « Tab parcourt les puces de Source de la dernière réponse » est faux

- **Emplacement :** EXPERIENCE.md › E4 › Clavier ; Key Flows UJ-1 étape 5.
- **Problème :**
  - Le champ de question est placé après le fil dans le DOM et visuellement. Depuis le champ, Tab va vers « Envoyer », puis vers le panneau ou la fin de page. Les puces de la dernière réponse s'atteignent par **Maj+Tab**.
  - Pour satisfaire la phrase telle qu'écrite, un développeur risque de placer le champ avant le fil dans le DOM, ce qui casserait l'ordre de lecture (critères 1.3.2 et 2.4.3).
- **Correction proposée :**
  - Réécrire : « Maj+Tab depuis le champ remonte vers les puces de Source de la dernière réponse ; l'ordre du DOM suit l'ordre visuel (fil, puis champ) ».
  - Optionnel : le lien d'évitement ou un repère `nav` « Sources de la dernière réponse ».
  - Faire suivre UJ-1 au clavier pendant la recette.
- **Décision produit touchée :** non.

### A8 · Passage non actif : contraste insuffisant et invisible au lecteur d'écran

- **Emplacement :** DESIGN.md › `passage-highlight-inactive` et Components › Passage non actif ; EXPERIENCE.md › Panneau Source ; maquette `mark.off`.
- **Problème :**
  - Le Passage non actif ne se distingue du texte normal que par un fond à 1,08:1 et une bordure gauche à 1,38:1 par rapport au fond. Cela échoue au critère 1.4.11 (3:1), et l'information repose sur la couleur seule (1.4.1). Seul le Passage *actif* a une étiquette.
  - `mark` n'est pas restitué par la plupart des lecteurs d'écran. Un utilisateur aveugle ne sait pas que le texte J+45 est un Passage utilisé, ni où il se trouve avant d'avoir appuyé sur « Suivant ».
- **Correction proposée :**
  - Bordure gauche du Passage non actif en `{colors.accent-text}`, pointillée ou de 2 px (7,09:1), qui la distingue de la bordure pleine de 3 px de l'actif.
  - Ou étiquette discrète « Passage utilisé {j} » en `{colors.muted-foreground}`.
  - Dans tous les cas, texte masqué « Début du Passage utilisé {j} sur {k} » / « Fin du Passage » autour de chaque Passage.
- **Décision produit touchée :** oui, à la marge : rendu validé au « Trou C » (memlog). Le principe « actif distinct des non actifs » est conservé.

### A9 · Anneau de focus : défaut shadcn non conforme et confusion avec la puce sélectionnée

- **Emplacement :** DESIGN.md › Colors (« anneau de focus `{colors.ring}` à 7,80:1 ») et Shapes (2 px) ; EXPERIENCE.md › Accessibility Floor ; DESIGN.md › Puce de Source (« sélectionnée : contour de 2 px `{colors.accent-text}` »).
- **Problème :**
  1. Les composants shadcn actuels (Tailwind 4) appliquent par défaut `focus-visible:ring-[3px] ring-ring/50`. À 50 % d'opacité, l'anneau pétrole vaut 2,42:1 sur fond blanc et 2,38:1 sur la surface : il échoue au critère 1.4.11. DESIGN annonce 7,80:1 sans exiger de retirer cette opacité. Point à vérifier à l'installation de shadcn.
  2. Sur le bouton principal, un anneau collé au bouton (sans décalage) est de la même couleur que son fond (1:1) : il n'élargit visuellement que la forme.
  3. La puce sélectionnée porte un contour ambre de 2 px. Le focus y ajoute un contour pétrole de même épaisseur, et les deux couleurs ont 1,10:1 entre elles. Quand le focus revient sur la puce à la fermeture du panneau, ou si on y tabule pendant que le panneau est ouvert, focus et sélection sont indiscernables.
- **Correction proposée :**
  - Imposer l'anneau plein : `ring-2 ring-ring ring-offset-2 ring-offset-background`, sans `/50`, sur tous les composants.
  - Décalage obligatoire sur les éléments à fond `primary`.
  - Pour la puce sélectionnée : fond `{colors.accent-mark}` et bordure `{colors.accent-text}` de 1 px au lieu d'un contour, ce qui laisse le contour au seul focus.
- **Décision produit touchée :** non (jetons inchangés).

### A10 · Renvois et puces de Source : noms accessibles et état sélectionné

- **Emplacement :** EXPERIENCE.md › Renvoi ¹ ², Puce de Source ; DESIGN.md › Renvoi, Puce de Source.
- **Problème :**
  - Le renvoi est un `sup` contenant « 1 ». Un lecteur d'écran lit « …15 jours après l'échéance 1 » : le chiffre se confond avec le texte (« J+45 1 ») et ne dit pas qu'il s'agit d'une Source.
  - La puce « 1 · Procédure de facturation · 2 Passages » est lue « 1 point Procédure… point 2 Passages ».
  - L'état « sélectionnée » n'est exposé que visuellement (critères 1.3.1 et 4.1.2).
  - « Lien cliquable » qui ouvre un panneau : c'est un bouton du point de vue sémantique, sauf s'il pointe réellement vers `/documents/{id}`.
- **Correction proposée :**
  - Renvoi : `<sup><span class="sr-only">Source </span>1</sup>`, ou `aria-label="Source 1"` sur un élément avec rôle.
  - Puce : nom accessible « Source 1 : Procédure de facturation, 2 Passages ». Les points médians sont en `aria-hidden`.
  - Implémenter la puce en `button` avec `aria-expanded` et `aria-controls` vers le panneau. Si l'on garde un lien vers E7 (repli sans JS, clic du milieu), utiliser `aria-current="true"` quand la puce est sélectionnée.
- **Décision produit touchée :** non (H13 inchangée).

### A11 · Libellés de champ : règle contradictoire et champs sans libellé défini

- **Emplacement :**
  - EXPERIENCE.md › Accessibility Floor (« chaque champ a un `<label>` visible » puis « Votre question », masqué visuellement) et Formulaire (« libellé visible ») ;
  - catalogue Tableau de bord (« champ « Rechercher dans les Documents… » ») ;
  - Bibliothèque (« Rechercher un titre », « Toutes les Catégories », « Plus récents d'abord ») ;
  - Recherche (« Votre recherche »).
- **Problème :**
  - La règle se contredit, et plusieurs champs n'ont qu'un texte qui ressemble à une indication (points de suspension, valeur par défaut) sans libellé désigné. Le champ du Tableau de bord est la première étape d'UJ-3 au clavier.
  - Les listes Catégorie et Tri de la Bibliothèque n'ont pas de libellé : « Toutes les Catégories » est une *valeur*.
  - Un texte indicatif qui disparaît à la saisie n'est pas un libellé (3.3.2), et NFR-7 exige un libellé pour chaque champ.
- **Correction proposée :**
  - Écrire la règle : « libellé visible, sauf champs de saisie unique accompagnés d'un bouton explicite (question, Recherche), qui ont un libellé masqué et un texte indicatif ».
  - Donner au catalogue un libellé par champ :
    - Tableau de bord : « Rechercher dans les Documents » (masqué) avec le bouton ou l'icône « Rechercher » ;
    - Recherche : « Votre recherche » visible ;
    - Bibliothèque : « Rechercher un titre » visible, « Catégorie », « Trier par » ;
    - champ en quota : la raison « Limite quotidienne atteinte » reliée par `aria-describedby`, pas seulement en texte indicatif.
- **Décision produit touchée :** non.

### A12 · Typographie française : aucune espace insécable dans le catalogue de référence

- **Emplacement :** EXPERIENCE.md › Textes clés (178 occurrences « espace + ? ! ; »), DESIGN.md, maquette. Aucun U+00A0 ni U+202F dans les trois fichiers (vérifié).
- **Problème :**
  - Le catalogue « fait référence : les écrans reprennent ces textes tels quels ».
  - Copiés avec des espaces ordinaires, ils produiront à 375 px des « ? » et des « : » orphelins en début de ligne (« Que voulez-vous savoir ? », « Supprimer « {titre} » ? », guillemets ouvrants séparés de leur mot) et des nombres coupés (« 2 / 2 » puis « 000 » à la ligne, « 10 » puis « Mo », « 0 h » puis « 00 »).
- **Correction proposée :**
  - Ajouter au guide de contenu la règle « espace fine insécable (U+202F) avant ; ! ? et à l'intérieur des « », espace insécable (U+00A0) avant : et dans les nombres et unités (2 000, 10 Mo, 0 h 00, J+15) ».
  - En développement : centraliser les textes dans un fichier de messages et appliquer une fonction de typographie, ou saisir les caractères directement. Contrôle à la recette.
- **Décision produit touchée :** non.

---

## Constats mineurs

### A13 · Annonces `aria-live` : mise en œuvre et volume

- **Emplacement :** EXPERIENCE.md › Réponse de l'Assistant, Accessibility Floor › Annonces, E6 Succès, Badge de Statut.
- **Problème :**
  - L'intention (« n'annoncer la réponse qu'une fois terminée ») est bonne mais pas outillée. Si le fil ou le message porte `aria-live`, chaque fragment sera lu. Lire ensuite une longue réponse d'un bloc dans une région `polite` est aussi pénible.
  - L'état neutre et le bloc de refus ne sont pas cités parmi les annonces.
  - Le nombre de Documents de la Bibliothèque serait annoncé à chaque frappe (filtre après 250 ms).
  - Les changements de Statut de tous les Documents (Tableau de bord, Bibliothèque) seraient annoncés, même ceux des autres Collaborateurs.
- **Correction proposée :**
  - Fil sans `aria-live`. Le message en cours porte `aria-busy="true"`.
  - Une région masquée dédiée annonce « Recherche dans les Documents… », puis « Réponse de l'Assistant terminée, {n} Sources » ou le texte du refus. Le contenu se lit ensuite en naviguant.
  - Compteur de la Bibliothèque annoncé après 1 s d'inactivité.
  - Statut annoncé seulement sur E7 et pour les Documents dont le Collaborateur est l'Auteur.
- **Décision produit touchée :** non.

### A14 · Navigation entre Passages pour le lecteur d'écran

- **Emplacement :** EXPERIENCE.md › Panneau Source ; DESIGN.md › Navigation entre Passages, Passage mis en évidence ; maquette `.pnav`, `.passlabel`.
- **Problème :**
  - Seul « Passage {i} sur {k} » est annoncé ; le texte du Passage ne l'est pas, et l'utilisateur doit le chercher.
  - Les noms « Précédent » et « Suivant » sont vagues hors contexte.
  - « PASSAGE UTILISÉ » doit être obtenu par CSS (`text-transform`), sinon certains lecteurs épellent.
  - À 375 px, la barre de navigation disparaît en défilant.
- **Correction proposée :**
  - Annoncer « Passage {i} sur {k} : {premiers mots du Passage}… ».
  - Noms accessibles « Passage précédent » et « Passage suivant ».
  - Étiquette saisie en minuscules et mise en capitales par CSS.
  - En-tête du panneau (ou barre de navigation des Passages) collant en plein écran.
- **Décision produit touchée :** non.

### A15 · Focus après navigation SPA et annonceur de Next.js

- **Emplacement :** EXPERIENCE.md › Interaction Primitives › Gestion du focus ; Accessibility Floor › Structure ; maquette (titre de Conversation en `h2`).
- **Problème :**
  - Next.js annonce déjà chaque changement de route : `app-router-announcer.js` lit `document.title`, sinon le premier `h1` (vérifié dans `node_modules`). Déplacer en plus le focus sur le `h1` provoque une double annonce.
  - Le `h1` de E4 avec une Conversation active n'est pas défini : la maquette met le titre en `h2`, sans `h1`.
  - Il n'est pas dit que le `h1` reçoit `tabindex="-1"`.
  - Les `title` de page ne sont pas spécifiés (critère 2.4.2).
- **Correction proposée :**
  - Définir un `document.title` unique par écran, au format « {Écran} · NexaMind AI » (avec le titre du Document ou de la Conversation).
  - `h1` en `tabindex="-1"`. Sur E4, le `h1` est le titre de la Conversation, ou « Que voulez-vous savoir ? ».
  - Accepter la double annonce, ou ne déplacer le focus que sur le champ principal.
- **Décision produit touchée :** non.

### A16 · Puce de Source supprimée : `aria-disabled` inopérant et numéro perdu

- **Emplacement :** EXPERIENCE.md › Puce de Source (« texte non focalisable (`aria-disabled`) ») ; DESIGN.md › `source-chip-deleted` ; maquette (« FAQ comptabilité — Document supprimé », sans numéro).
- **Problème :**
  - `aria-disabled` n'a pas d'effet sur un élément sans rôle interactif (ARIA 1.2 ne l'autorise pas sur `generic`).
  - Le numéro disparaît, alors que le renvoi ² du texte y renvoie toujours.
- **Correction proposée :**
  - Texte simple sans `aria-disabled`, de la forme « 2 · {titre} — Document supprimé », le mot « supprimé » étant déjà dans le texte.
  - Aligner le catalogue et DESIGN.md.
- **Décision produit touchée :** non (FR-12 respecté).

### A17 · Glyphes lus à voix haute et noms en double

- **Emplacement :** catalogue (« + Ajouter », « + Nouvelle Conversation », « ← Retour à la Conversation », « ↑ Précédent », « ↓ Suivant », « Ouvrir la page complète ↗ ») ; badges « ● prêt », « ◔ … », « ▲ … » ; « · » ; deux boutons ✕ « Fermer » (Source et Historique).
- **Problème :** les lecteurs d'écran prononcent « plus », « flèche vers le haut », « cercle noir », « triangle noir ». Deux boutons « Fermer » sont ambigus dans une liste de contrôles. « ↗ » suggère un nouvel onglet.
- **Correction proposée :**
  - Glyphes en icônes lucide `aria-hidden`.
  - Noms « Fermer le panneau Source » et « Fermer l'Historique ».
  - Retirer ↗ si le lien s'ouvre dans le même onglet, sinon ajouter « (nouvel onglet) ».
  - ☰ avec `aria-expanded`.
- **Décision produit touchée :** non.

### A18 · Bouton secondaire : bordure à 1,24:1 contraire à la règle de DESIGN.md

- **Emplacement :** DESIGN.md › `button-secondary` (bordure `{colors.border}`) contre Colors (« `{colors.border}` … n'est jamais la seule limite d'un élément cliquable »).
- **Problème :** le bouton secondaire est délimité uniquement par `{colors.border}`. WCAG le tolère (le texte pétrole identifie le bouton), mais DESIGN.md se contredit.
- **Correction proposée :** bordure `{colors.input-border}` (3,66:1) pour les boutons secondaires, ou amender la règle (« … sauf boutons à texte »).
- **Décision produit touchée :** non.

### A19 · État désactivé par opacité 0,55

- **Emplacement :** maquette `.disabled{opacity:.55}` (champ en quota, « Précédent », « Envoyer »).
- **Problème :** exempté par le critère 1.4.3, mais « Limite quotidienne atteinte » devient informatif à 2,41:1.
- **Correction proposée :** pour l'état désactivé, garder le texte à `{colors.muted-foreground}` (6,46:1) sur `{colors.surface}` et réduire seulement la bordure. La raison reste lisible.
- **Décision produit touchée :** non.

### A20 · Valeurs et tailles inexactes dans DESIGN.md et la maquette

- **Emplacement :** DESIGN.md › Passage non actif (« 14,9:1 ») ; maquette (`.badge`, `.passlabel`, `sup.ref` à 11 px).
- **Problème :** le ratio réel est 13,60:1. Le texte de 11 px contredit « Pas de texte en dessous de 12 px ».
- **Correction proposée :** corriger la valeur. 12 px minimum dans la maquette.
- **Décision produit touchée :** non.

### A21 · Reflow : 375 px et zoom 200 % ne couvrent pas le critère 1.4.10

- **Emplacement :** EXPERIENCE.md › Accessibility Floor › Zoom.
- **Problème :** le critère 1.4.10 (AA) demande 320 px CSS, soit un zoom de 400 % sur un écran de 1280 px. L'objectif « WCAG 2.2 AA » affiché n'est donc pas couvert.
- **Correction proposée :** tester aussi à 320 px. La mise en page mobile devrait tenir avec la marge de 16 px.
- **Décision produit touchée :** non (NFR-6 reste à 375 px).

### A22 · Contradictions de comportement responsive des panneaux

- **Emplacement :**
  - EXPERIENCE.md › Panneau Source (« Sous 1024 px, le panneau passe en plein écran »), contre Responsive (768–1023 px : « se superpose à la Conversation ») et DESIGN.md › Tablette ;
  - Panneau Historique (« se superpose à gauche … sur mobile »), contre E4 375 px (« en plein écran ») ;
  - le texte de retour de l'Historique en plein écran n'est pas défini.
- **Correction proposée :**
  - Plein écran sous 768 px, superposé entre 768 et 1023 px, pour les deux panneaux.
  - Ajouter « ← Retour à la Conversation » à l'Historique en plein écran.
- **Décision produit touchée :** non.

### A23 · Titres tronqués sur une ligne

- **Emplacement :** maquette `.head h2`, `.hm-r span`, `.hist-r span` (`white-space: nowrap; text-overflow: ellipsis`).
- **Problème :** à 375 px, les titres de Conversation qui commencent pareil (« Comment je relance… ») deviennent indiscernables dans l'Historique.
- **Correction proposée :** limiter à 2 lignes (`line-clamp: 2`) dans l'Historique. En-tête : 1 ligne acceptable, le titre complet restant dans le DOM.
- **Décision produit touchée :** non.

### A24 · Focus automatique dans un champ sur mobile

- **Emplacement :** E3 (H10), E4 (nouvelle Conversation), E5.
- **Problème :** sur Android, la mise au point automatique ouvre le clavier virtuel à l'arrivée et cache la moitié de l'écran, dont les listes du Tableau de bord.
- **Correction proposée :** pas de mise au point automatique d'un champ sur pointeur grossier ; focus sur le `h1` à la place.
- **Décision produit touchée :** non (H10 précisée).

### A25 · Carte de Recherche entièrement en lien

- **Emplacement :** EXPERIENCE.md › Résultat de Recherche (« Toute la carte est un seul lien »).
- **Problème :** le nom du lien contient le titre, la Catégorie et tout le Passage, ce qui est très long à l'écoute et dans une liste de liens.
- **Correction proposée :** même modèle que la Bibliothèque. Le lien est le titre, étendu à toute la carte par un pseudo-élément, et le Passage reste du texte. Un arrêt de tabulation par carte, conservé.
- **Décision produit touchée :** non.

### A26 · Formulaires d'accès

- **Emplacement :** E1, E2, catalogue Connexion ; barre latérale (« Se déconnecter »).
- **Problème :**
  - `autocomplete` n'est pas prévu (critère 1.3.5 AA : `email`, `current-password`, `new-password`).
  - Le collage et les gestionnaires de mots de passe ne sont pas garantis (3.3.8 AA).
  - Le bouton d'affichage s'appelle « Afficher » en E2 et « Afficher le mot de passe » dans le catalogue, et son état n'est pas exposé.
  - « Se déconnecter » est décrit comme un lien alors que c'est une action.
- **Correction proposée :**
  - Ajouter les attributs `autocomplete` et autoriser le collage.
  - Libellé unique « Afficher le mot de passe », avec `aria-pressed` (ou bascule vers « Masquer le mot de passe », déjà au catalogue).
  - « Se déconnecter » en `button`.
- **Décision produit touchée :** non.

### A27 · Majuscules du Glossaire : « Créer un compte » et liste incomplète

- **Emplacement :** EXPERIENCE.md, catalogue Connexion (« Créer un compte ») et E1 › Composants (lien « Créer un compte »), contre « Créer votre Compte », « Créer mon Compte », « J'ai déjà un Compte » ; Voice and Tone, règle 4.
- **Problème :**
  - « compte » s'écrit en minuscule sur E1 seulement, alors que « Compte » est un terme du Glossaire (PRD §3).
  - La règle 4 omet des termes du Glossaire employés à l'écran : Compte, Collaborateur, Auteur, Requête, Fichier importé.
- **Correction proposée :**
  - « Créer un Compte ».
  - Compléter la liste de la règle 4.
  - Préciser que « Compte rendu client » (nom de Catégorie) n'est pas le terme « Compte ».
- **Décision produit touchée :** non.

### A28 · Écarts de textes entre la maquette et le catalogue

- **Emplacement :** `mockups/key-assistant.html` contre EXPERIENCE.md › Textes clés.

| Maquette | Catalogue |
|---|---|
| « Passage utilisé · 1 sur 2 » (étiquette) | « Passage utilisé » (le compteur est séparé) |
| « La Recherche sémantique reste disponible. » | « La Recherche reste disponible. » |
| Vue mobile : « Posez une question… » | « Posez une question sur les Documents de NexaWorks… » |
| « Comment relancer un client ? » | E3 : « Comment relancer un client qui n'a pas payé ? » |
| « Conversations récentes », « Sources » (en-têtes) | absents du catalogue |
| « Ouvrir la page complète ↗ » | « Ouvrir la page complète » |
| « FAQ comptabilité — Document supprimé » | « {titre} — Document supprimé » (voir A16 pour le numéro) |

- **Correction proposée :** aligner la maquette sur le catalogue, et ajouter « Sources » et « Conversations récentes » au catalogue.
- **Décision produit touchée :** non.

### A29 · Règle « les boutons commencent par un verbe à l'infinitif » non tenue

- **Emplacement :** Voice and Tone, règle 6, contre « Historique », « + Nouvelle Conversation », « Retour au Tableau de bord », « ← Retour à la Conversation », « Filtres ({n}) ».
- **Correction proposée :** « Revenir au Tableau de bord », « Revenir à la Conversation ». Pour « Historique », « Nouvelle Conversation » et « Filtres », admettre explicitement une exception (boutons d'ouverture de panneau et de création).
- **Décision produit touchée :** non.

### A30 · Rédaction ponctuelle

- **Emplacement et correction proposée :**
  - « Vous êtes déconnecté. » est genré. Proposer « Vous avez bien été déconnecté. », lui aussi genré, ou mieux « Déconnexion effectuée. ».
  - « Le traitement n'a pas pu aboutir, le service d'IA étant momentanément indisponible. » : préférer « Le traitement n'a pas pu aboutir : le service d'IA est momentanément indisponible. ».
  - Le guide « À écrire » donne « Ce fichier est vide : aucun texte exploitable n'a été trouvé. », mais le catalogue dit « Ce fichier ne contient aucun texte exploitable. Il ne peut pas être interrogé. ». Garder une seule formulation.
  - « interrogeable » (« Le Document sera interrogeable dans quelques instants. ») est un peu technique. Proposer « L'Assistant pourra l'utiliser dans quelques instants. ».
- **Décision produit touchée :** **oui** pour la dernière proposition (texte validé dans le memlog, Statut en cours). Non pour les autres.

### A31 · Apostrophes droites et courbes mélangées

- **Emplacement :** maquette, ligne 206 (’) contre le reste (').
- **Correction proposée :** choisir l'apostrophe typographique ’ dans tous les textes affichés, en même temps que A12.
- **Décision produit touchée :** non.

### A32 · Défauts d'accessibilité propres à la maquette

- **Emplacement :** `mockups/key-assistant.html`.
- **Problème :**
  - Boutons en `span` (« Historique », actions de refus, ✕, « Envoyer »).
  - `label for="q"` pointe vers un `span`.
  - ☰ en `span aria-label="Menu"` au lieu de « Ouvrir le menu ».
  - Envoi mobile « ↑ » sans nom.
  - Compteur et aide absents de la vue mobile, alors que le compteur est « toujours visible ».
  - Le cadre ordinateur (232 + 380 px) ne se replie pas : seules deux vues mobiles statiques existent, et ni la Recherche ni la page Document ne sont maquettées à 375 px.
- **Correction proposée :** DESIGN.md et EXPERIENCE.md prévalent, aucune correction n'est obligatoire. Si la maquette sert à la démonstration ou de référence pour l'intégration, corriger la sémantique et ajouter une vue E5 et E7 à 375 px.
- **Décision produit touchée :** non.

### A33 · Sélection d'une autre Source pendant que le panneau est ouvert

- **Emplacement :** EXPERIENCE.md › Puce de Source (« Un clic sur une autre Source remplace le contenu du panneau »).
- **Problème :** la cible du focus après ce remplacement n'est pas dite, et la fermeture doit rendre le focus à la *dernière* puce activée.
- **Correction proposée :** focus sur le titre du panneau à chaque remplacement. Retour à la dernière puce activée.
- **Décision produit touchée :** non.

---

## Récapitulatif

| Gravité | Nombre | Constats |
|---|---|---|
| Bloquant | 0 | — |
| Important | 12 | A1 à A12 |
| Mineur | 21 | A13 à A33 |

Une seule correction touche une décision produit déjà prise de façon nette : A30 (formulation « interrogeable »). Deux autres touchent une décision à la marge : A4 (« + Ajouter » toujours visible, contre la place à 375 px) et A8 (rendu du Passage non actif).
