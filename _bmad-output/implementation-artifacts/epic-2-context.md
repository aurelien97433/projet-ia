# Epic 2 Context: Ajouter des Documents et suivre leur traitement

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Un Collaborateur ajoute à la Base commune une Note ou un fichier .txt/.md et suit son Statut de traitement (*en cours*, *prêt*, *en erreur*), sans jamais rester bloqué. Le texte est découpé en Passages et vectorisé dans les Edge Functions Supabase, seules détentrices de la clé OpenAI : c'est le socle d'ingestion dont dépendent le Lecteur, la Recherche, l'Assistant et le Résumé. L'epic livre aussi un mini Jeu de démonstration en Notes pour tester ces fonctions tôt, et valide la limite de 1 Mo par un test de charge. Au 12/11, 2.1 à 2.5, 2.8 et 2.6a sont livrées (dépôt et import de fichiers, lecture UTF-8 minimale) ; restent la lecture robuste du texte des fichiers (2.6b), le test de charge (2.7) et la FINITION 2.9.

## Stories

- Story 2.1: Préparer l'accès à l'IA (prérequis)
- Story 2.2: Créer une Note
- Story 2.3: Déclencher le traitement et suivre le Statut
- Story 2.4: Traiter une Note jusqu'à « prêt »
- Story 2.5: Erreurs de traitement, expiration et relance
- Story 2.6a: Déposer et importer un fichier .txt ou .md
- Story 2.6b: Lire le texte des fichiers importés
- Story 2.7: Test de charge de la limite de 1 Mo
- Story 2.8: Mini Jeu de démonstration
- Story 2.9: Protéger une saisie en cours (FINITION)

## Requirements & Constraints

- **Saisie.** Titre (1 à 200 caractères), Catégorie (liste fixe de 7) et contenu obligatoires. Fichier : titre prérempli avec le nom sans extension, modifiable.
- **Taille.** Note, `.txt` et `.md` : 1 000 000 octets au plus en UTF-8, même valeur dans tous les contrôles, messages et tests. Un fichier de format ou de taille invalide est refusé avant tout envoi, champs conservés.
- **Statut.** Visible et actualisé sans action. Seuls les Documents *prêts* alimentent la Recherche, l'Assistant et le Résumé.
- **Erreurs.** Deux cas : temporaire (relance par l'Auteur seul, sans réimport) ou `no_text` (aucune relance ; suppression par l'Auteur, apportée par la story 3.4). Texte vide ou fait d'espaces : `no_text`.
- **Expiration.** Un traitement non abouti après 3 min est *en erreur* temporaire, identique pour tous et après rechargement. Un traitement tardif ne rend jamais un Document *prêt* ; seule une relance le peut. Pour un fichier, le délai démarre à « Importer », après vérification de l'objet.
- **Accès.** Tout Collaborateur lit les Documents ; seul l'Auteur agit dessus, y compris par appel direct. `anon` n'a aucun accès. Chaque table créée reçoit ses tests RLS à deux Comptes ; le Storage est testé contre un autre Collaborateur (dépôt, métadonnées, `upload_id`).
- **Performance.** Document de 60 000 caractères *prêt* en moins d'une minute.
- **Limite de 1 Mo confirmée si**, pour un `.txt` et un `.md` proches de 1 Mo sur le projet distant : *prêt* en moins de 3 min, moins de 50 Mo ajoutés, base totale sous 400 Mo. Données de test toujours supprimées, même en cas d'interruption. En cas d'échec : proposition chiffrée soumise avant 5.2a, jamais appliquée d'office.
- **Secrets et coûts.** `OPENAI_API_KEY` uniquement dans les secrets Supabase, jamais dans Next.js, un script ou un document. Crédit prépayé de 10 $, alerte à 5 $, sans recharge. La vectorisation ne consomme pas de quota.
- **Contenus.** Le texte d'un Document reste une donnée, jamais une instruction (Document piège du mini Jeu, au résultat vérifiable).
- **Terminé.** Tests verts, textes du catalogue UX ; si la base ou une Edge Function change, `npm run deploy:supabase` réussit avant le déploiement Vercel ; entrée ajoutée au journal de Vibe Coding. Aucune story restante de l'epic n'exige la revue par trois relecteurs (2.6a, la dernière concernée, est livrée), sauf demande explicite.

## Technical Decisions

