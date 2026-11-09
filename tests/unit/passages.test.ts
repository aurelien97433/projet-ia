import { describe, expect, it } from "vitest";
import { layoutPassages, parsePassageParams, type ReaderSegment } from "@/lib/passages";

const text = "0123456789abcdefghij";
const passagesOf = (segments: ReaderSegment[]) => segments.flatMap((s) => (s.kind === "passage" ? [s] : []));
const join = (segments: ReaderSegment[]) => segments.map((s) => s.text).join("");

describe("parsePassageParams", () => {
  const LENGTH = 1_000;
  const parse = (params: Parameters<typeof parsePassageParams>[0]) => parsePassageParams(params, LENGTH);
  const layout = (params: Parameters<typeof parsePassageParams>[0], content = text) => {
    const { passages, activeIndex } = parsePassageParams(params, content.length);
    return layoutPassages(content, passages, activeIndex);
  };

  it.each([
    ["absent", {}],
    ["vide", { passages: "" }],
    ["absent, avec actif", { actif: "3" }],
  ])("passages %s : aucune entrée, actif 0, aucun message", (_label, params) => {
    expect(parse(params)).toEqual({ passages: [], activeIndex: 0 });
    expect(layout(params).missing).toBe("none");
  });

  it("valide : positions dans l'ordre reçu, actif conservé", () => {
    expect(parse({ passages: "120-340,900-1000", actif: "1" })).toEqual({
      passages: [
        { start: 120, end: 340 },
        { start: 900, end: 1000 },
      ],
      activeIndex: 1,
    });
  });

  it("élément invalide : reste à sa place, actif désigne toujours la liste reçue", () => {
    const params = { passages: "abc,2-4", actif: "1" };
    expect(parse(params).activeIndex).toBe(1);
    expect(parse(params).passages).toHaveLength(2);
    const { segments, total, missing } = layout(params);
    expect(passagesOf(segments).map((s) => [s.text, s.active])).toEqual([["23", true]]);
    expect(total).toBe(1);
    expect(missing).toBe("some");
  });

  it.each([
    ["autre séparateur", "1:2"],
    ["négatif", "-1-2"],
    ["décimal", "1.5-2"],
    ["espace", " 1-2"],
    ["fin manquante", "1-"],
    ["signe", "+1-2"],
    ["hexadécimal", "0x1-2"],
    ["chiffres non ASCII", "١-٢"],
    ["huit chiffres", "12345678-12345679"],
    ["balisage", "<script>alert(1)</script>"],
    ["élément vide", ""],
  ])("forme invalide (%s) : une entrée invalide", (_label, element) => {
    const { segments, missing } = layout({ passages: `${element},2-4` }, text);
    expect(missing).toBe("some");
    expect(passagesOf(segments)).toHaveLength(1);
  });

  it("une valeur de l'URL ne ressort jamais : seuls des entiers", () => {
    const { passages } = parse({ passages: "<b>x</b>,1-2,javascript:alert(1)", actif: "<i>" });
    for (const passage of passages) {
      expect(Number.isInteger(passage.start)).toBe(true);
      expect(Number.isInteger(passage.end)).toBe(true);
    }
  });

  it.each([
    ["début au-delà du texte", "1001-1002"],
    ["fin au-delà du texte", "5-1001"],
    ["limite de 7 chiffres", "9999999-9999999"],
  ])("%s : entrée invalide", (_label, element) => {
    expect(parse({ passages: element }).passages).toEqual([{ start: -1, end: -1 }]);
  });

  it("position exactement à la fin du texte : acceptée", () => {
    expect(parse({ passages: "990-1000" }).passages).toEqual([{ start: 990, end: 1000 }]);
  });

  describe("liste refusée en bloc : une seule entrée invalide, actif 0", () => {
    const elements = (count: number) => Array.from({ length: count }, (_, i) => `${i * 2}-${i * 2 + 1}`).join(",");

    it.each([
      ["21 éléments", { passages: elements(21), actif: "2" }],
      ["paramètre répété", { passages: ["a", "b"], actif: "1" }],
      ["paramètre répété, valeurs valides", { passages: ["1-2", "3-4"] }],
      ["plus de 2 000 caractères", { passages: `1-2,${"x".repeat(1_997)}` }],
    ])("%s", (_label, params) => {
      expect(parse(params)).toEqual({ passages: [{ start: -1, end: -1 }], activeIndex: 0 });
      expect(layout(params).missing).toBe("all");
    });

    it("20 éléments et 2 000 caractères : acceptés", () => {
      expect(parse({ passages: elements(20) }).passages).toHaveLength(20);
      const exact = `1-2,${"x".repeat(1_996)}`;
      expect(exact).toHaveLength(2_000);
      expect(parse({ passages: exact }).passages).toEqual([
        { start: 1, end: 2 },
        { start: -1, end: -1 },
      ]);
    });
  });

  it.each([
    ["texte", "x"],
    ["négatif", "-1"],
    ["hors liste", "99"],
    ["égal à la longueur", "2"],
    ["décimal", "0.5"],
    ["vide", ""],
    ["répété", ["0", "1"]],
    ["absent", undefined],
  ])("actif invalide (%s) : 0", (_label, actif) => {
    expect(parse({ passages: "1-2,3-4", actif }).activeIndex).toBe(0);
  });

  it("actif désigne une entrée invalide : le premier retrouvé est actif", () => {
    const { segments } = layout({ passages: "abc,2-4,6-8", actif: "0" });
    expect(passagesOf(segments).map((s) => s.active)).toEqual([true, false]);
  });
});

