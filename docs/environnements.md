# Environnements de NexaMind AI

Ce document liste les environnements, les régions, les prérequis et les **noms** des secrets. Il ne contient **aucune valeur** : ni clé, ni mot de passe, ni jeton. Les valeurs sont saisies par le porteur du projet dans son terminal ou dans les tableaux de bord, jamais dans un fichier suivi ni dans une conversation.

## Environnements

| Environnement | Rôle | Où |
|---|---|---|
| Supabase local | Développement et tests (`npm test`) | CLI Supabase 3.0.0 + Docker Desktop, `npx supabase start` |
| Supabase distant | Démonstration (seul projet distant) | Supabase Free, région `eu-central-1` (Francfort) |
| Vercel | Application en ligne (production et prévisualisations) | Vercel Hobby, région des fonctions `fra1` (Francfort), fixée par `vercel.json` |
| OpenAI | Génération et vectorisation | Projet dédié ; clé uniquement dans les secrets Supabase |

Les scripts qui écrivent sur le projet distant (test de charge, mesures, tests de bout en bout) suppriment leurs données à la fin.

## Commandes

| Commande | Effet |
|---|---|
| `npm run check:env` | Vérifie Docker et la CLI Supabase 3.0.0 |
| `npm test` | Tests Vitest (unitaires, puis intégration sur Supabase local) |
| `npm run test:e2e` | Tests Playwright sur **Supabase local** (à démarrer avant) : serveur Next.js dédié sur le port 3100, dossier `.next-e2e`, variables publiques locales lues à l'exécution ; aucun accès au projet distant. Une fois par poste : `npx playwright install chromium` |
| `npm run check:secrets` | Cherche des formats de clés dans le dépôt ; `-- --static` dans `.next/static` |
| `npm run build:ci` | Contrôle des secrets, `next build`, contrôle du code envoyé au navigateur (commande de build Vercel) |
| `npm run deploy:supabase` | Sur le **projet distant lié** uniquement : `db push --remote=<référence>`, contrôle de la cible dans la sortie de la CLI (échec si elle vise la base locale), contrôle des migrations présentes à distance (`migration list --remote`), puis `functions deploy --remote=<référence>` s'il existe des Edge Functions. La CLI 3 vise la base locale par défaut : ne jamais lancer `supabase db push` sans `--remote` pour le projet distant |

## Prérequis

| Prérequis | État |
|---|---|
| Docker Desktop installé et démarré | ✔ 2026-11-03 |
| Compte Vercel relié au dépôt GitHub | ✔ 2026-11-04 |
| Région du projet Supabase distant relevée : `eu-central-1` | ✔ 2026-11-04 |
| `supabase login` | ✔ 2026-11-04 |
| Confirmation de l'e-mail désactivée (Auth, projet distant) | ✔ 2026-11-04 |
| Projet OpenAI dédié créé | ✔ 2026-11-04 |
| `supabase link` au projet distant (mot de passe de la base saisi dans le terminal) | ✔ 2026-11-04 |
| Projet Vercel importé, variables publiques définies, premier déploiement | ✔ 2026-11-04 (région d'exécution `fra1` à prouver en story 1.4) |
| Longueur minimale du mot de passe : 8 caractères (Auth, projet distant) | à faire par l'utilisateur (story 1.3) |
| Migration `profiles` appliquée au projet distant | ✔ 2026-11-04, par l'utilisateur avec `supabase db push --remote` (l'ancien `deploy:supabase` visait la base locale) ; à reconfirmer avec `npm run deploy:supabase` corrigé |
| Crédit prépayé OpenAI de 10 $, sans recharge automatique, alerte à 5 $ | à confirmer avant la story 2.1 |
| Accès vérifié à `gpt-5.4-mini` et `text-embedding-3-small` | à confirmer avant la story 2.1 |
| Clé OpenAI posée avec `supabase secrets set` | à faire avant la story 2.1 |

## Secrets et variables (noms seulement)

| Nom | Où | Navigateur |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, Vercel | Oui (publiques) |
| `PROCESS_DOCUMENT_SECRET` | Vercel, secrets Supabase, `.env.local` du script de préchargement | Non |
| `SUPABASE_SERVICE_ROLE_KEY` | Secrets Supabase, `.env.local` du script de préchargement | Non |
| `OPENAI_API_KEY` | Secrets Supabase uniquement (`supabase/functions/.env` en local, ignoré par git) | Non |
| `AI_DAILY_QUOTA`, `RAG_MIN_SIMILARITY`, `GENERATION_MODEL` | Secrets Supabase | Non |
| `DEMO_ACCOUNT_*`, `MEASURE_ACCOUNT_*` | `.env.local` du script de préchargement et des mesures | Non |

## Contrôle des secrets

`npm run check:secrets` refuse : une clé OpenAI (`sk-` suivi d'au moins 20 caractères), une clé secrète Supabase (`sb_secret_`), un jeton JWT dont le rôle est `service_role`, une affectation avec valeur de `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `PROCESS_DOCUMENT_SECRET`, et le motif témoin `NEXAMIND_CANARY_DO_NOT_DEPLOY` lorsqu'il reçoit une valeur. La clé publique Supabase (`sb_publishable_…`, ou JWT de rôle `anon` ou `authenticated`) est autorisée. Le script n'affiche jamais une valeur détectée : seulement le fichier, la ligne et le type de clé.
