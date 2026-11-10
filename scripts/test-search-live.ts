// Test réel de la Recherche (story 4.1a, décisions Q1 et Q2 du 2026-11-10) : npm run test:search:live
// À lancer par l'utilisateur APRÈS deploy:supabase, jamais par les tests automatiques. Il vise le seul
// projet distant lié par la CLI (supabase/.temp/project-ref, comme deploy:supabase), se connecte avec
// le Compte de mesure 1 de .env.seed, et appelle semantic-search avec SA session : ni service_role, ni
// clé OpenAI. Vectorisation réelle et seuil de production (0,40 ou le secret RAG_MIN_SIMILARITY).
// Rapport : rang du bon Document et durée par Requête, jamais de similarité (la fonction n'en renvoie
// pas), ni secret, ni adresse e-mail, ni jeton. Un échec au seuil de 0,40 est une réserve de la story,
// transmise à la 4.2 avec ces mesures (décision Q2).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseEnvLines, SEED_ENV_FILE } from "./check-secrets";
import { readLinkedProjectRef } from "./deploy-supabase";
import { parseSeedEnv, SeedError } from "./seed-demo";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPORT_FILE = path.join("docs", "mesures", "recherche-live.md");
const PUBLIC_ENV_FILE = ".env.local";
const REQUEST_TIMEOUT_MS = 15_000;
const TOP_RANK = 3;
// Requête hors base imposée par la story, en plus de s1 à s3.
const EXTRA_OUT_OF_BASE = { id: "tarte", query: "recette de la tarte aux pommes" };

export class LiveSearchError extends Error {}

export type LiveTarget = { host: string; url: string; publicKey: string };

// Cible exigée : le projet distant lié, en https, désigné à la fois par .env.seed et par la clé
// publique (variable publique de Next.js). Toute autre cible est refusée avant le moindre appel.
export function resolveLiveTarget(input: {
  linkedRef: string | null;
  seedUrl: string;
  publicUrl: string | undefined;
  publicKey: string | undefined;
}): LiveTarget {
  if (!input.linkedRef) throw new LiveSearchError("aucun projet distant lié : lancez npx supabase link.");
  const expected = `${input.linkedRef}.supabase.co`;
  const parse = (value: string | undefined, name: string) => {
    try {
      return new URL(value ?? "");
    } catch {
      throw new LiveSearchError(`${name} n'est pas une URL valide.`);
    }
  };
  const seed = parse(input.seedUrl, "SEED_SUPABASE_URL");
  if (seed.hostname !== expected) {
    throw new LiveSearchError(`.env.seed vise ${seed.hostname}, pas le projet lié ${expected}. Rien n'a été appelé.`);
  }
  if (seed.protocol !== "https:") throw new LiveSearchError("le projet distant exige une adresse https.");
  const publicUrl = parse(input.publicUrl, "NEXT_PUBLIC_SUPABASE_URL");
  if (publicUrl.hostname !== expected) {
    throw new LiveSearchError(`la clé publique vient de ${publicUrl.hostname}, pas du projet lié ${expected}.`);
  }
  if (!isPublicKey(input.publicKey)) {
    throw new LiveSearchError("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente ou non publique (valeur masquée).");
  }
  return { host: expected, url: `https://${expected}`, publicKey: input.publicKey };
}

// Clé publiable, ou ancienne clé anon (JWT de rôle anon). Jamais une clé secrète ou service_role.
export function isPublicKey(key: string | undefined): key is string {
  if (!key) return false;
  if (key.startsWith("sb_publishable_")) return true;
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role === "anon";
  } catch {
    return false;
  }
}

export type SearchCase = { id: string; query: string; expectedTitle: string | null };
export type CaseOutcome = SearchCase & {
  status: number;
  durationMs: number;
  resultCount: number;
  rank: number | null;
  passed: boolean;
};

export function evaluateCase(searchCase: SearchCase, status: number, titles: string[], durationMs: number): CaseOutcome {
  const distinct = [...new Set(titles)];
  const index = searchCase.expectedTitle === null ? -1 : distinct.indexOf(searchCase.expectedTitle);
  const rank = index === -1 ? null : index + 1;
  const passed =
    status === 200 && (searchCase.expectedTitle === null ? titles.length === 0 : rank !== null && rank <= TOP_RANK);
  return { ...searchCase, status, durationMs, resultCount: titles.length, rank, passed };
}

