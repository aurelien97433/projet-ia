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
| `npm run test:e2e` | Tests Playwright sur **Supabase local** (à démarrer avant) : build de production dédié (`next build` puis `next start`, port 3100, dossier `.next-e2e`), avec les variables publiques locales lues à l'exécution ; aucun accès au projet distant. Le build évite les rechargements de `next dev` pendant les tests parallèles (story 2.2). Une fois par poste : `npx playwright install chromium` |
| `npm run check:secrets` | Cherche des formats de clés dans le dépôt ; `-- --static` dans `.next/static` |
| `npm run test:ai` | Seul test réel de l'IA : appelle la fonction **locale** `ai-health` (Supabase local démarré, clé dans `supabase/functions/.env`). Vérifie l'accès aux deux modèles (gratuit) et la dimension 1 536 (un embedding de « Bonjour »). Jamais lancé par `npm test` |
| `npm run test:search:live` | Test réel de la Recherche (story 4.1a), après `deploy:supabase` : projet **distant lié** exigé (`.env.seed` et clé publique de `.env.local`), Compte de mesure 1, 10 appels de `semantic-search`. Rapport `docs/mesures/recherche-live.md` : rang du bon Document et durée, sans similarité ni secret |
| `npm run measure:search` | Mesure et calibrage de la Recherche (story 4.2) : Supabase local démarré **et** projet distant lié. Vectorise les 10 Requêtes en un appel par la fonction **locale** `measure-embed` (clé locale, modèle et dimension de production vérifiés), lit les similarités avec `match_passages` distante sous la session du Compte de mesure 1, appelle `semantic-search` pour les durées. Rapport `docs/mesures/recherche.md` : similarités, balayage des seuils, marges, décision. Ne modifie jamais la production |
| `npm run load:1mo` | Test de charge de la limite de taille (story 2.7 ; limite en vigueur : **100 Ko = 100 000 octets** depuis le 2026-11-12, le nom vient de la limite d'origine de 1 Mo). Sans option : pile locale (Compte temporaire, vecteurs simulés), rapport dans le dossier temporaire. Avec `--remote` : projet **distant lié** exigé (`.env.seed` et clé publique de `.env.local`), Compte de mesure 1, **deux imports réels** (`.txt` et `.md` de 90 000 à 100 000 octets, moins de 0,001 $), tailles lues par `supabase db query --remote --read-only`, nettoyage garanti (même après Ctrl+C, trois essais), rapport `docs/mesures/charge-100000-octets.md`, jamais écrasé (`-2`, `-3`…). `--size=<octets>` (20 000 à 1 000 000) : autre taille, pour mesurer une future écriture par lots ; au-delà de 100 000 octets, le bucket refuse le dépôt tant que la limite n'est pas relevée. `--cleanup` : supprime seulement les restes (Documents du Compte de mesure 1 intitulés exactement « Test de charge 1 Mo », et leurs fichiers) ; au-delà de 2, exige `--confirm` |
| `npm run build:ci` | Contrôle des secrets, `next build`, contrôle du code envoyé au navigateur (commande de build Vercel) |
| `npm run deploy:supabase` | Sur le **projet distant lié** uniquement : `db push --remote=<référence> --yes` (la CLI exige `--yes` pour appliquer une migration en attente sans terminal interactif ; en cas d'échec, le message de la CLI est affiché, identifiants masqués), contrôle de la cible dans la sortie de la CLI (échec si elle vise la base locale), contrôle des migrations présentes à distance (`migration list --remote`), puis `functions deploy <noms> --remote=<référence>` pour les Edge Functions déployables (noms explicites, `ai-health` exclue car locale). La CLI 3 vise la base locale par défaut : ne jamais lancer `supabase db push` sans `--remote` pour le projet distant |

## Prérequis

| Prérequis | État |
|---|---|
| Docker Desktop installé et démarré | ✔ 2026-11-03 |
| Compte Vercel relié au dépôt GitHub | ✔ 2026-11-04 |
| Région du projet Supabase distant relevée : `eu-central-1` | ✔ 2026-11-04 |
| `supabase login` | ✔ 2026-11-04 |
| Confirmation de l'e-mail désactivée (Auth, projet distant) | ✔ 2026-11-04, **après correction** : elle était encore active pendant la story 1.3 (événement `mail.send` dans le journal Auth à l'inscription), puis désactivée par l'utilisateur. **Contrôle** : Authentication › Sign In / Providers › Email › « Confirm email » désactivé, puis une inscription sur Vercel doit arriver directement sur le Tableau de bord. Si ce réglage revient, l'écran d'inscription affiche « Votre Compte n'a pas pu être ouvert directement. » et le journal serveur l'événement `sign_up_without_session` |
| Projet OpenAI dédié créé | ✔ 2026-11-04 |
| `supabase link` au projet distant (mot de passe de la base saisi dans le terminal) | ✔ 2026-11-04 |
| Projet Vercel importé, variables publiques définies, premier déploiement | ✔ 2026-11-04 |
| Région d'exécution `fra1` prouvée par `x-vercel-id` sur une requête exécutée par une fonction (story 1.4) | ✔ 2026-11-05 : POST `connexion` en production, `…::fra1::<id>`, `x-vercel-cache: BYPASS` |
| Longueur minimale du mot de passe : 8 caractères (Auth, projet distant) | ✔ 2026-11-04 |
| Migration `profiles` appliquée au projet distant | ✔ 2026-11-04, par l'utilisateur avec `supabase db push --remote` (l'ancien `deploy:supabase` visait la base locale) ; confirmé le 2026-11-04 par une exécution réussie de `npm run deploy:supabase` corrigé |
| Crédit prépayé OpenAI de 10 $, sans recharge automatique (plafond réel du projet) | ✔ 2026-11-05, attesté par l'utilisateur |
| Alerte de dépense à 5 $ sur le projet OpenAI | ✔ 2026-11-05, attesté par l'utilisateur. Le plafond de 10 $ du tableau de bord affiche « Limit not enforced » : il **ne bloque pas** les appels. La limite réelle est le crédit prépayé de 10 $, sans recharge automatique. Une fois le crédit épuisé, OpenAI répond 429 `insufficient_quota`, traduit en `AI_BUDGET_EXHAUSTED` (test unitaire) |
| Accès vérifié à `gpt-5.4-mini` et `text-embedding-3-small`, dimension 1 536 | ✔ 2026-11-05, `npm run test:ai` (fonction locale `ai-health`, clé locale) |
| Clé OpenAI posée en local (`supabase/functions/.env`, ignoré par git) et sur le projet distant (`supabase secrets set`) | ✔ 2026-11-05, par l'utilisateur (procédure ci-dessous). `supabase secrets list` affiche `OPENAI_API_KEY` avec une empreinte seulement (vérifié par l'utilisateur). Fonctionnement distant prouvé au premier traitement réel (story 2.4) |

