import { describe, expect, it } from "vitest";
import { buildMeasureText } from "../../scripts/generate-measure-note";
import { CHUNK_MAX_LENGTH, CHUNK_TARGET_LENGTH } from "../../supabase/functions/_shared/config.ts";
import { type Chunk, chunkText } from "../../supabase/functions/_shared/rag/chunk.ts";

// Invariants valables pour tout texte : positions exactes, ordre, longueur, aucun caractère perdu.
function expectInvariants(text: string, chunks: Chunk[]) {
  let previousEnd = 0;
  for (const chunk of chunks) {
    expect(text.slice(chunk.start, chunk.end)).toBe(chunk.content);
    expect(chunk.start).toBeGreaterThanOrEqual(previousEnd);
    expect(chunk.end).toBeGreaterThan(chunk.start);
    expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_MAX_LENGTH);
    expect(chunk.content).toBe(chunk.content.trim());
    expect(chunk.content).not.toMatch(/[\ud800-\udbff]$/);
    expect(chunk.content).not.toMatch(/^[\udc00-\udfff]/);
    previousEnd = chunk.end;
  }
  const withoutSpaces = (value: string) => value.replace(/\s/g, "");
  expect(chunks.map((chunk) => withoutSpaces(chunk.content)).join("")).toBe(withoutSpaces(text));
}

const sentence = (length: number) => `${"mot ".repeat(Math.ceil(length / 4)).slice(0, length - 1).trimEnd()}.`;

