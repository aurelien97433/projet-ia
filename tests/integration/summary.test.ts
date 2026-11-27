import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../../supabase/functions/summarize/index.ts";
import {
  FAKE_SUMMARY_FAILURE_MARKER,
  FAKE_SUMMARY_INVALID_MARKER,
  FAKE_SUMMARY_SLOW_MARKER,
} from "../../supabase/functions/_shared/fake-generation.ts";
import { localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// Résumé (story 6.1) sur Supabase local, génération simulée (aucun appel à OpenAI) :
// - store_summary : droits (EXECUTE à service_role seul, 42501 pour un Collaborateur et pour anon),
//   security definer, search_path vide, signature unique, conditions d'écriture, validation des points,
//   aucune écriture directe de summary_* par l'API ;
// - summarize, exécutée dans ce processus (handle) contre la base locale réelle (Document, réservation,
//   compteurs, store_summary réels), comme les tests de la 5.10 : SUPABASE_URL vaut l'hôte interne
//   « kong » (génération simulée, pile locale), les requêtes sont redirigées vers l'API locale ; seul
//   l'ordre de certaines réponses HTTP est contrôlé pour rendre les courses déterministes.
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const DENIED = "42501";
const INTERNAL = "http://kong:8000";
vi.setConfig({ testTimeout: 120_000 });

type User = { id: string; client: SupabaseClient; token: string };
type SummarizeBody = {
  summary: { points: string[]; generatedAt: string; textVersion: number };
  generated: boolean;
  error: { code: string; retryable: boolean; resetAt?: string };
};

let admin: SupabaseClient;
let anon: SupabaseClient;
const created: string[] = [];

async function signUp(prefix: string): Promise<User> {
  const client = createClient(localSupabase().url, localSupabase().publishableKey, options);
  const { data, error } = await client.auth.signUp({ email: uniqueEmail(prefix), password: PASSWORD });
  if (error || !data.user || !data.session) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  created.push(data.user.id);
  return { id: data.user.id, client, token: data.session.access_token };
}

// Note créée par son Auteur (RLS), puis passée à « prêt » par l'administrateur (comme process-document).
async function readyNote(author: User, text = "La procédure prévoit une validation par le responsable.", status = "ready"): Promise<string> {
  const { data, error } = await author.client
    .from("documents")
    .insert({ title: "Procédure de test", category: "procedure", content_text: text, client_request_id: crypto.randomUUID() })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document impossible : ${error?.code}`);
  if (status !== "processing") {
    const update = await admin.from("documents").update({ status }).eq("id", data.id);
    if (update.error) throw new Error(`Statut impossible : ${update.error.code}`);
  }
  return data.id as string;
}

async function summaryRow(id: string) {
  const { data } = await admin
    .from("documents")
    .select("summary_points, summary_text_version, summary_generated_at, text_version, updated_at")
    .eq("id", id)
    .single();
  return data as { summary_points: string[] | null; summary_text_version: number | null; summary_generated_at: string | null; text_version: number };
}

async function userCount(user: User): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const { data, error } = await user.client.from("ai_usage").select("count").eq("day_utc", day);
  if (error) throw new Error(`ai_usage : ${error.code}`);
  return (data as { count: number }[])[0]?.count ?? 0;
}

const store = (client: SupabaseClient, id: string, version: number, points: unknown) =>
  client.rpc("store_summary", { p_document_id: id, p_text_version: version, p_points: points });

const sqlNumber = (sql: string): number => Number(Object.values(localSqlRows(sql)[0] ?? { value: 0 })[0] ?? 0);
const setLimit = (key: string, value: number) => localSqlRows(`update public.ai_limits set value = ${value} where key = '${key}'`);
let originalCap = 300;

beforeAll(() => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  // Correctif de revue R2 : plafond global relevé le temps du fichier (d'autres exécutions du jour ont pu
  // l'entamer), rétabli à la fin, comme tests/integration/chat.test.ts.
  originalCap = sqlNumber("select value from public.ai_limits where key = 'ai_global_daily_cap'");
  setLimit("ai_global_daily_cap", 1_000_000);
  // Deux requêtes par la CLI (environ 6 s chacune) : délai du hook relevé, comme chat.test.ts.
}, 60_000);

afterAll(async () => {
  setLimit("ai_global_daily_cap", originalCap);
  for (const id of created) await admin.auth.admin.deleteUser(id);
}, 60_000);

describe("store_summary : droits", () => {
  it("security definer, search_path vide, UNE seule signature, EXECUTE à service_role seul (ni authenticated, ni anon, ni public)", () => {
    const rows = localSqlRows(
      [
        "select p.prosecdef, p.proconfig::text as config, pg_get_function_identity_arguments(p.oid) as args,",
        "has_function_privilege('service_role', p.oid, 'execute') as service_role,",
        "has_function_privilege('authenticated', p.oid, 'execute') as authenticated,",
        "has_function_privilege('anon', p.oid, 'execute') as anon,",
        "exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute,",
        "p.proacl is not null as explicit_acl",
        "from pg_proc p join pg_namespace n on n.oid = p.pronamespace",
        "where n.nspname = 'public' and p.proname = 'store_summary'",
      ].join(" "),
    );
    expect(rows).toHaveLength(1);
    const flag = (value: unknown) => String(value) === "true";
    const [row] = rows;
    expect(flag(row.prosecdef)).toBe(true);
    expect(String(row.config).replaceAll("\\", "")).toContain('search_path=""');
    expect(String(row.args)).toBe("p_document_id uuid, p_text_version integer, p_points jsonb");
    expect(flag(row.service_role)).toBe(true);
    expect(flag(row.authenticated)).toBe(false);
    expect(flag(row.anon)).toBe(false);
    expect(flag(row.public_execute)).toBe(false);
    // ACL explicite (pas les droits par défaut de PUBLIC).
    expect(flag(row.explicit_acl)).toBe(true);
  });

  it("un Collaborateur (même l'Auteur) qui appelle store_summary par l'API : 42501, rien d'écrit ; anon aussi", async () => {
    const author = await signUp("resume-droits");
    const id = await readyNote(author);
    expect((await store(author.client, id, 1, ["Résumé arbitraire."])).error?.code).toBe(DENIED);
    expect((await store(anon, id, 1, ["Résumé arbitraire."])).error?.code).toBe(DENIED);
    expect((await summaryRow(id)).summary_points).toBeNull();
  });

  it("écriture directe de summary_* par l'API (PATCH, même par l'Auteur) : refusée, 42501", async () => {
    const author = await signUp("resume-patch");
    const id = await readyNote(author);
    for (const patch of [{ summary_points: ["x"] }, { summary_text_version: 1 }, { summary_generated_at: new Date().toISOString() }]) {
      expect((await author.client.from("documents").update(patch).eq("id", id)).error?.code).toBe(DENIED);
    }
    expect((await summaryRow(id)).summary_points).toBeNull();
    // Aucun nouveau droit d'écriture sur documents : title et category seulement pour authenticated.
    const rows = localSqlRows(
      "select string_agg(column_name, ',' order by column_name) as columns from information_schema.column_privileges where table_schema = 'public' and table_name = 'documents' and grantee = 'authenticated' and privilege_type = 'UPDATE'",
    );
    expect(String(rows[0].columns)).toBe("category,title");
  });
});

describe("store_summary : conditions et validation (service_role)", () => {
  it("Document prêt, version courante, sans Résumé : écrit ; second appel : refusé, le premier Résumé reste", async () => {
    const author = await signUp("resume-conditions");
    const id = await readyNote(author);
    const first = await store(admin, id, 1, ["Premier Résumé."]);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ stored: true, found: true, status: "ready", summary: { points: ["Premier Résumé."], text_version: 1 } });
    const second = await store(admin, id, 1, ["Second Résumé."]);
    expect(second.data).toMatchObject({ stored: false, summary: { points: ["Premier Résumé."] } });
    const row = await summaryRow(id);
    expect(row.summary_points).toEqual(["Premier Résumé."]);
    expect(row.summary_text_version).toBe(1);
    expect(row.summary_generated_at).not.toBeNull();
  });

  it("version dépassée, Document non prêt ou absent : rien d'écrit", async () => {
    const author = await signUp("resume-refus");
    const ready = await readyNote(author);
    expect((await store(admin, ready, 2, ["A."])).data).toMatchObject({ stored: false, found: true, summary: null });
    for (const status of ["processing", "error"]) {
      const id = await readyNote(author, "Texte.", status);
      expect((await store(admin, id, 1, ["A."])).data).toMatchObject({ stored: false, status, summary: null });
      expect((await summaryRow(id)).summary_points).toBeNull();
    }
    expect((await store(admin, crypto.randomUUID(), 1, ["A."])).data).toEqual({ stored: false, found: false, status: null, summary: null });
  });

  it("Résumé obsolète (texte changé) : remplacé pour la nouvelle version", async () => {
    const author = await signUp("resume-obsolete");
    const id = await readyNote(author);
    await store(admin, id, 1, ["Ancien."]);
    await admin.from("documents").update({ text_version: 2 }).eq("id", id);
    expect((await store(admin, id, 2, ["Nouveau."])).data).toMatchObject({ stored: true, summary: { points: ["Nouveau."], text_version: 2 } });
  });

  it.each([
    ["0 point", []],
    ["6 points", ["1", "2", "3", "4", "5", "6"]],
    ["point vide", ["A.", "  "]],
    ["point de plus de 400 caractères", ["x".repeat(401)]],
    ["point non textuel", ["A.", 3]],
    ["objet au lieu d'un tableau", { points: ["A."] }],
    ["null", null],
  ])("points invalides (%s) : 22023, rien d'écrit", async (_, points) => {
    const author = await signUp("resume-validation");
    const id = await readyNote(author);
    expect((await store(admin, id, 1, points)).error?.code).toBe("22023");
    expect((await summaryRow(id)).summary_points).toBeNull();
  });

  it("400 caractères exactement (points de code) : accepté", async () => {
    const author = await signUp("resume-400");
    const id = await readyNote(author);
    expect((await store(admin, id, 1, ["é".repeat(400)])).data).toMatchObject({ stored: true });
  });
});

describe("summarize contre la base locale (génération simulée)", () => {
  const realFetch = globalThis.fetch;
  type Hook = (url: string, run: () => Promise<Response>) => Promise<Response>;
  let hook: Hook = (_url, run) => run();

  beforeEach(() => {
    const env: Record<string, string> = {
      SUPABASE_URL: INTERNAL,
      GENERATION_FAKE: "1",
      SUPABASE_SERVICE_ROLE_KEY: localSupabase().serviceRoleKey,
    };
    vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
    vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
      const url = String(input).replace(INTERNAL, localSupabase().url);
      return hook(url, () => realFetch(url, init));
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    hook = (_url, run) => run();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const summarizeAs = async (user: User, documentId: string) => {
    const response = await handle(
      new Request("http://localhost/functions/v1/summarize", {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}`, apikey: localSupabase().publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      }),
    );
    return { status: response.status, body: (await response.json()) as SummarizeBody };
  };

  it("première génération : Résumé enregistré et renvoyé, compteur +1 ; un autre Collaborateur le reçoit sans appel ni quota", async () => {
    const a = await signUp("resume-a");
    const b = await signUp("resume-b");
    const id = await readyNote(a);
    const first = await summarizeAs(a, id);
    expect(first.status).toBe(200);
    expect(first.body.generated).toBe(true);
    expect(first.body.summary.points.length).toBeGreaterThanOrEqual(1);
    expect(first.body.summary.points.length).toBeLessThanOrEqual(5);
    expect(await userCount(a)).toBe(1);
    const row = await summaryRow(id);
    expect(row.summary_points).toEqual(first.body.summary.points);
    expect(row.summary_text_version).toBe(1);

    // B : même Résumé, aucun appel au fournisseur (aucune réservation), compteur de B inchangé.
    let reservations = 0;
    hook = (url, run) => {
      if (url.endsWith("/rpc/reserve_ai_call")) reservations += 1;
      return run();
    };
    const other = await summarizeAs(b, id);
    expect(other).toEqual({ status: 200, body: { summary: first.body.summary, generated: false } });
    // A redemande : même Résumé, sans quota.
    expect((await summarizeAs(a, id)).body).toEqual({ summary: first.body.summary, generated: false });
    expect(reservations).toBe(0);
    expect(await userCount(b)).toBe(0);
    expect(await userCount(a)).toBe(1);
  });

  // Correctif de revue R1 = A : verrou de demande par Document (begin_summary) avant la réservation.
  it("deux demandes simultanées : une 200 generated, l'autre 409 REQUEST_IN_PROGRESS ; une seule réservation, compteur +1 ; après la fin, Résumé stocké sans quota", async () => {
    const a = await signUp("resume-concurrence");
    const id = await readyNote(a);
    // La première demande garde le verrou tant que la seconde n'a pas reçu sa réponse.
    let open!: () => void;
    const barrier = new Promise<void>((resolve) => {
      open = resolve;
    });
    let reservations = 0;
    hook = async (url, run) => {
      if (url.endsWith("/rpc/reserve_ai_call")) {
        reservations += 1;
        await barrier;
      }
      return run();
    };
    const first = summarizeAs(a, id);
    // Laisse la première prendre le verrou et arriver à la réservation.
    while (reservations === 0) await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await summarizeAs(a, id);
    open();
    const one = await first;
    expect(one.status).toBe(200);
    expect(one.body.generated).toBe(true);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({ code: "REQUEST_IN_PROGRESS", retryable: false });
    expect(reservations).toBe(1);
    expect(await userCount(a)).toBe(1);
    expect(sqlNumber(`select count(*) as value from public.ai_reservations where user_id = '${a.id}'`)).toBe(1);
    // Verrou libéré à la fin.
    expect(sqlNumber(`select count(*) as value from public.summary_requests where document_id = '${id}'`)).toBe(0);
    // Nouvel appel : Résumé stocké, sans verrou ni quota.
    hook = (_url, run) => run();
    const again = await summarizeAs(a, id);
    expect(again).toEqual({ status: 200, body: { summary: one.body.summary, generated: false } });
    expect(await userCount(a)).toBe(1);
  });

  it("verrou expiré (plus de 130 s) : repris par une nouvelle demande", async () => {
    const a = await signUp("resume-verrou-expire");
    const b = await signUp("resume-verrou-expire-b");
    const id = await readyNote(a);
    expect((await admin.rpc("begin_summary", { p_user_id: b.id, p_document_id: id })).data).toBe(true);
    expect((await summarizeAs(a, id)).status).toBe(409);
    localSqlRows(`update public.summary_requests set started_at = now() - interval '131 seconds' where document_id = '${id}'`);
    const result = await summarizeAs(a, id);
    expect(result.status).toBe(200);
    expect(result.body.generated).toBe(true);
    expect(await userCount(a)).toBe(1);
  });

  // Story 7.8 (R1) : begin_summary et end_summary réservées à service_role ; un Collaborateur qui les
  // appelle directement (libérer le verrou pour lancer N Résumés, ou le reprendre en boucle) : 42501.
  it("verrou : end_summary d'un autre Compte ne libère rien ; Collaborateur et anon refusés (42501) ; aucun accès direct à summary_requests", async () => {
    const a = await signUp("resume-verrou-a");
    const b = await signUp("resume-verrou-b");
    const id = await readyNote(a);
    expect((await admin.rpc("begin_summary", { p_user_id: a.id, p_document_id: id })).data).toBe(true);
    expect((await admin.rpc("begin_summary", { p_user_id: b.id, p_document_id: id })).data).toBe(false);
    expect((await admin.rpc("end_summary", { p_user_id: b.id, p_document_id: id })).error).toBeNull();
    expect(sqlNumber(`select count(*) as value from public.summary_requests where document_id = '${id}'`)).toBe(1);
    for (const client of [a.client, anon]) {
      expect((await client.rpc("begin_summary", { p_user_id: a.id, p_document_id: id })).error?.code).toBe(DENIED);
      expect((await client.rpc("end_summary", { p_user_id: a.id, p_document_id: id })).error?.code).toBe(DENIED);
    }
    // Anciennes signatures (sans p_user_id) : supprimées.
    expect((await a.client.rpc("end_summary", { p_document_id: id })).error).not.toBeNull();
    expect(sqlNumber(`select count(*) as value from public.summary_requests where document_id = '${id}'`)).toBe(1);
    expect((await a.client.from("summary_requests").select("*")).error?.code).toBe(DENIED);
    expect(
      (await a.client.from("summary_requests").insert({ document_id: id, user_id: a.id, started_at: new Date().toISOString() })).error?.code,
    ).toBe(DENIED);
    expect((await a.client.from("summary_requests").delete().eq("document_id", id)).error?.code).toBe(DENIED);
    expect((await admin.rpc("end_summary", { p_user_id: a.id, p_document_id: id })).error).toBeNull();
    expect(sqlNumber(`select count(*) as value from public.summary_requests where document_id = '${id}'`)).toBe(0);
  });

  it("garde-fou (story 7.8, R1 et R2) : begin_summary, end_summary, reserve_ai_call et release_ai_call en security definer, search_path vide, une signature, EXECUTE à service_role seul ; RLS sans politique", () => {
    const rows = localSqlRows(
      [
        "select p.proname, p.prosecdef, p.proconfig::text as config, pg_get_function_identity_arguments(p.oid) as args,",
        "has_function_privilege('authenticated', p.oid, 'execute') as authenticated,",
        "has_function_privilege('anon', p.oid, 'execute') as anon,",
        "has_function_privilege('service_role', p.oid, 'execute') as service_role,",
        "exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute",
        "from pg_proc p join pg_namespace n on n.oid = p.pronamespace",
        "where n.nspname = 'public' and p.proname in ('begin_summary', 'end_summary', 'release_ai_call', 'reserve_ai_call') order by p.proname",
      ].join(" "),
    );
    const flag = (value: unknown) => String(value) === "true";
    expect(rows.map((row) => row.proname)).toEqual(["begin_summary", "end_summary", "release_ai_call", "reserve_ai_call"]);
    const args: Record<string, string> = {
      begin_summary: "p_user_id uuid, p_document_id uuid",
      end_summary: "p_user_id uuid, p_document_id uuid",
      release_ai_call: "p_user_id uuid, p_reservation_id uuid",
      reserve_ai_call: "p_user_id uuid",
    };
    for (const row of rows) {
      const name = String(row.proname);
      expect(flag(row.prosecdef), name).toBe(true);
      expect(String(row.config).replaceAll("\\", ""), name).toContain('search_path=""');
      expect(String(row.args), name).toBe(args[name]);
      expect(flag(row.authenticated), name).toBe(false);
      expect(flag(row.anon), name).toBe(false);
      expect(flag(row.service_role), name).toBe(true);
      expect(flag(row.public_execute), name).toBe(false);
    }
    const table = localSqlRows(
      [
        "select c.relrowsecurity as rls,",
        "(select count(*) from pg_policies where schemaname = 'public' and tablename = 'summary_requests') as policies,",
        "has_table_privilege('authenticated', 'public.summary_requests', 'select, insert, update, delete') as authenticated_any,",
        "has_any_column_privilege('authenticated', 'public.summary_requests', 'select, insert, update') as authenticated_columns,",
        "has_table_privilege('anon', 'public.summary_requests', 'select, insert, update, delete') as anon_any",
        "from pg_class c where c.oid = 'public.summary_requests'::regclass",
      ].join(" "),
    );
    expect(flag(table[0].rls)).toBe(true);
    expect(Number(table[0].policies)).toBe(0);
    expect(flag(table[0].authenticated_any)).toBe(false);
    expect(flag(table[0].authenticated_columns)).toBe(false);
    expect(flag(table[0].anon_any)).toBe(false);
  });

  // Story 7.8 (R1) : la génération est facturée, l'unité reste consommée (modifie la règle de la 6.1).
  it("texte changé pendant la génération : écriture refusée, unité consommée, aucun Résumé", async () => {
    const a = await signUp("resume-texte-change");
    const id = await readyNote(a);
    hook = async (url, run) => {
      if (url.endsWith("/rpc/store_summary")) await admin.from("documents").update({ text_version: 2 }).eq("id", id);
      return run();
    };
    const result = await summarizeAs(a, id);
    expect(result.status).toBe(500);
    expect(result.body.error).toMatchObject({ code: "INTERNAL", retryable: true });
    expect(await userCount(a)).toBe(1);
    expect((await summaryRow(id)).summary_points).toBeNull();
  });

  it.each(["processing", "error"])("Document %s : 409 DOCUMENT_NOT_READY, aucune réservation", async (status) => {
    const a = await signUp("resume-non-pret");
    const id = await readyNote(a, "Texte.", status);
    const result = await summarizeAs(a, id);
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("DOCUMENT_NOT_READY");
    expect(await userCount(a)).toBe(0);
  });

  it("Document inexistant : 404, aucune réservation", async () => {
    const a = await signUp("resume-absent");
    const result = await summarizeAs(a, crypto.randomUUID());
    expect(result.status).toBe(404);
    expect(await userCount(a)).toBe(0);
  });

  it("quota atteint (60 sur 60) : 429 QUOTA_EXCEEDED avec resetAt, aucun Résumé", async () => {
    const a = await signUp("resume-quota");
    const id = await readyNote(a);
    await Promise.all(Array.from({ length: 60 }, () => admin.rpc("reserve_ai_call", { p_user_id: a.id })));
    expect(await userCount(a)).toBe(60);
    const result = await summarizeAs(a, id);
    expect(result.status).toBe(429);
    expect(result.body.error.code).toBe("QUOTA_EXCEEDED");
    expect(typeof result.body.error.resetAt).toBe("string");
    expect(await userCount(a)).toBe(60);
    expect((await summaryRow(id)).summary_points).toBeNull();
  });

  it("panne du fournisseur (sans réponse) : AI_UNAVAILABLE, unité rendue, aucun Résumé", async () => {
    const a = await signUp("resume-panne");
    const id = await readyNote(a, `Texte du Document. ${FAKE_SUMMARY_FAILURE_MARKER}`);
    const result = await summarizeAs(a, id);
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("AI_UNAVAILABLE");
    expect(await userCount(a)).toBe(0);
    expect((await summaryRow(id)).summary_points).toBeNull();
  });

  it("sortie non conforme (6 points) : AI_OUTPUT_INVALID, unité consommée, aucun Résumé", async () => {
    const a = await signUp("resume-invalide");
    const id = await readyNote(a, `Texte du Document. ${FAKE_SUMMARY_INVALID_MARKER}`);
    const result = await summarizeAs(a, id);
    expect(result.status).toBe(502);
    expect(result.body.error.code).toBe("AI_OUTPUT_INVALID");
    expect(await userCount(a)).toBe(1);
    expect((await summaryRow(id)).summary_points).toBeNull();
  });

  it("Note de 100 Ko : un seul appel, Résumé enregistré", async () => {
    const a = await signUp("resume-100ko");
    // 100 000 octets UTF-8 exactement (limite d'une Note), repère de réponse lente compris.
    const text = `${FAKE_SUMMARY_SLOW_MARKER} ${"Le Document decrit une procedure. ".repeat(3_000)}`.slice(0, 100_000);
    expect(new TextEncoder().encode(text).length).toBe(100_000);
    const id = await readyNote(a, text);
    let calls = 0;
    hook = (url, run) => {
      if (url.endsWith("/rpc/reserve_ai_call")) calls += 1;
      return run();
    };
    const result = await summarizeAs(a, id);
    expect(calls).toBe(1);
    expect(result.status).toBe(200);
    expect(result.body.generated).toBe(true);
    expect(await userCount(a)).toBe(1);
  });
});
