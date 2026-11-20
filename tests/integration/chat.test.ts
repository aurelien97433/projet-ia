import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Account, type SeedConfig, seedMini } from "../../scripts/seed-demo";
import { NOT_FOUND_MESSAGE, REFUSAL_HORS_CADRE, REFUSAL_INFO_ABSENTE } from "../../supabase/functions/chat/index.ts";
import {
  FAKE_HORS_CADRE_MARKER,
  FAKE_IGNORED_TEXT,
  FAKE_INFO_ABSENTE_MARKER,
  FAKE_INVALID_CITATION_MARKER,
  FAKE_INVALID_MARKER,
  FAKE_NO_CITATION_MARKER,
  FAKE_REWRITE_FAILURE_MARKER,
  FAKE_SLOW_STREAM_MARKER,
} from "../../supabase/functions/_shared/fake-generation.ts";
import { localProcessSecret, localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";
import { getConversation } from "../../src/server/conversations/get-conversation";

// Garde-fou du crédit d'IA et fonction chat (story 5.2a-2) sur Supabase local, avec la vectorisation et
// la génération simulées (aucun appel à OpenAI) : réservation atomique, quota personnel, plafond
// global abaissé par ai_limits, libération jamais sous 0, unité consommée par une réponse sans
// citation, accès refusé à anon et à B, enregistrement atomique, course 23503 → null.
//
// Un seul fichier, exécuté en séquence : il est le seul à modifier le compteur global et ses limites.
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const seedAccount = (prefix: string): Account => ({ email: uniqueEmail(prefix), password: ["Mot", "de", "passe", "seed"].join("-") });
const DAY = "(now() at time zone 'utc')::date";
// Plusieurs requêtes SQL par la CLI dans certains tests : plusieurs secondes chacune quand toute la
// suite tourne en parallèle.
vi.setConfig({ testTimeout: 240_000 });

type User = { id: string; client: SupabaseClient; token: string };
type ChatBody = {
  conversationId: string;
  message: {
    kind: string;
    content: string;
    sources: { documentId: string | null; title: string; passages?: { start: number; end: number }[]; textVersion?: number }[];
  };
  error: { code: string; retryable: boolean; resetAt: string };
};

let admin: SupabaseClient;
let anon: SupabaseClient;
let config: SeedConfig;
let measure: User;
const created: string[] = [];
let originalCap = 300;

async function signUp(prefix: string): Promise<User> {
  const client = createClient(localSupabase().url, localSupabase().publishableKey, options);
  const { data, error } = await client.auth.signUp({ email: uniqueEmail(prefix), password: PASSWORD });
  if (error || !data.user || !data.session) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  created.push(data.user.id);
  return { id: data.user.id, client, token: data.session.access_token };
}

const sqlNumber = (sql: string): number => Number(Object.values(localSqlRows(sql)[0] ?? { value: 0 })[0] ?? 0);
// Compteur du jour du Compte, lu par son propriétaire (politique RLS de lecture) : sans la CLI, lente
// quand toute la suite tourne en parallèle.
async function userCount(user: User): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const { data, error } = await user.client.from("ai_usage").select("count").eq("day_utc", day);
  if (error) throw new Error(`ai_usage : ${error.code}`);
  return (data as { count: number }[])[0]?.count ?? 0;
}
const globalCount = () => sqlNumber(`select coalesce((select count from public.ai_usage_global where day_utc = ${DAY}), 0) as value`);
const setLimit = (key: string, value: number) => localSqlRows(`update public.ai_limits set value = ${value} where key = '${key}'`);

const reserve = async (user: User) => {
  const { data, error } = await user.client.rpc("reserve_ai_call");
  if (error) throw new Error(`reserve_ai_call : ${error.code}`);
  return data as { ok: boolean; reason?: string; reset_at: string; reservation_id?: string };
};

async function chat(user: User, question: string, clientRequestId: string = crypto.randomUUID()) {
  const response = await fetch(`${localSupabase().url}/functions/v1/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${user.token}`, apikey: localSupabase().publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ question, clientRequestId }),
  });
  return { status: response.status, body: (await response.json()) as ChatBody };
}

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  config = {
    url,
    serviceRoleKey,
    processSecret: localProcessSecret(),
    demoA: seedAccount("chat-a"),
    demoB: seedAccount("chat-b"),
    measure: [seedAccount("chat-m1")],
  };
  await seedMini(config, { log: () => {} });
  const client = createClient(url, publishableKey, options);
  const { data, error } = await client.auth.signInWithPassword(config.measure[0]);
  if (error || !data.session || !data.user) throw new Error(`Connexion du Compte de mesure impossible : ${error?.code}`);
  measure = { id: data.user.id, client, token: data.session.access_token };

  // Plafond global relevé le temps du fichier (d'autres exécutions du jour ont pu l'entamer), rétabli à la fin.
  originalCap = sqlNumber("select value from public.ai_limits where key = 'ai_global_daily_cap'");
  setLimit("ai_global_daily_cap", 1_000_000);
}, 180_000);

afterAll(async () => {
  setLimit("ai_global_daily_cap", originalCap);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emails = new Set([config.demoA, config.demoB, ...config.measure].map((item) => item.email));
  for (const user of data.users.filter((candidate) => emails.has(candidate.email ?? "") || created.includes(candidate.id))) {
    await admin.auth.admin.deleteUser(user.id);
  }
});

