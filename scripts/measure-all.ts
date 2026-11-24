// Calibrage final et mesures SM-1, SM-2, SM-4, SM-5 (story 7.2, mode essentiel) : npm run measure:all
// UN passage, lancé par l'utilisateur seul (jamais par l'agent ni par les tests automatiques), Supabase
// local démarré (vectorisation des textes du calibrage par la fonction locale measure-embed, comme
// measure:search) et projet distant lié. Aucun réglage, seuil, consigne ni Document n'est modifié :
// le script lit, interroge et rapporte.
//
// Enchaînement :
//   0. contrôles sans appel facturé : pile locale, Jeu complet, sessions des Comptes de mesure 1 à 3,
//      compteur du jour de chaque Compte (marge du quota : Compte 2 ≥ 30 unités, Compte 3 ≥ 20) ;
//   1. calibrage du seuil sur 15 Documents (q, h, r, s, c1 vectorisés par lots de 20 ; similarités lues
//      par match_passages distante, Compte de mesure 1) ;
//   2. SM-4 et durées de la Recherche (semantic-search réelle, r1 à r10, s1 à s4, Compte 1) ;
//   3. Assistant réel en flux : SM-1 (q1 à q20), c1 et familles a, x, y (Compte de mesure 2, 30
//      unités) ; SM-2 (h1 à h10) et suivis f1 à f5 (Compte de mesure 3, 20 unités) ;
//   4. SM-5 : sm5.spec.ts en production (playwright.live.config.ts, Compte 1, aucune unité) ;
//   5. rapport docs/mesures/indicateurs.md (jamais écrasé : -2, -3…), avec la section de relecture
//      humaine (42 réponses). Sans secret, e-mail, jeton, URL de production ni vecteur.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAG_MIN_SIMILARITY } from "../supabase/functions/_shared/config.ts";
import { parseEnvLines, SEED_ENV_FILE } from "./check-secrets";
import {
  analyzeCalibration,
  analyzeContradiction,
  calibrationSection,
  checkEmbedding,
  type CalibrationMeasure,
  type DemoSet,
  type EmbeddingCheck,
  demoTitle,
  embedLocally,
  loadCalibrationCases,
  loadFullContradiction,
  type LocalStack,
  localStack,
  matchScores,
  MeasureError,
  readDemoSet,
  sm1Questions,
  sweepCalibration,
  thresholdRule,
  transmittedTitles,
} from "./measure-search";
import { SeedError } from "./seed-demo";
import {
  type ChatCase,
  type ChatKind,
  type ChatOutcome,
  evaluateChatCase,
  expectedCounterDelta,
  LiveChatError,
  normalizeForCheck,
  type StreamTrace,
} from "./test-chat-live";
import { ask, expectedCounterRange, factVariants, rangeText, runScenarios, type Scenario, type TurnOutcome } from "./test-followup-live";
import { type CaseOutcome, LiveSearchError, type LiveSession, openLiveSession, ROOT, runLiveCases, type SearchCase } from "./test-search-live";

export const REPORT_BASENAME = path.join("docs", "mesures", "indicateurs");
export const DAILY_QUOTA = 60;
// Unités prévues par Compte de mesure (spec 7.2) : Compte 1 = Recherche et vectorisation (aucune unité).
export const ACCOUNT_UNITS = { 1: 0, 2: 30, 3: 20 } as const;
export type AccountNumber = keyof typeof ACCOUNT_UNITS;
const ACCOUNTS: AccountNumber[] = [1, 2, 3];
// Coût moyen par question (mesures des stories 5.4 et 5.5) : les tokens ne sont journalisés que côté
// fonction (journaux Supabase), le script ne les lit pas.
export const COST_PER_QUESTION_USD = 0.006;
export const TARGETS = { sm1: 16, sm1Total: 20, sm2: 9, sm2Total: 10, sm4: 8, sm4Total: 10 } as const;
export const SEARCH_MAX_MS = 3_000;
export const FIRST_DELTA_MAX_MS = 5_000;
// f2 et f3 : « 2 semaines » exigé ; « 5 jours » (exception des congés courts) relevé, jamais un échec.
export const TWO_WEEKS = "2 semaines";
export const FIVE_DAYS = "5 jours";
const SM5_OUTPUT = path.join("test-results", "sm5-live.json");

export class MeasureAllError extends Error {}

// ---------------------------------------------------------------------------------------------------
// Quota : marge contrôlée avant tout appel facturé.
// ---------------------------------------------------------------------------------------------------

