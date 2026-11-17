# Epic 5 Context: Interroger l'Assistant et vérifier ses Sources

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Un Collaborateur pose une question à l'Assistant et obtient, en français et progressivement, une réponse fondée sur les seuls Passages de la Base commune avec des Sources cliquables, ou un refus honnête quand l'information est absente ou hors cadre. Il poursuit la Conversation et la retrouve dans son Historique strictement privé, dans la limite d'un quota quotidien. C'est le chemin critique de la démonstration : on n'y coupe jamais une story P0. 5.0 à 5.3 sont livrées ; la suite (citations, flux réel sur Vercel, Historique, panneau Source, suivi, idempotence, quota) reste à faire.

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
- Story 5.10: Quota quotidien et remboursement (fusionnée avec 5.11 : une spec, une livraison)
- Story 5.11: Erreurs et états de l'interface de l'Assistant (fusionnée avec 5.10)
- Story 5.12: Navigation entre Passages et champ au-dessus du clavier (FINITION, hors périmètre du rendu)

## Requirements & Constraints

- **Réponse.** En français, à partir des Passages seulement, sans fait inventé ; une contradiction est une réponse sourcée qui cite les deux Documents et les deux valeurs. Affichage progressif ; Sources cliquables vers le Passage utilisé. Une réponse sans citation valide est un échec réessayable.
- **Refus.** Information absente (trois suites) ou hors cadre (« Reformuler la question » seule) : bloc d'un seul tenant, sans Source, distinct d'une panne.
- **Quota (règle de libération).** 60 questions par Compte et par jour UTC, plafond global de 300 pour le projet (table `ai_limits`, modifiable par SQL). L'unité n'est rendue **que si aucun appel facturable n'a abouti** : rendue pour une panne avant génération, `AI_UNAVAILABLE` sans réponse reçue (génération ou appel court), `AI_BUDGET_EXHAUSTED`. Consommée pour une réponse validée, **tout refus (appel court compris)**, `AI_CITATIONS_INVALID`, `AI_OUTPUT_INVALID` (marqueur absent ou invalide inclus) et `AI_TIMEOUT` après envoi. Aucune réservation pour `QUOTA_EXCEEDED`, `AI_DAILY_CAP_REACHED`, `VALIDATION_FAILED`, `REQUEST_IN_PROGRESS`, un rejeu. La reformulation de suivi ne compte pas. Les critères « sans quota consommé » de 5.8, 5.10 et 5.11 s'appliquent selon cette règle.
- **Conversations.** Créées au premier envoi accepté (titre = première question), triées par dernier échange, rouvrables et poursuivables ; strictement privées, y compris par URL directe (page « introuvable » sans rien révéler).
- **Délais.** Réponse d'un bloc (jusqu'à 5.4) : `chat` 60 s (génération 40 s), relais 70 s, `maxDuration` 120 s. Flux (dès 5.5) : 20 s jusqu'au premier octet, 90 s au total ; premier affichage < 5 s en médiane sur Vercel. Reformulation 10 s. Au-delà : panne avec « Réessayer », question conservée.
- **Question.** 2 000 caractères au plus (`zod`, contrôlé aussi côté serveur).
- **Document supprimé.** La Source reste affichée, « {titre} — Document supprimé », non cliquable.
- **Acceptation sur sortie du modèle.** Résultat observable et 3 essais sur 3. `npm run test:chat:live` couvre 12 questions (q1, p1, h1, capitale de l'Australie, 3 essais chacune). Mesure de la 5.8 réduite à 2 scénarios (FR-19, UJ-3).
- **Terminé.** Critères et tests verts, textes du catalogue UX, `npm run deploy:supabase` avant le push si la base ou une fonction change, déploiement Vercel, entrée au journal de Vibe Coding. Relecteurs séparés sur 5.4, 5.9 et 5.10.

## Technical Decisions

- **Frontières.** Navigateur → Route Handler Next.js (jeton du Collaborateur) → Edge Function `chat` → `_shared/ai.ts` → OpenAI. Le navigateur n'appelle jamais une Edge Function ni OpenAI ; la clé OpenAI n'existe que dans les secrets Supabase. Edge Functions : `verify_jwt = true`, jeton revérifié, entrée revalidée, RLS et quota appliqués.
- **Recherche.** `match_passages` partagée avec la Recherche : 8 Passages au plus, 3 au plus par Document, seuil commun (0,40 de départ). Passages balisés `<passage id="P{n}" document="…">`, contenu et titre neutralisés, jamais traités comme des instructions ; sortie affichée en texte, jamais en HTML.
- **Marqueur.** Première ligne : `REPONSE`, `REFUS_INFO_ABSENTE` ou `REFUS_HORS_CADRE`, 40 caractères au plus, tolérance limitée aux espaces, à la casse et aux astérisques autour du mot. Retiré, jamais affiché ni stocké. Aucun Passage au-dessus du seuil : appel court limité au marqueur. Lecteur pur `_shared/rag/marker.ts`, réutilisé par la diffusion en 5.5.
- **Citations.** `[P{n}]` validées en fin de génération (`_shared/rag/citations.ts`) : invalides retirées et journalisées ; Sources regroupées par Document, numérotées dans l'ordre de première citation. Aucune valide : `AI_CITATIONS_INVALID`, échec `kind = failure` enregistré, pas de régénération automatique. En flux, `chat` masque les `[P{n}]` (tampon d'un `[P` coupé) ; l'événement final `done` porte le texte validé, la position des renvois et les Sources, et remplace le texte provisoire.
- **Renvois enregistrés (décision du 2026-11-17, Q1 = A).** `chat` enregistre et renvoie le texte avec des renvois canoniques `[S{n}]` (n = numéro de la Source) à la place des citations valides ; la page les affiche en renvois ¹ ² ; aucune migration.
- **Flux.** `app/api/chat` : `maxDuration = 120`, `text/event-stream`, `Cache-Control: no-cache, no-transform`, relais sans tampon (réglages retenus en 5.0). Plan B si tampon ou lenteur : B1 `ReadableStream` sans transformation, `X-Accel-Buffering: no`, sans compression ; B2 runtime Edge ; B3 (réponse d'un bloc) seulement sur arbitrage de l'utilisateur.
- **Suivi.** `rewriteFollowUp` à partir des 3 derniers échanges dès le deuxième message ; recherche sur la question autonome, enregistrée dans `messages.standalone_question` ; la génération reçoit Passages, 3 derniers échanges et question d'origine.
- **Ordre dans `chat`.** Validation → recherche du `client_request_id` (réponse déjà enregistrée : rejeu sans appel ; échec ou sans réponse depuis > 90 s : réessai qui remplace le message `failure` ; en cours depuis < 90 s : `REQUEST_IN_PROGRESS` 409) → `reserve_ai_call` → création de la Conversation et de la question → génération. La réponse ou l'échec est enregistré même si le navigateur s'est déconnecté.
- **Données.** `conversations`, `messages` (unicité `owner_id` + `client_request_id` pour `role = user` seulement), `message_sources` (`document_id` en `on delete set null`, `document_title` copié, `passages` jsonb). RLS propriétaire seul ; seule modification permise : `last_message_at` et remplacement de son message `failure`. Quota : `reserve_ai_call` / `release_ai_call(p_reservation_id)` (`security definer`, atomiques, libération unique par réservation).
- **Erreurs.** Forme unique `{ error: { code, message, retryable, resetAt? } }`, message du catalogue UX, détail technique seulement dans les journaux. Plafond fournisseur (`429` `project_spend_limit_exceeded`) → `AI_BUDGET_EXHAUSTED`. `GET /api/quota` renvoie utilisation, limite et `resetAt` du seul Collaborateur connecté.
- **Vercel.** Hobby, fonctions en `fra1` ; Supabase `eu-central-1`.

## UX & Interaction Patterns

- **Réponse en trois temps.** État neutre « Recherche dans les Documents… » qui ne préjuge pas de l'issue ; réponse sourcée écrite progressivement, provisoire (`aria-busy`), « Envoyer » inactif jusqu'à la confirmation ; puis réponse finale avec renvois ¹ ² (non cliquables, précédés du texte masqué « Source ») et puces. Refus : bloc d'un coup après l'état neutre. Panne : alerte rouge à la place de la réponse, texte provisoire retiré, question conservée, focus sur le message.
- **Puce de Source.** « {n} · {titre} » (« · {k} Passages » si plusieurs), `button` avec `aria-expanded`, nom accessible « Source {n} : {titre}, {k} Passages ». Seules les Sources citées apparaissent.
- **Puces non interactives jusqu'à la 5.7 (décision du 2026-11-17, Q2 = A).** En 5.4, les puces sont des éléments de liste numérotés, sans `button` ni `aria-expanded` ; la 5.7 leur donne leur action.
- **Panneau Source.** À droite, la Conversation reste visible ; titre, Catégorie, Auteur, date, Statut, « Ouvrir la page complète » ; défile jusqu'au Passage mis en évidence ; Échap ou ✕ rend le focus à la puce. Sous 1024 px : `Sheet` modal (plein écran sous 768 px) avec « ← Retour à la Conversation ».
- **Historique.** Bouton « Historique » de l'en-tête, panneau à gauche placé avant le fil dans le DOM, focus sur la Conversation active. État vide de l'Assistant et Tableau de bord : 5 dernières Conversations et « Voir tout l'Historique ».
- **Quota atteint.** Bloc neutre (pas rouge) affiché d'emblée, `{moment}` en heure locale du prochain 00:00 UTC (« demain à 1 h 00 ») ; champ et « Envoyer » en `aria-disabled` avec la raison « Limite quotidienne atteinte » (`aria-describedby`) ; lien « Ouvrir la Recherche » ; réactivation sans rechargement. Plafond global : texte propre, distinct du quota personnel.
- **Champ.** Entrée envoie, Maj+Entrée va à la ligne (Entrée = ligne sur écran tactile), compteur « n / 2 000 », `isComposing` respecté. L'Assistant dit « je » ; l'interface jamais.

## Cross-Story Dependencies

- Ordre strict : chaque story dépend de la précédente ; 5.5 reprend aussi les réglages de relais de 5.0, et un échec de mesure déclenche B1, B2, puis l'arbitrage B3.
- 5.7 réutilise le Lecteur de Document (3.1) et l'état « Document supprimé » (3.4) ; 5.4 et 5.8 s'appuient sur le mini Jeu (`questions-mini.json` : c1 pour la contradiction, f1 et UJ-3 pour le suivi).
- 5.10 + 5.11 précèdent l'Epic 6 : le Résumé réutilise la réservation de quota.
- Calendrier : 17/11 5.3 et 5.4 ; 18/11 5.5 ; 19/11 5.6 et 5.7 ; 20/11 5.8 et 5.9 ; 23/11 5.10 + 5.11. Points de contrôle les 18/11 et 20/11 au soir : les coupes sont présentées à l'utilisateur, jamais décidées sans lui.
