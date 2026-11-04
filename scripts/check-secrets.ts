// Contrôle des secrets (NFR-2, AD-20) : refuse tout format de clé secrète dans les
// fichiers du dépôt, ou, avec --static, dans le code envoyé au navigateur (.next/static).
// N'affiche jamais une valeur détectée : seulement le fichier, la ligne et le type de clé.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Finding = { file: string; line: number; kind: string };
export type ScanOptions = {
  // Valeurs exactes des secrets présents dans l'environnement (build Vercel) : un secret sans
  // format reconnaissable (PROCESS_DOCUMENT_SECRET) est tout de même repéré s'il est recopié.
  secretValues?: string[];
  // Reçoit les fichiers non contrôlés (trop gros ou binaires), pour les signaler.
  skipped?: string[];
};

export const SECRET_NAMES = ["OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PROCESS_DOCUMENT_SECRET"];

const OPENAI_KEY = /\bsk-[A-Za-z0-9_-]{20,}/;
const SUPABASE_SECRET_KEY = /\bsb_secret_[A-Za-z0-9_-]{8,}/;
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g;
// Une affectation (`=` ou `:`, préfixe éventuel comme NEXT_PUBLIC_) avec une valeur littérale d'au
// moins 8 caractères. Ne comptent pas : une valeur vide, une référence ($VAR, env(...), process.env,
// Deno.env, import.meta.env), un appel de fonction, ou un exemple de documentation (abc…, <valeur>).
const ASSIGNMENT = new RegExp(
  `(?<![A-Za-z0-9])(?:${SECRET_NAMES.join("|")})["']?[ \\t]*[=:][ \\t]*["']?` +
    `(?!process\\.env|Deno\\.env|import\\.meta\\.env|env\\()` +
    `[^\\s"'\`$<>(),;…]{8,}(?![^\\s"'\`]*\\()`,
);
// Motif témoin non sensible, reconnu seulement avec une valeur (entre guillemets ou non)
// pour que la documentation puisse le citer.
const CANARY = /(?<![A-Za-z0-9])NEXAMIND_CANARY_DO_NOT_DEPLOY["']?[ \t]*[=:][ \t]*["']?[A-Za-z0-9_-]/;

// Dossiers jamais parcourus en mode disque (générés, dépendances, secrets locaux ignorés par git).
const EXCLUDED_DIRS = new Set(["node_modules", ".next", ".next-e2e", ".git", ".vercel", "test-results", "playwright-report"]);
// Liste d'exclusions explicite : aucun fichier suivi n'est exclu à ce jour.
const EXCLUDED_FILES = new Set<string>([]);
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_SECRET_VALUE_LENGTH = 8;

function jwtRole(payloadPart: string): string | undefined {
  try {
    const json = Buffer.from(payloadPart, "base64url").toString("utf8");
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === "string" ? role : undefined;
  } catch {
    return undefined;
  }
}

export function scanText(text: string, file: string, secretValues: string[] = []): Finding[] {
  const findings: Finding[] = [];
  text.split("\n").forEach((content, index) => {
    const line = index + 1;
    if (OPENAI_KEY.test(content)) findings.push({ file, line, kind: "clé OpenAI" });
    if (SUPABASE_SECRET_KEY.test(content)) findings.push({ file, line, kind: "clé secrète Supabase" });
    // Une clé publique Supabase au format JWT (rôle anon ou authenticated) est autorisée.
    for (const match of content.matchAll(JWT)) {
      if (jwtRole(match[1]) === "service_role") {
        findings.push({ file, line, kind: "jeton JWT service_role" });
        break;
      }
    }
    if (ASSIGNMENT.test(content)) findings.push({ file, line, kind: "affectation d'un secret nommé" });
    if (CANARY.test(content)) findings.push({ file, line, kind: "motif témoin" });
    if (secretValues.some((value) => content.includes(value))) {
      findings.push({ file, line, kind: "valeur d'un secret de l'environnement" });
    }
  });
  return findings;
}

// Valeurs des secrets définis dans l'environnement courant, assez longues pour être distinctives.
export function secretValuesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return SECRET_NAMES.map((name) => env[name]?.trim() ?? "").filter((v) => v.length >= MIN_SECRET_VALUE_LENGTH);
}

// Texte du fichier, ou null s'il est binaire. Un texte UTF-16 (avec BOM, fréquent sous Windows)
// contient des octets nuls mais reste du texte.
function decodeText(buffer: Buffer): string | null {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  return buffer.subarray(0, 8000).includes(0) ? null : buffer.toString("utf8");
}

function walk(dir: string, root: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) walk(path.join(dir, entry.name), root, out);
    } else if (entry.isFile() && !entry.name.startsWith(".env")) {
      out.push(path.relative(root, path.join(dir, entry.name)));
    }
  }
}

export function listStaticFiles(staticRoot: string): string[] {
  const files: string[] = [];
  walk(staticRoot, staticRoot, files);
  return files;
}

// Fichiers suivis et fichiers non suivis non ignorés (ce qui pourrait être commité).
// Sans dépôt git exploitable (build Vercel), repli sur un parcours du disque.
export function listRepoFiles(root: string): string[] {
  try {
    const output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    }).toString("utf8");
    return output.split("\0").filter(Boolean);
  } catch {
    const files: string[] = [];
    walk(root, root, files);
    return files;
  }
}

export function scanFiles(root: string, files: string[], options: ScanOptions = {}): Finding[] {
  const findings: Finding[] = [];
  for (const relative of files) {
    const file = relative.split(path.sep).join("/");
    if (EXCLUDED_FILES.has(file)) continue;
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) continue;
    const stats = statSync(absolute);
    if (!stats.isFile()) continue;
    if (stats.size > MAX_BYTES) {
      options.skipped?.push(file);
      continue;
    }
    const text = decodeText(readFileSync(absolute));
    if (text === null) {
      options.skipped?.push(file);
      continue;
    }
    findings.push(...scanText(text, file, options.secretValues));
  }
  return findings;
}

function main(): void {
  const root = process.cwd();
  const staticMode = process.argv.includes("--static");
  let files: string[];
  let scanRoot = root;
  if (staticMode) {
    scanRoot = path.join(root, ".next", "static");
    if (!existsSync(scanRoot)) {
      console.error("check:secrets --static : .next/static est introuvable. Lancez d'abord next build.");
      process.exit(1);
    }
    files = listStaticFiles(scanRoot);
  } else {
    files = listRepoFiles(root);
  }

  const skipped: string[] = [];
  const findings = scanFiles(scanRoot, files, { secretValues: secretValuesFromEnv(), skipped });
  const label = staticMode ? "code envoyé au navigateur (.next/static)" : "dépôt";
  const prefix = staticMode ? ".next/static/" : "";
  if (skipped.length > 0) {
    console.log(`check:secrets — ${skipped.length} fichier(s) non contrôlé(s) (binaire ou plus de 10 Mo) :`);
    for (const file of skipped) console.log(`  ${prefix}${file}`);
  }
  if (findings.length === 0) {
    console.log(`check:secrets — aucun secret détecté dans le ${label} (${files.length} fichiers).`);
    return;
  }
  console.error(`check:secrets — ${findings.length} secret(s) détecté(s) dans le ${label} :`);
  for (const f of findings) {
    console.error(`  ${prefix}${f.file}:${f.line} — ${f.kind} (valeur masquée)`);
  }
  process.exit(1);
}

// Exécuté seulement en ligne de commande (pas à l'import par les tests). Sous Windows, la casse
// de la lettre de lecteur peut différer entre argv et l'URL du module.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
const sameFile =
  process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath;
if (sameFile) main();
