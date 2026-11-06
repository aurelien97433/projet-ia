---
title: 'Story 2.4 : Traiter une Note jusqu''à « prêt »'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '4de6fbcb73029ee1d5a088a1655df4afb8bcca0a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `process-document` accuse réception mais ne traite rien : toute Note finit *en erreur* après 3 min et reste inutilisable pour la Recherche et l'Assistant.

**Approach:**
- **Base.** Une migration ajoute pgvector, la table `passages` (RLS, index HNSW cosinus) et `complete_processing`.
- **Edge Function.** Le travail lit le texte, le normalise, le découpe, le vectorise par lots de 96, puis `complete_processing` remplace les Passages et passe le Document à `ready` en une seule opération.
- **Interface.** Le bandeau annonce « Votre Document est prêt. » sans rechargement.
- **Tests.** La vectorisation est simulée dans tout test automatique ; le seul appel réel de la chaîne est celui de la production.

## Boundaries & Constraints

**Always:**
- **Normalisation (`_shared/rag/normalize.ts`).** `\r\n` et `\r` → `\n`, NFC, espaces et tabulations de fin de ligne retirés. Idempotente. Le résultat devient `content_text` (architecture §4) : `complete_processing` l'écrit dans la même opération, sinon les positions ne correspondraient plus au texte affiché. Un texte non canonique inséré directement est ainsi corrigé.
- **Découpage (`_shared/rag/chunk.ts`).**
  - Cible 800 caractères, maximum 1 200, sans chevauchement.
  - Préférence : fin de paragraphe proche de la cible, sinon fin de phrase. Phrase plus longue que le maximum : coupée au dernier espace avant la limite, ou à 1 200 s'il n'y en a pas.
  - Jamais de coupure au milieu d'une paire de surrogates.
  - Invariant : `text.slice(start, end) === content`, positions en unités de code JavaScript, Passages sans espaces de bord, dans l'ordre, sans recouvrement, et aucun caractère non blanc perdu.
- **Vectorisation.** Uniquement par `embed` (`_shared/ai.ts`) : `text-embedding-3-small`, lots de 96, 1 536 dimensions contrôlées. La colonne `vector(1536)` refuse aussi tout écart.
- **`passages`.** `document_id` (supprimé avec le Document), `text_version`, `ordinal`, `start_offset`, `end_offset`, `content`, `embedding`, `embedding_model`, `embedding_version`. Unicité (`document_id`, `text_version`, `ordinal`). RLS : `SELECT` pour `authenticated` si le Document est `ready`, aucune écriture ; `anon` n'a rien.
- **`complete_processing(document_id, attempt_id, content_text, text_version, embedding_model, embedding_version, passages)`.** `security definer`, `search_path` vide, `EXECUTE` pour `service_role` seulement. Verrou sur la ligne ; refus (`false`, rien d'écrit) si la tentative n'est pas courante, *en cours*, commencée il y a moins de 3 min, ou si `text_version` diffère. Sinon, dans une seule transaction : remplace les Passages, écrit le texte canonique, passe à `ready`, efface les erreurs. Toute erreur (dimension, contrainte) annule tout.
- **Travail.** Tentative plus courante au moment de lire : fin silencieuse, journal Info. Refus de `complete_processing` : aucun autre appel, journal Error. Échec de l'IA ou de la base : `fail_processing` (`temporary`), comme en 2.3. Texte sans contenu non blanc : `fail_processing` (`no_text`), sans appel à l'IA.
- **Journaux.** Fin du travail : `duration_ms` et nombre de Passages, au niveau Info ; le code `AiError` en cas d'échec. Jamais de texte de Document.
- **Bandeau.** Passage à *prêt* observé pendant l'interrogation : bandeau vert « Votre Document est prêt. », annoncé, sans rechargement. Document déjà *prêt* à l'ouverture : badge seul.
- **Vectorisation simulée.** Active seulement si `EMBEDDINGS_FAKE=1` **et** `SUPABASE_URL` vise l'hôte interne `kong` de la pile locale. Elle est posée dans `[edge_runtime.secrets]` de `supabase/config.toml`. Elle passe par `embed`, avec un `fetch` simulé déterministe, sans clé ni réseau. Impossible à activer en production, même par erreur.
- **Coût.** Aucun test automatique n'appelle OpenAI. Seuls appels réels : `npm run test:ai` (une fois, un mot) et la Note de mesure en production (environ 60 000 caractères, moins d'un millième de dollar).
- **Mesure.** Un fichier d'environ 60 000 caractères de texte français fictif est généré par `scripts/generate-measure-note.ts`, hors du dépôt. Le résultat de production est consigné dans `docs/mesures/traitement-60000.md`.
- **Déploiement.** `npm run deploy:supabase` **avant** le push. Le premier traitement en production prouve la clé OpenAI distante.

