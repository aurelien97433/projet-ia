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

  it("n'inclut jamais une fonction locale (ai-health)", () => {
    dir = mkdtempSync(path.join(tmpdir(), "deploy-"));
    for (const name of ["ai-health", "chat"]) {
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
