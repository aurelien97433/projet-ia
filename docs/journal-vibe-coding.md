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

**Déploiement.** `deploy:supabase` lancé par l'utilisateur, puis commit `637069b` poussé sur `main`. Statut Vercel : « Deployment has completed ».

**Vérification de l'utilisateur en production.**
- Note courte passée à *prêt* sans erreur : premier appel réel depuis le projet distant, la clé OpenAI distante fonctionne.
- Note de mesure de 60 000 caractères passée à *prêt* en 1,98 s (`updated_at - processing_started_at`), très en dessous de la minute exigée par NFR-3.
- 73 Passages, modèle `text-embedding-3-small`, `max(end_offset)` = 60 000 : le texte est couvert jusqu'à son dernier caractère.
- `embed_ms` et `complete_ms` n'ont pas été relevés : la répartition reste à mesurer en story 2.7.
- Le contrôle du second Compte est couvert par le test e2e.

**Statut final.** Story 2.4 passée à `done` le 2026-11-06, après la vérification de l'utilisateur.

## Story 2.8 — Mini Jeu de démonstration (2026-11-06)

**Objectif.** Ouvrir la séquence 9 : disposer d'un petit Jeu de démonstration reproductible, pour tester la Recherche et l'Assistant bien avant la dernière semaine.

**Instructions clés données à l'IA.**
- Créer le fichier de story et présenter le plan, les fichiers et les risques avant de coder.
- Fichier séparé `.env.seed`, ignoré par git et non lu par Next.js.
- Documents fictifs, dont deux contradictoires et un Document piège à marqueur vérifiable.
- Script idempotent, Documents *prêts*, avec Passages et vrais vecteurs.
- « Je ne t'enverrai jamais de secret » : proposer une méthode sûre pour le préchargement distant.
- Aucun commit ni push sans validation. Ne pas commencer 2.5.

**Décisions de l'utilisateur.**
- 8 Notes : les 6 du mini Jeu et les 2 Documents de test.
- Notes de test de production supprimées par l'utilisateur : `SELECT` d'abord, `DELETE` séparé ensuite.
- Revue à trois relecteurs, bien que 2.8 ne soit pas dans la liste de la règle 11, car la story touche aux secrets.
- `setup-seed-env.ps1` : refus hors de la racine, aucune valeur affichée, format de la clé vérifié, presse-papiers effacé après confirmation.
- Ordre : pose du secret, Vercel, redéploiement, vérification, puis préchargement distant.

**Ce que l'IA a produit.**
- `.env.seed.example`, 8 Notes et leur manifeste, `demo/questions-mini.json`.
- `scripts/seed-demo.ts`, `scripts/setup-seed-env.ps1`, contrôle de `.env.seed` par `check:secrets`.
- Mise à jour d'AD-20, d'AD-21 et de `docs/environnements.md`.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Trouvé par les tests.** `--env-file` est aussi une option de Node : `tsx` l'aurait chargé dans `process.env`, ce que la story interdit. Option renommée `--seed-file`, toute option inconnue refusée. `util.parseEnv` absorbait la ligne suivante après une valeur faite d'espaces : remplacé.
- **Défaut réel des stories 2.3 et 2.4.** Un test e2e, instable depuis la 2.3, montrait une page incohérente : bandeau « prêt », badge « en cours ». L'IA avait rejeté ce risque en 2.3. Hypothèse d'un rafraîchissement coupé réfutée par un test ; symptôme reproduit par une réponse périmée, échec avant la correction, succès après. La cause exacte sous charge n'est pas établie.
- **Revue : 37 constats triés, 24 corrigés.** Notamment :
  - e-mails de démo en dur, qui auraient cassé `build:ci` juste après l'étape 1 ;
  - une relance remplaçait une tentative vivante ;
  - un déclenchement refusé laissait le Document *en cours* ;
  - `--remote` acceptait `http://` ;
  - Ctrl+C laissait le secret dans le presse-papiers ;
  - l'indentation de la requête SQL cassait la procédure.
- **Rejetés ou renvoyés.** Changement d'Auteur au manifeste, horloge du poste, valeurs entre guillemets. Déroulé complet du script PowerShell : à vérifier à sa première exécution (`deferred-work.md`).
- **Écart de méthode.** L'implémentation a été faite directement, sans sous-agent.

**Leçons.**
- Un test « instable » est un défaut jusqu'à preuve du contraire : l'IA l'avait fiabilisé en 2.3 sans en chercher la cause.
- Rejeter un constat de revue comme improbable reste un pari : ce risque, écarté en 2.3, s'est produit.

**Tests.**
- `npm test` : 549 réussis.
- `npm run test:e2e` : 153 réussis ; 5 sautés.
- `lint` et `tsc` : 0 erreur.
- `build:ci` et `check:secrets` : verts.
- Préchargement réel sur Supabase local, avec vecteurs simulés. Aucun appel à OpenAI.

**Durée.**
- Lecture, spec et plan : de 15:15 à 15:29 environ, attente de la validation comprise.
- Implémentation et tests : de 15:29 à 15:53 environ.
- Enquête sur le badge figé et correction : de 15:53 à 16:15 environ.
- Revue par les trois relecteurs, tri et corrections : de 16:15 à 16:33 environ.
- Vérification finale, suivi et journal : de 16:33 à 16:40.
- Total : environ 1 h 25, exécutions longues comprises.

**Premier lancement de `setup-seed-env.ps1`.**
- Échec chez l'utilisateur : la CLI exige `--yes` hors terminal, et annonçait « 2 secrets » alors qu'un seul était prévu. Rien n'a été modifié : ni le projet distant, ni `.env.seed`.
- **Hypothèse sur le second secret, non prouvée.** La CLI ajouterait `EMBEDDINGS_FAKE`, lu dans `[edge_runtime.secrets]` de `config.toml`. L'IA a voulu comparer le décompte avec et sans ce fichier : le contrôle automatique a refusé cet appel au magasin de secrets distant, et l'IA n'a pas insisté.
- **Correction.** Dossier de travail temporaire sans cette section, `--remote=<référence>`, `--yes`, cible contrôlée par `secrets list`, affichée puis confirmée par l'utilisateur, qui retape la référence. Échec et réussite testés avec une fausse commande `npx`.
- **Second échec, avant toute saisie.** Sous PowerShell 5.1 avec `$ErrorActionPreference = "Stop"`, la ligne `Target:` écrite par la CLI sur stderr devenait une erreur bloquante, sur une commande de lecture. Diagnostic de l'utilisateur, confirmé. Rien n'a été écrit.
- **Correction.** `Invoke-Cli` lance la CLI dans un processus enfant, capture stdout et stderr en UTF-8, et seul le code de sortie décide. La vérification avec la vraie CLI, en lecture seule, a révélé un troisième défaut invisible avec une fausse CLI : `npx.cmd` calculait mal son dossier. Le script appelle désormais `node_modules\.bin\supabase.cmd`.
- **Leçon.** Une fausse commande prouve le contrat que l'on a imaginé, pas celui de l'outil réel : dès qu'une lecture réelle est possible sans risque, la faire.
- **Leçon.** Le texte d'une invite de la CLI compte : sans ce « 2 secrets », un simple `--yes` aurait pu envoyer un réglage local en production.