**Décisions du 2026-11-06 :**
- Les trois décisions du plan sont approuvées, et la spec est gardée entière.
- **Rejet de la simulation.** `EMBEDDINGS_FAKE` est rejeté si `SUPABASE_URL` n'est pas l'hôte local : la vectorisation réelle s'applique et un journal Error le signale. Un test le prouve. L'activation en local est journalisée clairement.
- **Vecteurs simulés.** Déterministes, de dimension 1 536 et normalisés, pour que les futurs tests de recherche restent reproductibles.
- **Référence unique.** Le texte normalisé est l'unique référence pour l'affichage, le découpage et les positions.
- **Risque de 1 Mo.** La piste d'une écriture des Passages par lots est notée dans `deferred-work.md`, à évaluer en 2.7.

**Never:**
- `match_passages`, Recherche, Assistant (E4, E5).
- `retry_processing`, message après 60 s, « Actualiser », affichage de `no_text`, messages d'erreur détaillés (2.5). Le bouton reste inactif.
- Fichiers et extraction (2.6a, 2.6b). Test de charge de 1 Mo (2.7) : ses risques sont seulement signalés.
- Clé OpenAI hors des secrets Supabase. Lecture de `supabase/functions/.env` autre que la ligne de `PROCESS_DOCUMENT_SECRET`.
- Commit, push ou déploiement distant sans validation. Story 2.5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Note courte | moins de 800 caractères | 1 Passage, `ready` | — |
| Paragraphes | plusieurs paragraphes | coupures en fin de paragraphe ou de phrase, 1 200 au plus | — |
| Phrase trop longue | 3 000 caractères, avec espaces | coupée au dernier espace avant 1 200 | — |
| Sans espace | 3 000 caractères sans espace | coupée à 1 200 exactement | — |
| Emoji à la limite | surrogate à la position 1 200 | coupe avant la paire | — |
| Texte non canonique | `\r\n`, forme NFD, espaces de fin de ligne | `content_text` canonique, positions justes | — |
| 96 Passages et plus | 97 Passages | 2 lots, ordre conservé | — |
| Dimension fausse | vecteur de 1 535 nombres | `AI_OUTPUT_INVALID`, `temporary`, rien d'écrit ; refus aussi en SQL | journal avec le code |
| Panne de l'IA | `5xx`, délai | `temporary`, aucun Passage | journal avec le code |
| Texte blanc | `\n\n` par appel direct | `no_text`, aucun appel à l'IA | — |
| Tentative périmée | autre `attempt_id`, plus de 3 min, plus *en cours* | `complete_processing` : `false`, rien d'écrit | journal |
| Relecture | tentative remplacée avant la lecture | rien d'écrit, aucun appel à l'IA | journal Info |
| RLS | A *prêt*, *en cours*, *en erreur* | B lit seulement le *prêt* ; aucune écriture ; `anon` rien | `42501` |
| Attente | page ouverte, `ready` | « Votre Document est prêt. » annoncé, badge à jour, sans rechargement | — |
| Ouverture | déjà `ready` | badge seul | — |
| 60 000 caractères | Note réelle en production | *prêt* en moins d'une minute, mesure consignée | — |

</frozen-after-approval>

## Code Map

