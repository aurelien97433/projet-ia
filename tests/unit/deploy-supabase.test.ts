import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listFunctions } from "../../scripts/deploy-supabase";

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
});