- **Frontières.** Le navigateur ne parle qu'à Next.js et, pour un dépôt, à une URL signée du Storage. `src/app` ne contient aucun SQL. Les Edge Functions n'importent rien de `src/`.
- **IA.** Tous les appels OpenAI passent par `_shared/ai.ts` (`fetch`, sans SDK). Vectorisation `text-embedding-3-small`, 1 536 dimensions, lots de 96, dimension vérifiée, constantes dans `_shared/config.ts`. Chaque Passage enregistre modèle et version.
- **Cycle de traitement.** Création en `processing` (`attempt_id` neuf, `processing_started_at`), appel de `process-document` avec `PROCESS_DOCUMENT_SECRET` et attente du `202` (travail dans `EdgeRuntime.waitUntil`). Sans réponse en 5 s : `abandon_processing` avec le jeton de l'Auteur, jamais `service_role`. `complete_processing` et `fail_processing` (`temporary` ou `no_text`) ne valent que pour la tentative courante ; `retry_processing` (Auteur seul) se base sur le Statut effectif.
- **Statut effectif.** Calculé dans la vue `documents_list` (`security_invoker`, sans `content_text` ni Résumé), avec `processing_started_at` et `server_now`.
- **Données.** Colonnes système (dont `storage_path`) modifiables seulement par des fonctions SQL `security definer` ; `GRANT UPDATE` limité à `title` et `category`. `documents` porte `kind` (`note`/`file`), `storage_path`, `mime_type`, `size_bytes`. `service_role` réservée à `process-document` et au script de préchargement (`.env.seed`, jamais lu par Next.js).
- **Texte canonique.** NFC, fins de ligne `\n` ; positions en unités de code JS. Passages d'environ 800 caractères, 1 200 au plus, coupés en fin de phrase, sans chevauchement.
- **Fichiers (en place depuis 2.6a).** `POST /api/uploads` renvoie un `upload_id` et une URL signée vers `{author_id}/uploads/{upload_id}`, avant toute création de Document. Bucket privé `documents`, `file_size_limit` de 1 000 000 octets, sans restriction MIME. Politiques Storage : dépôt et lecture des métadonnées par le propriétaire seul dans son dossier. À « Importer » (Server Action), le serveur vérifie objet, dossier et taille avec le jeton du Collaborateur et déduit le MIME de l'extension. Les fichiers déposés jamais importés ne sont pas nettoyés.
- **Décodage (`_shared/rag/extract.ts`).** Aujourd'hui (2.6a) : décodage UTF-8 minimal non strict, sans repli. Cible de 2.6b dans ce même module : UTF-8 strict (`TextDecoder` `fatal`, BOM retiré), sinon repli Windows-1252 ; caractères de contrôle restants (hors tabulation et saut de ligne) : `no_text` avec « Le texte de ce fichier n'a pas pu être lu (encodage non pris en charge). » ; texte vide ou fait d'espaces : `no_text` avec « Ce fichier ne contient aucun texte exploitable… ». Tests unitaires de décodage (UTF-8 avec BOM, Windows-1252, binaire) et d'intégration.
- **Idempotence et erreurs.** `client_request_id` unique par Auteur sur `documents`. Forme unique `{ error: { code, message, retryable, resetAt? } }`. Journaux JSON sans secret, jeton ni texte de Document.
- **Test de charge.** `scripts/load-test-1mo.ts` : génération des fichiers, `pg_database_size` avant et après, nettoyage dans un `finally`, rapport dans `docs/mesures/charge-1mo.md`. Plan Free : base de 500 Mo, Edge Functions 150 s d'exécution et 2 s de calcul. Estimation : ~1 250 Passages, 17 à 20 Mo, moins de 30 s.

## UX & Interaction Patterns

- **Ajout (`/ajouter`).** Onglets « Note » (par défaut) et « Fichier ». Bouton occupé dès le premier clic (`aria-disabled`, « Enregistrement… », « Import… »). Saisie toujours conservée en cas d'échec.
- **Dépôt.** Contrôle immédiat du format et de la taille, progression « Dépôt du fichier… », « Importer » inactif jusqu'à la fin ; échec : « Le fichier n'a pas pu être déposé. » et « Réessayer ».
- **Abandon.** Dialogue « Abandonner ce Document ? » avec « Continuer la saisie » ; en FINITION, garde de navigation (barre latérale, « + Ajouter », retour) et `beforeunload`, sans avertissement si rien n'est saisi ou après un enregistrement réussi.
- **Badge de Statut.** Symbole et texte, jamais la couleur seule ; passage à *prêt* ou *en erreur* annoncé une fois (`aria-live="polite"`).
- **Bandeau de la page Document.** Message « plus de temps que prévu » au-delà de 60 s (horodatage serveur) ; erreur temporaire : « Relancer le traitement » pour l'Auteur, message sans bouton pour les autres ; `no_text` : message seul, sans relance, jusqu'à l'ajout de « Supprimer » par 3.4.
- **Actualisation.** Toutes les 3 s tant qu'un Document est *en cours*. Après 3 échecs : « Le Statut n'a pas pu être actualisé. » et « Actualiser ».
- **Textes.** Repris tels quels du catalogue, au vouvoiement.

## Cross-Story Dependencies

- Livrées : 2.1 à 2.5, 2.8 (mini Jeu en Notes, déjà utilisé par E3 et E4) et 2.6a.
- Restantes : 2.6b (prévue le 13/11, s'appuie sur le circuit fichier de 2.6a) → 2.7 (prévue le 16/11, tranchée avant 5.2a, au plus tard le 18/11 ; peut être réduite à une seule mesure sur décision de l'utilisateur).
- 2.6b crée les premiers cas `no_text` réels ; 3.4 y ajoute « Supprimer ».
- 2.9 dépend de 2.6a (livrée), est planifiée après E4 et peut être coupée aux points de contrôle des 18/11 et 20/11.
- L'import de fichiers et le Jeu complet (7.1b) dépendent du résultat de 2.7 ; le Lecteur n'en dépend pas.
