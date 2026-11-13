import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// Suppression d'un Document (story 3.4) sur Supabase local, à deux Comptes : privilège et politique
// réservés à l'Auteur, Passages en cascade, objet Storage retiré par l'Auteur une fois le Document
// supprimé, refus pour B (client, REST et Storage avec son propre jeton) et pour anon, suppression
// pendant le traitement.
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const BUCKET = "documents";
const DENIED = "42501";
const vector = () => new Array<number>(1536).fill(0).map((_, index) => (index === 0 ? 1 : 0));

type Account = { id: string; client: SupabaseClient; token: string };
type Doc = { id: string; attempt_id: string; text_version: number };

let admin: SupabaseClient;
let anon: SupabaseClient;
let a: Account;
let b: Account;
const created: string[] = [];

async function account(prefix: string): Promise<Account> {
  const client = createClient(localSupabase().url, localSupabase().publishableKey, options);
  const { data, error } = await client.auth.signUp({ email: uniqueEmail(prefix), password: PASSWORD });
  if (error || !data.user || !data.session) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  return { id: data.user.id, client, token: data.session.access_token };
}

async function newNote(owner: Account): Promise<Doc> {
  const { data, error } = await owner.client
    .from("documents")
    .insert({ title: "Note à supprimer", category: "procedure", content_text: "Texte de la Note.", client_request_id: crypto.randomUUID() })
    .select("id, attempt_id, text_version")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  created.push(data.id);
  return data;
}

const complete = (doc: Doc) =>
  admin.rpc("complete_processing", {
    p_document_id: doc.id,
    p_attempt_id: doc.attempt_id,
    p_content_text: "Texte de la Note.",
    p_text_version: doc.text_version,
    p_embedding_model: "text-embedding-3-small",
    p_embedding_version: 1,
    p_passages: [0, 1].map((ordinal) => ({ ordinal, start: ordinal * 5, end: ordinal * 5 + 4, content: `P${ordinal}`, embedding: vector() })),
  });

// Fichier déposé par URL signée puis importé, comme dans l'application (story 2.6a).
async function importedFile(owner: Account): Promise<{ doc: { id: string }; path: string }> {
  const uploadId = `${crypto.randomUUID()}.txt`;
  const path = `${owner.id}/uploads/${uploadId}`;
  const { data: signed, error: signError } = await owner.client.storage.from(BUCKET).createSignedUploadUrl(path);
  if (signError || !signed) throw new Error(`URL signée impossible : ${signError?.message}`);
  const put = await fetch(signed.signedUrl, { method: "PUT", headers: { "x-upsert": "false", "Content-Type": "text/plain" }, body: "Texte." });
  if (!put.ok) throw new Error(`Dépôt refusé : ${put.status}`);
  const { data, error } = await owner.client.rpc("import_file_document", {
    p_title: "Fichier à supprimer",
    p_category: "procedure",
    p_upload_id: uploadId,
    p_client_request_id: crypto.randomUUID(),
  });
  const row = (data as { document_id: string }[] | null)?.[0];
  if (error || !row) throw new Error(`Import impossible : ${error?.code}`);
  created.push(row.document_id);
  return { doc: { id: row.document_id }, path };
}

const documentExists = async (id: string) => ((await admin.from("documents").select("id").eq("id", id)).data ?? []).length === 1;
const passageCount = async (id: string) =>
  (await admin.from("passages").select("id", { count: "exact", head: true }).eq("document_id", id)).count;
const objectExists = async (path: string) => {
  const [folder, , name] = path.split("/");
  const { data } = await admin.storage.from(BUCKET).list(`${folder}/uploads`, { search: name, limit: 10 });
  return (data ?? []).some((object) => object.name === name);
};

