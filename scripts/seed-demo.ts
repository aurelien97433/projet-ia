// Préchargement du Jeu de démonstration (story 2.8, AD-21) : npm run seed:demo -- [--mini] [--remote] [--yes]
// Les variables viennent du seul fichier .env.seed, que Next.js ne lit pas. Le script crée les Comptes
// et les Documents avec la clé service_role, puis déclenche process-document comme Next.js. Il
// n'appelle jamais OpenAI, ne lit aucune clé OpenAI, et n'affiche ni identifiant ni secret.
// Story 7.1b : sans --mini, Jeu complet (demo/jeu-demonstration.json). Avant toute écriture, le plan
// (cible, Comptes, action par Document, Documents hors manifeste) est calculé en lecture seule et
// affiché ; sur une cible distante, rien n'est écrit sans « oui » au terminal (ou --yes). Le script ne
// supprime jamais rien.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeText } from "../supabase/functions/_shared/rag/normalize.ts";
import { invalidSecretsFromEnv, parseEnvLines, SEED_ENV_FILE } from "./check-secrets";

const DEMO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "demo");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const REQUEST_NAMESPACE = "nexamind-demo-mini";
const TRIGGER_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_INTERVAL_MS = 1_000;
const EXPECTED_MODEL = "text-embedding-3-small";
// Un vecteur réel est dense ; un vecteur simulé n'a que quelques composantes non nulles par mot.
const MIN_REAL_NON_ZERO = 1_000;

export class SeedError extends Error {}

export type Account = { email: string; password: string };

export type SeedConfig = {
  url: string;
  serviceRoleKey: string;
  processSecret: string;
  demoA: Account;
  demoB: Account;
  measure: Account[];
};

const ACCOUNT_VARIABLES = ["DEMO_ACCOUNT_A", "DEMO_ACCOUNT_B", "MEASURE_ACCOUNT_1", "MEASURE_ACCOUNT_2", "MEASURE_ACCOUNT_3"];

// Lit le contenu de .env.seed. Toute variable absente est nommée, sans jamais afficher de valeur.
export function parseSeedEnv(text: string): SeedConfig {
  const env = parseEnvLines(text);
  const required = [
    "SEED_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PROCESS_DOCUMENT_SECRET",
    ...ACCOUNT_VARIABLES.flatMap((name) => [`${name}_EMAIL`, `${name}_PASSWORD`]),
  ];
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) throw new SeedError(`variables absentes de ${SEED_ENV_FILE} : ${missing.join(", ")}.`);

  const invalid = invalidSecretsFromEnv(env);
  if (invalid.length > 0) {
    throw new SeedError(invalid.map(({ name, reason }) => `${name} : ${reason} (valeur masquée).`).join(" "));
  }

  const emails = ACCOUNT_VARIABLES.map((name) => env[`${name}_EMAIL`].toLowerCase());
  if (new Set(emails).size !== emails.length) throw new SeedError(`deux Comptes de ${SEED_ENV_FILE} ont la même adresse e-mail.`);

  const account = (name: string): Account => ({ email: env[`${name}_EMAIL`], password: env[`${name}_PASSWORD`] });
  return {
    url: env.SEED_SUPABASE_URL.replace(/\/+$/, ""),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    processSecret: env.PROCESS_DOCUMENT_SECRET,
    demoA: account("DEMO_ACCOUNT_A"),
    demoB: account("DEMO_ACCOUNT_B"),
    measure: [account("MEASURE_ACCOUNT_1"), account("MEASURE_ACCOUNT_2"), account("MEASURE_ACCOUNT_3")],
  };
}

// Hôte visé. Écrire sur un projet distant exige --remote : le fichier seul ne suffit pas.
export function targetHost(url: string, remote: boolean): string {
  let host: string;
  let protocol: string;
  try {
    ({ hostname: host, protocol } = new URL(url));
  } catch {
    throw new SeedError("SEED_SUPABASE_URL n'est pas une URL valide.");
  }
  if (LOCAL_HOSTS.has(host)) return host;
  if (!remote) {
    throw new SeedError(`la cible ${host} est distante : relancez avec --remote pour confirmer. Rien n'a été écrit.`);
  }
  if (protocol !== "https:") throw new SeedError("un projet distant exige une adresse https : les secrets ne circulent jamais en clair.");
  return host;
}

