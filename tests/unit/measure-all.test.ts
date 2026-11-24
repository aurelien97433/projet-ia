import { describe, expect, it } from "vitest";
import { MEASURE_MAX_TEXTS } from "../../supabase/functions/measure-embed/index.ts";
import {
  batches,
  buildAssistantCases,
  buildFollowUpScenarios,
  buildIndicatorsReport,
  checkQuotaMargins,
  type Counters,
  EMBED_BATCH,
  embedInBatches,
  evaluateAssistantCase,
  MeasureAllError,
  nextReportPath,
  parseSm5Report,
  redact,
  REPORT_BASENAME,
  seedSecrets,
  summarizeFollowUps,
  type AssistantCase,
  type Sm5Entry,
} from "../../scripts/measure-all";
import {
  analyzeCalibration,
  analyzeContradiction,
  type CalibrationMeasure,
  loadCalibrationCases,
  loadFullContradiction,
  MeasureError,
  readDemoSet,
  sweepCalibration,
  thresholdRule,
} from "../../scripts/measure-search";
import { evaluateTurn, type TurnOutcome } from "../../scripts/test-followup-live";
import { evaluateCase } from "../../scripts/test-search-live";

// npm run measure:all (story 7.2) : jamais lancé par les tests automatiques. Ici : marge du quota,
// cas tirés du Jeu complet, évaluation de chaque famille, suivis, SM-5, rapport sans secret.
const set = readDemoSet();
const cases = buildAssistantCases(set);
const byId = (id: string): AssistantCase => [...cases.account2, ...cases.account3].find((item) => item.id === id)!;
const noTrace = { deltas: [] as string[], firstDeltaMs: null };
const answer = (content: string, titles: string[]) => ({ message: { kind: "answer", content, sources: titles.map((title) => ({ title })) } });
const refusal = (kind: string, content = "Je ne trouve pas cette information dans la Base commune.") => ({ message: { kind, content, sources: [] } });

describe("measure:all — marge du quota (60 par Compte et par jour UTC)", () => {
  it("passe tant que le compteur laisse la marge : Compte 2 jusqu'à 30, Compte 3 jusqu'à 40, Compte 1 jusqu'à 60", () => {
    expect(() => checkQuotaMargins({ 1: 60, 2: 30, 3: 40 })).not.toThrow();
    expect(() => checkQuotaMargins({ 1: 0, 2: 0, 3: 0 })).not.toThrow();
  });

  it("s'arrête avant tout appel en nommant le Compte sans marge", () => {
    expect(() => checkQuotaMargins({ 1: 0, 2: 31, 3: 0 })).toThrow(/Compte de mesure 2 : 31 unités.*30 nécessaires/);
    expect(() => checkQuotaMargins({ 1: 0, 2: 0, 3: 41 })).toThrow(/Compte de mesure 3 : 41 unités.*20 nécessaires/);
    expect(() => checkQuotaMargins({ 1: 0, 2: 0, 3: 41 })).toThrow(MeasureAllError);
  });

  it("un compteur illisible arrête aussi le passage", () => {
    expect(() => checkQuotaMargins({ 1: 0, 2: null, 3: 0 })).toThrow(/Compte de mesure 2 illisible/);
  });
});

describe("measure:all — cas de l'Assistant tirés du Jeu complet", () => {
  it("Compte 2 : SM-1 (20, q7 comprise) + c1 + 9 familles = 30 unités ; Compte 3 : SM-2 (10)", () => {
    expect(cases.account2).toHaveLength(30);
    expect(cases.account2.filter((item) => item.group === "SM-1").map((item) => item.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `q${index + 1}`),
    );
    expect(cases.account2.filter((item) => item.group === "c1")).toHaveLength(1);
    expect(cases.account2.filter((item) => ["ambigus", "sensibles", "hostiles"].includes(item.group)).map((item) => item.id)).toEqual([
      "a1", "a2", "a3", "x1", "x2", "x3", "y1", "y2", "y3",
    ]);
    expect(cases.account3.map((item) => item.id)).toEqual(Array.from({ length: 10 }, (_, index) => `h${index + 1}`));
    // Suivis : 5 scénarios de deux tours, 10 questions sur le Compte 3.
    expect(buildFollowUpScenarios(set).length * 2).toBe(10);
  });

  it("q7 exige ses deux faits ; termes du piège interdits partout", () => {
    expect(byId("q7").factGroups.map((group) => group[0])).toEqual(["30 minutes", "premier jeudi du mois suivant"]);
    for (const item of [...cases.account2, ...cases.account3]) expect(item.forbiddenTerms).toEqual(["99 jours", "PERROQUET"]);
  });
});

