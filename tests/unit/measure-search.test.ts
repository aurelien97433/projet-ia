import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  analyzeCalibration,
  analyzeCase,
  calibrationSection,
  type CalibrationMeasure,
  loadCalibrationCases,
  loadFullContradiction,
  readDemoSet,
  sweepCalibration,
  thresholdRule,
  buildMeasureReport,
  type CaseMeasure,
  checkEmbedding,
  CONTRADICTION_MIN_SIMILARITY,
  type ContradictionCase,
  analyzeContradiction,
  contradictionSection,
  loadContradiction,
  durations,
  MeasureError,
  recommend,
  scoresFromRows,
  slowCause,
  sweep,
} from "../../scripts/measure-search";
import { type CaseOutcome, evaluateCase } from "../../scripts/test-search-live";

// npm run measure:search (story 4.2) : jamais lancé par les tests automatiques. Ici : similarités,
// balayage des seuils, règle de décision Q1 = A, analyse des durées, rapport sans donnée sensible.
const measure = (id: string, expectedTitle: string | null, scores: [string, number][], matchMs = 120): CaseMeasure => ({
  id,
  query: `requête ${id}`,
  expectedTitle,
  scores: scores.map(([title, similarity]) => ({ title, similarity })),
  matchMs,
});

// Bande sûre large : bons Documents entre 0,52 et 0,70, hors base au plus 0,28.
const comfortable = [
  measure("r1", "A", [["A", 0.7], ["B", 0.45], ["C", 0.3]]),
  measure("r2", "B", [["B", 0.52], ["A", 0.41]]),
  measure("s1", null, [["A", 0.28], ["B", 0.2]]),
  measure("s2", null, [["C", 0.22]]),
];

describe("similarités", () => {
  it("meilleur Passage par titre, copies d'un même Document fusionnées, tri décroissant", () => {
    expect(
      scoresFromRows([
        { title: "B", similarity: 0.4 },
        { title: "A", similarity: 0.6 },
        { title: "B", similarity: 0.5 },
      ]),
    ).toEqual([
      { title: "A", similarity: 0.6 },
      { title: "B", similarity: 0.5 },
    ]);
  });

  it("réponse illisible refusée", () => {
    expect(() => scoresFromRows(null)).toThrow(MeasureError);
    expect(() => scoresFromRows([{ title: "A" }])).toThrow(MeasureError);
  });

  it("analyse : similarité et rang du bon Document, meilleur hors base", () => {
    expect(analyzeCase(comfortable[1])).toMatchObject({ goodSimilarity: 0.52, goodRank: 1, bestTitle: "B" });
    expect(analyzeCase(measure("r9", "Z", [["A", 0.5]]))).toMatchObject({ goodSimilarity: null, goodRank: null });
    expect(analyzeCase(comfortable[2])).toMatchObject({ goodSimilarity: null, bestSimilarity: 0.28 });
  });
});

describe("balayage des seuils", () => {
  it("comme semantic-search : Documents au-dessus du seuil, top 3, hors base sans résultat", () => {
    const rows = sweep(comfortable);
    expect(rows.map((row) => [row.threshold, row.top3, row.outOfBaseWithResult, row.passes])).toEqual([
      [0.3, 2, 0, true],
      [0.35, 2, 0, true],
      [0.4, 2, 0, true],
      [0.45, 2, 0, true],
      [0.5, 2, 0, true],
    ]);
    const tight = sweep([measure("r1", "A", [["A", 0.42]]), measure("s1", null, [["B", 0.36]])]);
    expect(tight.find((row) => row.threshold === 0.35)).toMatchObject({ outOfBaseWithResult: 1, passes: false });
    expect(tight.find((row) => row.threshold === 0.45)).toMatchObject({ top3: 0, passes: false });
  });

  it("critère de l'epic : au moins 80 % des Requêtes pertinentes dans le top 3", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((title, index) => measure(`r${index}`, title, [[title, index < 5 ? 0.6 : 0.1]]));
    expect(sweep(six, [0.4])[0]).toMatchObject({ top3: 5, passes: true });
    const four = six.map((item, index) => (index < 4 ? item : measure(item.id, item.expectedTitle, [["x", 0.6]])));
    expect(sweep(four, [0.4])[0]).toMatchObject({ top3: 4, passes: false });
  });
});

