import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { invalidSecretsFromEnv, listRepoFiles, scanFiles, scanText } from "../../scripts/check-secrets";

// Les fausses clés sont construites à l'exécution : aucune n'est écrite telle quelle dans le dépôt.
const randomChars = (n: number) =>
  Array.from({ length: n }, (_, i) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[(i * 7 + 3) % 62]).join("");
const b64 = (value: object | string) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const fakeJwt = (role: string) => [b64({ alg: "HS256", typ: "JWT" }), b64({ iss: "supabase", role }), randomChars(43)].join(".");
const fakeOpenAiKey = () => ["sk", "proj", randomChars(32)].join("-");
const fakeSupabaseSecret = () => ["sb", "secret", randomChars(24)].join("_");

const kinds = (text: string) => scanText(text, "f.txt").map((f) => f.kind);

describe("invalidSecretsFromEnv", () => {
  const NAME = "PROCESS_DOCUMENT_SECRET";
  const reasons = (value: string, name = NAME) => invalidSecretsFromEnv({ [name]: value }).map((i) => i.reason);

  it("accepte un secret long et aléatoire, ainsi qu'un secret absent ou vide", () => {
    expect(reasons("0123456789abcdef".repeat(4))).toEqual([]);
    expect(reasons("a".repeat(32))).toEqual([]);
    expect(reasons("")).toEqual([]);
    expect(reasons("   ")).toEqual([]);
    expect(invalidSecretsFromEnv({})).toEqual([]);
  });

  it("refuse une valeur de moins de 32 caractères", () => {
    expect(reasons("a".repeat(31))).toEqual(["la valeur fait moins de 32 caractères"]);
  });

  it.each([
    ["le nom exact", NAME],
    ["le nom en minuscules", NAME.toLowerCase()],
    ["le nom sans séparateur", "ProcessDocumentSecret"],
    ["le nom avec des tirets", "process-document-secret"],
    ["le nom suivi d'une valeur longue", `${NAME}=${"a".repeat(40)}`],
    ["le nom d'une autre variable", `${"x".repeat(20)}OPENAI_API_KEY`],
  ])("refuse %s", (_label, value) => {
    expect(reasons(value)).toEqual(["la valeur ressemble au nom d'une variable"]);
  });

  it("contrôle aussi les autres secrets connus", () => {
    expect(reasons("court", "OPENAI_API_KEY")).toHaveLength(1);
    expect(reasons("court", "SUPABASE_SERVICE_ROLE_KEY")).toHaveLength(1);
  });

  it("le résultat ne contient jamais la valeur", () => {
    const value = `${NAME}-valeur-privee`;
    expect(JSON.stringify(invalidSecretsFromEnv({ [NAME]: value }))).not.toContain("valeur-privee");
  });
});

