# Journal de Vibe Coding — NexaMind AI

Une entrée par story : objectif, instructions clés données à l'IA, ce que l'IA a produit, ce qui a été corrigé ou refusé et pourquoi, tests, durée. Ce journal alimente le dossier de démarche (story 7.6) et la mesure du rythme réel (2 stories par jour ouvré visées).

## Story 1.1 — Chaîne de vérification et premier déploiement (2026-11-04)

**Objectif.** Un environnement local vérifié, des tests qui tournent, un contrôle automatique des secrets et un premier déploiement Vercel, pour que chaque story suivante soit testée et livrée sans risque d'exposer une clé.

**Instructions clés données à l'IA.**
- Workflow `bmad-build` : créer d'abord le fichier de story, présenter le plan, les fichiers et les risques, puis implémenter après approbation.
- Ne jamais demander de secret ni de mot de passe dans la conversation : indiquer quoi saisir soi-même dans le terminal.
- Précision ajoutée à l'approbation : ne pas bloquer la clé publique Supabase, même au format JWT ; refuser les clés `service_role`, les clés secrètes et tout JWT de rôle `service_role`, sans afficher leur valeur.
- Aucun commit ni push sans accord explicite.

**Ce que l'IA a produit.**
- Outillage épinglé : CLI Supabase 3.0.0, Vitest 5.1.0, Playwright 1.64.1, @axe-core/playwright 4.14.0, tsx 4.23.15.
- `supabase/` initialisé (`per_worker` par défaut), `supabase/migrations/` vide.
- `scripts/check-env.ts`, `scripts/check-secrets.ts` (mode dépôt et mode `--static`), `scripts/deploy-supabase.ts`.
- 19 tests unitaires, dont tous les cas de la matrice de la story, avec des fausses clés construites à l'exécution ; un test de fumée Playwright.
- `vercel.json` (région `fra1`, build `npm run build:ci`), `.env.example` complété sans valeur, `docs/environnements.md`.

**Corrigé ou refusé, et pourquoi.**
- Conflit de dépendances : Vitest 5.1 exige `@types/node` 22 ou plus ; aligné sur `@types/node` 24, la version de Node installée, plutôt que de forcer l'installation.
- Premier passage de `check:secrets` : 4 faux positifs sur des exemples de documentation (`=abc…`, `=<valeur>`) et une valeur vide entre guillemets. Règle resserrée : une affectation ne compte que si la valeur a la forme d'une clé (8 caractères ou plus). Le motif témoin n'est reconnu qu'avec une valeur, pour que la documentation puisse le citer.
- Avertissement de sécurité de Node sur `spawn` avec `shell: true` et des arguments séparés : commandes passées en une seule chaîne constante.
- Test négatif du contrôle des secrets fait en local avec un fichier non suivi, généré puis supprimé, plutôt qu'en poussant un faux secret sur GitHub.

- `supabase start` bloqué par le conteneur `analytics` (Logflare), qui ne devient pas sain sous Windows : service désactivé dans `supabase/config.toml`, inutile au projet.

**Revue (trois relecteurs IA indépendants : sans contexte, cas limites, vérifications manquantes).** 30 remarques triées, dont 18 corrigées :
- détection : un nom de secret préfixé (`NEXT_PUBLIC_…`), la syntaxe `:` (YAML, JSON), le motif témoin entre guillemets ;
- détection : la valeur exacte des secrets présents dans l'environnement du build, pour `PROCESS_DOCUMENT_SECRET`, qui n'a pas de format reconnaissable ;
- faux positif supprimé sur `Deno.env.get(...)` ;
- fichiers non contrôlés listés, et fichiers UTF-16 décodés ;
- nouveaux tests : tests du script en ligne de commande (codes de sortie, `--static`), test dans un vrai dépôt git, test de Supabase local ;
- délais des commandes externes, version de Node épinglée, mot de passe de 8 caractères et URL locale dans `config.toml`.

Points reportés : 4, dans `deferred-work.md`. Remarques rejetées après vérification : 8.

Constat en chemin : la CLI Supabase met 31 s à répondre via `npx`, contre 9 s quand on appelle son binaire local ; `check:env` appelle donc le binaire directement.

**Tests.**
- `npm test` : 30 réussis, Supabase local démarré.
- `npm run check:secrets` : aucun secret (293 fichiers).
- `npm run build:ci` : réussi. Échec attendu avec le fichier piégé, supprimé ensuite.
- `npm run test:e2e` : 1 réussi.
- `npm run lint` : 0 erreur.
- `npm run check:env` : Docker OK · Supabase CLI 3.0.0 OK.

**Durée.**
- Implémentation locale : de 11:03 à 11:30.
- Revue et corrections : de 11:30 à 12:00.
- Planification et rédaction de la story : environ 45 min.
- Total : environ 1 h 45, hors actions de l'utilisateur.
- Les étapes qui demandent l'utilisateur (`supabase link`, configuration Vercel, pushes) restent à mesurer.

**Mise en ligne (2026-11-04, après accord).**
- Commit `3229aaf` poussé sur `main` : déploiement Vercel réussi.
- Branche témoin `test/check-secrets` : build Vercel en échec comme attendu, puis branche supprimée en local et sur GitHub.
- L'IA n'a pas accès aux journaux de build ni aux URL protégées de Vercel : la région `fra1` et les lignes `check:secrets` sont vérifiées par l'utilisateur dans le tableau de bord.
- Confirmé par l'utilisateur : deux passages de `check:secrets` sans secret dans le build de `main` ; échec du build témoin sur le fichier témoin, valeur masquée.
- Constat : malgré `"regions": ["fra1"]` dans `vercel.json`, Vercel affichait la région `iad1` (badge « Overridden »). La région a été réglée sur `fra1` dans le tableau de bord ; à confirmer sur un nouveau déploiement.
- HTTPS confirmé ; Function Region `fra1` dans le tableau de bord (badge « Overridden », cohérent avec `vercel.json`).
- **Réserve :** la région d'exécution réelle n'est pas encore prouvée (la page 404 n'expose que le point d'entrée `cpt1`). Elle sera contrôlée avec `x-vercel-id` sur la première route dynamique, au plus tard en story 1.4.

