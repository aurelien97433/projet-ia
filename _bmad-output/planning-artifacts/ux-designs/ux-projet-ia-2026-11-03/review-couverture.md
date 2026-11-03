# Revue UX — Couverture, cohérence et périmètre · NexaMind AI

- **Relecteur :** lentille « couverture, cohérence et périmètre » (indépendante)
- **Date :** 2026-11-03
- **Fichiers relus :** `DESIGN.md`, `EXPERIENCE.md`, `mockups/key-assistant.html`, `mockups/color-themes.html`, `.memlog.md` ; sources `prd.md` (final) et `addendum.md` ; forme selon `bmad-ux/references/validate.md` et `design-md-spec.md`.

## Verdict global

**Conforme avec réserves. Aucun constat bloquant.** Les 20 exigences P0 ont toutes un écran, un comportement et des états vérifiables. Chaque critère vérifiable du PRD peut être satisfait par l'UX décrite. UJ-1, UJ-2 (cas limite du .txt vide compris) et UJ-3 sont réalisables étape par étape, chacun avec son protagoniste, ses étapes numérotées, son climax et un chemin d'échec. Le périmètre est tenu : aucune fonctionnalité ne sort du §6.1, et rien ne relève du §6.2. La forme est conforme : les sections de DESIGN.md sont dans l'ordre canonique, celles requises dans EXPERIENCE.md sont présentes, et toutes les références `{…}` se résolvent.

Il reste 7 défauts **importants** à corriger avant le développement :
- des contradictions internes : barre du haut sur mobile, focus du Tableau de bord, contrat du lecteur de Document, bordure des boutons secondaires ;
- trois comportements sous-spécifiés qui touchent le cœur du produit : délai maximal des attentes IA (NFR-4), rendu de la note de contradiction (FR-16), rendu du texte d'un Document (FR-10/FR-17).

S'y ajoutent 12 constats mineurs.

### Synthèse par axe

| Axe | Verdict |
|---|---|
| Couverture P0 (20 FR) | Forte : toutes couvertes, avec écran, comportement et états |
| Couverture NFR UX (NFR-3 à NFR-8, NFR-10) | Adéquate : lacune sur les délais maximaux d'attente IA (C4) et sur le rendu du texte (C7) |
| Parcours UJ-1 / UJ-2 / UJ-3 | Forte : chaque étape du PRD est réalisable ; protagoniste, climax et échec présents |
| Cohérence avec le PRD et l'addendum | Adéquate : aucun critère contredit ; des écarts d'usage du Glossaire (C11) |
| Cohérence interne (spines et maquettes) | Fragile par endroits : C1, C2, C3, C6, C12 |
| Références `{colors.x}` / `{components.x}` | Toutes résolues ; un jeton défini mais inutilisé (C13) |
| Périmètre | Conforme : uniquement des précisions d'interface, aucun ajout fonctionnel |
| Forme | Conforme |

### Vérifications faites sans constat (pour mémoire)

- **Exigences P0 :**
  - **FR-1 :** E2 couvre la création sans confirmation et les trois erreurs explicites.
  - **FR-2 :** E1 couvre l'erreur générique, la session persistante et la redirection vers E1 sans session.
  - **FR-3 :** 3 actions, 5 Documents tous Statuts confondus, 5 Conversations, état vide avec exemples.
  - **FR-4 et FR-5 :** champs obligatoires, titre prérempli sans extension, .txt vide → *en erreur*.
  - **FR-7 :** refus avant traitement, deux types d'erreur, relance réservée à l'Auteur, mise à jour automatique.
  - **FR-8 :** E5, E7 et les Sources n'utilisent que des Documents *prêts*.
  - **FR-9 :** les 5 colonnes conservées à toutes les largeurs, filtres, recherche par titre partielle et insensible à la casse, tri dans les deux sens.
  - **FR-10 :** lecture, métadonnées, Passage mis en évidence.
  - **FR-12 et FR-13 :** confirmation, Source « Document supprimé » non cliquable, actions masquées, refus côté serveur notifié.
  - **FR-14 et FR-15 :** 5 résultats au plus, un par Document, aucun texte IA, état d'absence de résultat.
  - **FR-16 à FR-19 :** réponse progressive, Sources, refus (absence et hors cadre), questions de suivi.
  - **FR-20 et FR-22 :** Historique et E9 neutre.
  - **FR-23 :** Résumé à la demande, 5 points au plus, conservé, non proposé hors *prêt*, quota.
