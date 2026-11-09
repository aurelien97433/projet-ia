import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { texts } from "@/lib/texts";
import { localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// fail_processing et abandon_processing (AD-5) sur Supabase local : conditions de tentative, Auteur,
// privilèges réels et appels directs.
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const DENIED = "42501";
const EXPIRED = () => new Date(Date.now() - 181_000).toISOString();

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

let author: Awaited<ReturnType<typeof signUpUser>>;
let other: Awaited<ReturnType<typeof signUpUser>>;

async function newDocument(): Promise<{ id: string; attempt_id: string }> {
  const { data, error } = await author.client
    .from("documents")
    .insert({ title: "Note", category: "procedure", content_text: "Texte.", client_request_id: crypto.randomUUID() })
    .select("id, attempt_id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  return data;
}

const read = async (id: string) =>
  (await admin.from("documents").select("status, error_kind, error_message, updated_at").eq("id", id).single()).data!;

const abandon = (client: SupabaseClient, id: string, attempt: string) =>
  client.rpc("abandon_processing", { p_document_id: id, p_attempt_id: attempt });

const fail = (client: SupabaseClient, id: string, attempt: string) =>
  client.rpc("fail_processing", { p_document_id: id, p_attempt_id: attempt, p_kind: "temporary", p_message: "Raison." });

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  author = await signUpUser("traitement-auteur");
  other = await signUpUser("traitement-autre");
}, 60_000);

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("abandon_processing", () => {
  it("Auteur, tentative courante, en cours : erreur temporaire avec le message du catalogue", async () => {
    const doc = await newDocument();
    const { data, error } = await abandon(author.client, doc.id, doc.attempt_id);
    expect(error).toBeNull();
    expect(data).toBe(true);
    expect(await read(doc.id)).toMatchObject({
      status: "error",
      error_kind: "temporary",
      error_message: texts.documentStatus.temporaryAuthor,
    });
  });

  it("non-Auteur : refusé, rien n'est modifié", async () => {
    const doc = await newDocument();
    expect((await abandon(other.client, doc.id, doc.attempt_id)).data).toBe(false);
    expect(await read(doc.id)).toMatchObject({ status: "processing", error_kind: null, error_message: null });
  });

  it("autre tentative : refusé, rien n'est modifié", async () => {
    const doc = await newDocument();
    expect((await abandon(author.client, doc.id, crypto.randomUUID())).data).toBe(false);
    expect((await read(doc.id)).status).toBe("processing");
  });

  it.each(["ready", "error"])("Document %s : refusé, rien n'est modifié", async (status) => {
    const doc = await newDocument();
    await admin.from("documents").update({ status }).eq("id", doc.id);
    const before = await read(doc.id);
    expect((await abandon(author.client, doc.id, doc.attempt_id)).data).toBe(false);
    expect(await read(doc.id)).toEqual(before);
  });

  it("tentative expirée (Statut effectif en erreur) : refusé, rien n'est écrit", async () => {
    const doc = await newDocument();
    await admin.from("documents").update({ processing_started_at: EXPIRED() }).eq("id", doc.id);
    expect((await abandon(author.client, doc.id, doc.attempt_id)).data).toBe(false);
    expect((await read(doc.id)).status).toBe("processing");
  });

  it("Visiteur : permission refusée", async () => {
    const doc = await newDocument();
    expect((await abandon(anon, doc.id, doc.attempt_id)).error?.code).toBe(DENIED);
    expect((await read(doc.id)).status).toBe("processing");
  });

  it("une fin tardive de la tentative abandonnée n'écrit rien", async () => {
    const doc = await newDocument();
    await abandon(author.client, doc.id, doc.attempt_id);
    const before = await read(doc.id);
    expect((await fail(admin, doc.id, doc.attempt_id)).data).toBe(false);
    expect(await read(doc.id)).toEqual(before);
  });
});

describe("fail_processing", () => {
  it("service_role, tentative courante : Document en erreur avec la raison", async () => {
    const doc = await newDocument();
    const { data, error } = await fail(admin, doc.id, doc.attempt_id);
    expect(error).toBeNull();
    expect(data).toBe(true);
    expect(await read(doc.id)).toMatchObject({ status: "error", error_kind: "temporary", error_message: "Raison." });
  });

  it("tentative inconnue ou expirée : rien n'est écrit", async () => {
    const doc = await newDocument();
    expect((await fail(admin, doc.id, crypto.randomUUID())).data).toBe(false);
    await admin.from("documents").update({ processing_started_at: EXPIRED() }).eq("id", doc.id);
    expect((await fail(admin, doc.id, doc.attempt_id)).data).toBe(false);
    expect((await read(doc.id)).status).toBe("processing");
  });

  it.each(["Auteur", "Visiteur"])("%s : permission refusée", async (who) => {
    const doc = await newDocument();
    const { error } = await fail(who === "Auteur" ? author.client : anon, doc.id, doc.attempt_id);
    expect(error?.code).toBe(DENIED);
    expect((await read(doc.id)).status).toBe("processing");
  });
});

describe("définition des fonctions", () => {
  it("security definer, search_path vide, EXECUTE accordé au seul rôle prévu", () => {
    const rows = localSqlRows(
      "select p.proname, p.prosecdef, p.proconfig::text as config, " +
        "has_function_privilege('anon', p.oid, 'execute') as anon, " +
        "has_function_privilege('authenticated', p.oid, 'execute') as authenticated, " +
        "has_function_privilege('service_role', p.oid, 'execute') as service_role " +
        "from pg_proc p where p.pronamespace = 'public'::regnamespace " +
        "and p.proname in ('abandon_processing', 'fail_processing') order by p.proname",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      proname: "abandon_processing",
      prosecdef: true,
      anon: false,
      authenticated: true,
      service_role: false,
    });
    expect(rows[1]).toMatchObject({
      proname: "fail_processing",
      prosecdef: true,
      anon: false,
      authenticated: false,
      service_role: true,
    });
    for (const row of rows) expect(String(row.config).replaceAll("\\", "")).toContain('search_path=""');
  });
});
