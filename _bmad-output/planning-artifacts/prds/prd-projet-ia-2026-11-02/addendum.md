# Addendum — PRD NexaMind AI

Éléments utiles aux phases suivantes (architecture, UX) qui n'ont pas leur place dans le PRD.

## Décisions produit structurantes

Les décisions D2 (formats et traitement des Documents) et D3 (Catégories) sont entièrement décrites dans le PRD (§4.3 et §4.4) ; seules D1 et D4 ont des conséquences d'architecture détaillées ici.

### D1 — Base commune (visibilité des Documents)

- **Retenu :** une seule Base commune. Tout Collaborateur connecté peut ajouter des Documents, les consulter et les interroger via l'Assistant, qui répond à partir de toute la Base commune. Seul l'Auteur modifie ou supprime son Document. Les Conversations restent privées.
- **Écartés :** (B) base commune avec rôle éditeur ou administrateur — plus réaliste mais plus coûteux, reporté en évolution ; (C) espace personnel par Collaborateur — ne répond pas au besoin de partage du savoir.
- **Conséquences pour l'architecture :** règles d'accès au niveau des données : lecture des Documents ouverte à tout Collaborateur connecté ; écriture et suppression réservées à l'Auteur ; Conversations et messages lisibles uniquement par leur propriétaire.

### D4 — Recherche sémantique distincte de l'Assistant, même moteur

- **Retenu :** une Recherche sémantique qui renvoie des Documents et leurs Passages sans réponse rédigée, en plus de l'Assistant.
- **Écarté :** l'Assistant seul — couvre moins bien le volet « recherche dans les ressources » du challenge.
- **Conséquences pour l'architecture :** la Recherche sémantique et l'Assistant partagent les étapes 1 à 4 de la chaîne ci-dessous ; seul l'Assistant appelle le modèle de génération. Le coût de construction de la recherche est donc faible, et elle ne consomme pas d'appel de génération.

## Contexte technique déjà en place