- **NFR :**
  - **NFR-3 :** seuils de 3 s et 5 s repris.
  - **NFR-5 :** `lang="fr"` prévu.
  - **NFR-6 :** lecture, Recherche et Conversation décrites à 375 px.
  - **NFR-7 :** clavier seul sur les 3 parcours, libellés, AA.
  - **NFR-8 :** limite de 2 000 caractères, quota de l'Assistant et du Résumé avec moment de rétablissement, aucun appel au fournisseur.
- **Périmètre :**
  - Les notifications éphémères (Sonner) ne sont pas les « notifications » du §6.2 : il n'y a ni centre de notifications ni alerte d'événement.
  - La navigation entre Passages, les renvois ¹ ² (conditionnés par H13) et les trois suites du refus sont des précisions d'interface.
  - L'expiration à 3 min (X11) est une précision imposée par NFR-4, déjà signalée comme écart.
  - « Poser une question » depuis un Document ne limite pas la réponse au Document : la limitation reste hors périmètre (X7).
- **Forme :**
  - DESIGN.md suit l'ordre Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts.
  - EXPERIENCE.md contient Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor et Key Flows, plus Responsive et Inspiration, qui s'appliquent ici.
  - Les deux maquettes sont liées depuis les spines, et la primauté des spines est énoncée.

---

## Constats bloquants

Aucun.

---

## Constats importants

### C1 — Barre du haut sous 1024 px : trois descriptions incompatibles ; « Nouvelle Conversation » introuvable sur mobile

- **Emplacement :**
  - EXPERIENCE.md › Responsive & Platform (ligne « < 768 px » : « Barre du haut : ☰, logo, « + » (Ajouter) ») ;
  - E4 › 375 px (« barre du haut avec ☰, logo, « Historique » ») ;
  - Component Patterns › Bouton « + Ajouter » (« barre du haut sur mobile. Toujours visible, quel que soit l'écran ») ;
  - `key-assistant.html`, vue 375 px : ☰, logo et Historique, sans « + » ni « Nouvelle Conversation ».
- **Problème :** un développeur ne peut pas savoir ce que contient la barre du haut de l'Assistant à 375 px. Sur mobile, aucun écran ne montre comment démarrer une nouvelle Conversation : le bouton « + Nouvelle Conversation » de l'en-tête de l'Assistant n'apparaît pas à 375 px. Ce que fait l'entrée de navigation « Assistant » quand une Conversation est ouverte n'est pas non plus précisé : revient-elle à l'état vide ou à la dernière Conversation ? UJ-3 et UJ-1 restent réalisables à 375 px en passant par le Tableau de bord, mais ce chemin n'est pas décrit.
- **Correction proposée :**
  - Fixer une seule barre du haut globale sous 1024 px : ☰, logo, « + » (nom accessible « Ajouter un Document »).
  - Dans l'en-tête de E4 à 375 px, placer « Historique » et « Nouvelle Conversation » (icône « + » avec nom accessible), sous la barre globale.
  - Préciser que l'entrée « Assistant » ouvre toujours l'état vide (nouvelle Conversation).
  - Mettre la vue 375 px de la maquette à jour.
- **Touche une décision produit déjà prise :** non. Il s'agit de précisions de mise en page cohérentes avec les décisions sur la navigation et l'Historique.

### C2 — Focus initial du Tableau de bord contraire à la règle générale

- **Emplacement :**
  - E3 › Clavier : « focus initial sur le champ de Recherche » `[ASSUMPTION]` ;
  - H10 ;
  - Interaction Primitives › Gestion du focus : « le focus va sur le titre de l'écran (h1), ou sur le champ principal quand l'écran sert à saisir (E1, E2, E4 nouvelle Conversation, E5, E8) ». E3 n'y figure pas.
- **Problème :** deux règles contradictoires pour le même écran. Or UJ-3 étape 2 (« Le focus est déjà dans le champ de Recherche ») et le parcours au clavier seul (NFR-7) reposent sur l'une d'elles.
- **Correction proposée :** soit ajouter E3 à la liste des exceptions des Interaction Primitives, soit retirer l'hypothèse H10 et corriger UJ-3 étape 2 (« Tab jusqu'au champ de Recherche »). Le choix relève de la lentille accessibilité : un focus posé dans un champ au chargement fait sauter le h1 et le lien d'évitement.
- **Touche une décision produit déjà prise :** non. H10 est une hypothèse non tranchée.