**Statut final.** Story 1.1 passée à `done` le 2026-11-04, avec cette réserve.

## Story 1.2 — Identité visuelle et coquille de navigation (2026-11-04)

**Objectif.** Une application en français, à l'identité de NexaMind AI, avec une navigation claire sur ordinateur comme à 375 px, utilisable au clavier.

**Instructions clés données à l'IA.**
- Workflow `bmad-build` : fichier de story, plan, fichiers et risques avant de coder.
- Précisions à l'approbation : « Se déconnecter » visible et utilisable au clavier en `aria-disabled` tant que la session n'est pas branchée ; aucun libellé codé en dur hors du catalogue de textes ; seulement les composants shadcn `Button` et `Sheet`.
- Aucun commit ni push avant la vérification manuelle.

**Ce que l'IA a produit.**
- Thème shadcn aligné sur les jetons de DESIGN.md, en mode clair uniquement.
- Catalogue de textes `src/lib/texts.ts`.
- Coquille de navigation : barre latérale, barre du haut, menu en `Sheet`, lien d'évitement, logo à trois nœuds.
- Cinq pages vides avec leur titre.
- Focus envoyé sur le titre à chaque changement d'écran.
- 22 tests Playwright aux deux largeurs (1 280 et 375 px), avec axe.

**Corrigé ou refusé, et pourquoi.**
- Le CLI shadcn a ajouté une dépendance `cn` inconnue. Vérifiée avant usage : paquet de l'éditeur de shadcn, sans script d'installation. Épinglée à sa version exacte, car publiée deux jours plus tôt.
- Libellés du bouton de fermeture du `Sheet` (« Close », en anglais et codé en dur) et anneau de focus semi-transparent de shadcn : remplacés par le catalogue et par l'anneau de DESIGN.md.
- Test de l'anneau de focus en échec : la propriété `transition-all` animait l'anneau. Les transitions sont limitées aux couleurs.
- Retour du focus sur ☰ après un lien du menu en échec : en développement, React rejoue les effets au montage, ce qui consommait deux fois l'état de focus. La décision est désormais figée une seule fois par titre.
- Documentation de Next.js 16 consultée : avec `cacheComponents`, la navigation qui lit `usePathname` est placée dans une frontière `Suspense`, pour ne pas casser le build quand arriveront les routes à paramètres.

**Tests.**
- `npm test` : 30 réussis.
- `npm run test:e2e` : 23 réussis ; 5 sautés, propres à l'autre largeur.
- axe : aucune violation sur les 5 pages, aux deux largeurs.
- `lint` : 0 erreur. `tsc` : 0 erreur.
- `build:ci` : réussi, aucun secret.

**Durée.** De 12:50 à 13:15 pour l'IA, soit environ 25 min, planification comprise ; vérification manuelle par l'utilisateur ensuite.

**Revue.** Relecteurs non lancés pour cette story, à la demande de l'utilisateur ; vérification manuelle validée (ordinateur, 375 px, clavier).

**Statut final.** Story 1.2 passée à `done` le 2026-11-04 à 13:23.

## Story 1.3 — Créer un Compte (2026-11-04)

**Objectif.** Un Visiteur crée un Compte avec son e-mail et un mot de passe, sans confirmation par e-mail, et arrive connecté sur le Tableau de bord ; profils et règles d'accès posés au niveau de la base.

**Instructions clés données à l'IA.**
- Workflow `bmad-build`. Points à vérifier imposés par l'utilisateur :
  - création sans confirmation par e-mail ;
  - ligne `profiles` créée par déclencheur ;
  - rôle `anon` sans accès ;
  - tests RLS à deux Comptes ;
  - forme d'erreur unique et textes du catalogue ;
  - envoi unique du formulaire.
- Décisions à l'approbation :
  - texte de l'erreur inattendue (option A) ;
  - mot de passe jamais renvoyé, journalisé ni placé dans une URL ;
  - message « e-mail déjà utilisé » de FR-1 testé sur Supabase local ;
  - `/connexion` et « Non connecté » acceptés jusqu'à la story 1.4.
- Revue par trois relecteurs demandée pour cette story sensible. Aucun commit ni push sans validation.

**Ce que l'IA a produit.**
- Base : migration `profiles` avec déclencheur `security definer`, RLS et rôle `anon` sans privilège.
- Serveur :
  - forme d'erreur unique (AD-19) ;
  - schéma `zod` ;
  - Server Action qui appelle Supabase Auth, avec les erreurs de Supabase traduites en messages du catalogue.
- Interface : page `/inscription` (E2), avec `FormField`, `SubmitButton` et `ErrorAlert`.
- Tests :
  - unitaires ;
  - d'intégration RLS à deux Comptes sur Supabase local ;
  - Playwright sur Supabase local, à deux largeurs.

