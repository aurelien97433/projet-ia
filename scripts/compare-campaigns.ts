// Comparaison de deux campagnes measure:all (séquence 13) : npm run measure:compare.
// Lit deux rapports docs/mesures/indicateurs*.md, sans aucun appel réseau ni coût, et écrit
// docs/mesures/comparaison-campagnes.md (jamais écrasé : -2, -3…) :
// - synthèse SM côte à côte, durées NFR-3 ;
// - pour chacune des 43 réponses relues (SM-1, SM-2, familles, suivis f2 à f4) et c1 : inchangée
//   (même texte après normalisation : casse, espaces, apostrophes), ou changée, avec l'issue et les
//   Sources avant et après. Seules les réponses changées sont à relire ; une réponse inchangée reprend
//   la relecture de la campagne de référence.
// Par défaut : avant = docs/mesures/indicateurs.md, après = le rapport indicateurs-N.md le plus récent.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeForCheck } from "./test-chat-live";

export const COMPARISON_BASENAME = path.join("docs", "mesures", "comparaison-campagnes");

export type ReviewRow = { id: string; question: string; expected: string; issue: string; answer: string; sources: string; review: string };

// Cellules d'une ligne de tableau Markdown ; les « \| » restent dans la cellule.
export function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((value) => value.trim().replace(/\\\|/g, "|"));
}

// Lignes des tableaux de la section « Relecture humaine », indexées par identifiant (q1, h1, a1, f2…).
export function parseReviewRows(report: string): Map<string, ReviewRow> {
  const rows = new Map<string, ReviewRow>();
  const start = report.indexOf("## Relecture humaine");
  if (start < 0) return rows;
  for (const line of report.slice(start).split(/\r?\n/)) {
    if (!line.startsWith("| ")) continue;
    const cells = splitRow(line);
    if (cells.length < 7 || !/^[a-z]+\d+$/.test(cells[0])) continue;
    const [id, question, expected, issue, answer, sources, review] = cells;
    rows.set(id, { id, question, expected, issue, answer, sources, review });
  }
  return rows;
}

// Contradiction c1 : issue et Sources sur la première ligne, réponse sur la seconde.
export function parseContradiction(report: string): ReviewRow | null {
  const start = report.indexOf("## Contradiction c1");
  if (start < 0) return null;
  const lines = report.slice(start).split(/\r?\n/);
  const facts = lines.find((line) => line.startsWith("- Issue :")) ?? "";
  const answer = (lines.find((line) => line.startsWith("- Réponse :")) ?? "").replace(/^- Réponse :\s*/, "");
  const issue = /Issue : ([^;]+)/.exec(facts)?.[1]?.trim() ?? "";
  const sources = /Sources : ([^;]+)/.exec(facts)?.[1]?.trim() ?? "";
  return { id: "c1", question: "", expected: "", issue, answer, sources, review: "" };
}

// Lignes de la synthèse (« | SM-… | valeur | cible | atteint | »), indexées par libellé.
export function parseSynthesis(report: string): Map<string, string> {
  const result = new Map<string, string>();
  const start = report.indexOf("## Synthèse");
  if (start < 0) return result;
  const end = report.indexOf("\n## ", start + 1);
  for (const line of report.slice(start, end < 0 ? undefined : end).split(/\r?\n/)) {
    if (!line.startsWith("| ") || line.startsWith("| Indicateur") || line.startsWith("| ---")) continue;
    const cells = splitRow(line);
    if (cells.length >= 4) result.set(cells[0], `${cells[1]} (atteint : ${cells[3]})`);
  }
  return result;
}

export function parseDurations(report: string): string[] {
  const start = report.indexOf("## Durées NFR-3");
  if (start < 0) return [];
  const end = report.indexOf("\n## ", start + 1);
  return report
    .slice(start, end < 0 ? undefined : end)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}

export type Change = { id: string; before: ReviewRow | null; after: ReviewRow | null; kind: "inchangée" | "texte" | "issue ou Sources" | "absente" };

const same = (a: string, b: string) => normalizeForCheck(a) === normalizeForCheck(b);

// Une réponse est inchangée si le texte (et, pour les suivis, la conversation avec le tour 1), l'issue
// et les Sources sont identiques après normalisation.
export function classify(before: ReviewRow | null, after: ReviewRow | null): Change["kind"] {
  if (!before || !after) return "absente";
  if (!same(before.issue, after.issue) || !same(before.sources, after.sources)) return "issue ou Sources";
  const conversation = before.id.startsWith("f") ? same(before.question, after.question) : true;
  return same(before.answer, after.answer) && conversation ? "inchangée" : "texte";
}

export function compareReports(before: string, after: string): Change[] {
  const a = parseReviewRows(before);
  const b = parseReviewRows(after);
  const ids = [...new Set([...a.keys(), ...b.keys()])];
  const changes = ids.map((id) => ({ id, before: a.get(id) ?? null, after: b.get(id) ?? null, kind: classify(a.get(id) ?? null, b.get(id) ?? null) }));
  const c1Before = parseContradiction(before);
  const c1After = parseContradiction(after);
  if (c1Before || c1After) changes.push({ id: "c1", before: c1Before, after: c1After, kind: classify(c1Before, c1After) });
  return changes;
}