## Contrôle de la région d'exécution (`x-vercel-id`)

L'en-tête `x-vercel-id` liste les étapes de la requête sur le réseau de Vercel, puis la région de la fonction qui l'a exécutée, avant l'identifiant final. Exemple : `cpt1:cpt1:fra1::fra1::<id>`. Une réponse servie **sans fonction** ne porte que le point d'entrée (`cpt1::<id>`) et ne prouve rien. C'est le cas d'un fichier statique, ou de la coquille d'une page en pré-rendu partiel servie depuis le cache : `x-vercel-cache: HIT` ou `PRERENDER`, en-tête `Age` non nul.

1. Ouvrir l'URL de **production**, puis se déconnecter.
2. Outils de développement › Réseau : cocher « Désactiver le cache » et « Conserver le journal », filtrer sur **Fetch/XHR**.
3. Se connecter, puis sélectionner la requête **POST `connexion`** (Server Action, toujours exécutée par une fonction). Relever, dans les en-têtes de réponse, `x-vercel-id` et `x-vercel-cache`.
4. Attendu : `fra1` comme **dernier segment avant l'identifiant final**, et `x-vercel-cache: BYPASS`. Les premiers segments (points d'entrée du réseau) dépendent de l'emplacement du navigateur.
5. Si la région de la fonction n'est pas `fra1` : vérifier Vercel › Settings › Functions › Function Region et `vercel.json` (`"regions": ["fra1"]`), puis redéployer.

Ne pas relever le document `/` : sa coquille statique peut venir du cache (`Age` non nul) sans passer par une fonction.