describe("garde-fou : limites", () => {
  it("ai_limits contient le quota de 60 par Compte et le plafond de 300 du projet (valeurs de la migration)", () => {
    expect(originalCap).toBe(300);
    expect(sqlNumber("select value from public.ai_limits where key = 'ai_daily_quota'")).toBe(60);
  });
});

describe("garde-fou : réservation atomique", () => {
  it("70 réservations concurrentes d'un Compte : exactement 60 acceptées, les autres refusées « user »", async () => {
    const user = await signUp("chat-concurrence");
    const results = await Promise.all(Array.from({ length: 70 }, () => reserve(user)));
    expect(results.filter((result) => result.ok)).toHaveLength(60);
    expect(results.filter((result) => !result.ok).every((result) => result.reason === "user")).toBe(true);
    expect((await userCount(user))).toBe(60);
    // reset_at : prochain 00:00 UTC.
    const reset = new Date(results[0].reset_at);
    expect(reset.getUTCHours() + reset.getUTCMinutes() + reset.getUTCSeconds()).toBe(0);
    expect(reset.getTime() - Date.now()).toBeGreaterThan(0);
    expect(reset.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);
  });

  it("plafond global abaissé par ai_limits : jamais plus que la limite, même en concurrence, raison « global »", async () => {
    const user = await signUp("chat-plafond");
    const before = globalCount();
    setLimit("ai_global_daily_cap", before + 3);
    try {
      const results = await Promise.all(Array.from({ length: 10 }, () => reserve(user)));
      expect(results.filter((result) => result.ok)).toHaveLength(3);
      expect(results.filter((result) => !result.ok).every((result) => result.reason === "global")).toBe(true);
      expect(globalCount()).toBe(before + 3);
      expect((await userCount(user))).toBe(3);
    } finally {
      setLimit("ai_global_daily_cap", 1_000_000);
    }
  });

  it("libération : une seule fois par réservation, aux deux compteurs, jamais par un autre Compte, jamais sous 0", async () => {
    const a = await signUp("chat-liberation-a");
    const b = await signUp("chat-liberation-b");
    const first = await reserve(a);
    const second = await reserve(a);
    const global = globalCount();
    expect((await userCount(a))).toBe(2);

    expect((await b.client.rpc("release_ai_call", { p_reservation_id: first.reservation_id })).data).toBe(false);
    expect((await userCount(a))).toBe(2);

    expect((await a.client.rpc("release_ai_call", { p_reservation_id: first.reservation_id })).data).toBe(true);
    expect((await a.client.rpc("release_ai_call", { p_reservation_id: first.reservation_id })).data).toBe(false);
    expect((await a.client.rpc("release_ai_call", { p_reservation_id: crypto.randomUUID() })).data).toBe(false);
    expect((await userCount(a))).toBe(1);
    expect(globalCount()).toBe(global - 1);

    // Compteur déjà à 0 (cas extrême) : la libération ne le fait jamais passer sous 0.
    localSqlRows(`update public.ai_usage set count = 0 where user_id = '${a.id}'`);
    expect((await a.client.rpc("release_ai_call", { p_reservation_id: second.reservation_id })).data).toBe(true);
    expect((await userCount(a))).toBe(0);
  });
});

describe("garde-fou : accès", () => {
  it("anon : ni compteurs, ni limites, ni réservation", async () => {
    for (const table of ["ai_usage", "ai_usage_global", "ai_limits", "ai_reservations"]) {
      const { data, error } = await anon.from(table).select("*");
      expect(error?.code ?? (data?.length === 0 ? "vide" : "lisible"), table).not.toBe("lisible");
    }
    expect((await anon.rpc("reserve_ai_call")).error).not.toBeNull();
    expect((await anon.rpc("release_ai_call", { p_reservation_id: crypto.randomUUID() })).error).not.toBeNull();
  });

  it("Collaborateur : ses seuls compteurs en lecture ; ni ceux de B, ni le compteur global, ni les limites, ni écriture", async () => {
    const a = await signUp("chat-acces-a");
    const b = await signUp("chat-acces-b");
    await reserve(a);
    await reserve(b);
    const own = await a.client.from("ai_usage").select("user_id, count");
    expect(own.data).toEqual([{ user_id: a.id, count: 1 }]);
    expect((await a.client.from("ai_usage").select("*").eq("user_id", b.id)).data).toEqual([]);
    for (const table of ["ai_usage_global", "ai_limits", "ai_reservations"]) {
      expect((await a.client.from(table).select("*")).error?.code, table).toBe("42501");
    }
    expect((await a.client.from("ai_usage").update({ count: 0 }).eq("user_id", a.id)).error?.code).toBe("42501");
    expect((await a.client.from("ai_limits").update({ value: 1_000 }).eq("key", "ai_daily_quota")).error?.code).toBe("42501");
    expect((await userCount(a))).toBe(1);
  });
});

