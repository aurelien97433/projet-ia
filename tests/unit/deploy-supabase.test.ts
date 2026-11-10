import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertRemoteTarget,
  describeOutput,
  listFunctions,
  listLocalMigrations,
  missingRemoteMigrations,
  parseCliJson,
  readLinkedProjectRef,
  runDeploy,
  DeployError,
  type CliRun,
} from "../../scripts/deploy-supabase";

const REF = "abcdefghijklmnopqrst";
// Sortie réelle de la CLI 3.0.0 quand elle vise la stack locale (relevée le 2026-11-04).
const LOCAL_PUSH_OUTPUT =
  '{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],"message":"Local database is up to date.","target":{"kind":"local","host":"127.0.0.1","port":54322}}';

describe("listFunctions", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("renvoie une liste vide sans dossier de fonctions", () => {
    dir = mkdtempSync(path.join(tmpdir(), "deploy-"));
    expect(listFunctions(path.join(dir, "functions"))).toEqual([]);
  });

  it("ignore les modules partagés, les dossiers cachés et les dossiers sans index.ts", () => {
    dir = mkdtempSync(path.join(tmpdir(), "deploy-"));
    for (const name of ["_shared", ".vscode", "chat", "process-document", "notes"]) mkdirSync(path.join(dir, name));
    for (const name of ["_shared", ".vscode", "chat", "process-document"]) {
      writeFileSync(path.join(dir, name, "index.ts"), "");
    }
    expect(listFunctions(dir).sort()).toEqual(["chat", "process-document"]);
  });

  it("n'inclut jamais une fonction locale (ai-health, measure-embed)", () => {
    dir = mkdtempSync(path.join(tmpdir(), "deploy-"));
    for (const name of ["ai-health", "measure-embed", "chat"]) {
      mkdirSync(path.join(dir, name));
      writeFileSync(path.join(dir, name, "index.ts"), "");
    }
    expect(listFunctions(dir)).toEqual(["chat"]);
  });

  it("ignore un dossier dont le nom ne serait pas sûr sur la ligne de commande", () => {
    dir = mkdtempSync(path.join(tmpdir(), "deploy-"));
    for (const name of ["chat", "a&b", "Majuscule", "avec espace"]) {
      mkdirSync(path.join(dir, name));
      writeFileSync(path.join(dir, name, "index.ts"), "");
    }
    expect(listFunctions(dir)).toEqual(["chat"]);
  });
});

describe("cible du déploiement", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("lit la référence du projet lié, et rien sans lien ou avec une référence invalide", () => {
    dir = mkdtempSync(path.join(tmpdir(), "deploy-"));
    expect(readLinkedProjectRef(dir)).toBeNull();
    mkdirSync(path.join(dir, ".temp"));
    writeFileSync(path.join(dir, ".temp", "project-ref"), "pas une référence");
    expect(readLinkedProjectRef(dir)).toBeNull();
    writeFileSync(path.join(dir, ".temp", "project-ref"), `${REF}\n`);
    expect(readLinkedProjectRef(dir)).toBe(REF);
  });

  it("refuse une sortie qui vise la base locale (anomalie du 2026-11-04)", () => {
    expect(() => assertRemoteTarget(parseCliJson(LOCAL_PUSH_OUTPUT), REF)).toThrow(/base locale/);
  });

  it("refuse une sortie sans cible ou illisible", () => {
    expect(() => assertRemoteTarget(parseCliJson("CREATE FUNCTION"), REF)).toThrow(/cible/);
    expect(() => assertRemoteTarget({ message: "ok" }, REF)).toThrow(/cible/);
  });

  it("refuse un autre projet distant que le projet lié", () => {
    const other = { target: { kind: "remote", ref: "zzzzzzzzzzzzzzzzzzzz" } };
    expect(() => assertRemoteTarget(other, REF)).toThrow(/ne correspond pas/);
  });

  it("accepte le projet distant lié", () => {
    expect(() => assertRemoteTarget({ target: { kind: "remote", ref: REF } }, REF)).not.toThrow();
  });

  // Sortie réelle de `db push --remote --output-format json` (CLI 3.0.0, relevée le 2026-11-04).
  const linkedOutput = (ref: string) =>
    `{"upToDate":true,"dryRun":false,"migrations":[],"seeds":[],"roles":[],"message":"Remote database is up to date.","target":{"kind":"linked","project_ref":"${ref}","project_name":"projet-ia","environment":"production"}}`;

  it("accepte la sortie réelle de la CLI pour le projet lié (kind linked, project_ref)", () => {
    expect(() => assertRemoteTarget(parseCliJson(linkedOutput(REF)), REF)).not.toThrow();
  });

  it("refuse la même sortie quand project_ref désigne un autre projet, même s'il contient la référence", () => {
    expect(() => assertRemoteTarget(parseCliJson(linkedOutput("zzzzzzzzzzzzzzzzzzzz")), REF)).toThrow(/ne correspond pas/);
    expect(() =>
      assertRemoteTarget({ target: { kind: "linked", project_ref: "x", project_name: REF } }, REF),
    ).toThrow(/ne correspond pas/);
  });

  it("refuse la sortie texte d'un terminal interactif (aucune cible lisible)", () => {
    const text = "Remote database is up to date.";
    expect(() => assertRemoteTarget(parseCliJson(text), REF)).toThrow(/cible/);
    expect(describeOutput(text)).toBe(text);
  });

  it("masque les identifiants d'une URL dans le diagnostic", () => {
    const output = "connexion postgresql://postgres.ref:motdepasse@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
    expect(describeOutput(output)).not.toContain("motdepasse");
    expect(describeOutput(output)).toContain("://***@aws-0");
  });
});