// Identifiant de demande déterministe : avec l'Auteur, il forme la clé naturelle du Document.
export function requestIdFor(key: string): string {
  const hash = createHash("sha1").update(`${REQUEST_NAMESPACE}:${key}`).digest("hex");
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export type DemoDocument = {
  key: string;
  title: string;
  category: string;
  author: "A" | "B";
  text: string;
};

export type DemoSet = { authors: Record<"A" | "B", string>; documents: DemoDocument[] };

function loadSet(demoDir: string, manifestFile: string): DemoSet {
  const manifest = JSON.parse(readFileSync(path.join(demoDir, manifestFile), "utf8")) as {
    authors: DemoSet["authors"];
    documents: (Omit<DemoDocument, "text"> & { file: string })[];
  };
  return {
    authors: manifest.authors,
    documents: manifest.documents.map(({ file, ...document }) => ({
      ...document,
      text: normalizeText(readFileSync(path.join(demoDir, "documents", file), "utf8")),
    })),
  };
}

export function loadMiniSet(demoDir = DEMO_DIR): DemoSet {
  return loadSet(demoDir, "documents-mini.json");
}

// Story 7.1b : Jeu complet (15 Documents), mêmes clés que le mini Jeu pour les 9 Documents communs.
export function loadFullSet(demoDir = DEMO_DIR): DemoSet {
  return loadSet(demoDir, "jeu-demonstration.json");
}

// Action prévue pour un Document du Jeu (story 7.1b) : décidée par cette seule fonction, pour le plan
// affiché comme pour l'écriture.
export type PlannedAction = "créé" | "déjà prêt" | "titre ou Catégorie à jour" | "déjà en cours" | "mis à jour" | "repris";

export type ExistingState = {
  title: string;
  category: string;
  status: string;
  sameText: boolean;
  passages: number;
  effectiveStatus: string;
};

export function planAction(document: Pick<DemoDocument, "title" | "category">, existing: ExistingState | null): PlannedAction {
  if (!existing) return "créé";
  if (existing.status === "ready" && existing.sameText && existing.passages > 0) {
    return existing.title === document.title && existing.category === document.category ? "déjà prêt" : "titre ou Catégorie à jour";
  }
  // Statut effectif calculé par la base (AD-6) : une tentative encore vivante n'est pas remplacée,
  // sinon sa vectorisation serait payée pour rien.
  if (existing.effectiveStatus === "processing" && existing.sameText) return "déjà en cours";
  return existing.sameText ? "repris" : "mis à jour";
}

// Libellés du plan affiché avant toute écriture.
export const PLAN_LABELS: Record<PlannedAction, string> = {
  créé: "à créer",
  "déjà prêt": "inchangé",
  "titre ou Catégorie à jour": "titre ou Catégorie à mettre à jour",
  "déjà en cours": "traitement déjà en cours",
  "mis à jour": "texte mis à jour (retraité)",
  repris: "à reprendre (retraité)",
};

// Attend la fin du traitement : prêt, ou échec explicite en erreur ou au-delà du délai.
export async function waitForReady(
  title: string,
  readStatus: () => Promise<{ status: string; errorKind: string | null }>,
  { timeoutMs = READY_TIMEOUT_MS, pollMs = POLL_INTERVAL_MS } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { status, errorKind } = await readStatus();
    if (status === "ready") return;
    if (status === "error") throw new SeedError(`« ${title} » est passé en erreur (${errorKind ?? "inconnue"}).`);
    if (Date.now() >= deadline) throw new SeedError(`« ${title} » n'est pas prêt après ${Math.round(timeoutMs / 1000)} s.`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

async function findUserId(admin: SupabaseClient, email: string): Promise<string | undefined> {
  const wanted = email.toLowerCase();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new SeedError(`lecture des Comptes impossible (${error.code ?? error.status}).`);
    const found = data.users.find((user) => user.email?.toLowerCase() === wanted);
    if (found) return found.id;
    if (data.users.length < 200) return undefined;
  }
}

// Crée ou réaligne un Compte : e-mail confirmé, mot de passe du fichier, nom fictif.
export async function ensureAccount(admin: SupabaseClient, account: Account, displayName: string): Promise<string> {
  const existingId = await findUserId(admin, account.email);
  let id = existingId;
  if (id) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: account.password, email_confirm: true });
    if (error) throw new SeedError(`mise à jour d'un Compte impossible (${error.code ?? error.status}).`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    });
    if (error || !data.user) throw new SeedError(`création d'un Compte impossible (${error?.code ?? error?.status}).`);
    id = data.user.id;
  }
  const { error } = await admin.from("profiles").update({ display_name: displayName }).eq("id", id);
  if (error) throw new SeedError(`mise à jour d'un profil impossible (${error.code}).`);
  return id;
}