**Pose du secret réussie.**
- Secret posé dans Supabase, Vercel et `.env.seed`, depuis une seule session PowerShell. `EMBEDDINGS_FAKE` n'apparaît pas dans `supabase secrets list`.
- **Fragilité constatée par l'utilisateur.** Le presse-papiers ne contenait pas le secret au moment du collage dans Vercel : valeur recopiée depuis `.env.seed`, longueur de 64 caractères vérifiée. Cause non établie, consignée dans `deferred-work.md`.

**Déploiement.** Commit `bed350d` poussé sur `main`. Statut Vercel : « Deployment has completed ».

**Vérification de l'utilisateur en production.**
- Premier préchargement : « contrôle final réussi : 8 Documents prêts, 8 Passages », avec de vrais vecteurs.
- Requête de contrôle : 8 Documents `ready`, chacun avec au moins 1 Passage et `text-embedding-3-small`.
- Relance : tous les Documents affichent « déjà prêt », sans doublon.

**Remarque de l'utilisateur.** Les Documents du mini Jeu ne produisent qu'un Passage chacun. Le Jeu complet (7.1a) devra inclure des Documents plus longs, pour démontrer des Sources à plusieurs Passages et la navigation entre Passages. Noté dans `deferred-work.md`, avec un point d'attention : 5.7 et 5.12 arrivent avant 7.1a.

**Statut final.** Story 2.8 passée à `done` le 2026-11-06, après la vérification de l'utilisateur.

## Story 2.5 — Erreurs de traitement, expiration et relance (2026-11-09)

**Objectif.** Ne plus laisser un Document bloqué en erreur : relance réelle par l'Auteur, message après 60 s, « Actualiser » si le Statut ne répond plus.

**Instructions clés données à l'IA.**
- Créer le fichier de story et présenter le plan, les fichiers et les risques avant de coder.
- `retry_processing` fondé sur le Statut effectif, réservé à l'Auteur, avec une nouvelle tentative et un état propre.
- Aucune relance pour un `no_text`. Tests de refus pour un non-Auteur et pour un `no_text`.
- Message de 60 s calculé depuis l'horodatage serveur. « Actualiser » après trois échecs. Reprise du suivi du bandeau.
- Revue à trois relecteurs (règle 11). Aucun commit ni push sans validation. Ne pas commencer 3.1.

**Décisions de l'utilisateur.**
- Aucun bouton « Supprimer » pour un `no_text` avant la story 3.4 : critère reporté explicitement, avec son test. 2.6b crée les premiers cas réels, la veille de 3.4.
- Textes d'échec : « La relance n'a pas abouti. Veuillez réessayer. » et « Cette action n'est pas autorisée. ».
- Story gardée entière, au-dessus du repère de taille.
- Tâche ajoutée à `epics.md` avant 4.1a : un 9ᵉ Document d'environ 4 000 caractères au mini Jeu, pour avoir plusieurs Passages réels.

**Ce que l'IA a produit.**
- Migration `20261109090000_retry_processing.sql` : colonne `last_retry_request_id`, vue avec `effective_error_message`, fonction `retry_processing`.
- Server Action de relance, bandeau complet (relance, 60 s, « Actualiser », resynchronisation, `no_text`).
- Tests d'intégration, unitaires et Playwright.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Revue : 24 constats triés, 12 corrigés.** Notamment : focus clavier perdu quand le bouton activé disparaît ; verrou de la relance jamais exercé ; test des échecs « consécutifs » qui validait aussi un compteur cassé ; branches session expirée et Document supprimé jamais exécutées.
- **Rejetés.** Cumuls rares de pannes, couverts par l'expiration de 3 min. Absence de délai sur la RPC, bornée par la durée maximale de la fonction Vercel.
- **Reporté.** Test e2e de la branche du bandeau « déclenchement refusé » : il demande un nouveau banc de test.

**Tests.**
- `npm test` : 600 réussis. `lint`, `tsc`, `build:ci` et `check:secrets` : verts.
- `npm run test:e2e` : **pas entièrement stable**. Trois suites complètes (193 tests exécutés, 5 sautés) : 2 échecs, 1 échec, puis aucun. Spec du Statut seule, répétée : 152 sur 152.
- **Enquête sur ces échecs.** Toujours le badge qui suit le bandeau, comme en 2.8. Une trace montre deux rafraîchissements répondus sans changement du badge. Une mesure temporaire montre que le serveur renvoie bien « prêt », mais jusqu'à 2,8 s après sous charge. **La cause n'est pas prouvée** : la suite instrumentée n'a pas échoué.

**Leçon.** Élargir un délai de test pour le faire passer sans preuve de la cause reviendrait à masquer le défaut : la décision est laissée à l'utilisateur.

**Durée.**
- Lecture, spec, plan et attente des décisions : de 08:55 à 09:04 environ.
- Implémentation et tests par l'agent : de 09:04 à 09:29 environ.
- Revue par les trois relecteurs, tri et corrections : de 09:29 à 09:42 environ.
- Vérification complète : de 09:42 à 09:49 environ.
- Enquête sur les échecs e2e : de 09:49 à 10:09 environ.
- Suivi et journal : de 10:09 à 10:12.
- Total : environ 1 h 20, exécutions longues comprises.

**Déploiement.** `deploy:supabase` réussi sur le projet distant, avant le push. Commit `f1940d3` poussé sur `main`. Statut Vercel : « Deployment has completed ».

**Vérification de l'utilisateur en production.**
- Traitement bloqué simulé par SQL : badge en erreur, message et bouton actif pour l'Auteur.
- Clic sur « Relancer le traitement » : « Relance… », puis en cours, puis prêt, sans rechargement.
- Autre Compte : « Seul l'Auteur… », sans bouton.
- Note de test supprimée.
- Non vérifiés en production, couverts par les tests : message des 60 s, « Actualiser », `no_text`.

**Statut final.** Story 2.5 passée à `done` le 2026-11-09, après la vérification de l'utilisateur.

## Story 3.1 — Lecteur de Document et mise en évidence (2026-11-09)

**Objectif.** Un Lecteur unique qui affiche le texte brut et met les Passages en évidence, en préparation de la Recherche et des Sources.

**Instructions clés données à l'IA.**
- Évaluer d'abord si la fusion de 3.1 et 3.2 reste vérifiable en une session, avec une spec d'environ 1 600 tokens ; sinon, ne faire que la 3.1.
- Nœuds texte seulement, `<mark>`, Passage actif distinct, défilement, positions invalides sans erreur, Documents pièges.
- Revue ciblée sur la sécurité de l'affichage et l'accessibilité, sans les trois relecteurs.
- Aucun commit ni push sans validation. Ne pas commencer 3.3.

**Décisions de l'utilisateur.**
- 3.1 seule, l'IA ayant jugé la fusion trop large (environ 2 200 tokens pour la 3.1 seule). Spec gardée entière.
- Nouvelles dépendances strictement en `devDependencies`, versions fixées.
- Aucun contenu interprété comme du HTML, y compris dans les étiquettes et messages.
- Emplacement `components/documents/` accepté, architecture et `epics.md` alignés.