Résultats (production, commit `615a53e`, 2026-11-05, relevés par l'utilisateur) :
- Document `/` : `cpt1::<id>`, avec `Age: 177`. Réponse servie depuis le cache, sans fonction : ne prouve pas la région.
- **POST `connexion`** (exécuté par une fonction) : `x-vercel-id: cpt1:cpt1:fra1::fra1::<id>`, `x-vercel-cache: BYPASS`. **Région d'exécution `fra1` prouvée.** Réserve de la story 1.1 levée.

## Clé OpenAI : pose sans affichage (PowerShell, à la racine du projet)

La clé n'est jamais tapée sur une ligne de commande, collée dans un fichier suivi ni communiquée à l'IA. `Read-Host -AsSecureString` masque la saisie, et l'historique de PowerShell n'enregistre que la commande, pas ce qui est saisi.

1. **Local** (`supabase/functions/.env`, lu par les Edge Functions de Supabase local) :
   ```powershell
   New-Item -ItemType Directory -Force supabase\functions | Out-Null
   $secure = Read-Host "Clé OpenAI" -AsSecureString
   $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
   try {
     $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
     [IO.File]::WriteAllText("$PWD\supabase\functions\.env", "OPENAI_API_KEY=$plain`n", (New-Object Text.UTF8Encoding $false))
   } finally {
     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); Remove-Variable plain, secure, bstr -ErrorAction SilentlyContinue
   }
   ```
   Le fichier est écrit sans BOM, qui fausserait le nom de la variable.
2. **Contrôle** : `git check-ignore -v supabase/functions/.env` cite `.gitignore` (`.env*`). `git status --short` ne liste pas le fichier.
3. **Projet distant** : **ne jamais** passer `supabase\functions\.env` à `supabase secrets set`. Depuis la story 2.3, ce fichier contient aussi le `PROCESS_DOCUMENT_SECRET` **local** : la commande remplacerait le secret de production et chaque Note passerait *en erreur*. Écrire la clé dans un fichier temporaire hors du dépôt, comme pour `PROCESS_DOCUMENT_SECRET` (section suivante), puis lancer `npx supabase secrets set --env-file <ce fichier>`, qui vise le projet lié (commande « remote only »), et supprimer le fichier. Ensuite, `npx supabase secrets list` doit afficher `OPENAI_API_KEY` avec une empreinte, jamais la valeur.
4. **Après une pose ou un changement de clé** : redémarrer Supabase local (`npx supabase stop`, puis `npx supabase start`) et lancer `npm run test:ai`.

## `PROCESS_DOCUMENT_SECRET` : création sans affichage

Ce secret autorise Next.js à appeler `process-document`. Il est lu côté serveur uniquement, n'est jamais préfixé `NEXT_PUBLIC_` et ne figure dans aucun fichier suivi. La valeur de production est différente de la valeur locale et n'est jamais communiquée à l'IA.

**Ordre obligatoire : secret (Supabase et Vercel), puis `npm run deploy:supabase`, puis push.** Si le code arrive sur Vercel avant la fonction ou le secret, chaque Note créée passe *en erreur* temporaire.

**Production (PowerShell, à la racine du projet lié).** À exécuter dans une seule session, sans fermer la fenêtre entre les étapes :

1. Générer la valeur (rien ne s'affiche) :
   ```powershell
   $bytes = New-Object byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   $secret = -join ($bytes | ForEach-Object { $_.ToString("x2") })
   ```
2. La poser dans Supabase, par un fichier temporaire hors du dépôt, sans BOM :
   ```powershell
   $file = Join-Path $env:TEMP "process-document-secret.env"
   [IO.File]::WriteAllText($file, "PROCESS_DOCUMENT_SECRET=$secret`n", (New-Object Text.UTF8Encoding $false))
   npx supabase secrets set --env-file $file
   Remove-Item $file
   npx supabase secrets list
   ```
   La liste doit afficher `PROCESS_DOCUMENT_SECRET` avec une empreinte, jamais la valeur.
3. La copier dans le presse-papiers :
   ```powershell
   Set-Clipboard -Value $secret
   ```
4. Dans Vercel › projet › Settings › Environment Variables : `Add`, nom `PROCESS_DOCUMENT_SECRET`, valeur collée, environnement **Production** seulement (relevé du 2026-11-13 : jamais en Preview ; une prévisualisation ne déclenche donc aucun traitement), option **Sensitive** activée, puis `Save`.
5. Effacer la valeur :
   ```powershell
   Set-Clipboard -Value " "
   Remove-Variable secret, bytes
   ```
   Si l'historique du presse-papiers de Windows est activé (`Win + V`), y supprimer aussi l'entrée.

**Changer le secret** : reprendre ces étapes, puis redéployer sur Vercel : une variable Vercel ne s'applique qu'aux déploiements suivants. Entre le changement côté Supabase et la fin du redéploiement, chaque Note créée passe *en erreur* temporaire (`401`). Ensuite, créer une Note : elle doit rester *en cours* sans passer *en erreur* immédiatement.

**Local.** La fonction locale lit `supabase/functions/.env` (ignoré par git), et les tests y lisent cette seule ligne à l'exécution. Après un ajout ou un changement : `npx supabase stop`, puis `npx supabase start`. Sans la variable, ajouter une valeur aléatoire sans ouvrir le fichier :
```powershell
node -e "require('fs').appendFileSync('supabase/functions/.env','\nPROCESS_DOCUMENT_SECRET='+require('crypto').randomBytes(32).toString('hex')+'\n')"
```
`.env.local` vise le projet distant et ne contient pas ce secret : une Note créée avec `npm run dev` y passe donc *en erreur* temporaire, le comportement prévu sans secret. Le script de préchargement lit son propre fichier, `.env.seed`.

## Vectorisation : simulée en local, réelle en production

Aucun test automatique n'appelle OpenAI. La pile locale active `EMBEDDINGS_FAKE = "1"` dans `[edge_runtime.secrets]` de `supabase/config.toml` : `process-document` passe alors par `_shared/fake-embeddings.ts`, avec des vecteurs déterministes, normalisés et de dimension 1 536, et journalise `embeddings_fake_active`.

La simulation exige aussi que `SUPABASE_URL` vise l'hôte interne `kong` de la pile locale. Ailleurs, elle est rejetée : la vectorisation réelle s'applique et `embeddings_fake_rejected` apparaît dans les journaux. Ce réglage ne doit jamais être posé dans les secrets du projet distant.

Seuls appels réels : `npm run test:ai` (un mot, avec la fonction locale `ai-health`), `npm run measure:search` (10 Requêtes courtes en un appel, avec la fonction locale `measure-embed`, qui ignore la simulation), `npm run test:search:live` (Recherches sur le projet distant) `npm run load:1mo -- --remote` (deux fichiers juste sous la limite de 100 Ko, supprimés à la fin) et les Documents créés en production.

**`supabase secrets set` et `config.toml`.** Lancée à la racine du projet, cette commande annonce aussi les secrets de `[edge_runtime.secrets]` : `EMBEDDINGS_FAKE` partirait sur le projet distant. Elle y serait rejetée, mais chaque traitement écrirait une erreur dans les journaux. Toujours passer par un dossier temporaire, comme `setup-seed-env.ps1`, et ne jamais confirmer avec `--yes` un nombre de secrets inattendu.

**Après un changement de `config.toml`** : redémarrer Supabase local (`npx supabase stop`, puis `npx supabase start`). Sans ce redémarrage, la pile locale n'aurait pas le réglage et la vectorisation serait réelle.

## Préchargement du mini Jeu (`seed:demo`)

`npm run seed:demo -- --mini` crée 2 Comptes de démo, 3 Comptes de mesure et 9 Notes (`demo/documents/`, dont une Note longue à 5 Passages), déclenche `process-document` comme Next.js et attend *prêt*. Il est relançable sans doublon, ne supprime jamais rien, n'appelle jamais OpenAI et n'affiche ni identifiant ni secret. Sa dernière ligne, `contrôle final réussi`, confirme que chaque Document est *prêt* et a des Passages ; avec `--remote`, elle confirme aussi que les vecteurs sont réels.

`.env.seed` est ignoré par git et n'est pas lu par Next.js. La clé `service_role` et les identifiants de démo n'entrent jamais dans `.env.local` ni dans Vercel. Pour se connecter avec un Compte de démo, lire le fichier localement.

Hors de la machine locale, `--remote` et une adresse `https` sont obligatoires. Pour la pile locale, utiliser un second fichier ignoré par git (par exemple `.env.seed.local`, avec `--seed-file`), contenant `SEED_SUPABASE_URL=http://127.0.0.1:54321`, la clé donnée par `npx supabase status` et le `PROCESS_DOCUMENT_SECRET` de `supabase/functions/.env`. `check:secrets` ne contrôle que `.env.seed`.

