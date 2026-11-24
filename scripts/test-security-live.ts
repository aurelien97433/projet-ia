// Test réel de sécurité (story 7.3) : npm run test:security:live
// Lancé par l'utilisateur seul, après le push et Vercel prêt, jamais par les tests automatiques ni par un
// agent. Cible : la production (UJ2_LIVE_URL de .env.seed, https, jamais affichée) et le projet distant
// lié (mêmes contrôles que test:search:live : projet lié, https, clé publique de .env.local). Trois volets :
//
// 1. SM-6, avec les Comptes de démonstration A et B (sessions par mot de passe, jamais service_role) :
//    A crée une Note marquée « — test SM-6 {horodatage} » (insertion avec sa session, puis traitement
//    déclenché comme le fait Next.js : process-document et PROCESS_DOCUMENT_SECRET de .env.seed) ; B la
//    lit et la retrouve par semantic-search ; B ne peut ni la modifier ni la supprimer (0 ligne ou refus,
//    Note relue inchangée par A). Conversations (décision de l'utilisateur du 2026-11-24 : aucun droit
//    DELETE sur les Conversations, le script n'en crée aucune) : A compte ses Conversations et messages
//    existants (au moins 1 de chaque, sinon arrêt : critère non prouvé, jamais un succès vide) ; B tente
//    de les lire (filtrés sur les identifiants de A) : 0 ligne attendue. Nettoyage par la session de A
//    avant la création, après l'essai, en cas d'échec et sur Ctrl+C : Note (et son fichier éventuel) ;
//    contrôle final : aucun Document « — test SM-6 » restant.
// 2. Sans session : chaque Route Handler de src/app/api, avec sa méthode réelle → 401, code
//    UNAUTHENTICATED, aucune donnée dans le corps. Écart avec l'epic (validé le 2026-11-24) : la route
//    « quota » n'existe pas (quota lu côté serveur) ; les 9 Route Handlers réels sont testés.
// 3. Code envoyé au navigateur : page de connexion et fichiers /_next/static/ qu'elle charge, analysés
//    avec les motifs de check-secrets.ts → aucun secret, aucune adresse api.openai.com, aucune clé
//    service_role.
//
// Rapport docs/mesures/securite-live.md (jamais écrasé : -2, -3…), sans secret, e-mail, jeton ni URL de
// production ; ni mot de passe, ni e-mail, ni jeton dans la sortie. Coût : aucune unité de quota.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseEnvLines, scanText, SECRET_NAMES, SEED_ENV_FILE, type Finding } from "./check-secrets";
import { readLinkedProjectRef } from "./deploy-supabase";
import { parseSeedEnv, SeedError, type Account } from "./seed-demo";
import { nextFreeReportPath } from "./test-chat-live";
import { LiveSearchError, resolveLiveTarget, ROOT, type LiveTarget } from "./test-search-live";
import { cleanupMarkedDocuments } from "../tests/e2e/support/uj2";

export const REPORT_FILE = path.join("docs", "mesures", "securite-live.md");
export const SM6_MARK = "— test SM-6";
const PUBLIC_ENV_FILE = ".env.local";
const REQUEST_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 120_000;
const MAX_STATIC_FILES = 400;

export class LiveSecurityError extends Error {}

// ---------------------------------------------------------------------------------------------------
// Volet 2 : appels sans session.
// ---------------------------------------------------------------------------------------------------

// Route Handlers de src/app/api (dossier relatif) et leur méthode réelle. La liste est comparée au
// contenu de src/app/api par un test unitaire : une route ajoutée sans être testée ici le fait échouer.
export const API_ROUTES: { route: string; method: "GET" | "POST" }[] = [
  { route: "chat", method: "POST" },
  { route: "conversations", method: "GET" },
  { route: "documents", method: "GET" },
  { route: "documents/[id]", method: "GET" },
  { route: "documents/[id]/status", method: "GET" },
  { route: "documents/[id]/summary", method: "POST" },
  { route: "documents/statuses", method: "GET" },
  { route: "search", method: "POST" },
  { route: "uploads", method: "POST" },
];