const cell = (text: string) => text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim() || "-";

export function renderComparison(input: { beforeName: string; afterName: string; before: string; after: string; date?: Date }): string {
  const changes = compareReports(input.before, input.after);
  const changed = changes.filter((change) => change.kind !== "inchangée");
  const unchanged = changes.filter((change) => change.kind === "inchangée");
  const synthBefore = parseSynthesis(input.before);
  const synthAfter = parseSynthesis(input.after);
  const durationsBefore = parseDurations(input.before);
  const durationsAfter = parseDurations(input.after);
  const lines = [
    "# Comparaison de deux campagnes measure:all",
    "",
    `- Date de la comparaison : ${(input.date ?? new Date()).toISOString()}`,
    `- Campagne de référence : ${input.beforeName}`,
    `- Campagne de vérification : ${input.afterName}`,
    `- Réponses comparées : ${changes.length} ; inchangées : ${unchanged.length} ; **à relire : ${changed.length}**`,
    "- Règle : une réponse est inchangée si son texte, son issue et ses Sources sont identiques après normalisation (casse, espaces, apostrophes typographiques) ; elle reprend alors la relecture de la campagne de référence. Pour les suivis, le tour 1 est comparé aussi.",
    "",
    "## Synthèse côte à côte",
    "",
    "| Indicateur | Référence | Vérification |",
    "| --- | --- | --- |",
    ...[...new Set([...synthBefore.keys(), ...synthAfter.keys()])].map(
      (key) => `| ${cell(key)} | ${cell(synthBefore.get(key) ?? "")} | ${cell(synthAfter.get(key) ?? "")} |`,
    ),
    "",
    "## Durées NFR-3",
    "",
    "| Référence | Vérification |",
    "| --- | --- |",
    ...Array.from({ length: Math.max(durationsBefore.length, durationsAfter.length) }, (_, index) =>
      `| ${cell(durationsBefore[index] ?? "")} | ${cell(durationsAfter[index] ?? "")} |`,
    ),
    "",
    `## Réponses à relire (${changed.length})`,
    "",
    "Colonne « Relecture » à remplir : « conforme » ou « fait inventé : … ».",
    "",
    "| Id | Changement | Issue (réf. → vérif.) | Sources (réf. → vérif.) | Réponse de référence | Réponse de vérification | Relecture de référence | Relecture |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...changed.map((change) => {
      const before = change.before;
      const after = change.after;
      const answer = (row: ReviewRow | null) => (row ? (row.id.startsWith("f") ? `${row.question} / tour 2 : ${row.answer}` : row.answer) : "absente");
      return `| ${change.id} | ${change.kind} | ${cell(before?.issue ?? "-")} → ${cell(after?.issue ?? "-")} | ${cell(before?.sources ?? "-")} → ${cell(after?.sources ?? "-")} | ${cell(answer(before))} | ${cell(answer(after))} | ${cell(before?.review ?? "")} | à relire |`;
    }),
    "",
    `## Réponses inchangées (${unchanged.length}) : relecture de référence reprise`,
    "",
    "| Id | Issue | Relecture de référence |",
    "| --- | --- | --- |",
    ...unchanged.map((change) => `| ${change.id} | ${cell(change.after?.issue ?? "")} | ${cell(change.before?.review ?? "")} |`),
    "",
  ];
  return lines.join("\n");
}

export function nextComparisonPath(root: string, exists: (file: string) => boolean = existsSync): string {
  for (let index = 1; ; index += 1) {
    const relative = `${COMPARISON_BASENAME}${index === 1 ? "" : `-${index}`}.md`;
    if (!exists(path.join(root, relative))) return relative;
  }
}

// Rapport de vérification par défaut : indicateurs-N.md de plus grand N.
export function latestCampaign(root: string): string | null {
  const dir = path.join(root, "docs", "mesures");
  const numbered = readdirSync(dir)
    .map((name) => /^indicateurs-(\d+)\.md$/.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  return numbered.length > 0 ? path.join("docs", "mesures", numbered[0][0]) : null;
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function main() {
  const root = process.cwd();
  const beforeName = argument("avant") ?? path.join("docs", "mesures", "indicateurs.md");
  const afterName = argument("apres") ?? latestCampaign(root);
  if (!afterName) {
    console.error("Aucune campagne de vérification (docs/mesures/indicateurs-N.md) : lancez d'abord npm run measure:all.");
    process.exitCode = 1;
    return;
  }
  const output = nextComparisonPath(root);
  const report = renderComparison({
    beforeName: beforeName.replace(/\\/g, "/"),
    afterName: afterName.replace(/\\/g, "/"),
    before: readFileSync(path.join(root, beforeName), "utf8"),
    after: readFileSync(path.join(root, afterName), "utf8"),
  });
  writeFileSync(path.join(root, output), report, "utf8");
  const toReview = /\*\*à relire : (\d+)\*\*/.exec(report)?.[1] ?? "?";
  console.log(`measure:compare — ${toReview} réponse(s) à relire ; rapport : ${output.replace(/\\/g, "/")}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath) {
  main();
}
