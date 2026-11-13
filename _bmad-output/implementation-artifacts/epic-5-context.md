# Epic 5 Context: Interroger l'Assistant et vérifier ses Sources

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Un Collaborateur pose une question à l'Assistant et obtient, en français et progressivement, une réponse fondée sur les Passages de la Base commune avec des Sources cliquables, ou un refus honnête quand l'information est absente ou hors cadre. Il poursuit la Conversation, la retrouve dans son Historique strictement privé, dans la limite d'un quota quotidien. C'est le cœur de la démonstration ; le premier risque technique à lever est l'affichage progressif à travers Vercel Hobby.

## Stories

- Story 5.0: Essai léger du flux sur Vercel
- Story 5.1: Stocker les Conversations de façon strictement privée
- Story 5.2a: Fonction `chat` : réponse sourcée côté serveur
- Story 5.2b: Page Assistant : poser une question et voir les Sources
- Story 5.3: Refus honnêtes et marqueurs
- Story 5.4: Validation des citations
- Story 5.5: Réponse progressive sur l'environnement Vercel
- Story 5.6: Conversations et Historique
- Story 5.7: Panneau Source
- Story 5.8: Questions de suivi
- Story 5.9: Idempotence des questions
- Story 5.10: Quota quotidien et remboursement
- Story 5.11: Erreurs et états de l'interface de l'Assistant
- Story 5.12: Navigation entre Passages et champ au-dessus du clavier (FINITION)

## Requirements & Constraints

- **Réponse.** En français, à partir des Passages seulement, sans fait inventé, contradictions signalées ; affichage progressif ; Sources cliquables vers le Passage utilisé. Une réponse sans citation vérifiable est un échec réessayable, sans quota.
- **Refus.** Information absente ou hors cadre : refus explicite, en bloc, distinct d'une panne.
- **Conversations.** Enregistrées automatiquement, titrées, triées, rouvrables et poursuivables ; strictement privées, y compris par URL directe. Questions de suivi comprises dans la Conversation.
- **Délais.** `chat` : 20 s jusqu'au premier octet, 90 s au total ; au-delà, panne avec « Réessayer », question conservée. Premier affichage en moins de 5 s en médiane sur Vercel (5.5).
- **Document supprimé.** Une Source dont le Document est supprimé reste affichée, « {titre} — Document supprimé », non cliquable (points complémentaires dans `deferred-work.md`, story 3.4).
- **Terminé.** Critères et tests verts, textes du catalogue UX, déploiement réussi, journal. Si la base ou une fonction change : `npm run deploy:supabase` avant le push.

## Technical Decisions

- **Frontières.** Le navigateur n'appelle que Next.js (pages, Server Actions, Route Handlers) ; jamais une Edge Function ni OpenAI. Chemin d'un appel à l'IA : navigateur → Route Handler Next.js (jeton du Collaborateur) → Edge Function → `_shared/ai.ts` → OpenAI. La clé OpenAI n'existe que dans les secrets Supabase. Aucun plan B n'autorise le navigateur à appeler une Edge Function.
- **Edge Functions exposées aux Collaborateurs** : `verify_jwt = true`, jeton revérifié auprès d'Auth, entrée revalidée, RLS et quota appliqués, aucune clé renvoyée. Modèle : `semantic-search` et son relais `src/server/search/semantic-search.ts`.
- **Flux.** `app/api/chat` : `maxDuration = 120`, `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, relais sans mise en tampon. Plan B (AD-16) si le flux est mis en tampon ou trop lent : B1 relais `ReadableStream` sans transformation, `X-Accel-Buffering: no`, sans compression ; B2 Route Handler en runtime Edge ; B3 (réponse d'un bloc, contraire à FR-16) seulement sur arbitrage de l'utilisateur.
- **Données.** `conversations`, `messages`, `message_sources` (`document_id` en `on delete set null`, `document_title` copié, `passages` jsonb) ; RLS propriétaire seul, tests à deux Comptes.
- **Idempotence et quota.** `client_request_id` sur chaque question (unicité partielle `role = user`) ; `reserve_ai_call` / `release_ai_call` selon l'issue.
- **Vercel.** Hobby, région des fonctions `fra1` (`vercel.json`), prouvée par `x-vercel-id` sur une requête exécutée par une fonction. Supabase `eu-central-1`.

## Cross-Story Dependencies

- 5.0 avant toute story Assistant : ses réglages de relais sont repris par 5.5 ; un échec déclenche B1, B2, puis l'arbitrage B3.
- 5.2a s'appuie sur la Recherche (4.1a, seuil 0,40) ; 5.7 réutilise le Lecteur de Document (3.1) et le 404 de suppression (3.4).
- Points de contrôle des 18/11 et 20/11 au soir : coupes présentées à l'utilisateur, jamais décidées sans lui.
