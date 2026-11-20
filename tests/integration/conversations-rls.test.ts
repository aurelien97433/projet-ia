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

// Story 5.6 : question ajoutée à une Conversation (add_question) et vue des listes (conversation_list),
// à deux Comptes (FR-22, exigences S1 et S2).
describe("story 5.6 : add_question et conversation_list", () => {
  const addQuestion = (owner: Account, conversationId: string, requestId: string = crypto.randomUUID()) =>
    owner.client.rpc("add_question", { p_conversation_id: conversationId, p_question: "Et pour un avoir ?", p_client_request_id: requestId });
  const lastMessageAt = async (owner: Account, id: string) =>
    (await owner.client.from("conversations").select("last_message_at").eq("id", id).single()).data!.last_message_at as string;
  const usage = (owner: Account) =>
    localSqlRows(`select coalesce(sum(count), 0) as total from public.ai_usage where user_id = '${owner.id}'`)[0].total;

  it("A ajoute une question à sa Conversation : enregistrée, last_message_at avancé, en tête de la liste", async () => {
    const older = await conversation(a, "Plus ancienne");
    const conv = await conversation(a, "À poursuivre");
    await question(a, conv.id);
    await question(a, older.id);
    // L'autre Conversation a eu le dernier échange : elle est en tête avant la poursuite.
    localSqlRows(`update public.conversations set last_message_at = now() where id = '${older.id}'`);
    const before = await lastMessageAt(a, conv.id);
    const { data, error } = await addQuestion(a, conv.id);
    expect(error).toBeNull();
    expect(data).toMatchObject({ conversation_id: conv.id, message_id: expect.any(String) });
    expect(new Date(await lastMessageAt(a, conv.id)).getTime()).toBeGreaterThan(new Date(before).getTime());
    const kinds = await a.client.from("messages").select("kind").eq("conversation_id", conv.id).order("created_at");
    expect(kinds.data).toEqual([{ kind: "question" }, { kind: "question" }]);
    // La Conversation poursuivie passe devant celle dont la question est plus récente (un test précédent
    // date une autre Conversation de A dans le futur : comparaison limitée aux deux de ce test).
    const list = await a.client
      .from("conversation_list")
      .select("id")
      .in("id", [older.id, conv.id])
      .order("last_message_at", { ascending: false });
    expect(list.data).toEqual([{ id: conv.id }, { id: older.id }]);
  });

  it("FR-22 : B n'ajoute pas de question à la Conversation de A (refusé, rien d'écrit, aucune réservation consommée)", async () => {
    const conv = await conversation(a);
    await question(a, conv.id);
    const before = { usageB: usage(b), date: await lastMessageAt(a, conv.id) };
    const { error } = await addQuestion(b, conv.id);
    expect(error?.code).toBe(FK);
    expect((await readAsAdmin("conversations", conv.id))!.last_message_at).toBe(before.date);
    const { data } = await admin.from("messages").select("id").eq("conversation_id", conv.id);
    expect(data).toHaveLength(1);
    expect(usage(b)).toBe(before.usageB);
    // REST direct avec le jeton de B : même refus.
    const response = await rest(b.token, "/rest/v1/rpc/add_question", {
      method: "POST",
      body: JSON.stringify({ p_conversation_id: conv.id, p_question: "Q", p_client_request_id: crypto.randomUUID() }),
    });
    expect(response.ok).toBe(false);
  });

  it("add_question : même client_request_id → 23505 ; anon : refusé", async () => {
    const conv = await conversation(a);
    const id = crypto.randomUUID();
    await question(a, conv.id, id);
    expect((await addQuestion(a, conv.id, id)).error?.code).toBe(UNIQUE);
    const denied = await anon.rpc("add_question", { p_conversation_id: conv.id, p_question: "Q", p_client_request_id: crypto.randomUUID() });
    expect(denied.error).not.toBeNull();
  });

  it("S1 : B ne voit aucune Conversation de A dans la vue ; anon : rien", async () => {
    const conv = await conversation(a, "Secrète");
    await question(a, conv.id);
    expect((await a.client.from("conversation_list").select("id").eq("id", conv.id)).data).toEqual([{ id: conv.id }]);
    const seenByB = await b.client.from("conversation_list").select("id");
    expect((seenByB.data ?? []).some((row) => row.id === conv.id)).toBe(false);
    const allIdsOfA = (await a.client.from("conversation_list").select("id")).data!.map((row) => row.id);
    expect((seenByB.data ?? []).filter((row) => allIdsOfA.includes(row.id))).toEqual([]);
    const restB = await rest(b.token, `/rest/v1/conversation_list?id=eq.${conv.id}`);
    expect(await restB.json()).toEqual([]);
    const byAnon = await anon.from("conversation_list").select("id").limit(1);
    expect(byAnon.error?.code ?? (byAnon.data?.length === 0 ? "vide" : "lisible")).not.toBe("lisible");
  });

  it("unanswered : réponse (même après un échec) → false ; échec seul → true ; question récente sans réponse → false, ancienne → true", async () => {
    const answered = await conversation(a, "Répondue");
    await question(a, answered.id);
    await assistant(a, answered.id, "failure");
    await assistant(a, answered.id, "refusal_info_absente");
    const failed = await conversation(a, "En échec");
    await question(a, failed.id);
    await assistant(a, failed.id, "failure");
    const pending = await conversation(a, "En cours");
    await question(a, pending.id);
    const abandoned = await conversation(a, "Abandonnée");
    const old = await question(a, abandoned.id);
    // Question vieillie de 10 min (seul l'administrateur peut modifier created_at).
    localSqlRows(`update public.messages set created_at = now() - interval '10 minutes' where id = '${old.id}'`);
    const empty = await conversation(a, "Sans message");
    // Dernier échange seulement : une question suivante sans réponse, ancienne, après un échange répondu.
    const followed = await conversation(a, "Poursuivie");
    await question(a, followed.id);
    await assistant(a, followed.id, "answer");
    await addQuestion(a, followed.id);

    const ids = [answered, failed, pending, abandoned, empty, followed].map((row) => row.id);
    const { data } = await a.client.from("conversation_list").select("id, unanswered").in("id", ids);
    const byId = Object.fromEntries((data ?? []).map((row) => [row.id, row.unanswered]));
    expect(byId).toEqual({
      [answered.id]: false,
      [failed.id]: true,
      [pending.id]: false,
      [abandoned.id]: true,
      [empty.id]: false,
      [followed.id]: false,
    });
  });

  it("S1 et S2 en base : vue security_invoker, droits ; add_question security invoker, search_path vide, EXECUTE à authenticated seul", () => {
    const [view] = localSqlRows(
      "select c.reloptions::text as options, has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select, has_table_privilege('anon', c.oid, 'SELECT') as anon_select, has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert from pg_class c where c.oid = 'public.conversation_list'::regclass",
    );
    expect(view).toEqual({ options: "{security_invoker=true}", auth_select: true, anon_select: false, auth_insert: false });
    const [fn] = localSqlRows(
      "select p.prosecdef as definer, p.proconfig::text as config, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec, not exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0) as no_public from pg_proc p where p.proname = 'add_question' and p.pronamespace = 'public'::regnamespace",
    );
    expect(fn).toEqual({ definer: false, config: '{"search_path=\\"\\""}', auth_exec: true, anon_exec: false, no_public: true });
  });

  it("save_assistant_answer et record_assistant_failure : UNE seule signature chacune (avec p_client_request_id), security invoker, search_path vide, EXECUTE à authenticated seul", () => {
    const rows = localSqlRows(
      "select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer, p.proconfig::text as config, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec, not exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0) as no_public from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('save_assistant_answer', 'record_assistant_failure') order by p.proname",
    );
    const common = { definer: false, config: '{"search_path=\\"\\""}', auth_exec: true, anon_exec: false, no_public: true };
    expect(rows).toEqual([
      // Story 5.9 : p_replace_message_id ajouté (drop puis create), toujours une seule signature.
      { name: "record_assistant_failure", args: "p_conversation_id uuid, p_error_code text, p_client_request_id uuid, p_replace_message_id uuid", ...common },
      {
        name: "save_assistant_answer",
        args: "p_conversation_id uuid, p_kind message_kind, p_content text, p_sources jsonb, p_client_request_id uuid, p_replace_message_id uuid",
        ...common,
      },
    ]);
  });

  it("appel sans p_client_request_id (chat en production avant son déploiement) : accepté, sans ambiguïté, identifiant nul ; avec : enregistré", async () => {
    const conv = await conversation(a, "Appels des deux formes");
    const requestId = crypto.randomUUID();
    await question(a, conv.id, requestId);
    const legacyRefusal = await a.client.rpc("save_assistant_answer", {
      p_conversation_id: conv.id,
      p_kind: "refusal_info_absente",
      p_content: "Refus.",
      p_sources: [],
    });
    expect(legacyRefusal.error).toBeNull();
    const legacyFailure = await a.client.rpc("record_assistant_failure", { p_conversation_id: conv.id, p_error_code: "AI_TIMEOUT" });
    expect(legacyFailure.error).toBeNull();
    const linked = await a.client.rpc("record_assistant_failure", {
      p_conversation_id: conv.id,
      p_error_code: "AI_UNAVAILABLE",
      p_client_request_id: requestId,
    });
    expect(linked.error).toBeNull();
    const { data } = await a.client
      .from("messages")
      .select("kind, error_code, client_request_id")
      .eq("conversation_id", conv.id)
      .eq("role", "assistant")
      .order("created_at");
    expect(data).toEqual([
      { kind: "refusal_info_absente", error_code: null, client_request_id: null },
      { kind: "failure", error_code: "AI_TIMEOUT", client_request_id: null },
      { kind: "failure", error_code: "AI_UNAVAILABLE", client_request_id: requestId },
    ]);
  });

  it("revue, constat 1 : issues de deux questions dans le désordre → unanswered selon la question à laquelle elles répondent", async () => {
    // Réponse de Q1 arrivée après Q2, puis échec de Q2 : le dernier échange (Q2) est sans réponse.
    const crossed = await conversation(a, "Issues croisées");
    const [r1, r2] = [crypto.randomUUID(), crypto.randomUUID()];
    await question(a, crossed.id, r1);
    expect((await addQuestion(a, crossed.id, r2)).error).toBeNull();
    await assistant(a, crossed.id, "refusal_info_absente", { client_request_id: r1 });
    await assistant(a, crossed.id, "failure", { client_request_id: r2 });
    // Inverse : échec de Q1 après Q2, puis réponse de Q2 : le dernier échange est répondu.
    const reversed = await conversation(a, "Issues croisées inverses");
    const [s1, s2] = [crypto.randomUUID(), crypto.randomUUID()];
    await question(a, reversed.id, s1);
    expect((await addQuestion(a, reversed.id, s2)).error).toBeNull();
    await assistant(a, reversed.id, "failure", { client_request_id: s1 });
    await assistant(a, reversed.id, "refusal_info_absente", { client_request_id: s2 });

    const { data } = await a.client.from("conversation_list").select("id, unanswered").in("id", [crossed.id, reversed.id]);
    const byId = Object.fromEntries((data ?? []).map((row) => [row.id, row.unanswered]));
    expect(byId).toEqual({ [crossed.id]: true, [reversed.id]: false });
  });
});

