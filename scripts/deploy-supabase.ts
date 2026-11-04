// Déploie sur le projet Supabase distant lié : migrations, puis Edge Functions s'il en existe.
// Les invites de la CLI (mot de passe de la base) s'affichent dans le terminal de l'utilisateur.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Fonctions déployables : dossiers de supabase/functions contenant un index.ts, hors modules
// partagés (_shared…) et dossiers cachés (.vscode…).
export function listFunctions(functionsDir: string): string[] {
  if (!existsSync(functionsDir)) return [];
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !/^[_.]/.test(entry.name) &&
        existsSync(path.join(functionsDir, entry.name, "index.ts")),
    )
    .map((entry) => entry.name);
}

function supabase(args: string[]): boolean {
  // Commande en une seule chaîne via le shell (exécutables .cmd de Windows) ; arguments constants.
  const result = spawnSync(["npx", "--no-install", "supabase", ...args].join(" "), { stdio: "inherit", shell: true });
  return result.status === 0;
}

function main(): void {
  const root = process.cwd();
  if (!existsSync(path.join(root, "supabase", ".temp", "project-ref"))) {
    console.error(
      "deploy:supabase — aucun projet distant lié. Lancez d'abord : npx supabase link --project-ref <référence du projet>",
    );
    process.exit(1);
  }

  console.log("deploy:supabase — application des migrations…");
  if (!supabase(["db", "push"])) process.exit(1);

  const functions = listFunctions(path.join(root, "supabase", "functions"));
  if (functions.length === 0) {
    console.log("deploy:supabase — aucune Edge Function à déployer.");
  } else {
    console.log(`deploy:supabase — déploiement des Edge Functions : ${functions.join(", ")}…`);
    if (!supabase(["functions", "deploy"])) process.exit(1);
  }
  console.log("deploy:supabase — terminé.");
}

// Exécuté seulement en ligne de commande ; casse de la lettre de lecteur ignorée sous Windows.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath) {
  main();
}
