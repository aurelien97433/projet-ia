# Guide de reprise — NexaMind AI

Pour un développeur qui reprend le projet sans son auteur. Ce guide ne contient **aucune valeur** de secret : ni clé, ni mot de passe, ni jeton, ni URL de production. Les valeurs se demandent au porteur du produit et se saisissent dans le terminal ou dans les tableaux de bord, jamais dans un fichier suivi ni dans une conversation. Détail de chaque commande : [environnements.md](environnements.md).

## 1. Accès à demander

| Accès | Pour quoi | Rôle minimal |
|---|---|---|
| Dépôt GitHub | Code, tests, documents | écriture (le push sur `main` déclenche le déploiement Vercel) |
| Projet Vercel (Hobby, région `fra1`) | Variables d'environnement, déploiements, retour arrière | membre du projet |
| Projet Supabase (Free, région `eu-central-1`) | Base, Edge Functions, secrets, Auth, Storage | membre du projet ; mot de passe de la base pour `npx supabase link` |
| Projet OpenAI dédié | Clé d'API, crédit prépayé, alertes, modèles autorisés | membre du projet ; lecture de la facturation |
| Fichier `.env.seed` | Clé `service_role`, secret de traitement, Comptes de démo et de mesure | **transmis hors du dépôt**, ou recréé (§ 7) |

## 2. Poste de travail

- Windows 11 (le projet a été développé sous Windows ; scripts PowerShell 5.1 et Git Bash), **Node 24**, **Docker Desktop**.
- La CLI Supabase est une dépendance du projet (`supabase` 3.0.0) : toujours `npx supabase`, jamais une CLI installée ailleurs.
- `npm ci`, puis `npm run check:env` (vérifie Docker et la version de la CLI).

## 3. Variables d'environnement (noms seulement)

| Variable | Où | Secrète |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` (copie de [.env.example](../.env.example)) et Vercel | non |
| `PROCESS_DOCUMENT_SECRET` | Vercel (**Production seulement**, option Sensitive), secrets Supabase, `.env.seed` ; valeur locale différente dans `supabase/functions/.env` | oui |
| `OPENAI_API_KEY` | secrets Supabase ; clé locale dans `supabase/functions/.env` | oui |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.seed` seulement (posée d'office par Supabase dans les Edge Functions) ; jamais dans `.env.local` ni Vercel | oui |
| `SEED_SUPABASE_URL`, Comptes `DEMO_ACCOUNT_A/B_*`, `MEASURE_ACCOUNT_1/2/3_*`, `UJ2_LIVE_URL` | `.env.seed` (voir [.env.seed.example](../.env.seed.example)) | mots de passe : oui |

`.env.local`, `.env.seed` et `supabase/functions/.env` sont ignorés par git. `npm run check:secrets` doit rester vert avant chaque commit.

## 4. Installer et lancer en local

1. `npx supabase start` (Docker démarré). Le service `analytics` est désactivé dans `supabase/config.toml` : il ne devient jamais sain sous Windows.
2. `npx supabase status` donne l'URL et la clé publiable locales : les copier dans `.env.local`.
3. `supabase/functions/.env` : `PROCESS_DOCUMENT_SECRET` (valeur locale aléatoire) et, pour `npm run test:ai` seulement, une clé OpenAI. En local, la vectorisation et la génération sont **simulées** (`[edge_runtime.secrets]` du `config.toml`) : aucun appel facturé.
4. `npx supabase db reset` applique toutes les migrations à la **pile locale**.
5. `npm run dev` pour l'application ; `npm test` (unitaires et intégration), puis `npm run test:e2e` (build dédié, port 3100). **Jamais les deux en même temps** : ils partagent la base locale.
6. Mini Jeu local : `npm run seed:demo -- --mini --seed-file .env.seed.local` ([environnements.md](environnements.md), « Préchargement du mini Jeu »).

**Relancer les services** : `npx supabase stop`, puis `npx supabase start` après un changement de `config.toml`, de `supabase/functions/.env` ou l'ajout d'une Edge Function, et si l'edge runtime est arrêté (tous les tests d'Edge Functions échouent alors en même temps).

## 5. Redéployer

**Ordre obligatoire : secrets → `npm run deploy:supabase` → push.**

1. Secret nouveau ou changé : Supabase et Vercel d'abord (§ 7).
2. `npm run deploy:supabase` : migrations (`db push --remote=<référence>`) puis Edge Functions, sur le seul projet distant lié. Une migration et le code des fonctions qui en dépend partent **ensemble** : jamais l'un sans l'autre.
3. Contrôle distant en lecture seule si une migration touche des droits (`npx supabase db query --remote=<référence> --read-only "<requête sur le catalogue>"`).
4. Push sur `main` : Vercel construit avec `npm run build:ci` (contrôle des secrets compris).
5. Tests en production, par le porteur du produit : `test:security:live`, `test:chat:live`, et selon le changement `test:search:live`, `test:summary:live`, `test:uj2:live`.

**Revenir en arrière** : dans Vercel, « Instant Rollback » vers le déploiement précédent. Une migration ne se défait pas : écrire une nouvelle migration corrective.