// Story 5.8 (Q1 = A) : add_question enregistre la question autonome d'une question de suivi. Ancienne
// signature supprimée (jamais de surcharge), appel sans le paramètre (chat en production avant son
// redéploiement) accepté ; mêmes droits qu'en 5.6.
describe("story 5.8 : add_question avec la question autonome", () => {
  it("UNE seule signature (avec p_standalone_question), security invoker, search_path vide, EXECUTE à authenticated seul (ni anon, ni service_role, ni public)", () => {
    const rows = localSqlRows(
      "select pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer, p.proconfig::text as config, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec, has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec, not exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0) as no_public from pg_proc p where p.proname = 'add_question' and p.pronamespace = 'public'::regnamespace",
    );
    expect(rows).toEqual([
      {
        args: "p_conversation_id uuid, p_question text, p_client_request_id uuid, p_standalone_question text",
        definer: false,
        config: '{"search_path=\\"\\""}',
        auth_exec: true,
        anon_exec: false,
        service_exec: false,
        no_public: true,
      },
    ]);
  });

  it("avec la question autonome : enregistrée sur la question ; sans le paramètre (forme du chat de la 5.7) : accepté, question autonome nulle", async () => {
    const conv = await conversation(a, "Suivi");
    await question(a, conv.id);
    const withStandalone = await a.client.rpc("add_question", {
      p_conversation_id: conv.id,
      p_question: "Et au-delà de 10 000 euros ?",
      p_client_request_id: crypto.randomUUID(),
      p_standalone_question: "Qui valide une facture au-delà de 10 000 euros ?",
    });
    expect(withStandalone.error).toBeNull();
    const legacy = await a.client.rpc("add_question", {
      p_conversation_id: conv.id,
      p_question: "Et pour un avoir ?",
      p_client_request_id: crypto.randomUUID(),
    });
    expect(legacy.error).toBeNull();
    const { data } = await a.client
      .from("messages")
      .select("content, standalone_question")
      .eq("conversation_id", conv.id)
      .order("created_at");
    expect(data!.slice(1)).toEqual([
      { content: "Et au-delà de 10 000 euros ?", standalone_question: "Qui valide une facture au-delà de 10 000 euros ?" },
      { content: "Et pour un avoir ?", standalone_question: null },
    ]);
  });

  it("contrainte existante : question autonome vide ou de plus de 2 000 caractères refusée, rien d'écrit ; B ne peut pas l'utiliser sur la Conversation de A", async () => {
    const conv = await conversation(a, "Suivi contraint");
    await question(a, conv.id);
    for (const standalone of ["   ", "x".repeat(2_001)]) {
      const { error } = await a.client.rpc("add_question", {
        p_conversation_id: conv.id,
        p_question: "Et ensuite ?",
        p_client_request_id: crypto.randomUUID(),
        p_standalone_question: standalone,
      });
      expect(error?.code).toBe("23514");
    }
    const foreign = await b.client.rpc("add_question", {
      p_conversation_id: conv.id,
      p_question: "Et ensuite ?",
      p_client_request_id: crypto.randomUUID(),
      p_standalone_question: "Question de B",
    });
    expect(foreign.error?.code).toBe(FK);
    const { data } = await admin.from("messages").select("id").eq("conversation_id", conv.id);
    expect(data).toHaveLength(1);
  });
});