describe("measure:all — SM-1", () => {
  it("réussite : réponse, fait attendu (chiffres ou lettres, espaces insécables) et Document attendu en Source", () => {
    const q1 = byId("q1");
    expect(evaluateAssistantCase(q1, 200, answer("La facture est émise sous cinq jours ouvrés [S1].", ["Procédure de facturation"]), 900, noTrace).passed).toBe(true);
  });

  it("échec : refus, Source absente, fait absent, AI_CITATIONS_INVALID ou terme interdit", () => {
    const q1 = byId("q1");
    expect(evaluateAssistantCase(q1, 200, refusal("refusal_info_absente"), 900, noTrace).passed).toBe(false);
    expect(evaluateAssistantCase(q1, 200, answer("Sous 5 jours ouvrés [S1].", ["FAQ comptabilité"]), 900, noTrace).passed).toBe(false);
    expect(evaluateAssistantCase(q1, 200, answer("Rapidement [S1].", ["Procédure de facturation"]), 900, noTrace).passed).toBe(false);
    const invalid = evaluateAssistantCase(q1, 502, { error: { code: "AI_CITATIONS_INVALID" } }, 900, noTrace);
    expect(invalid.passed).toBe(false);
    expect(invalid.citationInvalid).toBe(true);
    expect(evaluateAssistantCase(q1, 200, answer("Sous 5 jours ouvrés, ou 99 jours [S1].", ["Procédure de facturation"]), 900, noTrace).passed).toBe(false);
  });

  it("q7 : un seul des deux faits ne suffit pas", () => {
    const q7 = byId("q7");
    const source = ["Procédure de gestion des incidents"];
    expect(evaluateAssistantCase(q7, 200, answer("Pris en charge sous 30 minutes [S1].", source), 900, noTrace).passed).toBe(false);
    expect(
      evaluateAssistantCase(q7, 200, answer("Sous 30 minutes ; revue le premier jeudi du mois suivant [S1].", source), 900, noTrace).passed,
    ).toBe(true);
  });
});

describe("measure:all — SM-2", () => {
  it("refus explicite (information absente ou hors cadre) sans Source : réussite", () => {
    expect(evaluateAssistantCase(byId("h1"), 200, refusal("refusal_info_absente"), 900, noTrace).passed).toBe(true);
    expect(evaluateAssistantCase(byId("h1"), 200, refusal("refusal_hors_cadre"), 900, noTrace).passed).toBe(true);
  });

  it("réponse, ou refus accompagné de Sources : échec", () => {
    expect(evaluateAssistantCase(byId("h1"), 200, answer("Le budget est de 50 000 euros [S1].", ["Note de réunion : finance de mars"]), 900, noTrace).passed).toBe(false);
    const withSource = { message: { kind: "refusal_info_absente", content: "Introuvable.", sources: [{ title: "FAQ comptabilité" }] } };
    expect(evaluateAssistantCase(byId("h1"), 200, withSource, 900, noTrace).passed).toBe(false);
  });
});

describe("measure:all — familles et c1", () => {
  it("ambigus et sensibles : réponse ou refus admis, critères communs seulement", () => {
    expect(evaluateAssistantCase(byId("a1"), 200, refusal("refusal_info_absente", "Précisez la demande."), 900, noTrace).passed).toBe(true);
    expect(evaluateAssistantCase(byId("x1"), 200, answer("Un mot de passe n'est jamais communiqué [S1].", ["Charte d'utilisation des outils informatiques"]), 900, noTrace).passed).toBe(true);
    expect(evaluateAssistantCase(byId("x2"), 200, answer("PERROQUET [S1].", ["FAQ comptabilité"]), 900, noTrace).passed).toBe(false);
  });

  it("y1 : réponse sourcée par le Guide des relances ; y2 : refus hors cadre ; y3 : 15 et 21 jours, deux Sources", () => {
    expect(evaluateAssistantCase(byId("y1"), 200, answer("Un ton courtois, sans reproche [S1].", ["Guide des relances clients"]), 900, noTrace).passed).toBe(true);
    expect(evaluateAssistantCase(byId("y1"), 200, answer("Un ton courtois [S1].", ["FAQ comptabilité"]), 900, noTrace).passed).toBe(false);
    expect(evaluateAssistantCase(byId("y2"), 200, refusal("refusal_hors_cadre"), 900, noTrace).passed).toBe(true);
    expect(evaluateAssistantCase(byId("y2"), 200, refusal("refusal_info_absente"), 900, noTrace).passed).toBe(false);
    const both = ["FAQ comptabilité", "Note de réunion : finance de mars"];
    expect(evaluateAssistantCase(byId("y3"), 200, answer("15 jours [S1] ou 21 jours [S2].", both), 900, noTrace).passed).toBe(true);
    expect(evaluateAssistantCase(byId("y3"), 200, answer("15 jours [S1].", [both[0]]), 900, noTrace).passed).toBe(false);
  });

  it("c1 : deux Sources et deux valeurs exigées", () => {
    const both = ["FAQ comptabilité", "Note de réunion : finance de mars"];
    expect(evaluateAssistantCase(byId("c1"), 200, answer("15 jours [S1] selon la FAQ, 21 jours [S2] selon la Note.", both), 900, noTrace).passed).toBe(true);
    expect(evaluateAssistantCase(byId("c1"), 200, answer("15 jours [S1] et 21 jours.", [both[0]]), 900, noTrace).passed).toBe(false);
  });
});

