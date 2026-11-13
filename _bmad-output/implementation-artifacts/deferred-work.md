# Travail reporté

- source_spec: `_bmad-output/implementation-artifacts/1-1-chaîne-de-vérification-et-premier-déploiement.md`
  summary: Étendre `check:secrets --static` aux pages prérendues envoyées au navigateur (`.next/server/app`, fichiers `.html`, `.rsc`, `.body`).
  evidence: Une valeur rendue par un composant serveur et prérendue n'est pas dans `.next/static` ; à traiter quand des pages prérendues afficheront des données (story 1.2 ou suivantes).
- source_spec: `_bmad-output/implementation-artifacts/1-1-chaîne-de-vérification-et-premier-déploiement.md`
  summary: Vérifier si le postinstall du paquet `supabase` s'exécute sur Vercel et, si oui, l'éviter (dépendance optionnelle ou installation sans scripts).
  evidence: Non vérifié : à lire dans les journaux du premier build Vercel (durée de l'installation, téléchargement de la CLI).
- source_spec: `_bmad-output/implementation-artifacts/1-1-chaîne-de-vérification-et-premier-déploiement.md`
  summary: Traité en story 2.8 (`.env.seed`). Séparer les variables du script de préchargement (`SUPABASE_SERVICE_ROLE_KEY`, `PROCESS_DOCUMENT_SECRET`, comptes) dans un fichier distinct de `.env.local`, lu par Next.js.
  evidence: AD-20 place ces variables dans « le .env.local du script de préchargement » ; Next.js chargerait alors la clé service_role dans son environnement serveur local. Décision d'architecture à prendre avant la story 2.8.
- source_spec: `_bmad-output/implementation-artifacts/1-1-chaîne-de-vérification-et-premier-déploiement.md`
  summary: Aligner `major_version` de `supabase/config.toml` (17) sur la version Postgres du projet distant.
  evidence: Non vérifié ; `supabase link` affiche un avertissement en cas d'écart.
- source_spec: `_bmad-output/implementation-artifacts/1-3-créer-un-compte.md`
  summary: Après une réponse perdue alors que le Compte a été créé, le réessai affiche « e-mail déjà utilisé » ; proposer plutôt de se connecter.
  evidence: Cas rare (coupure réseau après la création côté serveur) ; à reprendre avec la page de connexion (story 1.4) ou en finition.
- source_spec: `_bmad-output/implementation-artifacts/1-3-créer-un-compte.md`
  summary: Imposer l'ordre « migration distante puis déploiement Vercel » (vérification au build ou liste de contrôle bloquante).
  evidence: Sans migration distante, un Compte créé sur Vercel n'aurait pas de profil ; aujourd'hui l'ordre repose sur la définition de « terminé » et sur l'utilisateur.
- source_spec: `_bmad-output/implementation-artifacts/1-4-se-connecter-se-déconnecter-et-protéger-les-pages.md`
  summary: Chaque Server Action d'un écran protégé (à partir de 2.2) doit vérifier la session elle-même, par une aide commune `requireUser()` dans `src/server/auth`.
  evidence: Les identifiants de Server Action sont globaux, et une action peut être appelée par un POST sur `/connexion`, que le proxy laisse passer. La RLS protège les données, mais l'action doit refuser tôt avec `UNAUTHENTICATED`.
- source_spec: `_bmad-output/implementation-artifacts/1-4-se-connecter-se-déconnecter-et-protéger-les-pages.md`
  summary: Vérifier le comportement d'une Server Action envoyée après l'expiration de la session (307 du proxy vers `/connexion`, POST rejoué) et répondre plutôt 401 ou `UNAUTHENTICATED` aux requêtes qui ne sont pas des navigations.
  evidence: maybe-false, gravité medium si c'est confirmé. Pour trancher : session expirée, puis clic sur une action d'un écran protégé (dès 2.2), en observant la réponse.
- source_spec: `_bmad-output/implementation-artifacts/1-4-se-connecter-se-déconnecter-et-protéger-les-pages.md`
  summary: Tester en e2e l'alerte « La connexion n'a pas abouti… », et la redirection de `SessionGate` sans le proxy.
  evidence: Les deux branches ne sont couvertes que par des tests unitaires ou par la seule barrière du proxy. Il faudrait un point d'injection de panne ou un banc de test pour composants serveur.
- source_spec: `_bmad-output/implementation-artifacts/2-2-créer-une-note.md`
  summary: Document inconnu ou inaccessible (`/documents/[id]`) : E9 est servie avec le statut HTTP 200 (plus `noindex`) au lieu de 404.
  evidence: Accepté pour le MVP par l'utilisateur le 2026-11-05. La coquille est envoyée en flux avant que `notFound()` ne s'exécute, comportement documenté de Next.js 16 avec `cacheComponents`. Pour obtenir un 404, il faudrait vérifier l'existence avant tout envoi (proxy ou route sans flux). À reprendre si un contrôle externe (supervision, jury) exige le code 404.
- source_spec: `_bmad-output/implementation-artifacts/2-2-créer-une-note.md`
  summary: Traité en story 2.3 (le bandeau de Statut remplace `?ajoute=1`). La notification « Document ajouté. Traitement en cours. » (`?ajoute=1`) reste affichée quand le Statut effectif change (par exemple *en erreur* après 3 min) ; le bandeau de Statut doit prendre le relais selon l'état réel.
  evidence: Constaté en production par l'utilisateur le 2026-11-05. Après 3 min, le badge passe correctement à « en erreur », mais la notification liée au paramètre `?ajoute=1` reste visible, ce qui contredit l'état réel.
- source_spec: `_bmad-output/implementation-artifacts/2-3-déclencher-le-traitement-et-suivre-le-statut.md`
  summary: Relever la sortie JSON réelle de `supabase functions deploy` au premier déploiement et la figer dans `tests/unit/deploy-supabase.test.ts`.
  evidence: maybe-false, gravité medium si c'est confirmé. Commande « remote only », jamais jouée : si la sortie ne contient pas `target`, `deploy:supabase` signalerait un échec après un déploiement réussi. La première exécution le tranche.
- source_spec: `_bmad-output/implementation-artifacts/2-3-déclencher-le-traitement-et-suivre-le-statut.md`
  summary: Tester le passage d'un Document à un autre (`key={document.id}` du bandeau) quand un lien entre Documents existera.
  evidence: Aucun lien de ce type à ce jour ; le cas devient atteignable avec la Bibliothèque (story 3.3).
- source_spec: `_bmad-output/implementation-artifacts/2-4-traiter-une-note-jusqu-à-prêt.md`
  summary: Évaluer en story 2.7 une écriture des Passages par lots, au lieu d'un seul appel à `complete_processing` contenant tous les vecteurs.
  evidence: Une Note de 1 Mo donnerait environ 1 250 Passages, soit environ 25 Mo de JSON, avec une limite de 2 s de calcul sur le plan gratuit. La piste doit conserver l'atomicité et le refus d'une tentative périmée : par exemple des Passages écrits en lots pour cette tentative, puis validés en une seule opération finale.
- source_spec: `_bmad-output/implementation-artifacts/2-4-traiter-une-note-jusqu-à-prêt.md`
  summary: Tester le verrou `for update` de `complete_processing` face à un abandon concurrent.
  evidence: maybe-false, gravité medium si c'est confirmé. Le `update` final dépend de ce verrou, mais aucun test ne tient une transaction ouverte. Pour trancher : deux connexions directes à Postgres, un abandon lancé pendant que la première transaction tient le verrou.
- source_spec: `_bmad-output/implementation-artifacts/2-8-mini-jeu-de-démonstration.md`
  summary: Traité en story 2.5. Resynchroniser l'état du bandeau de Statut quand le Document repasse *en cours* (relance), pour que l'interrogation reprenne.
  evidence: `StatusBanner` n'initialise son état qu'à l'ouverture de la page. Après une relance, la propriété redevient `processing`, mais l'état reste terminal : aucune interrogation ne repart.
- source_spec: `_bmad-output/implementation-artifacts/2-8-mini-jeu-de-démonstration.md`
  summary: Exécuter `scripts/setup-seed-env.ps1` de bout en bout et consigner le résultat ; seules ses fonctions sont testées.
  evidence: maybe-false, gravité medium si c'est confirmé. Le déroulé complet exige une saisie masquée, le presse-papiers et la vraie CLI. La première exécution de l'utilisateur le tranche.
- source_spec: `_bmad-output/implementation-artifacts/2-8-mini-jeu-de-démonstration.md`
  summary: Tester le plafond de rafraîchissement de `StatusBanner` (6 requêtes au plus si le serveur reste périmé).
  evidence: Le test e2e couvre une réponse périmée suivie d'une réponse à jour, pas un serveur durablement périmé. Page et route lisent les mêmes colonnes : cas très improbable.
- source_spec: `_bmad-output/implementation-artifacts/2-8-mini-jeu-de-démonstration.md`
  summary: Fiabiliser la copie du secret de `setup-seed-env.ps1` : au collage dans Vercel, le presse-papiers ne contenait pas le secret, et l'utilisateur a dû recopier la valeur depuis `.env.seed`.
  evidence: Constaté par l'utilisateur le 2026-11-06, longueur de 64 caractères vérifiée après recopie. Cause non établie (le test du script ne couvre pas `Set-Clipboard`). Tant que ce n'est pas corrigé, toute rotation doit prévoir ce recours et contrôler la longueur de la valeur collée. Piste : relire le presse-papiers après `Set-Clipboard` et comparer sans afficher, avant de demander le collage.
- source_spec: `_bmad-output/implementation-artifacts/2-8-mini-jeu-de-démonstration.md`
  summary: Story 7.1a : le Jeu complet doit inclure des Documents plus longs, pour démontrer des Sources à plusieurs Passages et la navigation entre Passages.
  evidence: Relevé par l'utilisateur le 2026-11-06 : les 8 Documents du mini Jeu ne produisent qu'un Passage chacun, tous étant sous 1 200 caractères. Les stories 5.7 (panneau Source) et 5.12 (navigation entre Passages) arrivent avant 7.1a : elles auront besoin de leurs propres Documents de test longs, ou d'un Document long ajouté au mini Jeu.
- source_spec: `_bmad-output/implementation-artifacts/2-5-erreurs-de-traitement-expiration-et-relance.md`
  summary: Story 3.4 : ajouter l'action « Supprimer » dans le bandeau d'un Document `no_text`, pour l'Auteur, avec son test.
  evidence: Décision de l'utilisateur du 2026-11-09 : critère de 2.5 reporté, car la suppression appartient à 3.4. La story 2.6b crée les premiers cas `no_text` réels, la veille de 3.4.
- source_spec: `_bmad-output/implementation-artifacts/2-5-erreurs-de-traitement-expiration-et-relance.md`
  summary: Tester en e2e la branche du bandeau « déclenchement refusé » après une relance : message d'échec et bouton de nouveau proposé.
  evidence: Le secret du serveur e2e est fixé au démarrage et Vitest n'a pas d'environnement de composants : forcer une réponse autre que 202 pour un seul test demande un nouveau banc. Les données sont couvertes par `tests/integration/trigger-processing.test.ts`.
- source_spec: `_bmad-output/implementation-artifacts/2-5-erreurs-de-traitement-expiration-et-relance.md`
  summary: Traité en story 3.2 (source d'état unique, délais inchangés). Fiabiliser les deux tests e2e où le badge doit suivre le bandeau (`en cours : bandeau…` et `rafraîchissement périmé…`), qui échouent parfois dans la suite complète.
  evidence: Sur 3 suites complètes sans changement du code applicatif : 2, 1 et 0 échec ; 152 sur 152 sur la spec seule répétée. Dans une suite instrumentée, le serveur renvoie bien « prêt », mais le premier rafraîchissement prend jusqu'à 2,8 s sous charge, sur une fenêtre de 8 s qui inclut l'attente de l'interrogation. Le lien entre cette lenteur et un échec n'a pas été observé sur un échec réel (la suite instrumentée n'a pas échoué). Symptôme déjà rencontré en 2.3 et 2.8.
- source_spec: `_bmad-output/implementation-artifacts/2-5-erreurs-de-traitement-expiration-et-relance.md`
  summary: Traité en story 3.2. Faire dépendre le badge et le bandeau d'une seule source d'état du Document, puis vérifier que les deux tests e2e intermittents deviennent stables sans augmenter leur délai.
  evidence: Décision de l'utilisateur du 2026-11-09 : les deux tests restent tels quels en 2.5. Tâche inscrite dans la story 3.2 d'`epics.md`.
- source_spec: `_bmad-output/implementation-artifacts/3-1-lecteur-de-document-et-mise-en-évidence-passages-de-test.md`
  summary: Traité en story 3.2. Prouver dans un vrai navigateur que le Passage actif est entièrement visible, et que le message placé en tête n'est pas sauté par le défilement et le focus.
  evidence: La 3.1 ne teste le défilement qu'avec des simulations : aucune page ne transmet encore de Passages.
- source_spec: `_bmad-output/implementation-artifacts/3-1-lecteur-de-document-et-mise-en-évidence-passages-de-test.md`
  summary: Prévoir une propriété du Lecteur pour l'étiquette « Passage pertinent » quand une page y arrivera depuis la Recherche.
  evidence: EXPERIENCE.md et DESIGN.md la demandent à l'arrivée depuis la Recherche ; la 3.1 n'affiche que « Passage utilisé ».
- source_spec: `_bmad-output/implementation-artifacts/3-1-lecteur-de-document-et-mise-en-évidence-passages-de-test.md`
  summary: Traité après la story 3.1. Rendre `tests/integration/seed-demo.test.ts` « en cours et vivant » indépendant du temps : son minuteur de 1,5 s fait la course avec `seedMini`.
  evidence: Échoue dans la suite complète (`déjà prêt` au lieu de `déjà en cours`), y compris sans les fichiers de test de la 3.1 ; réussit seul, 17 sur 17. Le Document visé est le 6ᵉ traité, et le minuteur part avant. Il passait encore dans la suite complète de la story 2.5. Cause du changement non établie (base locale plus chargée : hypothèse).
- source_spec: `_bmad-output/implementation-artifacts/3-1-lecteur-de-document-et-mise-en-évidence-passages-de-test.md`
  summary: `tests/e2e/ajouter.spec.ts:54` a échoué une fois sur le badge « prêt », dans une suite complète ; à rapprocher des deux tests suivis en 3.2.
  evidence: Échec unique dans la première suite complète de la 3.1, réussite au passage ciblé et à la suite finale. Même symptôme de badge que les tests suivis en 3.2.
- source_spec: `_bmad-output/implementation-artifacts/3-2-page-document-complète.md`
  summary: Relier le message « Le Passage cité n'a pas pu être retrouvé… » au titre, pour qu'il soit annoncé à l'arrivée sur la page.
  evidence: La zone est créée avec son message dans le même rendu : rien n'est annoncé, et le focus reste sur le titre. Le message précède le texte : l'information est retardée, pas perdue. À traiter avec le panneau Source (5.7).
- source_spec: `_bmad-output/implementation-artifacts/3-2-page-document-complète.md`
  summary: Trouver l'appel en base qui échoue en `http_500` dans `process-document` sous charge locale, après 15 à 27 s (`process_document_work_failed`).
  evidence: Vu 4 fois en une heure de journaux locaux, pendant des suites e2e ; il explique un échec de `ajouter.spec.ts:54`, où badge et bandeau affichaient tous deux « en erreur ». Appel exact non identifié. Pour trancher : journaliser l'opération en échec, ou rejouer la charge en observant la base.
- source_spec: `_bmad-output/implementation-artifacts/3-2-page-document-complète.md`
  summary: Adapter le collage du message en tête (`top-14 lg:top-0`) quand le Lecteur sera utilisé dans le panneau Source (5.7).
  evidence: Ces valeurs correspondent à la barre du haut de la page Document ; le panneau Source a son propre conteneur défilant.
- source_spec: `_bmad-output/implementation-artifacts/3-3-parcourir-la-bibliothèque.md`
  summary: Index trigramme (`pg_trgm`, GIN sur `documents.title`) pour la recherche par titre de la Bibliothèque, à envisager seulement si le volume l'exige.
  evidence: Décision de l'utilisateur du 2026-11-10. La recherche `ilike '%…%'` parcourt toute la table ; sans effet mesurable pour quelques dizaines de Documents, et la liste est plafonnée à 200 lignes. L'index demanderait une migration (`deploy:supabase`).
- source_spec: `_bmad-output/implementation-artifacts/spec-avant-4-1a-document-long-mini-jeu.md`
  summary: Éviter qu'un Passage se termine par un intertitre seul (« Délais de prise en charge », « Communication avec le client ») : le rattacher au Passage suivant dans `chunkText`.
  evidence: Constaté sur la Note « Procédure de gestion des incidents » : `paragraphCut` retient la fin de paragraphe la plus proche de 800 caractères, souvent celle qui suit un intertitre. Sans effet sur l'exactitude des positions ; peut dégrader la pertinence et l'affichage d'un Passage. À examiner au calibrage (4.2), avant le panneau Source (5.7). Changer le découpage modifierait les Passages des Documents déjà traités (nouvelle version de vectorisation).
- source_spec: `_bmad-output/implementation-artifacts/4-1a-recherche-sémantique-côté-serveur.md`
  summary: Faire utiliser l'index HNSW `passages_embedding_idx` par `match_passages` (tri par distance avant filtrage, ou `hnsw.iterative_scan`), si le volume l'exige.
  evidence: La fonction calcule la distance sur tous les Passages filtrés puis trie : balayage complet, sans effet à 13 Passages (23 à 55 ms en local). À reconsidérer en 4.2 avec la mesure de durée réelle, et avant le Jeu complet (7.1b). Changement par migration (`deploy:supabase`).
- source_spec: `_bmad-output/implementation-artifacts/4-2-premier-calibrage-et-mesure-de-la-recherche.md`
  summary: Index HNSW de `match_passages` reporté au Jeu complet (7.1b), au lieu de la 4.2 : rejouer `npm run measure:search` après le préchargement complet et changer la fonction seulement si `match_passages` seule dépasse quelques centaines de millisecondes.
  evidence: Décision de la 4.2. À 9 Documents et 13 Passages, le balayage complet est négligeable : médiane de `match_passages` seule consignée dans `docs/mesures/recherche.md`. La correction demande une migration (`deploy:supabase`) et un tri par distance compatible avec la limite d'un Passage par Document.
- source_spec: `_bmad-output/implementation-artifacts/4-2-premier-calibrage-et-mesure-de-la-recherche.md`
  summary: Intertitres en fin de Passage reportés au panneau Source (5.7), au lieu de la 4.2 : sans effet mesuré sur la pertinence.
  evidence: Décision de la 4.2. r6 (« revue après un incident critique », Document long à 5 Passages) place le bon Document au rang 1 en production (`recherche-live.md`). Changer `chunkText` imposerait une nouvelle version de vectorisation et le retraitement de tous les Documents ; à reconsidérer pour l'affichage du Passage en 5.7, ou si `measure:search` montre une similarité faible sur ce Document.
- source_spec: `_bmad-output/implementation-artifacts/4-2-premier-calibrage-et-mesure-de-la-recherche.md`
  summary: Réchauffer la Recherche avant la démonstration (une Recherche une à deux minutes avant), à inscrire dans la procédure de démo (7.5 ou 7.6).
  evidence: Premier appel réel à 3 542 ms contre une médiane de 653 ms (`recherche-live.md`) : démarrage à froid probable de l'Edge Function. Action sans code ; à confirmer par le premier `semantic_search_done` des journaux Supabase (démarrage et `embed_ms`).
- source_spec: `_bmad-output/implementation-artifacts/2-6a-déposer-et-importer-un-fichier-txt-ou-md.md`
  summary: Nettoyer les fichiers déposés dans `documents/{author_id}/uploads/` mais jamais importés (aucun Document ne référence leur `storage_path`), par exemple après 24 h.
  evidence: AD-7 (« Risque restant ») et décision du 2026-11-12 : un dépôt précède toujours la création du Document ; un changement de fichier, un « Réessayer » de dépôt ou un abandon de la saisie laissent un objet orphelin, sans effet pour la démo (1 Mo au plus par objet). Nettoyage par `service_role` (script ou fonction planifiée), jamais par Next.js. Constaté le 2026-11-13 en production (lecture seule) : 2 objets orphelins de 34 et 0 octets, déposés pendant la vérification de 2.6b (2026-11-12 vers 08:28 UTC), Compte des Documents de test de 2.6a et 2.6b.
- source_spec: `_bmad-output/implementation-artifacts/2-6a-déposer-et-importer-un-fichier-txt-ou-md.md`
  summary: Story 3.4 : supprimer l'objet Storage d'un Document importé avec le Document, alors que 2.6a ne crée aucune politique de suppression.
  evidence: 3.4 prévoit « Document puis objet Storage » ; Next.js n'a pas `service_role`, il faut donc une politique `delete` (propriétaire, `{auth.uid()}/uploads/…`) ou une fonction SQL. Précision et test ajoutés à 3.4 dans `epics.md` le 2026-11-12.
- source_spec: `_bmad-output/implementation-artifacts/2-6a-déposer-et-importer-un-fichier-txt-ou-md.md`
  summary: Limiter le nombre d'URL de dépôt (`POST /api/uploads`) et d'objets déposés par Collaborateur, par exemple par jour.
  evidence: Revue de 2.6a : un Collaborateur connecté peut demander des URL sans limite et déposer des objets de 1 Mo, jamais nettoyés tant que le nettoyage des fichiers non importés n'existe pas. Sans effet pour la démo (Comptes connus) ; à traiter avec ce nettoyage ou avec les quotas (5.10).
- source_spec: `_bmad-output/implementation-artifacts/2-6a-déposer-et-importer-un-fichier-txt-ou-md.md`
  summary: Story 2.6b et 2.7 : un fichier non UTF-8 proche de 1 Mo, décodé sans contrôle, peut dépasser 1 000 000 octets une fois converti (caractères de remplacement de 3 octets) et faire échouer `complete_processing` (contrainte `documents_content_size`) en erreur temporaire.
  evidence: Revue de 2.6a (maybe-false, non mesuré) : 2.6a décode en UTF-8 non strict, comme prévu ; le décodage strict et le repli Windows-1252 de 2.6b, et le test de charge de 2.7, doivent vérifier la taille après décodage et produire une erreur explicite plutôt qu'une erreur temporaire relançable sans fin.
- source_spec: `_bmad-output/implementation-artifacts/2-6b-lire-le-texte-des-fichiers-importés.md`
  summary: Traité par 2.6b — texte de plus de 1 000 000 octets une fois converti (entrée de 2.6a) : `no_text` définitif avec un message propre, contrôlé avant `complete_processing`.
  evidence: Décision Q1 = A du 2026-11-12 ; test d'intégration avec un fichier Windows-1252 de 1 000 000 octets généré pendant le test (2 000 000 octets une fois converti). Reste pour 2.7 : mesurer la durée et la mémoire d'un fichier proche de la limite qui, lui, devient *prêt*.
- source_spec: `_bmad-output/implementation-artifacts/2-7-test-de-charge-de-la-limite-de-1-mo.md`
  summary: Mesuré par 2.7 — écriture des Passages en un seul `complete_processing` (entrée de 2.4) : échec en production pour un fichier de 1 Mo (environ 1 160 Passages, 25 Mo de JSON, plus de 30 s, environ 40 s de travail en base, puis `fail_processing` bloqué par le verrou du Document). Tranché le 2026-11-12 : limite abaissée à 100 000 octets pour les fichiers et les Notes (vérifiée en production le 2026-11-13, `charge-100000-octets-2.md`) ; écriture par lots reportée (entrée ci-dessous).
  evidence: `docs/mesures/charge-1mo.md` (analyse, propositions chiffrées, recommandation : B avant l'Epic 5, A plus tard). Les Notes de 1 000 000 octets sont exposées au même échec.
- source_spec: `_bmad-output/implementation-artifacts/2-7-test-de-charge-de-la-limite-de-1-mo.md`
  summary: `http_500` de `process-document` sous charge (entrée de 3.2) : cause établie par 2.7 en production, l'écriture unique de `complete_processing` annulée par la limite de 8 s par instruction de l'API (`statement_timeout` d'`authenticator`, code `57014`).
  evidence: Mesure à 300 000 octets (`charge-300000-octets.md`). Traitement : limite de 100 000 octets (écriture d'environ 3 s) et code Postgres journalisé (`http_500:57014`). Les échecs locaux sous suites e2e en parallèle ne sont pas rejoués : à surveiller dans les journaux avec ce code.
- source_spec: `_bmad-output/implementation-artifacts/2-7-test-de-charge-de-la-limite-de-1-mo.md`
  summary: Écriture des Passages par lots (option A de 2.7), seulement si des Documents de plus de 100 Ko deviennent nécessaires, après l'Epic 5 ; chaque lot sous 4 s (limite de 8 s par instruction de l'API).
  evidence: Décision de l'utilisateur du 2026-11-12. Mesures : `docs/mesures/charge-1mo.md`, `charge-300000-octets.md`, `charge-150000-octets.md`, `charge-100000-octets.md`. Remesurer avec `npm run load:1mo -- --remote --size=<octets>` après relèvement de la limite du bucket.
- source_spec: `_bmad-output/implementation-artifacts/2-7-test-de-charge-de-la-limite-de-1-mo.md`
  summary: Surveiller la marge de l'écriture finale à 100 Ko : environ 3 s pour 115 Passages sous une limite de 8 s, avec une forte variation observée (3,3 et 7,0 s pour deux fichiers de 150 000 octets).
  evidence: Remesurer (`npm run load:1mo -- --remote`) avant la démonstration et après tout changement du plan Supabase, du découpage ou du modèle de vectorisation ; les journaux de `process-document` donnent désormais le code Postgres (`57014` = délai dépassé).
- source_spec: `_bmad-output/implementation-artifacts/3-4-supprimer-son-document.md`
  summary: Epic 5 (migration `message_sources`, puces de Source, panneau Source) — ce qu'il faut prévoir pour un Document supprimé par la story 3.4, en plus de ce que `epics.md` prévoit déjà (`document_id` nullable `on delete set null`, `document_title` copié, puce « {titre} — Document supprimé » non cliquable).
  evidence: Vérifié le 2026-11-13 dans l'architecture et `epics.md`. Points non couverts : (1) `message_sources.passages` (jsonb) garde des `passage_id` qui n'existent plus après la cascade de 3.4 : ne jamais les relire quand `document_id` est null ; (2) course entre la Recherche et l'enregistrement de la réponse : un Document supprimé entre-temps ferait échouer l'insertion de `message_sources` (clé étrangère, `23503`) et toute la réponse ; insérer `document_id` seulement s'il existe encore (sinon null), dans la même transaction, avec un test ; (3) la suppression par A doit passer à null les Sources des Conversations de B, alors que B seul lit ses Conversations : la clé étrangère s'applique sans la RLS (voulu), à prouver par un test d'intégration à deux Comptes ; (4) le panneau Source réutilise le 404 de `/api/documents/[id]/status` et le texte `documentStatus.deleted` de 3.4.
- source_spec: `_bmad-output/implementation-artifacts/5-1-stocker-les-conversations-de-facon-strictement-privee.md`
  summary: Suite de l'entrée de 3.4 sur l'Epic 5 — traité par 5.1 : `passages` ne contient que des identifiants et positions (décision Q1 = A, aucun extrait copié) ; mise à null des Sources de B à la suppression d'un Document de A prouvée par un test à deux Comptes. Reste pour 5.2a : la course à l'enregistrement d'une Source dont le Document disparaît entre la Recherche et l'insertion (`23503` sur `message_sources.document_id`), et ne jamais relire les `passage_id` d'une Source dont `document_id` est nul (5.7).
  evidence: `tests/integration/conversations-rls.test.ts` (« Document supprimé (FR-12) ») ; la clé étrangère `document_id` refuse l'insertion d'un identifiant inexistant. « Vérifier l'existence puis insérer » ne suffit pas en READ COMMITTED (une suppression peut passer entre les deux) : `chat` doit intercepter `23503` sur `message_sources_document_id_fkey` et réinsérer la Source avec `document_id` nul (titre et version conservés), avec un test. Une fois l'insertion faite, la clé étrangère verrouille le Document (`FOR KEY SHARE`) jusqu'à la fin de la transaction : une suppression concurrente attend, puis met la Source à null.
- source_spec: `_bmad-output/implementation-artifacts/5-1-stocker-les-conversations-de-facon-strictement-privee.md`
  summary: Story 5.2a — `chat` doit tirer `document_title` et `text_version` d'une Source du Document lui-même (lu avec le jeton du Collaborateur), jamais d'une valeur fournie par le modèle ou le navigateur ; la base ne vérifie pas leur concordance avec `documents`.
  evidence: Revue de 5.1 (Blind Hunter). Les Sources ne sont écrites que par `chat` avec le jeton du propriétaire ; un Collaborateur qui écrirait directement ses propres Sources ne pourrait tromper que lui-même (lecture propriétaire seul). À couvrir par un test de 5.2a.
- source_spec: `_bmad-output/implementation-artifacts/5-2a-1-consignes-generation-et-citations.md`
  summary: Story 5.2a-2 — garde-fou contre l'épuisement du crédit OpenAI avant que `chat` soit en production (décision de l'utilisateur du 2026-11-13, A + B) : quota par Compte et par jour (cœur de la 5.10 : `ai_usage`, `reserve_ai_call`/`release_ai_call`, 60 par jour, AD-14) et plafond global du projet par jour.
  evidence: Inscription ouverte sans confirmation d'e-mail ; limite de 10 $ du projet « not enforced » ; crédit prépayé de 9,98 $ au 2026-11-13. Exigences : réservation (Compte + plafond global) avant tout appel à OpenAI, atomique ; plafond global = constante facile à changer, documentée dans `docs/environnements.md` ; message du plafond global distinct de celui du quota personnel ; `chat` ne part pas en production sans ce garde-fou testé.
- source_spec: `_bmad-output/implementation-artifacts/5-2a-1-consignes-generation-et-citations.md`
  summary: Story 5.2a-2 — échéance globale de la génération et politique de nouvelles tentatives propre à `generate` dans `chat`.
  evidence: Revue de 5.2a-1 : `callProvider` borne chaque tentative (45 s) et réessaie 2 fois sur 429, 5xx et erreur réseau ; au pire environ 135 s, au-delà du délai de `chat` (20 s jusqu'au premier octet, 90 s au total, AD-16). Une coupure réseau après une génération facturée serait aussi payée deux fois. `chat` doit passer le temps restant à `generateAnswer` (`timeoutMs`), et limiter les nouvelles tentatives de la génération (au plus une, jamais sur une erreur ambiguë après envoi), avec un test.