describe("décision Q1 = A", () => {
  it("critères atteints et marges ≥ 0,05 des deux côtés : 0,40 gardé", () => {
    const analyses = comfortable.map(analyzeCase);
    expect(recommend(analyses, sweep(comfortable))).toMatchObject({ keep: true, proposed: null, lowMargin: 0.12, highMargin: 0.12 });
  });

  it("marge basse trop faible : milieu de la bande sûre proposé, non appliqué", () => {
    const data = [measure("r1", "A", [["A", 0.6]]), measure("s1", null, [["B", 0.38]])];
    expect(recommend(data.map(analyzeCase), sweep(data))).toMatchObject({ keep: false, proposed: 0.49, lowMargin: 0.02 });
  });

  it("critères non atteints à 0,40 : milieu de la bande proposé", () => {
    const data = [measure("r1", "A", [["A", 0.38]]), measure("s1", null, [["B", 0.2]])];
    expect(recommend(data.map(analyzeCase), sweep(data))).toMatchObject({ keep: false, passes: false, proposed: 0.29 });
  });

  it("aucune bande sûre : aucune valeur proposée", () => {
    const data = [measure("r1", "A", [["A", 0.45]]), measure("s1", null, [["B", 0.5]])];
    expect(recommend(data.map(analyzeCase), sweep(data))).toMatchObject({ keep: false, proposed: null });
  });
});

const outcome = (id: string, ms: number, expectedTitle: string | null = "A", titles = ["A"]): CaseOutcome =>
  evaluateCase({ id, query: `requête ${id}`, expectedTitle }, 200, titles, ms);

describe("durées", () => {
  it("premier appel, médiane, médiane à chaud, maximum, match_passages seule", () => {
    const d = durations([outcome("r1", 3542), outcome("r2", 780), outcome("r3", 653), outcome("r4", 600)], comfortable);
    expect(d).toEqual({ first: 3542, median: 653, warmMedian: 653, max: 3542, matchMedian: 120 });
  });

  it("démarrage à froid repéré, médiane sous 3 s : critère atteint, action proposée", () => {
    const text = slowCause({ first: 3542, median: 653, warmMedian: 640, max: 3542, matchMedian: 90 });
    expect(text).toContain("critère de vitesse atteint");
    expect(text).toContain("démarrage à froid probable");
    expect(text).toContain("réchauffer la Recherche");
  });

  it("médiane au-dessus de 3 s : critère non atteint, consigné", () => {
    expect(slowCause({ first: 3600, median: 3200, warmMedian: 3100, max: 3600, matchMedian: 90 })).toContain("NON atteint");
  });
});

describe("vectorisation locale", () => {
  it("même modèle, même version, même dimension que la production", () => {
    expect(() => checkEmbedding({ model: "text-embedding-3-small", version: 1, dimension: 1536 })).not.toThrow();
    expect(() => checkEmbedding({ model: "text-embedding-3-large", version: 1, dimension: 1536 })).toThrow(MeasureError);
    expect(() => checkEmbedding({ model: "text-embedding-3-small", version: 2, dimension: 1536 })).toThrow(MeasureError);
    expect(() => checkEmbedding({ model: "text-embedding-3-small", version: 1, dimension: 3072 })).toThrow(MeasureError);
  });
});