// Appels directs avec le jeton d'un Compte, sans la bibliothèque cliente.
const rest = (token: string, url: string, init: RequestInit = {}) =>
  fetch(`${localSupabase().url}${url}`, {
    ...init,
    headers: { apikey: localSupabase().publishableKey, Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  [a, b] = await Promise.all([account("suppr-a"), account("suppr-b")]);
}, 60_000);

afterAll(async () => {
  if (created.length > 0) await admin.from("documents").delete().in("id", created);
  for (const owner of [a, b]) {
    const { data } = await admin.storage.from(BUCKET).list(`${owner.id}/uploads`, { limit: 100 });
    const paths = (data ?? []).map((object) => `${owner.id}/uploads/${object.name}`);
    if (paths.length > 0) await admin.storage.from(BUCKET).remove(paths);
    await admin.auth.admin.deleteUser(owner.id);
  }
});

describe("Document : suppression par l'Auteur seul", () => {
  it("A supprime sa Note prête : Document et Passages disparaissent, storage_path vide renvoyé", async () => {
    const doc = await newNote(a);
    expect((await complete(doc)).data).toBe(true);
    expect(await passageCount(doc.id)).toBe(2);
    const { data, error } = await a.client.from("documents").delete().eq("id", doc.id).select("storage_path");
    expect(error).toBeNull();
    expect(data).toEqual([{ storage_path: null }]);
    expect(await documentExists(doc.id)).toBe(false);
    expect(await passageCount(doc.id)).toBe(0);
  });

  it("B, par le client : aucune ligne supprimée, Document et Passages de A intacts", async () => {
    const doc = await newNote(a);
    await complete(doc);
    const { data, error } = await b.client.from("documents").delete().eq("id", doc.id).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await documentExists(doc.id)).toBe(true);
    expect(await passageCount(doc.id)).toBe(2);
  });

  it("B, par un appel REST direct avec son jeton : rien n'est supprimé", async () => {
    const doc = await newNote(a);
    const response = await rest(b.token, `/rest/v1/documents?id=eq.${doc.id}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    // Sans filtre : la RLS limite la suppression aux Documents de B (aucun ici).
    const all = await rest(b.token, "/rest/v1/documents?id=not.is.null", { method: "DELETE", headers: { Prefer: "return=representation" } });
    expect(await all.json()).toEqual([]);
    expect(await documentExists(doc.id)).toBe(true);
  });

  it("anon : refusé (42501), Document intact", async () => {
    const doc = await newNote(a);
    const { error } = await anon.from("documents").delete().eq("id", doc.id);
    expect(error?.code).toBe(DENIED);
    expect(await documentExists(doc.id)).toBe(true);
  });

  it("pendant le traitement : complete_processing renvoie false, aucun Passage orphelin", async () => {
    const doc = await newNote(a);
    expect((await a.client.from("documents").delete().eq("id", doc.id).select("id")).data).toEqual([{ id: doc.id }]);
    const { data, error } = await complete(doc);
    expect(error).toBeNull();
    expect(data).toBe(false);
    expect(await passageCount(doc.id)).toBe(0);
    const failed = await admin.rpc("fail_processing", {
      p_document_id: doc.id,
      p_attempt_id: doc.attempt_id,
      p_kind: "temporary",
      p_message: "Le traitement n'a pas pu aboutir. Vous pouvez le relancer.",
    });
    expect(failed.data).toBe(false);
  });
});

describe("fichier importé : objet Storage", () => {
  it("objet encore référencé : A ne peut pas le retirer, il reste en place", async () => {
    const { path } = await importedFile(a);
    const { data, error } = await a.client.storage.from(BUCKET).remove([path]);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await objectExists(path)).toBe(true);
  });

  it("A supprime le Document puis l'objet : l'objet n'existe plus", async () => {
    const { doc, path } = await importedFile(a);
    const { data } = await a.client.from("documents").delete().eq("id", doc.id).select("storage_path");
    expect(data).toEqual([{ storage_path: path }]);
    const removed = await a.client.storage.from(BUCKET).remove([path]);
    expect(removed.error).toBeNull();
    expect(removed.data?.map((object) => object.name)).toEqual([path]);
    expect(await objectExists(path)).toBe(false);
  });

  it("B, avec son jeton, ne retire pas l'objet de A, même sans Document (client et API Storage directe)", async () => {
    const { doc, path } = await importedFile(a);
    await admin.from("documents").delete().eq("id", doc.id);
    const viaClient = await b.client.storage.from(BUCKET).remove([path]);
    expect(viaClient.data ?? []).toEqual([]);
    const single = await rest(b.token, `/storage/v1/object/${BUCKET}/${path}`, { method: "DELETE" });
    expect(single.ok).toBe(false);
    const batch = await rest(b.token, `/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [path] }),
    });
    expect(batch.ok ? await batch.json() : []).toEqual([]);
    expect(await objectExists(path)).toBe(true);
  });

  it("B ne retire pas l'objet de A encore référencé (Document intact)", async () => {
    const { doc, path } = await importedFile(a);
    const { data } = await b.client.storage.from(BUCKET).remove([path]);
    expect(data ?? []).toEqual([]);
    expect(await objectExists(path)).toBe(true);
    expect(await documentExists(doc.id)).toBe(true);
  });

  it("is_unreferenced_upload en appel direct : faux pour le chemin d'un autre Compte ou un chemin nul", async () => {
    const { doc, path } = await importedFile(a);
    await admin.from("documents").delete().eq("id", doc.id);
    expect((await a.client.rpc("is_unreferenced_upload", { p_name: path })).data).toBe(true);
    expect((await b.client.rpc("is_unreferenced_upload", { p_name: path })).data).toBe(false);
    expect((await b.client.rpc("is_unreferenced_upload", { p_name: null })).data).toBe(false);
    expect((await anon.rpc("is_unreferenced_upload", { p_name: path })).error?.code).toBe(DENIED);
  });

  it("anon ne retire aucun objet", async () => {
    const { doc, path } = await importedFile(a);
    await admin.from("documents").delete().eq("id", doc.id);
    const { data } = await anon.storage.from(BUCKET).remove([path]);
    expect(data ?? []).toEqual([]);
    expect(await objectExists(path)).toBe(true);
  });
});