describe("scanText", () => {
  it("accepte le dépôt sain : noms de secrets sans valeur, expressions documentées", () => {
    const text = [
      "OPENAI_API_KEY=",
      "const key = process.env.OPENAI_API_KEY;",
      "export SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY",
      'openai_api_key = "env(OPENAI_API_KEY)"',
      "La chaîne sk- seule n'est pas une clé ; motif `\\bsk-[A-Za-z0-9_-]{20,}`, clé `sb_secret_…`.",
      "Le motif témoin NEXAMIND_CANARY_DO_NOT_DEPLOY est cité sans valeur.",
      "Exemples de documentation : OPENAI_API_KEY=abc… et NEXAMIND_CANARY_DO_NOT_DEPLOY=<valeur>.",
    ].join("\n");
    expect(kinds(text)).toEqual([]);
  });

  it("refuse une clé OpenAI et indique la ligne", () => {
    const findings = scanText(`ligne 1\nconst k = "${fakeOpenAiKey()}";`, "a.ts");
    expect(findings).toEqual([{ file: "a.ts", line: 2, kind: "clé OpenAI" }]);
  });

  it("refuse une clé secrète Supabase", () => {
    expect(kinds(`key: ${fakeSupabaseSecret()}`)).toEqual(["clé secrète Supabase"]);
  });

  it("refuse un JWT de rôle service_role", () => {
    expect(kinds(`x = "${fakeJwt("service_role")}"`)).toContain("jeton JWT service_role");
  });

  it("accepte une clé publique Supabase au format JWT (anon, authenticated)", () => {
    expect(kinds(`a = "${fakeJwt("anon")}"\nb = "${fakeJwt("authenticated")}"`)).toEqual([]);
  });

  it("accepte une clé publique Supabase sb_publishable_", () => {
    expect(kinds(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${["sb", "publishable", randomChars(24)].join("_")}`)).toEqual([]);
  });

  it.each(["OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PROCESS_DOCUMENT_SECRET"])(
    "refuse une affectation avec valeur de %s",
    (name) => {
      expect(kinds(`${name}=${randomChars(16)}`)).toEqual(["affectation d'un secret nommé"]);
    },
  );

  it("refuse le motif témoin sous forme d'affectation, avec ou sans guillemets", () => {
    const canary = ["NEXAMIND", "CANARY", "DO", "NOT", "DEPLOY"].join("_");
    expect(kinds(`${canary}=oui`)).toEqual(["motif témoin"]);
    expect(kinds(`${canary}="oui"`)).toEqual(["motif témoin"]);
  });

  it("refuse une affectation préfixée (NEXT_PUBLIC_…) ou en syntaxe YAML/JSON", () => {
    const value = randomChars(16);
    expect(kinds(`NEXT_PUBLIC_PROCESS_DOCUMENT_SECRET=${value}`)).toEqual(["affectation d'un secret nommé"]);
    expect(kinds(`PROCESS_DOCUMENT_SECRET: ${value}`)).toEqual(["affectation d'un secret nommé"]);
    expect(kinds(`"PROCESS_DOCUMENT_SECRET": "${value}"`)).toEqual(["affectation d'un secret nommé"]);
  });

  it("accepte la lecture d'un secret depuis l'environnement ou une fonction", () => {
    const text = [
      'const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");',
      "const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;",
      "PROCESS_DOCUMENT_SECRET: requireSecretValue(),",
      "PROCESS_DOCUMENT_SECRET: string;",
    ].join("\n");
    expect(kinds(text)).toEqual([]);
  });

  it("noms interdits (code envoyé au navigateur) : refusés même sans valeur", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "noms-"));
    try {
      writeFileSync(path.join(dir, "app.js"), 'const a = 1;\nprocess.env["PROCESS_DOCUMENT_SECRET"];\n');
      const options = { forbiddenNames: ["PROCESS_DOCUMENT_SECRET"] };
      expect(scanFiles(dir, ["app.js"], options)).toEqual([{ file: "app.js", line: 2, kind: "nom d'un secret" }]);
      expect(scanFiles(dir, ["app.js"])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuse la valeur exacte d'un secret de l'environnement, quel que soit son format", () => {
    const value = `${randomChars(12)}!@#`;
    expect(scanText(`window.x = "${value}";`, "app.js", [value]).map((f) => f.kind)).toEqual([
      "valeur d'un secret de l'environnement",
    ]);
  });

  it("ne renvoie jamais la valeur détectée", () => {
    const key = fakeOpenAiKey();
    expect(JSON.stringify(scanText(key, "a.ts"))).not.toContain(key);
  });
});

describe("listRepoFiles et scanFiles", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("sans dépôt git, parcourt le disque sans node_modules, .next ni .env*", () => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-"));
    mkdirSync(path.join(dir, "src"));
    mkdirSync(path.join(dir, "node_modules"));
    mkdirSync(path.join(dir, ".next"));
    writeFileSync(path.join(dir, "src", "a.ts"), `const k = "${fakeOpenAiKey()}";`);
    writeFileSync(path.join(dir, "node_modules", "lib.js"), fakeOpenAiKey());
    writeFileSync(path.join(dir, ".next", "x.js"), fakeOpenAiKey());
    writeFileSync(path.join(dir, ".env.local"), `OPENAI_API_KEY=${randomChars(16)}`);

    const files = listRepoFiles(dir);
    expect(files.map((f) => f.split(path.sep).join("/"))).toEqual(["src/a.ts"]);
    expect(scanFiles(dir, files)).toEqual([{ file: "src/a.ts", line: 1, kind: "clé OpenAI" }]);
  });

  it("ignore les fichiers binaires et les signale comme non contrôlés", () => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-"));
    writeFileSync(path.join(dir, "img.bin"), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(fakeOpenAiKey())]));
    const skipped: string[] = [];
    expect(scanFiles(dir, ["img.bin"], { skipped })).toEqual([]);
    expect(skipped).toEqual(["img.bin"]);
  });

  it("contrôle un fichier texte UTF-16 (avec BOM)", () => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-"));
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`k=${fakeOpenAiKey()}`, "utf16le")]);
    writeFileSync(path.join(dir, "export.ps1"), utf16);
    expect(scanFiles(dir, ["export.ps1"]).map((f) => f.kind)).toEqual(["clé OpenAI"]);
  });

  it("dans un dépôt git, contrôle les fichiers suivis et non suivis, pas les fichiers ignorés", () => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(path.join(dir, ".gitignore"), ".env.local\n");
    writeFileSync(path.join(dir, "suivi.ts"), "export {};\n");
    execFileSync("git", ["add", "suivi.ts", ".gitignore"], { cwd: dir });
    writeFileSync(path.join(dir, "non-suivi.ts"), `const k = "${fakeOpenAiKey()}";`);
    writeFileSync(path.join(dir, ".env.local"), `OPENAI_API_KEY=${randomChars(16)}`);

    const files = listRepoFiles(dir).sort();
    expect(files).toEqual([".gitignore", "non-suivi.ts", "suivi.ts"]);
    expect(scanFiles(dir, files)).toEqual([{ file: "non-suivi.ts", line: 1, kind: "clé OpenAI" }]);
  });
});