// Dossiers de src/app/api qui contiennent un route.ts (séparateur « / »), triés.
export function listApiRoutes(root = ROOT): string[] {
  const base = path.join(root, "src", "app", "api");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.isFile() && /^route\.(ts|tsx|js)$/.test(entry.name)) {
        found.push(path.relative(base, dir).split(path.sep).join("/"));
      }
    }
  };
  walk(base);
  return found.sort();
}

// Adresse appelée : identifiant de Document aléatoire (jamais un Document réel) ; corps JSON plausible
// pour les POST, pour que seule l'absence de session puisse expliquer le refus.
export function routeRequest(route: string, method: "GET" | "POST"): { path: string; body?: string } {
  const id = crypto.randomUUID();
  const pathname = `/api/${route.replace("[id]", id)}`;
  const query = route === "documents/statuses" ? `?ids=${id}` : route === "conversations" ? "?limit=5" : "";
  if (method === "GET") return { path: `${pathname}${query}` };
  const bodies: Record<string, unknown> = {
    chat: { question: "Question de contrôle sans session", clientRequestId: crypto.randomUUID() },
    search: { query: "contrôle sans session" },
    uploads: { fileName: "controle.txt", size: 10 },
  };
  return { path: pathname, body: JSON.stringify(bodies[route] ?? {}) };
}

export type UnauthenticatedOutcome = { route: string; method: string; status: number; code: string | null; onlyError: boolean; passed: boolean };

// 401, code UNAUTHENTICATED, et rien d'autre que l'erreur (code, message, réessayable) dans le corps.
export function evaluateUnauthenticated(route: string, method: string, status: number, body: unknown): UnauthenticatedOutcome {
  const record = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const error = record?.error !== null && typeof record?.error === "object" ? (record.error as Record<string, unknown>) : null;
  const code = typeof error?.code === "string" ? error.code : null;
  const onlyError =
    record !== null &&
    Object.keys(record).length === 1 &&
    error !== null &&
    Object.keys(error).every((key) => ["code", "message", "retryable"].includes(key));
  return { route, method, status, code, onlyError, passed: status === 401 && code === "UNAUTHENTICATED" && onlyError };
}