**Ce que l'IA a produit.**
- `src/lib/passages.ts` : validation et découpage, fonction pure.
- `DocumentReader`, composant serveur, et `PassageScroller`, seul morceau client, qui ne reçoit jamais le texte.
- Page Document branchée sur le Lecteur, sans Passage.
- Premier environnement de test de composants (Testing Library, jsdom).

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Revue ciblée : aucun problème de sécurité de l'affichage.** Trois points d'accessibilité corrigés : message hors zone vivante, texte masqué copié dans le presse-papiers, défilement animé de 1,5 s au lieu de 200 ms au plus.
- **Effet de bord repéré.** La nouvelle zone `status` du Lecteur aurait cassé les sélecteurs du bandeau : corrigé dans le test.
- **Reporté.** Étiquette « Passage pertinent ». Preuve du défilement dans un vrai navigateur, à la 3.2.

**Tests.**
- `npm test` : 641 sur 642. `lint`, `tsc`, `build:ci` et `check:secrets` : verts.
- `npm run test:e2e` : 197 réussis, 5 sautés.
- **Échec restant, hors de cette story.** `seed-demo` « en cours et vivant » : un minuteur de 1,5 s fait la course avec le script. Il réussit seul et échoue aussi sans les fichiers de test de la 3.1. Il passait en 2.5 ; la raison du changement n'est pas établie.
- **Pages prérendues.** `/documents/[id]` est partiellement prérendue, sans aucun texte de Document dans `.next/server/app`.

**Durée.**
- Évaluation de la fusion, lecture, spec et plan : de 10:28 à 10:35 environ, attente de la validation comprise.
- Implémentation et tests par l'agent : de 10:35 à 11:12 environ.
- Revue ciblée et corrections : de 11:12 à 11:22 environ.
- Vérification complète et analyse de l'échec restant : de 11:22 à 11:38 environ.
- Suivi et journal : de 11:38 à 11:40 environ.
- Total : environ 1 h 15, exécutions longues comprises.

**Correction du test `seed-demo`.** Commit séparé `c0e1d69` : le Document passe à *prêt* quand le script est observé en train de l'attendre, au lieu d'un minuteur de 1,5 s. Le test échoue bien si le script n'attend plus, et `npm test` est revenu à 642 sur 642.

**Déploiement.** Pas de migration. Commits `8a4ef4e` et `c0e1d69` poussés sur `main`. Statut Vercel : « Deployment has completed ».

**Vérification de l'utilisateur en production.**
- Une première confirmation est arrivée avant le push : la production était encore à `470b177`, et l'ancienne page affichait déjà le texte brut. L'IA a refusé de clôturer sur cette base et a demandé de refaire les contrôles.
- Sur le déploiement `c0e1d69` : `.md piège` affiché en texte, sans alerte, image ni lien créé.
- Piège à 375 px : aucun défilement horizontal.
- Document ordinaire : retours à la ligne conservés, sans surlignage, comme attendu avant la 3.2.

**Leçon.** Un contrôle de production ne vaut que si la version visée est bien déployée : vérifier le hash en production avant de clôturer.

**Statut final.** Story 3.1 passée à `done` le 2026-11-09, après la vérification de l'utilisateur.

## Story 3.2 — Page Document complète (2026-11-09)

**Objectif.** Rendre la page Document complète : Passages transmis par l'URL, source d'état unique pour le badge et le bandeau, chargement long, et stabilisation des deux tests e2e intermittents.

**Instructions clés données à l'IA.**
- Créer le fichier de story et présenter le plan, les fichiers et les risques avant de coder.
- Paramètres `passages` et `actif` validés côté serveur, `actif` indice dans la liste reçue.
- Passage actif entièrement visible dans un vrai navigateur.
- Stabiliser les deux tests sans augmenter leur délai.
- Revue ciblée sur la validation des paramètres, l'affichage et l'accessibilité, sans les trois relecteurs.
- Aucun commit ni push sans validation. Ne pas commencer 3.3.

**Décisions de l'utilisateur.**
- Barre d'actions préparée dans le code, rôle Auteur transmis, aucun bouton affiché. « Poser une question » rattaché à 5.2b ; 3.4 et 6.1 ajoutent aussi leurs boutons dans cette barre.
- Positions d'URL bornées à la longueur du texte et limitées en nombre.
- En cas d'échec persistant des tests intermittents : présenter les traces, sans modifier de délai.
- Story gardée entière.

**Ce que l'IA a produit.**
- `parsePassageParams` : seuls des entiers sortent de l'URL.
- `DocumentStatusProvider` : source unique du Statut, lue par le badge, le bandeau et la barre d'actions.
- Focus sur le Passage actif, message collant et lié au Passage quand un Passage manque.
- Message des 10 s et « Réessayer », en CSS et lien simple.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Trouvé par un essai réel.** Un minuteur client dans le contenu de chargement ne démarre jamais à l'ouverture directe d'une URL : React n'hydrate pas ce contenu en attente. Le délai est donc porté par le CSS.
- **Revue ciblée : aucun constat sur la validation des paramètres ni sur l'affichage.** Un point d'accessibilité corrigé : le message des 10 s n'aurait pas été annoncé. Un point mineur reporté.
- **Tests adaptés, délais inchangés.** `rafraîchissement périmé…` attend la fin de son intercepteur ; `le déclenchement porte un nouvel identifiant…` ne peut plus se fier au badge pour savoir que le serveur a rattrapé.

**Tests.**
- `npm test`, `lint`, `tsc`, `build:ci`, `check:secrets` : verts.
- `npm run test:e2e` : trois suites complètes, 235 réussis et 5 sautés à chaque fois, délais inchangés.
- **Stabilité à relativiser.** Les deux tests suivis passent, mais trois suites ne prouvent pas une disparition définitive. Dans un lot précédent de l'agent, sur le même code applicatif : un échec de `ajouter.spec.ts:54`, dû à un vrai échec de traitement local (`http_500` côté base, badge et bandeau d'accord sur « en erreur »), et un dépassement de cadence de `en cours…` (6 204 ms pour 6 000 ms), sur une autre assertion que le badge.

**Durée.**
- Lecture, spec et plan : de 11:58 à 12:05 environ, puis interruption par une limite d'utilisation jusqu'à 13:50.
- Décisions de l'utilisateur et préparation : de 13:50 à 13:56 environ.
- Implémentation et tests par l'agent, dont les suites e2e répétées : de 13:56 à 15:41 environ.
- Relecture du diff et revue ciblée : de 15:41 à 15:57 environ.
- Vérification finale, dont trois suites e2e : de 15:57 à 16:12 environ.
- Suivi et journal : de 16:12 à 16:15 environ.
- Total : environ 2 h 30 hors interruption, exécutions longues comprises.

**Déploiement.** Pas de migration. Commit `445b4df` poussé sur `main`. Statut Vercel : « Deployment has completed ».

**Vérification de l'utilisateur en production, sur `445b4df`.**
- Page normale avec un autre Compte : métadonnées, badge et Lecteur, sans bouton d'action.
- `?passages=0-40,200-260&actif=1` : deux Passages surlignés, le second actif et visible.
- `?passages=<script>` : seul le message de Passage introuvable apparaît.
- `/documents/abc` : « Page introuvable ».
- Affichage correct à 375 px.
- Non vérifiés en production, couverts par les tests : synchronisation du badge et du bandeau, message collant quand un Passage manque, message des 10 s.

**Statut final.** Story 3.2 passée à `done` le 2026-11-09, après la vérification de l'utilisateur.

## Correction de trajectoire — séquences 10 à 13 (2026-11-09)

