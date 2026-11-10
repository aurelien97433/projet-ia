# Epic 3 Context: Retrouver, consulter et gérer les Documents

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Un Collaborateur parcourt la Bibliothèque, ouvre et lit n'importe quel Document de la Base commune avec ses Passages mis en évidence, et l'Auteur supprime ses propres Documents ; le Tableau de bord donne accès en un clic aux actions clés. L'epic livre le Lecteur de Document, brique de confiance partagée par la Recherche et le panneau Source. Il est validé ici avec des Passages de test ; la navigation réelle depuis un résultat ou une Source est validée en E4 et E5.

## Stories

- Story 3.1: Lecteur de Document et mise en évidence (Passages de test)
- Story 3.2: Page Document complète
- Story 3.3: Parcourir la Bibliothèque
- Story 3.4: Supprimer son Document
- Story 3.5: Tableau de bord (actions et derniers Documents)
- Story 3.6: Bibliothèque à 375 px et filtres mémorisés (FINITION)

## Requirements & Constraints

- **Consultation.** Tout Collaborateur voit tous les Documents, quel que soit leur Statut, avec titre, Catégorie, Auteur, date d'ajout et Statut. Seul l'Auteur voit et peut exécuter les actions d'Auteur.
- **Bibliothèque.** Filtres cumulables : Catégorie, « Mes Documents » (y compris *en cours* et *en erreur*), titre (partiel, sans casse). Tri par date dans les deux sens, plus récents d'abord par défaut.
- **Suppression.** Après confirmation seulement ; Document, Passages et fichier d'origine disparaissent de la Bibliothèque, de la Recherche et des réponses futures. Une Source existante reste affichée, marquée « Document supprimé », non cliquable. Une tentative directe d'un non-Auteur est refusée et le Document reste intact.
- **Tableau de bord.** Les 5 derniers Documents de la Base commune, tous Statuts, avec badge, le plus récent en tête ; chaque élément ouvre le Document.
- **Robustesse.** Jamais d'écran blanc ni de chargement infini : `Skeleton`, puis au-delà de 10 s « Le chargement prend plus de temps que prévu. » et « Réessayer ». Une ressource inexistante, mal formée ou interdite mène à E9, sans révéler son existence.
- **375 px.** Aucun défilement horizontal, y compris sur les Documents pièges (URL longue, mot sans espace, tableau Markdown).
- **Accessibilité.** Parcours au clavier, contraste AA, un libellé par champ, couleur jamais seule.
- **Sécurité des contenus.** Le texte d'un Document reste une donnée : HTML et scripts s'affichent en texte, sans exécution.
- **Terminé.** Critères et tests verts, textes repris du catalogue UX au vouvoiement, déploiement Vercel réussi, entrée au journal de Vibe Coding. Si la base change : `npm run deploy:supabase` avant Vercel. Dès qu'une page prérendue affiche des données (au plus tard 3.5), étendre `check:secrets --static` à `.next/server/app` (`.html`, `.rsc`, `.body`).

## Technical Decisions

