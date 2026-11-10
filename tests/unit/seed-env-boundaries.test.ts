import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { parseEnvLines, secretValuesFromSeedFile } from "../../scripts/check-secrets";

// Séparation du préchargement (story 2.8) : .env.seed reste hors de git et hors de Next.js.
const root = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(import.meta.url);
const SERVICE_NAME = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
const PS1 = path.join(root, "scripts", "setup-seed-env.ps1");

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const full = path.join(folder, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

describe("git", () => {
  it(".env.seed est ignoré, .env.seed.example ne l'est pas", () => {
    const ignored = execFileSync("git", ["check-ignore", "-v", ".env.seed"], { cwd: root, encoding: "utf8" });
    expect(ignored).toContain(".gitignore");
    const example = spawnSync("git", ["check-ignore", ".env.seed.example"], { cwd: root });
    expect(example.status).toBe(1);
  });

  it(".env.seed.example et .env.example ne contiennent aucune valeur de secret", () => {
    const seed = readFileSync(path.join(root, ".env.seed.example"), "utf8");
    for (const line of seed.split(/\r?\n/).filter((text) => text && !text.startsWith("#"))) {
      expect(line).toMatch(/^[A-Z0-9_]+=$/);
    }
    expect(readFileSync(path.join(root, ".env.example"), "utf8")).not.toContain(`${SERVICE_NAME}=`);
  });
});

describe("Next.js", () => {
  it("ne charge pas .env.seed", () => {
    dir = mkdtempSync(path.join(tmpdir(), "seed-next-"));
    writeFileSync(path.join(dir, ".env.seed"), "SEED_TEMOIN=lu\n");
    // Témoin : .env, chargé dans tous les modes (.env.local est ignoré quand NODE_ENV vaut test).
    writeFileSync(path.join(dir, ".env"), "LOCAL_TEMOIN=lu\n");
    const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");
    const { combinedEnv } = loadEnvConfig(dir, true, { info: () => {}, error: () => {} }, true);
    expect(combinedEnv.LOCAL_TEMOIN).toBe("lu");
    expect(combinedEnv.SEED_TEMOIN).toBeUndefined();
  });

  it("aucun fichier de src/ ne cite le préchargement ni la clé service_role", () => {
    const hits = filesUnder(path.join(root, "src")).filter((file) =>
      /\.env\.seed|DEMO_ACCOUNT|MEASURE_ACCOUNT|SERVICE_ROLE/.test(readFileSync(file, "latin1")),
    );
    expect(hits).toEqual([]);
  });

  it("le script de préchargement ne lit aucune clé OpenAI et n'appelle pas le fournisseur", () => {
    const script = readFileSync(path.join(root, "scripts", "seed-demo.ts"), "utf8");
    expect(script).not.toMatch(/OPENAI_API_KEY|api\.openai\.com|\/_shared\/ai/);
  });
});

describe("parseEnvLines", () => {
  it("une valeur vide ou faite d'espaces n'absorbe pas la ligne suivante", () => {
    expect(parseEnvLines("A=   \nB=2\r\nC=\n# note\nD=x=y ")).toEqual({ A: "", B: "2", C: "", D: "x=y" });
  });

  it("ignore un BOM en tête de fichier", () => {
    expect(parseEnvLines("\ufeffA=1\n")).toEqual({ A: "1" });
  });
});

describe("check:secrets", () => {
  const run = (cwd: string, args: string[] = []) =>
    spawnSync(
      process.execPath,
      [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "scripts", "check-secrets.ts"), ...args],
      { cwd, encoding: "utf8", env: { ...process.env, PROCESS_DOCUMENT_SECRET: "" } },
    );

  it("lit les valeurs de .env.seed, sans l'URL", () => {
    dir = mkdtempSync(path.join(tmpdir(), "seed-secrets-"));
    writeFileSync(
      path.join(dir, ".env.seed"),
      "SEED_SUPABASE_URL=https://exemple.supabase.co\nDEMO_ACCOUNT_A_EMAIL=claire@exemple.test\nCOURT=abc\n",
    );
    expect(secretValuesFromSeedFile(dir)).toEqual(["claire@exemple.test"]);
  });

  it("sans .env.seed : aucune valeur", () => {
    dir = mkdtempSync(path.join(tmpdir(), "seed-secrets-"));
    expect(secretValuesFromSeedFile(dir)).toEqual([]);
  });

  it("identifiant de démo dans le code envoyé au navigateur : échec, valeur masquée", () => {
    dir = mkdtempSync(path.join(tmpdir(), "seed-secrets-"));
    const email = "identifiant-demo@exemple.test";
    writeFileSync(path.join(dir, ".env.seed"), `DEMO_ACCOUNT_A_EMAIL=${email}\n`);
    mkdirSync(path.join(dir, ".next", "static"), { recursive: true });
    mkdirSync(path.join(dir, ".next", "server", "app"), { recursive: true });
    writeFileSync(path.join(dir, ".next", "static", "app.js"), `var compte = "${email}";\n`);
    const result = run(dir, ["--static"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("app.js:1");
    expect(result.stdout + result.stderr).not.toContain(email);
  });

  it("identifiant de démo copié dans le dépôt : échec, valeur masquée", () => {
    dir = mkdtempSync(path.join(tmpdir(), "seed-secrets-"));
    const email = "identifiant-demo@exemple.test";
    writeFileSync(path.join(dir, ".env.seed"), `DEMO_ACCOUNT_A_EMAIL=${email}\n`);
    writeFileSync(path.join(dir, "fuite.ts"), `export const compte = "${email}";\n`);
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("fuite.ts:1");
    expect(result.stdout + result.stderr).not.toContain(email);
  });
});

describe("identifiants de démo", () => {
  it("aucune adresse complète dans le script de préparation", () => {
    expect(readFileSync(PS1, "utf8")).not.toMatch(/[a-z0-9.]+@nexaworks\.example/);
  });
});

describe.runIf(process.platform === "win32")("setup-seed-env.ps1", () => {
  const powershell = (command: string, cwd = root) =>
    spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], { cwd, encoding: "utf8" });
  const load = `. '${PS1}'; `;
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

  it("refuse de s'exécuter hors de la racine du projet, sans rien demander", () => {
    dir = mkdtempSync(path.join(tmpdir(), "seed-ps-"));
    const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-File", PS1], { cwd: dir, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("racine du projet");
  });

  it.each([
    ["clé secrète", `sb_${"secret"}_${"a".repeat(30)}`, true],
    ["jeton service_role", `eyJhbGciOiJIUzI1NiJ9.${b64({ role: "service_role" })}.signature`, true],
    ["clé publique", `sb_publishable_${"a".repeat(30)}`, false],
    ["jeton anon", `eyJhbGciOiJIUzI1NiJ9.${b64({ role: "anon" })}.signature`, false],
    ["nom de la variable", SERVICE_NAME, false],
    ["texte quelconque", "pas-une-cle", false],
  ])("format de la clé (%s)", (_label, key, expected) => {
    const result = powershell(`${load}Test-ServiceRoleKey -Key '${key}'`);
    expect(result.stdout.trim()).toBe(expected ? "True" : "False");
  });

  it("le contenu généré contient toutes les variables et garde les identifiants existants", () => {
    const script =
      `${load}$c = New-SeedContent -Existing @{ DEMO_ACCOUNT_A_PASSWORD = 'mot-existant-long' } ` +
      `-Url 'https://x.supabase.co' -ServiceRoleKey 'k' -ProcessSecret 's'; $c`;
    const output = powershell(script).stdout;
    const example = readFileSync(path.join(root, ".env.seed.example"), "utf8");
    const names = [...example.matchAll(/^([A-Z0-9_]+)=$/gm)].map((match) => match[1]);
    expect(names).toHaveLength(13);
    for (const name of names) expect(output).toMatch(new RegExp(`^${name}=.+$`, "m"));
    expect(output).toContain("DEMO_ACCOUNT_A_PASSWORD=mot-existant-long");
    expect(output).toMatch(/^DEMO_ACCOUNT_B_PASSWORD=[0-9a-f]{64}$/m);
    expect(output).toMatch(/^DEMO_ACCOUNT_A_EMAIL=demo\.a\.[0-9a-f]{8}@nexaworks\.example$/m);
  });

  it("relecture de .env.seed : les identifiants existants sont conservés", () => {
    dir = mkdtempSync(path.join(tmpdir(), "seed-ps-"));
    const file = path.join(dir, ".env.seed");
    writeFileSync(file, "DEMO_ACCOUNT_A_EMAIL=existant@exemple.test\nDEMO_ACCOUNT_A_PASSWORD=mot-existant-long\n");
    const output = powershell(
      `${load}$c = New-SeedContent -Existing (Read-SeedFile '${file}') -Url 'https://x.supabase.co' -ServiceRoleKey 'k' -ProcessSecret 's'; $c`,
    ).stdout;
    expect(output).toContain("DEMO_ACCOUNT_A_EMAIL=existant@exemple.test");
    expect(output).toContain("DEMO_ACCOUNT_A_PASSWORD=mot-existant-long");
  });

  it("n'affiche aucune variable sensible et efface le presse-papiers après confirmation", () => {
    const script = readFileSync(PS1, "utf8");
    expect(script).not.toMatch(/Write-(Host|Output|Error)[^\n]*\$(secret|key|content|password)/i);
    expect(script.indexOf('Set-Clipboard -Value " "')).toBeGreaterThan(script.indexOf("Read-Host \"Tapez OK"));
    expect(script).toMatch(/finally \{\s+Set-Clipboard -Value " "/);
    expect(script.indexOf("Move-Item -Force $pendingSeed")).toBeGreaterThan(script.indexOf("$result.ExitCode -ne 0"));
  });

  it.each([
    ["projet lié", "abcdefghijklmnopqrst", '{"target":{"kind":"linked","project_ref":"abcdefghijklmnopqrst"}}', true],
    ["avec du texte avant le JSON", "abcdefghijklmnopqrst", 'avis\n{"target":{"kind":"linked","project_ref":"abcdefghijklmnopqrst"}}', true],
    ["autre projet", "abcdefghijklmnopqrst", '{"target":{"kind":"linked","project_ref":"zzzzzzzzzzzzzzzzzzzz"}}', false],
    ["pile locale", "abcdefghijklmnopqrst", '{"target":{"kind":"local","project_ref":"abcdefghijklmnopqrst"}}', false],
    ["sortie vide", "abcdefghijklmnopqrst", "", false],
    ["référence invalide", "ABC", '{"target":{"kind":"linked","project_ref":"ABC"}}', false],
  ])("cible : %s", (_label, ref, output, expected) => {
    const result = powershell(`${load}Test-LinkedTarget -Ref '${ref}' -ListOutput '${output}'`);
    expect(result.stdout.trim()).toBe(expected ? "True" : "False");
  });

  it("refuse un .env.seed qui vise un autre projet", () => {
    const check = (seedUrl: string) =>
      powershell(`${load}Test-SeedFileTarget -Existing @{ SEED_SUPABASE_URL = '${seedUrl}' } -Url 'https://a.supabase.co'`).stdout.trim();
    expect(check("https://a.supabase.co")).toBe("True");
    expect(check("http://127.0.0.1:54321")).toBe("False");
    expect(check("")).toBe("True");
  });

  // Fausse CLI : un vrai processus enfant, qui écrit sur stderr comme la CLI réelle. Aucun appel réel.
  function fakeCli(exitCode: number) {
    dir = mkdtempSync(path.join(tmpdir(), "seed-ps-"));
    const trace = path.join(dir, "trace.txt");
    const js = path.join(dir, "fausse-cli.cjs");
    const cmd = path.join(dir, "fausse-cli.cmd");
    writeFileSync(
      js,
      `const fs = require("fs"), path = require("path");
       const args = process.argv.slice(2);
       const work = args.includes("--workdir") ? args[args.indexOf("--workdir") + 1] : "";
       const file = args.includes("--env-file") ? args[args.indexOf("--env-file") + 1] : "";
       if (work) {
         const config = fs.readFileSync(path.join(work, "supabase", "config.toml"), "utf8");
         const lines = fs.readFileSync(file, "utf8").trim().split("\\n").length;
         fs.writeFileSync(${JSON.stringify(trace)}, args.join(" ") + "|lignes=" + lines + "|edge=" + config.includes("edge_runtime") + "|" + work);
       }
       process.stderr.write("Target: project projet-ia (abcdefghijklmnopqrst) · production\\n");
       process.stdout.write('{"target":{"kind":"linked","project_ref":"abcdefghijklmnopqrst"}}');
       process.exitCode = ${exitCode};`,
    );
    writeFileSync(cmd, `@"${process.execPath}" "${js}" %*\r\n@exit /b %errorlevel%\r\n`);
    return { cmd, trace };
  }

  function publish(exitCode: number, seedContent: string) {
    const { cmd, trace } = fakeCli(exitCode);
    const seed = path.join(dir, ".env.seed");
    writeFileSync(seed, seedContent);
    const script = [
      `${load}$CliCommand = '${cmd}'`,
      `Publish-Secret -Ref 'abcdefghijklmnopqrst' -Secret 'valeur-du-test' -SeedFile '${seed}' -Content 'NOUVEAU=1'`,
    ].join("\n");
    return { result: powershell(script), seed, trace };
  }

  it("CLI qui écrit sur stderr avec le code 0 : aucune erreur, stdout et stderr séparés, UTF-8", () => {
    const { cmd } = fakeCli(0);
    const script = [
      `${load}[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false; $CliCommand = '${cmd}'`,
      `$r = Invoke-Cli @('secrets', 'list', '--remote=abcdefghijklmnopqrst')`,
      `"code=$($r.ExitCode)"; "cible=$(Test-LinkedTarget -Ref 'abcdefghijklmnopqrst' -ListOutput $r.Stdout)"; $r.Stderr`,
    ].join("\n");
    const result = powershell(script);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("code=0");
    expect(result.stdout).toContain("cible=True");
    expect(result.stdout).toContain("Target: project projet-ia (abcdefghijklmnopqrst) · production");
  });

  it("vise le binaire local de la CLI, pas npx", () => {
    const output = powershell(`${load}$CliCommand`).stdout.trim();
    expect(output.toLowerCase()).toBe(path.join(root, "node_modules", ".bin", "supabase.cmd").toLowerCase());
    expect(existsSync(output)).toBe(true);
  });

  it("code de sortie non nul : renvoyé tel quel, sans exception", () => {
    const { cmd } = fakeCli(3);
    const script = `${load}$CliCommand = '${cmd}'; "code=$((Invoke-Cli @('secrets', 'list')).ExitCode)"`;
    const result = powershell(script);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("code=3");
  });

  it("réussite : --yes, projet lié, un seul secret, hors du config.toml du projet, fichier en place", () => {
    const { result, seed, trace } = publish(0, "ANCIEN=1\n");
    expect(result.stdout.trim().split(/\r?\n/).at(-1)).toBe("True");
    const call = readFileSync(trace, "utf8");
    expect(call).toContain("secrets set");
    expect(call).toContain("--remote=abcdefghijklmnopqrst");
    expect(call).toContain("--yes");
    expect(call).toContain("|lignes=1|edge=false|");
    expect(call).not.toContain("valeur-du-test");
    expect(readFileSync(seed, "utf8")).toBe("NOUVEAU=1");
    expect(readdirSync(dir).sort()).toEqual([".env.seed", "fausse-cli.cjs", "fausse-cli.cmd", "trace.txt"]);
    const work = call.trim().split("|").at(-1)!;
    expect(existsSync(work)).toBe(false);
  });

  it("échec de Supabase : .env.seed inchangé, aucun fichier temporaire", () => {
    const { result, seed, trace } = publish(1, "ANCIEN=1\n");
    expect(result.stdout.trim().split(/\r?\n/).at(-1)).toBe("False");
    expect(readFileSync(seed, "utf8")).toBe("ANCIEN=1\n");
    expect(readdirSync(dir).sort()).toEqual([".env.seed", "fausse-cli.cjs", "fausse-cli.cmd", "trace.txt"]);
    const work = readFileSync(trace, "utf8").trim().split("|").at(-1)!;
    expect(existsSync(work)).toBe(false);
  });
});