type Target = { id: string; attemptId: string };

type Prepared = { id: string; target: Target | null; wait: boolean; action: string };

type ExistingRow = { id: string; text_version: number };

// Lecture seule : ligne existante du Document (clé naturelle : Auteur + identifiant de demande) et
// état utile à planAction. Auteur encore inexistant : aucune ligne.
async function readExisting(
  admin: SupabaseClient,
  document: DemoDocument,
  authorId: string | undefined,
): Promise<{ row: ExistingRow; state: ExistingState } | null> {
  if (!authorId) return null;
  const { data: existing, error } = await admin
    .from("documents")
    .select("id, title, category, status, content_text, text_version")
    .eq("author_id", authorId)
    .eq("client_request_id", requestIdFor(document.key))
    .maybeSingle();
  if (error) throw new SeedError(`lecture de « ${document.title} » impossible (${error.code}).`);
  if (!existing) return null;
  const { count, error: countError } = await admin
    .from("passages")
    .select("id", { count: "exact", head: true })
    .eq("document_id", existing.id);
  if (countError) throw new SeedError(`lecture des Passages de « ${document.title} » impossible (${countError.code}).`);
  const { data: view, error: viewError } = await admin
    .from("documents_list")
    .select("effective_status")
    .eq("id", existing.id)
    .single();
  if (viewError) throw new SeedError(`lecture de « ${document.title} » impossible (${viewError.code}).`);
  return {
    row: { id: existing.id, text_version: existing.text_version },
    state: {
      title: existing.title,
      category: existing.category,
      status: existing.status,
      sameText: existing.content_text === document.text,
      passages: count ?? 0,
      effectiveStatus: view.effective_status,
    },
  };
}

async function prepareDocument(admin: SupabaseClient, document: DemoDocument, authorId: string): Promise<Prepared> {
  const clientRequestId = requestIdFor(document.key);
  const found = await readExisting(admin, document, authorId);
  const action = planAction(document, found?.state ?? null);

  if (!found) {
    const { data, error: insertError } = await admin
      .from("documents")
      .insert({
        author_id: authorId,
        title: document.title,
        category: document.category,
        content_text: document.text,
        client_request_id: clientRequestId,
      })
      .select("id, attempt_id")
      .single();
    if (insertError || !data) throw new SeedError(`création de « ${document.title} » impossible (${insertError?.code}).`);
    return { id: data.id, target: { id: data.id, attemptId: data.attempt_id }, wait: true, action };
  }

  const existing = found.row;
  const sameText = found.state.sameText;
  if (action === "déjà prêt") return { id: existing.id, target: null, wait: false, action };
  if (action === "titre ou Catégorie à jour") {
    const { error: renameError } = await admin
      .from("documents")
      .update({ title: document.title, category: document.category })
      .eq("id", existing.id);
    if (renameError) throw new SeedError(`mise à jour de « ${document.title} » impossible (${renameError.code}).`);
    return { id: existing.id, target: null, wait: false, action };
  }
  if (action === "déjà en cours") return { id: existing.id, target: null, wait: true, action };

  // Reprise sur la même ligne : texte modifié, erreur, Passages absents ou tentative expirée.
  const attemptId = randomUUID();
  const { error: updateError } = await admin
    .from("documents")
    .update({
      title: document.title,
      category: document.category,
      content_text: document.text,
      text_version: sameText ? existing.text_version : existing.text_version + 1,
      status: "processing",
      attempt_id: attemptId,
      processing_started_at: new Date().toISOString(),
      error_kind: null,
      error_message: null,
    })
    .eq("id", existing.id);
  if (updateError) throw new SeedError(`reprise de « ${document.title} » impossible (${updateError.code}).`);
  return { id: existing.id, target: { id: existing.id, attemptId }, wait: true, action };
}

