// Test de charge de la limite de taille (story 2.7, FR-5). Importe un .txt puis un .md de texte français
// réaliste, juste sous la limite en vigueur (100 Ko = 100 000 octets : fichiers de 90 000 à 100 000
// octets) ou sous la taille donnée par --size, par le vrai chemin (dépôt par URL signée avec le Compte de
// mesure 1, import_file_document, process-document), mesure, juge les trois conditions, écrit le
// rapport et nettoie dans tous les cas. Le nom « load:1mo » vient de la limite d'origine (1 Mo).
//
//   npm run load:1mo                            pile locale (vecteurs simulés) : mécanique et nettoyage
//   npm run load:1mo -- --remote                projet distant lié : vraie mesure (deux imports réels)
//   npm run load:1mo -- --remote --size=<octets> autre taille, de 20 000 à 1 000 000 octets
//   npm run load:1mo -- --remote --cleanup      restes seulement, sans import (--confirm au-delà de 2)
//
// Sécurité : cible exigée (projet lié, .env.seed et clé publique concordants) ; clé service_role lue
// dans .env.seed seulement (pile locale : `supabase status`), jamais affichée ; requêtes SQL de la
// CLI constantes et en lecture seule ; aucun e-mail, mot de passe, jeton ni URL signée affiché ou écrit.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEED_ENV_FILE } from "./check-secrets";
import { parseCliRows } from "./cli-rows";
import { readLinkedProjectRef } from "./deploy-supabase";
import { buildMeasureText } from "./generate-measure-note";
import { parseSeedEnv } from "./seed-demo";
import { openLiveSession } from "./test-search-live";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPORTS_DIR = path.join("docs", "mesures");
// Titre exact des Documents de test, seul critère du nettoyage avec l'Auteur (décision du 2026-11-12).
export const LOAD_TITLE = "Test de charge 1 Mo";
// Limite en vigueur (100 Ko = 100 000 octets) : même valeur que MAX_FILE_BYTES (src/lib/files.ts), le
// bucket et la fonction d'import (test). Taille mesurée par défaut.
export const APP_LIMIT_BYTES = 100_000;
// --size=<octets> : taille maximale des deux fichiers ; ils sont générés entre size − 10 000 et size.
export const SIZE_WINDOW = 10_000;
export const MIN_SIZE = 20_000;
// Borne haute de --size : 1 000 000 octets, gardée pour mesurer une future écriture des Passages par
// lots (option reportée après l'Epic 5). Au-delà de la limite en vigueur, le dépôt est refusé par le
// bucket : une telle mesure n'a de sens qu'après relèvement de la limite.
export const MAX_FILE_BYTES = 1_000_000;
// 1 Mo = 1 000 000 octets, comme partout dans le projet (plus strict que 1 048 576).
export const MB = 1_000_000;
export const CONDITIONS = { readyMs: 180_000, addedBytes: 50 * MB, totalBytes: 400 * MB } as const;
// Attente du Statut final : au-delà des 3 min de la condition, pour observer un Document tardif.
export const WAIT_MS = 210_000;
// Nettoyage : au-delà, --cleanup exige --confirm (décision du 2026-11-12).
export const CLEANUP_LIMIT = 2;
export const CLEANUP_ATTEMPTS = 3;
export const CLEANUP_RETRY_MS = 10_000;
// Tarif de text-embedding-3-small : 0,02 $ par million de tokens (vérifié le 2026-11-03).
export const USD_PER_MILLION_TOKENS = 0.02;

export class LoadTestError extends Error {}

const BUCKET = "documents";
const SUPABASE_BIN = path.join("node_modules", ".bin", "supabase");

// Lecture seule, constante : aucune valeur n'est jamais interpolée dans une requête de la CLI.
export const SIZE_SQL =
  "select pg_database_size(current_database()) as database_bytes, " +
  "pg_total_relation_size('public.documents') as documents_bytes, " +
  "pg_total_relation_size('public.passages') as passages_bytes";

export type FileKind = "txt" | "md";
export type LoadFile = { kind: FileKind; bytes: Uint8Array<ArrayBuffer>; characters: number };
export type Sizes = { database: number; documents: number; passages: number };