describe("chunkText", () => {
  it("texte vide ou blanc : aucun Passage", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText(" \n\n\t ")).toEqual([]);
  });

  it("Note courte : un seul Passage, positions sans les espaces de bord", () => {
    const text = "\n\n  Procédure de facturation.  \n";
    const chunks = chunkText(text);
    expect(chunks).toEqual([{ start: 4, end: 29, content: "Procédure de facturation." }]);
    expectInvariants(text, chunks);
  });

  it("jusqu'au maximum : un seul Passage", () => {
    const text = "a".repeat(CHUNK_MAX_LENGTH);
    expect(chunkText(text)).toHaveLength(1);
  });

  it("paragraphes : coupure à la fin de paragraphe la plus proche de la cible", () => {
    const first = sentence(500);
    const second = sentence(300);
    const third = sentence(900);
    const text = [first, second, third].join("\n\n");
    const chunks = chunkText(text);
    expect(chunks[0].content).toBe(`${first}\n\n${second}`);
    expect(chunks[1].content).toBe(third);
    expectInvariants(text, chunks);
  });

  it("préfère une fin de paragraphe à une fin de phrase plus proche de la cible", () => {
    const first = sentence(700);
    const text = `${first}\n\n${sentence(200)} ${sentence(1_000)}`;
    expect(chunkText(text)[0].content).toBe(first);
  });

  it("entre deux fins de paragraphe, retient la plus proche de la cible", () => {
    const parts = [sentence(450), sentence(320), sentence(380), sentence(600)];
    const text = parts.join("\n\n");
    expect(chunkText(text)[0].content).toBe(`${parts[0]}\n\n${parts[1]}`);
  });

  it("un titre seul ne fait pas un Passage", () => {
    const text = `Titre de la Note\n\n${"mot ".repeat(400)}`;
    expect(chunkText(text)[0].content.length).toBeGreaterThanOrEqual(CHUNK_TARGET_LENGTH / 2);
  });

  it("une abréviation en tête ne fait pas un Passage de deux caractères", () => {
    const text = `M. ${"mot ".repeat(400)}`;
    const chunks = chunkText(text);
    expect(chunks[0].content.length).toBeGreaterThanOrEqual(CHUNK_TARGET_LENGTH / 2);
    expectInvariants(text, chunks);
  });

  it("guillemet français après une fin de phrase : il reste dans le Passage", () => {
    const text = `${"mot ".repeat(205)}« Bonjour ! » ${"suite ".repeat(100)}`;
    expect(chunkText(text)[0].content.endsWith("! »")).toBe(true);
  });

  it("liste sans ponctuation : coupée en fin de ligne, pas au milieu d'une ligne", () => {
    const lines = Array.from({ length: 60 }, (_, index) => `Élément numéro ${index} de la liste de contrôle`);
    const text = lines.join("\n");
    const chunks = chunkText(text);
    expect(lines).toContain(chunks[0].content.split("\n").at(-1));
    expectInvariants(text, chunks);
  });

  it("sans paragraphe : première fin de phrase atteignant la cible", () => {
    const parts = Array.from({ length: 12 }, () => sentence(200));
    const text = parts.join(" ");
    const chunks = chunkText(text);
    expect(chunks[0].content.endsWith(".")).toBe(true);
    expect(chunks[0].content.length).toBeGreaterThanOrEqual(CHUNK_TARGET_LENGTH);
    expect(chunks[0].content.length).toBeLessThan(CHUNK_TARGET_LENGTH + 200);
    expectInvariants(text, chunks);
  });

  it.each(["!", "?", "…", ".»", '."', ".)"])("reconnaît la fin de phrase « %s »", (mark) => {
    const text = `${"mot ".repeat(205).trimEnd()}${mark} ${"suite ".repeat(100).trimEnd()}`;
    expect(chunkText(text)[0].content.endsWith(mark)).toBe(true);
  });

  it("une fin de phrase exactement au maximum est retenue", () => {
    const first = `${"x".repeat(CHUNK_MAX_LENGTH - 1)}.`;
    const chunks = chunkText(`${first} suite de la Note`);
    expect(chunks[0].content).toBe(first);
  });

  it("phrase trop longue, avec espaces : coupée au dernier espace avant la limite", () => {
    const text = "abcdefghi ".repeat(300);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content.length).toBe(1199);
    expect(chunks[0].content.endsWith("abcdefghi")).toBe(true);
    expectInvariants(text, chunks);
  });

  it("sans aucun espace : coupée à 1 200 exactement", () => {
    const text = "x".repeat(3_000);
    const chunks = chunkText(text);
    expect(chunks.map((chunk) => chunk.content.length)).toEqual([1200, 1200, 600]);
    expectInvariants(text, chunks);
  });

  it("emoji à la limite : la paire de surrogates n'est jamais séparée", () => {
    const text = `${"x".repeat(CHUNK_MAX_LENGTH - 1)}😀${"y".repeat(500)}`;
    const chunks = chunkText(text);
    expect(chunks[0].end).toBe(CHUNK_MAX_LENGTH - 1);
    expect(chunks[1].content.startsWith("😀")).toBe(true);
    expectInvariants(text, chunks);
  });

  it("positions exactes avec des caractères hors du plan de base", () => {
    const text = `😀 Première phrase. ${"😀 mot ".repeat(400)}`;
    expectInvariants(text, chunkText(text));
  });

  it("une abréviation ne perd aucun caractère", () => {
    const text = `${"M. Dupont valide la facture de NexaWorks. ".repeat(100)}`;
    expectInvariants(text, chunkText(text));
  });

  it("texte réaliste de 60 000 caractères : invariants tenus, taille moyenne proche de la cible", () => {
    const text = buildMeasureText(60_000);
    const chunks = chunkText(text);
    expectInvariants(text, chunks);
    const average = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length;
    expect(average).toBeGreaterThan(500);
    expect(average).toBeLessThan(CHUNK_MAX_LENGTH);
  });

  it.each([1, 2, 3, 4, 5])("textes variés, tirage déterministe %i", (seed) => {
    let state = seed * 2_654_435_761;
    const next = (max: number) => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state % max;
    };
    const pieces = ["mot ", "é", "😀", ". ", "! ", "\n", "\n\n", "x".repeat(700), "  ", "… ", "\t"];
    const text = Array.from({ length: 2_000 }, () => pieces[next(pieces.length)]).join("");
    expectInvariants(text, chunkText(text));
  });
});