**Objectif.** Relier les séquences 10 à 13 du workshop aux stories existantes, ajouter seulement les livrables manquants et refaire le calendrier, sans retirer d'exigence P0.

**Instructions clés données à l'IA.**
- Utiliser `bmad-correct-course`, présenter la proposition avant de modifier `epics.md` et `sprint-status.yaml`, ne commencer aucune story.
- Calendrier imposé : 12/11 = 9ᵉ Document, 4.1a et 4.2 ; 13/11 = 2.6a et 2.6b ; séquence 9 jusqu'au 20/11 ; séquence 10 le 23/11 ; 11 le 24/11 ; 13 le 25/11 ; 12 les 26 et 27/11.

**Décisions de l'utilisateur.**
- Proposition approuvée. 11/11 non travaillé.
- Week-ends des 14-15/11 et 21-22/11 disponibles comme tampon partiel, principalement pour l'Epic 5, sans être prévus comme jours pleins.
- 5.0 reste séparée : l'essai précoce du flux sur Vercel réduit le risque principal de l'Epic 5. L'IA avait proposé sa fusion dans 5.5 comme coupe possible : proposition refusée.
- Coupes présentées à l'utilisateur aux seuls points de contrôle (18/11 et 20/11 au soir), jamais décidées sans lui.

**Ce que l'IA a produit.**
- `sprint-change-proposal-2026-11-09.md`.
- Trois stories P0 : 7.7 (plan de tests et bilan des anomalies), 7.8 (audit global de sécurité), 7.9 (seuils, alertes, repli et décision de mise en service).
- Extensions de 7.1a et 7.2 (cas ambigus, sensibles, hostiles et dégradés), et de 7.6 (guide de reprise).

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Dépendance corrigée.** 7.3 dépendait de 7.2, alors qu'elle sert aux séquences 10 et 11, avant 7.2. Elle dépend désormais de 7.1b.
- **Refus.** Fusion de 5.0 dans 5.5.

**Risque consigné.** Du 16/11 au 20/11 : 18 P0 en 5 jours, dont 13 de l'Epic 5. Le 09/11, le rythme mesuré était de 3 P0 par jour. La semaine du 23/11 n'absorbe plus de retard : seuls les tampons des week-ends le peuvent en partie.

**Durée.** Environ 10 min, de 16:30 à 16:40 environ, attente de la validation comprise.

## Story 3.3 — Parcourir la Bibliothèque (2026-11-10)

**Objectif.** Lister tous les Documents de la Base commune, quel que soit leur Statut, avec filtre par Catégorie, filtre « Mes Documents », recherche par titre, tri par date, états vides et d'erreur, et badges mis à jour sans rechargement.

**Instructions clés données à l'IA.**
- Créer le fichier de story et présenter le plan, les fichiers et les risques avant de coder.
- Lecture par `documents_list` uniquement, sans aucune donnée de `content_text` dans la liste.
- Tableau lisible sur ordinateur, sans défilement horizontal de la page à 375 px.
- Revue ciblée sur les accès, les performances de la liste et l'accessibilité, sans les trois relecteurs.
- Aucun commit ni push sans validation. Ne pas commencer 3.5.

**Décisions de l'utilisateur.**
- Nombre de Documents visible et annoncé : « {n} Documents » / « 1 Document » / « Aucun Document ».
- 200 lignes au plus ; le nombre reste le total exact, avec un message au-delà.
- Sous 768 px : tableau resserré (Titre, Statut), « Catégorie · Auteur · date » sous le titre. Les cartes restent pour 3.6.
- Changement de Statut annoncé seulement pour les Documents de l'utilisateur.
- `/api/documents` et `/api/documents/statuses` vérifient elles-mêmes la session ; `statuses` n'accepte que des UUID valides, 200 au plus, et ne renvoie que des champs de `documents_list`.
- Index trigramme noté dans `deferred-work.md`, seulement si le volume l'exige.
- Story gardée entière.

