import { describe, expect, it } from "vitest";
import { readCitations } from "../../supabase/functions/_shared/rag/citations.ts";

// Lecture des citations [P{n}] (story 5.2a-1, AD-11) : seules les citations des Passages transmis
// comptent ; Sources regroupées par Document dans l'ordre de première citation.
const passages = [
  { documentId: "facturation" },
  { documentId: "relances" },
  { documentId: "facturation" },
];

describe("readCitations", () => {
  it("citations valides : Sources par Document, dans l'ordre de première citation", () => {
    const reading = readCitations("Relancez à J+15 [P3]. Appelez le client [P2]. Puis envoyez la mise en demeure [P1].", passages);
    expect(reading.cited).toEqual([3, 2, 1]);
    expect(reading.sources).toEqual([
      { documentId: "facturation", passageNumbers: [3, 1] },
      { documentId: "relances", passageNumbers: [2] },
    ]);
    expect(reading.unknown).toEqual([]);
  });

  it("répétitions : un seul passage par numéro ; citations accolées reconnues", () => {
    const reading = readCitations("A [P1][P2]. B [P1]. C [P2][P1].", passages);
    expect(reading.cited).toEqual([1, 2]);
    expect(reading.sources).toEqual([
      { documentId: "facturation", passageNumbers: [1] },
      { documentId: "relances", passageNumbers: [2] },
    ]);
  });

  it.each([
    ["hors liste", "[P7]"],
    ["zéro", "[P0]"],
    ["zéro initial", "[P01]"],
    ["plusieurs numéros", "[P1, P2]"],
    ["plage", "[P1-2]"],
    ["numéro trop long", "[P1234]"],
    ["vide", "[P]"],
    ["longue liste", "[P1, P2, P3, P4, P5, P6, P7]"],
  ])("repère %s %s : ignoré, renvoyé dans unknown", (_label, token) => {
    const reading = readCitations(`Affirmation ${token}.`, passages);
    expect(reading.cited).toEqual([]);
    expect(reading.sources).toEqual([]);
    expect(reading.unknown).toEqual([token]);
  });

  it("minuscule, crochet sans P ou texte entre crochets : ni citation ni repère inconnu (aucun texte de réponse journalisé)", () => {
    const reading = readCitations("Voir [p1], [1], [Procédure] et [Pièce jointe].", passages);
    expect(reading).toEqual({ sources: [], cited: [], unknown: [] });
  });

  it("aucun Passage transmis : toute citation est inconnue", () => {
    expect(readCitations("A [P1].", [])).toEqual({ sources: [], cited: [], unknown: ["[P1]"] });
  });

  it("texte sans citation : lecture vide (la réponse sans citation valide est traitée en 5.4)", () => {
    expect(readCitations("Aucune source.", passages)).toEqual({ sources: [], cited: [], unknown: [] });
  });
});