// Texte français réaliste (générateur de la story 2.4) : paragraphes entiers ajoutés tant que le
// fichier reste sous `targetBytes` ; le .md porte des intertitres.
export type SizeRange = { min: number; max: number; target: number };

// Taille mesurée : --size, sinon la limite en vigueur.
export function effectiveSize(size: number | null): number {
  return size ?? APP_LIMIT_BYTES;
}

// Bornes des fichiers : de size − 10 000 à size octets.
export function sizeRange(size: number | null): SizeRange {
  const max = effectiveSize(size);
  return { min: max - SIZE_WINDOW, max, target: max - 1_000 };
}

// Rapport : un fichier par taille, jamais écrasé (un rapport existant peut porter une décision) ;
// une nouvelle mesure de la même taille est écrite dans charge-<taille>-octets-2.md, -3…
export function reportFileFor(size: number | null, exists: (file: string) => boolean = () => false): string {
  const base = path.join(REPORTS_DIR, `charge-${effectiveSize(size)}-octets`);
  if (!exists(`${base}.md`)) return `${base}.md`;
  for (let index = 2; ; index += 1) if (!exists(`${base}-${index}.md`)) return `${base}-${index}.md`;
}

export function buildLoadFile(kind: FileKind, range: SizeRange = sizeRange(null)): LoadFile {
  const targetBytes = range.target;
  const encoder = new TextEncoder();
  const paragraphs = buildMeasureText(targetBytes * 1.2).split("\n\n");
  const parts: string[] = [];
  let size = 0;
  for (const [index, paragraph] of paragraphs.entries()) {
    const block = kind === "md" ? `## Section ${index + 1}\n\n${paragraph.replace(/^Section \d+\. /, "")}` : paragraph;
    const blockSize = encoder.encode(block).length + (parts.length > 0 ? 2 : 0);
    if (size + blockSize > targetBytes) break;
    parts.push(block);
    size += blockSize;
  }
  const text = `${kind === "md" ? "# Test de charge\n\n" : ""}${parts.join("\n\n")}\n`;
  const bytes = encoder.encode(text);
  if (bytes.length < range.min || bytes.length > range.max) {
    throw new LoadTestError(`fichier .${kind} de ${bytes.length} octets, hors de [${range.min} ; ${range.max}].`);
  }
  return { kind, bytes, characters: text.length };
}

export type Measure = {
  kind: FileKind;
  documentId: string | null;
  fileBytes: number;
  characters: number;
  status: string;
  errorKind: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  passages: number;
  before: Sizes;
  after: Sizes;
};

export type Verdict = { ready: boolean; inTime: boolean; addedOk: boolean; totalOk: boolean; passes: boolean };

export function verdict(measure: Measure): Verdict {
  const ready = measure.status === "ready";
  const inTime = ready && measure.durationMs !== null && measure.durationMs < CONDITIONS.readyMs;
  const addedOk = measure.after.database - measure.before.database < CONDITIONS.addedBytes;
  const totalOk = measure.after.database < CONDITIONS.totalBytes;
  return { ready, inTime, addedOk, totalOk, passes: ready && inTime && addedOk && totalOk };
}

// Limite confirmée par la mesure : 1 Mo par défaut, sinon la taille maximale demandée (--size).
export function limitLabel(size: number | null): string {
  const bytes = effectiveSize(size);
  if (bytes === MAX_FILE_BYTES) return "limite de 1 Mo";
  if (bytes === APP_LIMIT_BYTES) return "limite de 100 Ko";
  return `limite de ${bytes} octets`;
}

export function estimateCost(characters: number): { tokens: number; usd: number } {
  const tokens = Math.ceil(characters / 4);
  return { tokens, usd: (tokens / 1_000_000) * USD_PER_MILLION_TOKENS };
}