**Projet distant : ordre obligatoire.**

1. **Pose du secret.** À la racine du projet, dans une seule session PowerShell :
   ```powershell
   powershell -NoProfile -File scripts\setup-seed-env.ps1
   ```
   Le script refuse de s'exécuter hors de la racine. Il demande la clé `service_role` en saisie masquée (Supabase › Project Settings › API Keys) et vérifie son format sans l'afficher. Il contrôle que la CLI vise bien le projet lié, l'affiche et demande de retaper sa référence. Il génère ensuite le nouveau secret et les mots de passe, pose ce seul secret dans Supabase, puis écrit `.env.seed` ; en cas d'échec, ce fichier reste inchangé. Relancé plus tard, il conserve les identifiants, mais **régénère toujours le secret** : reprendre alors les étapes 2 à 4.
2. **Vercel.** Le secret est dans le presse-papiers : Settings › Environment Variables › `PROCESS_DOCUMENT_SECRET`, Production seulement (pas en Preview), **Sensitive**. Enregistrer, puis taper `OK` dans le terminal : le presse-papiers est effacé.
3. **Redéploiement.** Vercel › Deployments › dernier déploiement de production › Redeploy. Une variable Vercel ne s'applique qu'aux déploiements suivants. Jusqu'à la fin du redéploiement, chaque Note créée passe *en erreur*.
4. **Vérification.** Créer une Note courte sur Vercel : elle doit passer à *prêt*. Sinon, les secrets diffèrent : ne pas continuer.
5. **Nettoyage des Notes de test.** Dans l'éditeur SQL de Supabase, lister d'abord ce qui serait supprimé :
   ```sql
   select id, title, status, created_at
   from public.documents
   where title not in (
     'Procédure de facturation',
     'FAQ comptabilité',
     'Procédure congés et absences',
     'Compte rendu client : Atelier Lumen',
     'Note de réunion : finance de mars',
     'Guide des relances clients',
     'Document de test : .md piège',
     'Document de test : piège à 375 px',
     'Procédure de gestion des incidents'
   )
   order by created_at desc;
   ```
   Puis, **seulement après avoir vérifié cette liste**, lancer séparément :
   ```sql
   delete from public.documents
   where title not in (
     'Procédure de facturation',
     'FAQ comptabilité',
     'Procédure congés et absences',
     'Compte rendu client : Atelier Lumen',
     'Note de réunion : finance de mars',
     'Guide des relances clients',
     'Document de test : .md piège',
     'Document de test : piège à 375 px',
     'Procédure de gestion des incidents'
   );
   ```
   Les Passages sont supprimés avec leur Document. Cette requête retire **tout** Document dont le titre n'est pas dans cette liste : ne plus la lancer une fois le projet utilisé.
