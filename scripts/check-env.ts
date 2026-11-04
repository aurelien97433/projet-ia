// Vérifie l'environnement local : Docker démarré et CLI Supabase à la version attendue.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_SUPABASE_CLI = "3.0.0";
// Binaire local de la CLI : appelé directement, il répond en ~10 s, contre ~30 s via npx.
export const SUPABASE_BIN = path.join("node_modules", ".bin", "supabase");

export type RunResult = { ok: boolean; stdout: string };
export type Runner = (command: string, args: string[]) => RunResult;

export const runCommand: Runner = (command, args) => {
  // Commande en une seule chaîne via le shell, pour trouver les exécutables .cmd de Windows.
  // Les arguments sont des constantes de ce script, jamais une saisie.
  // Délai de 60 s : docker info peut rester bloqué pendant le démarrage de Docker Desktop,
  // et la CLI Supabase vérifie ses mises à jour avant de répondre.
  const result = spawnSync([command, ...args].join(" "), { encoding: "utf8", shell: true, timeout: 60_000 });
  return { ok: result.status === 0, stdout: (result.stdout ?? "").trim() };
};

export function checkEnv(run: Runner): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  let ok = true;

  const docker = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (docker.ok && docker.stdout) {
    messages.push("Docker OK");
  } else {
    ok = false;
    messages.push("Docker introuvable ou arrêté : installez puis démarrez Docker Desktop.");
  }

  const cli = run(SUPABASE_BIN, ["--version"]);
  // La CLI peut ajouter un avis de mise à jour : on retient le premier numéro de version.
  const version = cli.stdout.match(/\d+\.\d+\.\d+/)?.[0] ?? "";
  if (!cli.ok || !version) {
    ok = false;
    messages.push("Supabase CLI introuvable : lancez npm install.");
  } else if (version !== EXPECTED_SUPABASE_CLI) {
    ok = false;
    messages.push(`Supabase CLI ${EXPECTED_SUPABASE_CLI} attendue, version ${version} trouvée.`);
  } else {
    messages.push(`Supabase CLI ${version} OK`);
  }

  return { ok, messages };
}

function main(): void {
  const { ok, messages } = checkEnv(runCommand);
  if (ok) {
    console.log(messages.join(" · "));
  } else {
    console.error(messages.join("\n"));
    process.exit(1);
  }
}

// Exécuté seulement en ligne de commande ; casse de la lettre de lecteur ignorée sous Windows.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath) {
  main();
}