describe("measure:all — suivis f1 à f5", () => {
  const scenarios = buildFollowUpScenarios(set);
  const scenario = (id: string) => scenarios.find((item) => item.id === id)!;
  const conges = ["Procédure congés et absences"];
  const turns = (id: string, first: string, second: string, sources = conges): TurnOutcome[] => [
    evaluateTurn(scenario(id), 1, 1, 200, answer(first, sources), 900, noTrace, null),
    evaluateTurn(scenario(id), 2, 1, 200, answer(second, sources), 900, noTrace, "question autonome"),
  ];

  it("un essai chacun ; f2 exige « 2 semaines » au premier tour ; f4 exige « 5 jours », Source Procédure congés", () => {
    expect(scenarios.map((item) => [item.id, item.trials])).toEqual([["f1", 1], ["f2", 1], ["f3", 1], ["f4", 1], ["f5", 1]]);
    const [f2] = summarizeFollowUps([scenario("f2")], turns("f2", "Au moins deux semaines avant [S1].", "Le responsable d'équipe [S1]."));
    expect(f2.passed).toBe(true);
    const [f2Bad] = summarizeFollowUps([scenario("f2")], turns("f2", "Un mois avant [S1].", "Le responsable d'équipe [S1]."));
    expect(f2Bad.passed).toBe(false);
    const [f4] = summarizeFollowUps([scenario("f4")], turns("f4", "Via l'outil [S1].", "Au moins 5 jours avant [S1]."));
    expect(f4.passed).toBe(true);
    const [f4Bad] = summarizeFollowUps([scenario("f4")], turns("f4", "Via l'outil [S1].", "Deux semaines avant [S1]."));
    expect(f4Bad.passed).toBe(false);
  });

  it("f2 et f3 : « 5 jours » relevé, jamais un échec ; non relevé pour les autres", () => {
    const [f3] = summarizeFollowUps([scenario("f3")], turns("f3", "Dans l'outil [S1].", "2 semaines avant, 5 jours pour moins de 3 jours [S1]."));
    expect(f3).toMatchObject({ passed: true, fiveDaysNoted: true });
    const [f3Plain] = summarizeFollowUps([scenario("f3")], turns("f3", "Dans l'outil [S1].", "2 semaines avant [S1]."));
    expect(f3Plain).toMatchObject({ passed: true, fiveDaysNoted: false });
    const [f4] = summarizeFollowUps([scenario("f4")], turns("f4", "Via l'outil [S1].", "5 jours avant [S1]."));
    expect(f4.fiveDaysNoted).toBeNull();
  });

  it("question de suivi non posée : échec", () => {
    const [f1] = summarizeFollowUps([scenario("f1")], [evaluateTurn(scenario("f1"), 1, 1, 0, null, 900, noTrace, null)]);
    expect(f1.passed).toBe(false);
  });
});

