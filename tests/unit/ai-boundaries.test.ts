import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_CODES as APP_CODES } from "@/lib/errors";
import { ERROR_CODES as FUNCTION_CODES } from "../../supabase/functions/_shared/errors.ts";

// Frontières de l'accès à l'IA (AD-1, AD-3, AD-20, NFR-2).
const root = path.resolve(import.meta.dirname, "..", "..");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

describe("frontières de l'IA", () => {
  it("aucune occurrence de openai ni de OPENAI_API_KEY dans src/", () => {
    const hits = filesUnder(path.join(root, "src")).filter((file) => /openai/i.test(readFileSync(file, "utf8")));
    expect(hits.map((file) => path.relative(root, file))).toEqual([]);
  });

  it("les Edge Functions n'importent rien de src/", () => {
    const hits = filesUnder(path.join(root, "supabase", "functions"))
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => /from\s+["'](@\/|[./]+\/src\/)/.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });

  it("OPENAI_API_KEY n'est lue que par _shared/ai.ts", () => {
    const readers = filesUnder(path.join(root, "supabase", "functions"))
      .filter((file) => file.endsWith(".ts") && readFileSync(file, "utf8").includes('"OPENAI_API_KEY"'))
      .map((file) => path.relative(root, file).replaceAll("\\", "/"));
    expect(readers).toEqual(["supabase/functions/_shared/ai.ts"]);
  });

  it("codes d'erreur identiques côté Next.js et côté Edge Functions (AD-19)", () => {
    expect([...FUNCTION_CODES]).toEqual([...APP_CODES]);
  });

  it("supabase/functions/.env est ignoré par git", () => {
    const output = execFileSync("git", ["check-ignore", "-v", "supabase/functions/.env"], { cwd: root, encoding: "utf8" });
    expect(output).toContain(".gitignore");
  });
});