- Projet **Next.js 16** (App Router, TypeScript, Tailwind) initialisé dans le dépôt.
- **Supabase** intégré : clients navigateur et serveur, rafraîchissement de session via `src/proxy.ts`. Un projet Supabase de développement existe.
- Approche cohérente avec la stack « Next.js + Supabase + IA + vector store » citée par le challenge : Supabase Auth (Comptes), Postgres + pgvector (base vectorielle), Supabase Storage (fichiers d'origine).

## Chaîne RAG attendue par le challenge (à concevoir en architecture)

1. Ingestion : extraction du texte (Note, .txt/.md, PDF texte) ; détection des fichiers sans texte exploitable.
2. Découpage en Passages, en conservant la position de chaque Passage dans le Document.
3. Vectorisation et indexation.
4. Recherche sémantique avec seuil de pertinence (sert FR-14/FR-15 et FR-18).
5. Injection des Passages retenus dans le prompt, balisés comme données (NFR-10).
6. Génération de la réponse contextualisée avec citations de Sources.
   - **Réponse ou refus connu avant tout affichage (UX, écart X12) — arbitré en architecture (AD-10, AD-11).** Pendant la recherche et la préparation, l'interface affiche un état neutre (« Recherche dans les Documents… »). La sortie du modèle commence par un marqueur interne à trois valeurs, `REPONSE`, `REFUS_INFO_ABSENTE` ou `REFUS_HORS_CADRE`, que le serveur consomme et n'affiche ni ne stocke. Sur `REPONSE`, le serveur diffuse le texte progressivement ; la réponse reste provisoire jusqu'à la validation des citations. Sur un refus, le serveur n'affiche pas le texte du modèle et renvoie le refus standard correspondant (FR-18), sans Source : « information absente » avec Reformuler, Rechercher et Ajouter un Document ; « hors cadre » avec Reformuler seulement. Une contradiction entre Passages (FR-16) reste une `REPONSE`, signalée dans le texte avec ses Sources. Marqueur absent ou invalide : la sortie n'est pas affichée et le cas est traité comme une panne technique, avec « Réessayer ». **Validation des citations (AD-11) :** après génération, chaque citation est contrôlée contre les Passages réellement transmis ; les citations invalides sont retirées et journalisées ; si aucune n'est valide, le texte est retiré, rien n'est enregistré comme réponse, aucun quota n'est consommé et l'interface affiche « Je n'ai pas pu vérifier cette réponse à partir des Documents. Veuillez réessayer. » avec « Réessayer ». Le délai du premier affichage reste soumis à NFR-3. Source : `ux-designs/ux-projet-ia-2026-11-03/EXPERIENCE.md`, E4 et écart X12.

## Points d'attention pour l'architecture

Ces points sont désormais arbitrés dans `architecture/architecture-projet-ia-2026-11-03/architecture-nexamind-ai.md` (AD-1 à AD-21), qui fait foi en cas d'écart : traitement dans des Supabase Edge Functions, module IA unique, quota de 60 appels par jour (remise à zéro à 00:00 UTC), plafond OpenAI de 10 $, hébergement Vercel Hobby + Supabase Free.

- **Position des Passages (FR-10, FR-17).** Chaque Passage stocke sa position dans le texte du Document (par exemple décalages de début et de fin), pour ouvrir le Document au bon endroit et mettre le Passage en évidence. Chaque Source enregistrée dans une Conversation doit référencer le Passage et une version du texte du Document, afin de détecter qu'une Note a été modifiée depuis la réponse (FR-17) ou qu'un Document a été supprimé (FR-12).
- **Questions de suivi (FR-19).** Avant la recherche, une question de suivi est reformulée en question autonome à partir de l'historique de la Conversation (« Et après combien de jours ? » devient « Après combien de jours relancer un client selon la procédure de relance ? »). La recherche porte sur cette reformulation, pas sur la question brute.
- **Stockage privé des fichiers d'origine.** Les fichiers importés sont stockés dans un espace non public, accessible uniquement aux Collaborateurs connectés (téléchargement P2, FR-10). Aucune URL publique permanente.
- **Contrôle d'accès** au niveau des données (NFR-1), pas seulement dans l'interface (voir D1).
- **Seuil de pertinence.** Il conditionne à la fois FR-15 et FR-18 : à calibrer avec le Jeu de démonstration.
- **Contradictions (FR-16).** Le prompt doit demander explicitement de signaler les Passages contradictoires plutôt que d'en choisir un.
- **Traitement non bloquant.** Le Statut de traitement implique un traitement asynchrone, ou au moins non bloquant, de l'ajout ; la relance d'un traitement en erreur temporaire (FR-7) doit être possible sans réimporter.
  - **Traitement bloqué (UX, écart X11) — arbitré en architecture (AD-5, AD-6).** Pour éviter tout chargement infini (NFR-4) : jusqu'à 60 secondes, l'interface indique que le Document sera interrogeable dans quelques instants ; au-delà de 60 secondes, elle indique que le traitement prend plus de temps que prévu et qu'on peut quitter la page sans l'interrompre ; après 3 minutes sans fin de traitement, le **serveur** fait passer le Document *en erreur* temporaire (« Le traitement n'a pas pu aboutir. Vous pouvez le relancer. »). Les délais se comptent depuis l'horodatage serveur du début du traitement, pour rester exacts après un rechargement et pour tous les Collaborateurs. Seul l'Auteur voit « Relancer le traitement » ; les autres voient le Statut et le message. Le Document n'est pas interrogeable (FR-8). Un traitement qui aboutirait en retard ne remet pas le Document à *prêt* sans contrôle : la relance repart d'un état propre. Le seuil de 60 secondes est indicatif (NFR-3) ; le délai de 3 minutes est une valeur de départ. Source : `ux-designs/ux-projet-ia-2026-11-03/EXPERIENCE.md`, E7 et écart X11.
- **Coûts (NFR-8).** Pour une question, seuls les Passages retenus sont transmis au modèle, jamais les Documents entiers. Le Résumé (FR-23) porte, lui, sur le Document entier : un Document long peut être résumé par morceaux puis synthétisé. Compteur d'appels IA par Collaborateur et par jour, vérifié avant chaque appel ; plafond de dépense configuré chez le fournisseur. Le quota doit au minimum permettre de mesurer SM-1 à SM-3 et de faire la démonstration.
- **Secrets (NFR-2).** Les clés du fournisseur d'IA restent côté serveur.

## Évolutions possibles après le MVP

- Rôle éditeur ou administrateur (option B de D1).
- Inscription sur invitation ou restreinte au domaine e-mail, confirmation de l'e-mail, réinitialisation du mot de passe.
- Formats supplémentaires (Word, OCR).
- Reformulation, aide à la rédaction, extraction d'informations, suggestion de ressources liées.
- Limitation des réponses de l'Assistant à une Catégorie.
