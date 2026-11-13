import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseCliRows } from "../../scripts/cli-rows";

// Accès à Supabase local pour les tests. Les clés locales sont lues à l'exécution avec
// `supabase status` et ne sont jamais écrites dans un fichier suivi.
export type LocalSupabase = { url: string; publishableKey: string; serviceRoleKey: string };

const repoRoot = path.resolve(__dirname, "..", "..");
let cached: LocalSupabase | undefined;

export function localSupabase(): LocalSupabase {
  if (cached) return cached;
  const bin = path.join("node_modules", ".bin", "supabase");
  let status: Record<string, string>;
  try {
    status = JSON.parse(
      execSync(`${bin} status -o json`, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
    );
  } catch {
    throw new Error("Supabase local ne répond pas : lancez npx supabase start.");
  }
  if (!status.API_URL || !status.PUBLISHABLE_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error("Supabase local est incomplet (URL ou clés absentes) : relancez npx supabase start.");
  }
  cached = { url: status.API_URL, publishableKey: status.PUBLISHABLE_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY };
  return cached;
}

// Secret de process-document pour la fonction locale, lu à l'exécution dans le fichier des Edge
// Functions (ignoré par git). Seule cette ligne est retenue, et la valeur n'est jamais affichée.
export function localProcessSecret(): string {
  const file = path.join(repoRoot, "supabase", "functions", ".env");
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  const prefix = "PROCESS_DOCUMENT_SECRET=";
  const value = lines.find((line) => line.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error("Variable absente de supabase/functions/.env : voir docs/environnements.md.");
  return value;
}

// Requête SQL en lecture sur la base locale (contrôle des privilèges), via la CLI Supabase.
export function localSqlRows(sql: string): Record<string, unknown>[] {
  const bin = path.join("node_modules", ".bin", "supabase");
  const output = execSync(`${bin} db query --output-format json "${sql.replace(/"/g, '\\"')}"`, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  // Une instruction sans résultat (CREATE, DROP, UPDATE) renvoie un texte, pas du JSON. Sinon, forme
  // propre au mode de la CLI (tableau nu dans un terminal, enveloppe « rows » pour un agent) :
  // analyse partagée avec le test de charge (scripts/cli-rows.ts).
  if (!/[[{]/.test(output)) return [];
  return parseCliRows(output);
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@exemple.test`;
}
