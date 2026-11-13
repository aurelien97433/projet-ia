import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// Conversations, messages et Sources (story 5.1) sur Supabase local, à deux Comptes A et B, plus anon :
// propriétaire seul, cohérence du propriétaire par clés étrangères composites, modifications limitées
// (date d'une Conversation, remplacement d'un échec), mise à null des Sources à la suppression d'un
// Document, unicité de la question, contraintes de taille.
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const DENIED = "42501";
const FK = "23503";
const UNIQUE = "23505";
const CHECK = "23514";

type Account = { id: string; client: SupabaseClient; token: string };
type Row = { id: string };

let admin: SupabaseClient;
let anon: SupabaseClient;
let a: Account;
let b: Account;

async function account(prefix: string): Promise<Account> {
  const client = createClient(localSupabase().url, localSupabase().publishableKey, options);
  const { data, error } = await client.auth.signUp({ email: uniqueEmail(prefix), password: PASSWORD });
  if (error || !data.user || !data.session) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  return { id: data.user.id, client, token: data.session.access_token };
}

async function conversation(owner: Account, title = "Congés payés"): Promise<Row> {
  const { data, error } = await owner.client.from("conversations").insert({ title }).select("id").single();
  if (error || !data) throw new Error(`Conversation impossible : ${error?.code}`);
  return data;
}

const insertMessage = (owner: Account, values: Record<string, unknown>) =>
  owner.client.from("messages").insert(values).select("id").single();

async function question(owner: Account, conversationId: string, requestId: string = crypto.randomUUID()): Promise<Row> {
  const { data, error } = await insertMessage(owner, {
    conversation_id: conversationId,
    role: "user",
    kind: "question",
    content: "Combien de jours de congés ?",
    client_request_id: requestId,
  });
  if (error || !data) throw new Error(`Question impossible : ${error?.code}`);
  return data;
}

async function assistant(owner: Account, conversationId: string, kind: string, extra: Record<string, unknown> = {}): Promise<Row> {
  const values =
    kind === "failure"
      ? { conversation_id: conversationId, role: "assistant", kind, error_code: "AI_TIMEOUT", ...extra }
      : { conversation_id: conversationId, role: "assistant", kind, content: "Vous avez 25 jours.", ...extra };
  const { data, error } = await insertMessage(owner, values);
  if (error || !data) throw new Error(`Message de l'Assistant impossible : ${error?.code}`);
  return data;
}

const passages = [{ passage_id: crypto.randomUUID(), start: 0, end: 10 }];

const insertSource = (owner: Account, messageId: string, documentId: string | null, ordinal = 1) =>
  owner.client
    .from("message_sources")
    .insert({ message_id: messageId, ordinal, document_id: documentId, document_title: "Procédure", text_version: 1, passages })
    .select("id")
    .single();