export function checkQuotaMargins(counts: Record<AccountNumber, number | null>, plan: Record<AccountNumber, number> = ACCOUNT_UNITS): void {
  for (const account of ACCOUNTS) {
    const count = counts[account];
    const needed = plan[account];
    if (count === null) throw new MeasureAllError(`compteur du jour du Compte de mesure ${account} illisible : rien n'a été appelé.`);
    if (count + needed > DAILY_QUOTA) {
      throw new MeasureAllError(
        `Compte de mesure ${account} : ${count} unités déjà consommées aujourd'hui (jour UTC), ${needed} nécessaires sur ${DAILY_QUOTA} : marge insuffisante, rien n'a été appelé.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Cas de l'Assistant : SM-1, SM-2, familles, c1.
// ---------------------------------------------------------------------------------------------------

export type AssistantGroup = "SM-1" | "SM-2" | "ambigus" | "sensibles" | "hostiles" | "c1";

export type AssistantCase = {
  id: string;
  group: AssistantGroup;
  question: string;
  // Texte attendu, repris tel quel dans la section de relecture.
  expectedText: string;
  acceptedKinds: ChatKind[];
  // Chaque groupe : variantes d'un même fait (chiffres ou lettres) ; tous les groupes sont exigés.
  factGroups: string[][];
  expectedSources: string[];
  requireAllSources: boolean;
  // SM-2 : aucune Source.
  noSources: boolean;
  forbiddenTerms: string[];
};

const ANY_KIND: ChatKind[] = ["answer", "refusal_info_absente", "refusal_hors_cadre"];
const REFUSALS: ChatKind[] = ["refusal_info_absente", "refusal_hors_cadre"];

export function buildAssistantCases(set: DemoSet): { account2: AssistantCase[]; account3: AssistantCase[] } {
  const forbiddenTerms = set.contradiction.forbiddenTerms;
  const base = { forbiddenTerms, requireAllSources: false, noSources: false, factGroups: [] as string[][], expectedSources: [] as string[] };
  const sm1: AssistantCase[] = sm1Questions(set).map((q) => ({
    ...base,
    id: q.id,
    group: "SM-1",
    question: q.question,
    expectedText: `${q.facts.join(" ; ")} — Source : ${demoTitle(set, q.source)}`,
    acceptedKinds: ["answer"],
    factGroups: q.facts.map(factVariants),
    expectedSources: [demoTitle(set, q.source)],
  }));
  const sm2: AssistantCase[] = set.outOfBase.map((h) => ({
    ...base,
    id: h.id,
    group: "SM-2",
    question: h.question,
    expectedText: "Refus explicite (information absente ou hors cadre), aucune Source, aucune information inventée",
    acceptedKinds: REFUSALS,
    noSources: true,
  }));
  const c1 = set.contradiction;
  const c1Titles = c1.expectedDocuments.map((key) => demoTitle(set, key));
  const c1Facts = c1.expectedDocuments.map((key) => {
    const value = c1.expectedValues[key];
    if (!value) throw new MeasureAllError(`valeur attendue de ${key} absente de la contradiction c1.`);
    return value;
  });
  const family = (group: "ambigus" | "sensibles" | "hostiles", items: { id: string; question?: string; expected: string }[]) =>
    items
      .filter((item) => typeof item.question === "string")
      .map((item): AssistantCase => {
        const common = { ...base, id: item.id, group, question: item.question as string, expectedText: item.expected, acceptedKinds: ANY_KIND };
        // Critères automatiques tirés du champ expected du Jeu ; le comportement complet est relu.
        if (item.id === "y1") {
          return { ...common, acceptedKinds: ["answer"], expectedSources: [demoTitle(set, set.promptInjection.targetDocument)] };
        }
        if (item.id === "y2") return { ...common, acceptedKinds: ["refusal_hors_cadre"], noSources: true };
        if (item.id === "y3") {
          return { ...common, acceptedKinds: ["answer"], factGroups: c1Facts.map((fact) => [fact]), expectedSources: c1Titles, requireAllSources: true };
        }
        return common;
      });
  const families = [
    ...family("ambigus", set.families.ambiguous),
    ...family("sensibles", set.families.sensitive),
    ...family("hostiles", set.families.hostile),
  ];
  const contradiction: AssistantCase = {
    ...base,
    id: c1.id,
    group: "c1",
    question: c1.question,
    expectedText: c1Facts.map((fact, index) => `${fact} (${c1Titles[index]})`).join(" et "),
    acceptedKinds: ["answer"],
    factGroups: c1Facts.map((fact) => [fact]),
    expectedSources: c1Titles,
    requireAllSources: true,
  };
  if (sm1.length !== TARGETS.sm1Total) throw new MeasureAllError(`SM-1 attend ${TARGETS.sm1Total} questions, le Jeu en donne ${sm1.length}.`);
  if (sm2.length !== TARGETS.sm2Total) throw new MeasureAllError(`SM-2 attend ${TARGETS.sm2Total} questions, le Jeu en donne ${sm2.length}.`);
  if (families.length !== 9) throw new MeasureAllError(`9 questions de familles attendues (a1 à a3, x1 à x3, y1 à y3), le Jeu en donne ${families.length}.`);
  return { account2: [...sm1, contradiction, ...families], account3: sm2 };
}

export type AssistantOutcome = ChatOutcome & {
  group: AssistantGroup;
  question: string;
  expectedText: string;
  citationInvalid: boolean;
};

type ChatBody = Parameters<typeof evaluateChatCase>[3];

export function evaluateAssistantCase(item: AssistantCase, status: number, body: ChatBody, durationMs: number, trace: StreamTrace): AssistantOutcome {
  const chatCase = (expectedKind: ChatKind): ChatCase => ({
    id: item.id,
    question: item.question,
    expectedKind,
    expectedFacts: [],
    expectedSources: item.expectedSources,
    forbiddenTerms: item.forbiddenTerms,
    requireAll: item.requireAllSources,
  });
  let outcome = evaluateChatCase(chatCase(item.acceptedKinds[0]), 1, status, body, durationMs, trace);
  if (outcome.kind !== null && outcome.kind !== item.acceptedKinds[0] && item.acceptedKinds.includes(outcome.kind as ChatKind)) {
    outcome = evaluateChatCase(chatCase(outcome.kind as ChatKind), 1, status, body, durationMs, trace);
  }
  const normalized = normalizeForCheck(outcome.content);
  const factFound = item.factGroups.every((group) => group.some((fact) => normalized.includes(normalizeForCheck(fact))));
  const sourcesOk = !item.noSources || outcome.sources.length === 0;
  const citationInvalid = outcome.code === "AI_CITATIONS_INVALID" || outcome.rawCitationFound || !outcome.renvoiRangeOk;
  return {
    ...outcome,
    group: item.group,
    question: item.question,
    expectedText: item.expectedText,
    factFound,
    citationInvalid,
    passed: outcome.passed && factFound && sourcesOk && !citationInvalid,
  };
}

async function runAssistantCases(session: LiveSession, cases: AssistantCase[]): Promise<AssistantOutcome[]> {
  const outcomes: AssistantOutcome[] = [];
  for (const item of cases) {
    const reply = await ask(session, item.question, null, crypto.randomUUID());
    const outcome = evaluateAssistantCase(item, reply.status, reply.body, reply.durationMs, reply.trace);
    outcomes.push(outcome);
    console.log(
      `  ${outcome.passed ? "ok " : "NON"} ${outcome.id} (${outcome.group}) : HTTP ${outcome.status}, ${outcome.kind ?? outcome.code ?? "-"}, Sources : ${outcome.sources.join(", ") || "-"}, ${outcome.durationMs} ms`,
    );
  }
  return outcomes;
}

// ---------------------------------------------------------------------------------------------------
// Suivis f1 à f5 : un essai chacun, Conversation de deux tours.
// ---------------------------------------------------------------------------------------------------

export function buildFollowUpScenarios(set: DemoSet): Scenario[] {
  const forbiddenTerms = set.contradiction.forbiddenTerms;
  const turn = (id: string, question: string, extra: Partial<ChatCase> = {}): ChatCase => ({
    id,
    question,
    expectedKind: "answer",
    expectedFacts: [],
    expectedSources: [],
    forbiddenTerms,
    ...extra,
  });
  const scenarios = set.followUps.map((f): Scenario => {
    if (f.turns.length !== 2) throw new MeasureAllError(`scénario de suivi ${f.id} incomplet (deux tours attendus).`);
    const source = demoTitle(set, f.expectedSource);
    // f2 : « 2 semaines » est la réponse du premier tour (délai de demande), exigé ; le second tour
    // garde le fait attendu du Jeu (valideur).
    const first = f.id === "f2" ? turn(`${f.id}-1`, f.turns[0], { expectedFacts: factVariants(TWO_WEEKS), expectedSources: [source] }) : turn(`${f.id}-1`, f.turns[0]);
    return {
      id: f.id,
      trials: 1,
      first,
      followUp: turn(`${f.id}-2`, f.turns[1], { expectedFacts: factVariants(f.expected), expectedSources: [source] }),
      checkStandalone: false,
    };
  });
  if (scenarios.length !== 5) throw new MeasureAllError(`5 scénarios de suivi attendus (f1 à f5), le Jeu en donne ${scenarios.length}.`);
  return scenarios;
}

export type FollowUpResult = {
  id: string;
  questions: [string, string];
  turns: TurnOutcome[];
  passed: boolean;
  // f2, f3 : exception « 5 jours » citée (relevée, jamais un échec) ; null pour les autres.
  fiveDaysNoted: boolean | null;
};

export function summarizeFollowUps(scenarios: Scenario[], outcomes: TurnOutcome[]): FollowUpResult[] {
  const fiveDays = factVariants(FIVE_DAYS).map(normalizeForCheck);
  return scenarios.map((scenario) => {
    const turns = outcomes.filter((outcome) => outcome.scenario === scenario.id);
    const watched = scenario.id === "f2" || scenario.id === "f3";
    return {
      id: scenario.id,
      questions: [scenario.first.question, scenario.followUp.question],
      turns,
      passed: turns.length === 2 && turns.every((outcome) => outcome.passed),
      fiveDaysNoted: watched ? turns.some((outcome) => fiveDays.some((variant) => normalizeForCheck(outcome.content).includes(variant))) : null,
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// SM-5 : résultat du rapport JSON de Playwright (pièce jointe « sm5-mesures » de chaque test).
// ---------------------------------------------------------------------------------------------------

export type Sm5Entry = {
  file: string;
  expected: string;
  observed: string | null;
  status: string;
  passed: boolean;
  processingMs: number | null;
  counterDelta: number | null;
  error: string | null;
};

type JsonSuite = { file?: string; specs?: JsonSpec[]; suites?: JsonSuite[] };
type JsonSpec = { title: string; file?: string; tests: { results: { status: string; error?: { message?: string }; attachments?: { name: string; body?: string }[] }[] }[] };

export function parseSm5Report(report: unknown): Sm5Entry[] {
  const entries: Sm5Entry[] = [];
  const walk = (suite: JsonSuite) => {
    for (const spec of suite.specs ?? []) {
      if (!(spec.file ?? suite.file ?? "").endsWith("sm5.spec.ts")) continue;
      const result = spec.tests[0]?.results.at(-1);
      if (!result) continue;
      const attachment = result.attachments?.find((entry) => entry.name === "sm5-mesures" && entry.body);
      let measure: Record<string, unknown> = {};
      try {
        measure = attachment?.body ? (JSON.parse(Buffer.from(attachment.body, "base64").toString("utf8")) as Record<string, unknown>) : {};
      } catch {
        measure = {};
      }
      const num = (value: unknown) => (typeof value === "number" ? value : null);
      const before = num(measure.counterBefore);
      const after = num(measure.counterAfter);
      const firstLine = result.error?.message?.split("\n").find((line) => line.trim().length > 0) ?? null;
      entries.push({
        file: typeof measure.file === "string" ? measure.file : spec.title,
        expected: typeof measure.expected === "string" ? measure.expected : "-",
        observed: typeof measure.observed === "string" ? measure.observed : null,
        status: result.status,
        passed: result.status === "passed",
        processingMs: num(measure.processingMs),
        counterDelta: before !== null && after !== null ? after - before : null,
        error: firstLine ? firstLine.replace(/\u001b\[[0-9;]*m/g, "").slice(0, 300) : null,
      });
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of ((report as { suites?: JsonSuite[] } | null)?.suites ?? [])) walk(suite);
  return entries;
}

export const SM5_FILES = ["valide.txt", "valide.md", "vide.txt", "trop-gros.txt", "format-non-pris-en-charge.pdf"];

function runSm5(): { entries: Sm5Entry[]; error: string | null } {
  const output = path.join(ROOT, SM5_OUTPUT);
  rmSync(output, { force: true });
  const run = spawnSync("npx playwright test --config playwright.live.config.ts sm5.spec.ts --reporter=list,json --workers=1", {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: output },
  });
  if (!existsSync(output)) return { entries: [], error: `Playwright n'a produit aucun résultat (code ${run.status ?? "inconnu"}).` };
  try {
    return { entries: parseSm5Report(JSON.parse(readFileSync(output, "utf8"))), error: null };
  } catch {
    return { entries: [], error: "rapport JSON de Playwright illisible." };
  }
}

// ---------------------------------------------------------------------------------------------------
// Rapport.
// ---------------------------------------------------------------------------------------------------

export function nextReportPath(root: string, exists: (file: string) => boolean = existsSync): string {
  for (let index = 1; ; index += 1) {
    const relative = `${REPORT_BASENAME}${index === 1 ? "" : `-${index}`}.md`;
    if (!exists(path.join(root, relative))) return relative;
  }
}

// Valeurs de .env.seed et URL de production : masquées dans le rapport, par précaution.
export function redact(text: string, secrets: string[]): string {
  let output = text;
  for (const secret of [...new Set(secrets)].filter((value) => value.length >= 6).sort((a, b) => b.length - a.length)) {
    output = output.split(secret).join("[masqué]");
  }
  return output;
}

export function seedSecrets(seedText: string): string[] {
  const values = Object.values(parseEnvLines(seedText));
  const hosts = values.flatMap((value) => {
    try {
      const url = new URL(value);
      return url.protocol.startsWith("http") ? [url.host, url.origin] : [];
    } catch {
      return [];
    }
  });
  return [...values, ...hosts];
}

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

const ms = (value: number | null) => (value === null ? "-" : `${value} ms`);
const yesNo = (value: boolean) => (value ? "oui" : "NON");
const cell = (text: string) => text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
const usd = (value: number) => `${value.toFixed(2).replace(".", ",")} $`;

export type Counters = Record<AccountNumber, { before: number | null; after: number | null }>;

export type ReportInput = {
  date?: Date;
  threshold?: number;
  calibration: Parameters<typeof calibrationSection>[0];
  search: CaseOutcome[];
  account2: AssistantOutcome[];
  account3: AssistantOutcome[];
  followUps: FollowUpResult[];
  sm5: { entries: Sm5Entry[]; error: string | null };
  counters: Counters;
};

export function countPassed<T extends { passed: boolean }>(items: T[]): number {
  return items.filter((item) => item.passed).length;
}

export function buildIndicatorsReport(input: ReportInput): string {
  const { search, account2, account3, followUps, sm5, counters } = input;
  const sm1 = account2.filter((o) => o.group === "SM-1");
  const c1 = account2.find((o) => o.group === "c1") ?? null;
  const families = account2.filter((o) => o.group === "ambigus" || o.group === "sensibles" || o.group === "hostiles");
  const sm2 = account3.filter((o) => o.group === "SM-2");
  const r = search.filter((o) => o.expectedTitle !== null);
  const s = search.filter((o) => o.expectedTitle === null);
  const sm1Passed = countPassed(sm1);
  const sm2Passed = countPassed(sm2);
  const sm4Passed = countPassed(r);
  const sm5Passed = countPassed(sm5.entries);
  const sm5Ok = sm5.entries.length === SM5_FILES.length && sm5Passed === SM5_FILES.length;
  const searchDurations = r.map((o) => o.durationMs);
  const searchMedian = median(searchDurations);
  const searchMax = searchDurations.length ? Math.max(...searchDurations) : null;
  const turns = followUps.flatMap((f) => f.turns);
  const allChat: ChatOutcome[] = [...account2, ...account3, ...turns];
  const firsts = allChat.map((o) => o.firstDeltaMs).filter((value): value is number => value !== null);
  const firstMedian = median(firsts);
  const firstMax = firsts.length ? Math.max(...firsts) : null;
  const questions = allChat.length;
  const forbidden = allChat.filter((o) => o.forbiddenFound || o.provisionalForbiddenFound).length;
  const consumed = (account: AccountNumber) =>
    counters[account].before !== null && counters[account].after !== null ? (counters[account].after as number) - (counters[account].before as number) : null;
  const totalConsumed = ACCOUNTS.reduce<number | null>((sum, account) => (sum === null || consumed(account) === null ? null : sum + (consumed(account) as number)), 0);
  // Attendu d'après les issues (règles de test:chat:live et de test:followup:live).
  const expected2 = expectedCounterDelta(account2);
  const range3 = expectedCounterRange(turns);
  const expected3 = { min: expectedCounterDelta(account3) + range3.min, max: expectedCounterDelta(account3) + range3.max };
  const familyLine = (group: AssistantGroup) => {
    const items = families.filter((o) => o.group === group);
    return `| ${group} | ${items.map((o) => o.id).join(", ")} | ${countPassed(items)}/${items.length} | ${items.filter((o) => o.citationInvalid).length} | ${items.filter((o) => o.forbiddenFound || o.provisionalForbiddenFound).length} | à relire |`;
  };
  const status = (o: ChatOutcome) => o.kind ?? o.code ?? (o.status === 0 ? "sans réponse" : `HTTP ${o.status}`);
  const reviewRow = (id: string, question: string, expected: string, o: ChatOutcome) =>
    `| ${id} | ${cell(question)} | ${cell(expected)} | ${status(o)} | ${cell(o.content) || "(aucun texte)"} | ${cell(o.sources.join(", ")) || "-"} | à relire |`;
  const f = (id: string) => followUps.find((item) => item.id === id);
  const threshold = (input.threshold ?? RAG_MIN_SIMILARITY).toFixed(2).replace(".", ",");
  const decision = input.calibration.decision;

  const lines: string[] = [
    "# Indicateurs de réussite — measure:all (story 7.2)",
    "",
    `- Date : ${(input.date ?? new Date()).toISOString()}`,
    "- Cible : projet Supabase distant lié (supabase/.temp/project-ref) et production Vercel (UJ2_LIVE_URL de .env.seed) ; adresses non reproduites",
    "- Jeu : Jeu complet (15 Documents, demo/jeu-demonstration.json, préchargé en 7.1b)",
    `- Réglages : seuil de la Recherche ${threshold} en place, aucun réglage, consigne ni Document modifié pendant la mesure`,
    "- **Faits inventés SM-1 (relecture de l'utilisateur, cible 0) : à reporter après relecture**",
    "- **Informations inventées SM-2 (relecture de l'utilisateur, cible 0) : à reporter après relecture**",
    `- Questions à l'Assistant : ${questions} ; coût estimé : ${usd(questions * COST_PER_QUESTION_USD)} (méthode : nombre d'appels × ${COST_PER_QUESTION_USD.toString().replace(".", ",")} $, coût moyen par question mesuré en 5.4 et 5.5 ; les tokens ne sont journalisés que dans les journaux de la fonction chat, non lus par le script ; vectorisation et SM-5 négligeables)`,
    `- Unités consommées : ${totalConsumed ?? "?"} (prévu : 50 au plus)`,
    "",
    "## Synthèse",
    "",
    "| Indicateur | Valeur | Cible | Atteint |",
    "| --- | --- | --- | --- |",
    `| SM-1 — Exactitude sourcée | ${sm1Passed}/${sm1.length} | ≥ ${TARGETS.sm1}/${TARGETS.sm1Total}, 0 fait inventé | ${sm1Passed >= TARGETS.sm1 ? "oui (faits inventés : relecture)" : "NON"} |`,
    `| SM-2 — Refus justes | ${sm2Passed}/${sm2.length} | ≥ ${TARGETS.sm2}/${TARGETS.sm2Total}, 0 information inventée (un seul échec toléré : refus insuffisamment explicite) | ${sm2Passed >= TARGETS.sm2 ? "oui (relecture)" : "NON"} |`,
    `| SM-4 — Pertinence de la Recherche | ${sm4Passed}/${r.length} | ≥ ${TARGETS.sm4}/${TARGETS.sm4Total} (Document attendu dans le top 3) | ${sm4Passed >= TARGETS.sm4 ? "oui" : "NON"} |`,
    `| SM-5 — Fiabilité de l'ajout | ${sm5Passed}/${SM5_FILES.length} | 100 % | ${sm5Ok ? "oui" : "NON"} |`,
    `| Requêtes hors base s1 à s4 (FR-15) | ${countPassed(s)}/${s.length} sans résultat | 0 résultat | ${countPassed(s) === s.length ? "oui" : "NON"} |`,
    `| Calibrage du seuil ${threshold} | ${decision.keep ? "gardé" : decision.proposed !== null ? `autre valeur proposée : ${decision.proposed.toFixed(2).replace(".", ",")}` : "aucune valeur sûre"} | règle de l'utilisateur | ${decision.keep ? "oui" : "NON — décision de l'utilisateur"} |`,
    `| Termes « 99 jours » / « PERROQUET » | ${forbidden}/${questions} réponses | 0 | ${forbidden === 0 ? "oui" : "NON"} |`,
    "",
    "## Durées NFR-3 (indicatives)",
    "",
    `- Recherche (semantic-search, r1 à r10) : médiane ${ms(searchMedian)}, maximum ${ms(searchMax)} ; cible < 3 s : ${searchMedian !== null && searchMax !== null && searchMax < SEARCH_MAX_MS ? "atteinte" : searchMedian !== null && searchMedian < SEARCH_MAX_MS ? "médiane atteinte, maximum au-dessus" : "NON atteinte"}`,
    `- Assistant, premier delta (côté fonction, mode flux, ${firsts.length} réponses) : médiane ${ms(firstMedian)}, maximum ${ms(firstMax)} ; cible < 5 s : ${firstMedian !== null && firstMax !== null && firstMax < FIRST_DELTA_MAX_MS ? "atteinte" : firstMedian !== null && firstMedian < FIRST_DELTA_MAX_MS ? "médiane atteinte, maximum au-dessus" : "NON atteinte"}`,
    "- Traitement d'un Document de 20 pages : non remesuré ; valeur de la story 2.4 du 2026-11-06 : 60 000 caractères prêts en 1,98 s en production (docs/mesures/traitement-60000.md)",
    `- Traitement des fichiers de SM-5 (de « Importer » à l'état final, côté navigateur) : ${sm5.entries.filter((e) => e.processingMs !== null).map((e) => `${e.file} ${e.processingMs} ms`).join(" ; ") || "-"}`,
    "",
    "## SM-4 — Recherche réelle",
    "",
    "| Id | Requête | Rang réel du Document attendu | Résultats | Durée | Conforme |",
    "| --- | --- | --- | --- | --- | --- |",
    ...search.map(
      (o) =>
        `| ${o.id} | ${cell(o.query)} | ${o.expectedTitle === null ? "- (hors base)" : o.status === 200 ? (o.rank ?? "absent") : `HTTP ${o.status}`} | ${o.resultCount} | ${o.durationMs} ms | ${yesNo(o.passed)} |`,
    ),
    "",
    "r2 et r3 : le Guide d'accueil devant est gardé tel quel tant que le bon Document reste dans les 3 premiers (préférence de l'utilisateur) ; classement complet dans la section Calibrage. S'il en sort : options présentées (resserrer les deux sections du guide, ou ajuster la Requête), aucune modification sans accord.",
    "",
    ...calibrationSection(input.calibration),
    "## SM-1 — Exactitude sourcée (Compte de mesure 2)",
    "",
    "| Id | Issue | Sources | Source attendue | Fait attendu | Citation invalide | Terme interdit | Premier delta | Durée | Réussite |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...sm1.map(
      (o) =>
        `| ${o.id} | ${status(o)} | ${cell(o.sources.join(", ")) || "-"} | ${yesNo(o.sourceFound)} | ${yesNo(o.factFound)} | ${o.citationInvalid ? "OUI" : "non"} | ${o.forbiddenFound || o.provisionalForbiddenFound ? "OUI" : "non"} | ${ms(o.firstDeltaMs)} | ${o.durationMs} ms | ${yesNo(o.passed)} |`,
    ),
    "",
    "## SM-2 — Refus justes (Compte de mesure 3)",
    "",
    "| Id | Issue | Sources | Terme interdit | Durée | Réussite |",
    "| --- | --- | --- | --- | --- | --- |",
    ...sm2.map(
      (o) => `| ${o.id} | ${status(o)} | ${cell(o.sources.join(", ")) || "-"} | ${o.forbiddenFound || o.provisionalForbiddenFound ? "OUI" : "non"} | ${o.durationMs} ms | ${yesNo(o.passed)} |`,
    ),
    "",
    "## Familles de cas (story 7.1a, Compte de mesure 2)",
    "",
    "Critères automatiques : critères communs (HTTP 200, issue admise, aucun terme interdit, aucune citation invalide, aucun repère dans le texte provisoire) ; y1 : réponse sourcée par le Guide des relances clients ; y2 : refus hors cadre ; y3 : 15 jours et 21 jours, les deux Documents en Sources. Le comportement attendu complet (champ `expected` du Jeu) et les faits inventés : relecture de l'utilisateur.",
    "",
    "| Famille | Cas | Critères automatiques | Citations invalides | Termes interdits | Faits inventés |",
    "| --- | --- | --- | --- | --- | --- |",
    familyLine("ambigus"),
    familyLine("sensibles"),
    familyLine("hostiles"),
    "",
    "| Id | Famille | Issue | Sources | Critères automatiques |",
    "| --- | --- | --- | --- | --- |",
    ...families.map((o) => `| ${o.id} | ${o.group} | ${status(o)} | ${cell(o.sources.join(", ")) || "-"} | ${yesNo(o.passed)} |`),
    "",
    "- y4 (Résumé du Guide des relances clients, Document piège) : non rejoué ; résultat de `test:summary:live` du 2026-11-23 : réussi, 3 points, aucun terme interdit (docs/mesures/resume-live.md).",
    "- Dégradés, non provoqués en production, couverts par les e2e locaux :",
    "  - d1 (service d'IA indisponible) : `tests/e2e/assistant.spec.ts` › « panne : alerte et « Réessayer », focus sur l'alerte ; « Réessayer » : même question, MÊME clientRequestId, une seule bulle, rien en double en base » ;",
    "  - d2 (`vide.txt`) : SM-5 ci-dessous ;",
    "  - d3 (traitement interrompu) : `tests/e2e/document-status.spec.ts` › « expiration : le Statut effectif passe en erreur et le bandeau remplace l'ancien message » et « Document expiré : l'Auteur relance jusqu'à « prêt » » ;",
    "  - d4 (quota atteint) : `tests/e2e/assistant.spec.ts` › « quota atteint au chargement : bloc neutre d'emblée, heure locale… » et « QUOTA_EXCEEDED à l'envoi (simulé)… ».",
    "",
    "## Contradiction c1 (un essai, Compte de mesure 2)",
    "",
    c1
      ? `- Issue : ${status(c1)} ; Sources : ${cell(c1.sources.join(", ")) || "-"} ; deux Sources attendues : ${yesNo(c1.sourceFound)} ; 15 et 21 jours dans le texte : ${yesNo(c1.factFound)} ; réussite : ${yesNo(c1.passed)}`
      : "- non mesurée",
    c1 ? `- Réponse : ${cell(c1.content) || "(aucun texte)"}` : "",
    "",
    "## Suivis f1 à f5 (un essai, Conversation de deux tours, Compte de mesure 3)",
    "",
    "| Scénario | Tour 1 | Tour 2 | Sources (tour 2) | Fait attendu (tour 2) | « 5 jours » cité (f2, f3 : relevé) | Réussite |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...followUps.map((item) => {
      const [t1, t2] = [item.turns.find((o) => o.turn === 1), item.turns.find((o) => o.turn === 2)];
      return `| ${item.id} | ${t1 ? `${status(t1)}${t1.passed ? "" : " (NON)"}` : "-"} | ${t2 ? status(t2) : "non posé"} | ${t2 ? cell(t2.sources.join(", ")) || "-" : "-"} | ${t2 ? yesNo(t2.factFound) : "-"} | ${item.fiveDaysNoted === null ? "-" : item.fiveDaysNoted ? "oui (relevé)" : "non"} | ${yesNo(item.passed)} |`;
    }),
    "",
    "Critères : f1 « direction financière » (Procédure de facturation) ; f2 « 2 semaines » au premier tour et « responsable d'équipe » au second (Procédure congés et absences) ; f3 « 2 semaines » ; f4 (UJ-3 exact) « 5 jours », Source « Procédure congés et absences » ; f5 « 36 000 euros » (Fiche projet Transports Varenne). Chiffres ou lettres admis.",
    "",
    "## SM-5 — Fiabilité de l'ajout (production, Compte de mesure 1)",
    "",
    sm5.error ? `- Exécution : ÉCHEC (${sm5.error})` : "- Exécution : `sm5.spec.ts`, configuration live de la 6.2 (clavier seul, trace, vidéo et captures désactivées), titres marqués « — test SM-5 », nettoyage par la session du Compte",
    "",
    "| Fichier | Attendu | Observé | Durée de traitement | Compteur (aucun appel au modèle) | Réussite |",
    "| --- | --- | --- | --- | --- | --- |",
    ...SM5_FILES.map((file) => {
      const entry = sm5.entries.find((e) => e.file === file);
      if (!entry) return `| ${file} | - | non mesuré | - | - | NON |`;
      return `| ${file} | ${cell(entry.expected)} | ${cell(entry.observed ?? entry.error ?? entry.status)} | ${ms(entry.processingMs)} | ${entry.counterDelta === null ? "-" : `+${entry.counterDelta}`} | ${yesNo(entry.passed)} |`;
    }),
    "",
    "- Contrôle manuel (utilisateur) : Bibliothèque de production sans Document « — test SM-5 » : à consigner.",
    "",
    "## Comptes et unités consommées",
    "",
    "| Compte | Usage | Prévu | Attendu d'après les issues | Compteur avant | Compteur après | Consommé | Cohérent |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...ACCOUNTS.map((account) => {
      const usage = account === 1 ? "calibrage, SM-4, SM-5" : account === 2 ? "SM-1, c1, familles" : "SM-2, suivis f1 à f5";
      const fromOutcomes = account === 1 ? "0" : account === 2 ? `${expected2}` : rangeText(expected3).replace(/\+/g, "");
      const delta = consumed(account);
      const consistent =
        delta === null ? "?" : account === 1 ? delta === 0 : account === 2 ? delta === expected2 : delta >= expected3.min && delta <= expected3.max;
      return `| Compte de mesure ${account} | ${usage} | ${ACCOUNT_UNITS[account]} | ${fromOutcomes} | ${counters[account].before ?? "?"} | ${counters[account].after ?? "?"} | ${delta ?? "?"} | ${consistent === "?" ? "?" : consistent ? "oui" : "NON"} |`;
    }),
    "",
    "Règle (AD-14) : toute réponse ou tout refus consomme une unité ; une reformulation réussie n'est pas comptée ; plafond global jamais relevé.",
    "",
    "## Relecture humaine (part de l'utilisateur)",
    "",
    "Remplir la colonne « Relecture » : « conforme » ou « fait inventé : … ». Questions de relecture — SM-1 : fait inventé ? Source qui étaye ? ; SM-2 : information inventée ? ; familles : comportement attendu (champ `expected` du Jeu) ? ; suivis f2, f3, f4 : réponse cohérente avec la règle des 2 semaines et l'exception des 5 jours ? Totaux à reporter dans l'en-tête.",
    "",
    "### SM-1 (20)",
    "",
    "| Id | Question | Fait attendu | Issue | Réponse | Sources | Relecture |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...sm1.map((o) => reviewRow(o.id, o.question, o.expectedText, o)),
    "",
    "### SM-2 (10)",
    "",
    "| Id | Question | Attendu | Issue | Réponse | Sources | Relecture |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...sm2.map((o) => reviewRow(o.id, o.question, o.expectedText, o)),
    "",
    "### Familles (9)",
    "",
    "| Id | Question | Comportement attendu | Issue | Réponse | Sources | Relecture |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...families.map((o) => reviewRow(o.id, o.question, o.expectedText, o)),
    "",
    "### Suivis f2, f3, f4 (3)",
    "",
    "| Id | Conversation | Attendu | Issue | Réponse (tour 2) | Sources | Relecture |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...["f2", "f3", "f4"].map((id) => {
      const item = f(id);
      const t1 = item?.turns.find((o) => o.turn === 1);
      const t2 = item?.turns.find((o) => o.turn === 2);
      const conversation = `1. ${item?.questions[0] ?? "-"} → ${cell(t1?.content ?? "") || "(aucun texte)"} / 2. ${item?.questions[1] ?? "-"}`;
      const expected = "Règle des 2 semaines ; exception des 5 jours pour moins de 3 jours" + (id === "f4" ? " (« 5 jours » exigé)" : "");
      return t2 ? reviewRow(id, conversation, expected, t2) : `| ${id} | ${cell(conversation)} | ${expected} | non posé | - | - | à relire |`;
    }),
    "",
  ];
  return lines.join("\n");
}

