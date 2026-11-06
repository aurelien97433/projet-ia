import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// complete_processing (AD-5) sur Supabase local : opération atomique, tentative périmée, dimension.
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const DENIED = "42501";
const EXPIRED = () => new Date(Date.now() - 181_000).toISOString();
const vector = (dimension = 1536) => new Array<number>(dimension).fill(0).map((_, index) => (index === 0 ? 1 : 0));

let admin: SupabaseClient;
let author: SupabaseClient;
let anon: SupabaseClient;
let userId: string;

type Doc = { id: string; attempt_id: string; text_version: number };

async function newDocument(): Promise<Doc> {
  const { data, error } = await author
    .from("documents")
    .insert({ title: "Note", category: "procedure", content_text: "Texte initial  ", client_request_id: crypto.randomUUID() })
    .select("id, attempt_id, text_version")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  return data;
}

const passage = (ordinal: number, embedding = vector()) => ({ ordinal, start: ordinal * 10, end: ordinal * 10 + 5, content: `Passage ${ordinal}`, embedding });

const complete = (client: SupabaseClient, doc: Doc, overrides: Record<string, unknown> = {}) =>
  client.rpc("complete_processing", {
    p_document_id: doc.id,
    p_attempt_id: doc.attempt_id,
    p_content_text: "Texte canonique",
    p_text_version: doc.text_version,
    p_embedding_model: "text-embedding-3-small",
    p_embedding_version: 1,
    p_passages: [passage(0), passage(1)],
    ...overrides,
  });

const read = async (id: string) =>
  (await admin.from("documents").select("status, content_text, error_kind, error_message").eq("id", id).single()).data!;

const passagesOf = async (id: string) =>
  (await admin.from("passages").select("ordinal, start_offset, end_offset, content, embedding_model, embedding_version").eq("document_id", id).order("ordinal")).data!;

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  author = createClient(url, publishableKey, options);
  const { data, error } = await author.auth.signUp({ email: uniqueEmail("fin-traitement"), password: PASSWORD });
  if (error || !data.user) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  userId = data.user.id;
}, 60_000);

afterAll(async () => {
  await admin.auth.admin.deleteUser(userId);
});

describe("complete_processing", () => {
  it("tentative courante : Passages écrits, texte canonique, Document prêt", async () => {
    const doc = await newDocument();
    const { data, error } = await complete(admin, doc);
    expect(error).toBeNull();
    expect(data).toBe(true);
    expect(await read(doc.id)).toEqual({ status: "ready", content_text: "Texte canonique", error_kind: null, error_message: null });
    expect(await passagesOf(doc.id)).toEqual([
      { ordinal: 0, start_offset: 0, end_offset: 5, content: "Passage 0", embedding_model: "text-embedding-3-small", embedding_version: 1 },
      { ordinal: 1, start_offset: 10, end_offset: 15, content: "Passage 1", embedding_model: "text-embedding-3-small", embedding_version: 1 },
    ]);
  });

  it("remplace les Passages d'une tentative précédente", async () => {
    const doc = await newDocument();
    await complete(admin, doc);
    const attempt = crypto.randomUUID();
    await admin.from("documents").update({ status: "processing", attempt_id: attempt }).eq("id", doc.id);

    expect((await complete(admin, { ...doc, attempt_id: attempt }, { p_passages: [passage(0)] })).data).toBe(true);
    expect(await passagesOf(doc.id)).toHaveLength(1);
  });

  it.each([
    ["autre tentative", async (doc: Doc) => ({ ...doc, attempt_id: crypto.randomUUID() })],
    ["autre version du texte", async (doc: Doc) => ({ ...doc, text_version: doc.text_version + 1 })],
    [
      "commencée il y a plus de 3 min",
      async (doc: Doc) => {
        await admin.from("documents").update({ processing_started_at: EXPIRED() }).eq("id", doc.id);
        return doc;
      },
    ],
    [
      "Document déjà en erreur",
      async (doc: Doc) => {
        await admin.from("documents").update({ status: "error", error_kind: "temporary" }).eq("id", doc.id);
        return doc;
      },
    ],
  ])("tentative périmée (%s) : false, rien n'est écrit", async (_label, prepare) => {
    const doc = await newDocument();
    const target = await prepare(doc);
    const before = await read(doc.id);
    const { data, error } = await complete(admin, target);
    expect(error).toBeNull();
    expect(data).toBe(false);
    expect(await read(doc.id)).toEqual(before);
    expect(await passagesOf(doc.id)).toEqual([]);
  });

  it("une tentative périmée laisse intacts les Passages déjà en place", async () => {
    const doc = await newDocument();
    await complete(admin, doc);
    await admin.from("documents").update({ status: "processing", attempt_id: crypto.randomUUID() }).eq("id", doc.id);
    expect((await complete(admin, doc, { p_passages: [passage(0)] })).data).toBe(false);
    expect(await passagesOf(doc.id)).toHaveLength(2);
  });

  it.each([1535, 1537])("dimension %i : refusée, tout est annulé", async (dimension) => {
    const doc = await newDocument();
    const { error } = await complete(admin, doc, { p_passages: [passage(0), passage(1, vector(dimension))] });
    expect(error).not.toBeNull();
    expect(await read(doc.id)).toMatchObject({ status: "processing", content_text: "Texte initial  " });
    expect(await passagesOf(doc.id)).toEqual([]);
  });

  it("contrainte violée sur un Passage : tout est annulé, anciens Passages compris", async () => {
    const doc = await newDocument();
    await complete(admin, doc);
    await admin.from("documents").update({ status: "processing" }).eq("id", doc.id);
    const invalid = { ...passage(0), start: 5, end: 1 };
    expect((await complete(admin, doc, { p_passages: [invalid] })).error).not.toBeNull();
    expect(await passagesOf(doc.id)).toHaveLength(2);
    expect((await read(doc.id)).status).toBe("processing");
  });

  it.each([
    ["liste vide", []],
    ["valeur nulle", null],
    ["objet", {}],
  ])("sans Passage (%s) : refusé, anciens Passages intacts, Document pas prêt", async (_label, passages) => {
    const doc = await newDocument();
    await complete(admin, doc);
    await admin.from("documents").update({ status: "processing" }).eq("id", doc.id);
    expect((await complete(admin, doc, { p_passages: passages })).error).not.toBeNull();
    expect((await read(doc.id)).status).toBe("processing");
    expect(await passagesOf(doc.id)).toHaveLength(2);
  });

  it.each(["Auteur", "Visiteur"])("%s : permission refusée", async (who) => {
    const doc = await newDocument();
    const { error } = await complete(who === "Auteur" ? author : anon, doc);
    expect(error?.code).toBe(DENIED);
    expect((await read(doc.id)).status).toBe("processing");
  });

  it("security definer, search_path vide, EXECUTE pour service_role seul", () => {
    const rows = localSqlRows(
      "select p.prosecdef, p.proconfig::text as config, " +
        "has_function_privilege('anon', p.oid, 'execute') as anon, " +
        "has_function_privilege('authenticated', p.oid, 'execute') as authenticated, " +
        "has_function_privilege('service_role', p.oid, 'execute') as service_role " +
        "from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'complete_processing'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ prosecdef: true, anon: false, authenticated: false, service_role: true });
    expect(String(rows[0].config).replaceAll("\\", "")).toContain('search_path=""');
  });
});
