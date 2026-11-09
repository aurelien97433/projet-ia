import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { texts } from "@/lib/texts";
import { localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// retry_processing (AD-5, AD-6, AD-16) sur Supabase local : Statut effectif, Auteur, idempotence,
// tentative périmée, vue et privilèges réels.
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const DENIED = "42501";
const NOT_RETRYABLE = "55000";
const ABSENT = "P0002";
const EXPIRED = () => new Date(Date.now() - 181_000).toISOString();
const REASON = texts.documentStatus.temporaryAuthor;
const VECTOR = JSON.stringify(Array(1536).fill(0.01));

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

async function newDocument(values: Record<string, unknown> = {}): Promise<{ id: string; attempt_id: string }> {
  const { data, error } = await author.client
    .from("documents")
    .insert({ title: "Note", category: "procedure", content_text: "Texte.", client_request_id: crypto.randomUUID() })
    .select("id, attempt_id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  if (Object.keys(values).length > 0) {
    const update = await admin.from("documents").update(values).eq("id", data.id);
    if (update.error) throw new Error(`Mise à jour du Document de test impossible : ${update.error.code}`);
  }
  return data;
}

const temporaryError = { status: "error", error_kind: "temporary", error_message: "Fournisseur indisponible." };

const read = async (id: string) =>
  (
    await admin
      .from("documents")
      .select("status, error_kind, error_message, attempt_id, processing_started_at, last_retry_request_id, updated_at")
      .eq("id", id)
      .single()
  ).data!;

const retry = (client: SupabaseClient, id: string, requestId: string = crypto.randomUUID()) =>
  client.rpc("retry_processing", { p_document_id: id, p_client_request_id: requestId });

const passageCount = async (id: string) =>
  (await admin.from("passages").select("id", { count: "exact", head: true }).eq("document_id", id)).count;

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  author = await signUpUser("relance-auteur");
  other = await signUpUser("relance-autre");
}, 60_000);

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("retry_processing : relances acceptées", () => {
  it("erreur temporaire : nouvelle tentative, état propre, anciens Passages supprimés", async () => {
    const doc = await newDocument(temporaryError);
    const passage = await admin.from("passages").insert({
      document_id: doc.id,
      text_version: 1,
      ordinal: 0,
      start_offset: 0,
      end_offset: 6,
      content: "Texte.",
      embedding: VECTOR,
      embedding_model: "test",
      embedding_version: 1,
    });
    expect(passage.error).toBeNull();
    const before = await read(doc.id);
    const requestId = crypto.randomUUID();

    const { data, error } = await retry(author.client, doc.id, requestId);

    expect(error).toBeNull();
    expect(data).not.toBe(doc.attempt_id);
    const after = await read(doc.id);
    expect(after).toMatchObject({
      status: "processing",
      error_kind: null,
      error_message: null,
      attempt_id: data,
      last_retry_request_id: requestId,
    });
    expect(Date.parse(after.processing_started_at)).toBeGreaterThanOrEqual(Date.parse(before.processing_started_at));
    expect(after.processing_started_at).not.toBe(before.processing_started_at);
    expect(await passageCount(doc.id)).toBe(0);
  });

  it("traitement expiré (status encore processing) : relance acceptée", async () => {
    const doc = await newDocument({ processing_started_at: EXPIRED() });
    const { data, error } = await retry(author.client, doc.id);
    expect(error).toBeNull();
    const after = await read(doc.id);
    expect(after.attempt_id).toBe(data);
    expect(after.attempt_id).not.toBe(doc.attempt_id);
    expect(Date.now() - Date.parse(after.processing_started_at)).toBeLessThan(60_000);
  });
});

