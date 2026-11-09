import { describe, expect, it } from "vitest";
import { layoutPassages, type ReaderSegment } from "@/lib/passages";

const text = "0123456789abcdefghij";
const passagesOf = (segments: ReaderSegment[]) => segments.flatMap((s) => (s.kind === "passage" ? [s] : []));
const join = (segments: ReaderSegment[]) => segments.map((s) => s.text).join("");

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
