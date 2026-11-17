import { describe, expect, it } from "vitest";
import { createSseParser } from "@/lib/sse";
import {
  functionRegion,
  isProgressive,
  type Measure,
  measureMarkdown,
  median,
  miniQuestion,
  summarize,
} from "@/lib/stream-measure";

// Mesure du flux (story 5.5, Q1 = A) : calculs, verdict et résultat copié sans identifiant, jeton ni
// e-mail ; lecteur SSE du navigateur.
const Q1 = "Sous quel délai une facture doit-elle être émise après la livraison ?";
const measure = (overrides: Partial<Measure> = {}): Measure => ({
  sentAt: new Date("2026-11-18T08:00:00.000Z"),
  question: Q1,
  outcome: "answer",
  firstDeltaMs: 1_800,
  endMs: 4_200,
  deltas: 30,
  deltaReadsMs: [1_800, 2_100, 2_600, 3_900],
  region: "fra1",
  ...overrides,
});

describe("mesure du flux", () => {
  it("région tirée de x-vercel-id (avant-dernier segment), jamais l'identifiant ; sans fonction : null", () => {
    expect(functionRegion("cdg1::fra1::abcd1-1763390000000-0123456789ab")).toBe("fra1");
    expect(functionRegion("cdg1::abcd1-1763390000000")).toBeNull();
    expect(functionRegion("cdg1::<script>::x")).toBeNull();
    expect(functionRegion(null)).toBeNull();
  });

  it("questions du mini Jeu reconnues par leur texte (espaces de bord ignorés)", () => {
    expect(miniQuestion(`  ${Q1} `)).toEqual({ id: "q1", question: Q1 });
    expect(miniQuestion("Quelle est la capitale de l'Australie ?")?.id).toBe("o1");
    expect(miniQuestion("Quel est le délai avant la première relance d'une facture impayée ?")?.id).toBe("c1");
    expect(miniQuestion("Ma question personnelle")).toBeNull();
  });

  it("progressif : réponse reçue en plusieurs lectures étalées ; tout d'un bloc : non", () => {
    expect(isProgressive(measure())).toBe(true);
    expect(isProgressive(measure({ deltaReadsMs: [3_000] }))).toBe(false);
    expect(isProgressive(measure({ deltaReadsMs: [3_000, 3_000] }))).toBe(false);
    expect(isProgressive(measure({ outcome: "refusal", deltas: 0, deltaReadsMs: [], firstDeltaMs: null }))).toBe(false);
  });

  it("verdict : médiane du premier affichage < 5 s, réponses progressives, fra1 ; refus : premier affichage = événement final", () => {
    const ok = [
      ...Array.from({ length: 8 }, (_, index) => measure({ firstDeltaMs: 1_000 + index * 300 })),
      measure({ outcome: "refusal", firstDeltaMs: null, endMs: 2_500, deltas: 0, deltaReadsMs: [] }),
      measure({ outcome: "refusal", firstDeltaMs: null, endMs: 6_000, deltas: 0, deltaReadsMs: [] }),
    ];
    expect(summarize(ok)).toMatchObject({ count: 10, passed: true, answers: 8, progressiveAnswers: 8, regions: ["fra1"] });
    expect(median([1, 5, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(summarize(ok.map((item) => ({ ...item, firstDeltaMs: item.firstDeltaMs && 6_000, endMs: 7_000 })))).toMatchObject({
      firstDisplayOk: false,
      passed: false,
    });
    expect(summarize([...ok.slice(1), measure({ deltaReadsMs: [4_000] })])).toMatchObject({ progressiveOk: false, passed: false });
    expect(summarize([...ok.slice(1), measure({ region: "iad1" })])).toMatchObject({ regionOk: false, passed: false });
    expect(summarize([...ok.slice(1), measure({ region: null })]).regions).toContain("inconnue");
  });

  it("résultat Markdown : durées, nombres, région et texte des questions du mini Jeu ; ni identifiant, ni jeton, ni e-mail", () => {
    const text = measureMarkdown(
      [
        measure(),
        measure({ question: "Mon e-mail est jean.dupont@exemple.fr, jeton eyJhbGciOi.secret ; 6f1c2b9e-3a4d-4e5f-8a9b-0c1d2e3f4a5b" }),
        measure({ outcome: "error", code: "AI_CITATIONS_INVALID" }),
        measure({ outcome: "error", code: "Détail <libre> 6f1c2b9e" }),
      ],
      new Date("2026-11-18T09:00:00.000Z"),
    );
    expect(text).toContain(`q1 — ${Q1}`);
    expect(text).toContain("(hors mini Jeu, texte non repris)");
    expect(text).toContain("panne (AI_CITATIONS_INVALID)");
    expect(text).toContain("| 08:00:00 |");
    expect(text).toContain("| fra1 |");
    expect(text).not.toContain("@");
    expect(text).not.toContain("eyJ");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(text).not.toContain("6f1c2b9e");
    expect(text).not.toContain("::");
    expect(text).not.toContain("<libre>");
  });
});

describe("lecteur SSE du navigateur", () => {
  it("événements coupés n'importe où, commentaires ignorés, CRLF accepté", () => {
    const parser = createSseParser();
    const source = ': flux\n\nevent: delta\ndata: {"text":"A"}\n\nevent: done\r\ndata: {"x":1}\r\n\r\n';
    const events = [...source].flatMap((c) => parser.push(c));
    expect(events).toEqual([
      { event: "delta", data: '{"text":"A"}' },
      { event: "done", data: '{"x":1}' },
    ]);
  });
});
