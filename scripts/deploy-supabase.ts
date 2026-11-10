// Déploie sur le projet Supabase DISTANT lié : migrations, puis Edge Functions s'il en existe.
// La CLI 3 vise la base locale par défaut : chaque commande reçoit --remote=<référence> et sa
// sortie JSON est contrôlée, pour qu'un déploiement local ne soit jamais pris pour un déploiement
// distant. Les invites de la CLI (mot de passe de la base) s'affichent dans le terminal de
// l'utilisateur ; la CLI lit aussi SUPABASE_DB_PASSWORD si l'utilisateur l'a défini dans sa session.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_BIN = path.join("node_modules", ".bin", "supabase");
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

// Fonctions servies en local seulement, jamais déployées (ai-health : contrôle de l'IA, story 2.1 ;
// measure-embed : vectorisation des Requêtes de mesure, story 4.2).
export const LOCAL_ONLY_FUNCTIONS: readonly string[] = ["ai-health", "measure-embed"];

// Fonctions déployables : dossiers de supabase/functions contenant un index.ts, hors modules
// partagés (_shared…), dossiers cachés (.vscode…) et fonctions locales.
export function listFunctions(functionsDir: string): string[] {
  if (!existsSync(functionsDir)) return [];
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        // Nom passé à la CLI par le shell (runCli) : lettres minuscules, chiffres et tirets seulement.
        /^[a-z0-9][a-z0-9-]*$/.test(entry.name) &&
        !LOCAL_ONLY_FUNCTIONS.includes(entry.name) &&
        existsSync(path.join(functionsDir, entry.name, "index.ts")),
    )
    .map((entry) => entry.name);
}

// Référence du projet lié par `supabase link`, ou null si aucun projet n'est lié.
export function readLinkedProjectRef(supabaseDir: string): string | null {
  const file = path.join(supabaseDir, ".temp", "project-ref");
  if (!existsSync(file)) return null;
  const ref = readFileSync(file, "utf8").trim();
  return PROJECT_REF_PATTERN.test(ref) ? ref : null;
}

// Versions des migrations locales (préfixe horodaté des fichiers .sql).
export function listLocalMigrations(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir)
    .map((name) => /^(\d{14})_.+\.sql$/.exec(name)?.[1])
    .filter((version): version is string => Boolean(version))
    .sort();
}