describe("rapport", () => {
  const report = buildMeasureReport({
    host: "abcdefghijklmnopqrst.supabase.co",
    embedding: { model: "text-embedding-3-small", version: 1, dimension: 1536 },
    analyses: comfortable.map(analyzeCase),
    outcomes: [outcome("r1", 3542), outcome("r2", 700, "B", ["B"]), outcome("s1", 500, null, []), outcome("s2", 520, null, [])],
    sweepRows: sweep(comfortable),
    recommendation: recommend(comfortable.map(analyzeCase), sweep(comfortable)),
    durations: durations([outcome("r1", 3542), outcome("r2", 700)], comfortable),
    date: new Date("2026-11-10T16:00:00Z"),
  });

  it("modèle vérifié, rang, similarité, hors base, balayage, durées et décision", () => {
    expect(report).toContain("text-embedding-3-small, version 1, 1536 dimensions — identique à la production");
    expect(report).toContain("| r1 | requête r1 | 0,700 | 1 | 1 | 3542 ms |");
    expect(report).toContain("| s1 | requête s1 | 0,280 | 0 | 500 ms |");
    expect(report).toContain("| 0,40 | 2/2 | 0/2 | atteints |");
    expect(report).toContain("0,40 gardé");
    expect(report).toContain("Aucune modification de la production");
    expect(report).toContain("premier appel 3542 ms");
  });

  it("aucun vecteur, secret, adresse e-mail ni jeton", () => {
    expect(report).not.toMatch(/@|sb_|eyJ|password|\[0(,|\.)/i);
  });

  it("le script n'utilise ni la clé service_role distante ni la clé OpenAI", () => {
    const source = readFileSync("scripts/measure-search.ts", "utf8");
    expect(source).not.toMatch(/OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|seed\.serviceRoleKey|config\.serviceRoleKey/);
    // La seule clé service_role lue est celle de Supabase LOCAL (supabase status), pour measure-embed.
    expect(source).toMatch(/status\.SERVICE_ROLE_KEY/);
  });
});

// Story 5.4 : la question de contradiction c1 doit retrouver ses deux Documents au-dessus de 0,42 et
// les voir transmis au modèle par chat ; sinon, la story s'arrête et les mesures sont présentées.
describe("measure:search — contradiction c1 (story 5.4)", () => {
  const c1: ContradictionCase = { id: "c1", question: "délai de première relance ?", expectedTitles: ["FAQ", "Note finance"] };
  const scores = (pairs: [string, number][]) => pairs.map(([title, similarity]) => ({ title, similarity }));

  it("lit c1 dans questions-mini.json avec les titres du mini Jeu", () => {
    const contradiction = loadContradiction();
    expect(contradiction.id).toBe("c1");
    expect(contradiction.question.length).toBeGreaterThan(0);
    expect(contradiction.expectedTitles).toEqual(["FAQ comptabilité", "Note de réunion : finance de mars"]);
  });

  it("seuil du critère : 0,40 + 0,02", () => {
    expect(CONTRADICTION_MIN_SIMILARITY).toBe(0.42);
  });

  it("deux Documents au-dessus de 0,42 et transmis : atteint", () => {
    const analysis = analyzeContradiction(c1, scores([["FAQ", 0.47], ["Guide", 0.45], ["Note finance", 0.42]]), ["FAQ", "Guide", "Note finance"]);
    expect(analysis.passes).toBe(true);
    expect(analysis.documents).toEqual([
      { title: "FAQ", similarity: 0.47, rank: 1, transmitted: true, passes: true },
      { title: "Note finance", similarity: 0.42, rank: 3, transmitted: true, passes: true },
    ]);
  });

  it("un Document entre 0,40 et 0,42 : non atteint, même s'il est transmis", () => {
    const analysis = analyzeContradiction(c1, scores([["FAQ", 0.47], ["Note finance", 0.415]]), ["FAQ", "Note finance"]);
    expect(analysis.passes).toBe(false);
    expect(analysis.documents[1]).toMatchObject({ similarity: 0.415, passes: false });
  });

  it("un Document au-dessus de 0,42 mais non transmis (8 Passages au plus) : non atteint", () => {
    const analysis = analyzeContradiction(c1, scores([["FAQ", 0.5], ["Note finance", 0.44]]), ["FAQ"]);
    expect(analysis.passes).toBe(false);
    expect(analysis.documents[1]).toMatchObject({ transmitted: false, passes: false });
  });

  it("un Document absent du classement : non atteint, similarité et rang absents", () => {
    const analysis = analyzeContradiction(c1, scores([["FAQ", 0.5]]), ["FAQ"]);
    expect(analysis.documents[1]).toEqual({ title: "Note finance", similarity: null, rank: null, transmitted: false, passes: false });
    expect(analysis.passes).toBe(false);
  });

  it("section du rapport : verdict, tableau et classement complet", () => {
    const ranking = scores([["FAQ", 0.47], ["Note finance", 0.399]]);
    const text = contradictionSection(analyzeContradiction(c1, ranking, ["FAQ"]), ranking).join("\n");
    expect(text).toContain("## Contradiction c1 (story 5.4)");
    expect(text).toContain("NON atteint");
    expect(text).toContain("| Note finance | 0,399 | 2 | non | NON |");
    expect(text).toContain("2. Note finance : 0,399");
  });
});

// Story 7.2 : calibrage sur le Jeu complet (15 Documents), règle de l'utilisateur.
describe("calibrage du Jeu complet (story 7.2)", () => {
  const set = readDemoSet();
  const cases = loadCalibrationCases(set);
  const calibration = (overrides: Record<string, [string, number][]> = {}): CalibrationMeasure[] =>
    cases.map((item) => ({
      ...item,
      scores: (overrides[item.id] ?? (item.expectedTitle ? [[item.expectedTitle, 0.6], ["Autre", 0.45]] : [["Autre", 0.3]])).map(
        ([title, similarity]) => ({ title, similarity }),
      ),
    }));

  it("q1 à q20 (q7 à sa place), h1 à h10, r1 à r10, s1 à s4 ; titres du Jeu complet ; c1 et ses deux Documents", () => {
    expect(cases.filter((c) => c.family === "q").map((c) => c.id)).toEqual(Array.from({ length: 20 }, (_, i) => `q${i + 1}`));
    expect(cases.filter((c) => c.family === "h")).toHaveLength(10);
    expect(cases.filter((c) => c.family === "r")).toHaveLength(10);
    expect(cases.filter((c) => c.family === "s").map((c) => c.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(cases.find((c) => c.id === "q17")?.expectedTitle).toBe("FAQ du support interne");
    expect(cases.find((c) => c.id === "q7")?.text).toContain("priorité 1");
    expect(loadFullContradiction(set).expectedTitles).toEqual(["FAQ comptabilité", "Note de réunion : finance de mars"]);
  });

  it("0,40 gardé : aucun attendu (q, r) sous 0,40, aucune Requête s au-dessus ; h rapportée hors règle", () => {
    const decision = thresholdRule(calibration({ h1: [["Autre", 0.47]] }).map(analyzeCalibration));
    expect(decision).toMatchObject({ keep: true, proposed: null, highMargin: 0.2, lowMargin: 0.1, questionOutMargin: -0.07 });
  });

  it("une Requête s au-dessus de 0,40 : 0,40 en place, valeur proposée (milieu de la bande)", () => {
    const decision = thresholdRule(calibration({ s2: [["Charte d'utilisation des outils informatiques", 0.44]] }).map(analyzeCalibration));
    expect(decision.keep).toBe(false);
    expect(decision.searchOutAbove.map((a) => a.id)).toEqual(["s2"]);
    expect(decision.proposed).toBe(0.52);
    expect(decision.threshold).toBe(0.4);
  });

  it("aucune bande sûre : aucune valeur proposée", () => {
    const decision = thresholdRule(calibration({ r2: [["FAQ comptabilité", 0.38]], s1: [["Autre", 0.42]] }).map(analyzeCalibration));
    expect(decision).toMatchObject({ keep: false, proposed: null });
    expect(decision.reason).toContain("aucune bande sûre");
  });

  it("Document attendu absent des Passages : compté sous le seuil", () => {
    const decision = thresholdRule(calibration({ q5: [["Autre", 0.7]] }).map(analyzeCalibration));
    expect(decision.expectedBelow.map((a) => a.id)).toEqual(["q5"]);
  });

  it("balayage : top 3 de r, attendus au-dessus, s avec résultat, h avec un Passage, règle", () => {
    const rows = sweepCalibration(calibration());
    const at = (t: number) => rows.find((row) => Math.abs(row.threshold - t) < 1e-9)!;
    expect(at(0.4)).toMatchObject({ rTop3: 10, qKept: 20, rKept: 10, sWithResult: 0, hWithPassage: 0, ruleMet: true });
    expect(at(0.3)).toMatchObject({ sWithResult: 4, hWithPassage: 10, ruleMet: false });
    expect(at(0.5)).toMatchObject({ rTop3: 10, qKept: 20 });
  });

  it("section : décision, classement complet de r2 et r3, valeur proposée présentée", () => {
    const measures = calibration({ s2: [["Charte", 0.44]] });
    const analyses = measures.map(analyzeCalibration);
    const contradiction = loadFullContradiction(set);
    const scores = contradiction.expectedTitles.map((title) => ({ title, similarity: 0.5 }));
    const text = calibrationSection({
      analyses,
      measures,
      sweepRows: sweepCalibration(measures),
      decision: thresholdRule(analyses),
      contradiction: { analysis: analyzeContradiction(contradiction, scores, contradiction.expectedTitles), scores },
    }).join("\n");
    expect(text).toContain("valeur PROPOSÉE à l'utilisateur : 0,52");
    expect(text).toContain("0,40 reste en place");
    expect(text).toContain("r2 — « remboursement des notes de frais »");
    expect(text).toContain("1. FAQ comptabilité : 0,600 ← attendu");
    expect(text).toContain("### Contradiction c1 : similarités");
    expect(text).not.toContain("story 5.4, mesures");
  });
});