### C3 — Le contrat du « Lecteur de Document » ne connaît qu'un seul Passage ; la page complète ouverte depuis une Source à plusieurs Passages n'est pas spécifiée

- **Emplacement :**
  - EXPERIENCE.md › Component Patterns › Lecteur de Document : « il reçoit un Document et, éventuellement, un Passage à mettre en évidence » ;
  - Panneau Source (E4a), qui gère k Passages (décision du Trou C) ;
  - E7 › « Passage mis en évidence » : « Arrivée depuis E5 ou « Ouvrir la page complète » ».
- **Problème :**
  - Le composant présenté comme « unique, partagé par le panneau et la page » est décrit pour un seul Passage, alors que le panneau en affiche plusieurs avec un Passage actif et une navigation Précédent/Suivant.
  - Quand Camille clique « Ouvrir la page complète » sur « Procédure de facturation · 2 Passages » (c'est précisément UJ-1 et UJ-2 étape 7), on ne sait pas si E7 met en évidence le Passage actif seul, tous les Passages, ni s'il garde « Passage i sur k ».
  - FR-10 et FR-17 exigent que le Passage concerné soit mis en évidence. L'ambiguïté se traduira par des implémentations divergentes.
- **Correction proposée :** décrire le contrat du lecteur comme suit : une liste de Passages (0..k), l'index du Passage actif et un indicateur « Document modifié ». Préciser que « Ouvrir la page complète » transmet la liste et l'index actif, et que E7 offre alors la même navigation entre Passages que le panneau. Depuis E5, un seul Passage, avec l'étiquette « Passage pertinent ».
- **Touche une décision produit déjà prise :** non. Cela prolonge la décision du Trou C.

### C4 — Aucune durée maximale pour les attentes IA (Assistant, Résumé) : risque de chargement infini (NFR-4)

- **Emplacement :**
  - E4 › « État neutre » et « Rédaction » ;
  - E7 › « Résumé : génération » ;
  - State Patterns › Chargement (« Au-delà de 10 s… `Skeleton` ») ;
  - H7.
- **Problème :**
  - NFR-4 interdit « un chargement infini ». L'état neutre « Recherche dans les Documents… » et la génération du Résumé n'ont aucune limite de temps : si le fournisseur ne répond jamais, l'écran attend indéfiniment.
  - La règle générale des 10 s (H7) vise les squelettes. Appliquée au Résumé, elle serait inadaptée : l'addendum prévoit un résumé « par morceaux » pour un Document long. Elle proposerait alors « Réessayer » à tort, donc des doubles appels qui consomment le quota (NFR-8).
  - Le traitement d'un Document, lui, est borné (60 s / 3 min) : l'asymétrie est nette.
- **Correction proposée :**
  - Ajouter une ligne « Attente IA » aux State Patterns. Après N s sans premier contenu (par exemple 20 à 30 s pour l'Assistant, 60 s pour le Résumé ; valeurs à confirmer en architecture), l'opération bascule en panne (`error-alert` + « Réessayer », question conservée).
  - Préciser qu'un « Réessayer » ne relance pas un appel encore en cours, et qu'un appel abandonné n'est pas décompté deux fois, ou dire ce qui est décompté.
  - Ajouter ce point à la liste « Pour l'architecture ».
- **Touche une décision produit déjà prise :** non.

### C5 — Note de contradiction (FR-16) : signal technique non prévu et rendu pendant l'écriture progressive non spécifié

- **Emplacement :**
  - E4 › Contradiction (« Note de contradiction en tête de réponse ») ;
  - Confiance visible › Signal complémentaire ;
  - Textes clés › « Réponses de l'Assistant sans contenu sourcé » › « Contradiction (gabarit) » ;
  - DESIGN.md › `contradiction-note` ;
  - EXPERIENCE.md › « Pour l'architecture » (points 1 à 6).
- **Problème :**
  - Afficher un composant visuel distinct en tête de réponse suppose que le serveur sache, avant ou pendant l'écriture progressive, qu'il y a contradiction, et puisse isoler ce passage. La liste « Pour l'architecture » prévoit un marqueur REPONSE/REFUS (X12), mais aucun signal de contradiction.
  - On ne sait pas comment la note s'affiche pendant l'écriture progressive : texte qui s'écrit dans la note, ou note ajoutée à la fin ?
  - Le « gabarit » laisse croire que le texte est fixé par l'interface, alors qu'il serait rédigé par le modèle.
  - Le gabarit est rangé dans « sans contenu sourcé », alors qu'une contradiction est une réponse sourcée.
  - Le critère FR-16 reste satisfaisable, puisque la phrase et les Sources suffisent, mais tel quel le rendu est impossible à implémenter de façon fiable.
- **Correction proposée :**
  - Soit faire de la note un rendu conditionnel : la contradiction est d'abord une phrase de la réponse (consigne au modèle), et la mise en forme `contradiction-note` ne s'applique que si l'architecture fournit un signal structuré, à ajouter comme point 7 de « Pour l'architecture ».
  - Soit étendre le marqueur de X12 avec un drapeau de contradiction et préciser que la note s'écrit progressivement dans son cadre.
  - Dans les deux cas, déplacer le gabarit vers une rubrique « Réponses sourcées » et le présenter comme une consigne de forme pour le modèle.
- **Touche une décision produit déjà prise :** partiellement. La maquette validée montre la note, mais son rendu conditionnel ne remet pas en cause la décision.

### C6 — Bordure des boutons secondaires contraire à la règle 1.4.11 que DESIGN.md s'impose

- **Emplacement :**
  - DESIGN.md › frontmatter `components.button-secondary.border: '{colors.border}'` ;
  - DESIGN.md › Colors : « `{colors.border}` est purement décoratif (séparateurs) et n'est jamais la seule limite d'un élément cliquable » ;
  - maquette : `.ghost` et `.x` bordés de `--border` #E3E7EC.
- **Problème :** le bouton secondaire est blanc sur fond blanc. Sa seule limite visible est `{colors.border}` (#E3E7EC, environ 1,2:1). Le document contredit donc sa propre règle, sur un composant omniprésent : « Historique », « + Nouvelle Conversation », les trois suites du refus, « Réessayer », « Précédent »/« Suivant », ✕ « Fermer ». Comme le code reprendra le jeton tel quel, le défaut passera directement dans l'implémentation.
- **Correction proposée :** passer `button-secondary.border` à `{colors.input-border}` (3,66:1), comme pour les champs, et aligner `.ghost` et `.x` dans la maquette. Autre option : assumer explicitement l'exception (le libellé suffit à identifier le bouton) et retirer la phrase de la section Colors. La première option est plus sûre.
- **Touche une décision produit déjà prise :** non. Elle étend aux boutons la correction déjà décidée pour les champs (#7B8794).

### C7 — Rendu du texte d'un Document non spécifié (.md brut ou mis en forme ?), alors que la mise en évidence repose sur des positions de caractères

- **Emplacement :**
  - EXPERIENCE.md › Component Patterns › Lecteur de Document ;
  - E7 (« lecteur de Document (texte en `{typography.reading}`) ») ;
  - addendum › « Position des Passages » (décalages de début et de fin dans le texte).
- **Problème :**
  - Rien ne dit si un fichier .md est affiché brut ou interprété (titres, listes, liens), ni si les retours à la ligne d'une Note sont conservés.
  - La mise en évidence (FR-10, FR-17) repose sur des positions dans le texte extrait. Un rendu Markdown décale ces positions et peut couper un Passage au milieu d'un élément.
  - Interpréter du contenu fourni par un Collaborateur (HTML dans un .md) pose aussi un problème de sécurité. C'est l'esprit de NFR-10, « contenus traités comme des données », même si NFR-10 vise d'abord les consignes au modèle.
- **Correction proposée :** décider que le lecteur affiche le texte extrait en texte brut, retours à la ligne conservés (`white-space: pre-wrap`) et aucun HTML interprété, y compris pour les .md au MVP. Ajouter ce point à « Pour l'architecture » : les positions des Passages se rapportent au texte affiché. Ajouter aussi une ligne dans DESIGN.md › Typography (`reading`) sur le rendu des titres Markdown laissés tels quels.
- **Touche une décision produit déjà prise :** non.

---

## Constats mineurs

### C8 — La Source supprimée perd son numéro, ce qui laisse son renvoi sans correspondance

- **Emplacement :** DESIGN.md › Components › Puce de Source supprimée (« {titre} — Document supprimé ») ; EXPERIENCE.md › Textes clés › Source supprimée ; maquette, carte « Source vers un Document supprimé ».
- **Problème :** les renvois ¹ ² renvoient au numéro de la puce. Une puce supprimée sans numéro laisse le renvoi ² sans puce correspondante.
- **Correction :** « {n} · {titre} — Document supprimé ».
- **Décision produit touchée :** non. Le texte « Document supprimé » exigé par FR-12 est conservé.

### C9 — Deux textes différents pour un fichier vide

- **Emplacement :** Voice and Tone › tableau « À écrire » (« Ce fichier est vide : aucun texte exploitable n'a été trouvé. ») ; Textes clés › Erreurs › Fichier sans texte exploitable (« Ce fichier ne contient aucun texte exploitable. Il ne peut pas être interrogé. »), repris dans UJ-2.
- **Problème :** le catalogue est censé faire référence, mais l'exemple du guide de ton en donne une autre version.
- **Correction :** aligner l'exemple du guide sur le catalogue.
- **Décision produit touchée :** non.

### C10 — Le guide de contenu est contredit par ses propres libellés

- **Emplacement :** Voice and Tone, règle 3 (« L'interface, elle, ne dit jamais « je » ») face à « J'ai déjà un Compte » (E2) ; règle 6 (« Les boutons commencent par un verbe à l'infinitif ») face à « + Nouvelle Conversation », « Historique », « Filtres ({n}) », « Précédent » / « Suivant ».
- **Correction :** remplacer le lien par « Vous avez déjà un Compte ? Se connecter » et restreindre la règle 6 aux boutons d'action, en excluant ceux qui ouvrent un panneau ou servent à naviguer.
- **Décision produit touchée :** non. Le vouvoiement, décision validée, est conservé.

### C11 — Usage du Glossaire non uniforme

- **Emplacement :**
  - E1 et Textes clés › Connexion : « Créer un compte » (minuscule), alors que « Créer mon Compte » et « J'ai déjà un Compte » portent la majuscule ;
  - UJ-2 › Échec et Ajouts P1/P2 › FR-11 : « *en cours* », au lieu de la valeur du Glossaire « *en cours de traitement* » ;
  - E5 : champ « Votre recherche » pour ce que le Glossaire appelle une Requête ;
  - Voice and Tone, règle 4 : « Recherche sémantique (abrégée en « Recherche » dans la navigation) », et X8 : « le terme complet figure dans les textes d'aide ». En réalité, le catalogue emploie « Recherche » partout (titre de E5, quota, dialogue de suppression, panne), et le terme complet n'apparaît dans aucun texte du catalogue. Seule la maquette dit « Recherche sémantique ».
- **Correction :** mettre la majuscule à « Compte » ; employer « *en cours de traitement* » ; écrire la règle 4 et X8 comme elles sont réellement appliquées (« Recherche » partout dans l'interface, « Recherche sémantique » dans la phrase d'aide de E5), ou ajouter le terme complet à la phrase d'aide.
- **Décision produit touchée :** non. L'abréviation « Recherche », décidée, est conservée.

### C12 — Écarts entre la maquette `key-assistant.html` et les spines

- **Emplacement :** `mockups/key-assistant.html`.
- **Écarts :**
  - carte « Quota atteint » : « La Recherche sémantique reste disponible. », sans le lien « Ouvrir la Recherche » prévu par le catalogue ;
  - étiquette « Passage utilisé · 1 sur 2 » (le compteur est déjà dans l'en-tête) ;
  - « Ouvrir la page complète ↗ » : la flèche suggère un nouvel onglet, ce qui contredit le lien « ← Retour à la Conversation » de E7 ;
  - exemple « Comment relancer un client ? » au lieu de « … qui n'a pas payé ? » ;
  - champ mobile sans compteur ni libellé « Envoyer » (« ↑ ») ;
  - intitulé « Conversations récentes » absent du catalogue.
- **Correction :** ajouter au catalogue l'intitulé de la liste et préciser que « Ouvrir la page complète » s'ouvre dans le même onglet. Mettre la maquette à jour, ou l'assumer : la primauté des spines est déjà énoncée.
- **Décision produit touchée :** non.

### C13 — Composants et jetons incomplets

- **Emplacement :** DESIGN.md › Components et frontmatter.
- **Problème :**
  - Plusieurs composants décrits dans EXPERIENCE.md n'ont pas de ligne visuelle dans DESIGN.md : le **bloc quota** (« bloc neutre » ; la maquette réutilise l'apparence du refus), le **bloc Résumé**, la **carte de résultat de Recherche**, les **panneaux** Source et Historique (seules leurs largeurs sont données), et la variante des boutons « Poser une question » et « Ajouter un Document » du Tableau de bord (la règle « un seul bouton principal par zone » ne tranche pas).
  - `{spacing.gutter-desktop}` est défini mais jamais utilisé.
  - La mention `[ASSUMPTION]` sur Geist Sans (Typography, H2) n'a plus lieu d'être : `src/app/layout.tsx` charge bien `Geist`.
- **Correction :** ajouter les lignes manquantes, ou indiquer explicitement quel composant chacun réutilise (par exemple « bloc quota = `refusal-block` »). Retirer l'hypothèse H2 et l'appliquer à `gutter-desktop`.
- **Décision produit touchée :** non.

### C14 — Historique : critère de tri et moment de création d'une Conversation

- **Emplacement :** E4 › Vide (« Aucune Conversation n'est créée avant l'envoi de la première question ») ; E4 › Succès (« à la première réponse, elle prend le titre de la question et entre dans l'Historique ») ; E4b (date du dernier échange).
- **Problème :**
  - On ne sait pas si la Conversation est créée à l'envoi ou à la première réponse.
  - On ne sait pas si elle entre dans l'Historique quand la première réponse est une panne.
  - « De la plus récente à la plus ancienne » (FR-20) ne précise pas le critère : création ou dernier échange.
- **Correction :** « Créée et listée dès l'envoi de la première question, quelle que soit l'issue ; triée par date du dernier échange. »
- **Décision produit touchée :** non.

### C15 — Page Document en erreur : bloc Résumé trompeur et bandeau « déjà vu » ambigu

- **Emplacement :** Textes clés › États vides (« Le Résumé sera disponible quand le Document sera prêt. ») ; E7 › composants (« bandeau de Statut (sauf pour *prêt* déjà vu) »).
- **Problème :**
  - Pour un Document *en erreur* sans texte exploitable, ce message promet un Résumé qui ne viendra jamais.
  - « Déjà vu » laisse penser qu'on mémorise, pour chaque Collaborateur, s'il a vu le bandeau.
- **Correction :**
  - Masquer le bloc Résumé quand le Document est *en erreur*, ou afficher un texte dédié.
  - Remplacer « déjà vu » par « affiché seulement si le passage à *prêt* survient pendant la visite », formulation qui figure déjà dans l'état *Prêt*.
- **Décision produit touchée :** non.

### C16 — E4a : un Document supprimé pendant que la Conversation est ouverte

- **Emplacement :** E4a › « Document supprimé — Impossible : la puce n'est pas cliquable ».
- **Problème :** un autre Collaborateur peut supprimer le Document alors que la puce a été affichée cliquable. Le panneau tomberait alors sur « Erreur » ou sur E9.
- **Correction :** ajouter un état « Document supprimé entre-temps ». Le panneau affiche « Ce Document a été supprimé. » et la puce prend aussitôt l'apparence `source-chip-deleted` (FR-12).
- **Décision produit touchée :** non.

### C17 — E8 : cas limites du formulaire

- **Emplacement :** E8 › États.
- **Problème :**
  - Le comportement est inconnu si l'on dépose plusieurs fichiers à la fois (l'import multiple est hors périmètre au §6.2).
  - On ne sait pas si un texte de Note fait uniquement d'espaces est refusé (FR-4 parle d'un « texte vide », FR-5 traite le texte fait d'espaces comme vide).
  - Le message « Choisissez un fichier. » existe dans le catalogue mais ne figure pas dans la ligne Validation de E8.
- **Correction :** refuser un dépôt multiple avec « Un seul fichier à la fois. », traiter un texte fait d'espaces comme vide, et compléter la ligne Validation.
- **Décision produit touchée :** non.

### C18 — Exemples de questions de l'Assistant vide : comportement non dit

- **Emplacement :** E4 › Vide (« deux exemples de questions »).
- **Problème :** sur E3, les exemples envoient la question directement, ce qui consomme le quota. Sur E4, on ne sait pas s'ils envoient la question ou la placent seulement dans le champ.
- **Correction :** préciser, et de préférence aligner sur E3.
- **Décision produit touchée :** non.

### C19 — Écarts X11 et X12 pas encore reportés dans les sources

- **Emplacement :** EXPERIENCE.md › Écarts X11 et X12 ; `prd.md` FR-7 ; addendum (« Traitement non bloquant », chaîne RAG étape 6).
- **Problème :** l'UX impose deux comportements serveur : l'expiration à 3 min avec rejet d'un résultat tardif, et le marqueur REPONSE/REFUS. Ni le PRD ni l'addendum ne les mentionnent encore, donc l'architecture, qui part de ces sources, pourrait ne pas les voir. Il ne s'agit pas d'une contradiction : l'UX les signale elle-même comme écarts à reporter.
- **Correction :** reporter X11 et X12 (et le signal de contradiction de C5, s'il est retenu) dans l'addendum avant de lancer l'architecture.
- **Décision produit touchée :** non. Ce report est déjà prévu par l'utilisateur.