describe("enregistrement atomique", () => {
  it("start_conversation : identifiant de demande déjà utilisé → 23505, aucune Conversation de plus", async () => {
    const a = await signUp("chat-start");
    const id = crypto.randomUUID();
    expect((await a.client.rpc("start_conversation", { p_title: "Q", p_question: "Q", p_client_request_id: id })).error).toBeNull();
    const duplicate = await a.client.rpc("start_conversation", { p_title: "Q", p_question: "Q", p_client_request_id: id });
    expect(duplicate.error?.code).toBe("23505");
    expect((await a.client.from("conversations").select("id")).data).toHaveLength(1);
  });

  it("save_assistant_answer : une Source invalide annule tout (ni réponse, ni Source, date inchangée)", async () => {
    const a = await signUp("chat-atomique");
    const { data } = await a.client.rpc("start_conversation", { p_title: "Q", p_question: "Q", p_client_request_id: crypto.randomUUID() });
    const conversationId = (data as { conversation_id: string }).conversation_id;
    const result = await a.client.rpc("save_assistant_answer", {
      p_conversation_id: conversationId,
      p_kind: "answer",
      p_content: "Réponse [P1].",
      p_sources: [{ document_id: null, document_title: "Titre", text_version: 1, passages: [{ passage_id: "pas-un-uuid", start: 0, end: 1 }] }],
    });
    expect(result.error?.code).toBe("23514");
    expect((await a.client.from("messages").select("kind").eq("conversation_id", conversationId)).data).toEqual([{ kind: "question" }]);
    expect((await a.client.from("message_sources").select("id")).data).toEqual([]);
  });

  it("save_assistant_answer : impossible dans la Conversation d'un autre Compte", async () => {
    const a = await signUp("chat-autrui-a");
    const b = await signUp("chat-autrui-b");
    const { data } = await a.client.rpc("start_conversation", { p_title: "Q", p_question: "Q", p_client_request_id: crypto.randomUUID() });
    const conversationId = (data as { conversation_id: string }).conversation_id;
    const result = await b.client.rpc("save_assistant_answer", {
      p_conversation_id: conversationId,
      p_kind: "refusal_info_absente",
      p_content: "Refus",
      p_sources: [],
    });
    expect(result.error).not.toBeNull();
    expect((await b.client.rpc("record_assistant_failure", { p_conversation_id: conversationId, p_error_code: "AI_TIMEOUT" })).error).not.toBeNull();
    expect((await a.client.from("messages").select("kind").eq("conversation_id", conversationId)).data).toEqual([{ kind: "question" }]);
  });

  it("course 23503 : Document supprimé avant l'enregistrement → Source gardée avec document_id nul, titre et version conservés", async () => {
    const a = await signUp("chat-course");
    const { data: document } = await a.client
      .from("documents")
      .insert({ title: "Procédure supprimée", category: "procedure", content_text: "Texte.", client_request_id: crypto.randomUUID() })
      .select("id")
      .single();
    const { data: kept } = await a.client
      .from("documents")
      .insert({ title: "Procédure gardée", category: "procedure", content_text: "Texte.", client_request_id: crypto.randomUUID() })
      .select("id")
      .single();
    expect((await a.client.from("documents").delete().eq("id", document!.id)).error).toBeNull();

    const { data } = await a.client.rpc("start_conversation", { p_title: "Q", p_question: "Q", p_client_request_id: crypto.randomUUID() });
    const conversationId = (data as { conversation_id: string }).conversation_id;
    const passages = [{ passage_id: crypto.randomUUID(), start: 0, end: 5 }];
    const saved = await a.client.rpc("save_assistant_answer", {
      p_conversation_id: conversationId,
      p_kind: "answer",
      p_content: "Réponse [P1][P2].",
      p_sources: [
        { document_id: document!.id, document_title: "Procédure supprimée", text_version: 3, passages },
        { document_id: kept!.id, document_title: "Procédure gardée", text_version: 1, passages },
      ],
    });
    expect(saved.error).toBeNull();
    expect((saved.data as { sources: unknown[] }).sources).toEqual([
      { ordinal: 1, document_id: null, document_title: "Procédure supprimée" },
      { ordinal: 2, document_id: kept!.id, document_title: "Procédure gardée" },
    ]);
    const { data: rows } = await a.client.from("message_sources").select("ordinal, document_id, document_title, text_version").order("ordinal");
    expect(rows).toEqual([
      { ordinal: 1, document_id: null, document_title: "Procédure supprimée", text_version: 3 },
      { ordinal: 2, document_id: kept!.id, document_title: "Procédure gardée", text_version: 1 },
    ]);

    // Story 5.7 (report de la 3.4) : le fil relu ne transmet, pour la Source du Document supprimé, que
    // son titre et son nombre de Passages (ni passage_id, ni position, ni version) ; positions et version
    // pour le Document existant.
    const view = await getConversation(conversationId, a.client);
    const reply = view!.exchanges[0].reply;
    expect(reply.kind).toBe("answer");
    expect(reply.kind === "answer" && reply.sources).toEqual([
      { documentId: null, title: "Procédure supprimée", passageCount: 1 },
      { documentId: kept!.id, title: "Procédure gardée", passageCount: 1, passages: [{ start: 0, end: 5 }], textVersion: 1 },
    ]);
    expect(JSON.stringify(view)).not.toContain(passages[0].passage_id);
  });
});