// Rapport Markdown : Requêtes, rangs, nombres de résultats et durées. Aucune donnée sensible.
export function buildReport(host: string, outcomes: CaseOutcome[], date = new Date()): string {
  const relevant = outcomes.filter((outcome) => outcome.expectedTitle !== null);
  const outOfBase = outcomes.filter((outcome) => outcome.expectedTitle === null);
  const passed = outcomes.every((outcome) => outcome.passed);
  const durations = outcomes.map((outcome) => outcome.durationMs).sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor((durations.length - 1) / 2)] : 0;
  const line = (outcome: CaseOutcome, detail: string) =>
    `| ${outcome.id} | ${outcome.query} | ${detail} | ${outcome.durationMs} ms | ${outcome.passed ? "oui" : "NON"} |`;
  return [
    "# Recherche réelle — test:search:live (story 4.1a)",
    "",
    `- Date : ${date.toISOString()}`,
    `- Cible : ${host}`,
    "- Compte : Compte de mesure 1 de .env.seed",
    "- Seuil : celui du projet distant (RAG_MIN_SIMILARITY, 0,40 par défaut) ; similarités non exposées par la fonction",
    `- Résultat : ${passed ? "réussi" : "ÉCHEC — réserve de la story 4.1a, mesures transmises à la 4.2 (décision Q2)"}`,
    `- Durée médiane : ${median} ms ; maximale : ${durations.at(-1) ?? 0} ms`,
    "",
    `## Requêtes pertinentes (bon Document dans les ${TOP_RANK} premiers)`,
    "",
    "| Id | Requête | Rang du bon Document | Durée | Conforme |",
    "| --- | --- | --- | --- | --- |",
    ...relevant.map((outcome) =>
      line(outcome, outcome.status !== 200 ? `HTTP ${outcome.status}` : `${outcome.rank ?? "absent"} (${outcome.resultCount} résultats)`),
    ),
    "",
    "## Requêtes hors base (aucun résultat attendu)",
    "",
    "| Id | Requête | Résultats | Durée | Conforme |",
    "| --- | --- | --- | --- | --- |",
    ...outOfBase.map((outcome) => line(outcome, outcome.status !== 200 ? `HTTP ${outcome.status}` : String(outcome.resultCount))),
    "",
  ].join("\n");
}

export function loadCases(root = ROOT): SearchCase[] {
  const manifest = JSON.parse(readFileSync(path.join(root, "demo", "documents-mini.json"), "utf8")) as {
    documents: { key: string; title: string }[];
  };
  const questions = JSON.parse(readFileSync(path.join(root, "demo", "questions-mini.json"), "utf8")) as {
    searchQueries: { id: string; query: string; expectedDocument: string }[];
    searchOutOfBase: { id: string; query: string }[];
  };
  const titleOf = (key: string) => {
    const title = manifest.documents.find((document) => document.key === key)?.title;
    if (!title) throw new LiveSearchError(`Document attendu inconnu du mini Jeu : ${key}.`);
    return title;
  };
  return [
    ...questions.searchQueries.map(({ id, query, expectedDocument }) => ({ id, query, expectedTitle: titleOf(expectedDocument) })),
    ...[...questions.searchOutOfBase, EXTRA_OUT_OF_BASE].map(({ id, query }) => ({ id, query, expectedTitle: null })),
  ];
}

function publicVariables(): { url: string | undefined; key: string | undefined } {
  const file = path.join(ROOT, PUBLIC_ENV_FILE);
  const env = existsSync(file) ? parseEnvLines(readFileSync(file, "utf8")) : {};
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

async function main(): Promise<void> {
  try {
    const seedFile = path.join(ROOT, SEED_ENV_FILE);
    if (!existsSync(seedFile)) throw new LiveSearchError(`${SEED_ENV_FILE} est introuvable. Procédure : docs/environnements.md.`);
    const seed = parseSeedEnv(readFileSync(seedFile, "utf8"));
    const pub = publicVariables();
    const target = resolveLiveTarget({
      linkedRef: readLinkedProjectRef(path.join(ROOT, "supabase")),
      seedUrl: seed.url,
      publicUrl: pub.url,
      publicKey: pub.key,
    });
    console.log(`test:search:live — cible : ${target.host}`);

    const client = createClient(target.url, target.publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword(seed.measure[0]);
    if (error || !data.session) throw new LiveSearchError(`connexion du Compte de mesure 1 refusée (${error?.code ?? "sans session"}).`);
    const token = data.session.access_token;

    const outcomes: CaseOutcome[] = [];
    for (const searchCase of loadCases()) {
      const started = performance.now();
      let status = 0;
      let titles: string[] = [];
      try {
        const response = await fetch(`${target.url}/functions/v1/semantic-search`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, apikey: target.publicKey, "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchCase.query }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        status = response.status;
        const body = (await response.json().catch(() => null)) as { results?: { title?: unknown }[] } | null;
        titles = (body?.results ?? []).map((result) => String(result.title));
      } catch {
        status = 0;
      }
      const outcome = evaluateCase(searchCase, status, titles, Math.round(performance.now() - started));
      outcomes.push(outcome);
      console.log(`  ${outcome.passed ? "ok " : "NON"} ${outcome.id} : rang ${outcome.rank ?? "-"}, ${outcome.resultCount} résultats, ${outcome.durationMs} ms`);
    }
    await client.auth.signOut().catch(() => {});

    const report = buildReport(target.host, outcomes);
    mkdirSync(path.join(ROOT, path.dirname(REPORT_FILE)), { recursive: true });
    writeFileSync(path.join(ROOT, REPORT_FILE), report, "utf8");
    const passed = outcomes.every((outcome) => outcome.passed);
    console.log(`test:search:live — ${passed ? "réussi" : "ÉCHEC (réserve, voir le rapport)"} ; rapport : ${REPORT_FILE}`);
    if (!passed) process.exit(1);
  } catch (error) {
    if (!(error instanceof LiveSearchError || error instanceof SeedError)) throw error;
    console.error(`test:search:live — échec : ${error.message}`);
    process.exit(1);
  }
}

// Exécuté seulement en ligne de commande ; casse de la lettre de lecteur ignorée sous Windows.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath) {
  void main();
}
