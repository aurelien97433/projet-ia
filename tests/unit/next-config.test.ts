import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { MAX_TEXT_BYTES } from "../../src/lib/documents";

describe("next.config.ts (story 7.8)", () => {
  it("R9 : en-têtes de sécurité sur toutes les routes", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]))).toEqual({
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
  });

  it("R10 : Server Actions limitées à 1 Mo, au moins 10 fois la taille maximale d'une Note", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("1mb");
    expect(1024 * 1024).toBeGreaterThanOrEqual(10 * MAX_TEXT_BYTES);
  });
});