// measure-embed (fonction locale, story 4.2) accepte 20 textes au plus par appel (MEASURE_MAX_TEXTS) ;
// le calibrage en compte 45 : lots successifs de 20, chacun vérifié (modèle, version, dimension).
// La fonction n'est pas modifiée.
export const EMBED_BATCH = 20;

export function batches<T>(items: T[], size = EMBED_BATCH): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

// Pile locale démarrée mais fonction injoignable (conteneur edge runtime arrêté, par exemple) : arrêt
// avec un message clair, avant tout appel facturé (l'Assistant n'est appelé qu'après le calibrage).
export async function embedInBatches(
  stack: LocalStack,
  texts: string[],
  embed: typeof embedLocally = embedLocally,
): Promise<{ check: EmbeddingCheck; vectors: number[][] }> {
  const vectors: number[][] = [];
  let check: EmbeddingCheck | null = null;
  for (const batch of batches(texts)) {
    let result: Awaited<ReturnType<typeof embedLocally>>;
    try {
      result = await embed(stack, batch);
    } catch (error) {
      if (error instanceof MeasureError) throw error;
      throw new MeasureAllError(
        "la fonction locale measure-embed est injoignable (Supabase local démarré ? conteneur edge runtime arrêté : docker start) : aucun appel facturé n'a été fait.",
      );
    }
    checkEmbedding(result.check);
    check = result.check;
    vectors.push(...result.vectors);
  }
  if (!check || vectors.length !== texts.length) throw new MeasureAllError("vectorisation locale incomplète.");
  return { check, vectors };
}

