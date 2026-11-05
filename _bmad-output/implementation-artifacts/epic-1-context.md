# Epic 1 Context: Accéder à NexaMind AI en toute sécurité

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Poser les fondations de NexaMind AI, copilote documentaire interne de NexaWorks réalisé en Vibe Coding pour un rendu le 30/11/2026 : une chaîne de vérification (environnement local, tests, contrôle des secrets, déploiement continu), l'identité visuelle et la navigation en français, puis la création de Compte, la connexion et la protection de toutes les pages. Tout ce qui suit (Documents, Recherche, Assistant) s'appuie sur ce socle, testé et déployé en ligne dès le départ.

## Stories

- Story 1.1 : Chaîne de vérification et premier déploiement
- Story 1.2 : Identité visuelle et coquille de navigation
- Story 1.3 : Créer un Compte
- Story 1.4 : Se connecter, se déconnecter et protéger les pages
- Story 1.5 : Typographie française (FINITION)

## Requirements & Constraints

- Aucune clé secrète (clé OpenAI, clé `service_role`, `PROCESS_DOCUMENT_SECRET`) ne doit être versionnée ni envoyée au navigateur ; un contrôle automatique bloque tout build qui en contiendrait. Aucun faux secret réaliste n'est jamais poussé sur GitHub. Aucun secret ni mot de passe ne transite par la conversation avec l'IA : l'utilisateur les saisit lui-même dans son terminal.
- Le contrôle d'accès est appliqué au niveau des données (RLS), pas seulement dans l'interface. Le rôle `anon` n'a aucun privilège ; toutes les politiques sont `to authenticated`.
- Inscription ouverte, sans confirmation par e-mail (données fictives uniquement) ; mot de passe d'au moins 8 caractères ; session persistante ; message d'erreur de connexion qui ne précise pas le champ fautif ; redirection vers la page demandée uniquement pour un chemin interne.
- Interface entièrement en français, vouvoiement, textes repris d'un catalogue unique. Accessibilité : parcours au clavier, contraste AA, libellé pour chaque champ, anneau de focus plein de 2 px décalé de 2 px. À 375 px, aucun défilement horizontal.
- Définition de « terminé » : critères vérifiés, `npm test` vert, aucune régression, `npm run deploy:supabase` réussi si la base ou une Edge Function change, déploiement Vercel réussi, entrée ajoutée à `docs/journal-vibe-coding.md` (objectif, instructions données à l'IA, ce qui a été produit, corrigé ou refusé, tests, durée).
- Le temps réel passé par story est mesuré ; trajectoire du 04/11 : 1.4 clôt l'épic 1 (sauf 1.5 FINITION), point de contrôle le 13/11 au soir.
- Revue par trois relecteurs réservée aux stories sensibles (migrations RLS/privilèges/`security definer`, traitement asynchrone, Storage, secrets, Assistant, contrôle final). Les stories de l'épic 1 n'y figurent pas : tests, contrôles et vérification manuelle, sauf demande explicite de revue.

## Technical Decisions

- Existant : Next.js 16.4.3 (App Router, `src/proxy.ts` pour la session, Turbopack), React 19.3, Tailwind 4, `@supabase/ssr` et `@supabase/supabase-js` déjà intégrés (clients navigateur et serveur). Lire `node_modules/next/dist/docs/` avant d'utiliser une API Next.js : la version diffère des connaissances habituelles.
- Outillage retenu : Supabase CLI 3.0.0, Vitest 5.1.0, @playwright/test 1.64.1, @axe-core/playwright 4.14.0, zod 4.6.7.
- Environnements : Supabase local (CLI + Docker) pour le développement et les tests ; un seul projet Supabase distant, `eu-central-1` (Francfort), qui sert de démonstration ; Vercel Hobby avec `vercel.json` `"regions": ["fra1"]`. `supabase/config.toml` : `[edge_runtime] policy = "per_worker"`. Migrations versionnées dans `supabase/migrations`, déployées par `npm run deploy:supabase` (`supabase db push --remote=<référence liée>` puis `supabase functions deploy --remote=<référence liée>`, avec contrôle de la cible : la CLI 3 vise la base locale par défaut).
- Variables : seules `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sont publiques. `OPENAI_API_KEY` n'existe que dans les secrets Supabase ; `SUPABASE_SERVICE_ROLE_KEY` dans les secrets Supabase et le `.env.local` du script de préchargement ; `PROCESS_DOCUMENT_SECRET` dans Vercel, les secrets Supabase et ce même `.env.local` ; `AI_DAILY_QUOTA`, `RAG_MIN_SIMILARITY`, `GENERATION_MODEL` dans les secrets Supabase ; `DEMO_ACCOUNT_*`, `MEASURE_ACCOUNT_*` en local. `.env*` est ignoré, `.env.example` liste les noms sans valeur.
- Contrôle des secrets (`scripts/check-secrets.ts`) : formats de clés (`sk-` suivi d'au moins 20 caractères, jeton JWT, `sb_secret_…`, affectation avec valeur des trois secrets nommés, motif témoin `NEXAMIND_CANARY_DO_NOT_DEPLOY`) dans les fichiers suivis puis dans `.next/static` ; la simple mention d'un nom n'est pas une erreur. Exécuté par le build Vercel (`build:ci`) avant et après `next build`.
- Conventions : code et identifiants en anglais, textes affichés en français ; routes d'écran en français (Tableau de bord à `/`, `/connexion`, `/inscription`, `/assistant`, `/recherche`, `/bibliotheque`, `/documents/[id]`, `/ajouter`), routes `api/` en anglais ; `src/app` sans SQL, dépendances `app → server → lib` ; schémas `zod` dans `src/lib/schemas` ; forme d'erreur unique `{ error: { code, message, retryable, resetAt? } }` ; journalisation JSON sans secret.
- Données (E1) : table `profiles` (`id` = `auth.users.id`, `email`, `display_name` = partie locale de l'e-mail) créée par déclencheur, lisible par tout Collaborateur, RLS activée.

## UX & Interaction Patterns

- Shadcn/ui en mode clair uniquement (retirer le mode sombre de `globals.css`), police Geist déjà chargée, `lang="fr"`. Couleurs : bleu pétrole `#0E5A6B` pour agir, ambre réservé aux Sources, neutres pour refus et quota.
- Coquille : barre latérale fixe ≥ 1024 px (« + Ajouter », Tableau de bord, Assistant, Recherche, Bibliothèque, e-mail, « Se déconnecter »), barre du haut ☰ · logo · « + » sous 1024 px, navigation en `Sheet`, lien d'évitement « Aller au contenu », `aria-current="page"`.
- Boutons d'envoi : état occupé dès le premier clic, `aria-disabled` (jamais `disabled`). Erreurs de formulaire sous le champ (`aria-describedby`, `aria-invalid`). Page « Page introuvable » identique pour une ressource inexistante ou interdite.

## Cross-Story Dependencies

- 1.1 n'a aucune dépendance ; 1.2 dépend de 1.1 ; 1.3 de 1.1 et 1.2 ; 1.4 de 1.3 ; 1.5 (FINITION) de 1.2, planifiée après E4.
- 1.1 fournit à toutes les stories : `npm test` (Vitest + Supabase local), `test:e2e` (Playwright), `check:secrets`, `deploy:supabase`, le déploiement Vercel et le journal de Vibe Coding.
- La story 2.1 (accès à l'IA) dépend aussi de 1.1 ; la story 5.0 (essai du flux sur Vercel) dépend du déploiement de 1.1.
- Story 1.1 (terminée) : outillage, `check:secrets`, `deploy:supabase`, déploiement Vercel. Réserve : la région d'exécution `fra1` sera prouvée par `x-vercel-id` sur la première route dynamique, au plus tard en 1.4.
- Next.js 16 avec `cacheComponents` : un composant client qui lit `usePathname` doit être placé dans une frontière `Suspense` dès qu'existent des routes à paramètres dynamiques (`/documents/[id]`, `/assistant/[id]`).