**Corrigé ou refusé, et pourquoi.**
- `zod` renvoyait un message anglais quand un champ était absent : message du catalogue imposé.
- Double envoi possible : le verrou du formulaire était libéré avant que le bouton ne quitte l'état « Création… ». Ajout de `isPending`.
- Un test de double clic comptait à tort deux requêtes : Playwright attend qu'un bouton `aria-disabled` redevienne actif avant de cliquer. Le clic pendant l'attente est désormais forcé.
- Next.js 16 refuse deux `next dev` dans le même dossier. Le serveur de test reçoit son propre dossier de build (`NEXT_DIST_DIR=.next-e2e`) et vise Supabase local : aucun Compte n'est créé sur le projet de démonstration.
- **Revue : le défaut le plus grave venait de l'IA elle-même.** Le `REVOKE` par schéma ne retirait pas le droit `EXECUTE` global de `PUBLIC` : toute nouvelle fonction SQL serait restée exécutable par un Visiteur. Défaut reproduit (`anon_exec=true`), corrigé par un défaut global, et couvert par un test qui vérifie le privilège réel.
- Revue, autres corrections :
  - l'e-mail des Collaborateurs n'est plus lisible par les autres (lecture limitée à certaines colonnes) ;
  - tests renforcés : codes `42501`, toutes les correspondances d'erreurs, double clic avec une saisie valide ;
  - paquet `server-only` déclaré ;
  - serveur de test jamais réutilisé.
- Revue : 15 remarques corrigées, 2 arbitrées par l'utilisateur puis appliquées (limite de 72 caractères ; message générique pour un mot de passe refusé pour une autre raison que la longueur), 2 reportées, 6 rejetées après vérification.

**Tests.**
- `npm test` : 62 réussis, dont la RLS à deux Comptes et les privilèges SQL.
- `npm run test:e2e` : 43 réussis ; 5 sautés, propres à l'autre largeur.
- `lint` et `tsc` : 0 erreur.
- `build:ci` : réussi, aucun secret.

**Durée.**
- Implémentation : de 13:42 à 14:30.
- Revue et corrections : de 14:30 à 14:40.
- Total : environ 1 h, hors actions de l'utilisateur (migration distante, réglage du mot de passe).

**Vérification sur Vercel (utilisateur).** Longueur minimale de 8 réglée. Confirmés : création du Compte et arrivée sur le Tableau de bord, ligne `profiles`, e-mail déjà utilisé, e-mail invalide, mot de passe trop court et trop long, envoi unique, saisie conservée.

~~**Statut final.** Story 1.3 passée à `done` le 2026-11-04 à 14:49.~~ **Annulé, story repassée en `review`.**

**Anomalie relevée par l'utilisateur : `deploy:supabase` visait la base locale.**
- **Ce qui s'est passé.** La CLI Supabase 3.0.0 vise la base **locale** par défaut. Le script de la story 1.1 appelait `supabase db push` sans `--remote` : il a « réussi » sur la stack locale, en affichant « pass --remote for projet-ia », sans rien appliquer au projet distant.
  - Ni l'IA ni la revue de la story 1.1 ne l'ont vu, et la story 1.1 notait à tort un succès distant.
  - L'utilisateur a repéré le message et appliqué la migration lui-même avec `supabase db push --remote`.
- **Correction.**
  - Le script passe désormais `--remote=<référence liée>` à `db push` et à `functions deploy`, et échoue sans projet lié.
  - Il lit la cible réelle dans la sortie JSON de la CLI, qu'elle produit quand sa sortie n'est pas un terminal, et refuse une cible locale ou un autre projet.
  - Il vérifie ensuite, avec `migration list --remote`, que chaque migration locale est présente sur le projet distant.
  - Tests unitaires, dont un sur la sortie locale réelle de la CLI.
- **Leçon pour la démarche.** Un script de déploiement doit prouver sa cible, pas seulement réussir. Un « succès » sans preuve de la cible ne vaut pas validation d'un critère distant.
- **Second correctif.** Sur le projet distant, le script corrigé s'arrêtait : « la CLI n'a pas indiqué sa cible ». Dans un terminal interactif, la CLI n'écrit pas le JSON de sa cible. Le script force désormais `--output-format json` et compare exactement `project_ref`, après relevé du format réel de la CLI (dry-run sans modification). Le lancement complet vers la production a été refusé à l'IA par la règle de sécurité de l'outil : il est fait par l'utilisateur.
- **Confirmation par e-mail encore active sur le projet distant.**
  - L'utilisateur a repéré `mail.send` dans le journal Auth et l'a désactivée.
  - Le prérequis, coché trop tôt, est corrigé dans la documentation, avec une procédure de contrôle.
  - Le code traite désormais ce cas clairement : un Compte accepté sans session produit un résultat dédié (`confirmation_required`) et un message neutre. Ce n'est plus l'erreur « Le Compte n'a pas pu être créé. », qui était fausse. L'événement est journalisé sans donnée personnelle.
- **Leçon.** Un prérequis de configuration distante doit être vérifié par un effet observable (ici, une inscription qui ouvre une session), pas seulement coché.
- **Statut final.** Story 1.3 passée à `done` après les vérifications de l'utilisateur sur Vercel. Critère AC5 de la story 1.1 clôturé ensuite : `npm run deploy:supabase` corrigé a réussi sur le projet distant (confirmé par l'utilisateur).

## Trajectoire du 2026-11-04 (fin de la séquence 8, préparation de la séquence 9)

**Décision de l'utilisateur, sans retirer d'exigence P0.**
- **Calendrier :**
  - le 04/11, la story 1.4 ;
  - le 05/11, les stories 2.1, 2.2, puis 2.3 si possible ;
  - le 06/11, la story 2.4, puis l'ouverture de la séquence 9 avec 2.8 ;
  - le 09/11, la story 2.5, puis 3.1 et 3.2.
- **Mini Jeu (2.8) :** en Notes, dépendant de 2.4 et non plus de l'import de fichiers.
- **Test de charge (2.7) :** tranché avant 5.2a, au plus tard le 18/11.
- **Point de contrôle :** le 13/11 au soir.
- **Story 3.4 :** elle doit traiter les Notes sans fichier d'origine.
- **Story 6.2 :** elle dépend aussi de 2.6a, 2.6b et 3.4.
- **Relecteurs :** les trois relecteurs sont réservés aux stories sensibles.

**Vérification par l'IA.**
- Aucune dépendance cassée : les 52 stories ont des dépendances antérieures, et chaque date du calendrier vient après ses dépendances.
- Le suivi est synchronisé avec `epics.md`.