describe("layoutPassages", () => {
  it("sans Passage : texte seul, rien de manquant", () => {
    expect(layoutPassages(text, [], 0)).toEqual({
      segments: [{ kind: "text", start: 0, text }],
      total: 0,
      missing: "none",
    });
  });

  it("texte vide : aucun segment", () => {
    expect(layoutPassages("", [], 0)).toEqual({ segments: [], total: 0, missing: "none" });
  });

  it("un Passage : texte avant, Passage actif, texte après", () => {
    expect(layoutPassages(text, [{ start: 2, end: 5 }], 0)).toEqual({
      segments: [
        { kind: "text", start: 0, text: "01" },
        { kind: "passage", start: 2, text: "234", position: 1, active: true },
        { kind: "text", start: 5, text: "56789abcdefghij" },
      ],
      total: 1,
      missing: "none",
    });
  });

  it("désordonnés : ordre du texte ; activeIndex désigne la liste reçue, un seul actif", () => {
    const { segments, total, missing } = layoutPassages(
      text,
      [
        { start: 10, end: 12 },
        { start: 0, end: 2 },
        { start: 15, end: 17 },
      ],
      1,
    );
    expect(passagesOf(segments).map((s) => [s.text, s.position, s.active])).toEqual([
      ["01", 1, true],
      ["ab", 2, false],
      ["fg", 3, false],
    ]);
    expect(total).toBe(3);
    expect(missing).toBe("none");
    expect(join(segments)).toBe(text);
  });

  it("bord : texte entier surligné, sans segment vide", () => {
    expect(layoutPassages(text, [{ start: 0, end: text.length }], 0).segments).toEqual([
      { kind: "passage", start: 0, text, position: 1, active: true },
    ]);
  });

  it("Passages contigus : aucun segment vide entre eux, pas de chevauchement", () => {
    const { segments, missing } = layoutPassages(
      "abcd",
      [
        { start: 0, end: 2 },
        { start: 2, end: 4 },
      ],
      1,
    );
    expect(segments.map((s) => s.kind)).toEqual(["passage", "passage"]);
    expect(passagesOf(segments).map((s) => s.active)).toEqual([false, true]);
    expect(missing).toBe("none");
  });

  it.each([
    ["hors texte", { start: 18, end: 21 }],
    ["début négatif", { start: -1, end: 3 }],
    ["fin avant début", { start: 5, end: 2 }],
    ["vide", { start: 5, end: 5 }],
    ["décimal", { start: 1.5, end: 3 }],
    ["NaN", { start: Number.NaN, end: 3 }],
    ["infini", { start: 0, end: Number.POSITIVE_INFINITY }],
    ["chaîne", { start: "1" as unknown as number, end: 3 }],
    ["absent", { start: undefined as unknown as number, end: 3 }],
  ])("invalide (%s) : texte seul, tous manquants", (_label, passage) => {
    expect(layoutPassages(text, [passage], 0)).toEqual({
      segments: [{ kind: "text", start: 0, text }],
      total: 0,
      missing: "all",
    });
  });

  it("un valide et un invalide : le valide reste, compteur ramené aux retrouvés", () => {
    const { segments, total, missing } = layoutPassages(
      text,
      [
        { start: 99, end: 120 },
        { start: 2, end: 4 },
      ],
      1,
    );
    expect(passagesOf(segments)).toHaveLength(1);
    expect(total).toBe(1);
    expect(missing).toBe("some");
  });

  it("chevauchement : le premier dans l'ordre des positions reste, quel que soit l'ordre reçu", () => {
    const { segments, total, missing } = layoutPassages(
      text,
      [
        { start: 4, end: 9 },
        { start: 2, end: 6 },
      ],
      0,
    );
    expect(passagesOf(segments).map((s) => [s.start, s.text, s.position])).toEqual([[2, "2345", 1]]);
    expect(total).toBe(1);
    expect(missing).toBe("some");
    expect(join(segments)).toBe(text);
  });

  it("un Passage rejeté ne bloque pas le suivant : la comparaison se fait au dernier retenu", () => {
    const { segments } = layoutPassages(
      text,
      [
        { start: 0, end: 5 },
        { start: 1, end: 9 },
        { start: 6, end: 8 },
      ],
      0,
    );
    expect(passagesOf(segments).map((s) => s.text)).toEqual(["01234", "67"]);
  });

  it("doublon : un seul retenu", () => {
    const { total, missing } = layoutPassages(
      text,
      [
        { start: 1, end: 3 },
        { start: 1, end: 3 },
      ],
      0,
    );
    expect(total).toBe(1);
    expect(missing).toBe("some");
  });

  describe("paire de substitution", () => {
    const emoji = "a😀b"; // a = 0, emoji = 1 et 2, b = 3

    it.each([
      ["début", { start: 2, end: 4 }],
      ["fin", { start: 0, end: 2 }],
    ])("%s au milieu de l'emoji : Passage rejeté", (_label, passage) => {
      const { total, missing } = layoutPassages(emoji, [passage], 0);
      expect(total).toBe(0);
      expect(missing).toBe("all");
    });

    it("emoji entier : Passage retenu", () => {
      expect(passagesOf(layoutPassages(emoji, [{ start: 1, end: 3 }], 0).segments)[0].text).toBe("😀");
    });

    it("demi-paire isolée dans le texte : aucune paire coupée", () => {
      expect(layoutPassages("a\ud83dbc", [{ start: 2, end: 4 }], 0).total).toBe(1);
    });
  });

  describe("Passage actif demandé invalide : premier retrouvé dans le texte", () => {
    const passages = [
      { start: 10, end: 12 },
      { start: 2, end: 4 },
    ];
    it.each([
      ["hors liste", 5],
      ["négatif", -1],
      ["décimal", 0.5],
      ["NaN", Number.NaN],
    ])("%s", (_label, activeIndex) => {
      expect(passagesOf(layoutPassages(text, passages, activeIndex).segments).map((s) => s.active)).toEqual([true, false]);
    });

    it("Passage demandé rejeté (positions invalides)", () => {
      const list = [
        { start: 10, end: 12 },
        { start: 99, end: 100 },
        { start: 2, end: 4 },
      ];
      expect(passagesOf(layoutPassages(text, list, 1).segments).map((s) => s.active)).toEqual([true, false]);
    });

    it("Passage demandé rejeté (chevauchement)", () => {
      const list = [
        { start: 2, end: 6 },
        { start: 4, end: 8 },
        { start: 10, end: 12 },
      ];
      expect(passagesOf(layoutPassages(text, list, 1).segments).map((s) => s.active)).toEqual([true, false]);
    });
  });
});