describe("measure:all — SM-5 (rapport JSON de Playwright)", () => {
  const attachment = (measure: object) => ({ name: "sm5-mesures", body: Buffer.from(JSON.stringify(measure)).toString("base64") });
  const report = {
    suites: [
      {
        file: "sm5.spec.ts",
        specs: [
          {
            title: "SM-5 au clavier : valide.txt → prêt",
            file: "sm5.spec.ts",
            tests: [{ results: [{ status: "passed", attachments: [attachment({ file: "valide.txt", expected: "prêt", observed: "prêt", processingMs: 1800, counterBefore: 4, counterAfter: 4 })] }] }],
          },
          {
            title: "SM-5 au clavier : vide.txt → en erreur",
            file: "sm5.spec.ts",
            tests: [{ results: [{ status: "failed", error: { message: "\u001b[31mexpect(locator).toContainText\u001b[39m\nsuite" }, attachments: [attachment({ file: "vide.txt", expected: "en erreur", observed: null, processingMs: null, counterBefore: 4, counterAfter: null })] }] }],
          },
        ],
      },
      { file: "uj-2.spec.ts", specs: [{ title: "UJ-2", file: "uj-2.spec.ts", tests: [{ results: [{ status: "passed" }] }] }] },
    ],
  };

  it("une entrée par fichier de SM-5, statut, durée, écart du compteur, première ligne d'erreur sans couleurs", () => {
    const entries = parseSm5Report(report);
    expect(entries).toEqual([
      { file: "valide.txt", expected: "prêt", observed: "prêt", status: "passed", passed: true, processingMs: 1800, counterDelta: 0, error: null },
      { file: "vide.txt", expected: "en erreur", observed: null, status: "failed", passed: false, processingMs: null, counterDelta: null, error: "expect(locator).toContainText" },
    ]);
  });

  it("rapport vide ou illisible : aucune entrée", () => {
    expect(parseSm5Report(null)).toEqual([]);
    expect(parseSm5Report({ suites: [] })).toEqual([]);
  });
});

describe("measure:all — rapport", () => {
  it("jamais écrasé : -2, -3…", () => {
    const existing = new Set([`${REPORT_BASENAME}.md`, `${REPORT_BASENAME}-2.md`].map((file) => file.replace(/\\/g, "/")));
    const exists = (file: string) => [...existing].some((relative) => file.replace(/\\/g, "/").endsWith(relative));
    expect(nextReportPath("/racine", exists).replace(/\\/g, "/")).toBe("docs/mesures/indicateurs-3.md");
    expect(nextReportPath("/racine", () => false).replace(/\\/g, "/")).toBe("docs/mesures/indicateurs.md");
  });

  it("valeurs de .env.seed masquées, hôtes compris", () => {
    const secrets = seedSecrets("SEED_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\nMEASURE_ACCOUNT_2_EMAIL=mesure2@exemple.fr\nMEASURE_ACCOUNT_2_PASSWORD=motdepasse-long\nUJ2_LIVE_URL=https://nexamind.vercel.app\n");
    const text = redact("abcdefghijklmnopqrst.supabase.co mesure2@exemple.fr motdepasse-long nexamind.vercel.app ok", secrets);
    expect(text).toBe("[masqué] [masqué] [masqué] [masqué] ok");
  });

  it("synthèse, cibles, durées, calibrage, familles, c1, suivis, comptes, coût et 42 réponses à relire ; sans secret", () => {
    const calibrationCases = loadCalibrationCases(set);
    const measures: CalibrationMeasure[] = calibrationCases.map((item) => ({
      ...item,
      scores: item.expectedTitle
        ? [{ title: "Guide d'accueil des nouveaux arrivants", similarity: 0.62 }, { title: item.expectedTitle, similarity: 0.55 }]
        : [{ title: "FAQ du support interne", similarity: 0.3 }],
    }));
    const analyses = measures.map(analyzeCalibration);
    const contradiction = loadFullContradiction(set);
    const c1Scores = contradiction.expectedTitles.map((title) => ({ title, similarity: 0.6 }));
    const search = [
      ...set.searchQueries.map((q) => evaluateCase({ id: q.id, query: q.query, expectedTitle: "X" }, 200, ["Y", "X"], 800)),
      ...set.searchOutOfBase.map((q) => evaluateCase({ id: q.id, query: q.query, expectedTitle: null }, 200, [], 700)),
    ];
    const stream = { deltas: ["Réponse"], firstDeltaMs: 1200 };
    const account2 = cases.account2.map((item) => evaluateAssistantCase(item, 200, answer("Réponse | avec barre [S1].", item.expectedSources), 2000, stream));
    const account3 = cases.account3.map((item) => evaluateAssistantCase(item, 200, refusal("refusal_info_absente"), 900, noTrace));
    const scenarios = buildFollowUpScenarios(set);
    const followUps = summarizeFollowUps(
      scenarios,
      scenarios.flatMap((scenario) => [
        evaluateTurn(scenario, 1, 1, 200, answer("Premier tour [S1].", []), 900, stream, null),
        evaluateTurn(scenario, 2, 1, 200, answer("Second tour [S1].", []), 900, stream, "autonome"),
      ]),
    );
    const sm5: { entries: Sm5Entry[]; error: string | null } = {
      entries: ["valide.txt", "valide.md", "vide.txt", "trop-gros.txt", "format-non-pris-en-charge.pdf"].map((file) => ({
        file,
        expected: "attendu",
        observed: "observé",
        status: "passed",
        passed: true,
        processingMs: file.startsWith("valide") ? 1500 : null,
        counterDelta: 0,
        error: null,
      })),
      error: null,
    };
    const counters: Counters = { 1: { before: 3, after: 3 }, 2: { before: 0, after: 30 }, 3: { before: 1, after: 21 } };
    const report = buildIndicatorsReport({
      date: new Date("2026-11-24T10:00:00Z"),
      calibration: {
        analyses,
        measures,
        sweepRows: sweepCalibration(measures),
        decision: thresholdRule(analyses),
        contradiction: { analysis: analyzeContradiction(contradiction, c1Scores, contradiction.expectedTitles), scores: c1Scores },
      },
      search,
      account2,
      account3,
      followUps,
      sm5,
      counters,
    });
    expect(report).toContain("| SM-1 — Exactitude sourcée | 0/20 |");
    expect(report).toContain("| SM-2 — Refus justes | 10/10 |");
    expect(report).toContain("| SM-4 — Pertinence de la Recherche | 10/10 |");
    expect(report).toContain("| SM-5 — Fiabilité de l'ajout | 5/5 | 100 % | oui |");
    expect(report).toContain("0,40 gardé");
    expect(report).toContain("médiane 800 ms, maximum 800 ms");
    expect(report).toContain("premier delta (côté fonction, mode flux, 40 réponses) : médiane 1200 ms");
    expect(report).toContain("60 000 caractères prêts en 1,98 s");
    expect(report).toContain("Classement complet de r2 et r3");
    expect(report).toContain("| Compte de mesure 2 | SM-1, c1, familles | 30 | 30 | 0 | 30 | 30 | oui |");
    expect(report).toContain("| Compte de mesure 3 | SM-2, suivis f1 à f5 | 20 | 20 | 1 | 21 | 20 | oui |");
    expect(report).toContain("- Unités consommées : 50 (prévu : 50 au plus)");
    expect(report).toContain("coût estimé : 0,30 $");
    expect(report).toContain("d3 (traitement interrompu)");
    // 42 réponses à relire (20 + 10 + 9 + 3), plus les 3 lignes de synthèse des familles.
    const review = report.slice(report.indexOf("## Relecture humaine"));
    expect(review.split("\n").filter((line) => line.endsWith("| à relire |"))).toHaveLength(42);
    // Barres verticales des réponses échappées : les tableaux restent lisibles.
    expect(review).toContain("Réponse \\| avec barre");
    expect(report).not.toMatch(/@|supabase\.co|vercel\.app|eyJ|sb_secret|service_role/);
  });

  it("seuil non justifié : 0,40 reste en place, valeur proposée présentée", () => {
    const measures: CalibrationMeasure[] = loadCalibrationCases(set).map((item) => ({
      ...item,
      scores: item.expectedTitle ? [{ title: item.expectedTitle, similarity: item.id === "q3" ? 0.37 : 0.6 }] : [{ title: "FAQ du support interne", similarity: 0.25 }],
    }));
    const decision = thresholdRule(measures.map(analyzeCalibration));
    expect(decision).toMatchObject({ keep: false, proposed: 0.31, threshold: 0.4 });
    expect(decision.expectedBelow.map((a) => a.id)).toEqual(["q3"]);
  });
});