describe("fonction chat (vectorisation et génération simulées)", () => {
  it("question nominale : Conversation, question, réponse et Sources enregistrées ; compteurs +1", async () => {
    const question = "Combien de jours de congés payés un collaborateur a-t-il par an ?";
    const before = { user: (await userCount(measure)), global: globalCount() };
    const { status, body } = await chat(measure, question);
    expect(status).toBe(200);
    expect(body.message.kind).toBe("answer");
    expect(body.message.sources.length).toBeGreaterThan(0);
    expect((await userCount(measure))).toBe(before.user + 1);
    expect(globalCount()).toBe(before.global + 1);

    const { data: conversation } = await measure.client.from("conversations").select("title").eq("id", body.conversationId).single();
    expect(conversation!.title).toBe(question);
    const { data: messages } = await measure.client
      .from("messages")
      .select("id, role, kind, content, client_request_id")
      .eq("conversation_id", body.conversationId)
      .order("created_at");
    expect(messages!.map((message) => message.kind)).toEqual(["question", "answer"]);
    // Story 5.6 (revue, constat 1) : la réponse porte l'identifiant de sa question.
    expect(messages![1].client_request_id).toBe(messages![0].client_request_id);
    expect(messages![1].content).toBe(body.message.content);
    const { data: sources } = await measure.client
      .from("message_sources")
      .select("document_id, document_title, text_version")
      .eq("message_id", messages![1].id)
      .order("ordinal");
    // La Base commune est partagée avec les autres fichiers de test, qui suppriment leurs Documents en
    // parallèle : une Source peut passer à null entre-temps (on delete set null, voulu).
    expect(sources).toHaveLength(body.message.sources.length);
    sources!.forEach((source, index) => expect([body.message.sources[index].documentId, null]).toContain(source.document_id));
    expect(sources!.map((source) => source.document_title)).toEqual(body.message.sources.map((source) => source.title));
    // Story 5.7 (Q1 = A) : chaque Source d'un Document existant porte les positions enregistrées (sans
    // passage_id) et la version du texte ; rien pour un Document supprimé.
    const { data: stored } = await measure.client
      .from("message_sources")
      .select("document_id, text_version, passages")
      .eq("message_id", messages![1].id)
      .order("ordinal");
    body.message.sources.forEach((source, index) => {
      const row = stored![index] as { text_version: number; passages: { passage_id: string; start: number; end: number }[] };
      if (source.documentId === null) {
        expect(source.passages).toBeUndefined();
        expect(source.textVersion).toBeUndefined();
        return;
      }
      expect(source.textVersion).toBe(row.text_version);
      expect(source.passages).toEqual(row.passages.map(({ start, end }) => ({ start, end })));
      for (const passage of row.passages) expect(JSON.stringify(body)).not.toContain(passage.passage_id);
    });
    // Titre et version relus dans documents (Sources dont le Document existe encore).
    for (const source of sources!.filter((item) => item.document_id !== null)) {
      const { data: document } = await measure.client.from("documents").select("title, text_version").eq("id", source.document_id).maybeSingle();
      if (!document) continue;
      expect(source).toMatchObject({ document_title: document.title, text_version: document.text_version });
    }
  });

  it("même clientRequestId : 409 REQUEST_IN_PROGRESS, aucune réservation ni Conversation", async () => {
    const id = crypto.randomUUID();
    expect((await chat(measure, "Sous quel délai les notes de frais sont-elles remboursées ?", id)).status).toBe(200);
    const before = { user: (await userCount(measure)), conversations: (await measure.client.from("conversations").select("id")).data!.length };
    const replay = await chat(measure, "Sous quel délai les notes de frais sont-elles remboursées ?", id);
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe("REQUEST_IN_PROGRESS");
    expect((await userCount(measure))).toBe(before.user);
    expect((await measure.client.from("conversations").select("id")).data).toHaveLength(before.conversations);
  });

  it("réponse sans citation valide : AI_CITATIONS_INVALID, échec enregistré, unité consommée (Compte et global +1)", async () => {
    const before = { user: (await userCount(measure)), global: globalCount() };
    const { status, body } = await chat(measure, `Combien de jours de congés payés par an ? ${FAKE_NO_CITATION_MARKER}`);
    expect(status).toBe(502);
    expect(body.error.code).toBe("AI_CITATIONS_INVALID");
    expect((await userCount(measure))).toBe(before.user + 1);
    expect(globalCount()).toBe(before.global + 1);
    const { data: failure } = await measure.client
      .from("messages")
      .select("kind, content, error_code, client_request_id, conversation_id")
      .eq("kind", "failure")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(failure).toMatchObject({ kind: "failure", content: null, error_code: "AI_CITATIONS_INVALID" });
    // Story 5.6 : l'échec porte l'identifiant de sa question.
    const { data: asked } = await measure.client
      .from("messages")
      .select("client_request_id")
      .eq("conversation_id", failure!.conversation_id)
      .eq("kind", "question")
      .single();
    expect(failure!.client_request_id).toBe(asked!.client_request_id);
  });

  // Story 5.3 : tout refus consomme l'unité, appel court compris (décision du 2026-11-16).
  async function lastAnswer(conversationId: string) {
    const { data } = await measure.client
      .from("messages")
      .select("id, kind, content, error_code")
      .eq("conversation_id", conversationId)
      .neq("kind", "question")
      .single();
    const { data: sources } = await measure.client.from("message_sources").select("id").eq("message_id", data!.id);
    return { kind: data!.kind, content: data!.content, error_code: data!.error_code, sources: sources!.length };
  }

  it("question hors base : appel court simulé → refus « information absente » enregistré, sans Source ; unité consommée", async () => {
    const before = { user: (await userCount(measure)), global: globalCount() };
    const { status, body } = await chat(measure, "xyzzy plugh quux frobnicate");
    expect(status).toBe(200);
    expect(body.message).toEqual({ kind: "refusal_info_absente", content: REFUSAL_INFO_ABSENTE, sources: [] });
    expect(await lastAnswer(body.conversationId)).toEqual({ kind: "refusal_info_absente", content: REFUSAL_INFO_ABSENTE, error_code: null, sources: 0 });
    expect((await userCount(measure))).toBe(before.user + 1);
    expect(globalCount()).toBe(before.global + 1);
  });

  it("question hors base avec le repère hors cadre : appel court simulé → refus « hors cadre » ; unité consommée", async () => {
    const before = await userCount(measure);
    const { status, body } = await chat(measure, `xyzzy plugh quux ${FAKE_HORS_CADRE_MARKER}`);
    expect(status).toBe(200);
    expect(body.message).toEqual({ kind: "refusal_hors_cadre", content: REFUSAL_HORS_CADRE, sources: [] });
    expect(await lastAnswer(body.conversationId)).toEqual({ kind: "refusal_hors_cadre", content: REFUSAL_HORS_CADRE, error_code: null, sources: 0 });
    expect(await userCount(measure)).toBe(before + 1);
  });

  it("refus « information absente » avec Passages : message standard, texte du modèle ignoré ; unité consommée", async () => {
    const before = await userCount(measure);
    const { status, body } = await chat(measure, `Combien de jours de congés payés par an ? ${FAKE_INFO_ABSENTE_MARKER}`);
    expect(status).toBe(200);
    expect(body.message).toEqual({ kind: "refusal_info_absente", content: REFUSAL_INFO_ABSENTE, sources: [] });
    expect(JSON.stringify(body)).not.toContain(FAKE_IGNORED_TEXT);
    expect((await lastAnswer(body.conversationId)).content).toBe(REFUSAL_INFO_ABSENTE);
    expect(await userCount(measure)).toBe(before + 1);
  });

  it("marqueur invalide (génération puis appel court) : AI_OUTPUT_INVALID, échec enregistré ; unité consommée", async () => {
    for (const question of [`Combien de jours de congés payés par an ? ${FAKE_INVALID_MARKER}`, `xyzzy plugh ${FAKE_INVALID_MARKER}`]) {
      const before = await userCount(measure);
      const { status, body } = await chat(measure, question);
      expect(status).toBe(502);
      expect(body.error).toMatchObject({ code: "AI_OUTPUT_INVALID", retryable: true });
      expect(await userCount(measure)).toBe(before + 1);
    }
  });

  it("réponse : enregistrée sans le marqueur", async () => {
    const { body } = await chat(measure, "Sous quel délai les notes de frais sont-elles remboursées ?");
    expect(body.message.kind).toBe("answer");
    expect(body.message.content).not.toMatch(/REPONSE/);
    // Story 5.4 : renvois canoniques [S{n}], jamais de repère [P{n}] enregistré.
    expect(body.message.content).toMatch(/\[S1\]/);
    expect(body.message.content).not.toMatch(/\[P/);
    expect((await lastAnswer(body.conversationId)).content).toBe(body.message.content);
  });

  it("story 5.4 : citation invalide retirée du texte enregistré, renvoi [S1] à la place de [P1] ; unité consommée", async () => {
    const before = await userCount(measure);
    const { status, body } = await chat(measure, `Combien de jours de congés payés par an ? ${FAKE_INVALID_CITATION_MARKER}`);
    expect(status).toBe(200);
    const content = "Réponse simulée à partir des Documents[S1]. Point simulé sans Passage.";
    expect(body.message).toMatchObject({ kind: "answer", content });
    expect(body.message.sources).toHaveLength(1);
    expect(await lastAnswer(body.conversationId)).toEqual({ kind: "answer", content, error_code: null, sources: 1 });
    expect(await userCount(measure)).toBe(before + 1);
  });

  it("quota personnel atteint : 429 QUOTA_EXCEEDED avec resetAt, aucune Conversation", async () => {
    const user = await signUp("chat-quota");
    localSqlRows(`insert into public.ai_usage (user_id, day_utc, count) values ('${user.id}', ${DAY}, 60)`);
    const { status, body } = await chat(user, "Combien de jours de congés payés par an ?");
    expect(status).toBe(429);
    expect(body.error).toMatchObject({ code: "QUOTA_EXCEEDED", retryable: false });
    expect(new Date(body.error.resetAt).getUTCHours()).toBe(0);
    expect((await user.client.from("conversations").select("id")).data).toEqual([]);
  });

  it("plafond global atteint : 503 AI_DAILY_CAP_REACHED, aucune Conversation", async () => {
    const user = await signUp("chat-plafond-fonction");
    setLimit("ai_global_daily_cap", globalCount());
    try {
      const { status, body } = await chat(user, "Combien de jours de congés payés par an ?");
      expect(status).toBe(503);
      expect(body.error.code).toBe("AI_DAILY_CAP_REACHED");
      expect((await user.client.from("conversations").select("id")).data).toEqual([]);
    } finally {
      setLimit("ai_global_daily_cap", 1_000_000);
    }
  });

  it("sans jeton : 401 dès la passerelle", async () => {
    const response = await fetch(`${localSupabase().url}/functions/v1/chat`, {
      method: "POST",
      headers: { apikey: localSupabase().publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Q", clientRequestId: crypto.randomUUID() }),
    });
    expect(response.status).toBe(401);
  });
});

// Story 5.5 : mode flux de chat sur la pile locale (génération simulée diffusée en morceaux, marqueur
// et repères coupés entre deux morceaux).
describe("fonction chat en flux (story 5.5)", () => {
  type StreamEvent = { event: string; data: Record<string, unknown> };
  const request = (user: User, question: string, signal?: AbortSignal, clientRequestId: string = crypto.randomUUID()) =>
    fetch(`${localSupabase().url}/functions/v1/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user.token}`,
        apikey: localSupabase().publishableKey,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ question, clientRequestId }),
      signal,
    });
  async function streamChat(user: User, question: string, clientRequestId?: string) {
    const response = await request(user, question, undefined, clientRequestId);
    const text = await response.text();
    const events: StreamEvent[] = text
      .split("\n\n")
      .filter((block) => block.startsWith("event: "))
      .map((block) => {
        const [eventLine, dataLine] = block.split("\n");
        return { event: eventLine.slice("event: ".length), data: JSON.parse(dataLine.slice("data: ".length)) };
      });
    const deltas = events.filter((event) => event.event === "delta").map((event) => String(event.data.text));
    const final = events.filter((event) => event.event !== "delta");
    return { response, deltas, final };
  }
  async function answerOf(conversationId: string) {
    const { data } = await measure.client
      .from("messages")
      .select("kind, content, error_code")
      .eq("conversation_id", conversationId)
      .neq("kind", "question")
      .maybeSingle();
    return data;
  }
  const latestConversation = async (user: User, title: string) => {
    const { data } = await user.client.from("conversations").select("id").eq("title", title).order("created_at", { ascending: false }).limit(1);
    return data?.[0]?.id as string | undefined;
  };

  it("réponse : delta sans marqueur ni repère, puis done identique au texte enregistré ; unité consommée", async () => {
    const before = await userCount(measure);
    const { response, deltas, final } = await streamChat(measure, "Sous quel délai les notes de frais sont-elles remboursées ?");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(deltas.length).toBeGreaterThanOrEqual(2);
    for (const delta of deltas) expect(delta).not.toMatch(/\[[PS]|REPONSE/);
    expect(final).toHaveLength(1);
    expect(final[0].event).toBe("done");
    const body = final[0].data as { conversationId: string; message: { kind: string; content: string; sources: unknown[] } };
    expect(body.message.kind).toBe("answer");
    expect(body.message.content).toMatch(/\[S1\]/);
    expect(deltas.join("")).toBe(body.message.content.replace(/\[S\d+\]/g, ""));
    expect(await answerOf(body.conversationId)).toEqual({ kind: "answer", content: body.message.content, error_code: null });
    expect(await userCount(measure)).toBe(before + 1);
  });

  it("refus avec Passages : un seul refusal, aucun delta, message standard enregistré", async () => {
    const { deltas, final } = await streamChat(measure, `Combien de jours de congés payés par an ? ${FAKE_INFO_ABSENTE_MARKER}`);
    expect(deltas).toEqual([]);
    expect(final).toEqual([{ event: "refusal", data: { conversationId: expect.any(String), kind: "refusal_info_absente", content: REFUSAL_INFO_ABSENTE } }]);
  });

  it("sans Passage (appel court) : refusal", async () => {
    const { deltas, final } = await streamChat(measure, `xyzzy plugh quux frobnicate ${FAKE_HORS_CADRE_MARKER}`);
    expect(deltas).toEqual([]);
    expect(final).toEqual([{ event: "refusal", data: { conversationId: expect.any(String), kind: "refusal_hors_cadre", content: REFUSAL_HORS_CADRE } }]);
  });

  it("aucune citation valide : delta, puis error AI_CITATIONS_INVALID ; échec enregistré, unité consommée", async () => {
    const question = `Combien de jours de congés payés par an ? ${FAKE_NO_CITATION_MARKER} flux`;
    const before = await userCount(measure);
    const { deltas, final } = await streamChat(measure, question);
    expect(deltas.length).toBeGreaterThan(0);
    expect(final).toEqual([{ event: "error", data: expect.objectContaining({ code: "AI_CITATIONS_INVALID", retryable: true }) }]);
    const conversation = await latestConversation(measure, question);
    expect(await answerOf(conversation!)).toMatchObject({ kind: "failure", error_code: "AI_CITATIONS_INVALID" });
    expect(await userCount(measure)).toBe(before + 1);
  });

  it("marqueur invalide : aucun delta, error AI_OUTPUT_INVALID", async () => {
    const { deltas, final } = await streamChat(measure, `Combien de jours de congés payés par an ? ${FAKE_INVALID_MARKER}`);
    expect(deltas).toEqual([]);
    expect(final[0]).toMatchObject({ event: "error", data: { code: "AI_OUTPUT_INVALID" } });
  });

  it("même clientRequestId en flux : 409 REQUEST_IN_PROGRESS en JSON", async () => {
    const id = crypto.randomUUID();
    await streamChat(measure, "Sous quel délai les notes de frais sont-elles remboursées ?", id);
    const response = await request(measure, "Sous quel délai les notes de frais sont-elles remboursées ?", undefined, id);
    expect(response.status).toBe(409);
    expect(((await response.json()) as ChatBody).error.code).toBe("REQUEST_IN_PROGRESS");
  });

  it("client déconnecté pendant le flux : la réponse est enregistrée quand même", async () => {
    const question = `Sous quel délai les notes de frais sont-elles remboursées ? ${FAKE_SLOW_STREAM_MARKER}`;
    const controller = new AbortController();
    const response = await request(measure, question, controller.signal);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();
    await reader.cancel().catch(() => {});
    let saved: Awaited<ReturnType<typeof answerOf>> = null;
    for (let attempt = 0; attempt < 40 && !saved; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const conversation = await latestConversation(measure, question);
      if (conversation) saved = await answerOf(conversation);
    }
    expect(saved).toMatchObject({ kind: "answer", error_code: null });
    expect(saved!.content).toMatch(/\[S1\]/);
  });
});

