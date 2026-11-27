import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classify,
  compareReports,
  nextComparisonPath,
  parseContradiction,
  parseReviewRows,
  renderComparison,
  splitRow,
} from "../../scripts/compare-campaigns";

// Comparaison de deux campagnes measure:all (séquence 13) : sans réseau ni coût.
const root = path.resolve(import.meta.dirname, "..", "..");
const reference = readFileSync(path.join(root, "docs", "mesures", "indicateurs.md"), "utf8");

describe("measure:compare", () => {
  it("lit les 42 réponses relues de la campagne de référence (20 SM-1, 10 SM-2, 9 familles, 3 suivis) et c1", () => {
    const rows = parseReviewRows(reference);
    expect(rows.size).toBe(42);
    expect([...rows.keys()].filter((id) => /^q\d+$/.test(id))).toHaveLength(20);
    expect([...rows.keys()].filter((id) => /^h\d+$/.test(id))).toHaveLength(10);
    expect(rows.get("q1")?.review).toMatch(/conforme/);
    const c1 = parseContradiction(reference);
    expect(c1?.sources).toContain("FAQ comptabilité");
    expect(c1?.answer).toContain("ne concordent pas");
  });

  it("une campagne comparée à elle-même : rien à relire", () => {
    expect(compareReports(reference, reference).filter((change) => change.kind !== "inchangée")).toEqual([]);
  });

  it("apostrophes typographiques, casse et espaces ne comptent pas comme un changement", () => {
    const row = { id: "q1", question: "", expected: "", issue: "answer", answer: "Dans l’heure, VALIDÉE.", sources: "A", review: "" };
    expect(classify(row, { ...row, answer: "dans l'heure,   validée." })).toBe("inchangée");
  });

  it("texte, issue ou Sources différents : réponse à relire, relecture de référence affichée à côté", () => {
    const row = { id: "q1", question: "", expected: "", issue: "answer", answer: "5 jours ouvrés.", sources: "A", review: "conforme" };
    expect(classify(row, { ...row, answer: "Sous 5 jours." })).toBe("texte");
    expect(classify(row, { ...row, issue: "refusal_info_absente" })).toBe("issue ou Sources");
    expect(classify(row, { ...row, sources: "B" })).toBe("issue ou Sources");
    expect(classify(row, null)).toBe("absente");

    const modified = reference.replace(
      "Une facture doit être émise dans un délai de 5 jours ouvrés",
      "Une facture part sous 5 jours ouvrés",
    );
    const report = renderComparison({ beforeName: "a", afterName: "b", before: reference, after: modified });
    expect(report).toContain("**à relire : 1**");
    expect(report).toMatch(/^\| q1 \| texte \|.*\| conforme.*\| à relire \|$/m);
  });

  it("suivis : un changement du tour 1 seul (cas de la story 7.2b) est détecté", () => {
    const row = { id: "f2", question: "1. Q → 2 semaines. Les Documents ne concordent pas.", expected: "", issue: "answer", answer: "Le responsable.", sources: "A", review: "" };
    expect(classify(row, { ...row, question: "1. Q → 2 semaines." })).toBe("texte");
  });

  it("cellules : les « \\| » restent dans la cellule", () => {
    expect(splitRow("| a | b \\| c | d |")).toEqual(["a", "b | c", "d"]);
  });

  it("rapport jamais écrasé : -2, -3…", () => {
    const taken = new Set([path.join(root, "docs", "mesures", "comparaison-campagnes.md")]);
    expect(nextComparisonPath(root, (file) => taken.has(file))).toBe(path.join("docs", "mesures", "comparaison-campagnes-2.md"));
  });
});