describe("retry_processing : refus, rien n'est écrit", () => {
  it("Document absent : P0002", async () => {
    expect((await retry(author.client, crypto.randomUUID())).error?.code).toBe(ABSENT);
  });

  it("non-Auteur : 42501", async () => {
    const doc = await newDocument(temporaryError);
    const before = await read(doc.id);
    expect((await retry(other.client, doc.id)).error?.code).toBe(DENIED);
    expect(await read(doc.id)).toEqual(before);
  });

  it("non-Auteur sur un Document expiré : 42501", async () => {
    const doc = await newDocument({ processing_started_at: EXPIRED() });
    const before = await read(doc.id);
    expect((await retry(other.client, doc.id)).error?.code).toBe(DENIED);
    expect(await read(doc.id)).toEqual(before);
  });

  it("Visiteur : 42501", async () => {
    const doc = await newDocument(temporaryError);
    const before = await read(doc.id);
    expect((await retry(anon, doc.id)).error?.code).toBe(DENIED);
    expect(await read(doc.id)).toEqual(before);
  });

  it.each([
    ["no_text", { status: "error", error_kind: "no_text", error_message: "Sans texte." }],
    ["prêt", { status: "ready" }],
    ["en cours récent", { status: "processing" }],
  ])("%s : 55000", async (_label, values) => {
    const doc = await newDocument(values);
    const before = await read(doc.id);
    expect((await retry(author.client, doc.id)).error?.code).toBe(NOT_RETRYABLE);
    expect(await read(doc.id)).toEqual(before);
  });

  it("identifiant de demande absent : refusé", async () => {
    const doc = await newDocument(temporaryError);
    const before = await read(doc.id);
    const { error } = await author.client.rpc("retry_processing", { p_document_id: doc.id, p_client_request_id: null });
    expect(error?.code).toBe("22023");
    expect(await read(doc.id)).toEqual(before);
  });
});

describe("retry_processing : idempotence", () => {
  it("même identifiant : null, une seule tentative", async () => {
    const doc = await newDocument(temporaryError);
    const requestId = crypto.randomUUID();
    const first = await retry(author.client, doc.id, requestId);
    const afterFirst = await read(doc.id);

    const replay = await retry(author.client, doc.id, requestId);

    expect(replay.error).toBeNull();
    expect(replay.data).toBeNull();
    expect((await read(doc.id)).attempt_id).toBe(first.data);
    expect(await read(doc.id)).toEqual(afterFirst);
  });

  it("rejeu d'un non-Auteur : 42501, jamais null", async () => {
    const doc = await newDocument(temporaryError);
    const requestId = crypto.randomUUID();
    await retry(author.client, doc.id, requestId);
    expect((await retry(other.client, doc.id, requestId)).error?.code).toBe(DENIED);
  });

  it("nouvel identifiant après un nouvel échec : nouvelle tentative", async () => {
    const doc = await newDocument(temporaryError);
    const first = await retry(author.client, doc.id);
    await admin.from("documents").update(temporaryError).eq("id", doc.id);
    const second = await retry(author.client, doc.id);
    expect(second.error).toBeNull();
    expect(second.data).not.toBe(first.data);
  });

  it("nouvel identifiant pendant un traitement récent : 55000", async () => {
    const doc = await newDocument(temporaryError);
    await retry(author.client, doc.id);
    expect((await retry(author.client, doc.id)).error?.code).toBe(NOT_RETRYABLE);
  });
});

describe("retry_processing : relances simultanées", () => {
  it.each([
    ["même identifiant", true],
    ["identifiants différents", false],
  ])("%s : une seule tentative démarre", async (_label, sameRequest) => {
    for (let round = 0; round < 5; round += 1) {
      const doc = await newDocument(temporaryError);
      const first = crypto.randomUUID();
      const results = await Promise.all([
        retry(author.client, doc.id, first),
        retry(author.client, doc.id, sameRequest ? first : crypto.randomUUID()),
      ]);

      const started = results.filter((result) => !result.error && result.data !== null);
      expect(started).toHaveLength(1);
      expect((await read(doc.id)).attempt_id).toBe(started[0].data);

      const [other] = results.filter((result) => result !== started[0]);
      if (sameRequest) expect(other).toMatchObject({ error: null, data: null });
      else expect(other.error?.code).toBe(NOT_RETRYABLE);
    }
  });
});