// Story 5.6 : poursuivre une Conversation (conversationId), FR-22 à deux Comptes (exigence S3).
describe("fonction chat : Conversation poursuivie (story 5.6)", () => {
  async function follow(user: User, question: string, conversationId: string, stream = false) {
    const response = await fetch(`${localSupabase().url}/functions/v1/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user.token}`,
        apikey: localSupabase().publishableKey,
        "Content-Type": "application/json",
        ...(stream ? { Accept: "text/event-stream" } : {}),
      },
      body: JSON.stringify({ question, clientRequestId: crypto.randomUUID(), conversationId }),
    });
    return { status: response.status, text: await response.text() };
  }

  it("question suivante ajoutée à la même Conversation, last_message_at avancé ; aucune nouvelle Conversation", async () => {
    const first = await chat(measure, "Combien de jours de congés payés un collaborateur a-t-il par an ?");
    expect(first.status).toBe(200);
    const conversationId = first.body.conversationId;
    const before = (await measure.client.from("conversations").select("last_message_at").eq("id", conversationId).single()).data!;
    const count = (await measure.client.from("conversations").select("id")).data!.length;

    const next = await follow(measure, "Sous quel délai les notes de frais sont-elles remboursées ?", conversationId);
    expect(next.status).toBe(200);
    expect((JSON.parse(next.text) as ChatBody).conversationId).toBe(conversationId);
    const { data: messages } = await measure.client.from("messages").select("kind").eq("conversation_id", conversationId).order("created_at");
    expect(messages!.map((message) => message.kind)).toEqual(["question", "answer", "question", "answer"]);
    const after = (await measure.client.from("conversations").select("last_message_at").eq("id", conversationId).single()).data!;
    expect(new Date(after.last_message_at).getTime()).toBeGreaterThan(new Date(before.last_message_at).getTime());
    expect((await measure.client.from("conversations").select("id")).data).toHaveLength(count);
    // Titre inchangé : celui de la première question.
    const { data: conversation } = await measure.client.from("conversations").select("title").eq("id", conversationId).single();
    expect(conversation!.title).toBe("Combien de jours de congés payés un collaborateur a-t-il par an ?");
  });

  it("S3 : conversationId de A envoyé par B → 404 NOT_FOUND identique à un identifiant inexistant ; ni réservation, ni question, ni appel", async () => {
    const owner = await signUp("chat-suivi-a");
    const intruder = await signUp("chat-suivi-b");
    const started = await chat(owner, "Combien de jours de congés payés par an ?");
    const conversationId = started.body.conversationId;
    const before = { usage: await userCount(intruder), global: globalCount() };

    const foreign = await follow(intruder, "Question de B", conversationId);
    const missing = await follow(intruder, "Question de B", crypto.randomUUID());
    const foreignStream = await follow(intruder, "Question de B", conversationId, true);
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreignStream.status).toBe(404);
    expect(foreign.text).toBe(missing.text);
    expect(foreignStream.text).toBe(missing.text);
    expect(JSON.parse(foreign.text)).toEqual({ error: { code: "NOT_FOUND", message: NOT_FOUND_MESSAGE, retryable: false } });

    expect(await userCount(intruder)).toBe(before.usage);
    expect(globalCount()).toBe(before.global);
    expect((await intruder.client.from("messages").select("id")).data).toEqual([]);
    expect((await intruder.client.from("conversations").select("id")).data).toEqual([]);
    const { data: messages } = await owner.client.from("messages").select("kind").eq("conversation_id", conversationId);
    expect(messages).toHaveLength(2);
  });

  it("flux : refusal et error portent la Conversation (Q3 = A)", async () => {
    const start = await chat(measure, "xyzzy plugh quux frobnicate");
    const conversationId = start.body.conversationId;
    const refusal = await follow(measure, `xyzzy plugh ${FAKE_HORS_CADRE_MARKER}`, conversationId, true);
    expect(refusal.text).toContain(`"conversationId":"${conversationId}"`);
    expect(refusal.text).toContain("event: refusal");
    const failure = await follow(measure, `Combien de jours de congés payés par an ? ${FAKE_NO_CITATION_MARKER} suivi`, conversationId, true);
    expect(failure.text).toContain("event: error");
    expect(failure.text).toMatch(new RegExp(`event: error\\ndata: .*"conversationId":"${conversationId}"`));
  });
});

