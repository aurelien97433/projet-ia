import { describe, expect, it } from "vitest";
import { readCitations } from "../../supabase/functions/_shared/rag/citations.ts";

// Lecture des citations [P{n}] (story 5.2a-1, AD-11) : seules les citations des Passages transmis
// comptent ; Sources regroupées par Document dans l'ordre de première citation. Story 5.4 : texte
// réécrit (renvois [S{n}], citations invalides retirées).
const passages = [
  { documentId: "facturation" },
  { documentId: "relances" },
  { documentId: "facturation" },
];
const eight = Array.from({ length: 8 }, (_, index) => ({ documentId: `doc-${index + 1}` }));

describe("readCitations", () => {
  it("citations valides : Sources par Document, dans l'ordre de première citation", () => {
    const reading = readCitations("Relancez à J+15 [P3]. Appelez le client [P2]. Puis envoyez la mise en demeure [P1].", passages);
    expect(reading.cited).toEqual([3, 2, 1]);
    expect(reading.sources).toEqual([
      { documentId: "facturation", passageNumbers: [3, 1] },
      { documentId: "relances", passageNumbers: [2] },
    ]);
    expect(reading.unknown).toEqual([]);
    expect(reading.text).toBe("Relancez à J+15[S1]. Appelez le client[S2]. Puis envoyez la mise en demeure[S1].");
  });

  it("répétitions : un seul passage par numéro ; citations accolées reconnues", () => {
    const reading = readCitations("A [P1][P2]. B [P1]. C [P2][P1].", passages);
    expect(reading.cited).toEqual([1, 2]);
    expect(reading.sources).toEqual([
      { documentId: "facturation", passageNumbers: [1] },
      { documentId: "relances", passageNumbers: [2] },
    ]);
    expect(reading.text).toBe("A[S1][S2]. B[S1]. C[S2][S1].");
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
    const text = "Voir [p1], [1], [Procédure], [Pièce jointe], [Service] et [Société].";
    expect(readCitations(text, passages)).toEqual({ sources: [], cited: [], unknown: [], modelRenvoisRemoved: 0, text });
  });

  it("aucun Passage transmis : toute citation est inconnue", () => {
    expect(readCitations("A [P1].", [])).toEqual({ sources: [], cited: [], unknown: ["[P1]"], modelRenvoisRemoved: 0, text: "A." });
  });

  it("texte sans citation : lecture vide (chat renvoie AI_CITATIONS_INVALID)", () => {
    expect(readCitations("Aucune source.", passages)).toEqual({ sources: [], cited: [], unknown: [], modelRenvoisRemoved: 0, text: "Aucune source." });
  });
});