- `supabase/functions/process-document/index.ts` -- `logOnlyWork` à remplacer ; `runAttempt`, `causeOf` (ajouter le code `AiError`) ; `handle(request, work)` reste injectable.
- `supabase/functions/_shared/processing.ts` -- `restRequest` (délai de 4 s, à rendre paramétrable pour l'écriture finale), `failProcessing` ; ajouter la lecture du texte et `completeProcessing`.
- `supabase/functions/_shared/ai.ts` -- `embed(texts, { deps })` : aucun changement, `deps.fetch` sert à la simulation.
- `supabase/functions/_shared/config.ts` -- constantes de découpage à ajouter ici (une seule définition).
- `supabase/migrations/20261106090000_processing_functions.sql` -- modèle de `revoke`/`grant` et d'expiration à 3 min. `20261105105410_documents.sql` : modèle RLS.
- `supabase/config.toml` -- `[edge_runtime.secrets]` commenté, l. 395. pgvector disponible en local, non installé.
- `src/components/documents/status-banner.tsx` -- état « vient de passer à prêt » ; `bg-success-soft`, `text-success`.
- `src/lib/texts.ts` -- `documentStatus.ready`.
- `src/lib/documents.ts` -- `canonicalText` (LF + NFC), à laisser ; la fonction ne l'importe pas (frontière AD-1).
- **Tests de 2.3 à adapter**, car une Note créée devient désormais `ready` : `tests/integration/process-document.test.ts`, `tests/integration/trigger-processing.test.ts`, `tests/e2e/ajouter.spec.ts` (l. 64-74), `tests/e2e/document-status.spec.ts` (bandeau vide après `ready`), `tests/unit/process-document.test.ts`.
- `tests/integration/anon-access.test.ts` -- couvre `passages` automatiquement. `tests/unit/ai-boundaries.test.ts` : frontière OpenAI à conserver.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<horodatage>_passages.sql` -- extension, table, index, RLS, `complete_processing`.
- [x] `supabase/functions/_shared/config.ts`, `_shared/rag/normalize.ts`, `_shared/rag/chunk.ts` -- paramètres et fonctions pures.
- [x] `supabase/functions/_shared/processing.ts` -- lecture du texte, `completeProcessing`, délai paramétrable.
- [x] `supabase/functions/_shared/fake-embeddings.ts`, `supabase/config.toml` -- simulation locale à double condition.
- [x] `supabase/functions/process-document/index.ts` -- travail complet, journaux.
- [x] `src/components/documents/status-banner.tsx`, `src/lib/texts.ts` -- bandeau *prêt*.
- [x] `scripts/generate-measure-note.ts` -- fichier de mesure hors du dépôt.
- [x] `docs/environnements.md`, `docs/mesures/traitement-60000.md` -- simulation, coût, modèle de mesure à compléter.
- [x] `tests/unit/{normalize,chunk}.test.ts` -- matrice du découpage, invariants sur des textes variés.
- [x] `tests/unit/process-document.test.ts`, `tests/unit/fake-embeddings.test.ts` -- travail complet, échecs, double condition.
- [x] `tests/integration/passages-rls.test.ts`, `tests/integration/complete-processing.test.ts` -- RLS à deux Comptes, atomicité, tentative périmée, dimension, privilèges.
- [x] `tests/integration/process-document.test.ts` -- chaîne locale complète, Document de 60 000 caractères avec vecteurs simulés.
- [x] `tests/e2e/ajouter.spec.ts`, `tests/e2e/document-status.spec.ts` -- passage à *prêt* sans rechargement, bandeau, axe.

**Acceptance Criteria:**
- Given la story, when `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit` et `npm run build:ci` sont lancés, then tout passe, sans aucun appel à OpenAI.
- Given `npm run deploy:supabase` réussi **avant** le push, when une Note est créée sur Vercel, then elle passe à *prêt* sans rechargement, ce qui prouve la clé OpenAI distante.
- Given la Note de mesure en production, when elle est traitée, then elle est *prêt* en moins d'une minute, et la durée est consignée.

## Implementation Notes

- **Implémentation directe**, sans sous-agent, le contexte étant déjà chargé. Les trois relecteurs sont des agents séparés (règle 11).
- **Migration** `20261106130000_passages.sql`, pas encore appliquée à distance. Après la revue, `complete_processing` refuse aussi une liste vide de Passages ; le corps de la fonction a été rejoué sur la base locale.
- **Découpage.** Ordre retenu : fin de paragraphe, fin de phrase, fin de ligne, dernier espace, limite exacte. Un plancher de 400 caractères évite les fragments (« M. », un titre seul) dès qu'il reste une autre coupure possible. Un point après une abréviation peut encore couper une phrase, sans perte de texte : calibrage en story 4.2.
- **Vectorisation simulée.** `EMBEDDINGS_FAKE` dans `config.toml`, plus l'hôte `kong` : vérifié sur le conteneur local (`SUPABASE_URL=http://kong:8000`). Vecteurs déterministes par hachage des mots : deux textes proches restent proches, et une valeur figée dans le test empêche toute dérive.
- **Journaux.** `process_document_work_done` porte `passages`, `embed_ms`, `complete_ms` et `duration_ms`. Les échecs de la base portent `http_<code>`.
- **Texte ajouté au catalogue.** « Ce Document est prêt. » pour un autre Collaborateur : « Votre Document » serait faux pour lui.
- **Appels réels à OpenAI.** Un seul pendant la story : `npm run test:ai` (un mot). Aucun `ai_provider_rejected` ni `ai_unavailable` dans les journaux locaux des suites de tests.

## Spec Change Log

## Review Triage Log

Revue du 2026-11-06 par trois relecteurs indépendants (règle 11) : Blind Hunter, Edge Case Hunter, Verification Gap. Aucune remise en cause de la spec : ni `intent_gap`, ni `bad_spec`.

| # | Constat | Verdict | Preuve | Suite |
|---|---|---|---|---|
| 1 | `Get-Content -Raw` abîme les accents de la Note de mesure sous PowerShell 5.1 | medium | reproduit par un relecteur : « procédure » lu sur 10 caractères | corrigé : `-Encoding UTF8` |
| 2 | Échecs de la base indiagnosticables : `code: "Error"`, sans durée | medium | `causeOf` jetait le code HTTP | corrigé : `DbError`, `http_<code>`, `duration_ms` |
| 3 | Passage de 2 caractères (« M. ») ou titre seul | medium | reproduit : `M. ` + 1 600 caractères | corrigé : plancher de 400 caractères, tests |
| 4 | Fin de phrase après une abréviation ou un numéro | low | seule la qualité de coupe est en jeu, aucun texte perdu | rejet : calibrage en 4.2 |
| 5 | `! »` : le guillemet passait au Passage suivant | low | espace avant le guillemet français | corrigé : expression et test |
| 6 | Liste sans ponctuation coupée au milieu d'une ligne | medium | la fin de ligne n'était pas un niveau de coupe | corrigé : `lineCut`, test |
| 7 | Note courte : bandeau « prêt » rarement visible | low | déjà *prêt* à l'ouverture ; risque présenté et règle UX approuvée | accepté, rappelé à l'utilisateur |
| 8 | Titre du test e2e plus large que ce qu'il prouve | low | aucun contrôle du rechargement dans ce test | corrigé : titre exact |
| 9 | Panne de l'IA : seul un 401 était testé dans le travail | low | ni 5xx ni plafond | corrigé : trois cas |
| 10 | `complete_processing` passait à `ready` sans Passage | medium | `jsonb_array_elements` sur `[]` ne renvoie rien, les anciens Passages étaient effacés | corrigé : exception, test |
| 11 | Mesure sans détail par phase, périmètre flou | medium | un seul total ; 2.7 a besoin du détail | corrigé : `embed_ms`, `complete_ms`, requête SQL dans le protocole |
| 12 | Garantie « aucun appel réel » ouverte si la pile n'a pas redémarré | low | sans le réglage, la vectorisation est réelle ; coût infime | corrigé en partie : événement lié au Document, redémarrage documenté |
| 13 | Dépense d'une tentative périmée entre deux lots | low | 13 lots au plus sur 1 Mo, cas rare | rejet |
| 14 | Délai de 30 s dépassé alors que la transaction aboutit | low | journaux trompeurs, Document juste | rejet |
| 15 | « Ce fichier » pour une Note blanche | low | seulement par appel direct ; non affiché avant 2.5 | rejet : texte à trancher en 2.5 |
| 16 | `EMBEDDINGS_FAKE` absent du tableau des variables | low | nouvelle section seule | corrigé |
| 17 | Suivi de la story incohérent | low | fin de story | corrigé |
| 18 | Préférence pour le paragraphe non vérifiée | medium | mutants vérifiés par un relecteur : tests verts sans `paragraphCut` | corrigé : trois cas |
| 19 | Délai de 30 s non vérifié | medium | retirer l'argument ne cassait rien | corrigé : espion sur `AbortSignal.timeout` |
| 20 | Filtres de `readDocumentText` et échec de lecture non vérifiés | medium | le simulateur ignorait la requête | corrigé : filtres et panne testés |
| 21 | Journaux de `no_text` non vérifiés | low | condition inversable sans échec | corrigé : les deux issues |
| 22 | Verrou `for update` sans test observable | maybe-false (medium, non vérifié) | il faudrait tenir une transaction ouverte ; fenêtre étroite | reporté |
| 23 | « Votre Document est prêt. » montré à un non-Auteur | medium | même écart que le message d'erreur en 2.3 | corrigé : « Ce Document est prêt. », e2e |
| 24 | Commentaire périmé dans `document-status.spec.ts` | low | citait la 2.3 | corrigé |

## Design Notes

- **Vecteurs passés en JSON à `complete_processing`.** `(item->>'embedding')::extensions.vector(1536)` convertit le texte du tableau et applique le contrôle de dimension. Pour une Note de 60 000 caractères, le corps fait environ 1,5 Mo.
- **Limite connue pour 2.7.** Une Note de 1 Mo donnerait environ 1 250 Passages, soit environ 25 Mo de JSON, avec une limite de 2 s de calcul sur le plan gratuit. C'est précisément ce que tranchera le test de charge.
- **Simulation dans `embed`.** Passer par `deps.fetch` conserve la validation réelle des lots, de l'ordre et de la dimension.

## Verification

**Commands:**
- `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, `npm run build:ci` -- expected: tout vert, aucun secret.
- `npm run test:ai` -- expected: une seule fois, clé locale valide (coût : un mot).

**Manual checks:**
- Production : voir le rapport de fin de story.