async function documentOf(owner: Account): Promise<Row> {
  const { data, error } = await owner.client
    .from("documents")
    .insert({ title: "Procédure", category: "procedure", content_text: "Texte.", client_request_id: crypto.randomUUID() })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Document impossible : ${error?.code}`);
  return data;
}

// Appel REST direct avec le jeton d'un Compte, sans la bibliothèque cliente.
const rest = (token: string, url: string, init: RequestInit = {}) =>
  fetch(`${localSupabase().url}${url}`, {
    ...init,
    headers: {
      apikey: localSupabase().publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });

const readAsAdmin = async (table: string, id: string) => (await admin.from(table).select("*").eq("id", id).maybeSingle()).data;

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  [a, b] = await Promise.all([account("conv-a"), account("conv-b")]);
}, 60_000);

afterAll(async () => {
  // Conversations, messages, Sources et Documents suivent la suppression du profil (cascades).
  // Comptes absents si la création a échoué : l'erreur d'origine reste visible.
  for (const owner of [a, b]) if (owner) await admin.auth.admin.deleteUser(owner.id);
});

describe("propriétaire seul", () => {
  it("A crée et lit sa Conversation, sa question, la réponse et deux Sources", async () => {
    const conv = await conversation(a);
    await question(a, conv.id);
    const answer = await assistant(a, conv.id, "answer");
    const doc = await documentOf(a);
    expect((await insertSource(a, answer.id, doc.id, 1)).error).toBeNull();
    expect((await insertSource(a, answer.id, null, 2)).error).toBeNull();
    const read = await a.client.from("messages").select("role, kind").eq("conversation_id", conv.id).order("created_at");
    expect(read.data).toEqual([
      { role: "user", kind: "question" },
      { role: "assistant", kind: "answer" },
    ]);
    expect((await a.client.from("message_sources").select("ordinal").eq("message_id", answer.id)).data).toHaveLength(2);
    const [stored] = (await a.client.from("conversations").select("owner_id").eq("id", conv.id)).data!;
    expect(stored.owner_id).toBe(a.id);
  });

  it("B ne lit rien de A (client et REST direct, trois tables)", async () => {
    const conv = await conversation(a);
    const answer = await assistant(a, conv.id, "answer");
    const source = (await insertSource(a, answer.id, null)).data!;
    const targets: [string, string][] = [
      ["conversations", conv.id],
      ["messages", answer.id],
      ["message_sources", source.id],
    ];
    for (const [table, id] of targets) {
      expect((await b.client.from(table).select("id").eq("id", id)).data).toEqual([]);
      expect(await (await rest(b.token, `/rest/v1/${table}?id=eq.${id}`)).json()).toEqual([]);
    }
  });

  it("B ne supprime rien de A (client et REST direct) : aucun droit de suppression", async () => {
    const conv = await conversation(a);
    const answer = await assistant(a, conv.id, "answer");
    const source = (await insertSource(a, answer.id, null)).data!;
    const targets: [string, string][] = [
      ["message_sources", source.id],
      ["messages", answer.id],
      ["conversations", conv.id],
    ];
    for (const [table, id] of targets) {
      expect((await b.client.from(table).delete().eq("id", id)).error?.code).toBe(DENIED);
      const viaRest = await rest(b.token, `/rest/v1/${table}?id=eq.${id}`, { method: "DELETE" });
      expect((await viaRest.json()).code).toBe(DENIED);
      expect(await readAsAdmin(table, id)).not.toBeNull();
    }
  });

  it("anon : aucune lecture ni création", async () => {
    for (const table of ["conversations", "messages", "message_sources"]) {
      const { error } = await anon.from(table).select("id").limit(1);
      expect(error?.code).toBe(DENIED);
    }
    expect((await anon.from("conversations").insert({ title: "Visiteur" })).error?.code).toBe(DENIED);
  });
});

describe("cohérence du propriétaire (attaque directe)", () => {
  it("B insère un message dans la Conversation de A avec owner_id = B : refusé (23503), rien de créé", async () => {
    const conv = await conversation(a);
    const viaClient = await insertMessage(b, { conversation_id: conv.id, role: "user", kind: "question", content: "Intrusion", client_request_id: crypto.randomUUID() });
    expect(viaClient.error?.code).toBe(FK);
    const viaRest = await rest(b.token, "/rest/v1/messages", {
      method: "POST",
      body: JSON.stringify({ conversation_id: conv.id, role: "assistant", kind: "answer", content: "Intrusion" }),
    });
    expect((await viaRest.json()).code).toBe(FK);
    expect((await admin.from("messages").select("id").eq("conversation_id", conv.id)).data).toEqual([]);
  });

  it("B insère une Source sur un message de A : refusé (23503)", async () => {
    const conv = await conversation(a);
    const answer = await assistant(a, conv.id, "answer");
    expect((await insertSource(b, answer.id, null)).error?.code).toBe(FK);
  });

  it.each([
    ["question", "question"],
    ["échec", "failure"],
    ["refus", "refusal_info_absente"],
  ])("Source sur un message de type %s de son propriétaire : refusée (23503), seulement sur une réponse", async (_label, kind) => {
    const conv = await conversation(a);
    const message = kind === "question" ? await question(a, conv.id) : await assistant(a, conv.id, kind);
    expect((await insertSource(a, message.id, null)).error?.code).toBe(FK);
  });

  it("B usurpe owner_id = A : refusé (42501), colonne non accordée", async () => {
    const conv = await conversation(a);
    const { error } = await b.client.from("messages").insert({ conversation_id: conv.id, owner_id: a.id, role: "assistant", kind: "answer", content: "Usurpation" });
    expect(error?.code).toBe(DENIED);
    expect((await b.client.from("conversations").insert({ title: "Usurpation", owner_id: a.id })).error?.code).toBe(DENIED);
  });

  it("aucune modification d'owner_id, même par son propriétaire (42501)", async () => {
    const conv = await conversation(a);
    expect((await a.client.from("conversations").update({ owner_id: b.id }).eq("id", conv.id)).error?.code).toBe(DENIED);
  });
});

describe("modifications limitées", () => {
  it("Conversation : last_message_at seulement ; title et created_at refusés ; B ne modifie rien de A", async () => {
    const conv = await conversation(a);
    const when = new Date(Date.now() + 60_000).toISOString();
    const ok = await a.client.from("conversations").update({ last_message_at: when }).eq("id", conv.id).select("last_message_at");
    expect(ok.error).toBeNull();
    expect(new Date(ok.data![0].last_message_at).toISOString()).toBe(when);
    expect((await a.client.from("conversations").update({ title: "Autre" }).eq("id", conv.id)).error?.code).toBe(DENIED);
    expect((await a.client.from("conversations").update({ created_at: when }).eq("id", conv.id)).error?.code).toBe(DENIED);
    const byB = await b.client.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id).select("id");
    expect(byB.data).toEqual([]);
  });

  it("« Réessayer » : A remplace son échec par une réponse ; la réponse n'est plus modifiable", async () => {
    const conv = await conversation(a);
    const failure = await assistant(a, conv.id, "failure");
    const replaced = await a.client
      .from("messages")
      .update({ kind: "answer", content: "Réponse après réessai.", error_code: null })
      .eq("id", failure.id)
      .select("kind, content, error_code");
    expect(replaced.error).toBeNull();
    expect(replaced.data).toEqual([{ kind: "answer", content: "Réponse après réessai.", error_code: null }]);
    const again = await a.client.from("messages").update({ content: "Réécriture" }).eq("id", failure.id).select("id");
    expect(again.data).toEqual([]);
    expect((await readAsAdmin("messages", failure.id))!.content).toBe("Réponse après réessai.");
  });

  it("« Réessayer » qui échoue encore (nouveau code) ou se termine par un refus : accepté", async () => {
    const conv = await conversation(a);
    const failure = await assistant(a, conv.id, "failure");
    const again = await a.client.from("messages").update({ error_code: "AI_UNAVAILABLE" }).eq("id", failure.id).select("kind, error_code");
    expect(again.data).toEqual([{ kind: "failure", error_code: "AI_UNAVAILABLE" }]);
    const refusal = await a.client
      .from("messages")
      .update({ kind: "refusal_info_absente", content: "Je ne trouve pas cette information dans les Documents.", error_code: null })
      .eq("id", failure.id)
      .select("kind");
    expect(refusal.data).toEqual([{ kind: "refusal_info_absente" }]);
  });

  it("B ne modifie pas un échec de A (0 ligne), y compris par REST direct", async () => {
    const conv = await conversation(a);
    const failure = await assistant(a, conv.id, "failure");
    const byB = await b.client.from("messages").update({ kind: "answer", content: "Intrusion", error_code: null }).eq("id", failure.id).select("id");
    expect(byB.data).toEqual([]);
    const viaRest = await rest(b.token, `/rest/v1/messages?id=eq.${failure.id}`, {
      method: "PATCH",
      body: JSON.stringify({ kind: "answer", content: "Intrusion", error_code: null }),
    });
    expect(await viaRest.json()).toEqual([]);
    expect((await readAsAdmin("messages", failure.id))!.kind).toBe("failure");
  });

  it("A ne transforme pas une question en échec (0 ligne)", async () => {
    const conv = await conversation(a);
    const q = await question(a, conv.id);
    const result = await a.client.from("messages").update({ kind: "failure", content: null, error_code: "AI_TIMEOUT" }).eq("id", q.id).select("id");
    expect(result.data).toEqual([]);
    expect((await readAsAdmin("messages", q.id))!.kind).toBe("question");
  });

  it.each([
    ["conversation_id (déplacement vers une autre Conversation)", "conversation_id"],
    ["role", "role"],
    ["owner_id", "owner_id"],
    ["client_request_id", "client_request_id"],
  ])("A ne change pas %s d'un échec (42501)", async (_label, column) => {
    const conv = await conversation(a);
    const other = await conversation(a, "Autre Conversation");
    const failure = await assistant(a, conv.id, "failure");
    const values: Record<string, unknown> = {
      conversation_id: other.id,
      role: "user",
      owner_id: b.id,
      client_request_id: crypto.randomUUID(),
    };
    const { error } = await a.client.from("messages").update({ [column]: values[column] }).eq("id", failure.id);
    expect(error?.code).toBe(DENIED);
    expect((await readAsAdmin("messages", failure.id))!.conversation_id).toBe(conv.id);
  });

  it("aucune modification ni suppression de Source ; aucune suppression de message ni de Conversation", async () => {
    const conv = await conversation(a);
    const answer = await assistant(a, conv.id, "answer");
    const source = (await insertSource(a, answer.id, null)).data!;
    expect((await a.client.from("message_sources").update({ document_title: "Autre" }).eq("id", source.id)).error?.code).toBe(DENIED);
    expect((await a.client.from("message_sources").delete().eq("id", source.id)).error?.code).toBe(DENIED);
    expect((await a.client.from("messages").delete().eq("id", answer.id)).error?.code).toBe(DENIED);
    expect((await a.client.from("conversations").delete().eq("id", conv.id)).error?.code).toBe(DENIED);
  });
});

describe("Document supprimé (FR-12)", () => {
  it("A supprime son Document : la Source de B passe à null, titre gardé ; A ne lit jamais cette Source", async () => {
    const doc = await documentOf(a);
    const conv = await conversation(b);
    const answer = await assistant(b, conv.id, "answer");
    const source = (await insertSource(b, answer.id, doc.id)).data!;
    expect((await a.client.from("message_sources").select("id").eq("id", source.id)).data).toEqual([]);

    expect((await a.client.from("documents").delete().eq("id", doc.id).select("id")).data).toEqual([{ id: doc.id }]);

    const after = await b.client.from("message_sources").select("document_id, document_title").eq("id", source.id).single();
    expect(after.data).toEqual({ document_id: null, document_title: "Procédure" });
    expect((await a.client.from("message_sources").select("id").eq("id", source.id)).data).toEqual([]);
  });
});

describe("unicité et contraintes", () => {
  it("même client_request_id : 2e question de A refusée (23505) ; accepté pour une réponse de A et une question de B", async () => {
    const requestId = crypto.randomUUID();
    const convA = await conversation(a);
    await question(a, convA.id, requestId);
    const again = await insertMessage(a, { conversation_id: convA.id, role: "user", kind: "question", content: "Encore ?", client_request_id: requestId });
    expect(again.error?.code).toBe(UNIQUE);
    await expect(assistant(a, convA.id, "answer", { client_request_id: requestId })).resolves.toBeDefined();
    const convB = await conversation(b);
    await expect(question(b, convB.id, requestId)).resolves.toBeDefined();
  });

  it.each([
    ["question de 2 001 caractères", { role: "user", kind: "question", content: "a".repeat(2001), client_request_id: crypto.randomUUID() }],
    ["question sans client_request_id", { role: "user", kind: "question", content: "Question" }],
    ["question vide", { role: "user", kind: "question", content: "   ", client_request_id: crypto.randomUUID() }],
    ["réponse de 20 001 caractères", { role: "assistant", kind: "answer", content: "a".repeat(20001) }],
    ["échec avec texte", { role: "assistant", kind: "failure", content: "texte", error_code: "AI_TIMEOUT" }],
    ["échec sans code", { role: "assistant", kind: "failure" }],
    ["réponse avec code d'erreur", { role: "assistant", kind: "answer", content: "Texte", error_code: "AI_TIMEOUT" }],
    ["code d'erreur hors format", { role: "assistant", kind: "failure", error_code: "erreur libre" }],
    ["rôle et type incohérents", { role: "assistant", kind: "question", content: "Texte", client_request_id: crypto.randomUUID() }],
    ["question reformulée sur une réponse", { role: "assistant", kind: "answer", content: "Texte", standalone_question: "Reformulée" }],
  ])("%s : refusé (23514)", async (_label, values) => {
    const conv = await conversation(a);
    expect((await insertMessage(a, { conversation_id: conv.id, ...values })).error?.code).toBe(CHECK);
  });

  it("limites acceptées : question de 2 000 et réponse de 20 000 caractères", async () => {
    const conv = await conversation(a);
    expect((await insertMessage(a, { conversation_id: conv.id, role: "user", kind: "question", content: "a".repeat(2000), client_request_id: crypto.randomUUID() })).error).toBeNull();
    expect((await insertMessage(a, { conversation_id: conv.id, role: "assistant", kind: "answer", content: "a".repeat(20000) })).error).toBeNull();
  });

  it.each([
    ["passages vide", { passages: [] }],
    ["21 passages", { passages: Array.from({ length: 21 }, () => passages[0]) }],
    ["passages non tableau", { passages: { passage_id: "x" } }],
    ["ordinal 0", { ordinal: 0 }],
  ])("Source : %s refusé (23514)", async (_label, override) => {
    const conv = await conversation(a);
    const answer = await assistant(a, conv.id, "answer");
    const { error } = await a.client
      .from("message_sources")
      .insert({ message_id: answer.id, ordinal: 1, document_id: null, document_title: "Procédure", text_version: 1, passages, ...override });
    expect(error?.code).toBe(CHECK);
  });

  it.each([
    ["question de 1 caractère et 3 000 espaces", { role: "user", kind: "question", content: "a" + " ".repeat(3000), client_request_id: crypto.randomUUID() }],
    ["question faite de retours à la ligne", { role: "user", kind: "question", content: "\n\t\n", client_request_id: crypto.randomUUID() }],
    ["réponse de 20 001 caractères avec espaces", { role: "assistant", kind: "answer", content: "b" + " ".repeat(20000) }],
    ["question reformulée de 2 001 caractères", { role: "user", kind: "question", content: "Q", client_request_id: crypto.randomUUID(), standalone_question: "a".repeat(2001) }],
    ["code d'erreur de 65 caractères", { role: "assistant", kind: "failure", error_code: "A".repeat(65) }],
  ])("taille brute : %s refusé (23514)", async (_label, values) => {
    const conv = await conversation(a);
    expect((await insertMessage(a, { conversation_id: conv.id, ...values })).error?.code).toBe(CHECK);
  });

  it("question reformulée de 2 000 caractères acceptée sur une question", async () => {
    const conv = await conversation(a);
    const { error } = await insertMessage(a, {
      conversation_id: conv.id,
      role: "user",
      kind: "question",
      content: "Et pour les cadres ?",
      standalone_question: "a".repeat(2000),
      client_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
  });

  it("numéro d'ordre en double sur une même réponse : refusé (23505) ; 21 refusé (23514), 20 accepté", async () => {
    const conv = await conversation(a);
    const answer = await assistant(a, conv.id, "answer");
    expect((await insertSource(a, answer.id, null, 1)).error).toBeNull();
    expect((await insertSource(a, answer.id, null, 1)).error?.code).toBe(UNIQUE);
    expect((await insertSource(a, answer.id, null, 21)).error?.code).toBe(CHECK);
    expect((await insertSource(a, answer.id, null, 20)).error).toBeNull();
  });

  const validPassage = { passage_id: crypto.randomUUID(), start: 0, end: 10 };
  it.each([
    ["extrait de texte copié (Q1 = A)", [{ ...validPassage, text: "Extrait du Passage." }]],
    ["clé manquante", [{ passage_id: validPassage.passage_id, start: 0 }]],
    ["passage_id non UUID", [{ ...validPassage, passage_id: "pas-un-uuid" }]],
    ["start négatif", [{ ...validPassage, start: -1 }]],
    ["start égal à end", [{ ...validPassage, start: 10, end: 10 }]],
    ["position décimale", [{ ...validPassage, end: 10.5 }]],
    ["position en texte", [{ ...validPassage, start: "0" }]],
    ["élément non objet", ["texte"]],
  ])("passages : %s refusé (23514)", async (_label, value) => {
    const conv = await conversation(a);
    const answer = await assistant(a, conv.id, "answer");
    const { error } = await a.client
      .from("message_sources")
      .insert({ message_id: answer.id, ordinal: 1, document_id: null, document_title: "Procédure", text_version: 1, passages: value });
    expect(error?.code).toBe(CHECK);
  });

  it.each([
    ["titre de Document fait de blancs", { document_title: "   " }],
    ["titre de Document de 201 caractères", { document_title: "a".repeat(201) }],
    ["text_version 0", { text_version: 0 }],
  ])("Source : %s refusé (23514)", async (_label, override) => {
    const conv = await conversation(a);
    const answer = await assistant(a, conv.id, "answer");
    const { error } = await a.client
      .from("message_sources")
      .insert({ message_id: answer.id, ordinal: 1, document_id: null, document_title: "Procédure", text_version: 1, passages, ...override });
    expect(error?.code).toBe(CHECK);
  });

  it("Conversation : titre fait de blancs refusé ; last_message_at antérieur à la création refusé (23514)", async () => {
    expect((await a.client.from("conversations").insert({ title: " \n " })).error?.code).toBe(CHECK);
    const conv = await conversation(a);
    const before = await a.client.from("conversations").update({ last_message_at: "2000-01-01T00:00:00Z" }).eq("id", conv.id);
    expect(before.error?.code).toBe(CHECK);
  });

  it("created_at des messages par clock_timestamp() : question et réponse d'une même transaction restent ordonnées", () => {
    const [row] = localSqlRows(
      "select column_default from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'created_at'",
    );
    expect(row.column_default).toBe("clock_timestamp()");
  });

  it("titre de Conversation de 121 caractères refusé (23514), 120 accepté", async () => {
    expect((await a.client.from("conversations").insert({ title: "a".repeat(121) })).error?.code).toBe(CHECK);
    expect((await a.client.from("conversations").insert({ title: "a".repeat(120) })).error).toBeNull();
  });
});

describe("privilèges SQL réels", () => {
  it("RLS activée, politiques toutes to authenticated, aucune politique delete", () => {
    const tables = localSqlRows(
      "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('conversations', 'messages', 'message_sources') order by relname",
    );
    expect(tables).toEqual([
      { relname: "conversations", relrowsecurity: true },
      { relname: "message_sources", relrowsecurity: true },
      { relname: "messages", relrowsecurity: true },
    ]);
    const policies = localSqlRows(
      "select tablename, cmd, roles::text as roles from pg_policies where schemaname = 'public' and tablename in ('conversations', 'messages', 'message_sources') order by tablename, cmd",
    );
    expect(policies.every((row) => row.roles === "{authenticated}")).toBe(true);
    expect(policies.map((row) => `${row.tablename}:${row.cmd}`)).toEqual([
      "conversations:INSERT",
      "conversations:SELECT",
      "conversations:UPDATE",
      "message_sources:INSERT",
      "message_sources:SELECT",
      "messages:INSERT",
      "messages:SELECT",
      "messages:UPDATE",
    ]);
  });

  it("authenticated : modifications limitées aux colonnes prévues ; anon : rien", () => {
    const [row] = localSqlRows(`select
      has_column_privilege('authenticated', 'public.conversations', 'last_message_at', 'UPDATE') as conv_last,
      has_column_privilege('authenticated', 'public.conversations', 'title', 'UPDATE') as conv_title,
      has_column_privilege('authenticated', 'public.conversations', 'owner_id', 'INSERT') as conv_owner,
      has_column_privilege('authenticated', 'public.messages', 'content', 'UPDATE') as msg_content,
      has_column_privilege('authenticated', 'public.messages', 'conversation_id', 'UPDATE') as msg_conv,
      has_column_privilege('authenticated', 'public.messages', 'role', 'UPDATE') as msg_role,
      has_column_privilege('authenticated', 'public.messages', 'client_request_id', 'UPDATE') as msg_request,
      has_column_privilege('authenticated', 'public.messages', 'owner_id', 'INSERT') as msg_owner,
      has_table_privilege('authenticated', 'public.message_sources', 'UPDATE') as src_update,
      has_table_privilege('authenticated', 'public.conversations', 'DELETE') as conv_delete,
      has_table_privilege('anon', 'public.conversations', 'SELECT,INSERT,UPDATE,DELETE') as anon_conv,
      has_table_privilege('anon', 'public.messages', 'SELECT,INSERT,UPDATE,DELETE') as anon_msg,
      has_table_privilege('anon', 'public.message_sources', 'SELECT,INSERT,UPDATE,DELETE') as anon_src`.replace(/\s+/g, " "));
    expect(row).toEqual({
      conv_last: true,
      conv_title: false,
      conv_owner: false,
      msg_content: true,
      msg_conv: false,
      msg_role: false,
      msg_request: false,
      msg_owner: false,
      src_update: false,
      conv_delete: false,
      anon_conv: false,
      anon_msg: false,
      anon_src: false,
    });
  });

  it("clés étrangères : composites vers le propriétaire, set null vers documents, cascade depuis la Conversation", () => {
    const rows = localSqlRows(
      "select conname, confdeltype from pg_constraint where contype = 'f' and conrelid in ('public.messages'::regclass, 'public.message_sources'::regclass) order by conname",
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { conname: "messages_conversation_owner_fk", confdeltype: "c" },
        { conname: "message_sources_message_owner_fk", confdeltype: "c" },
        { conname: "message_sources_document_id_fkey", confdeltype: "n" },
      ]),
    );
  });
});
