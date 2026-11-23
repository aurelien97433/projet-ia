import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullResult, Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import { liveCredentials, ROOT } from "./uj2";

// Rapport du passage réel d'UJ-2 (story 6.2, SM-3) : docs/mesures/uj2-live.md, jamais écrasé (-2, -3…).
// Contenu : date, cible sans secret, résultat de chaque exécution, durée de chaque étape, compteur du
// jour avant et après. Jamais l'URL de production, l'adresse e-mail ni le mot de passe : ces valeurs
// sont masquées dans tout message d'erreur repris.

export const REPORT_BASENAME = path.join("docs", "mesures", "uj2-live");

export function nextReportPath(root: string, exists: (file: string) => boolean = existsSync): string {
  for (let index = 1; ; index += 1) {
    const relative = `${REPORT_BASENAME}${index === 1 ? "" : `-${index}`}.md`;
    if (!exists(path.join(root, relative))) return relative;
  }
}

export type RunMeasure = {
  title: string;
  status: string;
  durationMs: number;
  steps: { title: string; durationMs: number; failed: boolean }[];
  before: number | null;
  after: number | null;
  processingSeen: boolean | null;
  supabaseHost: string | null;
  error: string | null;
};

export function redact(text: string, secrets: string[]): string {
  let output = text;
  for (const secret of secrets.filter((value) => value.length > 0)) output = output.split(secret).join("[masqué]");
  return output;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

export function buildUj2Report(runs: RunMeasure[], overall: string, date = new Date()): string {
  const passed = runs.filter((run) => run.status === "passed").length;
  const host = runs.find((run) => run.supabaseHost)?.supabaseHost ?? "inconnu";
  const stepTitles = [...new Set(runs.flatMap((run) => run.steps.map((step) => step.title)))];
  const lines = [
    "# Parcours UJ-2 réel — test:uj2:live (story 6.2)",
    "",
    `- Date : ${date.toISOString()}`,
    "- Cible : production Vercel (UJ2_LIVE_URL de .env.seed, adresse non reproduite), vraie IA",
    `- Projet Supabase : ${host}`,
    "- Compte : Compte de mesure 1 de .env.seed (sa session seulement)",
    "- Largeur : ordinateur 1 280 px, clavier seul ; trace, vidéo et captures désactivées",
    `- Résultat : ${passed} sur ${runs.length} (${overall === "passed" ? "réussi" : "ÉCHEC"})`,
    "",
    "## Exécutions",
    "",
    "| Exécution | Résultat | Durée | Compteur avant | Compteur après | Écart | *en cours* observé |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...runs.map((run, index) => {
      const delta = run.before !== null && run.after !== null ? `+${run.after - run.before}` : "-";
      const seen = run.processingSeen === null ? "-" : run.processingSeen ? "oui" : "non (traitement plus rapide)";
      return `| ${index + 1} | ${run.status === "passed" ? "réussie" : `ÉCHEC (${run.status})`} | ${seconds(run.durationMs)} | ${run.before ?? "-"} | ${run.after ?? "-"} | ${delta} | ${seen} |`;
    }),
    "",
    "## Durée de chaque étape",
    "",
    `| Étape | ${runs.map((_, index) => `Exécution ${index + 1}`).join(" | ")} |`,
    `| --- | ${runs.map(() => "---").join(" | ")} |`,
    ...stepTitles.map((title) => {
      const cells = runs.map((run) => {
        const step = run.steps.find((entry) => entry.title === title);
        return step ? `${seconds(step.durationMs)}${step.failed ? " (échec)" : ""}` : "-";
      });
      return `| ${title} | ${cells.join(" | ")} |`;
    }),
    "",
  ];
  const failures = runs.map((run, index) => ({ run, index })).filter(({ run }) => run.error);
  if (failures.length > 0) {
    lines.push("## Échecs", "");
    for (const { run, index } of failures) lines.push(`- Exécution ${index + 1} : ${run.error}`);
    lines.push("");
  }
  lines.push(
    "## Contrôle manuel",
    "",
    "- Bibliothèque de production sans Document « — test UJ-2 » : à consigner après le passage.",
    "",
  );
  return lines.join("\n");
}

function readAttachment(result: TestResult, name: string): Record<string, unknown> | null {
  const attachment = result.attachments.find((entry) => entry.name === name && entry.body);
  if (!attachment?.body) return null;
  try {
    return JSON.parse(attachment.body.toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const numberOrNull = (value: unknown) => (typeof value === "number" ? value : null);

export default class Uj2LiveReporter implements Reporter {
  private runs: RunMeasure[] = [];
  private secrets: string[] = [];

  onBegin(): void {
    try {
      const credentials = liveCredentials();
      this.secrets = [credentials.appUrl, new URL(credentials.appUrl).host, credentials.email, credentials.password];
    } catch {
      this.secrets = [];
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const steps = result.steps
      .filter((step: TestStep) => step.category === "test.step")
      .map((step) => ({ title: step.title, durationMs: step.duration, failed: Boolean(step.error) }));
    const measure = readAttachment(result, "uj2-mesures");
    const firstLine = result.error?.message?.split("\n").find((line) => line.trim().length > 0) ?? null;
    this.runs.push({
      title: test.title,
      status: result.status,
      durationMs: result.duration,
      steps,
      before: numberOrNull(measure?.before),
      after: numberOrNull(measure?.after),
      processingSeen: typeof measure?.processingSeen === "boolean" ? measure.processingSeen : null,
      supabaseHost: typeof measure?.supabaseHost === "string" ? measure.supabaseHost : null,
      // Sans séquences de couleur du terminal, valeurs sensibles masquées.
      error: firstLine ? redact(firstLine.replace(/\u001b\[[0-9;]*m/g, ""), this.secrets).slice(0, 300) : null,
    });
  }

  onEnd(result: FullResult): void {
    if (this.runs.length === 0) return;
    const relative = nextReportPath(ROOT);
    mkdirSync(path.join(ROOT, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(ROOT, relative), redact(buildUj2Report(this.runs, result.status), this.secrets), "utf8");
    console.log(`test:uj2:live — rapport : ${relative.replace(/\\/g, "/")}`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