**Risque.** Au 13/11, 20 P0 sur 42 seraient faites. La semaine du 16/11 concentre 16 P0 (E5 et E6), ce qui est irréaliste sans arbitrage. Le rythme est remesuré le 10/11, et la décision sur le `bmad-correct-course` est prise à ce moment-là.

## Story 1.4 — Se connecter, se déconnecter et protéger les pages (2026-11-05)

**Objectif.** Un Collaborateur se connecte, reste connecté et se déconnecte. Toutes les pages, sauf la Connexion et l'Inscription, exigent une session. La région d'exécution `fra1` est prouvée sur une route dynamique (réserve de la story 1.1).

**Instructions clés données à l'IA.**
- Workflow `bmad-build`, story 1.4 uniquement, sans commencer la 2.1. Fichier de story et plan présentés avant le code.
- Points à vérifier imposés par l'utilisateur :
  - connexion, déconnexion et session persistante ;
  - routes protégées ;
  - message d'erreur qui ne désigne pas le champ fautif ;
  - redirection interne uniquement ;
  - e-mail dans la barre latérale ;
  - appel direct refusé pour un Visiteur ;
  - `x-vercel-id` en `fra1`.
- Décisions à l'approbation :
  - texte de l'échec inattendu (option A) ;
  - revue par trois relecteurs malgré la règle 11 ;
  - spec gardée entière (environ 2 500 tokens).
- Précisions de l'utilisateur :
  - refuser aussi les variantes encodées (`%2F%2F`, `%5C`, formes décodées vers une URL externe) ;
  - tester l'absence de boucle sur `/connexion` et `/inscription` ;
  - `getClaims` selon les recommandations de Supabase, les droits restant contrôlés par le serveur et la RLS.
- Aucun commit ni push sans validation.

**Ce que l'IA a produit.**
- Page `/connexion` (E1), Server Actions de connexion et de déconnexion, page « Page introuvable » (E9).
- Proxy :
  - protection des routes, avec la page demandée transmise dans `suite` ;
  - un Collaborateur connecté est renvoyé de `/connexion` et `/inscription` vers `/` ;
  - en-têtes anti-cache de Supabase appliqués.
- `safeNextPath` : chemin interne uniquement, contrôlé brut, décodé jusqu'à 5 fois, et normalisé.
- Coquille :
  - e-mail lu par `getClaims` (signature vérifiée) ;
  - `SessionGate` comme seconde barrière ;
  - « Se déconnecter » actif.
- Tests :
  - unitaires : redirection, connexion, déconnexion, proxy ;
  - intégration : lecture par `anon` de chaque table de `public` ;
  - Playwright sur Supabase local, à deux largeurs.
- Procédure de relevé `x-vercel-id` dans `docs/environnements.md`.