// Story 5.9 : idempotence (AD-16). begin_retry (classement et réclamation, verrou transactionnel),
// remplacement de l'échec par save_assistant_answer et record_assistant_failure (p_replace_message_id),
// ligne « en cours » dans conversation_list ; aucune réclamation ni remplacement croisés entre Comptes.
describe("story 5.9 : begin_retry et remplacement de l'échec", () => {
  const QUESTION = "Combien de jours de congés ?";
  type Classified = { outcome: string; conversation_id?: string; replace_message_id?: string; previous_error_code?: string; [key: string]: unknown };
  const beginRetry = async (owner: Account, requestId: string, text = QUESTION, conversationId?: string) => {
    const { data, error } = await owner.client.rpc("begin_retry", {
      p_client_request_id: requestId,
      p_question: text,
      ...(conversationId ? { p_conversation_id: conversationId } : {}),
    });
    if (error) throw new Error(`begin_retry : ${error.code}`);
    return data as Classified;
  };
  // Question vieillie (seul l'administrateur peut modifier created_at).
  const age = (id: string, seconds: number) =>
    localSqlRows(`update public.messages set created_at = clock_timestamp() - interval '${seconds} seconds' where id = '${id}'`);
  const messagesOf = async (owner: Account, conversationId: string) =>
    (
      await owner.client
        .from("messages")
        .select("id, role, kind, content, error_code, client_request_id, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at")
    ).data!;
  const failedQuestion = async (owner: Account, code = "AI_UNAVAILABLE") => {
    const conv = await conversation(owner, "Réessai");
    const requestId = crypto.randomUUID();
    await question(owner, conv.id, requestId);
    const failure = await assistant(owner, conv.id, "failure", { client_request_id: requestId, error_code: code });
    return { conv, requestId, failure };
  };

  it("UNE seule signature de chaque fonction (avec p_replace_message_id), begin_retry : security invoker, search_path vide, EXECUTE à authenticated seul ; déclencheur sans EXECUTE", () => {
    const rows = localSqlRows(
      "select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer, p.proconfig::text as config, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec, has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec, not exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0) as no_public from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('begin_retry', 'save_assistant_answer', 'record_assistant_failure', 'stamp_replaced_failure') order by p.proname",
    );
    const common = { definer: false, config: '{"search_path=\\"\\""}', auth_exec: true, anon_exec: false, service_exec: false, no_public: true };
    expect(rows).toEqual([
      { name: "begin_retry", args: "p_client_request_id uuid, p_question text, p_conversation_id uuid", ...common },
      {
        name: "record_assistant_failure",
        args: "p_conversation_id uuid, p_error_code text, p_client_request_id uuid, p_replace_message_id uuid",
        ...common,
      },
      {
        name: "save_assistant_answer",
        args: "p_conversation_id uuid, p_kind message_kind, p_content text, p_sources jsonb, p_client_request_id uuid, p_replace_message_id uuid",
        ...common,
      },
      { name: "stamp_replaced_failure", args: "", ...common, auth_exec: false },
    ]);
    // Aucun droit nouveau sur la date des messages : seul le déclencheur la fixe.
    const [column] = localSqlRows("select has_column_privilege('authenticated', 'public.messages', 'created_at', 'UPDATE') as created_update");
    expect(column).toEqual({ created_update: false });
  });

  it("appels sans p_replace_message_id (forme du chat de la 5.8, avant son redéploiement) : insertion, comme avant", async () => {
    const conv = await conversation(a, "Forme de la 5.8");
    const requestId = crypto.randomUUID();
    await question(a, conv.id, requestId);
    expect((await a.client.rpc("record_assistant_failure", { p_conversation_id: conv.id, p_error_code: "AI_TIMEOUT", p_client_request_id: requestId })).error).toBeNull();
    const saved = await a.client.rpc("save_assistant_answer", {
      p_conversation_id: conv.id,
      p_kind: "refusal_info_absente",
      p_content: "Refus.",
      p_sources: [],
      p_client_request_id: requestId,
    });
    expect(saved.error).toBeNull();
    // Index partiel limité à role = user : la réponse reprend l'identifiant de sa question.
    expect((await messagesOf(a, conv.id)).map((row) => [row.kind, row.client_request_id])).toEqual([
      ["question", requestId],
      ["failure", requestId],
      ["refusal_info_absente", requestId],
    ]);
  });

  it("classement : nouvelle, autre texte ou autre Conversation (mismatch), en cours (< 90 s), rejeu avec Sources", async () => {
    expect(await beginRetry(a, crypto.randomUUID())).toEqual({ outcome: "new" });

    const pending = await conversation(a, "En cours");
    const pendingId = crypto.randomUUID();
    await question(a, pending.id, pendingId);
    expect(await beginRetry(a, pendingId, "Autre question ?")).toEqual({ outcome: "mismatch" });
    expect(await beginRetry(a, pendingId, QUESTION, (await conversation(a, "Autre")).id)).toEqual({ outcome: "mismatch" });
    expect(await beginRetry(a, pendingId)).toEqual({ outcome: "in_progress", conversation_id: pending.id });
    expect(await beginRetry(a, pendingId, QUESTION, pending.id)).toEqual({ outcome: "in_progress", conversation_id: pending.id });

    const { conv, requestId } = await failedQuestion(a);
    const answer = await assistant(a, conv.id, "answer", { client_request_id: requestId });
    expect((await insertSource(a, answer.id, null)).error).toBeNull();
    // Une réponse l'emporte sur l'échec : rejeu, rien d'écrit.
    const before = await messagesOf(a, conv.id);
    expect(await beginRetry(a, requestId)).toEqual({
      outcome: "replay",
      conversation_id: conv.id,
      kind: "answer",
      content: "Vous avez 25 jours.",
      sources: [{ document_id: null, document_title: "Procédure", text_version: 1, passages }],
    });
    expect(await messagesOf(a, conv.id)).toEqual(before);
  });

  it("réessai après un échec : l'échec est réclamé (REQUEST_IN_PROGRESS, date du moment) ; un second classement → en cours, sans attendre", async () => {
    const { conv, requestId, failure } = await failedQuestion(a, "AI_CITATIONS_INVALID");
    age(failure.id, 300);
    const claimed = await beginRetry(a, requestId);
    expect(claimed).toMatchObject({
      outcome: "retry",
      conversation_id: conv.id,
      question: QUESTION,
      standalone_question: null,
      replace_message_id: failure.id,
      previous_error_code: "AI_CITATIONS_INVALID",
    });
    const rows = await messagesOf(a, conv.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ id: failure.id, kind: "failure", error_code: "REQUEST_IN_PROGRESS" });
    expect(Date.now() - Date.parse(rows[1].created_at as string)).toBeLessThan(30_000);
    // Verrou transactionnel : libéré à la fin de l'appel ; le second classement voit la réclamation.
    const started = Date.now();
    expect(await beginRetry(a, requestId)).toEqual({ outcome: "in_progress", conversation_id: conv.id });
    expect(Date.now() - started).toBeLessThan(5_000);
    // Liste : en cours, pas « Sans réponse ».
    const { data } = await a.client.from("conversation_list").select("unanswered").eq("id", conv.id).single();
    expect(data!.unanswered).toBe(false);
  });

  it("réclamation de plus de 90 s : traitée comme un échec, de nouveau réclamable (jamais bloquée) ; « Sans réponse » dans la liste", async () => {
    const { conv, requestId, failure } = await failedQuestion(a);
    expect((await beginRetry(a, requestId)).outcome).toBe("retry");
    age(failure.id, 91);
    const { data } = await a.client.from("conversation_list").select("unanswered").eq("id", conv.id).single();
    expect(data!.unanswered).toBe(true);
    expect(await beginRetry(a, requestId)).toMatchObject({ outcome: "retry", replace_message_id: failure.id, previous_error_code: "AI_TIMEOUT" });
  });

  it("question sans résultat depuis plus de 90 s : une ligne d'échec REQUEST_IN_PROGRESS est insérée et réclamée", async () => {
    const conv = await conversation(a, "Abandonnée");
    const requestId = crypto.randomUUID();
    const asked = await question(a, conv.id, requestId);
    age(asked.id, 120);
    const claimed = await beginRetry(a, requestId);
    expect(claimed).toMatchObject({ outcome: "retry", previous_error_code: "AI_TIMEOUT" });
    const rows = await messagesOf(a, conv.id);
    expect(rows.map((row) => [row.kind, row.error_code, row.client_request_id])).toEqual([
      ["question", null, requestId],
      ["failure", "REQUEST_IN_PROGRESS", requestId],
    ]);
    expect(rows[1].id).toBe(claimed.replace_message_id);
  });

  it("revue : échec tardif du chat d'origine inséré après la réclamation → la réclamation de moins de 90 s reste « en cours » (classement et liste)", async () => {
    const conv = await conversation(a, "Échec tardif");
    const requestId = crypto.randomUUID();
    const asked = await question(a, conv.id, requestId);
    age(asked.id, 120);
    expect((await beginRetry(a, requestId)).outcome).toBe("retry");
    // Le chat d'origine termine en retard et insère son échec (sans p_replace_message_id), daté après la réclamation.
    const late = await a.client.rpc("record_assistant_failure", { p_conversation_id: conv.id, p_error_code: "AI_TIMEOUT", p_client_request_id: requestId });
    expect(late.error).toBeNull();
    expect(await beginRetry(a, requestId)).toEqual({ outcome: "in_progress", conversation_id: conv.id });
    const { data } = await a.client.from("conversation_list").select("unanswered").eq("id", conv.id).single();
    expect(data!.unanswered).toBe(false);
  });

  it("concurrence : deux classements simultanés du même identifiant → un seul réessai, l'autre en cours", async () => {
    const { requestId, failure } = await failedQuestion(a);
    const results = await Promise.all([beginRetry(a, requestId), beginRetry(a, requestId), beginRetry(a, requestId)]);
    expect(results.filter((result) => result.outcome === "retry")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "in_progress")).toHaveLength(2);
    expect((await readAsAdmin("messages", failure.id))!.error_code).toBe("REQUEST_IN_PROGRESS");
  });

  it("remplacement : la réponse et ses Sources prennent la place de l'échec (même ligne) ; un résultat déjà remplacé ne l'est plus (P0002)", async () => {
    const { conv, requestId, failure } = await failedQuestion(a);
    const claimed = await beginRetry(a, requestId);
    const saved = await a.client.rpc("save_assistant_answer", {
      p_conversation_id: conv.id,
      p_kind: "answer",
      p_content: "Vous avez 25 jours[S1].",
      p_sources: [{ document_id: null, document_title: "Procédure", text_version: 1, passages }],
      p_client_request_id: requestId,
      p_replace_message_id: claimed.replace_message_id,
    });
    expect(saved.error).toBeNull();
    expect((saved.data as { message_id: string }).message_id).toBe(failure.id);
    const rows = await messagesOf(a, conv.id);
    expect(rows.map((row) => [row.id, row.kind, row.error_code])).toEqual([
      [rows[0].id, "question", null],
      [failure.id, "answer", null],
    ]);
    expect((await a.client.from("message_sources").select("id").eq("message_id", failure.id)).data).toHaveLength(1);
    // Réponse validée : ni un nouvel échec ni un autre résultat ne la remplacent.
    const late = await a.client.rpc("record_assistant_failure", {
      p_conversation_id: conv.id,
      p_error_code: "AI_TIMEOUT",
      p_client_request_id: requestId,
      p_replace_message_id: failure.id,
    });
    expect(late.error?.code).toBe("P0002");
    expect((await readAsAdmin("messages", failure.id))!.kind).toBe("answer");
    // Rejeu ensuite.
    expect((await beginRetry(a, requestId)).outcome).toBe("replay");
  });

  it("réessai qui échoue encore : nouvel échec à la place de l'ancien (même ligne, nouveau code)", async () => {
    const { conv, requestId, failure } = await failedQuestion(a);
    await beginRetry(a, requestId);
    const again = await a.client.rpc("record_assistant_failure", {
      p_conversation_id: conv.id,
      p_error_code: "AI_TIMEOUT",
      p_client_request_id: requestId,
      p_replace_message_id: failure.id,
    });
    expect(again.error).toBeNull();
    expect(again.data).toBe(failure.id);
    expect((await messagesOf(a, conv.id)).map((row) => [row.kind, row.error_code])).toEqual([
      ["question", null],
      ["failure", "AI_TIMEOUT"],
    ]);
  });

  it("Q2 : B ne réclame ni ne remplace l'échec de A, avec le même identifiant que A ou un identifiant forgé", async () => {
    const { conv, requestId, failure } = await failedQuestion(a);
    age(failure.id, 300);
    // Même identifiant que A : B n'a aucune question avec lui → nouvelle question, rien de A n'est touché.
    expect(await beginRetry(b, requestId)).toEqual({ outcome: "new" });
    expect(await beginRetry(b, crypto.randomUUID())).toEqual({ outcome: "new" });
    const untouched = await readAsAdmin("messages", failure.id);
    expect(untouched).toMatchObject({ kind: "failure", error_code: "AI_UNAVAILABLE" });
    // p_replace_message_id d'un autre Compte : refusé, rien d'écrit.
    const save = await b.client.rpc("save_assistant_answer", {
      p_conversation_id: conv.id,
      p_kind: "refusal_info_absente",
      p_content: "Intrusion.",
      p_sources: [],
      p_client_request_id: requestId,
      p_replace_message_id: failure.id,
    });
    expect(save.error?.code).toBe("P0002");
    const record = await b.client.rpc("record_assistant_failure", {
      p_conversation_id: conv.id,
      p_error_code: "AI_TIMEOUT",
      p_client_request_id: requestId,
      p_replace_message_id: failure.id,
    });
    expect(record.error?.code).toBe("P0002");
    expect(await readAsAdmin("messages", failure.id)).toEqual(untouched);
    // A ne remplace pas l'échec d'une autre de ses questions (identifiant différent).
    const other = await a.client.rpc("record_assistant_failure", {
      p_conversation_id: conv.id,
      p_error_code: "AI_TIMEOUT",
      p_client_request_id: crypto.randomUUID(),
      p_replace_message_id: failure.id,
    });
    expect(other.error?.code).toBe("P0002");
    // anon : aucun accès.
    expect((await anon.rpc("begin_retry", { p_client_request_id: requestId, p_question: QUESTION })).error).not.toBeNull();
  });
});