describe("privilèges et politiques réels", () => {
  it("DELETE sur documents : authenticated oui, anon non", () => {
    const [row] = localSqlRows(
      "select has_table_privilege('authenticated', 'public.documents', 'DELETE') as auth_delete, has_table_privilege('anon', 'public.documents', 'DELETE') as anon_delete",
    );
    expect(row).toEqual({ auth_delete: true, anon_delete: false });
  });

  it("politiques delete : documents (Auteur) et storage.objects (dossier, non référencé), pour authenticated seul", () => {
    const rows = localSqlRows(
      "select schemaname, tablename, roles::text as roles, qual from pg_policies where cmd = 'DELETE' and ((schemaname = 'public' and tablename = 'documents') or (schemaname = 'storage' and tablename = 'objects')) order by schemaname",
    );
    expect(rows).toHaveLength(2);
    const [documents, objects] = rows as { roles: string; qual: string }[];
    expect(documents.roles).toBe("{authenticated}");
    expect(documents.qual).toContain("author_id");
    expect(objects.roles).toBe("{authenticated}");
    expect(objects.qual).toContain("is_own_upload_path");
    expect(objects.qual).toContain("is_unreferenced_upload");
    expect(objects.qual).toContain("'documents'");
  });

  it("is_unreferenced_upload : security definer, search_path vide, EXECUTE pour authenticated seul", () => {
    const [row] = localSqlRows(
      "select p.prosecdef as definer, p.proconfig::text as config, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec from pg_proc p where p.proname = 'is_unreferenced_upload'",
    );
    expect(row).toEqual({ definer: true, config: '{"search_path=\\"\\""}', auth_exec: true, anon_exec: false });
  });
});
