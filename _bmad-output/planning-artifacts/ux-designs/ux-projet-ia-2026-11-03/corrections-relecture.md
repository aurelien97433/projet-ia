# Corrections après relecture indépendante — NexaMind AI

- **Date :** 2026-11-03
- **Rapports :** [review-couverture.md](review-couverture.md) (C), [review-etats-acces.md](review-etats-acces.md) (S), [review-accessibilite.md](review-accessibilite.md) (A)
- **Bilan :** 0 bloquant ; 31 importants corrigés ; 44 mineurs non appliqués, à arbitrer (quelques-uns sont résolus au passage, signalés ci-dessous).
- **Référence d'architecture :** [architecture-nexamind-ai.md](../../architecture/architecture-projet-ia-2026-11-03/architecture-nexamind-ai.md) (AD-n cités ci-dessous).

## Constats importants corrigés

| Constat | Correction | Fichier(s) |
|---|---|---|
| S1, C4 — Pas de délai maximal pour les attentes IA | Nouvelle ligne « Attente IA » dans State Patterns (Recherche 10 s ; Assistant 20 s / 90 s ; Résumé 120 s → panne + « Réessayer », sans quota) ; E4, E7 et E8 y renvoient ; les 10 s restent réservées aux lectures et à l'enregistrement (AD-16) | EXPERIENCE.md |
| S2 — Échange interrompu, Conversation sans réponse | Conversation créée au premier envoi accepté ; réponse ou échec enregistré même si l'on quitte ; question sans réponse rouverte avec alerte + « Réessayer », qui remplace la tentative ; refus de quota → aucune Conversation (AD-17) | EXPERIENCE.md (E4) |
| S3 — Réponse sans Source valide | Réponse provisoire (`aria-busy`) jusqu'à confirmation ; citations invalides retirées sans message ; aucune valide → texte retiré + « Je n'ai pas pu vérifier cette réponse à partir des Documents. Veuillez réessayer. » + « Réessayer » (AD-11) | EXPERIENCE.md (catalogue, Component Patterns, E4), maquette (carte « Réponse non vérifiable ») |
| S4, C5 — Marqueur trop pauvre, note de contradiction irréalisable | Marqueur à trois valeurs (AD-10) ; composant `contradiction-note` supprimé ; contradiction signalée dans le texte ; refus hors cadre avec « Reformuler la question » seul ; gabarit de contradiction retiré du catalogue ; X12 mis à jour | EXPERIENCE.md, DESIGN.md (jeton + tableau), maquette |
| S5 — Document supprimé pendant la consultation | E4a : « Ce Document a été supprimé. » sans « Réessayer », puce au style supprimé ; E7 : même message + « Retour à la Bibliothèque » ; ligne State Patterns | EXPERIENCE.md |
| S6 — « Vous pouvez le relancer » montré au non-Auteur | Variante pour les autres Collaborateurs : « Seul l'Auteur de ce Document peut relancer le traitement. » (erreur temporaire et traitement bloqué) | EXPERIENCE.md (catalogue, E7) |
| S7 — Session expirée pendant une saisie | Saisie copiée dans `sessionStorage`, restaurée après reconnexion (« Votre saisie a été restaurée. »), retour sur chemin interne ; H8 mise à jour | EXPERIENCE.md (State Patterns, champ de question, H8) |
| S8 — Statut figé si l'actualisation échoue | Interrogation toutes les 3 s ; après 3 échecs « Le Statut n'a pas pu être actualisé. » + « Actualiser » ; reprise automatique (AD-6) | EXPERIENCE.md (State Patterns, E7, catalogue) |
| S9 — Doubles envois et « Réessayer » non idempotents | Nouveau pattern « Bouton d'envoi » : état occupé dès le premier clic, identifiant de demande réutilisé par « Réessayer » ; « Relance… » (AD-16) | EXPERIENCE.md (Component Patterns, E7, E8) |
| S10 — Résumé régénéré par un second Collaborateur | Résumé à jour renvoyé sans appel ni quota, simplement affiché (AD-18) | EXPERIENCE.md (Bloc Résumé, E7) |
| S11 — Quota : détection, sort de la question, rétablissement | Quota lu au chargement d'E4 et E7 ; refus à l'envoi → question gardée dans le champ, pas de Conversation ; réactivation automatique ; `{moment}` = heure locale du prochain 00:00 UTC ; texte « plafond fournisseur atteint » distinct (AD-14, AD-15) ; H3 résolue | EXPERIENCE.md, maquette (carte Quota) |
| S12 — Saisie perdue en quittant E8 sans « Annuler » | Même dialogue pour toute navigation interne + avertissement `beforeunload` | EXPERIENCE.md (E8) |
| C1, A4 — Barre du haut à 375 px contradictoire | Barre globale unique ☰ · logo · « + » (« Ajouter un Document ») ; ligne d'en-tête E4 avec « Historique » et « + Nouvelle Conversation » ; entrée « Assistant » → état vide | EXPERIENCE.md (catalogue, Component Patterns, E4, Responsive), DESIGN.md (Layout), maquette mobile |
| C2 — Focus initial du Tableau de bord | E3 ajouté aux exceptions de la gestion du focus ; H10 réduite à l'ordre des listes à 375 px | EXPERIENCE.md |
| C3 — Lecteur de Document limité à un Passage | Le Lecteur reçoit la liste des Passages et l'index actif ; E7 depuis « Ouvrir la page complète » reprend « Passage {i} sur {k} » + Précédent / Suivant | EXPERIENCE.md (Lecteur, E7) |
| C6, A9 — Bordure des boutons secondaires et anneau de focus | `button-secondary.border` → `{colors.input-border}` (3,66:1) ; nouveau jeton `focus-ring` plein 2 px décalé de 2 px, sans l'opacité 50 % de shadcn ; puce sélectionnée en fond `{colors.accent-mark}` (`source-chip-selected`) ; `.ghost` et `.x` de la maquette alignés | DESIGN.md, EXPERIENCE.md (Accessibility Floor), maquette |
| C7, A3 — Rendu du texte et débordements | Texte brut, retours à la ligne conservés, Markdown et HTML jamais interprétés (AD-8) ; `overflow-wrap: anywhere` sur Lecteur, puces, bulles, cartes ; tests « .md piège » et « piège à 375 px » | EXPERIENCE.md (Lecteur, Résultat de Recherche, E7, Accessibility Floor), DESIGN.md (Layout), maquette |
| A1 — Entrée sur mobile, IME, Échap | Écran tactile : Entrée va à la ligne, envoi par « Envoyer », aide masquée ; Entrée et Échap ignorés pendant une composition | EXPERIENCE.md (Champ de question, Interaction Primitives, catalogue) |
| A2 — Clavier virtuel et focus masqué | `interactive-widget=resizes-content` (ou `visualViewport`), champ limité à 4 lignes à 375 px, `scroll-padding` (WCAG 2.4.11) | EXPERIENCE.md (E4), DESIGN.md (Champ de question) |
| A5 — Panneaux sans modalité | Sous 1024 px : `Sheet` modaux (fond inerte, focus piégé) ; Historique avant le fil dans le DOM, focus sur la Conversation active, puis dans le champ après un choix | EXPERIENCE.md (panneaux, Interaction Primitives, Responsive), DESIGN.md (Layout) |
| A6 — Boutons inactifs sous le focus | Règle générale `aria-disabled`, jamais `disabled` ; annonce « Résumé généré. » | EXPERIENCE.md (Interaction Primitives, Panneau Source, E7, catalogue) |
| A7 — Ordre de tabulation dans E4 | Le fil précède le champ dans le DOM ; Maj+Tab depuis le champ remonte vers les puces | EXPERIENCE.md (E4) |
| A8 — Passage non actif peu visible | Bordure gauche pointillée 2 px `{colors.accent-text}` (7,09:1) + texte masqué « Passage utilisé {j} sur {k} » ; jeton mis à jour ; `mark.off` de la maquette aligné | DESIGN.md, EXPERIENCE.md, maquette |
| A10 — Renvois et puces non nommés | Texte masqué « Source » devant chaque renvoi ; puce `button` avec `aria-expanded` / `aria-controls`, nom « Source {n} : {titre}, {k} Passages » | EXPERIENCE.md, maquette (renvois) |
| A11 — Libellés de champ | Règle avec son exception (champ unique + bouton → libellé masqué) ; libellés ajoutés : « Rechercher dans les Documents », « Catégorie », « Trier par », « Votre recherche », raison du quota en `aria-describedby` | EXPERIENCE.md (catalogue, Formulaire, Accessibility Floor) |
| A12 — Espaces insécables absents | Règle 9 du guide de contenu (U+202F / U+00A0), appliquée au rendu par `formatFr` (architecture §6) | EXPERIENCE.md |