**Ce que l'IA a produit.**
- `listDocuments` et `getDocumentStatuses` : seule lecture de la liste, colonnes explicites, jeton du Collaborateur.
- Filtres validés côté serveur ; l'Auteur de « Mes Documents » vient de la session.
- Première liste rendue côté serveur, puis `GET /api/documents` à chaque changement de filtre (recherche après 250 ms, requête précédente annulée).
- Suivi groupé des badges *en cours* toutes les 3 s, « Actualiser » après 3 échecs.
- États vides, aucun résultat, erreur avec « Réessayer » et filtres conservés ; squelette de 8 lignes.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Trouvé par un essai réel.** PostgREST traduit tout `*` d'une recherche `ilike` en joker, sans échappement possible : une recherche contenant `*` ajoute un filtre par expression régulière échappée.
- **Test adapté, délai inchangé.** « chargement lent » de la page Document partait de la Bibliothèque, dont les liens sont désormais préchargés par Next.js : départ déplacé sur `/recherche`.
- **Revue ciblée : aucun correctif.** Trois remarques mineures rejetées ou différées (identifiant d'Auteur déjà lisible, préchargement partiel des liens, recherche sans index).

**Tests.**
- `npm test` : 762 réussis. `lint`, `tsc`, `build:ci`, `check:secrets` : verts.
- `npm run test:e2e` complet : 257 réussis, 5 sautés, aucun échec.

**Durée.**
- Lecture du contexte, spec et plan : de 09:00 à 09:09 environ.
- Décisions de l'utilisateur et mise à jour de la story : de 09:09 à 09:12 environ.
- Implémentation et tests par l'agent : de 09:12 à 10:19 environ.
- Relecture du diff, revue ciblée et vérification finale, dont une suite e2e complète : de 10:19 à 10:38 environ.
- Suivi et journal : de 10:38 à 10:42 environ.
- Total : environ 1 h 40, exécutions longues comprises.

**Déploiement.** Pas de migration. Commit `4123d28` poussé sur `main`. Statut Vercel : « Deployment has completed ».

**Vérification de l'utilisateur en production, sur `4123d28`.**
- Liste complète : titre, Catégorie, Auteur, date et badge.
- Filtres combinés, recherche partielle sans casse et tri.
- Aucun résultat, puis « Réinitialiser les filtres ».
- Liens vers les Documents.
- Affichage correct à 375 px.
- `/api/documents` refusé sans session.
- Non vérifiés en production, couverts par les tests : badge mis à jour en direct, absence de texte de Document dans les réponses réseau, « Mes Documents » vide d'un nouveau Compte, erreur avec « Réessayer ».

**Statut final.** Story 3.3 passée à `done` le 2026-11-10, après la vérification de l'utilisateur.


## Story 3.5 — Tableau de bord : actions et derniers Documents (2026-11-10)

**Objectif.** Donner accès à « Ajouter un Document » et aux 5 derniers Documents de la Base commune, tous Statuts confondus, avec états de chargement, Base vide et erreur confinée à la liste.

**Instructions clés données à l'IA.**
- Créer le fichier de story et présenter le plan, les fichiers et les risques avant de coder.
- « Poser une question » : aucun bouton tant que l'Assistant n'est pas utilisable (règle de 3.2), et vérifier dans `epics.md` la story de l'Epic 5 qui l'ajoute.
- Emplacements prévus pour le champ de Recherche (4.1b) et les Conversations (5.x).
- Contrôle des pages prérendues, puisque le Tableau de bord affiche des données.
- Revue ciblée sur les accès, l'affichage et l'accessibilité, sans les trois relecteurs.
- Aucun commit ni push sans validation. Ne pas commencer la story suivante.

**Décisions de l'utilisateur.**
- `epics.md` ne rattachait le bouton « Poser une question » du Tableau de bord à aucune story : ajouté à 5.2b (tâche et critère).
- « Derniers Documents » en pleine largeur ; 5.6 passera à deux colonnes.
- Badges mis à jour sans rechargement par le suivi groupé de la Bibliothèque, avec les mêmes protections.
- `check:secrets --static` étendu aux pages prérendues, sans faux positif admis : tout signalement présenté avant exclusion.
- Story gardée entière.

**Ce que l'IA a produit.**
- Bande d'actions hors de la frontière Suspense de la liste : utilisable pendant le chargement et en cas d'erreur.
- Liste des 5 derniers Documents lue par `listDocuments` (limite optionnelle ajoutée), jamais prérendue.
- Erreur confinée à la liste, « Réessayer » qui relit seulement la liste.
- Logique de suivi des Statuts partagée avec la Bibliothèque (`status-updates.ts`), sans changement de comportement.
- `check:secrets --static` : `.next/static` et `.next/server/app` (`.html`, `.rsc`, `.body`).

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Aucun interrupteur de test en production.** L'erreur de lecture se produit côté serveur et ne peut pas être provoquée par une interception réseau : elle est prouvée par des tests unitaires.
- **Test existant ajusté.** `shell.spec.ts` cherchait le seul lien « Ajouter un Document » de la page ; le Tableau de bord en a désormais un second. Le test vise maintenant la barre du haut.
- **Revue ciblée : aucun correctif.** Quatre remarques mineures rejetées (double lien d'ajout en Base vide, « Réessayer » du message des 10 s qui recharge la page, total calculé inutilement, Documents de test datés de 2999 dans la base locale).
- **Pages prérendues.** Aucun faux positif : rien n'a été exclu.

**Tests.**
- `npm test` : 778 réussis. `lint`, `tsc`, `build:ci`, `check:secrets` (76 fichiers envoyés au navigateur) : verts.
- `npm run test:e2e` complet : 262 réussis, 10 sautés, aucun échec.

**Durée.**
- Lecture, investigation, spec et plan : de 11:01 à 11:05 environ.
- Décisions de l'utilisateur, mise à jour de la story et d'`epics.md` : de 11:05 à 11:08 environ.
- Implémentation et tests par l'agent : de 11:08 à 11:51 environ.
- Relecture du diff, revue ciblée et vérification finale, dont une suite e2e complète : de 11:51 à 12:07 environ.
- Suivi et journal : de 12:07 à 12:10 environ.
- Total : environ 1 h 10, exécutions longues comprises.

**Déploiement.** Pas de migration. Commit `4f45a0f` poussé sur `main`. Statut Vercel : « Deployment has completed ».

**Vérification de l'utilisateur en production, sur `4f45a0f`.**
- Seul « Ajouter un Document » est présent, sans « Poser une question » ni champ de Recherche.
- 5 derniers Documents avec titre, Catégorie, Auteur et badge.
- Liens vers les Documents et vers la Bibliothèque fonctionnels.
- Affichage correct à 375 px.
- Non vérifiés en production, couverts par les tests : Document d'un collègue en tête, badge mis à jour en direct, absence de texte de Document dans les réponses réseau, Base vide, chargement lent et erreur avec « Réessayer ».
- Nettoyage : l'utilisateur a supprimé la Note de test « Test relance », restée *en erreur* depuis la vérification de la story 2.5.

**Statut final.** Story 3.5 passée à `done` le 2026-11-10, après la vérification de l'utilisateur.

## Tâche préalable à 4.1a — Document long au mini Jeu (2026-11-10)

**Objectif.** Ajouter au mini Jeu un 9ᵉ Document à plusieurs Passages réels, pour le calibrage (4.2), le panneau Source (5.7) et la navigation entre Passages (5.12).

**Instructions clés données à l'IA.**
- Présenter le plan, les fichiers et les risques avant de coder.
- Note fictive NexaWorks d'environ 4 000 caractères, 4 à 5 Passages réels, cohérente avec les autres Documents, sans contradiction involontaire.
- Un fait précis en fin de texte, avec une Requête et une question pour l'Assistant.
- Préchargement idempotent : seul le nouveau Document est créé et vectorisé.
- Vérification ciblée du contenu et des tests, sans les trois relecteurs. Aucun commit ni push sans validation. Ne pas commencer 4.1a.

**Décisions de l'utilisateur.**
- Plan approuvé : « Procédure de gestion des incidents », Catégorie Procédure, Auteur B.
- Ajout : un second fait au début ou au milieu (délai de prise en charge d'un incident de priorité 1) et une question q7 qui exige les deux faits, donc deux Passages distincts, vérifiés par un test.

**Ce que l'IA a produit.**
- Note de 3 914 caractères, 5 Passages mesurés avec le vrai découpage : 30 minutes dans le 3ᵉ Passage, « premier jeudi du mois suivant » dans le dernier.
- `questions-mini.json` : q6 (fait final), q7 (deux faits, section `multiPassage`), Requête r6.
- Tests : `demo-set.test.ts` (9 Notes, nombre de Passages, deux faits dans deux Passages distincts) et intégration du préchargement (9 Notes, relance sans doublon).
- `docs/environnements.md` : 9 Notes, résultat attendu du préchargement distant.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Chiffres en double.** La première version reprenait « 10 jours ouvrés » et « 5 jours ouvrés », réponses attendues de q3 et q1 dans d'autres Documents : remplacés par 8 et 3 jours ouvrés pour ne pas brouiller le calibrage.
- **Nettoyage SQL de la documentation.** Les deux listes de titres de `docs/environnements.md` auraient fait supprimer la nouvelle Note : titre ajouté.
- **Différé.** Le découpage laisse deux intertitres en fin de Passage ; à examiner au calibrage (4.2), noté dans `deferred-work.md`.
- **Incident de vérification.** Une première suite e2e n'a pas démarré : un script temporaire de mesure du découpage était présent pendant sa vérification des types. Script supprimé, suite relancée.

**Tests.**
- `npm test` : 782 réussis. `lint`, `tsc`, `build:ci`, `check:secrets` : verts.
- Intégration du préchargement sur Supabase local : 9 Notes prêtes ; relance : 9 « déjà prêt », aucun appel à `process-document`.
- `npm run test:e2e` complet : 261 réussis, 10 sautés, 1 échec, `ajouter.spec.ts:54` (intermittent connu, traitement local sous charge, sans lien avec le mini Jeu) ; relancé seul : réussi.

**Durée.**
- Lecture, investigation et plan : de 12:30 à 12:40 environ.
- Décision de l'utilisateur, rédaction et mesures du découpage : de 12:40 à 12:50 environ.
- Tests, contrôles, vérification ciblée et journal : de 12:50 à 13:12 environ, deux suites e2e comprises.
- Total : environ 40 min, exécutions longues comprises.

**Déploiement.** Commit `007dd20` poussé sur `main`. Statut Vercel : « Deployment has completed » (application inchangée).

**Préchargement distant, lancé par l'utilisateur** (`npm run seed:demo -- --mini --remote`) : réussi.
- Les 8 Documents existants : « déjà prêt », sans nouveau traitement.
- « Procédure de gestion des incidents » : créée, 5 Passages.
- Contrôle final réussi : 9 Documents prêts, 13 Passages.

**Statut final.** Tâche préalable à 4.1a terminée le 2026-11-10. La story 4.1a n'est pas commencée.

## Story 4.1a — Recherche sémantique côté serveur (2026-11-10)

**Objectif.** Rendre la Base commune interrogeable par le sens : au plus 5 Documents prêts, chacun avec son meilleur Passage, sans score ni texte rédigé par l'IA, et aucun résultat pour une Requête hors base.

**Instructions clés données à l'IA.**
- Chaîne imposée : Route Handler `POST /api/search` → Edge Function `semantic-search` (jeton du Collaborateur) → fonction SQL `match_passages`, jamais `service_role`.
- Requête de 1 à 500 caractères revalidée à chaque étage, délai total de 10 s, codes d'erreur AD-19.
- Tests d'intégration sur Supabase local, refus sans jeton aux deux étages.
- Tests, revue ciblée et contrôles en fin de story ; aucun commit ni push sans validation ; ne pas commencer la 4.1b.

**Décisions de l'utilisateur.**
- **Q1 = A.** Seuil simulé de 0,20 en local, actif seulement avec la vectorisation simulée de la pile locale (même garde-fou qu'`EMBEDDINGS_FAKE`) ; un test prouve qu'il ne peut pas s'appliquer en production.
- **Test réel unique** `npm run test:search:live`, après déploiement : Compte de mesure de `.env.seed`, cible affichée et exigée, aucun secret affiché ; rapport par Requête (rang du bon Document, durée), sans similarité.
- **Q2 = A.** En cas d'échec au seuil de 0,40 : story livrée avec la réserve, mesures transmises à la 4.2.
- Story gardée entière, au-dessus du repère de taille.

**Ce que l'IA a produit.**
- Migration `match_passages` : `security invoker`, Documents prêts, version active de la vectorisation et texte courant, 1 Passage par Document, exécution réservée à `authenticated`.
- Edge Function `semantic-search` (`verify_jwt = true`, session vérifiée auprès du serveur Auth, délai commun de 10 s).
- Relais Next.js, qui relit la réponse et ne laisse passer aucune clé non déclarée.
- Seuil `RAG_MIN_SIMILARITY` (0,40, remplaçable par le secret Supabase, borné entre 0 et 1).
- Script `test:search:live` et son rapport `docs/mesures/recherche-live.md`.
- Tests : unitaires (validation, seuil, garde-fou, relais, délais), intégration (`match_passages` à vecteurs contrôlés, `semantic-search` sur le mini Jeu local), e2e de la route.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Rejet non géré.** Une expiration du délai pendant la requête en base aurait produit un rejet sans gestionnaire dans la fonction (arrêt possible de l'isolat Deno) : corrigé, test dédié.
- **Frontières.** Commentaires citant le fournisseur d'IA dans `src/` ou la variable de simulation hors de son module, refusés par les tests existants : reformulés. Le test des appels d'Edge Function admet désormais le relais de la Recherche, lui aussi réservé au serveur.
- **Faux secrets.** Deux valeurs factices de tests détectées par `check:secrets` : composées à l'exécution, sans exclusion.
- **Similarités du rapport réel.** Non disponibles : la fonction ne les renvoie pas, et les obtenir à distance exigerait d'exposer le vecteur ou la clé OpenAI. Seul le rapport local (vectorisation simulée) les montre.
- **Différé.** L'index HNSW n'est pas utilisé par `match_passages` ; sans effet à 13 Passages, noté dans `deferred-work.md` pour la 4.2.

**Tests.**
- `npm test` : 897 réussis (53 fichiers). `lint`, `tsc`, `build:ci`, `check:secrets` : verts.
- Local (vectorisation simulée, seuil 0,20) : « organisation des congés » et r1 à r6 avec le bon Document au rang 1, sauf r2 au rang 2 ; 23 à 55 ms par appel.
- `npm run test:e2e` complet : 265 réussis, 13 sautés, aucun échec.

**Durée.**
- Implémentation, tests et revue ciblée : de 16:00 à 16:40 environ, deux suites complètes comprises.

**Déploiement.** `npm run deploy:supabase` lancé par l'utilisateur (migration et fonction), puis commit `29c5f59` poussé sur `main`. Statut Vercel : « Deployment has completed ».

**Test réel, lancé par l'utilisateur** (`npm run test:search:live`, projet `lkjjtcfegplipalraqml`, seuil 0,40) : réussi.
- r1 à r6 : bon Document au rang 1 à chaque fois.
- s1 à s3 et « recette de la tarte aux pommes » : aucun résultat.
- Durée médiane 653 ms ; maximale 3 542 ms au premier appel (r1).
- Seuil de 0,40 validé sur le mini Jeu. Le dépassement de 3 s du premier appel est probablement un démarrage à froid : à surveiller en 4.2 et pendant la démo.
- Rapport : `docs/mesures/recherche-live.md`.

**Statut final.** Story 4.1a passée à `done` le 2026-11-10, après la vérification de l'utilisateur. La story 4.1b n'est pas commencée.

## Story 4.2 — Premier calibrage et mesure de la Recherche (2026-11-10)

**Objectif.** Mesurer la marge du seuil de 0,40, expliquer le démarrage à froid observé en 4.1a et trancher les points différés, sans modifier la production si 0,40 reste le meilleur choix.

**Instructions clés données à l'IA.**
- Ne pas refaire ce que `test:search:live` a déjà prouvé ; le réutiliser.
- Mesurer la marge autour de 0,40 ; limiter les appels réels au strict nécessaire.
- Analyser le démarrage à froid ; traiter ou reporter l'index HNSW et les intertitres.
- Revue ciblée sans les trois relecteurs ; aucun commit ni push sans validation ; ne pas commencer la 4.1b.

**Décisions de l'utilisateur.**
- **Q1 = A.** 0,40 gardé s'il satisfait les critères avec au moins 0,05 de marge des deux côtés ; sinon, valeur recommandée et procédure présentées avant toute pose du secret.
- `measure-embed` strictement locale, exclue de `deploy:supabase` avec un test qui le prouve ; modèle et dimension de production vérifiés dans le rapport.
- Story gardée entière.

**Ce que l'IA a produit.**
- Fonction locale `measure-embed` : vectorisation réelle des Requêtes de mesure avec la clé locale, réservée à la clé `service_role` locale, jamais déployée.
- `npm run measure:search` : réutilise la cible exigée, le Compte de mesure et les cas de `test:search:live` ; similarités lues par `match_passages` distante sous la session du Compte de mesure ; balayage des seuils 0,30 à 0,50 calculé hors ligne ; marges, décision Q1 = A, analyse des durées ; rapport `docs/mesures/recherche.md`.
- Une exécution coûte 1 vectorisation groupée locale, 10 lectures de `match_passages` et 10 Recherches.
- Points différés : HNSW reporté à 7.1b, intertitres à 5.7 (r6 déjà au rang 1), réchauffement avant la démo à 7.5 ou 7.6.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Similarités sans changer la production.** `semantic-search` ne les renvoie pas, et le seuil ne peut pas être changé pour tester : les Requêtes sont vectorisées localement avec le même modèle, puis comparées aux Passages distants.
- **Condition sans effet** dans la règle de décision : supprimée avant les tests.
- **Limite de 50 lignes** de la lecture des similarités : sans effet sur le mini Jeu, à revoir avant de rejouer la mesure sur le Jeu complet.

**Tests.**
- `npm test` : 931 réussis (56 fichiers), dont `measure-embed` sur Supabase local (refus et validation, sans appel OpenAI). `lint`, `tsc`, `build:ci`, `check:secrets` : verts.
- E2e non relancés : aucun code de l'application Next.js modifié.

**Durée.**
- Lecture, investigation et story : de 16:30 à 16:41 environ.
- Implémentation, tests, revue ciblée et journal : de 16:41 à 16:55 environ.
- Total : environ 25 min, sans l'exécution de `measure:search`.

**Déploiement.** Aucun : pas de migration, aucune fonction déployée, aucun secret modifié.

**Mesure, lancée par l'utilisateur** (`npm run measure:search`, projet `lkjjtcfegplipalraqml`) : réussie.
- Vectorisation locale conforme : `text-embedding-3-small`, version 1, 1 536 dimensions, identique à la production.
- r1 à r6 : bon Document au rang 1, similarités de 0,461 (r2) à 0,621 (r6).
- Hors base : meilleures similarités de 0,207 (s1) à 0,345 (s2, « assurance du véhicule de fonction ») ; aucun résultat réel.
- Balayage : critères atteints de 0,35 à 0,45 ; à 0,30, deux Requêtes hors base renvoient un résultat ; à 0,50, deux bons Documents sortent.
- Marges autour de 0,40 : 0,055 en bas, 0,061 en haut. **0,40 gardé** (règle Q1 = A, de justesse) ; aucun secret modifié. Bande sûre ]0,345 ; 0,461] : à surveiller quand le Jeu complet (7.1b) ou l'Assistant (5.2a) ajouteront des Requêtes.
- Durées : de 530 à 959 ms, médiane 619 ms ; `match_passages` seule 308 ms en médiane depuis le poste. Pas de démarrage à froid lors de cette exécution : le 3 542 ms de la 4.1a reste attribué au démarrage de l'Edge Function ; action : réchauffer la Recherche avant la démo.
- Rapport : `docs/mesures/recherche.md`.

**Statut final.** Story 4.2 passée à `done` le 2026-11-10, après la mesure de l'utilisateur. La story 4.1b n'est pas commencée.

## Story 4.1b — Page Recherche et champ du Tableau de bord (2026-11-12)

**Objectif.** Rendre la Recherche utilisable : page `/recherche` (champ, résultats, états) et champ du Tableau de bord, avec l'ouverture d'un résultat au bon Passage, étiqueté « Passage pertinent ».

**Instructions clés données à l'IA.**
- Créer le fichier de story et présenter plan, fichiers et risques avant de coder.
- Cartes : titre, Catégorie, Passage surligné, sans score ni texte rédigé par l'IA ; clic → page Document au Passage, avec « Passage pertinent » (report de la 3.1).
- Aucun résultat : message FR-15 ; pas de bouton « Poser la question à l'Assistant » tant que l'Assistant n'est pas utilisable (règle de la 3.2), ajout prévu dans la bonne story de l'Epic 5.
- États chargement et erreur (« Réessayer », Requête conservée) ; focus sur l'annonce du nombre ; 375 px sans défilement horizontal ; aucun résultat ni Passage dans le HTML prérendu.
- Revue ciblée (affichage, accessibilité, passage des paramètres) sans les trois relecteurs ; aucun commit ni push sans validation ; ne pas commencer la 2.6a.

**Décisions de l'utilisateur.**
- **Q1 = B.** Sans résultat : « Aucun Document ne correspond suffisamment à votre recherche. Essayez d'autres mots. » La story 5.2b rétablit la phrase complète de FR-15 en même temps qu'elle ajoute le bouton (critère ajouté dans `epics.md`).
- `depuis` n'accepte que la valeur `recherche` ; toute autre valeur est ignorée.
- Le champ du Tableau de bord ne vole pas le focus au lien d'évitement au premier chargement.
- Story gardée entière.

**Ce que l'IA a produit.**
- Page `/recherche` : titre prérendu, vue cliente pilotée par `?q=` (sous Suspense), phrase d'aide et trois exemples, trois cartes squelettes, annonce « {n} Documents pertinents » dans une zone `role="status"`, cartes, message FR-15, alerte « La Recherche n'a pas pu aboutir. » avec « Réessayer ».
- Carte : un seul lien (le titre, dont la zone couvre la carte) vers `/documents/{id}?passages=début-fin&actif=0&depuis=recherche`, construit seulement pour un UUID et des positions valides.
- Page Document : étiquette et texte masqué « Passage pertinent » avec `depuis=recherche`.
- Champ du Tableau de bord en tête de la bande d'actions ; `PageTitle` peut confier le focus d'écran à un champ, selon la même décision unique (jamais au premier chargement).
- `epics.md` : bouton et phrase complète de FR-15 ajoutés ensemble à la story 5.2b.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- **Carte entièrement cliquable mais mal nommée** (axe, WCAG 2.5.3) : le nom accessible (le titre) ne reprenait pas tout le texte visible du lien. Le lien porte désormais le titre et couvre la carte par une pseudo-zone.
- **Focus perdu après « Réessayer » ou un exemple** : le bouton disparaît dès le chargement ; l'intention de l'action est maintenant notée au clic.
- **État dans un effet** (règle de lint React) : l'issue d'une Recherche est rattachée à sa Requête, le chargement se déduit du rendu.
- **Test e2e mobile** : après une navigation par le menu, le focus revient d'abord sur ☰ ; le test attend cet état avant d'aller au champ.
- Parcours réel testé avec un Document contrôlé (Passage au vecteur simulé de la Requête, supprimé après le test) plutôt qu'avec le mini Jeu : rang 1 garanti en local, Base commune laissée propre.

**Tests.**
- `npm test` : 989 réussis (59 fichiers). `lint`, `tsc`, `build:ci`, `check:secrets` : verts.
- E2e complets (build de production, Supabase local) : 285 réussis, 17 sautés, aucun échec. `search-page.spec.ts` aussi rejoué 3 fois de suite sur les deux largeurs (57 réussis).
- Deux tests e2e à corriger en cours de route : le test 1.2 « focus sur le titre » visait `/recherche`, devenu un écran de saisie (focus sur le champ) : il vise maintenant la Bibliothèque, et un test vérifie le champ de la Recherche ; le parcours réel cliquait parfois avant l’hydratation (chargement complet, focus non déplacé par conception) : il attend désormais le lien hydraté.
- HTML prérendu de `/recherche` et du Tableau de bord : coquille seule (titre, navigation, lien d'évitement), aucun résultat, Passage ni annonce.

**Durée.**
- Lecture, investigation et story : jusqu'à 10:01 (heure de début non relevée ; 09:57 relevé en fin d'investigation), soit 15 à 20 min estimées.
- Implémentation, tests, revue ciblée et journal : de 10:02 à 10:40 (dont environ 15 min de suites e2e complètes, lancées trois fois).
- Total : environ 55 min, sans la vérification en production.

**Déploiement.** Pas de migration ni d'Edge Function : un push suffira, sans `deploy:supabase`.

**Commit et déploiement.** `684bfb9` poussé sur `main` le 2026-11-12 ; Vercel : « Deployment has completed ».

**Vérification en production, par l'utilisateur** (déploiement `684bfb9`) : réussie.
- Recherche depuis le champ du Tableau de bord vers `/recherche`.
- « organisation des congés » : « Procédure congés et absences » trouvée.
- Ouverture du résultat : page Document au Passage, avec l'étiquette « Passage pertinent ».
- « recette de la tarte aux pommes » : seul le message « …Essayez d'autres mots. », sans liste ni bouton.
- Affichage correct à 375 px.

**Statut final.** Story 4.1b passée à `done` le 2026-11-12, après la vérification en production de l'utilisateur. La story 2.6a n'est pas commencée.

## Story 2.6a — Déposer et importer un fichier .txt ou .md (2026-11-12)

**Objectif.** Permettre d'ajouter un fichier .txt ou .md sans le recopier : dépôt direct dans un espace privé, puis import contrôlé par le serveur, avant toute création de Document.

**Instructions clés données à l'IA.**
- Créer le fichier de story et présenter plan, fichiers et risques avant de coder.
- Bucket `documents` privé, 1 000 000 octets, sans URL publique ; dépôt avant la création du Document dans `{author_id}/uploads/{upload_id}`, par URL signée créée par `POST /api/uploads` (session vérifiée).
- `.txt` et `.md` seulement ; `.docx` ou fichier trop lourd refusés avant tout envoi, avec les messages du catalogue.
- Vérification serveur de l'objet (dossier, taille, MIME déduit de l'extension) avant la création du Document et le départ du délai de 3 minutes ; refus du dossier d'un autre Collaborateur et d'un `upload_id` d'un autre Auteur.
- Titre prérempli et modifiable ; import idempotent ; échec du dépôt avec « Réessayer », champs conservés ; tests RLS et Storage à deux Comptes.
- Décodage complet laissé à la 2.6b ; revue à trois relecteurs (règle 11) ; aucun commit ni push sans validation ; ne pas commencer la 2.6b.

**Décisions de l'utilisateur.**
- Story gardée entière.
- `import_file_document` : `search_path` fixé, accès retiré à `public` et `anon`, exécution réservée à `authenticated` ; contrôle de `auth.uid()`, du propriétaire réel de l'objet, du chemin exact et d'un `upload_id` strictement au format `{uuid}.txt` ou `{uuid}.md`.
- Tests d'appels directs avec un chemin forgé ou l'objet d'un autre Collaborateur.
- Fichiers déposés mais jamais importés : nettoyage consigné dans `deferred-work.md` ; vérifier que la 3.4 supprimera l'objet d'un Document importé.

**Ce que l'IA a produit.**
- Migration : bucket privé limité à 1 000 000 octets, sans restriction MIME ; deux politiques Storage (dépôt et lecture) réservées au propriétaire dans son dossier d'uploads ; aucune politique de modification ni de suppression ; fonction `import_file_document` qui vérifie l'objet et crée le Document dans la même transaction.
- `POST /api/uploads` (URL signée, `upload_id` choisi par le serveur et portant l'extension validée) ; Server Action d'import ; onglet « Fichier » (zone de dépôt au clavier et par glisser-déposer, progression « Dépôt du fichier… », « Importer » inactif pendant le dépôt, « Réessayer ») ; lecture du fichier en UTF-8 par `process-document`.
- Sonde du Storage local avant les tests : la politique s'applique dès la signature de l'URL avec le jeton du Collaborateur ; l'objet déposé appartient bien à ce Collaborateur.
- Story 3.4 vérifiée : elle prévoit la suppression du fichier d'origine, mais 2.6a ne crée aucune politique de suppression ; précision et test ajoutés à la 3.4 dans `epics.md`, et consignés dans `deferred-work.md`.

**Ce qui a été corrigé ou refusé, et pourquoi.**
- Revue à trois relecteurs, douze corrections :
  - Changer d'onglet effaçait la saisie et le fichier déposé : les onglets restent montés.
  - Un fichier choisi pendant un import pouvait recevoir le résultat du précédent : choix bloqué pendant l'import, résultat rattaché au fichier envoyé.
  - Un ancien message d'échec restait affiché après un nouveau dépôt réussi.
  - La demande d'URL pouvait attendre sans fin ; la progression était annoncée à chaque étape aux lecteurs d'écran.
  - Un fichier lâché à côté de la zone faisait quitter la page.
  - Une session expirée pendant l'import était présentée comme un échec à réessayer ; un cas extrême de la fonction SQL pouvait renvoyer un Document sans identifiant.
  - Tests ajoutés : réponse perdue à l'import, délai de 10 s, « Annuler », glisser-déposer, imports simultanés.
- Cinq constats rejetés après vérification : impossibles en pratique, ou comportement voulu. Deux reportés : limite du nombre de dépôts par Collaborateur ; taille du texte après décodage d'un fichier non UTF-8, traitée en 2.6b et 2.7.
- En cours de route, des expressions régulières écrites par l'interpréteur de commandes avaient perdu une barre oblique inverse : fichier réécrit. Les tests de l'onglet laissaient des actions React en attente, ce qui faussait les tests suivants : elles sont maintenant résolues après chaque test.

**Tests.**
- `npm test` : 1 112 réussis (65 fichiers), dont 34 cas d'intégration à deux Comptes sur Supabase local (Storage, politiques, import, appels directs forgés, objet d'un autre Collaborateur, propriétaire réel, taille, imports simultanés, `.txt` UTF-8 avec BOM → prêt).
- `lint`, `tsc`, `build:ci`, `check:secrets` : verts, aucun secret ; aucune clé `service_role` lue par Next.js.
- E2e complets (build de production, Supabase local) : 300 réussis, 18 sautés, aucun échec.
- Preuve demandée par l'utilisateur avant le commit : base locale réinitialisée à partir des seules migrations (`supabase db reset`) ; `import_file_document` finale (garde `v_id is null`, `security definer`, `search_path` vide, exécution pour `authenticated` seul), bucket et politiques présents ; 34 tests d'intégration de la 2.6a réussis.

**Durée.**
- Lecture, investigation, contexte de l'Epic 2 et story : de 10:48 à 10:55 environ.
- Implémentation, tests, revue à trois relecteurs, corrections et journal : de 10:55 à 11:25 environ.
- Total : environ 40 min, sans le déploiement ni la vérification en production.

**Déploiement.** Migration et module partagé de `process-document` modifiés : `npm run deploy:supabase` avant le push.

**Commit et déploiement.** `c06f28a` commité après la preuve par `supabase db reset` ; `npm run deploy:supabase` lancé par l'utilisateur sur le projet distant (réussi), puis push sur `main` ; Vercel : « Deployment has completed ».

**Vérification en production, par l'utilisateur** : réussie.
- Import de `procedure-test.md` : dépôt, titre prérempli, Document *prêt* et texte lisible.
- Format non pris en charge refusé, champs conservés.
- Changement d'onglet sans perte de saisie.
- Bucket `documents` privé, deux politiques, limite de 1 000 000 octets.
- Refus d'un fichier de plus de 1 Mo : couvert par les tests e2e, non rejoué en production.

**Statut final.** Story 2.6a passée à `done` le 2026-11-12, après la vérification en production de l'utilisateur. La story 2.6b n'est pas commencée.
