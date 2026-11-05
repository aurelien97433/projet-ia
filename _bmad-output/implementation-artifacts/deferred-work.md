# Travail reporté

- source_spec: `_bmad-output/implementation-artifacts/1-1-chaîne-de-vérification-et-premier-déploiement.md`
  summary: Étendre `check:secrets --static` aux pages prérendues envoyées au navigateur (`.next/server/app`, fichiers `.html`, `.rsc`, `.body`).
  evidence: Une valeur rendue par un composant serveur et prérendue n'est pas dans `.next/static` ; à traiter quand des pages prérendues afficheront des données (story 1.2 ou suivantes).
- source_spec: `_bmad-output/implementation-artifacts/1-1-chaîne-de-vérification-et-premier-déploiement.md`
  summary: Vérifier si le postinstall du paquet `supabase` s'exécute sur Vercel et, si oui, l'éviter (dépendance optionnelle ou installation sans scripts).
  evidence: Non vérifié : à lire dans les journaux du premier build Vercel (durée de l'installation, téléchargement de la CLI).
- source_spec: `_bmad-output/implementation-artifacts/1-1-chaîne-de-vérification-et-premier-déploiement.md`
  summary: Séparer les variables du script de préchargement (`SUPABASE_SERVICE_ROLE_KEY`, `PROCESS_DOCUMENT_SECRET`, comptes) dans un fichier distinct de `.env.local`, lu par Next.js.
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
