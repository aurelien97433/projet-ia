import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// Documents (story 2.2) sur Supabase local : RLS à deux Comptes, privilèges par colonne, appel direct
// avec la clé publique et le jeton d'un Collaborateur, Visiteur (anon), idempotence, Statut effectif.
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const DENIED = "42501";
// Requête SQL sur une seule ligne : la CLI la reçoit par le shell, qui coupe aux sauts de ligne.
const sqlRows = (sql: string) => localSqlRows(sql.replace(/\s+/g, " "));

let admin: SupabaseClient;
let anon: SupabaseClient;
const created: string[] = [];

async function signUpUser(prefix: string) {
  const email = uniqueEmail(prefix);
  const client = createClient(localSupabase().url, localSupabase().publishableKey, options);
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD });
  if (error || !data.user) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  created.push(data.user.id);
  return { client, id: data.user.id, displayName: email.split("@")[0] };
}

let a: Awaited<ReturnType<typeof signUpUser>>;
let b: Awaited<ReturnType<typeof signUpUser>>;
let docA: { id: string; attempt_id: string };

const note = (overrides: Record<string, unknown> = {}) => ({
  title: "Procédure de facturation",
  category: "procedure",
  content_text: "Texte de la Note.",
  client_request_id: crypto.randomUUID(),
  ...overrides,
});

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  a = await signUpUser("doc-auteur");
  b = await signUpUser("doc-autre");
  const { data, error } = await a.client.from("documents").insert(note()).select("id, attempt_id").single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  docA = data;
}, 60_000);

afterAll(async () => {
  // Les Documents sont supprimés en cascade avec le profil, lui-même supprimé avec le Compte.
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

async function readAsAdmin(id: string) {
  const { data } = await admin.from("documents").select("*").eq("id", id).single();
  return data;
}

describe("création par un Collaborateur", () => {
  it("Auteur, Statut, tentative et horodatage posés par la base", async () => {
    const row = await readAsAdmin(docA.id);
    expect(row.author_id).toBe(a.id);
    expect(row.status).toBe("processing");
    expect(row.kind).toBe("note");
    expect(row.attempt_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Math.abs(Date.now() - Date.parse(row.processing_started_at))).toBeLessThan(60_000);
    expect(row.error_kind).toBeNull();
    expect(row.error_message).toBeNull();
  });

  it.each([
    ["author_id (autre Auteur)", () => ({ author_id: b.id })],
    ["status = ready", () => ({ status: "ready" })],
    ["attempt_id", () => ({ attempt_id: crypto.randomUUID() })],
    ["processing_started_at", () => ({ processing_started_at: "2020-01-01T00:00:00Z" })],
    ["error_kind", () => ({ error_kind: "temporary" })],
    ["error_message", () => ({ error_message: "x" })],
    ["kind = file", () => ({ kind: "file" })],
    ["summary_points", () => ({ summary_points: ["x"] })],
    ["text_version", () => ({ text_version: 9 })],
  ])("appel direct qui force %s : refusé (42501), aucun Document", async (_label, extra) => {
    const requestId = crypto.randomUUID();
    const { error } = await a.client.from("documents").insert(note({ client_request_id: requestId, ...extra() }));
    expect(error?.code).toBe(DENIED);
    const { count } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("client_request_id", requestId);
    expect(count).toBe(0);
  });

  it("texte de plus de 100 000 octets (100 Ko) refusé par la base, même en appel direct ; 100 000 acceptés", async () => {
    const { error } = await a.client.from("documents").insert(note({ content_text: "é".repeat(50_001) }));
    expect(error?.code).toBe("23514");
    const accepted = await a.client.from("documents").insert(note({ content_text: "é".repeat(50_000) })).select("id").single();
    expect(accepted.error).toBeNull();
    if (accepted.data) await admin.from("documents").delete().eq("id", accepted.data.id);
  });

  it("titre vide ou de plus de 200 caractères refusé par la base", async () => {
    for (const title of ["   ", "a".repeat(201)]) {
      const { error } = await a.client.from("documents").insert(note({ title }));
      expect(error?.code).toBe("23514");
    }
  });
});

describe("idempotence (client_request_id)", () => {
  it("même identifiant rejoué par le même Auteur : un seul Document (23505)", async () => {
    const requestId = crypto.randomUUID();
    const first = await a.client.from("documents").insert(note({ client_request_id: requestId }));
    const second = await a.client.from("documents").insert(note({ client_request_id: requestId }));
    expect(first.error).toBeNull();
    expect(second.error?.code).toBe("23505");
    const { count } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("client_request_id", requestId);
    expect(count).toBe(1);
  });

  it("même identifiant utilisé par un autre Auteur : son propre Document, jamais celui de A", async () => {
    const requestId = crypto.randomUUID();
    await a.client.from("documents").insert(note({ client_request_id: requestId }));
    const { data, error } = await b.client
      .from("documents")
      .insert(note({ client_request_id: requestId }))
      .select("author_id")
      .single();
    expect(error).toBeNull();
    expect(data?.author_id).toBe(b.id);
  });
});

describe("lecture et modification à deux Comptes", () => {
  it("B lit le Document de A par documents_list, sans content_text, avec le nom de l'Auteur", async () => {
    const { data, error } = await b.client.from("documents_list").select("*").eq("id", docA.id).single();
    expect(error).toBeNull();
    expect(data).not.toHaveProperty("content_text");
    expect(data).not.toHaveProperty("summary_points");
    expect(data.author_name).toBe(a.displayName);
    expect(data.effective_status).toBe("processing");
    expect(data.server_now).toBeTruthy();
  });

  it("documents_list n'expose pas content_text", async () => {
    const { error } = await b.client.from("documents_list").select("content_text").eq("id", docA.id);
    expect(error?.code).toBe("42703");
  });

  it("B ne modifie ni le titre ni la Catégorie du Document de A (aucune ligne touchée)", async () => {
    const { data } = await b.client.from("documents").update({ title: "Piraté", category: "other" }).eq("id", docA.id).select();
    expect(data).toEqual([]);
    expect((await readAsAdmin(docA.id)).title).toBe("Procédure de facturation");
  });

  it.each([
    ["status", { status: "ready" }],
    ["attempt_id", { attempt_id: crypto.randomUUID() }],
    ["processing_started_at", { processing_started_at: "2020-01-01T00:00:00Z" }],
    ["error_kind", { error_kind: "no_text" }],
    ["error_message", { error_message: "x" }],
    ["author_id", { author_id: "00000000-0000-4000-8000-000000000000" }],
    ["content_text", { content_text: "autre texte" }],
  ])("ni A ni B ne modifient %s (42501)", async (_column, patch) => {
    for (const client of [a.client, b.client]) {
      const { error } = await client.from("documents").update(patch).eq("id", docA.id);
      expect(error?.code).toBe(DENIED);
    }
    const row = await readAsAdmin(docA.id);
    expect(row.status).toBe("processing");
    expect(row.attempt_id).toBe(docA.attempt_id);
  });

  it("A modifie le titre et la Catégorie de son Document", async () => {
    const { data, error } = await a.client
      .from("documents")
      .update({ title: "Procédure de facturation (2026)", category: "faq" })
      .eq("id", docA.id)
      .select("title, category")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ title: "Procédure de facturation (2026)", category: "faq" });
    await a.client.from("documents").update({ title: "Procédure de facturation", category: "procedure" }).eq("id", docA.id);
  });

  // Suppression (story 3.4) : couverte en détail par delete-document.test.ts.
  it("B ne supprime pas le Document de A (aucune ligne touchée)", async () => {
    const { data, error } = await b.client.from("documents").delete().eq("id", docA.id).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await readAsAdmin(docA.id)).not.toBeNull();
  });
});

