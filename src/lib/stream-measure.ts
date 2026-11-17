// Mesure du flux de l'Assistant sur Vercel (story 5.5, critère de l'epic ; décision de l'utilisateur du
// 2026-11-17, Q1 = A) : instrument de la page Assistant, actif seulement avec ?mesure=1. Calculs purs
// et résultat Markdown à copier. Le résultat ne contient ni identifiant (Conversation, message, Compte,
// x-vercel-id complet), ni jeton, ni e-mail : heure d'envoi, région, durées, nombres et texte des
// questions du mini Jeu seulement (une autre question n'est pas reprise).
import miniSet from "../../demo/questions-mini.json";

// Critères (AD-16, NFR-3) : premier affichage < 5 s en médiane ; texte reçu en plusieurs morceaux
// étalés ; fonction en fra1.
export const FIRST_DISPLAY_MEDIAN_LIMIT_MS = 5_000;
export const EXPECTED_REGION = "fra1";

export type MeasureOutcome = "answer" | "refusal" | "error";

// Une question mesurée. Instants en ms depuis l'envoi (performance.now()) ; lectures : lectures du flux
// qui apportent au moins un delta (des delta mis en tampon arrivent dans la même lecture).
export type Measure = {
  sentAt: Date;
  question: string;
  outcome: MeasureOutcome;
  // Code AD-19 d'une panne (jamais un message ni un identifiant).
  code?: string;
  firstDeltaMs: number | null;
  endMs: number | null;
  deltas: number;
  deltaReadsMs: number[];
  region: string | null;
};

type MiniSet = {
  questions?: { id: string; question: string }[];
  multiPassage?: { id: string; question: string };
  outOfBase?: { id: string; question: string }[];
  outOfScope?: { id: string; question: string }[];
  contradiction?: { id: string; question: string };
  promptInjection?: { id: string; question: string };
};

function miniQuestions(set: MiniSet): { id: string; question: string }[] {
  return [
    ...(set.questions ?? []),
    ...(set.multiPassage ? [set.multiPassage] : []),
    ...(set.outOfBase ?? []),
    ...(set.outOfScope ?? []),
    ...(set.contradiction ? [set.contradiction] : []),
    ...(set.promptInjection ? [set.promptInjection] : []),
  ];
}

const MINI_QUESTIONS = miniQuestions(miniSet as MiniSet).map(({ id, question }) => ({ id, question }));

// Question du mini Jeu (même texte, espaces de bord ignorés), ou null.
export function miniQuestion(question: string): { id: string; question: string } | null {
  const text = question.trim();
  return MINI_QUESTIONS.find((item) => item.question === text) ?? null;
}