// Déclenchement impossible : comme l'abandon de Next.js, le Document ne reste pas en cours.
async function markTriggerFailed(admin: SupabaseClient, target: Target): Promise<void> {
  await admin
    .from("documents")
    .update({
      status: "error",
      error_kind: "temporary",
      error_message: "Le préchargement n'a pas pu déclencher le traitement.",
    })
    .eq("id", target.id)
    .eq("attempt_id", target.attemptId)
    .eq("status", "processing");
}

async function triggerProcessing(config: SeedConfig, title: string, target: Target): Promise<void> {
  let status: number;
  try {
    const response = await fetch(`${config.url}/functions/v1/process-document`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.processSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: target.id, attempt_id: target.attemptId }),
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    });
    await response.body?.cancel().catch(() => {});
    status = response.status;
  } catch (error) {
    throw new SeedError(`process-document ne répond pas pour « ${title} » (${(error as Error).name}).`);
  }
  if (status !== 202) throw new SeedError(`process-document a répondu ${status} pour « ${title} ».`);
}

export type DocumentReport = {
  key: string;
  title: string;
  action: string;
  status: string;
  passages: number;
  model: string | null;
  realEmbeddings: boolean;
  durationMs: number;
};

const nonZeroCount = (embedding: string) => (JSON.parse(embedding) as number[]).filter((value) => value !== 0).length;

async function inspectDocument(admin: SupabaseClient, id: string): Promise<Omit<DocumentReport, "key" | "title" | "action" | "durationMs">> {
  const { data: document, error: documentError } = await admin.from("documents").select("status").eq("id", id).single();
  if (documentError) throw new SeedError(`lecture d'un Document impossible (${documentError.code}).`);
  const { data: passages, error } = await admin
    .from("passages")
    .select("embedding, embedding_model")
    .eq("document_id", id)
    .order("ordinal");
  if (error) throw new SeedError(`lecture des Passages impossible (${error.code}).`);
  const rows = (passages ?? []) as { embedding: string; embedding_model: string }[];
  return {
    status: document.status,
    passages: rows.length,
    model: rows[0]?.embedding_model ?? null,
    realEmbeddings: rows.length > 0 && rows.every((row) => nonZeroCount(row.embedding) >= MIN_REAL_NON_ZERO),
  };
}

// Contrôle final : chaque Document est prêt, avec des Passages et, en distant, de vrais vecteurs.
export function assertReports(reports: DocumentReport[], requireRealEmbeddings: boolean): void {
  for (const report of reports) {
    if (report.status !== "ready") throw new SeedError(`« ${report.title} » n'est pas prêt (${report.status}).`);
    if (report.passages === 0) throw new SeedError(`« ${report.title} » n'a aucun Passage.`);
    if (report.model !== EXPECTED_MODEL) throw new SeedError(`« ${report.title} » n'a pas le modèle attendu.`);
    if (requireRealEmbeddings && !report.realEmbeddings) {
      throw new SeedError(`« ${report.title} » n'a pas de vrais vecteurs : la vectorisation simulée a-t-elle été activée ?`);
    }
  }
}

// Plan calculé en lecture seule avant toute écriture (story 7.1b).
export type SeedPlan = {
  accounts: { label: string; exists: boolean }[];
  documents: { title: string; author: string; action: PlannedAction }[];
  // Documents présents sur la cible mais absents du Jeu : affichés seulement, jamais supprimés.
  outside: { title: string; author: string; status: string }[];
};