// Story 5.8 : questions de suivi, avec la reformulation simulée (question précédente + nouvelle
// question) : question autonome enregistrée pour une question de suivi, nulle pour une première
// question ; panne simulée → unité rendue, question et échec enregistrés, error avec la Conversation.
describe("fonction chat : questions de suivi (story 5.8)", () => {
  const FIRST = "Combien de jours de congés payés un collaborateur a-t-il par an ?";
  async function follow(user: User, question: string, conversationId: string, stream = false, clientRequestId = crypto.randomUUID()) {
    const response = await fetch(`${localSupabase().url}/functions/v1/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user.token}`,
        apikey: localSupabase().publishableKey,
        "Content-Type": "application/json",
        ...(stream ? { Accept: "text/event-stream" } : {}),
      },
      body: JSON.stringify({ question, clientRequestId, conversationId }),
    });
    return { status: response.status, text: await response.text() };
  }
  const questionsOf = async (user: User, conversationId: string) =>
    (
      await user.client
        .from("messages")
        .select("content, standalone_question")
        .eq("conversation_id", conversationId)
        .eq("role", "user")
        .order("created_at")
    ).data!;

  it("première question : standalone_question nulle ; question de suivi : question autonome enregistrée, réponse dans la même Conversation, unité consommée une seule fois", async () => {
    const user = await signUp("chat-suivi-autonome");
    const first = await chat(user, FIRST);
    expect(first.status).toBe(200);
    expect(first.body.message.kind).toBe("answer");
    const conversationId = first.body.conversationId;
    const before = await userCount(user);

    const next = await follow(user, "Et qui valide la demande ?", conversationId);
    expect(next.status).toBe(200);
    expect((JSON.parse(next.text) as ChatBody).message.kind).toBe("answer");
    expect(await questionsOf(user, conversationId)).toEqual([
      { content: FIRST, standalone_question: null },
      { content: "Et qui valide la demande ?", standalone_question: `${FIRST} Et qui valide la demande ?` },
    ]);
    // Reformulation non comptée : +1 pour la question de suivi seulement.
    expect(await userCount(user)).toBe(before + 1);
  });

  it("Conversation sans échange réglé (échec seul) : aucune reformulation, standalone_question nulle", async () => {
    const user = await signUp("chat-suivi-echec");
    const failed = await chat(user, `${FIRST} ${FAKE_NO_CITATION_MARKER}`);
    expect(failed.body.error.code).toBe("AI_CITATIONS_INVALID");
    const { data: conversations } = await user.client.from("conversations").select("id");
    const conversationId = conversations![0].id as string;
    expect((await follow(user, "Et qui valide la demande ?", conversationId)).status).toBe(200);
    expect((await questionsOf(user, conversationId)).map((row) => row.standalone_question)).toEqual([null, null]);
  });

  it("reformulation en panne (simulée) : compteur inchangé, question et échec AI_UNAVAILABLE enregistrés et rattachés, error avec conversationId (flux), 503 (JSON)", async () => {
    const user = await signUp("chat-suivi-panne");
    const first = await chat(user, FIRST);
    const conversationId = first.body.conversationId;
    const before = { usage: await userCount(user), global: globalCount() };

    const streamRequestId = crypto.randomUUID();
    const streamed = await follow(user, `Et ensuite ? ${FAKE_REWRITE_FAILURE_MARKER}`, conversationId, true, streamRequestId);
    expect(streamed.status).toBe(200);
    expect(streamed.text).not.toContain("event: delta");
    expect(streamed.text).toMatch(new RegExp(`event: error\ndata: .*"code":"AI_UNAVAILABLE".*"conversationId":"${conversationId}"`));
    const json = await follow(user, `Et après ? ${FAKE_REWRITE_FAILURE_MARKER}`, conversationId);
    expect(json.status).toBe(503);
    expect(JSON.parse(json.text).error).toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });

    expect(await userCount(user)).toBe(before.usage);
    expect(globalCount()).toBe(before.global);
    const { data } = await user.client
      .from("messages")
      .select("role, kind, error_code, standalone_question, client_request_id")
      .eq("conversation_id", conversationId)
      .order("created_at");
    expect(data!.slice(2, 4)).toEqual([
      { role: "user", kind: "question", error_code: null, standalone_question: null, client_request_id: streamRequestId },
      { role: "assistant", kind: "failure", error_code: "AI_UNAVAILABLE", standalone_question: null, client_request_id: streamRequestId },
    ]);
    expect(data).toHaveLength(6);
  });
});