- **Frontières.** `src/app` ne contient aucun SQL : tout passe par `src/server/<domaine>`. Aucune écriture d'un composant client vers Supabase. Client Supabase avec le jeton du Collaborateur ; jamais de `service_role` dans Next.js.
- **Lecture.** Listes via la vue `documents_list` (`security_invoker`, `effective_status`, nom de l'Auteur, `server_now`, sans `content_text` ni Résumé). Le texte complet n'est lu que Document par Document, hors de cette vue.
- **Statut effectif.** Toute page se base sur `effective_status`, jamais sur `status` brut ; un Document *en cours* depuis plus de 3 min y apparaît *en erreur* temporaire.
- **Lecteur.** Composant unique `src/components/documents/document-reader.tsx`, partagé avec le panneau Source. Il reçoit un Document, 0 à k Passages et l'index du Passage actif.
  - Affiche `content_text` (NFC, `\n`) en nœuds texte React, retours à la ligne conservés, sans jamais `dangerouslySetInnerHTML` ni Markdown interprété.
  - `<mark>` selon `start_offset`/`end_offset`, en unités de code JavaScript. Positions invalides ou chevauchantes : affichage sans mise en évidence, avec message, sans bloquer la lecture.
  - `overflow-wrap: anywhere`, et `min-width: 0` sur les éléments flex et grid.
- **Passages dans l'URL.** La page Document reçoit `?passages=…&actif=…`.
- **Mutations.** Server Action pour la suppression, Route Handler pour l'interrogation du Statut. Forme d'erreur unique `{ error: { code, message, retryable, resetAt? } }` ; `NOT_FOUND` couvre aussi l'accès refusé, le détail technique reste dans les journaux.
- **Suppression.** Politique `delete` réservée à l'Auteur ; le serveur supprime le Document, puis l'objet Storage. Passages en cascade ; `message_sources.document_id` passe à null (`document_title` conservé). Un Document sans `storage_path` (Note) se supprime sans erreur.
- **RLS.** Les privilèges et politiques de la suppression sont vérifiés par des tests d'intégration à deux Comptes.

## UX & Interaction Patterns

- **Passages.** Actif : fond `accent-mark`, bordure pleine de 3 px et étiquette « Passage utilisé » ; autres : fond léger, bordure pointillée de 2 px, sans étiquette. Chacun est précédé du texte masqué « Passage utilisé {j} sur {k} ». Défilement jusqu'au Passage actif, entièrement visible, saut immédiat avec `prefers-reduced-motion`. L'ambre est réservé aux Sources et aux Passages.
- **Page Document.** En-tête, badge, bandeau de Statut, barre d'actions, Lecteur. Focus sur le titre, ou sur le Passage visé (`tabindex="-1"`). « Poser une question » et « Générer le Résumé » seulement si *prêt* ; « Supprimer » pour l'Auteur seul. À 375 px, métadonnées et boutons s'empilent.
- **Bibliothèque.** Tableau (Titre, Catégorie, Auteur, Date d'ajout, Statut) ; un seul lien par ligne, le titre, la ligne restant cliquable à la souris ; le tri passe par sa liste, pas par les en-têtes. Recherche par titre après 250 ms. Nombre de Documents annoncé à chaque changement de filtre. Squelette de 8 lignes. Entre 768 et 1023 px, colonne Auteur reportée sous le titre.
- **FINITION à 375 px.** Cartes (titre, puis Catégorie · Auteur · date, puis badge), filtres repliés sous « Filtres ({n}) », recherche par titre visible, filtres dans l'URL et valeurs invalides ignorées.
- **Actualisation.** Toutes les 3 s tant qu'un Document affiché est *en cours*, sans déplacer focus ni défilement. Après 3 échecs : « Le Statut n'a pas pu être actualisé. » et « Actualiser », au-dessus de la liste ou dans le bandeau.
- **Suppression.** `AlertDialog` « Supprimer « {titre} » ? », focus par défaut sur « Annuler ». Succès : retour à la Bibliothèque et notification « Document supprimé. ». Refus serveur : « Cette action n'est pas autorisée. ». Supprimé pendant la consultation : « Ce Document a été supprimé. » et « Retour à la Bibliothèque », actions retirées, sans « Réessayer ». Erreur `no_text` : raison dans le bandeau, « Supprimer » pour l'Auteur, aucune relance.
- **États.** Reprendre tels quels les textes du catalogue pour les états vides (Base vide, « Mes Documents », filtres sans résultat avec « Réinitialiser les filtres ») et l'erreur de liste (« Cette liste n'a pas pu être chargée. », filtres conservés). Sur le Tableau de bord, une erreur reste confinée à la liste ; les actions restent utilisables.
- **Boutons.** `aria-disabled` plutôt que `disabled` ; état occupé dès le premier clic.

## Cross-Story Dependencies

- Ordre : 3.1 → 3.2 → 3.3, puis 3.5 et 3.4 ; 3.6 (FINITION) en dernier, seulement si un jour se libère ; sa coupe éventuelle est présentée à l'utilisateur aux points de contrôle du 18/11 et du 20/11 au soir, jamais décidée sans lui. Le 10/11 : 3.3 puis 3.5 ; 3.4 le 16/11.
- Rappel (le 10/11) : dès qu'une page prérendue affiche des données, étendre `check:secrets --static` aux pages prérendues.
- 3.1 s'appuie sur les Documents pièges de 2.8.
- 3.2 instaure une seule source d'état du Document pour le badge et le bandeau de Statut, afin de stabiliser les tests e2e `en cours : bandeau…` et `rafraîchissement périmé…` (`deferred-work.md`), sans augmenter leur délai.
- 3.4 complète l'action « Supprimer » du bandeau `no_text` de `StatusBanner`, reportée de 2.5. Elle peut précéder 2.6a : la suppression de l'objet Storage est alors testée dès la livraison de 2.6a.
- 3.5 réserve des emplacements pour le champ de Recherche (E4) et les dernières Conversations (E5) ; le bouton « Poser une question » du Tableau de bord arrive avec 5.2b.
- E4 et E5 valident le Lecteur en navigation réelle ; il doit donc rester réutilisable sans dépendre de la page.