6. **Préchargement distant.**
   ```powershell
   npm run seed:demo -- --mini --remote
   ```
7. **Contrôle.** Le script doit finir par `contrôle final réussi : 9 Documents prêts, 13 Passages`. Dans l'éditeur SQL :
   ```sql
   select d.title, d.status, count(p.id) as passages, min(p.embedding_model) as modele
   from public.documents d
   left join public.passages p on p.document_id = d.id
   group by d.id
   order by d.title;
   ```
   Attendu : 9 lignes, toutes `ready`, avec au moins 1 Passage (5 pour « Procédure de gestion des incidents ») et `text-embedding-3-small`.

**Coût.** 9 Notes, dont 8 courtes et une d'environ 4 000 caractères, moins d'un millième de dollar.

## Secrets et variables (noms seulement)

| Nom | Où | Navigateur |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, Vercel | Oui (publiques) |
| `PROCESS_DOCUMENT_SECRET` | Vercel (Production seulement), secrets Supabase (`supabase/functions/.env` en local, ignoré par git), `.env.seed` | Non |
| `SUPABASE_SERVICE_ROLE_KEY` | Secrets Supabase, `.env.seed` | Non |
| `OPENAI_API_KEY` | Secrets Supabase uniquement (`supabase/functions/.env` en local, ignoré par git) | Non |
| `AI_DAILY_QUOTA`, `RAG_MIN_SIMILARITY`, `GENERATION_MODEL` | Secrets Supabase | Non |
| `EMBEDDINGS_FAKE` (pas un secret) | `supabase/config.toml`, pile locale uniquement, jamais sur le projet distant | Non |
| `DEMO_ACCOUNT_*`, `MEASURE_ACCOUNT_*`, `SEED_SUPABASE_URL` | `.env.seed` (préchargement et mesures), jamais lu par Next.js | Non |

## Contrôle des secrets

`npm run check:secrets` refuse : une clé OpenAI (`sk-` suivi d'au moins 20 caractères), une clé secrète Supabase (`sb_secret_`), un jeton JWT dont le rôle est `service_role`, une affectation avec valeur de `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `PROCESS_DOCUMENT_SECRET`, et le motif témoin `NEXAMIND_CANARY_DO_NOT_DEPLOY` lorsqu'il reçoit une valeur. La clé publique Supabase (`sb_publishable_…`, ou JWT de rôle `anon` ou `authenticated`) est autorisée. Si `.env.seed` existe sur le poste, ses valeurs secrètes et ses identifiants de démo sont aussi cherchés dans le dépôt et dans `.next/static`. Il échoue aussi, avant tout parcours et donc avant `next build`, si l'un de ces trois secrets est défini dans l'environnement du build avec une valeur de moins de 32 caractères ou ressemblant au nom d'une variable (nom collé à la place de la valeur, cause de l'échec Vercel du 2026-11-06). Un secret absent ou vide n'est pas concerné. Le script n'affiche jamais une valeur détectée : seulement le fichier, la ligne et le type de clé.