export async function planSeed(admin: SupabaseClient, config: SeedConfig, set: DemoSet): Promise<SeedPlan> {
  const accounts = [
    { label: `Auteur A (${set.authors.A})`, account: config.demoA },
    { label: `Auteur B (${set.authors.B})`, account: config.demoB },
    ...config.measure.map((account, index) => ({ label: `Compte de mesure ${index + 1}`, account })),
  ];
  const ids = new Map<string, string | undefined>();
  for (const { account } of accounts) ids.set(account.email, await findUserId(admin, account.email));
  const authorIds = { A: ids.get(config.demoA.email), B: ids.get(config.demoB.email) };

  const documents: SeedPlan["documents"] = [];
  for (const document of set.documents) {
    const found = await readExisting(admin, document, authorIds[document.author]);
    documents.push({ title: document.title, author: set.authors[document.author], action: planAction(document, found?.state ?? null) });
  }

  const { data: rows, error } = await admin.from("documents").select("title, status, author_id, client_request_id");
  if (error) throw new SeedError(`lecture des Documents impossible (${error.code}).`);
  const expected = new Set(
    set.documents.flatMap((document) => {
      const authorId = authorIds[document.author];
      return authorId ? [`${authorId}:${requestIdFor(document.key)}`] : [];
    }),
  );
  const others = ((rows ?? []) as { title: string; status: string; author_id: string; client_request_id: string | null }[]).filter(
    (row) => !expected.has(`${row.author_id}:${row.client_request_id}`),
  );
  const names = new Map<string, string>();
  const otherAuthors = [...new Set(others.map((row) => row.author_id))];
  if (otherAuthors.length > 0) {
    const { data: profiles, error: profileError } = await admin.from("profiles").select("id, display_name").in("id", otherAuthors);
    if (profileError) throw new SeedError(`lecture des profils impossible (${profileError.code}).`);
    for (const profile of (profiles ?? []) as { id: string; display_name: string | null }[]) {
      names.set(profile.id, profile.display_name ?? "(sans nom)");
    }
  }
  return {
    accounts: accounts.map(({ label, account }) => ({ label, exists: ids.get(account.email) !== undefined })),
    documents,
    outside: others
      .map((row) => ({ title: row.title, author: names.get(row.author_id) ?? "(sans nom)", status: row.status }))
      .sort((a, b) => a.title.localeCompare(b.title, "fr")),
  };
}

// Plan affiché : cible, Comptes, action par Document, Documents hors manifeste. Ni e-mail ni secret.
export function formatPlan(plan: SeedPlan, host: string): string[] {
  const count = (action: PlannedAction) => plan.documents.filter((document) => document.action === action).length;
  const summary = (Object.keys(PLAN_LABELS) as PlannedAction[])
    .filter((action) => count(action) > 0)
    .map((action) => `${count(action)} ${PLAN_LABELS[action]}`)
    .join(", ");
  return [
    `seed:demo — plan (rien n'est encore écrit) ; cible : ${host}`,
    "Comptes :",
    ...plan.accounts.map((account) => `  - ${account.label} : ${account.exists ? "existant, réaligné (mot de passe du fichier, e-mail confirmé)" : "à créer"}`),
    `Documents du Jeu (${plan.documents.length}) : ${summary}`,
    ...plan.documents.map((document) => `  - ${document.title} (${document.author}) : ${PLAN_LABELS[document.action]}`),
    plan.outside.length === 0
      ? "Documents hors manifeste : aucun."
      : `Documents hors manifeste (${plan.outside.length}, affichés seulement, jamais supprimés) :`,
    ...plan.outside.map((document) => `  - ${document.title} (${document.author}, ${document.status})`),
  ];
}

export type SeedOptions = {
  set?: DemoSet;
  requireRealEmbeddings?: boolean;
  log?: (line: string) => void;
  timeoutMs?: number;
  pollMs?: number;
  // Cible affichée dans le plan.
  host?: string;
  // Appelée après l'affichage du plan, avant toute écriture : faux → arrêt, rien d'écrit.
  confirm?: (plan: SeedPlan) => Promise<boolean>;
};

