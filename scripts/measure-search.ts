// Mesure et calibrage de la Recherche (story 4.2, décision Q1 = A) : npm run measure:search
// À lancer par l'utilisateur, Supabase local démarré. Réutilise test:search:live (cible exigée, Compte
// de mesure 1, cas r1 à r6, s1 à s3, « tarte ») et ajoute les similarités réelles sans rien changer en
// production :
//   1. les Requêtes sont vectorisées en UN appel par la fonction LOCALE measure-embed (clé OpenAI
//      locale, même modèle et même dimension que la production, vérifiés) ;
//   2. match_passages est appelée sur le projet distant avec la session du Compte de mesure (seuil 0,
//      1 Passage par Document) : similarité de chaque Document ;
//   3. semantic-search est appelée une fois par Requête (durées de la chaîne réelle) ;
//   4. le balayage des seuils et les marges sont calculés hors ligne.
// Story 5.4 : la question de contradiction c1 de questions-mini.json est vectorisée dans le même appel ;
// ses deux Documents attendus doivent dépasser CONTRADICTION_MIN_SIMILARITY (seuil + 0,02) ET figurer
// parmi les Passages que chat transmettrait au modèle (mêmes paramètres de match_passages). Sinon,
// arrêt de la story et mesures présentées à l'utilisateur (aucun changement de seuil ni de question).
// Rapport : docs/mesures/recherche.md, sans secret, adresse e-mail, jeton ni vecteur.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAT_MAX_PASSAGES,
  CHAT_PASSAGES_PER_DOCUMENT,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL,
  EMBEDDING_VERSION,
  RAG_MIN_SIMILARITY,
  SEARCH_MAX_DOCUMENTS,
} from "../supabase/functions/_shared/config.ts";
import { SeedError } from "./seed-demo";
import {
  type CaseOutcome,
  LiveSearchError,
  loadCases,
  openLiveSession,
  ROOT,
  runLiveCases,
  type SearchCase,
} from "./test-search-live";

export const MEASURE_REPORT_FILE = path.join("docs", "mesures", "recherche.md");
export const THRESHOLDS = [0.3, 0.35, 0.4, 0.45, 0.5] as const;
// Marge minimale de chaque côté du seuil retenu (décision Q1 = A).
export const MIN_MARGIN = 0.05;
// Critère de l'epic : au moins 4 Requêtes sur 5 avec le bon Document dans le top 3 (80 %).
export const MIN_TOP3_RATIO = 0.8;
const TOP_RANK = 3;
const MATCH_ROWS = 50;
const SLOW_MEDIAN_MS = 3_000;

export class MeasureError extends Error {}

export type DocumentScore = { title: string; similarity: number };

// Mesure d'une Requête : similarités de tous les Documents (meilleur Passage), triées.
export type CaseMeasure = SearchCase & { scores: DocumentScore[]; matchMs: number };