// Cas d'epics.md (story 5.4) et cas limites de la réécriture.
describe("readCitations : réécriture du texte (story 5.4)", () => {
  it("toutes valides : P1 et P3 de deux Documents → renvois 1 et 2", () => {
    const reading = readCitations("A [P1]. B [P3].", eight);
    expect(reading.text).toBe("A[S1]. B[S2].");
    expect(reading.sources).toEqual([
      { documentId: "doc-1", passageNumbers: [1] },
      { documentId: "doc-3", passageNumbers: [3] },
    ]);
  });

  it("même Document : P1 et P2 cités côte à côte → un seul renvoi, une Source à 2 Passages", () => {
    const sameDocument = [{ documentId: "facturation" }, { documentId: "facturation" }];
    const reading = readCitations("A [P1][P2].", sameDocument);
    expect(reading.text).toBe("A[S1].");
    expect(reading.sources).toEqual([{ documentId: "facturation", passageNumbers: [1, 2] }]);
    expect(readCitations("A [P1] [P2].", sameDocument).text).toBe("A[S1].");
    // Renvois côte à côte : chaque Source une seule fois, dans l'ordre de lecture.
    expect(readCitations("A [P1][P2][P3].", passages).text).toBe("A[S1][S2].");
  });

  it("partiellement invalide : [P9] retiré (8 Passages), « B. » propre, compté dans unknown", () => {
    const reading = readCitations("A [P1]. B [P9].", eight);
    expect(reading.text).toBe("A[S1]. B.");
    expect(reading.unknown).toEqual(["[P9]"]);
    expect(reading.cited).toEqual([1]);
  });

  it("mal formée seule : aucune citation valide", () => {
    const reading = readCitations("A [P1, P2].", eight);
    expect(reading.cited).toEqual([]);
    expect(reading.unknown).toEqual(["[P1, P2]"]);
  });

  it("aucun repère : aucune citation valide", () => {
    expect(readCitations("A sans repère.", eight).cited).toEqual([]);
  });

  it.each([
    ["avant un point", "A [P1]. B [P9].", "A[S1]. B."],
    ["avant une virgule", "B [P9], puis C [P1].", "B, puis C[S1]."],
    ["entre deux mots", "B [P9] puis C [P1].", "B puis C[S1]."],
    ["accolé à un mot", "B[P0] puis C [P1].", "B puis C[S1]."],
    ["après un renvoi", "A [P1] [P9].", "A[S1]."],
    ["avant un renvoi", "A [P9] [P1].", "A[S1]."],
    ["plusieurs à la suite", "A [P9] [P0][P1, P2] puis B [P1].", "A puis B[S1]."],
    ["en fin de texte", "A [P1] et B [P9]", "A[S1] et B"],
    ["en début de ligne", "A [P1].\n[P9] B suit.", "A[S1].\nB suit."],
    ["en fin de ligne", "A [P9]\nB [P1].", "A\nB[S1]."],
    ["devant deux-points (espace français gardé)", "B [P9] : C [P1].", "B : C[S1]."],
  ])("nettoyage des espaces %s", (_label, text, expected) => {
    expect(readCitations(text, eight).text).toBe(expected);
  });

  it("espaces de la mise en forme du modèle gardés hors des repères retirés", () => {
    const text = "Étapes :\n1. Émettre la facture [P1].\n2. Relancer  à J+15 [P2].\n   - détail [P1]";
    expect(readCitations(text, eight).text).toBe("Étapes :\n1. Émettre la facture[S1].\n2. Relancer  à J+15[S2].\n   - détail[S1]");
  });

  it("repères [S…] écrits par le modèle : retirés avant la réécriture, jamais pris pour un renvoi", () => {
    const reading = readCitations("A [S2] [P1]. B [S1, S3]. C [S].", eight);
    expect(reading.text).toBe("A[S1]. B. C.");
    expect(reading.unknown).toEqual([]);
    expect(reading.modelRenvoisRemoved).toBe(3);
    expect(reading.sources).toEqual([{ documentId: "doc-1", passageNumbers: [1] }]);
  });

  it("caractère nul du modèle retiré (jamais confondu avec un repère retiré)", () => {
    expect(readCitations("A\u0000 B [P1].", eight).text).toBe("A B[S1].");
  });

  it.each([
    ["[P coupé en fin de texte", "A [P1]. B [P3", "A[S1]. B", ["[P3"]],
    ["[S coupé en fin de texte", "A [P1]. B [S2", "A[S1]. B", ["[S2"]],
    ["[P non fermé avant un espace", "A [P1]. B [P3 suite.", "A[S1]. B suite.", ["[P3"]],
    ["[P non fermé avant un saut de ligne", "A [P3\nB [P1].", "A\nB[S1].", ["[P3"]],
    ["[S non fermé avant un saut de ligne", "A [S2\nB [P1].", "A\nB[S1].", ["[S2"]],
    [
      "repère plus long que la fenêtre de 40 caractères",
      "A [P1]. B [P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11].",
      "A[S1]. B.",
      ["[P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11]"],
    ],
  ])("reste de repère retiré et compté (%s)", (_label, text, expected, unknown) => {
    const reading = readCitations(text, eight);
    expect(reading.text).toBe(expected);
    expect(reading.unknown).toEqual(unknown);
    expect(reading.text).not.toMatch(/\[P|\[S\d+(?!\])/);
  });

  it("restes : « [Procédure] », « [Service] » et « [P » suivi d'une lettre laissés intacts", () => {
    expect(readCitations("Voir [Procédure], [Service] et [Pièce [P1].", eight).text).toBe("Voir [Procédure], [Service] et [Pièce[S1].");
  });

  it("espaces insécables (U+00A0, U+202F) autour d'un repère retiré ou avant un renvoi", () => {
    expect(readCitations("A [P9] puis B [P1].", eight).text).toBe("A puis B[S1].");
    expect(readCitations("B [P9] . C [P1]", eight).text).toBe("B. C[S1]");
  });

  it("texte HTML du modèle laissé tel quel (affiché en texte par la page)", () => {
    expect(readCitations("<b>A</b> [P1].", eight).text).toBe("<b>A</b>[S1].");
  });
});
