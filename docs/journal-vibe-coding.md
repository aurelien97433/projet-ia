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
