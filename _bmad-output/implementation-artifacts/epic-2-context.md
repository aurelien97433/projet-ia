# Epic 2 Context: Ajouter des Documents et suivre leur traitement

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Un Collaborateur ajoute une Note ou un fichier .txt/.md et suit son Statut de traitement (*en cours*, *prêt*, *en erreur*). Le texte est découpé en Passages et vectorisé dans les Edge Functions Supabase, seules détentrices de la clé OpenAI. L'epic pose d'abord l'accès sûr et borné à l'IA (2.1). Il construit ensuite le traitement sur une Note (2.2 à 2.5), puis l'import de fichiers (2.6a, 2.6b). Il se termine par un mini Jeu de démonstration en Notes (2.8), pour que la Recherche et l'Assistant puissent être testés tôt.

## Stories

- Story 2.1 : Préparer l'accès à l'IA (prérequis)
- Story 2.2 : Créer une Note
- Story 2.3 : Déclencher le traitement et suivre le Statut
- Story 2.4 : Traiter une Note jusqu'à « prêt »
- Story 2.5 : Erreurs de traitement, expiration et relance
- Story 2.6a : Déposer et importer un fichier .txt ou .md
- Story 2.6b : Lire le texte des fichiers importés
- Story 2.7 : Test de charge de la limite de 1 Mo
- Story 2.8 : Mini Jeu de démonstration
- Story 2.9 : Protéger une saisie en cours (FINITION)

## Requirements & Constraints

- **Secrets.** Aucune clé secrète n'est envoyée au navigateur ni versionnée.
  - `OPENAI_API_KEY` n'existe que dans les secrets Supabase (en local : `supabase/functions/.env`, ignoré par git).
  - Aucun script local ni Next.js ne la reçoit, et elle n'apparaît jamais dans un document ni dans une conversation.
  - `check:secrets` reste vert.
- **Coûts.**
  - Projet OpenAI dédié, avec un crédit prépayé de 10 $, une alerte à 5 $ et sans recharge automatique.
  - Un refus de plafond du fournisseur devient `AI_BUDGET_EXHAUSTED` : distinct du quota, journalisé.
  - La vectorisation ne consomme pas de quota.
- **Taille.** Note, `.txt` et `.md` : 1 Mo au plus, soit 1 000 000 octets en UTF-8, avec la même définition partout.
- **Traitement.**
  - Asynchrone, avec une expiration à 3 min calculée en base (Statut effectif).
  - Relance possible seulement après une erreur temporaire.
  - Aucune tentative périmée ne peut remettre un Document à *prêt*.
- **Interface.** Statut interrogé toutes les 3 s tant qu'un Document est *en cours*. Message après 60 s. Saisie conservée en cas d'échec d'envoi. Textes du catalogue.
- **Tests.** Les tests d'intégration tournent sur Supabase local. Le fournisseur est simulé dans les tests unitaires, avec un seul test réel de l'IA.

## Technical Decisions

- **Accès à l'IA.**
  - Tous les appels OpenAI passent par `supabase/functions/_shared/ai.ts`, en `fetch` sans SDK. Le module expose `embed` (puis plus tard `streamAnswer`, `rewriteFollowUp`, `summarize`) et centralise modèles, délais, nouvelles tentatives et traduction des erreurs.
  - Next.js ne contient ni clé ni SDK OpenAI. Le navigateur n'appelle jamais une Edge Function, et les Edge Functions n'importent rien de `src/`.
- **Modèles.**
  - Génération : `gpt-5.4-mini`.
  - Vectorisation : `text-embedding-3-small`, 1 536 dimensions.
  - `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `EMBEDDING_VERSION` et `GENERATION_MODEL` sont définis une seule fois dans `_shared/config.ts`.
  - La dimension est vérifiée à chaque écriture et à chaque requête : un écart est refusé.
  - Chaque Passage enregistre `embedding_model` et `embedding_version`.
- **Tentatives et délais.**
  - Embeddings et appels non diffusés : 2 nouvelles tentatives sur `429` et `5xx`.
  - Délais : `semantic-search` 10 s, `chat` 20 s jusqu'au premier octet et 90 s au total, `summarize` 120 s. Au-delà : `AI_TIMEOUT`.
  - Vectorisation par lots de 96.
- **Erreurs.**
  - Forme unique `{ error: { code, message, retryable, resetAt? } }`, avec la liste de codes commune à Next.js et aux Edge Functions (`_shared/errors.ts`). Next.js relaie les codes tels quels.
  - Journalisation JSON (`event`, `code`, identifiants, durée), sans secret, jeton ni texte de Document.
- **Traitement (`process-document`).**
  - Next.js crée le Document (`processing`, `attempt_id` neuf, `processing_started_at`), puis appelle la fonction avec `PROCESS_DOCUMENT_SECRET` et attend son `202`.
  - La fonction travaille en `EdgeRuntime.waitUntil`, puis appelle `complete_processing` ou `fail_processing`, conditionnés par la tentative courante.
  - Si l'appel échoue en 5 s, Next.js appelle `abandon_processing` avec le jeton du Collaborateur.
- **Texte canonique.** NFC, fins de ligne `\n`. Positions des Passages en unités de code JavaScript. Affichage en texte brut. Décodage UTF-8 strict, avec repli sur Windows-1252.
- **Fichiers.** Dépôt direct dans le Storage privé `documents` par URL signée (`{author_id}/uploads/{upload_id}`). Vérification et type MIME déduits côté serveur, par l'extension.
- **Privilèges.** `REVOKE EXECUTE` global de `PUBLIC` sur les fonctions : toute fonction SQL appelable par un Collaborateur reçoit un `GRANT EXECUTE … TO authenticated` explicite. `profiles` n'est lisible que sur `id`, `display_name` et `created_at`.
- **Local.** Edge runtime `per_worker`. `deploy:supabase` déploie migrations et fonctions sur le projet lié, avec contrôle de la cible.

## Cross-Story Dependencies

- 2.1 dépend de 1.1. 2.2 dépend de 1.4.
- Chaîne de dépendances :
  - 2.2 → 2.3 → 2.4 (qui dépend aussi de 2.1) → 2.5 → 2.6a → 2.6b → 2.7 ;
  - 2.8 dépend de 2.4 ;
  - 2.9 (FINITION) dépend de 2.6a.
- Revue par trois relecteurs pour les stories sensibles : 2.3, 2.4, 2.5 et 2.6a.
- Chaque Server Action d'un écran protégé (dès 2.2) vérifie la session elle-même (report de la story 1.4).
- 2.7 est tranchée avant 5.2a, au plus tard le 18/11. 2.8 alimente E3, E4 et E5.