// Sortie JSON de la CLI (stdout non interactif) : un objet par commande.
export function parseCliJson(stdout: string): Record<string, unknown> | null {
  const start = stdout.indexOf("{");
  if (start === -1) return null;
  try {
    return JSON.parse(stdout.slice(start)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Refuse toute sortie dont la cible n'est pas le projet distant attendu. Forme relevée avec la
// CLI 3.0.0 le 2026-11-04 : {"target":{"kind":"linked","project_ref":"<réf>","project_name":…}}
// pour le projet lié, {"target":{"kind":"local","host":"127.0.0.1",…}} pour la stack locale.
export function assertRemoteTarget(output: Record<string, unknown> | null, projectRef: string): void {
  const target = output?.target as Record<string, unknown> | undefined;
  if (!target) {
    throw new Error("la CLI n'a pas indiqué sa cible : impossible de prouver un déploiement distant.");
  }
  if (target.kind === "local") {
    throw new Error("la commande a visé la base locale (127.0.0.1), pas le projet distant.");
  }
  const targetRef = target.project_ref ?? target.ref;
  const matches = typeof targetRef === "string" ? targetRef === projectRef : JSON.stringify(target).includes(projectRef);
  if (!matches) {
    throw new Error(`la cible ${JSON.stringify(target)} ne correspond pas au projet lié ${projectRef}.`);
  }
}

// Début de la sortie reçue, pour diagnostic, sans identifiants (user:motdepasse@ des URL).
export function describeOutput(stdout: string): string {
  const cleaned = stdout.replace(/:\/\/[^\s/@]+@/g, "://***@").replace(/\s+/g, " ").trim();
  return cleaned ? `${cleaned.slice(0, 200)}${cleaned.length > 200 ? "…" : ""}` : "(sortie vide)";
}

// Migrations locales absentes du projet distant, d'après `supabase migration list --remote`.
export function missingRemoteMigrations(local: string[], output: Record<string, unknown> | null): string[] {
  const listed = (output?.migrations as { remote?: string }[] | undefined) ?? [];
  const remote = new Set(listed.map((m) => m.remote).filter(Boolean));
  return local.filter((version) => !remote.has(version));
}

// Erreur rapportée par la CLI dans sa sortie JSON : {"_tag":"Error","error":{"code","message"}}
// (forme relevée avec la CLI 3.0.0), ou un champ message. Masquée comme describeOutput.
export function cliErrorDetails(run: CliRun): string {
  const error = run.output?.error as { code?: unknown; message?: unknown } | undefined;
  const message = typeof error?.message === "string" ? error.message : run.output?.message;
  const code = typeof error?.code === "string" ? `${error.code} : ` : "";
  return typeof message === "string" && message ? describeOutput(`${code}${message}`) : describeOutput(run.raw);
}

export type CliRun = { ok: boolean; output: Record<string, unknown> | null; raw: string };
export type Cli = (args: string[]) => CliRun;

export class DeployError extends Error {}

// Lance la CLI : stdin et stderr dans le terminal (invites, ligne « Target: »), stdout capturé.
// --output-format json force la sortie JSON même dans un terminal interactif, où la CLI écrit
// sinon du texte (cause de l'échec « n'a pas indiqué sa cible » du 2026-11-04).
function runCli(args: string[]): CliRun {
  // Commande en une seule chaîne via le shell (exécutable .cmd de Windows) ; arguments constants
  // ou noms de fonctions filtrés par listFunctions.
  const result = spawnSync([SUPABASE_BIN, ...args, "--output-format", "json"].join(" "), {
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
    shell: true,
  });
  const raw = result.stdout ?? "";
  return { ok: result.status === 0, output: parseCliJson(raw), raw };
}

function checkTarget(run: CliRun, projectRef: string): void {
  try {
    assertRemoteTarget(run.output, projectRef);
  } catch (error) {
    throw new DeployError(`${(error as Error).message} Sortie reçue : ${describeOutput(run.raw)}`);
  }
}

function runChecked(cli: Cli, args: string[], label: string): CliRun {
  const run = cli(args);
  if (!run.ok) throw new DeployError(`${label} a échoué. Erreur de la CLI : ${cliErrorDetails(run)}`);
  return run;
}

// Déploiement complet sur le projet lié. --yes : la CLI demande confirmation avant d'appliquer une
// migration en attente ou de déployer une fonction sur un projet hébergé, et refuse sans terminal
// interactif (« hosted changes only accept this flag »), cause de l'échec du 2026-11-05. Lancer
// deploy:supabase vaut décision : la cible reste contrôlée avant (projet lié) et après (sortie JSON).
export function runDeploy(supabaseDir: string, cli: Cli, log: (line: string) => void = console.log): void {
  const projectRef = readLinkedProjectRef(supabaseDir);
  if (!projectRef) {
    throw new DeployError("aucun projet distant lié. Lancez d'abord : npx supabase link --project-ref <référence du projet>");
  }
  const remote = `--remote=${projectRef}`;

  log(`deploy:supabase — application des migrations sur le projet distant ${projectRef}…`);
  const push = runChecked(cli, ["db", "push", remote, "--yes"], "supabase db push");
  checkTarget(push, projectRef);

  log("deploy:supabase — contrôle des migrations présentes sur le projet distant…");
  const list = runChecked(cli, ["migration", "list", remote], "supabase migration list");
  checkTarget(list, projectRef);
  const missing = missingRemoteMigrations(listLocalMigrations(path.join(supabaseDir, "migrations")), list.output);
  if (missing.length > 0) throw new DeployError(`migrations absentes du projet distant : ${missing.join(", ")}.`);

  const functions = listFunctions(path.join(supabaseDir, "functions"));
  if (functions.length === 0) {
    log("deploy:supabase — aucune Edge Function à déployer.");
  } else {
    log(`deploy:supabase — déploiement des Edge Functions sur ${projectRef} : ${functions.join(", ")}…`);
    // Noms explicites : sans nom, la CLI déploierait aussi les fonctions locales (ai-health).
    const deploy = runChecked(cli, ["functions", "deploy", ...functions, remote, "--yes"], "supabase functions deploy");
    checkTarget(deploy, projectRef);
  }
  log(`deploy:supabase — terminé sur le projet distant ${projectRef}.`);
}

function main(): void {
  try {
    runDeploy(path.join(process.cwd(), "supabase"), runCli);
  } catch (error) {
    if (!(error instanceof DeployError)) throw error;
    console.error(`deploy:supabase — échec : ${error.message}`);
    process.exit(1);
  }
}

// Exécuté seulement en ligne de commande ; casse de la lettre de lecteur ignorée sous Windows.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath) {
  main();
}