// Proposition chiffrée si une condition échoue (jamais appliquée : arbitrage de l'utilisateur).
export function proposal(measures: Measure[]): string | null {
  const lines: string[] = [];
  for (const measure of measures) {
    const v = verdict(measure);
    if (v.passes) continue;
    const added = measure.after.database - measure.before.database;
    if (!v.ready) {
      lines.push(
        `- .${measure.kind} non prêt (${measure.status}${measure.errorKind ? `, ${measure.errorKind}` : ""}) : ` +
          "écrire les Passages par lots (tentative courante vérifiée à chaque lot, validation finale unique), " +
          "ou limiter les fichiers (et les Notes) à 300 000 octets, estimation à confirmer par une mesure.",
      );
    } else if (!v.inTime && measure.durationMs) {
      const limit = Math.floor((measure.fileBytes * (CONDITIONS.readyMs * 0.8)) / measure.durationMs / 10_000) * 10_000;
      lines.push(`- .${measure.kind} prêt en ${decimal(measure.durationMs / 1000, 1)} s : limite proposée ${limit} octets (80 % de 3 min).`);
    }
    if (!v.addedOk) {
      const limit = Math.floor((measure.fileBytes * CONDITIONS.addedBytes * 0.8) / added / 10_000) * 10_000;
      lines.push(`- .${measure.kind} : ${decimal(added / MB, 1)} Mo ajoutés : limite proposée ${limit} octets (80 % de 50 Mo).`);
    }
    if (!v.totalOk) {
      lines.push(
        `- base à ${decimal(measure.after.database / MB, 1)} Mo : nettoyer les Documents de test avant le Jeu complet (7.1b), ` +
          "ou réduire le Jeu de démonstration.",
      );
    }
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

// Refus du nettoyage par --cleanup au-delà de 2 Documents sans --confirm.
export function checkCleanupCount(count: number, mode: "run" | "cleanup", confirm: boolean): void {
  if (mode === "cleanup" && count > CLEANUP_LIMIT && !confirm) {
    throw new LoadTestError(
      `${count} Documents « ${LOAD_TITLE} » du Compte de mesure 1 : plus de ${CLEANUP_LIMIT}, relancez avec --confirm pour les supprimer. Rien n'a été supprimé.`,
    );
  }
}

export function parseSizes(rows: unknown): Sizes {
  const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
  const value = (name: string) => {
    const number = Number(row?.[name]);
    if (!Number.isFinite(number) || number <= 0) throw new LoadTestError(`taille illisible (${name}).`);
    return number;
  };
  return { database: value("database_bytes"), documents: value("documents_bytes"), passages: value("passages_bytes") };
}

// Nombres du rapport à la française (virgule décimale).
const decimal = (value: number, digits: number) => value.toFixed(digits).replace(".", ",");
const mb = (bytes: number) => `${decimal(bytes / MB, 1)} Mo`;
const yes = (value: boolean) => (value ? "oui" : "**non**");

export function buildLoadReport(input: {
  host: string;
  account: string;
  date: Date;
  measures: Measure[];
  size?: number | null;
  afterCleanup: Sizes | null;
  remaining: number | null;
}): string {
  const { host, account, date, measures, afterCleanup, remaining, size = null } = input;
  const verdicts = measures.map(verdict);
  const allPass = measures.length === 2 && verdicts.every((v) => v.passes);
  const totalCost = measures.reduce((sum, m) => sum + estimateCost(m.characters).usd, 0);
  const rows = measures.map((m, index) => {
    const v = verdicts[index];
    const added = m.after.database - m.before.database;
    const duration = m.durationMs === null ? "—" : `${decimal(m.durationMs / 1000, 1)} s`;
    return `| .${m.kind} | ${m.fileBytes} | ${m.characters} | ${m.passages} | ${m.status}${m.errorKind ? ` (${m.errorKind})` : ""} | ${duration} | ${mb(added)} | ${mb(m.after.database)} | ${decimal(estimateCost(m.characters).usd, 4)} $ | ${yes(v.inTime)} / ${yes(v.addedOk)} / ${yes(v.totalOk)} |`;
  });
  const failures = measures
    .filter((m) => m.errorMessage)
    .map((m) => `- .${m.kind} : ${m.errorMessage}`);
  const suggestion = proposal(measures);
  return [
    measures.length > 0 && Math.max(...measures.map((m) => m.fileBytes)) <= 500_000
      ? `# Test de charge : fichiers de ${Math.min(...measures.map((m) => m.fileBytes))} à ${Math.max(...measures.map((m) => m.fileBytes))} octets (story 2.7)`
      : "# Test de charge de la limite de 1 Mo (story 2.7)",
    "",
    `- Date : ${date.toISOString()}`,
    `- Cible : ${host}`,
    `- Compte : ${account}`,
    `- Conditions (par fichier) : *prêt* en moins de 3 min ; moins de 50 Mo ajoutés ; base totale sous 400 Mo (1 Mo = 1 000 000 octets)`,
    `- Résultat : ${allPass ? `**${limitLabel(size)} confirmée**` : "**au moins une condition échouée** (proposition ci-dessous, non appliquée)"}`,
    `- Coût estimé : ${decimal(totalCost, 4)} $ (tokens ≈ caractères / 4, ${decimal(USD_PER_MILLION_TOKENS, 2)} $ par million, tarif du 2026-11-03)`,
    "",
    "| Fichier | Octets | Caractères | Passages | Statut | Durée | Ajouté | Base totale | Coût | < 3 min / < 50 Mo / < 400 Mo |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "Durée : `updated_at - processing_started_at` (de la création du Document après vérification du fichier jusqu'à l'écriture finale).",
    "",
    "## Tailles de la base",
    "",
    "| Moment | Base | `documents` | `passages` (index HNSW compris) |",
    "| --- | --- | --- | --- |",
    ...(measures[0] ? [`| Avant le premier import | ${mb(measures[0].before.database)} | ${mb(measures[0].before.documents)} | ${mb(measures[0].before.passages)} |`] : []),
    ...measures.map((m) => `| Après le .${m.kind} | ${mb(m.after.database)} | ${mb(m.after.documents)} | ${mb(m.after.passages)} |`),
    afterCleanup
      ? `| Après nettoyage | ${mb(afterCleanup.database)} | ${mb(afterCleanup.documents)} | ${mb(afterCleanup.passages)} |`
      : "| Après nettoyage | non mesurée | | |",
    "",
    `Documents de test restants après nettoyage : ${remaining ?? "non vérifié"}. PostgreSQL ne rend pas aussitôt l'espace des lignes supprimées : la taille après nettoyage peut rester supérieure à celle d'avant le test jusqu'au passage de l'autovacuum.`,
    "",
    "## Journaux de process-document (relevés par l'utilisateur)",
    "",
    "Dans le tableau de bord Supabase, journaux de la fonction `process-document`, filtrer sur l'identifiant de chaque Document :",
    "",
    "| Fichier | Document | `embed_ms` | `complete_ms` | `duration_ms` | Échec (`process_document_work_failed`, code) |",
    "| --- | --- | --- | --- | --- | --- |",
    ...measures.map((m) => `| .${m.kind} | ${m.documentId ?? "—"} | à relever | à relever | à relever | à relever |`),
    "",
    ...(failures.length > 0 ? ["## Messages d'erreur enregistrés", "", ...failures, ""] : []),
    "## Proposition",
    "",
    suggestion ?? "Aucune : les trois conditions sont réunies pour les deux fichiers.",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// Exécution

type Context = {
  host: string;
  url: string;
  remoteRef: string | null;
  client: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  processSecret: string;
  dispose: () => Promise<void>;
};

// Ligne de commande de la CLI. --read-only : transaction en lecture seule ; sur le projet distant, la
// CLI n'exige alors aucune confirmation (sinon : HostedMutationConsentRequiredError, impossible à
// satisfaire hors terminal interactif, cause de l'échec du 2026-11-12).
export function sqlCommand(remoteRef: string | null): string {
  return [
    SUPABASE_BIN,
    "db",
    "query",
    ...(remoteRef ? [`--remote=${remoteRef}`] : []),
    "--read-only",
    "--output-format",
    "json",
    `"${SIZE_SQL}"`,
  ].join(" ");
}

// Masque ce qui pourrait ressembler à un secret dans un message de la CLI (adresse de connexion,
// clé, jeton), puis le limite à une ligne raisonnable.
export function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[masqué]")
    .replace(/\b(sb_(?:secret|publishable)_[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g, "[masqué]")
    .replace(/(password|passwd|pwd|token|secret|apikey)(\s*[=:]\s*)\S+/gi, "$1$2[masqué]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

// Cause d'une erreur Supabase (base ou Storage) : code et message s'ils existent, masqués. Une panne
// réseau ou un délai dépassé n'a pas de code : sans ce repli, le message affichait « undefined ».
export function describeError(error: { code?: unknown; message?: unknown; name?: unknown } | null | undefined): string {
  const parts = [error?.code, error?.message ?? error?.name].filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return parts.length > 0 ? redact(parts.join(" : ")) : "cause non précisée";
}

// Cause réelle d'un échec de la CLI : code et message de son erreur JSON, sinon stderr, sinon le code de sortie.
export function cliFailure(stdout: string, stderr: string, status: number | null): string {
  try {
    const parsed = JSON.parse(stdout.slice(stdout.indexOf("{"))) as { error?: { code?: unknown; message?: unknown } };
    const code = typeof parsed.error?.code === "string" ? parsed.error.code : null;
    const message = typeof parsed.error?.message === "string" ? parsed.error.message : null;
    if (code || message) return redact([code, message].filter(Boolean).join(" : "));
  } catch {
    // Sortie non JSON : stderr ci-dessous.
  }
  const lines = stderr.split(/\r?\n/).filter((line) => line.trim() !== "" && !line.startsWith("Target:"));
  if (lines.length > 0) return redact(lines.join(" "));
  return `code de sortie ${status ?? "inconnu"}, sans message`;
}

// Taille de la base, lue par la CLI. `step` nomme l'étape dans le message en cas d'échec.
function runSql(remoteRef: string | null, step: string): Sizes {
  const result = spawnSync(sqlCommand(remoteRef), {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new LoadTestError(`${step} : supabase db query a échoué : ${cliFailure(result.stdout ?? "", result.stderr ?? "", result.status)}.`);
  }
  try {
    return parseSizes(parseCliRows(result.stdout ?? ""));
  } catch (error) {
    throw new LoadTestError(`${step} : ${(error as Error).message}`);
  }
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

// Étape en cours, citée dans le message d'une erreur inattendue (réseau, réponse illisible).
let currentStep = "préparation";
const step = (name: string) => {
  currentStep = name;
};

async function remoteContext(): Promise<Context> {
  const session = await openLiveSession("load:1mo");
  const seed = parseSeedEnv(readFileSync(path.join(ROOT, SEED_ENV_FILE), "utf8"));
  if (new URL(seed.url).hostname !== session.target.host) throw new LoadTestError(".env.seed ne vise pas le projet lié.");
  // Les tailles sont lues par la CLI : sans référence liée identique à la cible, elle lirait la base
  // locale sans le dire.
  const remoteRef = readLinkedProjectRef(path.join(ROOT, "supabase"));
  if (!remoteRef || `${remoteRef}.supabase.co` !== session.target.host) {
    throw new LoadTestError("le projet lié par la CLI ne correspond pas à la cible. Rien n'a été écrit.");
  }
  const { data } = await session.client.auth.getUser();
  if (!data.user) throw new LoadTestError("session du Compte de mesure 1 invalide.");
  return {
    host: session.target.host,
    url: session.target.url,
    remoteRef,
    client: session.client,
    admin: createClient(session.target.url, seed.serviceRoleKey, options),
    userId: data.user.id,
    processSecret: seed.processSecret,
    dispose: async () => {},
  };
}

async function localContext(): Promise<Context> {
  const status = spawnSync(`${SUPABASE_BIN} status -o json`, { cwd: ROOT, encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "ignore"] });
  let local: Record<string, string>;
  try {
    local = JSON.parse(status.stdout.slice(status.stdout.indexOf("{")));
  } catch {
    throw new LoadTestError("Supabase local ne répond pas : lancez npx supabase start.");
  }
  const host = new URL(local.API_URL).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new LoadTestError("la pile locale doit être sur 127.0.0.1.");
  const secretLine = readFileSync(path.join(ROOT, "supabase", "functions", ".env"), "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith("PROCESS_DOCUMENT_SECRET="));
  if (!secretLine) throw new LoadTestError("PROCESS_DOCUMENT_SECRET absent de supabase/functions/.env.");

  const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);
  // Compte de mesure local, propre à cette exécution, supprimé à la fin.
  const credentials = { email: `charge-1mo-${Date.now()}@exemple.test`, password: crypto.randomUUID() };
  const created = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
  if (created.error || !created.data.user) throw new LoadTestError("création du Compte local impossible.");
  const userId = created.data.user.id;
  const client = createClient(local.API_URL, local.PUBLISHABLE_KEY, options);
  const signIn = await client.auth.signInWithPassword(credentials);
  if (signIn.error) {
    await admin.auth.admin.deleteUser(userId);
    throw new LoadTestError("connexion du Compte local impossible.");
  }
  return {
    host,
    url: local.API_URL,
    remoteRef: null,
    client,
    admin,
    userId,
    processSecret: secretLine.slice("PROCESS_DOCUMENT_SECRET=".length),
    dispose: async () => {
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

// Documents de test : Auteur = Compte de mesure 1 ET titre exactement « Test de charge 1 Mo ».
async function findTestDocuments(context: Context): Promise<{ id: string; storage_path: string | null }[]> {
  const { data, error } = await context.admin
    .from("documents")
    .select("id, storage_path")
    .eq("author_id", context.userId)
    .eq("title", LOAD_TITLE);
  if (error) throw new LoadTestError(`lecture des Documents de test impossible (${describeError(error)}).`);
  return data ?? [];
}

async function cleanup(context: Context, mode: "run" | "cleanup", confirm: boolean, uploadedPaths: string[]): Promise<number> {
  const documents = await findTestDocuments(context);
  console.log(`load:1mo — nettoyage : ${documents.length} Document(s) « ${LOAD_TITLE} » du Compte de mesure 1.`);
  checkCleanupCount(documents.length, mode, confirm);
  // Objets : ceux des Documents, plus ceux déposés par cette exécution sans Document (import échoué).
  const own = `${context.userId}/uploads/`;
  const paths = [...new Set([...documents.map((d) => d.storage_path), ...uploadedPaths])].filter(
    (value): value is string => typeof value === "string" && value.startsWith(own),
  );
  // Fichiers d'abord : si cette étape échoue, les Documents restent et --cleanup retrouve leurs chemins.
  if (paths.length > 0) {
    const { error } = await context.admin.storage.from(BUCKET).remove(paths);
    if (error) throw new LoadTestError(`suppression des fichiers impossible (${describeError(error)}).`);
  }
  if (documents.length > 0) {
    const { error } = await context.admin.from("documents").delete().in("id", documents.map((d) => d.id));
    if (error) throw new LoadTestError(`suppression des Documents impossible (${describeError(error)}).`);
  }
  return (await findTestDocuments(context)).length;
}

async function importOne(context: Context, file: LoadFile, uploadedPaths: string[]): Promise<Measure> {
  const before = runSql(context.remoteRef, `taille de la base avant le .${file.kind}`);
  const uploadId = `${crypto.randomUUID()}.${file.kind}`;
  const objectPath = `${context.userId}/uploads/${uploadId}`;
  step(`URL de dépôt du .${file.kind}`);
  const signed = await context.client.storage.from(BUCKET).createSignedUploadUrl(objectPath);
  if (signed.error || !signed.data) throw new LoadTestError("URL de dépôt refusée.");
  uploadedPaths.push(objectPath);
  step(`dépôt du .${file.kind}`);
  const put = await fetch(signed.data.signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "false", "Content-Type": file.kind === "md" ? "text/markdown" : "text/plain" },
    body: file.bytes,
  });
  if (!put.ok) throw new LoadTestError(`dépôt refusé (HTTP ${put.status}).`);

  step(`import du .${file.kind}`);
  const imported = await context.client.rpc("import_file_document", {
    p_title: LOAD_TITLE,
    p_category: "other",
    p_upload_id: uploadId,
    p_client_request_id: crypto.randomUUID(),
  });
  const row = (imported.data as { document_id: string; attempt_to_start: string | null }[] | null)?.[0];
  if (imported.error || !row?.attempt_to_start) {
    throw new LoadTestError(`import refusé (${imported.error ? describeError(imported.error) : "sans tentative"}).`);
  }
  console.log(`load:1mo — .${file.kind} : ${file.bytes.length} octets, Document ${row.document_id}`);

  step(`déclenchement du traitement du .${file.kind}`);
  const trigger = await fetch(`${context.url}/functions/v1/process-document`, {
    method: "POST",
    headers: { Authorization: `Bearer ${context.processSecret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: row.document_id, attempt_id: row.attempt_to_start }),
    signal: AbortSignal.timeout(15_000),
  });
  await trigger.body?.cancel().catch(() => {});
  if (trigger.status !== 202) throw new LoadTestError(`process-document a répondu ${trigger.status}.`);

  type Row = { status: string; error_kind: string | null; error_message: string | null; processing_started_at: string; updated_at: string };
  step(`attente du Statut final du .${file.kind}`);
  let state: Row | null = null;
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const { data } = await context.admin
      .from("documents")
      .select("status, error_kind, error_message, processing_started_at, updated_at")
      .eq("id", row.document_id)
      .single();
    state = data as Row | null;
    if (state && state.status !== "processing") break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  const finished = state && state.status !== "processing";
  const { count } = await context.admin
    .from("passages")
    .select("id", { count: "exact", head: true })
    .eq("document_id", row.document_id);
  const measure: Measure = {
    kind: file.kind,
    documentId: row.document_id,
    fileBytes: file.bytes.length,
    characters: file.characters,
    status: finished ? state!.status : "processing (attente dépassée)",
    errorKind: state?.error_kind ?? null,
    errorMessage: state?.error_message ?? null,
    durationMs: finished ? Date.parse(state!.updated_at) - Date.parse(state!.processing_started_at) : null,
    passages: count ?? 0,
    before,
    after: runSql(context.remoteRef, `taille de la base après le .${file.kind}`),
  };
  const v = verdict(measure);
  console.log(
    `load:1mo — .${file.kind} : ${measure.status}, ${measure.passages} Passages, ` +
      `${measure.durationMs === null ? "durée non mesurée" : `${decimal(measure.durationMs / 1000, 1)} s`}, ` +
      `${mb(measure.after.database - measure.before.database)} ajoutés, base ${mb(measure.after.database)} — ${v.passes ? "conforme" : "NON conforme"}`,
  );
  return measure;
}

export type Arguments = { remote: boolean; cleanupOnly: boolean; confirm: boolean; size: number | null };

export function parseArguments(argv: string[]): Arguments {
  const known = new Set(["--remote", "--cleanup", "--confirm"]);
  let size: number | null = null;
  const unknown: string[] = [];
  for (const arg of argv) {
    const match = /^--size=(\d+)$/.exec(arg);
    if (match) {
      size = Number(match[1]);
      if (!Number.isSafeInteger(size) || size < MIN_SIZE || size > MAX_FILE_BYTES) {
        throw new LoadTestError(`--size doit être un nombre d'octets entre ${MIN_SIZE} et ${MAX_FILE_BYTES}.`);
      }
    } else if (!known.has(arg)) unknown.push(arg);
  }
  if (unknown.length > 0) throw new LoadTestError(`option inconnue : ${unknown.join(" ")}.`);
  return { remote: argv.includes("--remote"), cleanupOnly: argv.includes("--cleanup"), confirm: argv.includes("--confirm"), size };
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.remote && !existsSync(path.join(ROOT, SEED_ENV_FILE))) throw new LoadTestError(`${SEED_ENV_FILE} est introuvable.`);
  // Fichiers générés avant toute connexion : une erreur ici ne laisse rien derrière elle.
  const range = sizeRange(args.size);
  const files = args.cleanupOnly ? [] : [buildLoadFile("txt", range), buildLoadFile("md", range)];
  const context = args.remote ? await remoteContext() : await localContext();
  // Projet distant : openLiveSession a déjà affiché la cible.
  if (!args.remote) console.log(`load:1mo — cible : ${context.host} (pile locale, vecteurs simulés)`);

  if (args.cleanupOnly) {
    try {
      const remaining = await cleanup(context, "cleanup", args.confirm, []);
      console.log(`load:1mo — nettoyage terminé, ${remaining} Document(s) de test restant(s).`);
    } finally {
      await context.dispose();
    }
    return;
  }

  // Un import qui reste d'une exécution précédente fausserait la mesure : il faut d'abord --cleanup.
  step("recherche de restes d'une exécution précédente");
  const leftovers = await findTestDocuments(context);
  if (leftovers.length > 0) {
    await context.dispose();
    throw new LoadTestError(`${leftovers.length} Document(s) de test d'une exécution précédente : lancez d'abord --cleanup.`);
  }

  const uploadedPaths: string[] = [];
  const measures: Measure[] = [];
  let cleaned: Promise<number> | null = null;
  // Nettoyage avec nouvelles tentatives : juste après un traitement lourd, la base peut rester occupée
  // plusieurs dizaines de secondes (test du 2026-11-12) ; un premier échec n'est pas définitif.
  const cleanWithRetries = async (): Promise<number> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await cleanup(context, "run", false, uploadedPaths);
      } catch (error) {
        if (attempt >= CLEANUP_ATTEMPTS) throw error;
        console.error(`load:1mo — nettoyage, essai ${attempt} sur ${CLEANUP_ATTEMPTS} échoué : ${(error as Error).message} Nouvel essai dans ${CLEANUP_RETRY_MS / 1000} s.`);
        await new Promise((resolve) => setTimeout(resolve, CLEANUP_RETRY_MS));
      }
    }
  };
  const cleanOnce = () => (cleaned ??= cleanWithRetries());

  // Interruption (Ctrl+C) : nettoyage, puis sortie en échec.
  const interrupt = (signal: string) => {
    console.log(`load:1mo — ${signal} reçu : nettoyage avant de quitter…`);
    cleanOnce()
      .catch((error) => console.error(`load:1mo — nettoyage incomplet : ${(error as Error).message} Relancez avec --cleanup.`))
      .finally(() => process.exit(130));
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  let failure: unknown = null;
  let remaining: number | null = null;
  let afterCleanup: Sizes | null = null;
  try {
    for (const file of files) measures.push(await importOne(context, file, uploadedPaths));
  } catch (error) {
    failure = error;
  } finally {
    try {
      remaining = await cleanOnce();
      if (remaining > 0) console.error(`load:1mo — nettoyage incomplet : ${remaining} Document(s) restant(s). Relancez avec --cleanup.`);
    } catch (error) {
      console.error(`load:1mo — nettoyage incomplet : ${(error as Error).message} Relancez avec --cleanup.`);
    }
    // Taille après nettoyage : mesurée seulement si un import a eu lieu ; un échec ici n'est pas un
    // défaut du nettoyage.
    if (uploadedPaths.length > 0) {
      try {
        afterCleanup = runSql(context.remoteRef, "taille de la base après nettoyage");
      } catch (error) {
        console.error(`load:1mo — taille après nettoyage non mesurée : ${(error as Error).message}`);
      }
    }
    await context.dispose();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }

  // Rien de mesuré : le rapport existant n'est pas écrasé.
  if (measures.length === 0) {
    if (failure) throw failure;
    return;
  }
  const account = args.remote ? "Compte de mesure 1 de .env.seed" : "Compte local temporaire, supprimé à la fin";
  const report = buildLoadReport({ host: context.host, account, date: new Date(), measures, size: args.size, afterCleanup, remaining });
  const reportName = reportFileFor(args.size, (file) => existsSync(path.join(ROOT, file)));
  const reportFile = args.remote ? path.join(ROOT, reportName) : path.join(tmpdir(), path.basename(reportName).replace(".md", "-local.md"));
  writeFileSync(reportFile, report);
  console.log(`load:1mo — rapport : ${args.remote ? reportName : reportFile}`);
  if (failure) throw failure;
  const passes = measures.length === 2 && measures.every((measure) => verdict(measure).passes);
  console.log(`load:1mo — ${passes ? `${limitLabel(args.size)} confirmée` : "au moins une condition échouée : voir la proposition du rapport"}.`);
  if (!passes) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Toute erreur : son nom et son message (masqué), jamais la seule classe.
    const detail =
      error instanceof LoadTestError
        ? error.message
        : `étape « ${currentStep} » : ${(error as Error).name} : ${redact((error as Error).message ?? "")}`;
    console.error(`load:1mo — échec : ${detail}`);
    process.exit(1);
  });
}
