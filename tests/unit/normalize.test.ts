import { describe, expect, it } from "vitest";
import { canonicalText } from "@/lib/documents";
import { normalizeText } from "../../supabase/functions/_shared/rag/normalize.ts";

describe("normalizeText", () => {
  it("fins de ligne en \\n, forme NFC", () => {
    expect(normalizeText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
    expect(normalizeText("été")).toBe("été");
  });

  it("retire espaces et tabulations de fin de ligne, garde le reste", () => {
    expect(normalizeText("  début  \t\nmilieu \n\n fin\t")).toBe("  début\nmilieu\n\n fin");
    expect(normalizeText("sans coupure ")).toBe("sans coupure ");
  });

  it("est idempotente", () => {
    const text = "Ligne  \r\n\r\n  é \t\rfin ";
    expect(normalizeText(normalizeText(text))).toBe(normalizeText(text));
  });

  it("reste compatible avec le texte canonique de Next.js", () => {
    const text = "étape\r\nsuite\rfin";
    expect(normalizeText(text)).toBe(canonicalText(text));
  });

  it("traite une longue suite d'espaces en temps linéaire", () => {
    const text = `${" ".repeat(1_000_000)}x`;
    const started = Date.now();
    expect(normalizeText(text)).toBe(text);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
