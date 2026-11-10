import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_LIBRARY_FILTERS, type LibraryFilters } from "@/lib/schemas/library";
import { getDocumentStatuses, listDocuments } from "@/server/documents/list-documents";
import { localSupabase, uniqueEmail } from "../support/local-supabase";

// Bibliothèque (story 3.3) sur Supabase local, avec le jeton de chaque Collaborateur (RLS) : B voit
// les Documents de A, « Mes Documents », recherche partielle sans casse, jokers neutralisés. La base
// locale est partagée : chaque recherche porte un marqueur propre à ce fichier.
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const TAG = `bib${crypto.randomUUID().slice(0, 8)}`;

let admin: SupabaseClient;
const created: string[] = [];

async function signUpUser(prefix: string) {
  const client = createClient(localSupabase().url, localSupabase().publishableKey, options);
  const { data, error } = await client.auth.signUp({ email: uniqueEmail(prefix), password: PASSWORD });
  if (error || !data.user) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  created.push(data.user.id);
  return { client, id: data.user.id };
}

let a: Awaited<ReturnType<typeof signUpUser>>;
let b: Awaited<ReturnType<typeof signUpUser>>;
const ids: Record<string, string> = {};

// Documents insérés par le service (Statut et date maîtrisés), dans l'ordre chronologique.
const DOCUMENTS = [
  { key: "factA", author: "a", title: `${TAG} Procédure de FACTURATION`, category: "procedure", status: "ready" },
  { key: "factB", author: "b", title: `${TAG} Facturation client`, category: "procedure", status: "processing" },
  { key: "faqA", author: "a", title: `${TAG} FAQ facturation`, category: "faq", status: "error" },
  { key: "percent", author: "a", title: `${TAG} Remise 50% annuelle`, category: "other", status: "ready" },
  { key: "underscore", author: "a", title: `${TAG} fichier_v2`, category: "other", status: "ready" },
  { key: "star", author: "b", title: `${TAG} note*importante`, category: "other", status: "ready" },
] as const;

beforeAll(async () => {
  const { url, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  a = await signUpUser("bib-a");
  b = await signUpUser("bib-b");
  const start = Date.now() - 60_000;
  for (const [index, document] of DOCUMENTS.entries()) {
    const { data, error } = await admin
      .from("documents")
      .insert({
        author_id: document.author === "a" ? a.id : b.id,
        title: document.title,
        category: document.category,
        content_text: "Texte de test.",
        status: document.status,
        error_kind: document.status === "error" ? "temporary" : null,
        error_message: document.status === "error" ? "Raison." : null,
        created_at: new Date(start + index * 1_000).toISOString(),
        client_request_id: crypto.randomUUID(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
    ids[document.key] = data.id;
  }
}, 60_000);

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

const filters = (overrides: Partial<LibraryFilters>): LibraryFilters => ({ ...DEFAULT_LIBRARY_FILTERS, ...overrides });
const keysOf = (documents: { id: string }[]) =>
  documents.map((document) => Object.keys(ids).find((key) => ids[key] === document.id));

describe("listDocuments", () => {
  it("B voit les Documents de A et les siens, tous Statuts, plus récents d'abord, sans texte", async () => {
    const page = await listDocuments(filters({ search: TAG }), b.id, b.client);
    expect(keysOf(page.documents)).toEqual(["star", "underscore", "percent", "faqA", "factB", "factA"]);
    expect(page.total).toBe(6);
    expect(new Set(page.documents.map((document) => document.effectiveStatus))).toEqual(
      new Set(["ready", "processing", "error"]),
    );
    for (const document of page.documents) {
      expect(Object.keys(document).sort()).toEqual(
        ["authorId", "authorName", "category", "createdAt", "effectiveStatus", "id", "title"].sort(),
      );
      expect(document.authorName).not.toBe("");
    }
  });

  it("combinaison : Procédure + Mes Documents + « factu » sans casse + plus anciens d'abord", async () => {
    const forA = await listDocuments(
      filters({ category: "procedure", mine: true, search: `${TAG} PROCÉDURE de factu`, sort: "oldest" }),
      a.id,
      a.client,
    );
    expect(keysOf(forA.documents)).toEqual(["factA"]);

    const procedures = await listDocuments(filters({ category: "procedure", search: TAG, sort: "oldest" }), a.id, a.client);
    expect(keysOf(procedures.documents)).toEqual(["factA", "factB"]);

    const mineB = await listDocuments(filters({ mine: true, search: TAG }), b.id, b.client);
    expect(keysOf(mineB.documents)).toEqual(["star", "factB"]);
  });

  it("recherche partielle, sans casse, au milieu du titre", async () => {
    const page = await listDocuments(filters({ search: "FACTU" }), a.id, a.client);
    const mine = page.documents.filter((document) => document.title.startsWith(TAG));
    expect(keysOf(mine).sort()).toEqual(["factA", "factB", "faqA"].sort());
  });

  it.each([
    ["%", ["percent"]],
    ["_", ["underscore"]],
    ["*", ["star"]],
    ["\\", []],
  ])("joker « %s » : seulement les titres qui contiennent ce caractère", async (character, expected) => {
    const page = await listDocuments(filters({ search: character }), a.id, a.client);
    const mine = page.documents.filter((document) => document.title.startsWith(TAG));
    expect(keysOf(mine)).toEqual(expected);
  });

  it("le total est exact même quand il dépasse les lignes renvoyées", async () => {
    const page = await listDocuments(filters({}), a.id, a.client);
    expect(page.total).toBeGreaterThanOrEqual(page.documents.length);
    expect(page.documents.length).toBeLessThanOrEqual(200);
  });
});

describe("getDocumentStatuses", () => {
  it("Statuts effectifs des Documents demandés, y compris d'un autre Auteur ; identifiant inconnu absent", async () => {
    const statuses = await getDocumentStatuses([ids.factB, ids.faqA, crypto.randomUUID()], a.client);
    expect(statuses.sort((x, y) => x.id.localeCompare(y.id))).toEqual(
      [
        { id: ids.factB, effectiveStatus: "processing" },
        { id: ids.faqA, effectiveStatus: "error" },
      ].sort((x, y) => x.id.localeCompare(y.id)),
    );
  });
});
