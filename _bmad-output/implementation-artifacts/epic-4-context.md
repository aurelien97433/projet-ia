# Epic 4 Context: Rechercher par le sens

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Un Collaborateur décrit ce qu'il cherche avec ses mots et obtient au plus 5 Documents pertinents, chacun avec son Passage, sans aucun texte rédigé par l'IA ; une Requête sans rapport avec la Base commune ne renvoie rien. La recherche côté serveur (`match_passages`) est la brique partagée avec l'Assistant (Epic 5) : mêmes Passages, même seuil. La navigation réelle d'un résultat vers son Passage dans la page Document est validée dans cet epic.

## Stories

- Tâche préalable : Document long au mini Jeu (terminée le 2026-11-10)
- Story 4.1a: Recherche sémantique côté serveur
- Story 4.1b: Page Recherche et champ du Tableau de bord
- Story 4.2: Premier calibrage et mesure de la Recherche

## Requirements & Constraints

- **Pertinence.** Documents classés par pertinence, chacun une seule fois, avec son Passage ; au plus 5 ; aucun score affiché ; aucun texte produit par l'IA. Cible : bon Document dans les 3 premiers pour au moins 8 Requêtes sur 10 (mesuré en 4.2).
- **Absence de résultat.** Sous le seuil de pertinence, la réponse est une liste vide, jamais une liste sans rapport.
- **Documents prêts seulement.** Un Document *en cours* ou *en erreur* n'apparaît jamais, même s'il contient le terme cherché.
- **Vitesse.** Recherche en moins de 3 s ; au-delà de 10 s, erreur `AI_TIMEOUT`.
- **Quota.** La Recherche ne consomme aucun quota (aucun appel de génération).
- **Accès.** Session de Collaborateur obligatoire à chaque étage ; refus sans jeton valide.
- **Terminé.** Critères et tests verts, `npm run deploy:supabase` avant le push quand la base ou une Edge Function change, déploiement Vercel réussi, entrée au journal de Vibe Coding.

## Technical Decisions

- **Chaîne d'appel.** Navigateur → Route Handler Next.js (vérifie la session) → Edge Function `semantic-search` (vérification JWT activée, client Supabase avec le jeton du Collaborateur) → vectorisation de la Requête par `_shared/ai.ts` › `embed` (seul point d'appel OpenAI) → fonction SQL `match_passages`. Le navigateur n'appelle jamais une Edge Function ni OpenAI. Jamais de `service_role` hors de `process-document` et du préchargement.
- **`match_passages(query_embedding, min_similarity, max_passages, max_per_document)`.** `security invoker` (RLS appliquée), Passages de Documents `ready` et de la version de vectorisation active (`EMBEDDING_MODEL`, `EMBEDDING_VERSION` de `_shared/config.ts`), similarité cosinus ≥ seuil. Recherche : 1 Passage par Document, 5 Documents. Assistant (5.2a) : 8 Passages, 3 par Document. `REVOKE` de `public` et `anon`, `GRANT EXECUTE` explicite à `authenticated` (toute nouvelle fonction en a besoin).
- **Seuil `RAG_MIN_SIMILARITY`.** Commun à la Recherche et à l'Assistant, 0,40 au départ (hypothèse), remplaçable par un secret Supabase, calibré en 4.2.
- **Vectorisation.** `text-embedding-3-small`, 1 536 dimensions, dimension vérifiée. Vectorisation simulée (`EMBEDDINGS_FAKE=1`) sur la pile locale seulement : déterministe et lexicale, elle ne mesure pas la pertinence réelle.
- **Erreurs.** Forme unique `{ error: { code, message, retryable } }` ; `AI_UNAVAILABLE`, `AI_TIMEOUT`, `AI_BUDGET_EXHAUSTED`, `VALIDATION_FAILED`, `UNAUTHENTICATED` ; texte du catalogue, détail technique dans les journaux seulement.
- **Requête.** 1 à 500 caractères (hypothèse), revalidée par chaque étage.
- **Positions.** Le Passage d'un résultat porte ses positions (`start_offset`, `end_offset`) en unités de code JavaScript dans le texte canonique, transmises à la page Document par `?passages=…&actif=…`.

## UX & Interaction Patterns

- **Page Recherche (4.1b).** Phrase d'aide « Décrivez ce que vous cherchez avec vos propres mots. », champ et « Rechercher » ; trois cartes squelettes ; « {n} Documents pertinents » annoncé ; cartes titre, Catégorie, Passage pertinent surligné, sans score ; état sans résultat avec « Poser la question à l'Assistant » ; erreur « La Recherche n'a pas pu aboutir. » + « Réessayer », Requête conservée.
- **Tableau de bord (4.1b).** Champ « Rechercher dans les Documents… » en tête de la bande d'actions (emplacement prévu en 3.5), focus initial, Entrée → `/recherche?q=…`.
- **Page Document.** Le résultat ouvre le Document au Passage, avec l'étiquette « Passage pertinent ».

## Cross-Story Dependencies

- 4.1a dépend du mini Jeu préchargé (2.8 et Document long) et de la page Document (3.2, paramètres `passages` et `actif`).
- 4.1b dépend de 4.1a et de l'emplacement du Tableau de bord (3.5).
- 4.2 mesure et calibre le seuil sur le projet distant (vrais vecteurs), avec un Compte de mesure ; écart possible entre seuil local (simulé) et distant.
- 5.2a réutilise `match_passages` et le même seuil (8 Passages, 3 par Document).
- Différé à examiner en 4.2 : intertitres en fin de Passage (`deferred-work.md`).