// Région de la fonction Vercel : dernier segment avant l'identifiant final (docs/environnements.md,
// story 5.0). « cpt1::<id> » (sans fonction) ne prouve rien : null. Jamais l'en-tête complet.
export function functionRegion(vercelId: string | null): string | null {
  if (!vercelId) return null;
  const parts = vercelId.split("::");
  if (parts.length < 3) return null;
  const region = parts[parts.length - 2];
  return /^[a-z]{3}\d$/.test(region) ? region : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Premier affichage : premier delta, ou l'événement final s'il n'y a pas de texte provisoire (refus).
export function firstDisplayMs(measure: Measure): number | null {
  return measure.firstDeltaMs ?? measure.endMs;
}

// Étalement du texte reçu : du premier au dernier delta lu (0 si tout est arrivé d'un bloc).
export function spreadMs(measure: Measure): number | null {
  const reads = measure.deltaReadsMs;
  return reads.length === 0 ? null : reads[reads.length - 1] - reads[0];
}

// Flux non mis en tampon : une réponse reçue en plusieurs lectures distinctes, étalées dans le temps.
export function isProgressive(measure: Measure): boolean {
  return measure.outcome === "answer" && measure.deltaReadsMs.length >= 2 && (spreadMs(measure) ?? 0) > 0;
}

export type MeasureSummary = {
  count: number;
  medianFirstDisplayMs: number | null;
  maxFirstDisplayMs: number | null;
  answers: number;
  progressiveAnswers: number;
  regions: string[];
  firstDisplayOk: boolean;
  progressiveOk: boolean;
  regionOk: boolean;
  passed: boolean;
};

export function summarize(measures: Measure[]): MeasureSummary {
  const firsts = measures.map(firstDisplayMs).filter((value): value is number => value !== null);
  const medianFirst = median(firsts);
  const answers = measures.filter((measure) => measure.outcome === "answer");
  const progressiveAnswers = answers.filter(isProgressive).length;
  const regions = [...new Set(measures.map((measure) => measure.region ?? "inconnue"))];
  const firstDisplayOk = medianFirst !== null && medianFirst < FIRST_DISPLAY_MEDIAN_LIMIT_MS;
  const progressiveOk = answers.length > 0 && progressiveAnswers === answers.length;
  const regionOk = measures.length > 0 && regions.length === 1 && regions[0] === EXPECTED_REGION;
  return {
    count: measures.length,
    medianFirstDisplayMs: medianFirst,
    maxFirstDisplayMs: firsts.length > 0 ? Math.max(...firsts) : null,
    answers: answers.length,
    progressiveAnswers,
    regions,
    firstDisplayOk,
    progressiveOk,
    regionOk,
    passed: firstDisplayOk && progressiveOk && regionOk,
  };
}

const ms = (value: number | null) => (value === null ? "—" : `${Math.round(value)}`);
const cell = (text: string) => text.replace(/\s+/g, " ").replace(/\|/g, "\\|");
const OUTCOME_TEXT: Record<MeasureOutcome, string> = { answer: "réponse", refusal: "refus", error: "panne" };

function questionCell(question: string): string {
  const mini = miniQuestion(question);
  return mini ? `${mini.id} — ${cell(mini.question)}` : "(hors mini Jeu, texte non repris)";
}

function row(index: number, measure: Measure): string {
  const outcome = measure.outcome === "error" && measure.code && /^[A-Z_]+$/.test(measure.code)
    ? `panne (${measure.code})`
    : OUTCOME_TEXT[measure.outcome];
  return `| ${index} | ${measure.sentAt.toISOString().slice(11, 19)} | ${questionCell(measure.question)} | ${outcome} | ${ms(
    firstDisplayMs(measure),
  )} | ${ms(measure.firstDeltaMs)} | ${ms(measure.endMs)} | ${measure.deltas} | ${measure.deltaReadsMs.length} | ${ms(
    spreadMs(measure),
  )} | ${measure.region ?? "—"} | ${measure.outcome === "answer" ? (isProgressive(measure) ? "oui" : "NON") : "—"} |`;
}

// Résultat à copier : aucun identifiant, jeton ni e-mail (vérifié par un test).
export function measureMarkdown(measures: Measure[], date = new Date()): string {
  const summary = summarize(measures);
  return [
    `## Mesure du flux — Assistant (${date.toISOString()})`,
    "",
    `- Questions mesurées : ${summary.count}`,
    `- Premier affichage : médiane ${ms(summary.medianFirstDisplayMs)} ms, max ${ms(summary.maxFirstDisplayMs)} ms (critère : médiane < ${FIRST_DISPLAY_MEDIAN_LIMIT_MS} ms) : ${summary.firstDisplayOk ? "conforme" : "NON CONFORME"}`,
    `- Texte reçu en plusieurs morceaux étalés : ${summary.progressiveAnswers} réponses sur ${summary.answers} : ${summary.progressiveOk ? "conforme" : "NON CONFORME"}`,
    `- Région : ${summary.regions.join(", ") || "—"} (attendue : ${EXPECTED_REGION}) : ${summary.regionOk ? "conforme" : "NON CONFORME"}`,
    `- Verdict : ${summary.passed ? "réussite" : "ÉCHEC (plan B d'AD-16 à proposer)"}`,
    "",
    "| # | Envoi (UTC) | Question | Issue | Premier affichage (ms) | Premier delta (ms) | Fin (ms) | Delta | Lectures | Étalement (ms) | Région | Progressif |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...measures.map((measure, index) => row(index + 1, measure)),
    "",
  ].join("\n");
}