**Corrigé ou refusé, et pourquoi.**
- Les tests ont trouvé un contournement de la première version de `safeNextPath` : `/./%2F/exemple.com` devenait `/%2F/exemple.com`, qui se décode en `///exemple.com`. Chaque forme décodée est désormais contrôlée avant et après normalisation.
- Next.js 16 (`cacheComponents`) refusait `Date.now()`, appelé par `getClaims` pendant le pré-rendu : la lecture de session est déclarée liée à la requête (`connection()`).
- Le proxy n'appliquait pas les en-têtes `Cache-Control` fournis par `@supabase/ssr` avec les cookies de session. Ce défaut existait depuis la story 1.1. Il est corrigé et testé : une réponse qui pose une session ne doit pas être mise en cache par le CDN.
- `method="post"` est ajouté aux deux formulaires : un envoi fait avant le chargement du JavaScript ne place plus le mot de passe dans l'URL.
- Revue :
  - **Remarque la plus importante : la seconde barrière ne protégeait que l'e-mail, pas le contenu des écrans.** Corrigé par `SessionGate`.
  - Autres corrections :
    - journal `sign_in_unconfirmed` ;
    - limite de débit locale relevée (la suite e2e approchait 30 connexions par 5 min) ;
    - déconnexion simplifiée (`supabase-js` efface déjà la session locale en cas d'erreur) ;
    - tests ajoutés : proxy, cookie falsifié, envoi sans JavaScript.
  - Bilan : 13 remarques corrigées, 4 reportées dans `deferred-work.md` (dont la vérification de session dans chaque Server Action future), 12 rejetées après vérification.
- Délai de Vitest porté à 30 s : `supabase db query` met environ 6 s par appel, ce qui faisait échouer un test d'intégration de la story 1.3 sans défaut réel.

**Tests.**
- `npm test` : 157 réussis.
- `npm run test:e2e` : 93 réussis ; 5 sautés, propres à l'autre largeur.
- `lint` et `tsc` : 0 erreur.
- `build:ci` : réussi, aucun secret.

**Durée.**
- Préparation, contexte de l'épic et fichier de story : de 12:25 à 12:38 (environ).
- Implémentation et tests : de 12:40 à 12:51.
- Revue par trois relecteurs, corrections et documentation : de 12:51 à 13:12.
- Total : environ 45 min, hors validation de l'utilisateur et vérifications sur Vercel.

**Déploiement.** Commit `615a53e` poussé sur `main` après validation de l'utilisateur. Statut Vercel : « Deployment has completed ». Le suivi du déploiement par l'IA a d'abord échoué : l'outil `gh` n'est pas installé, et une boucle d'attente a tourné 10 min pour rien. Le statut a ensuite été lu par l'API publique de GitHub.

**Relevé de la région `fra1` (utilisateur).**
- Premier relevé, sur le document `/` : `cpt1::<id>`, sans segment de fonction, avec `Age: 177`.
  - La coquille statique du pré-rendu partiel venait du cache.
  - **Erreur de l'IA** : la procédure désignait cette requête comme preuve.
- Second relevé, sur le POST `connexion` (Server Action, toujours exécutée par une fonction) : `cpt1:cpt1:fra1::fra1::<id>`, avec `x-vercel-cache: BYPASS`.
  - **Région `fra1` prouvée.** Réserve de la story 1.1 levée.
  - La procédure de `docs/environnements.md` est corrigée.
- **Leçon.** Une preuve d'exécution serveur doit porter sur une requête qui passe forcément par une fonction (`x-vercel-cache: BYPASS`), pas sur une page qui peut venir du cache.

**Statut final.** Story 1.4 passée à `done` le 2026-11-05, après la vérification de l'utilisateur. L'Epic 1 reste `in-progress` : la story 1.5 (FINITION) est en `backlog`, planifiée après E4.

## Story 2.1 — Préparer l'accès à l'IA (2026-11-05)

**Objectif.** Un accès unique, borné en coût et invisible du navigateur au fournisseur d'IA, avant le premier traitement. Preuve que la clé donne accès à `gpt-5.4-mini` et à `text-embedding-3-small` (1 536 dimensions).

**Instructions clés données à l'IA.**
- Workflow `bmad-build`, story 2.1 uniquement, sans commencer la 2.2.
- Fichier de story et plan présentés avant le code.
- Exigences : AD-3, AD-4, AD-15 et NFR-2 respectés, aucune référence OpenAI dans `src/`.
- **Clé.** L'utilisateur ne la communique jamais. L'IA fournit une méthode pour la poser sans l'afficher, sans l'écrire dans l'historique du terminal et sans la commiter.
- Décisions à l'approbation :
  - `ai-health` reste en local, exclue de `deploy:supabase` ;
  - revue ciblée sur les secrets et le module OpenAI, sans les trois relecteurs ;
  - spec gardée entière.
- Alerte à 5 $ : la réponse reçue (« oui/non ») n'était pas tranchée. Elle est notée « à confirmer ».

**Ce que l'IA a produit.**
- `supabase/functions/_shared/` :
  - `config.ts` : modèles, dimension, version, lots de 96, délais ;
  - `errors.ts` : codes AD-19, identiques à ceux de Next.js ;
  - `ai.ts` : `embed` et `checkModelAccess`, en `fetch` sans SDK, avec nouvelles tentatives sur 429 et 5xx, `AI_BUDGET_EXHAUSTED`, `AI_TIMEOUT`, contrôle de la dimension et journaux sans clé ni texte.
- Fonction locale `ai-health`, réservée à la clé `service_role`.
- `deploy:supabase` déploie les fonctions par noms explicites, `ai-health` exclue.
- Tests :
  - unitaires, avec un fournisseur simulé, sur toute la matrice ;
  - de frontières : rien d'OpenAI dans `src/`, clé lue seulement par `ai.ts`, `.env` ignoré ;
  - un seul test réel, `npm run test:ai`.
- Procédure PowerShell de pose de la clé, avec `Read-Host -AsSecureString`, un fichier écrit sans BOM et `secrets set --env-file`.

**Corrigé ou refusé, et pourquoi.**
- La première configuration de `test:ai` (`mergeConfig`) additionnait les motifs `include` et lançait toute la suite. Elle est remplacée par une configuration dédiée.
- Supabase local a dû être redémarré pour servir la nouvelle fonction et lire `supabase/functions/.env`.
- Une erreur de typage dans un test faisait échouer `build:ci`. Elle est corrigée.
- Revue ciblée :
  - Les noms de fonctions, désormais passés au shell par le script de déploiement, sont filtrés (`[a-z0-9-]`). C'est la seule correction.
  - Le message d'erreur d'OpenAI, qui peut contenir un fragment de la clé, n'est jamais journalisé : seul son code l'est.
  - Points rejetés après examen : `Retry-After` ignoré ; JSON invalide retenté.

**Tests.**
- `npm run test:ai` : 2 réussis. Accès aux deux modèles, dimension 1 536, refus sans clé `service_role`.
- `npm test` : 196 réussis.
- `npm run test:e2e` : 93 réussis ; 5 sautés.
- `lint` et `tsc` : 0 erreur.
- `check:secrets` et `build:ci` : verts.

**Durée.**
- Contexte de l'Epic 2, spec et méthode de pose de la clé : de 13:41 à 13:56.
- Pose de la clé par l'utilisateur : jusqu'à 14:00.
- Implémentation et tests : de 14:01 à 14:20.
- Revue ciblée et documentation : de 14:20 à 14:25.
- Total : environ 45 min, dont environ 40 min de travail de l'IA.

**Vérifications de l'utilisateur et clôture.**
- **Alerte à 5 $** : configurée.
- **Plafond de 10 $** : le tableau de bord OpenAI affiche « Limit not enforced », donc il ne bloque pas les appels. La limite réelle est le crédit prépayé de 10 $, sans recharge automatique.
- **Leçon.** Un plafond affiché n'est pas un plafond appliqué : il faut lire son état réel dans le tableau de bord.
- **Crédit épuisé.** Ajout d'un test avec la réponse réelle d'OpenAI (429, `insufficient_quota`, message) :
  - la réponse est traduite en `AI_BUDGET_EXHAUSTED` ;
  - elle n'est pas retentée ;
  - le message du fournisseur n'est pas journalisé.
  - Le même cas est testé pendant la vérification des modèles.
- **Secret distant.** `supabase secrets list` affiche `OPENAI_API_KEY` avec une empreinte seulement (vérifié par l'utilisateur).
- **Statut final.** Story 2.1 passée à `done` le 2026-11-05. Le fonctionnement de la clé distante sera prouvé au premier traitement réel (story 2.4).

## Story 2.2 — Créer une Note (2026-11-05)

**Objectif.** Un Collaborateur crée une Note (titre, Catégorie, texte) et arrive sur la page du Document, *en cours de traitement*. La table `documents` est protégée par la RLS et par des privilèges par colonne.

**Instructions clés données à l'IA.**
- Workflow `bmad-build`, story 2.2 uniquement, sans commencer la 2.3.
- Fichier de story et plan présentés avant le code.
- Points imposés :
  - chaque Server Action protégée vérifie la session ;
  - RLS et privilèges limités, Statut non modifiable, vue en `security_invoker` ;
  - idempotence par `client_request_id` ;
  - une seule création en cas de double clic ;
  - limite de 1 000 000 octets avec un message clair ;
  - tests RLS à deux Comptes et `anon` sans accès.
- Décisions à l'approbation :
  - seul l'onglet « Note » existe avant 2.6a ;
  - message « Le texte dépasse 1 Mo, la taille maximale. » ;
  - spec gardée entière.
- Précisions de l'utilisateur :
  - `author_id` vient de `auth.uid()`, et la politique `INSERT` le vérifie ;
  - un appel direct ne peut forcer aucun champ système ;
  - un rejeu ne renvoie jamais le Document d'un autre Auteur ;
  - aucune donnée sensible dans les journaux.
- Revue ciblée sur la sécurité et la RLS, sans relecteurs.

**Ce que l'IA a produit.**
- Migration `documents` :
  - types énumérés et contraintes ;
  - `revoke all`, puis `GRANT` par colonne ;
  - politiques `to authenticated` ;
  - vue `documents_list` en `security_invoker`, avec un Statut effectif à 3 min.
- `requireUser()`, schéma `zod` (texte canonique, octets UTF-8), création idempotente.
- Page `/ajouter` (onglet Note) :
  - verrou contre le double clic ;
  - focus sur le premier champ manquant ;
  - alerte avec « Réessayer » en cas de panne ou après 10 s ;
  - dialogue « Abandonner ce Document ? ».
- Page `/documents/[id]` minimale : métadonnées, badge, texte brut, squelette de chargement.
- Tests :
  - unitaires ;
  - RLS à deux Comptes, avec les privilèges SQL réels (32 tests) ;
  - Playwright (24 tests).

**Corrigé ou refusé, et pourquoi.**
- **Défaut trouvé par les tests : sauts de ligne.** L'envoi d'un formulaire convertit `\n` en `\r\n`, si bien qu'une Note de 1 000 000 octets acceptée par le navigateur était refusée par le serveur. Le texte est désormais rendu canonique (AD-8) avant toute mesure.
- **Défaut trouvé par la revue : session expirée.** Sans session, une Server Action était redirigée par le proxy, et le formulaire affichait « Le Document n'a pas pu être enregistré » avec un « Réessayer » sans issue. Le proxy laisse maintenant passer les Server Actions, qui vérifient elles-mêmes la session (`requireUser`). Le message affiché est désormais « Votre session a expiré. ». Ce point était reporté depuis la story 1.4.
- **Next.js 16 (`cacheComponents`).**
  - La page Document exige `connection()` et une frontière `Suspense` : c'est le `loading.tsx`, qui sert aussi de squelette prévu par l'UX.
  - Pour un Document inconnu, E9 s'affiche (avec `noindex`), mais le statut reste 200 et non 404 : la réponse est déjà en flux. C'est un écart avec la spec, signalé.
- **Tests e2e instables.** Avec la nouvelle route, `next dev` recompilait les routes et rechargeait les pages pendant les tests parallèles : 31 à 35 échecs, en plus de 11 min. Le passage à un build de production pour `test:e2e` donne 117 tests réussis en 1 min.
- **Rejetés après examen :**
  - texte non canonique stocké par un appel direct : `process-document` le reconstruira en 2.4 ;
  - volume de Notes permis par l'inscription ouverte : à surveiller en 2.7.

**Tests.**
- `npm test` : 255 réussis.
- `npm run test:e2e` : 117 réussis ; 5 sautés.
- `lint` et `tsc` : 0 erreur.
- `build:ci` et `check:secrets` : verts.

**Durée.**
- Spec et plan : de 14:48 à 15:00.
- Implémentation et tests de la story : de 15:00 à 15:45.
- Stabilisation de la suite e2e, en grande partie des exécutions longues attendues : de 15:45 à 16:50.
- Revue ciblée, corrections et documentation : de 16:50 à 17:05.
- Total : environ 2 h 15, dont environ 1 h liée à l'instabilité de `next dev` en test.

**Validation et migration distante.**
- **Validation.** L'utilisateur valide la story et accepte l'écart du statut 200 (consigné dans `deferred-work.md`).
- **Échec de `npm run deploy:supabase`.** Il échouait avec seulement « supabase db push a échoué ». L'utilisateur a appliqué la migration avec `supabase db push --remote`, puis le script a réussi.
  - Cause : la CLI exige `--yes` pour appliquer une migration en attente sur un projet hébergé sans terminal interactif. Le script jetait la sortie JSON qui contenait l'erreur.
  - Correction : `--yes` sur `db push` et `functions deploy`, erreur de la CLI affichée (identifiants masqués), tests avec une CLI simulée.
- **Leçon (déjà notée en 1.3, à nouveau).** Les chemins d'échec d'un script de déploiement doivent être testés autant que le chemin de succès. Le scénario « migration en attente » n'avait jamais été joué : la première migration avait été appliquée à la main.
- **Durée de la correction** : de 17:05 à 17:15.

**Déploiement.** Commit `72afdd5` poussé sur `main`. Statut Vercel : « Deployment has completed ».

**Vérification de l'utilisateur en production.**
- Note créée, avec la notification et le badge corrects.
- Ligne `documents` avec `status = processing` et le bon `author_id`.
- Document lisible par un second Compte, sans action de modification.
- **Après 3 min**, le badge passe à « en erreur » : c'est attendu tant que le traitement (2.3, 2.4) n'existe pas. La notification « Document ajouté. Traitement en cours. » reste pourtant affichée, car elle dépend du paramètre `?ajoute=1` et non de l'état réel. Reporté à la story 2.3 : le bandeau de Statut doit prendre le relais.
- **Leçon.** Un message lié à un paramètre d'URL décrit l'instant de l'action, pas l'état réel. Tout message d'état doit dériver du Statut effectif.

**Statut final.** Story 2.2 passée à `done` le 2026-11-05, après la vérification de l'utilisateur.

## Story 2.3 — Déclencher le traitement et suivre le Statut (2026-11-06)

**Objectif.** Faire déclencher le traitement par l'enregistrement d'une Note, et faire suivre le Statut automatiquement, sans encore traiter le texte (story 2.4).

**Instructions clés données à l'IA.**
- Créer le fichier de story et présenter le plan, les fichiers et les risques avant de coder.
- Vérifier le `202` et `EdgeRuntime.waitUntil`, `PROCESS_DOCUMENT_SECRET`, `abandon_processing` à 5 s, le suivi automatique, le bandeau à la place de `?ajoute=1`, `deploy:supabase` et l'absence de secret dans le navigateur ou le dépôt.
- Faire la revue à trois relecteurs (règle 11).
- Aucun commit ni push sans validation. Ne pas commencer 2.4.

**Décisions de l'utilisateur.**
- « Relancer le traitement » est visible pour l'Auteur seulement, avec `aria-disabled` et une explication courte, jusqu'à la story 2.5.
- Le secret local est généré sans être affiché, uniquement dans un fichier ignoré par git.
- Chaque route `/api/` vérifie elle-même la session, et `process-document` n'est appelée que côté serveur.
- Spec gardée entière, malgré sa longueur.

**Ce que l'IA a produit.**
- Migration `fail_processing` (`service_role`) et `abandon_processing` (Auteur), en une seule mise à jour conditionnelle.
- Edge Function `process-document` : secret, tentative, `waitUntil`, `202`. Le travail se réduit à une journalisation.
- Appel serveur limité à 5 s, abandon avec le jeton de l'Auteur, route `GET /api/documents/[id]/status`, `StatusBanner` et interrogation toutes les 3 s.
- Procédure de création du secret en production dans `docs/environnements.md`, sans que la valeur soit communiquée.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Fausse preuve détectée par la revue.** Le journal de fin de travail partait **avant** le `202`, parce que le travail s'exécutait de façon synchrone. La lecture des journaux ne prouvait donc pas qu'il survit à la requête, alors que l'IA l'avait présentée comme une preuve. Corrigé : le travail attend 200 ms, et un test d'intégration lit l'ordre réel des journaux.
- **Procédure dangereuse.** La commande documentée pour la clé OpenAI aurait envoyé le secret **local** en production. Procédure réécrite.
- **Autres corrections de revue.** Privilège `service_role` retiré d'`abandon_processing`, arrêt du suivi sur `401` et `404`, délai de 2 s sur l'abandon, cause des échecs dans les journaux, espacement du bandeau vide, nom des secrets refusé dans `.next/static`.
- **Rejetés ou renvoyés.** Pannes passagères répétées et `no_text` (2.5), rejeu après une panne (décision de la spec), limite de 10 s du formulaire (valeur UX). 28 constats sont consignés dans le fichier de story.
- **Écart de méthode.** L'implémentation a été faite directement, sans sous-agent, car tout le contexte était déjà chargé.
- **Test fragile.** Le contrôle axe de la page Document s'exécutait sur le squelette de chargement : il attend désormais le titre.

**Leçon.** Une preuve doit pouvoir échouer. Avant de présenter une observation comme une preuve, se demander si elle resterait vraie sans le comportement à prouver.

**Tests.**
- `npm test` : 341 réussis.
- `npm run test:e2e` : 145 réussis ; 5 sautés.
- `lint` et `tsc` : 0 erreur.
- `build:ci` et `check:secrets` : verts. Ni le nom ni la valeur locale du secret dans le code envoyé au navigateur.
- Mesure locale : `202` en 37 à 107 ms à chaud, environ 1 070 ms à froid.

**Durée.**
- Lecture, spec et plan : de 10:59 à 11:09.
- Implémentation et tests : de 11:09 à 11:48.
- Revue par les trois relecteurs, tri et corrections : de 11:48 à 12:05.
- Vérification finale, suivi et journal : de 12:05 à 12:25.
- Total : environ 1 h 25.

**Validation de l'utilisateur.**
- Story validée, avec une correction : tant que `retry_processing` n'existe pas, le message de l'Auteur devient « Le traitement n'a pas pu aboutir. La relance sera bientôt disponible. ». Le paragraphe séparé sous le bouton disparaît, et le bouton est décrit par ce message.
- La raison enregistrée en base garde le texte d'AD-5 : elle n'est pas affichée avant la story 2.5.
- L'utilisateur passe les vérifications locales, déjà couvertes par les tests.

**Premier déploiement : échec sur Vercel.**
- Après la pose du secret et un `deploy:supabase` réussi, le commit `3973977` a échoué sur Vercel. Le build passait sous Windows et sous Linux (Docker), sans reproduire le problème.
- **Cause, trouvée par l'utilisateur dans les journaux Vercel.** La valeur posée dans Vercel était le nom de la variable. `check:secrets` compare la valeur exacte du secret : il la trouvait à chaque mention du nom, dans 55 fichiers. Le contrôle a bien bloqué le build, mais avec un message trompeur.
- **Correction de l'utilisateur.** Nouveau secret de 64 caractères hexadécimaux, posé dans Supabase et Vercel depuis une seule session PowerShell.
- **Garde-fou demandé.** `check:secrets` échoue d'abord, avec un message clair et sans afficher la valeur, si un secret connu fait moins de 32 caractères ou ressemble au nom d'une variable (majuscules, séparateurs et valeur collée après le nom compris).
- **Leçon.** La procédure reposait sur un copier-coller manuel, que rien ne vérifiait. Une configuration erronée doit être dénoncée comme telle, et pas seulement faire échouer un contrôle en aval.
- **Durée de la correction** : de 13:15 à 13:55 environ, exécutions longues comprises.

**Contrôles après le garde-fou.** `npm test` : 353 réussis. `npm run test:e2e` : 145 réussis ; 5 sautés. `lint`, `tsc`, `build:ci` et `check:secrets` : verts.

**Déploiement.** Commit `f72be03` poussé sur `main`. Statut Vercel : « Deployment has completed ».

**Vérification de l'utilisateur en production.**
- Note créée sans erreur immédiate, bandeau correct, URL sans `?ajoute=1`.
- Journal Vercel `process_document_accepted` avec `duration_ms` à 735, sans `process_document_call_failed`.
- Passage en erreur après 3 min sans rechargement, avec le message et le bouton inactif pour l'Auteur.
- Pour un second Compte : « Seul l'Auteur de ce Document peut relancer le traitement. », sans bouton.

**Remarque de l'utilisateur.** Vercel classait `process_document_accepted` au niveau Error, car toute la journalisation passait par `console.error`. Une fonction `logInfo` place désormais les événements normaux au niveau Info, des deux côtés, avec des tests sur le niveau.
- **Leçon.** Un journal de succès classé en erreur noie les vraies erreurs : le niveau fait partie du contrat, au même titre que le contenu.

**Statut final.** Story 2.3 passée à `done` le 2026-11-06, après la vérification de l'utilisateur.

## Story 2.4 — Traiter une Note jusqu'à « prêt » (2026-11-06)

**Objectif.** Découper une Note en Passages, les vectoriser et faire passer le Document à *prêt* en une seule opération, pour qu'elle devienne interrogeable.

**Instructions clés données à l'IA.**
- Créer le fichier de story et présenter le plan, les fichiers et les risques avant de coder.
- Vérifier la normalisation, les positions exactes, la coupure des phrases trop longues, les lots, la dimension 1 536, la RLS, l'atomicité, le refus d'une tentative périmée et l'affichage de *prêt* sans rechargement.
- Mesurer un Document d'environ 60 000 caractères et prouver le secret distant par un premier appel réel.
- Limiter le coût des tests réels au strict nécessaire.
- Faire la revue à trois relecteurs. Aucun commit ni push sans validation. Ne pas commencer 2.5.

**Décisions de l'utilisateur.**
- Vectorisation simulée en local, rejetée si `SUPABASE_URL` n'est pas l'hôte local, avec un test qui le prouve et un journal clair à l'activation.
- Vecteurs simulés déterministes, normalisés et de dimension 1 536, pour des tests de recherche reproductibles.
- Le texte normalisé est l'unique référence pour l'affichage, le découpage et les positions.
- Piste d'une écriture des Passages par lots notée pour la story 2.7.

**Ce que l'IA a produit.**
- Migration : pgvector, table `passages` (RLS, index HNSW cosinus), `complete_processing` atomique.
- `normalize.ts`, `chunk.ts`, `fake-embeddings.ts`, travail complet dans `process-document`.
- Bandeau « Votre Document est prêt. », script et protocole de mesure.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Risque repéré avant de coder.** Sans précaution, chaque Note des tests aurait appelé OpenAI : d'où la simulation limitée à la pile locale.
- **Test sans valeur corrigé par l'IA.** Un test « valeur figée » comparait un résultat à lui-même. Il compare désormais à une valeur réelle.
- **Revue : 24 constats triés, 18 corrigés.** Notamment :
  - Passage de 2 caractères (« M. ») reproduit, corrigé par un plancher de 400 caractères ;
  - `complete_processing` pouvait passer à `ready` sans Passage et effacer les anciens ;
  - le protocole de mesure aurait abîmé les accents sous PowerShell 5.1 ;
  - des tests restaient verts sans la préférence pour les paragraphes (mutants vérifiés par un relecteur) ;
  - « Votre Document » s'affichait à un non-Auteur.
- **Rejetés ou renvoyés.** Abréviations (calibrage en 4.2), dépense d'une tentative périmée, libellé de `no_text` (2.5). Le verrou `for update` reste sans test observable (`deferred-work.md`).
- **Accepté.** Une Note très courte peut être prête avant l'ouverture de la page : badge seul, sans bandeau vert.
- **Écart de méthode.** L'implémentation a été faite directement, sans sous-agent.

**Leçon.** Un test doit pouvoir échouer pour la raison annoncée : un test d'invariants reste vert si une préférence de découpage disparaît. La vérification par mutants des relecteurs l'a montré.

**Tests.**
- `npm test` : 458 réussis.
- `npm run test:e2e` : 151 réussis ; 5 sautés.
- `lint` et `tsc` : 0 erreur.
- `build:ci` et `check:secrets` : verts.
- Appel réel à OpenAI pendant la story : un seul, `npm run test:ai` (un mot).
- Chaîne complète sur 60 000 caractères avec vecteurs simulés : verte. La mesure réelle reste à faire en production (`docs/mesures/traitement-60000.md`).

**Durée.**
- Lecture, spec et plan : de 14:15 à 14:21, attente de la validation comprise.
- Implémentation et tests : de 14:21 à 14:38.
- Revue par les trois relecteurs, tri et corrections : de 14:38 à 14:55.
- Vérification finale, suivi et journal : de 14:55 à 15:05.
- Total : environ 50 min.

**Statut.** `review`. Non commitée, non déployée : en attente de la validation de l'utilisateur, de `deploy:supabase`, du push et de la vérification en production, dont la mesure.