describe("contrôle des migrations distantes", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("liste les versions des migrations locales", () => {
    dir = mkdtempSync(path.join(tmpdir(), "deploy-"));
    writeFileSync(path.join(dir, "20261104094731_profiles.sql"), "");
    writeFileSync(path.join(dir, "notes.md"), "");
    expect(listLocalMigrations(dir)).toEqual(["20261104094731"]);
  });

  it("signale une migration locale absente du projet distant", () => {
    const output = { migrations: [{ local: "20261104094731", remote: "" }], target: { kind: "remote", ref: REF } };
    expect(missingRemoteMigrations(["20261104094731"], output)).toEqual(["20261104094731"]);
  });

  it("ne signale rien quand toutes les migrations sont appliquées", () => {
    const output = { migrations: [{ local: "20261104094731", remote: "20261104094731" }] };
    expect(missingRemoteMigrations(["20261104094731"], output)).toEqual([]);
  });
});

// Déploiement complet avec une CLI simulée. Comme la vraie CLI face à un projet hébergé, elle
// refuse d'appliquer une migration en attente sans --yes quand aucun terminal ne peut confirmer
// (échec du 2026-11-05 : « supabase db push a échoué », sans autre détail).
describe("déploiement complet (CLI simulée)", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const linked = (extra: Record<string, unknown> = {}): CliRun => {
    const output = { ...extra, target: { kind: "linked", project_ref: REF, project_name: "projet-ia" } };
    return { ok: true, output, raw: JSON.stringify(output) };
  };
  const cliError = (code: string, message: string): CliRun => {
    const output = { _tag: "Error", error: { code, message } };
    return { ok: false, output, raw: JSON.stringify(output) };
  };

  function project(migrations: string[], functions: string[] = []) {
    dir = mkdtempSync(path.join(tmpdir(), "deploy-"));
    mkdirSync(path.join(dir, ".temp"));
    writeFileSync(path.join(dir, ".temp", "project-ref"), REF);
    mkdirSync(path.join(dir, "migrations"));
    for (const version of migrations) writeFileSync(path.join(dir, "migrations", `${version}_m.sql`), "");
    for (const name of functions) {
      mkdirSync(path.join(dir, "functions", name), { recursive: true });
      writeFileSync(path.join(dir, "functions", name, "index.ts"), "");
    }
    return dir;
  }

  // Projet distant simulé : applique les migrations en attente seulement avec --yes.
  function fakeCli(local: string[], remoteBefore: string[]) {
    const calls: string[][] = [];
    const remote = new Set(remoteBefore);
    const cli = (args: string[]): CliRun => {
      calls.push(args);
      const [command, sub] = args;
      if (command === "db" && sub === "push") {
        const pending = local.filter((version) => !remote.has(version));
        if (pending.length > 0 && !args.includes("--yes")) {
          return cliError("ConfirmationRequired", "hosted changes only accept --yes or SUPABASE_YES");
        }
        for (const version of pending) remote.add(version);
        return linked({ migrations: pending });
      }
      if (command === "migration") return linked({ migrations: local.map((v) => ({ local: v, remote: remote.has(v) ? v : "" })) });
      if (command === "functions") return linked();
      throw new Error(`commande inattendue : ${args.join(" ")}`);
    };
    return { cli, calls };
  }

  it("migration en attente : appliquée avec --yes, vérifiée à distance, fonctions déployées par nom", () => {
    const local = ["20261104094731", "20261105105410"];
    const { cli, calls } = fakeCli(local, ["20261104094731"]);
    const lines: string[] = [];
    runDeploy(project(local, ["process-document", "ai-health"]), cli, (line) => lines.push(line));

    expect(calls).toEqual([
      ["db", "push", `--remote=${REF}`, "--yes"],
      ["migration", "list", `--remote=${REF}`],
      ["functions", "deploy", "process-document", `--remote=${REF}`, "--yes"],
    ]);
    expect(lines.at(-1)).toBe(`deploy:supabase — terminé sur le projet distant ${REF}.`);
  });

  it("sans migration en attente ni fonction : succès, aucun déploiement de fonction", () => {
    const local = ["20261104094731"];
    const { cli, calls } = fakeCli(local, local);
    runDeploy(project(local), cli, () => {});
    expect(calls.map((args) => args[0])).toEqual(["db", "migration"]);
  });

  it("échec de la CLI : message d'erreur de la CLI affiché, identifiants d'URL masqués", () => {
    const failing = (): CliRun =>
      cliError("DbConnectError", "failed to connect to postgres://postgres.abcd:motdepasse@aws-0.pooler.supabase.com:6543/postgres");
    let message = "";
    try {
      runDeploy(project(["20261104094731"]), failing, () => {});
    } catch (error) {
      expect(error).toBeInstanceOf(DeployError);
      message = (error as Error).message;
    }
    expect(message).toContain("supabase db push a échoué");
    expect(message).toContain("DbConnectError : failed to connect to postgres://***@aws-0.pooler.supabase.com");
    expect(message).not.toContain("motdepasse");
  });

  it("sortie non JSON en échec : début de la sortie, masqué", () => {
    const failing = (): CliRun => ({ ok: false, output: null, raw: "Error: connect postgres://u:secret@h/db refused" });
    expect(() => runDeploy(project(["20261104094731"]), failing, () => {})).toThrow(/postgres:\/\/\*\*\*@h\/db refused/);
  });

  it("migration toujours absente du projet distant après le push : échec nommant la version", () => {
    const local = ["20261104094731", "20261105105410"];
    const cli = (args: string[]): CliRun =>
      args[0] === "migration" ? linked({ migrations: [{ local: local[0], remote: local[0] }] }) : linked();
    expect(() => runDeploy(project(local), cli, () => {})).toThrow("migrations absentes du projet distant : 20261105105410.");
  });

  it("push qui vise la base locale : échec, même si la CLI répond « succès »", () => {
    const cli = (): CliRun => ({ ok: true, output: parseCliJson(LOCAL_PUSH_OUTPUT), raw: LOCAL_PUSH_OUTPUT });
    expect(() => runDeploy(project(["20261104094731"]), cli, () => {})).toThrow(/base locale/);
  });

  it("aucun projet lié : échec explicite, aucune commande lancée", () => {
    dir = mkdtempSync(path.join(tmpdir(), "deploy-"));
    const cli = () => {
      throw new Error("ne doit pas être appelée");
    };
    expect(() => runDeploy(dir, cli, () => {})).toThrow(/aucun projet distant lié/);
  });
});
