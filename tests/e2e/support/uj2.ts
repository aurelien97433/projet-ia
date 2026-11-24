import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Locator, Page } from "@playwright/test";

// Parcours UJ-2 (story 6.2) : outils partagés par le mode local (suite e2e) et le mode production
// (playwright.live.config.ts). Aucun identifiant n'est journalisé ni écrit dans un rapport.
//
// Chargement de .env.seed et de la session du Compte de mesure 1 : mêmes règles que
// scripts/test-search-live.ts › openLiveSession (projet lié, https, clé publique seulement, session
// du Compte). Ces scripts ne peuvent pas être importés ici : ils lisent import.meta, que Playwright
// refuse dans un projet CommonJS (« Cannot use 'import.meta' outside a module »). Les règles sont
// donc reprises à l'identique, sans rien modifier dans scripts/.

const SEED_ENV_FILE = ".env.seed";
const PUBLIC_ENV_FILE = ".env.local";
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

// Même lecture que scripts/check-secrets.ts › parseEnvLines.
export function parseEnvLines(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

export const ROOT = path.resolve(__dirname, "..", "..", "..");

// Marque de tout Document créé par le test : le nettoyage ne touche jamais un autre Document.
export const UJ2_MARK = "— test UJ-2";
export const uj2Title = (stamp: string) => `Compte rendu client : Pharmacies Dorval ${UJ2_MARK} ${stamp}`;
export const uj2EmptyFileTitle = (stamp: string) => `Fichier vide ${UJ2_MARK} ${stamp}`;
export const isMarkedTitle = (title: string, mark = UJ2_MARK) => title.includes(mark);

// Horodatage lisible et unique (UTC, millisecondes, suffixe aléatoire court).
export const uj2Stamp = () =>
  `${new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "")} ${Math.random().toString(36).slice(2, 6)}`;

// Jeu de démonstration : Note d'UJ-2, questions u1 et u2, fichier du cas limite.
type Uj2Journey = {
  noteFile: string;
  title: string;
  category: string;
  questions: { id: string; question: string; expected: string }[];
  edgeCase: { file: string };
};

export function loadUj2Journey(root = ROOT) {
  const set = JSON.parse(readFileSync(path.join(root, "demo", "jeu-demonstration.json"), "utf8")) as {
    journeys: { "UJ-2": Uj2Journey };
    contradiction: { forbiddenTerms: string[] };
  };
  const journey = set.journeys["UJ-2"];
  const question = (id: string) => {
    const found = journey.questions.find((entry) => entry.id === id);
    if (!found) throw new Error(`Question ${id} absente de journeys.UJ-2.`);
    return found;
  };
  return {
    note: readFileSync(path.join(root, "demo", journey.noteFile), "utf8").replace(/\r\n/g, "\n"),
    category: journey.category,
    u1: question("u1"),
    u2: question("u2"),
    emptyFile: path.join(root, "demo", journey.edgeCase.file),
    forbiddenTerms: set.contradiction.forbiddenTerms,
  };
}

// Mode local : la vectorisation simulée rapproche les textes qui partagent des mots. Plusieurs Notes
// Dorval identiques peuvent exister en même temps (workers parallèles) : un repère unique, ajouté à la
// Note et à la question, place le Passage du Document créé devant les autres copies.
export function localNoteAndQuestion(note: string, marker: string) {
  return {
    note: `${note.trimEnd()}\n\nRéférence du test : ${marker}\n`,
    question: `Pendant combien de temps une réservation est-elle conservée au comptoir des Pharmacies Dorval ? ${marker}`,
  };
}

// Mode production : URL de l'application et Compte de mesure 1, lus dans .env.seed (ignoré par git).
export type LiveCredentials = { appUrl: string; email: string; password: string };

export function readSeedFile(root = ROOT): string {
  const file = path.join(root, SEED_ENV_FILE);
  if (!existsSync(file)) throw new Error(`${SEED_ENV_FILE} est introuvable. Procédure : docs/environnements.md.`);
  return readFileSync(file, "utf8");
}

// URL de production (UJ2_LIVE_URL) : https exigé ; jamais affichée en entier.
export function readLiveAppUrl(seedText: string): string {
  const raw = parseEnvLines(seedText).UJ2_LIVE_URL;
  if (!raw) throw new Error(`UJ2_LIVE_URL absente de ${SEED_ENV_FILE} : ajoutez l'URL de production Vercel (docs/environnements.md).`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("UJ2_LIVE_URL n'est pas une URL valide.");
  }
  if (url.protocol !== "https:") throw new Error("UJ2_LIVE_URL doit être une adresse https (production Vercel).");
  return url.origin;
}

export function liveCredentials(root = ROOT): LiveCredentials {
  const text = readSeedFile(root);
  const env = parseEnvLines(text);
  const missing = ["MEASURE_ACCOUNT_1_EMAIL", "MEASURE_ACCOUNT_1_PASSWORD"].filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`variables absentes de ${SEED_ENV_FILE} : ${missing.join(", ")}.`);
  return { appUrl: readLiveAppUrl(text), email: env.MEASURE_ACCOUNT_1_EMAIL, password: env.MEASURE_ACCOUNT_1_PASSWORD };
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

export type LiveTarget = { host: string; url: string; publicKey: string };

// Cible Supabase exigée : le projet distant lié, en https, désigné à la fois par .env.seed et par la
// clé publique de .env.local (ou de l'environnement). Toute autre cible est refusée avant tout appel.
export function resolveLiveTarget(input: {
  linkedRef: string | null;
  seedUrl: string | undefined;
  publicUrl: string | undefined;
  publicKey: string | undefined;
}): LiveTarget {
  if (!input.linkedRef) throw new Error("aucun projet distant lié : lancez npx supabase link.");
  const expected = `${input.linkedRef}.supabase.co`;
  const parse = (value: string | undefined, name: string) => {
    try {
      return new URL(value ?? "");
    } catch {
      throw new Error(`${name} n'est pas une URL valide.`);
    }
  };
  const seed = parse(input.seedUrl, "SEED_SUPABASE_URL");
  if (seed.hostname !== expected) throw new Error(`.env.seed vise ${seed.hostname}, pas le projet lié ${expected}.`);
  if (seed.protocol !== "https:") throw new Error("le projet distant exige une adresse https.");
  const publicUrl = parse(input.publicUrl, "NEXT_PUBLIC_SUPABASE_URL");
  if (publicUrl.hostname !== expected) throw new Error(`la clé publique vient de ${publicUrl.hostname}, pas du projet lié ${expected}.`);
  if (!isPublicKey(input.publicKey)) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente ou non publique (valeur masquée).");
  return { host: expected, url: `https://${expected}`, publicKey: input.publicKey };
}

function readLinkedProjectRef(root: string): string | null {
  const file = path.join(root, "supabase", ".temp", "project-ref");
  if (!existsSync(file)) return null;
  const ref = readFileSync(file, "utf8").trim();
  return PROJECT_REF_PATTERN.test(ref) ? ref : null;
}

export type LiveSession = { target: LiveTarget; client: SupabaseClient; userId: string };

// Session du Compte de mesure 1 sur le projet distant lié (clé publique seulement).
export async function openLiveSession(credentials: LiveCredentials, root = ROOT): Promise<LiveSession> {
  const seed = parseEnvLines(readSeedFile(root));
  const publicFile = path.join(root, PUBLIC_ENV_FILE);
  const pub = existsSync(publicFile) ? parseEnvLines(readFileSync(publicFile, "utf8")) : {};
  const target = resolveLiveTarget({
    linkedRef: readLinkedProjectRef(root),
    seedUrl: seed.SEED_SUPABASE_URL,
    publicUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? pub.NEXT_PUBLIC_SUPABASE_URL,
    publicKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? pub.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  const client = createClient(target.url, target.publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: credentials.email, password: credentials.password });
  if (error || !data.session) throw new Error(`connexion du Compte de mesure 1 refusée (${error?.code ?? "sans session"}).`);
  return { target, client, userId: data.session.user.id };
}

// Nettoyage : avec la session du Compte (politique Auteur de la 3.4), jamais service_role. Seuls les
// Documents du Compte dont le titre contient la marque sont supprimés, puis leurs fichiers. Renvoie
// le nombre de Documents marqués restants (0 attendu). Marque paramétrée (story 7.2 : « — test SM-5 »).
export async function cleanupMarkedDocuments(client: SupabaseClient, userId: string, mark = UJ2_MARK): Promise<number> {
  if (!mark.startsWith("— test ")) throw new Error("Marque de nettoyage refusée : elle doit commencer par « — test ».");
  const marked = () =>
    client.from("documents").select("id, title, storage_path").eq("author_id", userId).like("title", `%${mark}%`);
  const { data, error } = await marked();
  if (error) throw new Error(`Lecture des Documents de test impossible (${error.code}).`);
  const rows = ((data ?? []) as { id: string; title: string; storage_path: string | null }[]).filter((row) =>
    isMarkedTitle(row.title, mark),
  );
  if (rows.length > 0) {
    const removal = await client
      .from("documents")
      .delete()
      .eq("author_id", userId)
      .like("title", `%${mark}%`)
      .in(
        "id",
        rows.map((row) => row.id),
      );
    if (removal.error) throw new Error(`Suppression des Documents de test impossible (${removal.error.code}).`);
    const paths = rows.map((row) => row.storage_path).filter((value): value is string => Boolean(value));
    // Un objet resté en place n'empêche pas le contrôle : seul le Document compte pour la Bibliothèque.
    if (paths.length > 0) await client.storage.from("documents").remove(paths);
  }
  const after = await marked();
  if (after.error) throw new Error(`Contrôle du nettoyage impossible (${after.error.code}).`);
  return (after.data ?? []).length;
}

// Compteur du jour UTC du Compte (ai_usage), lu avec sa session (politique « propriétaire »).
export async function readDailyUsage(client: SupabaseClient, userId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const { data, error } = await client.from("ai_usage").select("count").eq("user_id", userId).eq("day_utc", day).maybeSingle();
  if (error) throw new Error(`Lecture du compteur du jour impossible (${error.code}).`);
  return Number((data as { count?: number } | null)?.count ?? 0);
}

// Clavier seul : focus posé sur l'élément, puis touche. Aucun clic.
export async function press(page: Page, target: Locator, key = "Enter"): Promise<void> {
  await target.focus();
  await page.keyboard.press(key);
}

// Saisie au clavier (champ vidé d'abord : Ctrl+A puis Retour arrière).
export async function typeInto(page: Page, target: Locator, text: string): Promise<void> {
  await target.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text);
}

// Texte collé : insertion d'un bloc, comme Ctrl+V.
export async function pasteInto(page: Page, target: Locator, text: string): Promise<void> {
  await target.focus();
  await page.keyboard.insertText(text);
}

// Liste déroulante native : sélection par frappe du premier mot du libellé (recherche au clavier de la
// liste fermée). Le premier mot seul : une Espace ouvrirait la liste. « Compte » n'est le début d'aucune
// autre option.
export async function chooseOptionByTyping(page: Page, select: Locator, label: string): Promise<void> {
  await select.focus();
  await page.keyboard.type(label.split(" ")[0]);
}