## Contrastes recalculés (node, formule WCAG)

| Couple | Ratio |
|---|---|
| Bordure pointillée du Passage non actif `#92400E` / fond · fond léger | 7,09 · 6,54 |
| Texte / fond léger du Passage non actif | 13,60 (valeur corrigée dans DESIGN.md, était 14,9) |
| Bordure de bouton secondaire `#7B8794` / fond · surface | 3,66 · 3,45 |
| Texte de bouton secondaire `#0E5A6B` / fond | 7,80 |
| Puce sélectionnée : texte / `accent-mark` ; bordure / fond | 6,08 ; 7,09 |
| Anneau de focus / puce sélectionnée | 6,69 |

## Constats mineurs non appliqués (à arbitrer)

**Textes et Glossaire**
- C9 : deux formulations pour le fichier vide (guide de ton contre catalogue).
- C10 : « J'ai déjà un Compte » contredit « l'interface ne dit jamais je » ; règle 6 (verbe à l'infinitif) trop large.
- C11 / A27 : « Créer un compte » → « Créer un Compte » ; « *en cours* » → « *en cours de traitement* » ; usage réel de « Recherche » / « Recherche sémantique » (règle 4, X8).
- S13 : « Votre Document est prêt. » montré à un non-Auteur → « Le Document est prêt. ».
- A29 : boutons de navigation sans verbe (« Historique », « Retour au… ») ; exception à écrire.
- A30 : rédaction ponctuelle (« Vous êtes déconnecté. » genré ; « interrogeable » jugé technique — **touche un texte validé**).
- A31 : apostrophes droites et typographiques mélangées.

**Sources et Passages**
- C8 / S19 / A16 : la puce supprimée perd son numéro (« {n} · {titre} — Document supprimé ») ; `aria-disabled` inopérant sur un texte.
- S18 : ordre des Passages (ordre du Document), compteur quand un seul Passage est retrouvé, étiquette « Passage utilisé · 1 sur 2 » de la maquette. *(Page complète : résolu par C3.)*
- A14 : annonce du début du Passage, noms « Passage précédent / suivant », capitales en CSS, navigation collante à 375 px.
- A33 : focus après remplacement du contenu du panneau Source.

**États et comportements**
- C14 : critère de tri de l'Historique (dernier échange). *(Création au premier envoi : résolue par S2.)*
- C15 : bloc Résumé trompeur sur un Document *en erreur* ; formulation « prêt déjà vu ».
- C16 : Document supprimé pendant la Conversation ouverte. *(Résolu par S5.)*
- C17 : dépôt de plusieurs fichiers, Note faite d'espaces, message « Choisissez un fichier. » absent de la ligne Validation d'E8.
- C18 / S21 : exemples de questions — envoi direct (E3) ou pré-remplissage (E4) à harmoniser.
- S14 : vue d'un non-Auteur sur un Document *en erreur* sans texte (« Aucun texte à afficher. »).
- S15 : contenu privé dans les URL (`?q=`, slug de la maquette), redirection ouverte après connexion. *(Identifiants opaques : H1 résolue.)*
- S16 : même Conversation dans deux onglets.
- S17 : seuil de 60 s calculé avec l'horloge du poste. *(L'architecture expose `server_now`, AD-6 ; la règle UX reste à écrire.)*
- S20 : chargement et erreur d'une Conversation et de la liste des Conversations récentes.
- S23 : E1 / E2 ouverts par un Collaborateur déjà connecté → redirection vers E3.
- C19 : X11 et X12 à reporter. *(Résolu : reportés dans l'addendum.)*

**Accessibilité**
- A13 : volume et outillage des annonces `aria-live`.
- A15 : `document.title` par écran, `h1` en `tabindex="-1"`, double annonce de Next.js.
- A17 : glyphes lus à voix haute (« + », flèches, ●) ; deux boutons « Fermer » ambigus ; « ↗ ».
- A19 : état désactivé par opacité 0,55 (texte informatif à 2,41:1).
- A21 : test du reflow à 320 px (critère 1.4.10).
- A23 : titres tronqués sur une ligne dans l'Historique.
- A24 : pas de mise au point automatique d'un champ sur écran tactile (H10).
- A25 : carte de Recherche entièrement en lien (nom trop long).
- A26 : `autocomplete`, collage autorisé, « Afficher le mot de passe » en bascule, « Se déconnecter » en bouton.

**DESIGN.md et maquette**
- C12 / A28 / S22 : écarts de textes entre la maquette et le catalogue. *(Carte Quota alignée.)*
- C13 : composants sans ligne visuelle (bloc quota, bloc Résumé, carte de Recherche, panneaux) ; `gutter-desktop` inutilisé. *(Hypothèse Geist retirée.)*
- A18 : bordure du bouton secondaire. *(Résolu par C6.)*
- A20 : ratio du Passage non actif *(corrigé)* ; textes à 11 px dans la maquette.
- A22 : comportement des panneaux entre 768 et 1023 px. *(Aligné : `Sheet` modaux.)*
- A32 : sémantique de la maquette (boutons en `span`, `label` vers un `span`, vues E5/E7 à 375 px absentes).

## Corrections qui touchent une décision produit déjà prise

1. **Note de contradiction supprimée** : la maquette validée la montrait ; la contradiction est désormais dite dans le texte de la réponse (décision d'architecture AD-10, prise par l'utilisateur).
2. **Refus hors cadre** : passe de « sans action » à « Reformuler la question » (AD-10, décidé par l'utilisateur).
3. **Passage non actif** (rendu validé au Trou C) : bordure pointillée ambre de 2 px au lieu d'une bordure claire, plus un texte masqué ; le principe « actif distinct des non actifs » est conservé.
4. **Puce sélectionnée** (Trou C) : fond `accent-mark` au lieu d'un contour ambre, pour ne pas se confondre avec l'anneau de focus.
5. **Barre du haut à 375 px** : « + Ajouter » reste toujours visible (décision de navigation conservée) ; « Historique » et « + Nouvelle Conversation » passent sur une seconde ligne propre à l'Assistant.
6. **Moment de rétablissement du quota** : « demain à 0 h 00 » devient l'heure locale du prochain 00:00 UTC (AD-14, décidé par l'utilisateur).
7. **Création de la Conversation** : au premier envoi accepté et non plus à la première réponse (AD-17, proposé en architecture, non arbitré explicitement par l'utilisateur).
8. **Réponse provisoire pendant la rédaction** et retrait si elle n'est pas vérifiable (AD-11, décidé par l'utilisateur) : complète la décision « un refus ne s'écrit jamais progressivement ».
9. **Confirmation « Abandonner ce Document ? »** étendue à toute navigation interne : élargit la décision « Annuler demande confirmation si saisie en cours ».
10. **Bordure des boutons secondaires plus foncée** (`#7B8794`) : touche à la marge l'identité « bordures fines » validée.