## 6. Restaurer le Jeu de démonstration

`npm run seed:demo -- --remote` : affiche d'abord le plan, calculé en lecture seule (Comptes à créer ou réaligner, Documents à créer, mettre à jour ou laisser), puis n'écrit qu'après la saisie de « oui ». Idempotent, ne supprime jamais rien, n'appelle jamais OpenAI pour les Résumés. Les Comptes existants sont réalignés sur les mots de passe de `.env.seed`. Les Résumés se regénèrent ensuite sur le site.

## 7. Faire tourner les secrets

| Secret | Procédure |
|---|---|
| `PROCESS_DOCUMENT_SECRET` | `powershell -NoProfile -File scripts\setup-seed-env.ps1` à la racine : nouveau secret posé dans Supabase, `.env.seed` mis à jour, copie vérifiée dans le presse-papiers à coller dans Vercel (Production seulement), puis redéploiement Vercel. Entre les deux, les Notes créées passent *en erreur* temporaire |
| `OPENAI_API_KEY` | Nouvelle clé dans le projet OpenAI ; pose par un fichier temporaire et un dossier de travail temporaire (`--workdir`, `--remote`), jamais en passant `supabase\functions\.env` ([environnements.md](environnements.md), « Clé OpenAI ») ; `npx supabase secrets list --remote=<référence>` n'affiche qu'une empreinte ; puis révoquer l'ancienne clé |
| `SUPABASE_SERVICE_ROLE_KEY` | Tableau de bord Supabase › Project Settings › API Keys : créer une nouvelle clé secrète, la saisir par `setup-seed-env.ps1` (saisie masquée), vérifier `seed:demo -- --remote` (plan seulement), puis supprimer l'ancienne. Les Edge Functions lisent la variable `SUPABASE_SERVICE_ROLE_KEY` posée d'office par Supabase : après la rotation, vérifier `test:chat:live` (le quota passe par cette clé depuis la 7.8). Une rotation du secret JWT hérité invaliderait aussi toutes les sessions : à éviter sauf fuite |
| Mots de passe des Comptes de démo et de mesure | Changer la valeur dans `.env.seed`, puis `npm run seed:demo -- --remote` (réalignement) ; transmettre les nouveaux identifiants au jury hors du dépôt |
| Mot de passe de la base | Tableau de bord Supabase › Database › Reset password ; seul `npx supabase link` l'utilise, l'application non |

**Après une fuite** : révoquer d'abord la clé concernée chez son fournisseur (OpenAI, Supabase), faire la rotation ci-dessus, vérifier la dépense OpenAI et les Comptes créés du jour ([environnements.md](environnements.md), « Repérer les Comptes du jour »), puis vérifier que la valeur n'est dans aucun fichier suivi (`npm run check:secrets`). Une valeur déjà commitée reste dans l'historique git : seule la rotation la neutralise. Urgence de coût : `update public.ai_limits set value = 0 where key = 'ai_global_daily_cap';` met l'Assistant en pause sans appel au fournisseur.

## 8. Pièges connus

- **Terminal hors du dossier du projet.** `npx supabase` lancé ailleurs ne voit ni `config.toml` ni le projet lié, et les scripts refusent de s'exécuter (« Lancez ce script depuis la racine du projet »). Toujours vérifier le dossier courant avant une commande Supabase.
- **`db reset` : local seulement.** Avec la CLI 3, `npx supabase db reset` vise la pile locale ; ne **jamais** y ajouter `--remote` ni `--linked`, qui effaceraient la production. À l'inverse, toute commande qui doit viser le projet distant prend `--remote=<référence>` explicitement : sans lui, elle part sur la pile locale (défaut qui a déjà trompé `deploy:supabase` en story 1.1).
- **Pooler Supabase.** `deploy:supabase` peut échouer sur un délai de connexion au pooler, sans rien appliquer : relancer la commande une fois.
- **Docker et hyperviseur Windows.** « 500 Internal Server Error » de Docker, puis « Windows hypervisor is not running » : remettre l'hyperviseur Windows en démarrage automatique et redémarrer la machine, puis Docker Desktop et `npx supabase start`.
- **`supabase secrets set` à la racine** : enverrait les variables de simulation du `config.toml` (`EMBEDDINGS_FAKE`, `GENERATION_FAKE`) au projet distant. Toujours par un dossier temporaire (`--workdir`).
- **Tests e2e sous charge** : au-delà de 4 workers, des délais dépassés apparaissent sans défaut de l'application ; `npx playwright test --workers=4`.
- **Limite d'usage de l'assistant IA.** Le projet a été réalisé avec Claude Code, dont l'usage est plafonné par semaine : le travail s'arrête net à la limite. Avant une longue tâche, écrire le point d'arrêt dans la spec de la story ; l'état du projet se lit dans `_bmad-output/implementation-artifacts/sprint-status.yaml` et le [journal](journal-vibe-coding.md).
- **`test:summary:live`** conclut « ÉCHEC » si les Résumés visés existent déjà (D86) : vérifier le Résumé sur un Document sans Résumé, à la main.