export async function runUnauthenticated(appOrigin: string): Promise<UnauthenticatedOutcome[]> {
  const outcomes: UnauthenticatedOutcome[] = [];
  for (const { route, method } of API_ROUTES) {
    const request = routeRequest(route, method);
    let status = 0;
    let body: unknown = null;
    try {
      const response = await fetch(`${appOrigin}${request.path}`, {
        method,
        headers: request.body ? { "Content-Type": "application/json" } : {},
        body: request.body,
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      status = response.status;
      body = await response.json().catch(() => null);
    } catch {
      status = 0;
    }
    const outcome = evaluateUnauthenticated(route, method, status, body);
    outcomes.push(outcome);
    console.log(`  ${outcome.passed ? "ok " : "NON"} ${method} /api/${route} : HTTP ${status}, ${outcome.code ?? "-"}`);
  }
  return outcomes;
}

// ---------------------------------------------------------------------------------------------------
// Volet 3 : code envoyé au navigateur.
// ---------------------------------------------------------------------------------------------------

// Chemins /_next/static/… cités dans un texte (HTML, charge RSC, JavaScript, CSS), sans doublon.
export function extractStaticPaths(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.replace(/\\\//g, "/").matchAll(/\/_next\/static\/[A-Za-z0-9_\-./~%@]+/g)) {
    const clean = match[0].replace(/[.]+$/, "");
    if (/\.(js|css|mjs)$/.test(clean)) found.add(clean);
  }
  return [...found];
}

export const FORBIDDEN_BROWSER_TEXT = ["api.openai.com", ...SECRET_NAMES];

// Motifs de check-secrets.ts (clés OpenAI, clés secrètes Supabase, JWT service_role, affectations,
// valeurs de .env.seed) et textes interdits (adresse d'OpenAI, noms des secrets). Jamais de valeur.
export function scanBrowserFile(file: string, text: string, secretValues: string[]): Finding[] {
  const findings = scanText(text, file, secretValues);
  for (const name of FORBIDDEN_BROWSER_TEXT) {
    const index = text.indexOf(name);
    if (index !== -1) {
      findings.push({ file, line: text.slice(0, index).split("\n").length, kind: name === "api.openai.com" ? "adresse d'OpenAI" : "nom d'un secret" });
    }
  }
  return findings;
}

// Valeurs de .env.seed cherchées dans le code envoyé (secrets, identifiants des Comptes), sauf les deux
// adresses publiques : l'URL du projet Supabase (incorporée au code client) et celle de la production.
export function browserSecretValues(seedText: string): string[] {
  return Object.entries(parseEnvLines(seedText))
    .filter(([name]) => name !== "SEED_SUPABASE_URL" && name !== "UJ2_LIVE_URL")
    .map(([, value]) => value)
    .filter((value) => value.length >= 8);
}

export type BrowserCodeOutcome = { files: number; findings: Finding[]; failedFetches: number; passed: boolean };

export async function runBrowserCode(appOrigin: string, secretValues: string[]): Promise<BrowserCodeOutcome> {
  const findings: Finding[] = [];
  let failedFetches = 0;
  const page = await fetch(`${appOrigin}/connexion`, { redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (page.status !== 200) throw new LiveSecurityError(`la page de connexion a répondu ${page.status}.`);
  const html = await page.text();
  findings.push(...scanBrowserFile("/connexion", html, secretValues));
  const queue = extractStaticPaths(html);
  const seen = new Set(queue);
  let files = 1;
  while (queue.length > 0 && files < MAX_STATIC_FILES) {
    const asset = queue.shift()!;
    try {
      const response = await fetch(`${appOrigin}${asset}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        failedFetches += 1;
        continue;
      }
      const text = await response.text();
      files += 1;
      findings.push(...scanBrowserFile(asset, text, secretValues));
      // Fichiers chargés à leur tour (morceaux cités par un morceau).
      for (const next of extractStaticPaths(text)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    } catch {
      failedFetches += 1;
    }
  }
  const passed = findings.length === 0 && failedFetches === 0 && files > 1;
  console.log(`  ${passed ? "ok " : "NON"} ${files} fichier(s) analysé(s), ${findings.length} constat(s), ${failedFetches} lecture(s) en échec`);
  return { files, findings, failedFetches, passed };
}

// ---------------------------------------------------------------------------------------------------
// Volet 1 : SM-6.
// ---------------------------------------------------------------------------------------------------

export type Sm6Observations = {
  noteReady: boolean;
  bReadsNote: boolean;
  bFindsNote: boolean;
  // error : code de l'erreur renvoyée (null : aucune erreur) ; rows : lignes touchées.
  bUpdate: { error: string | null; rows: number };
  bDelete: { error: string | null; rows: number };
  noteUnchanged: boolean;
  aConversations: number | null;
  aMessages: number | null;
  bConversations: number | null;
  bMessages: number | null;
};

export type Sm6Criterion = { id: string; label: string; passed: boolean; detail: string };

// Une erreur compte comme un refus ; son code est consigné, la preuve reste la Note relue inchangée.
const refused = (attempt: { error: string | null; rows: number }) => attempt.error !== null || attempt.rows === 0;
const describeAttempt = (attempt: { error: string | null; rows: number }) =>
  attempt.error !== null ? `refus (code ${attempt.error})` : `${attempt.rows} ligne(s)`;

// Les trois critères de SM-6 (story 7.3).
export function evaluateSm6(o: Sm6Observations): Sm6Criterion[] {
  return [
    {
      id: "1",
      label: "B lit la Note de A et la retrouve par semantic-search",
      passed: o.noteReady && o.bReadsNote && o.bFindsNote,
      detail: `Note prête : ${o.noteReady ? "oui" : "non"} ; lecture par B : ${o.bReadsNote ? "oui" : "non"} ; Recherche de B : ${o.bFindsNote ? "trouvée" : "absente"}`,
    },
    {
      id: "2",
      label: "B ne peut ni modifier ni supprimer la Note de A",
      passed: refused(o.bUpdate) && refused(o.bDelete) && o.noteUnchanged,
      detail: `modification : ${describeAttempt(o.bUpdate)} ; suppression : ${describeAttempt(o.bDelete)} ; Note relue par A : ${o.noteUnchanged ? "inchangée" : "MODIFIÉE ou absente"}`,
    },
    {
      id: "3",
      label: "B ne voit ni les Conversations de A ni leurs messages",
      // Jamais un succès vide : A doit avoir au moins une Conversation et un message existants.
      passed:
        o.aConversations !== null && o.aConversations >= 1 && o.aMessages !== null && o.aMessages >= 1 && o.bConversations === 0 && o.bMessages === 0,
      detail: `existants chez A : ${o.aConversations ?? "?"} Conversation(s), ${o.aMessages ?? "?"} message(s) ; vus par B : ${o.bConversations ?? "?"} Conversation(s), ${o.bMessages ?? "?"} message(s) ; aucune Conversation créée, 0 unité`,
    },
  ];
}

export type CleanupOutcome = { noteRemaining: number | null; markedLeft: number | null; error: string | null };

// ---------------------------------------------------------------------------------------------------
// Rapport.
// ---------------------------------------------------------------------------------------------------

export type SecurityReportInput = {
  date?: Date;
  sm6: Sm6Criterion[];
  sm6Error: string | null;
  cleanup: CleanupOutcome;
  unauthenticated: UnauthenticatedOutcome[];
  browser: BrowserCodeOutcome | null;
  browserError: string | null;
};

export function isSecurityPassed(input: SecurityReportInput): boolean {
  return (
    input.sm6Error === null &&
    input.sm6.length === 3 &&
    input.sm6.every((criterion) => criterion.passed) &&
    input.cleanup.noteRemaining === 0 &&
    input.cleanup.markedLeft === 0 &&
    input.unauthenticated.length === API_ROUTES.length &&
    input.unauthenticated.every((outcome) => outcome.passed) &&
    input.browserError === null &&
    input.browser?.passed === true
  );
}

const cell = (text: string) => text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

export function buildSecurityReport(input: SecurityReportInput): string {
  const passed = isSecurityPassed(input);
  const browser = input.browser;
  return [
    "# Sécurité en production — test:security:live (story 7.3)",
    "",
    `- Date : ${(input.date ?? new Date()).toISOString()}`,
    "- Cible : production (URL non écrite) et projet Supabase distant lié",
    "- Comptes : Comptes de démonstration A et B de .env.seed (sessions par mot de passe, jamais service_role)",
    `- Résultat : ${passed ? "réussi" : "ÉCHEC"}`,
    "",
    "## SM-6 — Cloisonnement entre Comptes",
    "",
    input.sm6Error ? `Essai interrompu : ${cell(input.sm6Error)}` : "",
    "| Critère | Vérification | Détail | Conforme |",
    "| --- | --- | --- | --- |",
    ...input.sm6.map((c) => `| ${c.id} | ${cell(c.label)} | ${cell(c.detail)} | ${c.passed ? "oui" : "NON"} |`),
    "",
    "### Nettoyage (session de A)",
    "",
    `- Note « ${SM6_MARK} » de A restante : ${input.cleanup.noteRemaining ?? "inconnu"}`,
    `- Documents « ${SM6_MARK} » restants (tous Auteurs, contrôle final) : ${input.cleanup.markedLeft ?? "inconnu"}`,
    input.cleanup.error ? `- Incident : ${cell(input.cleanup.error)}` : "",
    "",
    "## Appels sans session (Route Handlers de src/app/api)",
    "",
    "Écart avec l'epic (validé par l'utilisateur le 2026-11-24) : la route « quota » citée par l'epic n'existe pas (quota lu côté serveur) ; les 9 Route Handlers réels sont testés.",
    "",
    "| Route | Méthode | Statut | Code | Corps limité à l'erreur | Conforme |",
    "| --- | --- | --- | --- | --- | --- |",
    ...input.unauthenticated.map(
      (o) => `| /api/${o.route} | ${o.method} | ${o.status} | ${o.code ?? "-"} | ${o.onlyError ? "oui" : "NON"} | ${o.passed ? "oui" : "NON"} |`,
    ),
    "",
    "## Code envoyé au navigateur (page de connexion et fichiers /_next/static/ chargés)",
    "",
    "Portée : la page /connexion et les fichiers /_next/static/ qu'elle charge (et ceux qu'ils citent) ; les morceaux propres aux autres écrans ne sont pas lus (contrôlés au build par check:secrets --static).",
    "",
    input.browserError
      ? `Analyse interrompue : ${cell(input.browserError)}`
      : browser
        ? `- ${browser.files} fichier(s) analysé(s) ; lectures en échec : ${browser.failedFetches} ; constats : ${browser.findings.length} ; conforme : ${browser.passed ? "oui" : "NON"}`
        : "- non exécutée",
    ...(browser?.findings ?? []).map((f) => `  - ${cell(f.file)}:${f.line} — ${f.kind} (valeur masquée)`),
    "",
  ]
    .filter((line, index, lines) => !(line === "" && lines[index - 1] === ""))
    .join("\n");
}

// Valeurs de .env.seed (secrets, e-mails, mots de passe, URL de production et son hôte) : masquées dans
// le rapport et dans toute sortie, par précaution.
export function seedValuesToRedact(seedText: string): string[] {
  const values = Object.values(parseEnvLines(seedText)).filter((value) => value.length >= 6);
  const hosts = values.flatMap((value) => {
    try {
      const url = new URL(value);
      return url.protocol.startsWith("http") ? [url.origin, url.host] : [];
    } catch {
      return [];
    }
  });
  return [...new Set([...values, ...hosts])].sort((a, b) => b.length - a.length);
}

export function redact(text: string, values: string[]): string {
  let output = text;
  for (const value of values) output = output.split(value).join("[masqué]");
  // Jetons JWT éventuels (aucun n'est écrit, par précaution).
  return output.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[jeton masqué]");
}

// ---------------------------------------------------------------------------------------------------
// Exécution.
// ---------------------------------------------------------------------------------------------------

// URL de production (UJ2_LIVE_URL, https) : jamais affichée.
export function readAppOrigin(seed: Record<string, string>): string {
  const raw = seed.UJ2_LIVE_URL;
  if (!raw) throw new LiveSecurityError(`UJ2_LIVE_URL absente de ${SEED_ENV_FILE} (docs/environnements.md).`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LiveSecurityError("UJ2_LIVE_URL n'est pas une URL valide.");
  }
  if (url.protocol !== "https:") throw new LiveSecurityError("UJ2_LIVE_URL doit être une adresse https (production Vercel).");
  return url.origin;
}

type DemoSession = { client: SupabaseClient; userId: string; token: string };

async function openSession(target: LiveTarget, account: Account, label: "A" | "B"): Promise<DemoSession> {
  const client = createClient(target.url, target.publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword(account);
  if (error || !data.session) throw new LiveSecurityError(`connexion du Compte de démonstration ${label} refusée (${error?.code ?? "sans session"}).`);
  return { client, userId: data.session.user.id, token: data.session.access_token };
}

const stampNow = () => `${new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "")} ${Math.random().toString(36).slice(2, 6)}`;

type Sm6Run = { observations: Sm6Observations; error: string | null; cleanup: CleanupOutcome };

// Nettoyage par la session de A : Notes marquées de A, puis contrôle (tous Auteurs).
async function cleanupSm6(a: DemoSession, cleanup: CleanupOutcome): Promise<void> {
  try {
    cleanup.noteRemaining = await cleanupMarkedDocuments(a.client, a.userId, SM6_MARK);
    const left = await a.client.from("documents").select("id").like("title", `%${SM6_MARK}%`);
    cleanup.markedLeft = left.error ? null : (left.data ?? []).length;
  } catch (caught) {
    cleanup.error = caught instanceof Error ? caught.message : "erreur inconnue";
  }
}

async function runSm6(target: LiveTarget, accounts: { a: Account; b: Account }, processSecret: string): Promise<Sm6Run> {
  const o: Sm6Observations = {
    noteReady: false,
    bReadsNote: false,
    bFindsNote: false,
    bUpdate: { error: null, rows: -1 },
    bDelete: { error: null, rows: -1 },
    noteUnchanged: false,
    aConversations: null,
    aMessages: null,
    bConversations: null,
    bMessages: null,
  };
  const cleanup: CleanupOutcome = { noteRemaining: null, markedLeft: null, error: null };
  let error: string | null = null;
  const a = await openSession(target, accounts.a, "A");
  let b: DemoSession | null = null;
  // Interruption (Ctrl+C) : nettoyage par la session de A, puis sortie en échec (comme load:1mo).
  const interrupt = (signal: string) => {
    console.log(`test:security:live — ${signal} reçu : nettoyage avant de quitter…`);
    void cleanupSm6(a, cleanup).finally(() => {
      console.log(`  Nettoyage : ${cleanup.markedLeft ?? "?"} Document(s) « ${SM6_MARK} » restant(s)`);
      process.exit(130);
    });
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    // Reste d'un essai interrompu : supprimé avant toute création.
    const leftover = await cleanupMarkedDocuments(a.client, a.userId, SM6_MARK);
    if (leftover !== 0) throw new LiveSecurityError(`${leftover} Note(s) « ${SM6_MARK} » d'un essai précédent non supprimée(s).`);

    // Conversations : aucune n'est créée (aucun droit DELETE, décision du 2026-11-24). Celles de A
    // existent déjà ; sans au moins une Conversation et un message, le critère n'est pas prouvé.
    console.log("  A compte ses Conversations existantes");
    const own = await a.client.from("conversations").select("id").eq("owner_id", a.userId).limit(100);
    const conversationIds = own.error ? [] : (own.data ?? []).map((row) => (row as { id: string }).id);
    o.aConversations = own.error ? null : conversationIds.length;
    if (conversationIds.length > 0) {
      const ownMessages = await a.client.from("messages").select("id").in("conversation_id", conversationIds).limit(100);
      o.aMessages = ownMessages.error ? null : (ownMessages.data ?? []).length;
    }
    if (!o.aConversations || !o.aMessages) {
      throw new LiveSecurityError(
        "critère non prouvé : le Compte A n'a aucune Conversation avec message (posez une question avec A sur le site, puis relancez).",
      );
    }

    b = await openSession(target, accounts.b, "B");
    console.log("  B tente de lire les Conversations et les messages de A");
    const bConversations = await b.client.from("conversations").select("id").in("id", conversationIds);
    o.bConversations = bConversations.error ? null : (bConversations.data ?? []).length;
    const bMessages = await b.client.from("messages").select("id").in("conversation_id", conversationIds);
    o.bMessages = bMessages.error ? null : (bMessages.data ?? []).length;

    const code = `SM6-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const title = `Note de contrôle du cloisonnement ${SM6_MARK} ${stampNow()}`;
    const content = `Note de contrôle du cloisonnement entre Comptes. Le code de vérification de cet essai est ${code}. Cette Note est supprimée à la fin de l'essai.`;

    // A crée la Note (sa session, comme la Server Action), puis traitement déclenché comme Next.js.
    console.log("  A crée la Note marquée");
    const created = await a.client
      .from("documents")
      .insert({ title, category: "other", content_text: content, client_request_id: crypto.randomUUID() })
      .select("id, attempt_id")
      .single();
    if (created.error || !created.data) throw new LiveSecurityError(`création de la Note refusée (${created.error?.code ?? "sans ligne"}).`);
    const noteId = created.data.id as string;
    const trigger = await fetch(`${target.url}/functions/v1/process-document`, {
      method: "POST",
      headers: { Authorization: `Bearer ${processSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: noteId, attempt_id: created.data.attempt_id }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await trigger.body?.cancel().catch(() => {});
    if (trigger.status !== 202) throw new LiveSecurityError(`process-document a répondu ${trigger.status}.`);
    const deadline = Date.now() + READY_TIMEOUT_MS;
    for (;;) {
      const { data } = await a.client.from("documents").select("status").eq("id", noteId).single();
      const status = (data as { status?: string } | null)?.status;
      if (status === "ready") break;
      if (status === "error") throw new LiveSecurityError("la Note est passée en erreur pendant le traitement.");
      if (Date.now() > deadline) throw new LiveSecurityError("la Note n'est pas prête après 2 minutes.");
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    o.noteReady = true;

    // B lit la Note et la retrouve par la Recherche.
    console.log("  B lit et recherche la Note");
    const read = await b.client.from("documents").select("id, title").eq("id", noteId);
    o.bReadsNote = !read.error && (read.data ?? []).length === 1 && (read.data?.[0] as { title?: string }).title === title;
    const search = await fetch(`${target.url}/functions/v1/semantic-search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${b.token}`, apikey: target.publicKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `code de vérification ${code} du contrôle du cloisonnement entre Comptes` }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const found = (await search.json().catch(() => null)) as { results?: { documentId?: string; title?: string }[] } | null;
    o.bFindsNote = search.status === 200 && (found?.results ?? []).some((r) => r.documentId === noteId || r.title === title);

    // B tente de modifier puis de supprimer la Note (code d'erreur consigné).
    console.log("  B tente de modifier puis de supprimer la Note");
    const update = await b.client.from("documents").update({ title: `Modifiée par B ${SM6_MARK}` }).eq("id", noteId).select("id");
    o.bUpdate = { error: update.error ? (update.error.code ?? "inconnu") : null, rows: (update.data ?? []).length };
    const removal = await b.client.from("documents").delete().eq("id", noteId).select("id");
    o.bDelete = { error: removal.error ? (removal.error.code ?? "inconnu") : null, rows: (removal.data ?? []).length };
    const reread = await a.client.from("documents").select("title, content_text").eq("id", noteId).maybeSingle();
    const row = reread.data as { title?: string; content_text?: string } | null;
    o.noteUnchanged = !reread.error && row?.title === title && row?.content_text === content;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "erreur inconnue";
  } finally {
    // Nettoyage par la session de A, même en cas d'échec.
    await cleanupSm6(a, cleanup);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await a.client.auth.signOut().catch(() => {});
    await b?.client.auth.signOut().catch(() => {});
  }
  return { observations: o, error, cleanup };
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
  const seedFile = path.join(ROOT, SEED_ENV_FILE);
  let toRedact: string[] = [];
  try {
    if (!existsSync(seedFile)) throw new LiveSecurityError(`${SEED_ENV_FILE} est introuvable. Procédure : docs/environnements.md.`);
    const seedText = readFileSync(seedFile, "utf8");
    toRedact = seedValuesToRedact(seedText);
    const seed = parseSeedEnv(seedText);
    const appOrigin = readAppOrigin(parseEnvLines(seedText));
    const pub = publicVariables();
    const target = resolveLiveTarget({
      linkedRef: readLinkedProjectRef(path.join(ROOT, "supabase")),
      seedUrl: seed.url,
      publicUrl: pub.url,
      publicKey: pub.key,
    });
    console.log(redact(`test:security:live — projet Supabase : ${target.host} ; production : URL de .env.seed (non affichée)`, toRedact));

    console.log("SM-6 — Comptes de démonstration A et B");
    const sm6 = await runSm6(target, { a: seed.demoA, b: seed.demoB }, seed.processSecret);

    console.log("Appels sans session");
    const unauthenticated = await runUnauthenticated(appOrigin);

    console.log("Code envoyé au navigateur");
    let browser: BrowserCodeOutcome | null = null;
    let browserError: string | null = null;
    try {
      browser = await runBrowserCode(appOrigin, browserSecretValues(seedText));
    } catch (caught) {
      browserError = caught instanceof Error ? caught.message : "erreur inconnue";
    }

    const input: SecurityReportInput = {
      sm6: evaluateSm6(sm6.observations),
      sm6Error: sm6.error,
      cleanup: sm6.cleanup,
      unauthenticated,
      browser,
      browserError,
    };
    for (const criterion of input.sm6) console.log(redact(`  ${criterion.passed ? "ok " : "NON"} SM-6 critère ${criterion.id} : ${criterion.detail}`, toRedact));
    if (sm6.error) console.log(redact(`  SM-6 interrompu : ${sm6.error}`, toRedact));
    console.log(`  Nettoyage : ${sm6.cleanup.markedLeft ?? "?"} Document(s) « ${SM6_MARK} » restant(s)`);

    const reportFile = nextFreeReportPath(ROOT, REPORT_FILE);
    mkdirSync(path.join(ROOT, path.dirname(reportFile)), { recursive: true });
    writeFileSync(path.join(ROOT, reportFile), redact(buildSecurityReport(input), toRedact), "utf8");
    const passed = isSecurityPassed(input);
    console.log(`test:security:live — ${passed ? "réussi" : "ÉCHEC"} ; rapport : ${reportFile.replace(/\\/g, "/")}`);
    if (!passed) process.exit(1);
  } catch (error) {
    if (!(error instanceof LiveSecurityError || error instanceof LiveSearchError || error instanceof SeedError)) throw error;
    console.error(redact(`test:security:live — échec : ${error.message}`, toRedact));
    process.exit(1);
  }
}

// Exécuté seulement en ligne de commande ; casse de la lettre de lecteur ignorée sous Windows.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (process.platform === "win32" ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath) {
  void main();
}