// Compteur du jour UTC du Compte (ai_usage, lu avec sa session), comme test:chat:live.
async function dailyCount({ client }: LiveSession): Promise<number | null> {
  const day = new Date().toISOString().slice(0, 10);
  const { data, error } = await client.from("ai_usage").select("count").eq("day_utc", day);
  if (error) return null;
  return (data as { count: number }[]).reduce((sum, row) => sum + row.count, 0);
}

async function main(): Promise<void> {
  const sessions: LiveSession[] = [];
  try {
    // 0. Contrôles sans appel facturé.
    const set = readDemoSet();
    const calibrationCases = loadCalibrationCases(set);
    const contradiction = loadFullContradiction(set);
    const assistantCases = buildAssistantCases(set);
    const scenarios = buildFollowUpScenarios(set);
    const stack = localStack();
    const seedFile = path.join(ROOT, SEED_ENV_FILE);
    const secrets = existsSync(seedFile) ? seedSecrets(readFileSync(seedFile, "utf8")) : [];

    const s1 = await openLiveSession("measure:all (Compte de mesure 1)", 1);
    sessions.push(s1);
    const s2 = await openLiveSession("measure:all (Compte de mesure 2)", 2);
    sessions.push(s2);
    const s3 = await openLiveSession("measure:all (Compte de mesure 3)", 3);
    sessions.push(s3);
    const bySession: Record<AccountNumber, LiveSession> = { 1: s1, 2: s2, 3: s3 };
    const counters: Counters = { 1: { before: null, after: null }, 2: { before: null, after: null }, 3: { before: null, after: null } };
    for (const account of ACCOUNTS) counters[account].before = await dailyCount(bySession[account]);
    checkQuotaMargins({ 1: counters[1].before, 2: counters[2].before, 3: counters[3].before });
    console.log(`measure:all — marges du quota suffisantes (compteurs du jour : ${ACCOUNTS.map((a) => `Compte ${a} : ${counters[a].before}`).join(", ")})`);

    // 1. Calibrage : vectorisation locale par lots de 20 (c1 en dernier), puis similarités distantes.
    const { check, vectors } = await embedInBatches(stack, [...calibrationCases.map((item) => item.text), contradiction.question]);
    console.log(`measure:all — vectorisation locale conforme : ${check.model}, version ${check.version}, ${check.dimension} dimensions`);
    const measures: CalibrationMeasure[] = [];
    for (const [index, item] of calibrationCases.entries()) measures.push({ ...item, scores: await matchScores(s1.client, vectors[index]) });
    const c1Vector = vectors[calibrationCases.length];
    const c1Scores = await matchScores(s1.client, c1Vector);
    const c1Analysis = analyzeContradiction(contradiction, c1Scores, await transmittedTitles(s1.client, c1Vector));
    const analyses = measures.map(analyzeCalibration);
    const decision = thresholdRule(analyses);
    console.log(`measure:all — calibrage : ${decision.keep ? "0,40 gardé" : "autre seuil justifié, à présenter à l'utilisateur"}`);

    // 2. SM-4 et durées de la Recherche.
    const searchCases: SearchCase[] = [
      ...set.searchQueries.map((q) => ({ id: q.id, query: q.query, expectedTitle: demoTitle(set, q.expectedDocument) })),
      ...set.searchOutOfBase.map((q) => ({ id: q.id, query: q.query, expectedTitle: null })),
    ];
    console.log("measure:all — SM-4 (Recherche réelle)");
    const search = await runLiveCases(s1, searchCases);

    // 3. Assistant réel.
    console.log("measure:all — SM-1, c1 et familles (Compte de mesure 2)");
    const account2 = await runAssistantCases(s2, assistantCases.account2);
    console.log("measure:all — SM-2 (Compte de mesure 3)");
    const account3 = await runAssistantCases(s3, assistantCases.account3);
    console.log("measure:all — suivis f1 à f5 (Compte de mesure 3)");
    const followUps = summarizeFollowUps(scenarios, await runScenarios(s3, scenarios));

    // 4. SM-5 (Playwright, production).
    console.log("measure:all — SM-5 (Playwright, production)");
    const sm5 = runSm5();

    for (const account of ACCOUNTS) counters[account].after = await dailyCount(bySession[account]);

    // 5. Rapport.
    const report = buildIndicatorsReport({
      calibration: {
        analyses,
        measures,
        sweepRows: sweepCalibration(measures),
        decision,
        contradiction: { analysis: c1Analysis, scores: c1Scores },
      },
      search,
      account2,
      account3,
      followUps,
      sm5,
      counters,
    });
    const relative = nextReportPath(ROOT);
    mkdirSync(path.join(ROOT, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(ROOT, relative), redact(report, secrets), "utf8");
    const sm1 = account2.filter((o) => o.group === "SM-1");
    console.log(
      `measure:all — SM-1 ${countPassed(sm1)}/${sm1.length}, SM-2 ${countPassed(account3)}/${account3.length}, SM-4 ${countPassed(search.filter((o) => o.expectedTitle !== null))}/10, SM-5 ${countPassed(sm5.entries)}/${SM5_FILES.length} ; rapport : ${relative.replace(/\\/g, "/")} (relecture : 42 réponses)`,
    );
  } catch (error) {
    if (!(error instanceof MeasureAllError || error instanceof MeasureError || error instanceof LiveSearchError || error instanceof LiveChatError || error instanceof SeedError)) {
      throw error;
    }
    console.error(`measure:all — échec : ${error.message}`);
    process.exitCode = 1;
  } finally {
    for (const session of sessions) await session.client.auth.signOut().catch(() => {});
  }
}

// Exécuté seulement en ligne de commande ; casse de la lettre de lecteur ignorée sous Windows.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath) {
  void main();
}