describe("tentative périmée après une relance", () => {
  it("fail_processing et complete_processing de l'ancienne tentative n'écrivent rien", async () => {
    const doc = await newDocument({ processing_started_at: EXPIRED() });
    await retry(author.client, doc.id);
    await admin
      .from("documents")
      .update({ processing_started_at: new Date().toISOString() })
      .eq("id", doc.id);
    const before = await read(doc.id);

    const failed = await admin.rpc("fail_processing", {
      p_document_id: doc.id,
      p_attempt_id: doc.attempt_id,
      p_kind: "temporary",
      p_message: "Raison.",
    });
    const completed = await admin.rpc("complete_processing", {
      p_document_id: doc.id,
      p_attempt_id: doc.attempt_id,
      p_content_text: "Texte tardif.",
      p_text_version: 1,
      p_embedding_model: "test",
      p_embedding_version: 1,
      p_passages: [{ ordinal: 0, start: 0, end: 6, content: "Texte.", embedding: VECTOR }],
    });

    expect(failed.data).toBe(false);
    expect(completed.data).toBe(false);
    expect(await read(doc.id)).toEqual(before);
    expect(await passageCount(doc.id)).toBe(0);
  });

  it("abandon_processing de l'ancienne tentative n'écrit rien", async () => {
    const doc = await newDocument(temporaryError);
    await retry(author.client, doc.id);
    const before = await read(doc.id);
    const { data } = await author.client.rpc("abandon_processing", {
      p_document_id: doc.id,
      p_attempt_id: doc.attempt_id,
    });
    expect(data).toBe(false);
    expect(await read(doc.id)).toEqual(before);
  });
});

describe("documents_list : effective_error_message", () => {
  const view = async (id: string) =>
    (
      await author.client
        .from("documents_list")
        .select("effective_status, effective_error_kind, effective_error_message")
        .eq("id", id)
        .single()
    ).data;

  it("erreur enregistrée : raison lue en base", async () => {
    const doc = await newDocument({ status: "error", error_kind: "no_text", error_message: "Sans texte." });
    expect(await view(doc.id)).toEqual({
      effective_status: "error",
      effective_error_kind: "no_text",
      effective_error_message: "Sans texte.",
    });
  });

  it("traitement expiré : erreur temporaire avec sa raison", async () => {
    const doc = await newDocument({ processing_started_at: EXPIRED() });
    expect(await view(doc.id)).toEqual({
      effective_status: "error",
      effective_error_kind: "temporary",
      effective_error_message: REASON,
    });
  });

  it("en cours récent : aucune raison", async () => {
    const doc = await newDocument();
    expect((await view(doc.id))?.effective_error_message).toBeNull();
  });

  it("colonne ajoutée en dernier", () => {
    const rows = localSqlRows(
      "select column_name from information_schema.columns " +
        "where table_schema = 'public' and table_name = 'documents_list' order by ordinal_position desc limit 1",
    );
    expect(rows[0]?.column_name).toBe("effective_error_message");
  });
});

describe("définition de retry_processing", () => {
  it("security definer, search_path vide, EXECUTE à authenticated seul", () => {
    const rows = localSqlRows(
      "select p.prosecdef, p.proconfig::text as config, " +
        "has_function_privilege('anon', p.oid, 'execute') as anon, " +
        "has_function_privilege('authenticated', p.oid, 'execute') as authenticated, " +
        "has_function_privilege('service_role', p.oid, 'execute') as service_role " +
        "from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'retry_processing'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ prosecdef: true, anon: false, authenticated: true, service_role: false });
    expect(String(rows[0].config).replaceAll("\\", "")).toContain('search_path=""');
  });
});
