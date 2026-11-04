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
