import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// Passages (story 2.4, FR-8) à deux Comptes sur Supabase local : lecture réservée aux Documents
// prêts, aucune écriture par un Collaborateur, rien pour un Visiteur.
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const DENIED = "42501";
const EMBEDDING = `[${new Array(1536).fill(0.1).join(",")}]`;

let admin: SupabaseClient;
let anon: SupabaseClient;
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
const docs: Record<"ready" | "processing" | "error", string> = { ready: "", processing: "", error: "" };

const row = (documentId: string, ordinal = 0) => ({
  document_id: documentId,
  text_version: 1,
  ordinal,
  start_offset: 0,
  end_offset: 5,
  content: "Passage",
  embedding: EMBEDDING,
  embedding_model: "text-embedding-3-small",
  embedding_version: 1,
});

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  a = await signUpUser("passages-auteur");
  b = await signUpUser("passages-autre");

  for (const status of ["ready", "processing", "error"] as const) {
    const { data, error } = await a.client
      .from("documents")
      .insert({ title: status, category: "procedure", content_text: "Texte.", client_request_id: crypto.randomUUID() })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
    docs[status] = data.id;
    await admin.from("documents").update({ status, ...(status === "error" ? { error_kind: "temporary" } : {}) }).eq("id", data.id);
    const insert = await admin.from("passages").insert(row(data.id));
    if (insert.error) throw new Error(`Création du Passage de test impossible : ${insert.error.message}`);
  }
}, 60_000);

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

const visible = async (client: SupabaseClient, documentId: string) => {
  const { data, error } = await client.from("passages").select("document_id, content").eq("document_id", documentId);
  expect(error).toBeNull();
  return data;
};

describe("lecture", () => {
  it("B lit les Passages d'un Document prêt de A", async () => {
    expect(await visible(b.client, docs.ready)).toEqual([{ document_id: docs.ready, content: "Passage" }]);
  });

  it.each(["processing", "error"] as const)("Document %s : aucun Passage, pour B comme pour l'Auteur", async (status) => {
    expect(await visible(b.client, docs[status])).toEqual([]);
    expect(await visible(a.client, docs[status])).toEqual([]);
  });

  it("un Document qui quitte l'état prêt ne laisse plus lire ses Passages", async () => {
    await admin.from("documents").update({ status: "processing" }).eq("id", docs.ready);
    expect(await visible(b.client, docs.ready)).toEqual([]);
    await admin.from("documents").update({ status: "ready" }).eq("id", docs.ready);
    expect(await visible(b.client, docs.ready)).toHaveLength(1);
  });

  it("Visiteur : permission refusée", async () => {
    const { error } = await anon.from("passages").select("id");
    expect(error?.code).toBe(DENIED);
  });
});

describe("écriture", () => {
  it.each(["l'Auteur", "un autre Collaborateur"])("%s ne peut ni insérer, ni modifier, ni supprimer", async (who) => {
    const client = who === "l'Auteur" ? a.client : b.client;
    expect((await client.from("passages").insert(row(docs.ready, 1))).error?.code).toBe(DENIED);
    expect((await client.from("passages").update({ content: "Modifié" }).eq("document_id", docs.ready)).error?.code).toBe(DENIED);
    expect((await client.from("passages").delete().eq("document_id", docs.ready)).error?.code).toBe(DENIED);
    expect(await visible(b.client, docs.ready)).toEqual([{ document_id: docs.ready, content: "Passage" }]);
  });

  it("Visiteur : aucune écriture", async () => {
    expect((await anon.from("passages").insert(row(docs.ready, 1))).error?.code).toBe(DENIED);
  });
});

describe("structure", () => {
  it("privilèges réels, RLS active, index HNSW cosinus", () => {
    const [table] = localSqlRows(
      "select c.relrowsecurity as rls, " +
        "has_table_privilege('anon', c.oid, 'select') as anon_select, " +
        "has_table_privilege('authenticated', c.oid, 'select') as user_select, " +
        "has_table_privilege('authenticated', c.oid, 'insert') as user_insert, " +
        "has_table_privilege('authenticated', c.oid, 'update') as user_update, " +
        "has_table_privilege('authenticated', c.oid, 'delete') as user_delete " +
        "from pg_class c where c.oid = 'public.passages'::regclass",
    );
    expect(table).toEqual({
      rls: true,
      anon_select: false,
      user_select: true,
      user_insert: false,
      user_update: false,
      user_delete: false,
    });
    const [index] = localSqlRows("select indexdef from pg_indexes where indexname = 'passages_embedding_idx'");
    expect(String(index.indexdef)).toMatch(/USING hnsw .*vector_cosine_ops/);
  });

  it("une dimension différente de 1 536 est refusée par la colonne", async () => {
    const { error } = await admin.from("passages").insert({ ...row(docs.ready, 2), embedding: "[1,2,3]" });
    expect(error).not.toBeNull();
  });

  it("les Passages sont supprimés avec leur Document", async () => {
    const { data } = await a.client
      .from("documents")
      .insert({ title: "À supprimer", category: "other", content_text: "Texte.", client_request_id: crypto.randomUUID() })
      .select("id")
      .single();
    await admin.from("passages").insert(row(data!.id));
    await admin.from("documents").delete().eq("id", data!.id);
    const { count } = await admin.from("passages").select("id", { count: "exact", head: true }).eq("document_id", data!.id);
    expect(count).toBe(0);
  });
});