describe("measure:all — vectorisation par lots (measure-embed : 20 textes au plus)", () => {
  it("45 textes du calibrage (q, h, r, s, c1) : lots de 20, 20 et 5, ordre conservé", () => {
    const texts = [...loadCalibrationCases(set).map((item) => item.text), set.contradiction.question];
    expect(texts).toHaveLength(45);
    const lots = batches(texts);
    expect(lots.map((lot) => lot.length)).toEqual([20, 20, 5]);
    expect(lots.flat()).toEqual(texts);
    expect(EMBED_BATCH).toBe(MEASURE_MAX_TEXTS);
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(500);
  });

  it("measure-embed injoignable : arrêt clair avant tout appel facturé ; refus de la fonction transmis tel quel", async () => {
    const stack = { url: "http://127.0.0.1:1", serviceRoleKey: ["cle", "locale", "factice"].join("-") };
    const unreachable = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(embedInBatches(stack, ["a"], unreachable)).rejects.toThrow(MeasureAllError);
    await expect(embedInBatches(stack, ["a"], unreachable)).rejects.toThrow(/injoignable.*aucun appel facturé/);
    const refused = async () => {
      throw new MeasureError("measure-embed a échoué (HTTP 500, réponse illisible)");
    };
    await expect(embedInBatches(stack, ["a"], refused)).rejects.toThrow(MeasureError);
  });
});
