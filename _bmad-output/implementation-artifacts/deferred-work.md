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
