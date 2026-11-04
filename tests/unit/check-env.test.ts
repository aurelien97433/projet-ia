import { describe, expect, it } from "vitest";
import { checkEnv, SUPABASE_BIN, type Runner } from "../../scripts/check-env";

const runner =
  (results: Record<string, { ok: boolean; stdout: string }>): Runner =>
  (command) =>
    results[command] ?? { ok: false, stdout: "" };

describe("checkEnv", () => {
  it("réussit quand Docker répond et que la CLI est en 3.0.0", () => {
    const result = checkEnv(runner({ docker: { ok: true, stdout: "29.9.2" }, [SUPABASE_BIN]: { ok: true, stdout: "3.0.0" } }));
    expect(result).toEqual({ ok: true, messages: ["Docker OK", "Supabase CLI 3.0.0 OK"] });
  });

  it("nomme Docker quand il est absent ou arrêté", () => {
    const result = checkEnv(runner({ [SUPABASE_BIN]: { ok: true, stdout: "3.0.0" } }));
    expect(result.ok).toBe(false);
    expect(result.messages[0]).toMatch(/Docker introuvable ou arrêté/);
  });

  it("nomme la CLI Supabase quand elle est absente", () => {
    const result = checkEnv(runner({ docker: { ok: true, stdout: "29.9.2" } }));
    expect(result.ok).toBe(false);
    expect(result.messages[1]).toMatch(/Supabase CLI introuvable/);
  });

  it("lit la version même si la CLI ajoute un avis de mise à jour", () => {
    const stdout = "3.0.0\nA new version of Supabase CLI is available: v3.1.0";
    const result = checkEnv(runner({ docker: { ok: true, stdout: "29.9.2" }, [SUPABASE_BIN]: { ok: true, stdout } }));
    expect(result.ok).toBe(true);
  });

  it("signale une version de CLI différente", () => {
    const result = checkEnv(runner({ docker: { ok: true, stdout: "29.9.2" }, [SUPABASE_BIN]: { ok: true, stdout: "2.99.0" } }));
    expect(result.ok).toBe(false);
    expect(result.messages[1]).toMatch(/3\.0\.0 attendue, version 2\.99\.0/);
  });
});