describe("Visiteur (anon)", () => {
  it.each(["documents", "documents_list"])("%s : aucune lecture (42501)", async (relation) => {
    const { data, error } = await anon.from(relation).select("id");
    expect(error?.code === DENIED || (data ?? []).length === 0).toBe(true);
    expect(error?.code).toBe(DENIED);
  });

  it("aucune création (42501)", async () => {
    const { error } = await anon.from("documents").insert(note());
    expect(error?.code).toBe(DENIED);
  });
});

describe("privilèges SQL réels", () => {
  it("authenticated : INSERT et UPDATE limités aux colonnes prévues ; anon : rien", () => {
    const rows = sqlRows(`select
      has_column_privilege('authenticated', 'public.documents', 'title', 'INSERT') as ins_title,
      has_column_privilege('authenticated', 'public.documents', 'author_id', 'INSERT') as ins_author,
      has_column_privilege('authenticated', 'public.documents', 'status', 'INSERT') as ins_status,
      has_column_privilege('authenticated', 'public.documents', 'attempt_id', 'INSERT') as ins_attempt,
      has_column_privilege('authenticated', 'public.documents', 'status', 'UPDATE') as upd_status,
      has_column_privilege('authenticated', 'public.documents', 'content_text', 'UPDATE') as upd_content,
      has_column_privilege('authenticated', 'public.documents', 'category', 'UPDATE') as upd_category,
      has_table_privilege('authenticated', 'public.documents', 'DELETE') as del,
      has_table_privilege('anon', 'public.documents', 'SELECT,INSERT,UPDATE,DELETE') as anon_doc,
      has_table_privilege('anon', 'public.documents_list', 'SELECT') as anon_list`);
    expect(rows[0]).toEqual({
      ins_title: true,
      ins_author: false,
      ins_status: false,
      ins_attempt: false,
      upd_status: false,
      upd_content: false,
      upd_category: true,
      del: true,
      anon_doc: false,
      anon_list: false,
    });
  });

  it("documents_list est en security_invoker et la RLS est activée sur documents", () => {
    const rows = sqlRows(`select
      (select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.documents_list'::regclass) as invoker,
      (select relrowsecurity from pg_class where oid = 'public.documents'::regclass) as rls`);
    expect(rows[0]).toEqual({ invoker: true, rls: true });
  });
});

describe("Statut effectif (expiration à 3 min)", () => {
  it("un Document en cours depuis plus de 3 min apparaît en erreur temporaire, sans changer son Statut enregistré", async () => {
    const { data } = await a.client.from("documents").insert(note()).select("id").single();
    await admin
      .from("documents")
      .update({ processing_started_at: new Date(Date.now() - 4 * 60_000).toISOString() })
      .eq("id", data!.id);
    const { data: listed } = await b.client
      .from("documents_list")
      .select("status, effective_status, effective_error_kind")
      .eq("id", data!.id)
      .single();
    expect(listed).toEqual({ status: "processing", effective_status: "error", effective_error_kind: "temporary" });
  });
});