export type CaseAnalysis = {
  id: string;
  query: string;
  expectedTitle: string | null;
  goodSimilarity: number | null;
  goodRank: number | null; // rang du bon Document parmi tous les Documents, sans seuil
  bestTitle: string | null;
  bestSimilarity: number | null;
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const round2 = (value: number) => Math.round(value * 100) / 100;
const format = (value: number | null) => (value === null ? "-" : value.toFixed(3).replace(".", ","));
const formatThreshold = (value: number) => value.toFixed(2).replace(".", ",");

// Meilleure similarité par titre (deux copies d'un Document comptent pour un seul), triée.
export function scoresFromRows(rows: unknown): DocumentScore[] {
  if (!Array.isArray(rows)) throw new MeasureError("réponse de match_passages illisible.");
  const best = new Map<string, number>();
  for (const row of rows as { title?: unknown; similarity?: unknown }[]) {
    if (typeof row.title !== "string" || typeof row.similarity !== "number") {
      throw new MeasureError("ligne de match_passages illisible.");
    }
    best.set(row.title, Math.max(best.get(row.title) ?? -Infinity, row.similarity));
  }
  return [...best].map(([title, similarity]) => ({ title, similarity })).sort((a, b) => b.similarity - a.similarity);
}

export function analyzeCase(measure: CaseMeasure): CaseAnalysis {
  const index = measure.expectedTitle === null ? -1 : measure.scores.findIndex((score) => score.title === measure.expectedTitle);
  const best = measure.scores[0];
  return {
    id: measure.id,
    query: measure.query,
    expectedTitle: measure.expectedTitle,
    goodSimilarity: index === -1 ? null : round3(measure.scores[index].similarity),
    goodRank: index === -1 ? null : index + 1,
    bestTitle: best?.title ?? null,
    bestSimilarity: best ? round3(best.similarity) : null,
  };
}

export type ThresholdRow = { threshold: number; top3: number; relevant: number; outOfBaseWithResult: number; outOfBase: number; passes: boolean };

// Résultat simulé à un seuil, comme semantic-search : Documents au-dessus du seuil, 5 au plus.
export function sweep(measures: CaseMeasure[], thresholds: readonly number[] = THRESHOLDS): ThresholdRow[] {
  const relevant = measures.filter((measure) => measure.expectedTitle !== null);
  const outOfBase = measures.filter((measure) => measure.expectedTitle === null);
  return thresholds.map((threshold) => {
    const kept = (measure: CaseMeasure) =>
      measure.scores.filter((score) => score.similarity >= threshold).slice(0, SEARCH_MAX_DOCUMENTS);
    const top3 = relevant.filter((measure) => {
      const rank = kept(measure).findIndex((score) => score.title === measure.expectedTitle);
      return rank !== -1 && rank < TOP_RANK;
    }).length;
    const outOfBaseWithResult = outOfBase.filter((measure) => kept(measure).length > 0).length;
    const passes = relevant.length > 0 && top3 >= Math.ceil(relevant.length * MIN_TOP3_RATIO) && outOfBaseWithResult === 0;
    return { threshold, top3, relevant: relevant.length, outOfBaseWithResult, outOfBase: outOfBase.length, passes };
  });
}

export type Recommendation = {
  threshold: number;
  passes: boolean;
  lowMargin: number | null; // seuil − meilleure similarité hors base
  highMargin: number | null; // plus faible similarité d'un bon Document − seuil
  keep: boolean;
  proposed: number | null; // milieu de la bande sûre, si 0,40 n'est pas gardé
  reason: string;
};

// Décision Q1 = A : 0,40 gardé s'il satisfait les critères avec au moins 0,05 de marge des deux
// côtés ; sinon, milieu de la bande sûre ]meilleur hors base ; plus faible bon Document], proposé.
export function recommend(analyses: CaseAnalysis[], rows: ThresholdRow[], threshold = RAG_MIN_SIMILARITY): Recommendation {
  const goods = analyses.filter((a) => a.expectedTitle !== null).map((a) => a.goodSimilarity ?? 0);
  const outs = analyses.filter((a) => a.expectedTitle === null).map((a) => a.bestSimilarity ?? 0);
  const minGood = goods.length ? Math.min(...goods) : null;
  const maxOut = outs.length ? Math.max(...outs) : null;
  const lowMargin = maxOut === null ? null : round3(threshold - maxOut);
  const highMargin = minGood === null ? null : round3(minGood - threshold);
  const passes = rows.find((row) => Math.abs(row.threshold - threshold) < 1e-9)?.passes ?? false;
  const enough = (margin: number | null) => margin === null || margin >= MIN_MARGIN;
  if (passes && enough(lowMargin) && enough(highMargin)) {
    return { threshold, passes, lowMargin, highMargin, keep: true, proposed: null, reason: `critères atteints, marges d'au moins ${formatThreshold(MIN_MARGIN)}` };
  }
  if (minGood !== null && maxOut !== null && minGood > maxOut) {
    const proposed = round2((minGood + maxOut) / 2);
    return { threshold, passes, lowMargin, highMargin, keep: false, proposed, reason: "marge insuffisante : milieu de la bande sûre proposé" };
  }
  return {
    threshold,
    passes,
    lowMargin,
    highMargin,
    keep: false,
    proposed: null,
    reason: "aucune bande sûre : un hors base est aussi proche qu'un bon Document (taille des Passages à revoir)",
  };
}

export type Durations = { first: number; median: number; warmMedian: number; max: number; matchMedian: number };

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

export function durations(outcomes: CaseOutcome[], measures: CaseMeasure[]): Durations {
  const chain = outcomes.map((outcome) => outcome.durationMs);
  return {
    first: chain[0] ?? 0,
    median: median(chain),
    warmMedian: median(chain.slice(1)),
    max: Math.max(0, ...chain),
    matchMedian: median(measures.map((measure) => measure.matchMs)),
  };
}

// Cause probable des lenteurs, à partir des seules durées mesurées (les journaux distants
// semantic_search_done, avec embed_ms et match_ms, sont lus par l'utilisateur).
export function slowCause(d: Durations): string {
  const parts: string[] = [];
  if (d.median > SLOW_MEDIAN_MS) {
    parts.push(`Médiane au-dessus de 3 s (${d.median} ms) : critère de vitesse NON atteint.`);
  } else {
    parts.push(`Médiane sous 3 s (${d.median} ms) : critère de vitesse atteint.`);
  }
  if (d.first > 2 * Math.max(d.warmMedian, 1)) {
    parts.push(
      `Premier appel ${d.first} ms contre ${d.warmMedian} ms ensuite, alors que match_passages seule prend ${d.matchMedian} ms en médiane : ` +
        "démarrage à froid probable (chargement de l'Edge Function, première connexion au fournisseur), ni la base ni le réseau.",
    );
  } else {
    parts.push(`Premier appel ${d.first} ms, proche des suivants (${d.warmMedian} ms) : pas de démarrage à froid observé lors de cette exécution.`);
  }
  parts.push(
    "Action : réchauffer la Recherche avant une démonstration (une Recherche lancée une à deux minutes avant), sans code ; " +
      "vérifier dans les journaux Supabase le démarrage (« booted ») et `embed_ms` du premier `semantic_search_done`.",
  );
  return parts.join(" ");
}

// Contradiction c1 (story 5.4) : marge de 0,02 au-dessus du seuil de l'Assistant (décision de
// l'utilisateur du 2026-11-17 : 0,42 pour un seuil de 0,40).
export const CONTRADICTION_MARGIN = 0.02;
export const CONTRADICTION_MIN_SIMILARITY = round3(RAG_MIN_SIMILARITY + CONTRADICTION_MARGIN);

export type ContradictionCase = { id: string; question: string; expectedTitles: string[] };

export function loadContradiction(root = ROOT): ContradictionCase {
  const manifest = JSON.parse(readFileSync(path.join(root, "demo", "documents-mini.json"), "utf8")) as {
    documents: { key: string; title: string }[];
  };
  const questions = JSON.parse(readFileSync(path.join(root, "demo", "questions-mini.json"), "utf8")) as {
    contradiction?: { id: string; question: string; expectedDocuments: string[] };
  };
  const contradiction = questions.contradiction;
  if (!contradiction || contradiction.expectedDocuments.length < 2) {
    throw new MeasureError("question de contradiction absente ou incomplète dans demo/questions-mini.json.");
  }
  const expectedTitles = contradiction.expectedDocuments.map((key) => {
    const title = manifest.documents.find((document) => document.key === key)?.title;
    if (!title) throw new MeasureError(`Document attendu inconnu du mini Jeu : ${key}.`);
    return title;
  });
  return { id: contradiction.id, question: contradiction.question, expectedTitles };
}

export type ContradictionDocument = {
  title: string;
  similarity: number | null; // meilleur Passage, sans seuil
  rank: number | null; // rang du Document, sans seuil
  transmitted: boolean; // parmi les Passages que chat transmettrait au modèle
  passes: boolean;
};

export type ContradictionAnalysis = { id: string; question: string; documents: ContradictionDocument[]; passes: boolean };

// scores : meilleure similarité par Document (seuil 0) ; transmittedTitles : titres des Passages
// renvoyés par match_passages avec les paramètres de chat.
export function analyzeContradiction(
  contradiction: ContradictionCase,
  scores: DocumentScore[],
  transmittedTitles: string[],
  minSimilarity = CONTRADICTION_MIN_SIMILARITY,
): ContradictionAnalysis {
  const documents = contradiction.expectedTitles.map((title) => {
    const index = scores.findIndex((score) => score.title === title);
    const similarity = index === -1 ? null : round3(scores[index].similarity);
    const transmitted = transmittedTitles.includes(title);
    return { title, similarity, rank: index === -1 ? null : index + 1, transmitted, passes: similarity !== null && similarity >= minSimilarity && transmitted };
  });
  return { id: contradiction.id, question: contradiction.question, documents, passes: documents.every((document) => document.passes) };
}

export function contradictionSection(analysis: ContradictionAnalysis, scores: DocumentScore[]): string[] {
  const verdict = analysis.passes
    ? `atteint : les ${analysis.documents.length} Documents dépassent ${formatThreshold(CONTRADICTION_MIN_SIMILARITY)} et sont transmis au modèle`
    : `NON atteint : arrêt de la story 5.4, mesures à présenter à l'utilisateur (aucun changement de seuil ni de question)`;
  return [
    "## Contradiction c1 (story 5.4)",
    "",
    `Question : « ${analysis.question} ». Critère : chaque Document attendu ≥ ${formatThreshold(CONTRADICTION_MIN_SIMILARITY)} (seuil ${formatThreshold(RAG_MIN_SIMILARITY)} + ${formatThreshold(CONTRADICTION_MARGIN)}) et transmis au modèle par chat (${CHAT_MAX_PASSAGES} Passages au plus, ${CHAT_PASSAGES_PER_DOCUMENT} par Document).`,
    "",
    `- Résultat : ${verdict}`,
    "",
    "| Document attendu | Similarité | Rang sans seuil | Transmis par chat | Conforme |",
    "| --- | --- | --- | --- | --- |",
    ...analysis.documents.map(
      (document) =>
        `| ${document.title} | ${format(document.similarity)} | ${document.rank ?? "absent"} | ${document.transmitted ? "oui" : "non"} | ${document.passes ? "oui" : "NON"} |`,
    ),
    "",
    "Classement complet (meilleur Passage par Document, sans seuil) :",
    "",
    ...scores.map((score, index) => `${index + 1}. ${score.title} : ${format(round3(score.similarity))}`),
    "",
  ];
}

export type EmbeddingCheck = { model: string; version: number; dimension: number };

// Même modèle, même version et même dimension que la production (EMBEDDING_* de _shared/config.ts,
// lus aussi par process-document et semantic-search).
export function checkEmbedding(check: EmbeddingCheck): void {
  if (check.model !== EMBEDDING_MODEL || check.version !== EMBEDDING_VERSION || check.dimension !== EMBEDDING_DIMENSION) {
    throw new MeasureError(
      `vectorisation locale non conforme (${check.model}, version ${check.version}, ${check.dimension} dimensions) : attendu ${EMBEDDING_MODEL}, version ${EMBEDDING_VERSION}, ${EMBEDDING_DIMENSION}.`,
    );
  }
}

export function buildMeasureReport(input: {
  host: string;
  embedding: EmbeddingCheck;
  analyses: CaseAnalysis[];
  outcomes: CaseOutcome[];
  sweepRows: ThresholdRow[];
  recommendation: Recommendation;
  durations: Durations;
  contradiction?: { analysis: ContradictionAnalysis; scores: DocumentScore[] };
  date?: Date;
}): string {
  const { host, embedding, analyses, outcomes, sweepRows, recommendation: rec, durations: d } = input;
  const outcomeOf = (id: string) => outcomes.find((outcome) => outcome.id === id);
  const relevant = analyses.filter((a) => a.expectedTitle !== null);
  const outOfBase = analyses.filter((a) => a.expectedTitle === null);
  const decision = rec.keep
    ? `0,40 gardé (${rec.reason}). Aucune modification de la production.`
    : rec.proposed !== null
      ? `Changement RECOMMANDÉ, non appliqué : ${formatThreshold(rec.proposed)} (${rec.reason}). À présenter à l'utilisateur avant toute pose du secret RAG_MIN_SIMILARITY.`
      : `Aucune valeur sûre (${rec.reason}). À présenter à l'utilisateur.`;
  return [
    "# Mesure de la Recherche — measure:search (story 4.2)",
    "",
    `- Date : ${(input.date ?? new Date()).toISOString()}`,
    `- Cible : ${host} ; Compte de mesure 1 de .env.seed (aucun quota consommé)`,
    `- Vectorisation des Requêtes : fonction locale measure-embed, ${embedding.model}, version ${embedding.version}, ${embedding.dimension} dimensions — identique à la production`,
    `- Seuil de référence : ${formatThreshold(rec.threshold)} ; marge basse ${format(rec.lowMargin)} ; marge haute ${format(rec.highMargin)}`,
    `- Décision : ${decision}`,
    "",
    "## Requêtes pertinentes",
    "",
    "| Id | Requête | Similarité du bon Document | Rang sans seuil | Rang réel (semantic-search) | Durée |",
    "| --- | --- | --- | --- | --- | --- |",
    ...relevant.map((a) => {
      const o = outcomeOf(a.id);
      return `| ${a.id} | ${a.query} | ${format(a.goodSimilarity)} | ${a.goodRank ?? "absent"} | ${o?.status === 200 ? (o.rank ?? "absent") : `HTTP ${o?.status ?? "-"}`} | ${o?.durationMs ?? "-"} ms |`;
    }),
    "",
    "## Requêtes hors base",
    "",
    "| Id | Requête | Meilleure similarité | Résultats réels (semantic-search) | Durée |",
    "| --- | --- | --- | --- | --- |",
    ...outOfBase.map((a) => {
      const o = outcomeOf(a.id);
      return `| ${a.id} | ${a.query} | ${format(a.bestSimilarity)} | ${o?.status === 200 ? o.resultCount : `HTTP ${o?.status ?? "-"}`} | ${o?.durationMs ?? "-"} ms |`;
    }),
    "",
    "## Balayage des seuils (calculé hors ligne)",
    "",
    "| Seuil | Bon Document dans le top 3 | Hors base avec résultat | Critères |",
    "| --- | --- | --- | --- |",
    ...sweepRows.map(
      (row) => `| ${formatThreshold(row.threshold)} | ${row.top3}/${row.relevant} | ${row.outOfBaseWithResult}/${row.outOfBase} | ${row.passes ? "atteints" : "non atteints"} |`,
    ),
    "",
    "## Durées",
    "",
    `- semantic-search : premier appel ${d.first} ms ; médiane ${d.median} ms ; médiane hors premier appel ${d.warmMedian} ms ; maximum ${d.max} ms`,
    `- match_passages seule (projet distant, médiane) : ${d.matchMedian} ms`,
    `- Analyse : ${slowCause(d)}`,
    "",
    ...(input.contradiction ? contradictionSection(input.contradiction.analysis, input.contradiction.scores) : []),
  ].join("\n");
}

type LocalStack = { url: string; serviceRoleKey: string };

function localStack(): LocalStack {
  const bin = path.join("node_modules", ".bin", "supabase");
  let status: Record<string, string>;
  try {
    status = JSON.parse(execSync(`${bin} status -o json`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    throw new MeasureError("Supabase local ne répond pas : lancez npx supabase start. Rien n'a été appelé.");
  }
  if (!status.API_URL || !status.SERVICE_ROLE_KEY) throw new MeasureError("Supabase local est incomplet : relancez npx supabase start.");
  return { url: status.API_URL, serviceRoleKey: status.SERVICE_ROLE_KEY };
}

async function embedLocally(stack: LocalStack, texts: string[]): Promise<{ check: EmbeddingCheck; vectors: number[][] }> {
  const response = await fetch(`${stack.url}/functions/v1/measure-embed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${stack.serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => null)) as
    | { model: string; version: number; dimension: number; vectors: number[][]; error?: { code?: string } }
    | null;
  if (!response.ok || !body?.vectors) {
    throw new MeasureError(`measure-embed a échoué (HTTP ${response.status}, ${body?.error?.code ?? "réponse illisible"}) : vérifiez la clé locale avec npm run test:ai.`);
  }
  if (body.vectors.length !== texts.length) throw new MeasureError("measure-embed n'a pas renvoyé un vecteur par Requête.");
  return { check: { model: body.model, version: body.version, dimension: body.dimension }, vectors: body.vectors };
}

async function main(): Promise<void> {
  try {
    const cases = loadCases();
    const contradiction = loadContradiction();
    // Local d'abord : rien n'est appelé à distance si la pile locale ou sa clé ne répondent pas. La
    // question c1 est vectorisée dans le même appel, en dernier.
    const { check, vectors } = await embedLocally(localStack(), [...cases.map((item) => item.query), contradiction.question]);
    checkEmbedding(check);
    const contradictionVector = vectors[cases.length];
    console.log(`measure:search — vectorisation locale conforme : ${check.model}, version ${check.version}, ${check.dimension} dimensions`);

    const session = await openLiveSession("measure:search");
    const measures: CaseMeasure[] = [];
    for (const [index, item] of cases.entries()) {
      const started = performance.now();
      const { data, error } = await session.client.rpc("match_passages", {
        query_embedding: JSON.stringify(vectors[index]),
        min_similarity: 0,
        max_passages: MATCH_ROWS,
        max_per_document: 1,
        embedding_model: EMBEDDING_MODEL,
        embedding_version: EMBEDDING_VERSION,
      });
      if (error) throw new MeasureError(`match_passages a refusé l'appel (${error.code}).`);
      measures.push({ ...item, scores: scoresFromRows(data), matchMs: Math.round(performance.now() - started) });
    }
    // c1 : similarité de chaque Document (seuil 0, 1 Passage par Document), puis Passages que chat
    // transmettrait au modèle (mêmes paramètres que chat/index.ts).
    const c1Scores = await session.client.rpc("match_passages", {
      query_embedding: JSON.stringify(contradictionVector),
      min_similarity: 0,
      max_passages: MATCH_ROWS,
      max_per_document: 1,
      embedding_model: EMBEDDING_MODEL,
      embedding_version: EMBEDDING_VERSION,
    });
    if (c1Scores.error) throw new MeasureError(`match_passages a refusé l'appel de c1 (${c1Scores.error.code}).`);
    const c1Transmitted = await session.client.rpc("match_passages", {
      query_embedding: JSON.stringify(contradictionVector),
      min_similarity: RAG_MIN_SIMILARITY,
      max_passages: CHAT_MAX_PASSAGES,
      max_per_document: CHAT_PASSAGES_PER_DOCUMENT,
      embedding_model: EMBEDDING_MODEL,
      embedding_version: EMBEDDING_VERSION,
    });
    if (c1Transmitted.error) throw new MeasureError(`match_passages a refusé l'appel de c1 (${c1Transmitted.error.code}).`);
    const contradictionScores = scoresFromRows(c1Scores.data);
    const transmittedTitles = scoresFromRows(c1Transmitted.data).map((score) => score.title);
    const contradictionAnalysis = analyzeContradiction(contradiction, contradictionScores, transmittedTitles);

    const outcomes = await runLiveCases(session, cases);
    await session.client.auth.signOut().catch(() => {});

    const analyses = measures.map(analyzeCase);
    const sweepRows = sweep(measures);
    const recommendation = recommend(analyses, sweepRows);
    const report = buildMeasureReport({
      host: session.target.host,
      embedding: check,
      analyses,
      outcomes,
      sweepRows,
      recommendation,
      durations: durations(outcomes, measures),
      contradiction: { analysis: contradictionAnalysis, scores: contradictionScores },
    });
    mkdirSync(path.join(ROOT, path.dirname(MEASURE_REPORT_FILE)), { recursive: true });
    writeFileSync(path.join(ROOT, MEASURE_REPORT_FILE), report, "utf8");
    console.log(`measure:search — ${recommendation.keep ? "0,40 gardé" : "décision à présenter à l'utilisateur"} ; rapport : ${MEASURE_REPORT_FILE}`);
    const c1Line = contradictionAnalysis.documents
      .map((document) => `${document.title} ${format(document.similarity)}${document.transmitted ? "" : " (non transmis)"}`)
      .join(", ");
    console.log(
      `measure:search — c1 : ${contradictionAnalysis.passes ? "atteint" : "NON atteint"} (≥ ${formatThreshold(CONTRADICTION_MIN_SIMILARITY)} et transmis) : ${c1Line}`,
    );
  } catch (error) {
    if (!(error instanceof MeasureError || error instanceof LiveSearchError || error instanceof SeedError)) throw error;
    console.error(`measure:search — échec : ${error.message}`);
    process.exit(1);
  }
}

// Exécuté seulement en ligne de commande ; casse de la lettre de lecteur ignorée sous Windows.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath) {
  void main();
}
