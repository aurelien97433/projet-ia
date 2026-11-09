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
