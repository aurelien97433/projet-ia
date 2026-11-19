---
title: 'Story 5.6 : Conversations et Historique'
type: 'feature'
created: '2026-11-18'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1aeaf13148ed54cc907c7b039c5aba8fc55f6082'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-5-réponse-progressive-sur-vercel.md'
  - '{project-root}/_bmad-output/implementation-artifacts/5-1-stocker-les-conversations-de-facon-strictement-privee.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Chaque question crée aujourd'hui sa propre Conversation, et la page Assistant n'affiche qu'un échange, sans adresse : une Conversation enregistrée ne peut être ni retrouvée, ni rouverte, ni poursuivie (FR-20), et le Tableau de bord n'affiche pas les Conversations (FR-3). La confidentialité (FR-22) n'est prouvée qu'au niveau des données (5.1), pas à l'écran.

**Approach:** Route `/assistant/[id]` lue côté serveur avec le jeton du Collaborateur (E9 si absente ou d'un autre Compte), fil de tous les échanges, question suivante ajoutée à la même Conversation (`chat` accepte un `conversationId` ; nouvelle fonction SQL `add_question`). Panneau Historique (`Sheet` à gauche), 5 dernières Conversations dans l'état vide de l'Assistant et sur le Tableau de bord. Reports traités : repères `[P{n}]` des anciennes réponses masqués à l'affichage, Conversations sans réponse signalées. Déploiement : `deploy:supabase` (migration + `chat`) puis push.

## Boundaries & Constraints

**Always:**
- **Lecture d'une Conversation** (`/assistant/[id]`, Server Component, `connection()` comme la page Document) : identifiant non UUID, Conversation absente ou d'un autre Compte → `notFound()` → E9, sans rien révéler (UX-DR29, FR-22). Lecture par le client Supabase de la session (RLS), jamais `service_role`. Messages triés par `created_at`, Sources par `ordinal`.
- **Fil** : tous les échanges, chacun « Vous » puis « Assistant » (texte masqué pour les lecteurs d'écran, liste de messages) ; réponse avec renvois ¹ ² et puces de la 5.4 ; refus avec le bloc de la 5.3 ; Source d'un Document supprimé « {titre} — Document supprimé » (déjà en place). En-tête : titre de la Conversation (h1), « Historique », « + Nouvelle Conversation ». Le champ reste en bas ; le focus va dans le champ à l'ouverture.
- **Règles d'affichage d'un échange** (module pur, testé) :
  1. une réponse ou un refus enregistré l'emporte sur un échec de la même question (cas « réponse ET échec » reporté à la 5.9) ;
  2. échec seul → alerte de panne avec le message du catalogue pour son `error_code` ; « Réessayer » seulement sur le **dernier** échange du fil ;
  3. question sans message de l'Assistant depuis moins de 90 s (AD-16) → état neutre « Recherche dans les Documents… », la page se recharge toutes les 5 s jusqu'à un résultat ou 90 s ; au-delà de 90 s → traité comme un échec `AI_TIMEOUT` (règle 2).
- **Anciennes réponses (report de la 5.4)** : les repères bruts `[P{n}]` (et toute forme reconnue par `CITATION_LIKE`) des réponses enregistrées avant la 5.4 sont retirés **à l'affichage** (fonction pure, avec l'espace qui les précède), sans renvoi ; les puces de Source restent affichées sous la réponse. Aucune ligne n'est modifiée en base. `[S{n}]` garde le rendu de la 5.4. Vérifié par un test sur un texte réel de la 5.2b (« … 5 jours ouvrés [P2]. »).
- **Poursuivre** : sur `/assistant/[id]`, une question envoie `{ question, clientRequestId, conversationId }`. `chat` : `conversationId` optionnel (UUID) ; s'il est fourni, existence vérifiée par lecture RLS **avant** la réservation (absente ou d'un autre Compte → 404 `NOT_FOUND`, aucune réservation) ; puis `add_question(p_conversation_id, p_question, p_client_request_id)` (`security invoker`, `GRANT EXECUTE TO authenticated` seul, `last_message_at` avancé, 23505 → même traitement que `start_conversation`) à la place de `start_conversation`. Sans `conversationId` : comportement actuel. Aucune reformulation ni historique transmis au modèle (story 5.8) : la question est cherchée telle quelle.
- **Nouvelle Conversation** : sur `/assistant`, dès que `chat` renvoie un `conversationId` (`done`, `refusal`, ou `error` qui le porte, voir Q3), l'adresse devient `/assistant/{id}` (`history.replaceState`, sans rechargement ni perte du texte affiché) ; les questions suivantes vont dans cette Conversation.
- **Historique (E4b, UX-DR16)** : bouton « Historique » de l'en-tête de l'Assistant (sur `/assistant` et `/assistant/[id]`) ; `Sheet` modal à gauche à toutes les largeurs (plein écran sous 768 px), placé avant le fil dans le DOM ; focus sur la Conversation active (`aria-current="page"`), sinon sur la première ligne ; ligne = titre + date du dernier échange (`fr-FR`, fuseau du navigateur) ; choisir une ligne ouvre la Conversation, ferme le panneau et place le focus dans le champ ; Échap rend le focus à « Historique ». Données : `GET /api/conversations?limit=` (session vérifiée, 100 au plus, du plus récent au plus ancien, forme AD-19 en erreur). Vide : « Aucune Conversation pour le moment. » + « Poser une première question ». Erreur : « L'Historique n'a pas pu être chargé. » + « Réessayer ». Chargement : squelettes, message des 10 s.
- **Conversation sans réponse dans les listes** (report de la 5.2b, en attendant la 5.9) : voir Q2.
- **5 dernières Conversations** : sous le champ de l'Assistant sans Conversation active, et section « Mes dernières Conversations » du Tableau de bord (deux colonnes ≥ 1024 px, Conversations d'abord à 375 px, H10), chacune avec « Voir tout l'Historique » (`/assistant?historique=1` ouvre le panneau). Vide : « Vous n'avez pas encore posé de question. » + deux exemples du mini Jeu (« Comment poser mes congés ? », « Comment relancer un client qui n'a pas payé ? ») qui **préremplissent** le champ par `?question=` (comportement de la 3.5, aucune unité consommée sans envoi ; écart avec « déjà envoyée » d'EXPERIENCE.md consigné).
- **Lecture des listes** : vue `conversation_list` (`security_invoker = true`) : `id`, `title`, `last_message_at`, `unanswered` (booléen calculé selon les règles d'affichage ci-dessus sur le dernier échange). Aucun droit pour `anon`.
- **Textes** : catalogue `texts.ts` ; tout texte nouveau ajouté à EXPERIENCE.md dans le même commit.
- **Next.js 16** : lire `node_modules/next/dist/docs/` (routes dynamiques, `PageProps`, `params` asynchrones, Cache Components, `connection()`) avant d'écrire la route.
- **Tests** : intégration (FR-22 à deux Comptes : B ne lit ni n'ajoute une question à la Conversation de A, `add_question` sur une Conversation de A → refusé sans réservation consommée ; vue limitée au propriétaire ; `anon` sans accès ; `last_message_at` avancé) ; unitaires (règles d'affichage, retrait des `[P{n}]`, schémas, route `GET /api/conversations`, `chat` avec `conversationId`) ; e2e sur les deux largeurs (rouvrir et poursuivre, Historique au clavier, Tableau de bord, états vide/erreur, B → E9, déconnexion puis reconnexion, rechargement d'une question en cours, 375 px sans défilement horizontal, frontière réseau inchangée).
- **Revue** : un relecteur séparé (décision de l'utilisateur du 2026-11-18), centré sur FR-22 (route, API, vue, `add_question`, `chat`) avec les exigences S1 à S4, les règles d'affichage et la non-régression du flux de la 5.5.

**Ask First:** tout changement de la règle de quota ; toute écriture sur les anciennes lignes de `messages` ; découpage de la story.

**Never:** suppression de Conversation (FR-21, P1) ; reformulation de suivi ou historique transmis au modèle (5.8) ; rejeu ou remplacement de l'échec par « Réessayer » (5.9) ; modification du marqueur, des citations, du masquage en flux ou des délais de la 5.5 ; `service_role` dans Next.js ; navigateur appelant une Edge Function ; délai de test augmenté pour faire passer un test ; commit, déploiement ou push sans accord.

## Décisions de l'utilisateur (2026-11-18)

Spec approuvée en entier : **Q1 = A**, **Q2 = A** (« Sans réponse » ajouté à EXPERIENCE.md), **Q3 = A** ; exemples de l'état vide qui préremplissent le champ acceptés, écart consigné ; découpage 5.6a / 5.6b seulement si la journée ne suffit pas. Exigences de sécurité ajoutées, toutes dans le périmètre du relecteur :
- **S1** — vue `conversation_list` créée **avec `security_invoker = true`** (sinon elle s'exécute avec les droits de son propriétaire et contourne la RLS). Test d'intégration : B ne voit **aucune** Conversation de A dans la vue.
- **S2** — `add_question` : `security invoker` (choix retenu) ; si une raison impose `security definer`, vérification explicite du propriétaire dans la fonction. Dans les deux cas `set search_path = ''`, `REVOKE` de `public` et `anon`, `GRANT EXECUTE` à `authenticated` seul.
- **S3** — `chat` avec le `conversationId` d'un autre Compte : réponse « introuvable » neutre (404 `NOT_FOUND`, message du catalogue), **identique** (statut, corps) à celle d'un identifiant inexistant, sans réservation de quota ni appel à OpenAI. Test d'intégration (compteur `ai_usage` inchangé, aucune question écrite, corps égaux).
- **S4** — `/assistant/[id]` d'un autre Compte : E9, **identique** à un identifiant inexistant (même statut 404, même contenu). Test e2e.

## Questions à trancher avant le code (tranchées, voir ci-dessus)

- **Q1 — repères `[P{n}]` des réponses d'avant la 5.4.** **A (recommandé)** : retrait à l'affichage, aucune donnée touchée, réversible, testable en local. B : nettoyage ponctuel en production par SQL (`update` hors des droits du Collaborateur, donc par le tableau de bord), irréversible, et les renvois resteraient de toute façon impossibles à reconstituer (les numéros `[P{n}]` désignent des Passages du contexte, pas des Sources).
- **Q2 — Conversations sans réponse dans l'Historique jusqu'à la 5.9** (échec seul, ou question sans réponse depuis plus de 90 s, sur le dernier échange). **A (recommandé)** : listées normalement, avec la mention en texte « Sans réponse » après la date (pas de couleur seule) ; rouvertes, elles montrent la question, l'alerte et « Réessayer ». Conforme à AD-17 (« visible et réessayable ») et au critère 3 de l'epic. B : listées sans mention. C : masquées — contraire à AD-17 et rend le critère 3 inatteignable depuis l'Historique. Nouveau texte « Sans réponse » à ajouter à EXPERIENCE.md.
- **Q3 — « Réessayer » à partir de la 5.6.** **A (recommandé)** : la nouvelle question part dans la **même** Conversation (`error` porte `conversationId` quand il est connu ; changement mineur de `chat`, déjà redéployé) : plus de nouvelle Conversation par « Réessayer » ; jusqu'à la 5.9, le fil montre la question deux fois (échec, puis réponse). B : comportement de la 5.2b inchangé (nouvelle Conversation à chaque « Réessayer ») jusqu'à la 5.9.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rouvrir | `/assistant/{id}` de A, par A | tous les échanges, Sources, focus dans le champ | — |
| Autre Compte | même URL, par B | E9, aucune information | `notFound()` |
| Identifiant invalide | `/assistant/abc` | E9 | — |
| Poursuivre | question sur `/assistant/{id}` | même Conversation, `last_message_at` avancé, en tête de l'Historique | — |
| `conversationId` de A envoyé par B | appel direct de `/api/chat` | 404, aucune réservation, aucune question | `NOT_FOUND` |
| Première question | sur `/assistant` | Conversation créée, adresse `/assistant/{id}` | — |
| Ancienne réponse | `content` « … ouvrés [P2]. » | « … ouvrés. » + puce | — |
| Réponse + échec | même question | réponse seule | — |
| Échec seul, dernier échange | `failure` `AI_TIMEOUT` | alerte + « Réessayer » ; « Sans réponse » dans les listes (Q2 = A) | — |
| En cours | question de 30 s sans réponse | état neutre, rechargement toutes les 5 s | à 90 s : alerte |
| Abandonnée | question de 10 min sans réponse | alerte `AI_TIMEOUT` + « Réessayer » | — |
| Historique en panne | `GET /api/conversations` en erreur | « L'Historique n'a pas pu être chargé. » + « Réessayer » | AD-19 |
| Nouveau Compte | aucune Conversation | états vides (Assistant, Tableau de bord, Historique) | — |
| Reconnexion | déconnexion puis connexion | Historique identique | — |

</frozen-after-approval>

## Code Map

- `supabase/migrations/<nouvelle>_conversations_history.sql` -- `add_question`, vue `conversation_list`, droits (`REVOKE` de `public`/`anon`, `GRANT EXECUTE`/`SELECT` à `authenticated`).
- `supabase/functions/chat/index.ts` -- entrée `conversationId`, contrôle avant `reserve_ai_call`, `add_question` ; `conversationId` dans `error` (Q3 = A) ; `_shared/chat.ts` (validation).
- `src/lib/schemas/chat.ts` -- `conversationId` optionnel (requête), dans l'événement `error` ; schémas de liste et de fil.
- `src/app/(app)/assistant/[id]/page.tsx` (nouveau), `src/app/(app)/assistant/page.tsx` -- en-tête, Historique, liste des 5 ; modèle : `src/app/(app)/documents/[id]/page.tsx` (`connection()`, `notFound()`).
- `src/components/assistant/assistant-view.tsx` (660 lignes, « un seul échange à l'écran » depuis la 5.2b) -- passage à un fil ; `answerSegments` (retrait des `[P{n}]`) ; `FailureAlert`, `SourceChip`, `RefusalActions` réutilisés.
- `src/server/conversations/` (nouveau) -- lecture d'une Conversation, liste ; `src/app/api/conversations/route.ts` (nouveau).
- `src/components/assistant/history-sheet.tsx`, `recent-conversations.tsx` (nouveaux) ; `src/components/ui/sheet` (shadcn, déjà installé).
- `src/app/(app)/page.tsx` -- emplacement réservé « Mes dernières Conversations » ; `src/components/dashboard/`.
- `src/lib/texts.ts`, EXPERIENCE.md (« Sans réponse » si Q2 = A).
- Tests : `tests/integration/conversations-rls.test.ts`, `chat.test.ts` ; `tests/unit/` (`assistant-view`, `chat-route`, `chat-function`, nouveaux `conversation-thread`, `conversations-route`) ; `tests/e2e/assistant.spec.ts`, nouveau `tests/e2e/history.spec.ts`, `dashboard.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] Migration `add_question` + vue `conversation_list` + tests d'intégration (FR-22 à deux Comptes).
- [x] `chat` : `conversationId` (contrôle avant réservation, `add_question`, `error` avec `conversationId`) + tests.
- [x] Module pur des règles d'affichage et du retrait des `[P{n}]` + tests.
- [x] Lecture serveur, `/assistant/[id]`, `GET /api/conversations`.
- [x] Fil dans `assistant-view.tsx`, poursuite, `replaceState`, rechargement des questions en cours.
- [x] Panneau Historique, 5 dernières (Assistant, Tableau de bord), états.
- [x] Textes, EXPERIENCE.md, e2e (périmètre réduit le 2026-11-19, voir Implementation Notes).
- [~] AD-17 et `epics.md` faits le 2026-11-19 ; deferred-work (report `[P{n}]` traité) au commit de clôture.

**Acceptance Criteria:**
- Given des Conversations, when j'ouvre « Historique », then elles sont listées de la plus récente à la plus ancienne (titre, date), focus sur l'active ; en choisir une l'ouvre avec ses messages et Sources, focus dans le champ.
- Given une Conversation rouverte, when je pose une question, then elle s'ajoute à cette Conversation, qui remonte en tête.
- Given l'URL d'une Conversation de A, when B l'ouvre ou l'utilise dans `/api/chat`, then E9 ou 404, sans réservation.
- Given une réponse d'avant la 5.4, when je rouvre sa Conversation, then aucun `[P` n'est visible.
- Given une question sans réponse (navigateur fermé), when je rouvre, then la réponse enregistrée, ou l'alerte avec « Réessayer ».
- Given un nouveau Compte, when j'ouvre le Tableau de bord ou l'Assistant, then les états vides avec deux exemples.

## Design Notes

Ordre : base et `chat` d'abord (déployables seuls : sans `conversationId`, l'ancienne page fonctionne), puis lecture, fil, Historique, listes. **Estimation : une journée (18/11)**, la 5.5 ayant fini avec un jour d'avance ; la 5.7 garde le 19/11. Le passage de la vue à un fil est la partie la plus risquée (tests e2e des 5.2b à 5.5 écrits pour un seul échange). Si la journée ne suffit pas, découpage possible à proposer : 5.6a (lire, rouvrir, Historique, listes, `[P{n}]`) puis 5.6b (poursuivre, Q3).

Déploiement : commit → `deploy:supabase` par l'utilisateur (migration + `chat`) → contrôle en lecture seule (`add_question` et vue : `authenticated` seul, rien pour `anon`) → push → `npm run test:chat:live` (non-régression du flux, ≈ 0,09 $, compteur +15) → vérification en production → clôture.

Coût : ≈ 0,09 $ (test réel) + 2 à 3 questions à la main.

## Verification

**Commands:**
- `npx supabase db reset` puis `npm test` (PowerShell), `npm run lint`, `npx tsc --noEmit`, `npm run build:ci`, `npm run check:secrets`, `npm run test:e2e` (d'un seul tenant) -- expected : vert.
- Après `deploy:supabase` et push : `npm run test:chat:live` (utilisateur) -- expected : 15 sur 15.

**Manual checks (production) :**
- Rouvrir une Conversation de la 5.2b (q1) : aucun `[P2]` visible, puce présente.
- Une Conversation en échec de la 5.2b : « Sans réponse » dans l'Historique (Q2 = A), alerte et « Réessayer » à l'ouverture.
- Poursuivre une Conversation : la question s'y ajoute, elle remonte en tête ; adresse stable après rechargement.
- Compte de mesure 2 : URL d'une Conversation du Compte 1 → E9.
- Tableau de bord : « Mes dernières Conversations » ; 375 px sans défilement horizontal.

## Implementation Notes

**2026-11-18, 09:15-09:44 :** code écrit (migration, `chat`, module du fil, lecture serveur, route, vue, Historique, listes, textes) avec ses tests unitaires et d'intégration, puis arrêt, sans exécution des tests.

**2026-11-19 (reprise, mode essentiel décidé par l'utilisateur) :**
- Vérifié avant reprise : `tsc`, `lint`, 1 460 tests unitaires, 353 tests d'intégration (dont S1 et S3), verts. Migration appliquée en local.
- **E2e limités à 4 parcours** (`tests/e2e/history.spec.ts`, deux largeurs) : rouvrir puis poursuivre (avec retrait de `[P2]`, puce de Source, retour en tête de l'Historique, rechargement) ; S4 ; Historique au clavier avec « Sans réponse », plein écran et sans défilement horizontal à 375 px ; 5 dernières sur le Tableau de bord et « Voir tout l'Historique ». La seconde question dans la même Conversation depuis `/assistant` reste couverte par `assistant.spec.ts` (test « hors base »). **Non couverts en e2e, couverts par les tests unitaires** : états vide et erreur (Historique, listes), déconnexion puis reconnexion, question en cours (rechargement toutes les 5 s, 90 s). Pas de `dashboard.spec.ts` dédié.
- **Écart S4 (statut HTTP), accepté par l'utilisateur le 2026-11-19** (les trois cas sont indiscernables et testés) : `/assistant/[id]` d'un autre Compte, inexistant ou non UUID renvoie la même page E9, le même texte et le **même statut**, mais ce statut est **200** (avec `<meta name="robots" content="noindex">`), pas 404. Avec Cache Components, la coquille statique part avant la lecture : `notFound()` ne peut plus changer le statut (doc Next.js, `not-found.md`, « Status codes »). Constaté même sans `loading.tsx` (essai du 2026-11-19, annulé). Cohérent avec la page Document : mesuré le 2026-11-19 sur le build e2e, `/documents/{uuid inexistant}` et `/documents/abc` renvoient aussi 200, « Page introuvable », `noindex` (aucune modification). Un 404 exigerait un contrôle dans le Proxy (lecture Supabase supplémentaire à chaque requête). Rien n'est révélé : testé (marqueur de A absent du HTML, Conversation absente de `GET /api/conversations` de B).
- Documents : EXPERIENCE.md (« Sans réponse », écart des exemples qui préremplissent), AD-17 (poursuite), note datée dans `epics.md`. Deferred-work et journal : au commit de clôture.

## Revue (relecteur séparé, 2026-11-19)

Aucun bloquant ; 2 importants, 4 mineurs. Axes 1 à 3 (FR-22 et S1 à S4, règles d'affichage, non-régression de la 5.5) jugés corrects par ailleurs. Décisions de l'utilisateur du 2026-11-19 :

1. **Important, corrigé — réponse affichée sous une autre question.** Le rattachement « dernière question qui précède » se trompe dès que deux questions d'une Conversation sont traitées en même temps (abandon du navigateur à 20 s pendant que `chat` continue, deux onglets). `chat` transmet le `client_request_id` de la question à `save_assistant_answer` et `record_assistant_failure`, enregistré sur le message de l'Assistant ; `buildThread` et la vue `conversation_list` rattachent par cet identifiant, et par la date pour les lignes d'avant la 5.6. Dans la migration, les anciennes signatures sont **supprimées** (`drop function`) puis recréées avec `p_client_request_id uuid default null` (une surcharge rendrait ambigus les appels sans ce paramètre, ceux du `chat` en production avant son déploiement), `security invoker`, `search_path` vide, `EXECUTE` à `authenticated` seul. Tests : une seule signature de chaque fonction (pg_proc) et droits ; appel sans le paramètre accepté ; vue avec issues croisées ; `chat` local enregistre l'identifiant (réponse et échec) ; `buildThread` (scénario du relecteur, lignes anciennes). **Après `deploy:supabase` : même contrôle en lecture seule sur le projet distant** (une signature par fonction, `authenticated` seul).
2. **Important, corrigé — heure des 5 dernières en UTC au premier chargement.** `ConversationDate` rend un fuseau fixe (Europe/Paris) côté serveur et à l'hydratation, puis le fuseau du navigateur ; `suppressHydrationWarning` retiré. Test avec un processus en fuseau de New York. Même défaut sur `AddedOn` (Documents) : deferred-work.
3. **Mineur, reporté à la 5.9** (deferred-work) — Conversation orpheline après l'abandon à 20 s sur `/assistant`.
4. **Mineur, corrigé** — `router.refresh()` après « + Nouvelle Conversation ».
5. **Mineur, corrigé** — repère en début de ligne retiré avec les espaces qui le suivent.
6. **Mineur, corrigé** — chaque ouverture de l'Historique (bouton ou `?historique=1`) repart des squelettes.

**Vérification complète d'un seul tenant (2026-11-19, 12:41-12:49) :** `db reset`, `npm test` (PowerShell : 92 fichiers, 1 822 tests), `lint`, `tsc`, `build:ci` (`check:secrets` dépôt et code envoyé au navigateur), e2e (363 passés, 19 ignorés par conception, 0 échec) : vert. Test du constat 6 contrôlé : il échoue sans le correctif, passe avec.