export async function seedMini(config: SeedConfig, options: SeedOptions = {}): Promise<DocumentReport[]> {
  const { set = loadMiniSet(), requireRealEmbeddings = false, log = console.log } = options;
  const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const plan = await planSeed(admin, config, set);
  for (const line of formatPlan(plan, options.host ?? new URL(config.url).host)) log(line);
  if (options.confirm && !(await options.confirm(plan))) {
    throw new SeedError("préchargement annulé : rien n'a été écrit.");
  }

  const authors = {
    A: await ensureAccount(admin, config.demoA, set.authors.A),
    B: await ensureAccount(admin, config.demoB, set.authors.B),
  };
  for (const [index, account] of config.measure.entries()) {
    await ensureAccount(admin, account, `Compte de mesure ${index + 1}`);
  }
  log(`seed:demo — ${2 + config.measure.length} Comptes prêts.`);

  const reports: DocumentReport[] = [];
  for (const document of set.documents) {
    const started = Date.now();
    const { id, target, wait, action } = await prepareDocument(admin, document, authors[document.author]);
    if (target) {
      try {
        await triggerProcessing(config, document.title, target);
      } catch (error) {
        await markTriggerFailed(admin, target);
        throw error;
      }
    }
    if (wait) {
      await waitForReady(
        document.title,
        async () => {
          const { data, error } = await admin.from("documents").select("status, error_kind").eq("id", id).single();
          if (error || !data) throw new SeedError(`lecture de « ${document.title} » impossible (${error?.code}).`);
          return { status: data.status, errorKind: data.error_kind };
        },
        options,
      );
    }
    const inspected = await inspectDocument(admin, id);
    const report = { key: document.key, title: document.title, action, ...inspected, durationMs: Date.now() - started };
    reports.push(report);
    log(`seed:demo — ${report.title} : ${report.action}, ${report.status}, ${report.passages} Passage(s), ${report.durationMs} ms.`);
  }

  assertReports(reports, requireRealEmbeddings);
  log(`seed:demo — contrôle final réussi : ${reports.length} Documents prêts, ${reports.reduce((sum, r) => sum + r.passages, 0)} Passages.`);
  return reports;
}

// --seed-file et non --env-file : tsx transmet --env-file à Node, qui chargerait alors le fichier
// dans process.env.
export function parseArguments(argv: string[]): { mini: boolean; remote: boolean; yes: boolean; seedFile: string } {
  const options = { mini: false, remote: false, yes: false, seedFile: SEED_ENV_FILE };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mini") options.mini = true;
    else if (argument === "--remote") options.remote = true;
    else if (argument === "--yes") options.yes = true;
    else if (argument === "--seed-file" && argv[index + 1]) options.seedFile = argv[(index += 1)];
    // Une option ignorée pourrait envoyer le script vers le mauvais projet.
    else throw new SeedError(`option non reconnue ou incomplète : ${argument}.`);
  }
  return options;
}

// Confirmation d'une écriture distante : « oui » tapé au terminal, ou --yes. Sans terminal interactif
// et sans --yes : refus (rien n'est écrit).
export async function confirmRemote(
  yes: boolean,
  interactive: boolean,
  ask: (question: string) => Promise<string>,
): Promise<boolean> {
  if (yes) return true;
  if (!interactive) throw new SeedError("cible distante sans terminal interactif : relancez avec --yes pour confirmer. Rien n'a été écrit.");
  return (await ask("Taper « oui » pour écrire sur cette cible : ")).trim().toLowerCase() === "oui";
}

async function askTerminal(question: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
}

async function main(): Promise<void> {
  try {
    const { mini, remote, yes, seedFile } = parseArguments(process.argv.slice(2));
    if (!existsSync(seedFile)) throw new SeedError(`${seedFile} est introuvable. Procédure : docs/environnements.md.`);
    const config = parseSeedEnv(readFileSync(seedFile, "utf8"));
    const host = targetHost(config.url, remote);
    const local = LOCAL_HOSTS.has(host);
    await seedMini(config, {
      set: mini ? loadMiniSet() : loadFullSet(),
      requireRealEmbeddings: remote,
      host: `${host} (${mini ? "mini Jeu" : "Jeu complet"})`,
      confirm: local ? undefined : () => confirmRemote(yes, Boolean(process.stdin.isTTY), askTerminal),
    });
  } catch (error) {
    if (!(error instanceof SeedError)) throw error;
    console.error(`seed:demo — échec : ${error.message}`);
    process.exit(1);
  }
}

// Exécuté seulement en ligne de commande ; casse de la lettre de lecteur ignorée sous Windows.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath) {
  void main();
}