describe("check-secrets en ligne de commande", { timeout: 30_000 }, () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const repoRoot = path.resolve(__dirname, "..", "..");
  const run = (cwd: string, args: string[] = [], env: Record<string, string> = {}) =>
    spawnSync(
      process.execPath,
      [path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), path.join(repoRoot, "scripts", "check-secrets.ts"), ...args],
      { cwd, encoding: "utf8", env: { ...process.env, ...env } },
    );

  it("se termine avec le code 0 sur un dossier sain", () => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-cli-"));
    writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");
    const result = run(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/aucun secret détecté/);
  });

  it("se termine avec le code 1, indique fichier et ligne sans afficher la valeur", () => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-cli-"));
    const key = fakeOpenAiKey();
    writeFileSync(path.join(dir, "a.ts"), `// ligne 1\nconst k = "${key}";\n`);
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/a\.ts:2 — clé OpenAI \(valeur masquée\)/);
    expect(result.stdout + result.stderr).not.toContain(key);
  });

  it("--static échoue si .next/static est introuvable", () => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-cli-"));
    const result = run(dir, ["--static"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/\.next\/static est introuvable/);
  });

  it("--static échoue si .next/server/app est introuvable", () => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-cli-"));
    mkdirSync(path.join(dir, ".next", "static"), { recursive: true });
    const result = run(dir, ["--static"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/\.next\/server\/app est introuvable/);
  });

  it("--static contrôle les pages prérendues de .next/server/app (.html, .rsc, .body), et elles seules", () => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-cli-"));
    mkdirSync(path.join(dir, ".next", "static"), { recursive: true });
    const app = path.join(dir, ".next", "server", "app");
    mkdirSync(path.join(app, "bibliotheque"), { recursive: true });
    const secret = randomChars(40);
    writeFileSync(path.join(app, "index.html"), "<p>Tableau de bord</p>\n");
    writeFileSync(path.join(app, "index.rsc"), "0:[]\n");
    // Code serveur jamais envoyé au navigateur : hors du contrôle --static.
    writeFileSync(path.join(app, "page.js"), `var s="${secret}";`);
    writeFileSync(path.join(app, "page.js.nft.json"), `{"s":"${secret}"}`);

    const clean = run(dir, ["--static"], { PROCESS_DOCUMENT_SECRET: secret });
    expect(clean.status).toBe(0);
    expect(clean.stdout).toMatch(/aucun secret détecté dans le code envoyé au navigateur \(\.next\/server\/app\) \(2 fichiers\)/);

    for (const file of ["index.html", "index.rsc", path.join("bibliotheque", "page.body")]) {
      writeFileSync(path.join(app, file), `ligne 1\n<p>${secret}</p>\n`);
      const leaked = run(dir, ["--static"], { PROCESS_DOCUMENT_SECRET: secret });
      expect(leaked.status).toBe(1);
      const shown = `.next/server/app/${file.split(path.sep).join("/")}`;
      expect(leaked.stderr).toContain(`${shown}:2 — valeur d'un secret de l'environnement`);
      expect(leaked.stdout + leaked.stderr).not.toContain(secret);
      writeFileSync(path.join(app, file), "propre\n");
    }

    const key = fakeOpenAiKey();
    writeFileSync(path.join(app, "index.html"), `<script>self.__next_f.push([1,"${key}"])</script>`);
    const found = run(dir, ["--static"], { PROCESS_DOCUMENT_SECRET: "" });
    expect(found.status).toBe(1);
    expect(found.stderr).toMatch(/\.next\/server\/app\/index\.html:1 — clé OpenAI \(valeur masquée\)/);
  });

  it("--static contrôle .next/static, y compris la valeur exacte d'un secret de l'environnement", () => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-cli-"));
    mkdirSync(path.join(dir, ".next", "static", "chunks"), { recursive: true });
    mkdirSync(path.join(dir, ".next", "server", "app"), { recursive: true });
    const secret = randomChars(40);
    writeFileSync(path.join(dir, ".next", "static", "chunks", "app.js"), `var s="${secret}";`);
    writeFileSync(path.join(dir, "a.ts"), `var s="${secret}";`);

    const clean = run(dir, ["--static"], { PROCESS_DOCUMENT_SECRET: "" });
    expect(clean.status).toBe(0);

    const leaked = run(dir, ["--static"], { PROCESS_DOCUMENT_SECRET: secret });
    expect(leaked.status).toBe(1);
    expect(leaked.stderr).toMatch(/\.next\/static\/chunks\/app\.js:1 — valeur d'un secret de l'environnement/);
    expect(leaked.stdout + leaked.stderr).not.toContain(secret);
  });

  it.each([
    ["nom de la variable", ["PROCESS", "DOCUMENT", "SECRET"].join("_"), /ressemble au nom d'une variable/],
    ["valeur trop courte", "valeur-courte", /moins de 32 caractères/],
  ])("%s : échec clair avant tout parcours, valeur masquée", (_label, value, message) => {
    dir = mkdtempSync(path.join(tmpdir(), "check-secrets-cli-"));
    writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");

    for (const args of [[], ["--static"]]) {
      const result = run(dir, args, { PROCESS_DOCUMENT_SECRET: value });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(message);
      expect(result.stderr).toContain("(valeur masquée)");
      if (value === "valeur-courte") expect(result.stdout + result.stderr).not.toContain(value);
    }
  });
});
