import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";
import { handle } from "../../supabase/functions/process-document/index.ts";

// Edge Function process-document (AD-5), base simulée. Les appels réels sont dans tests/integration.
const SECRET = ["valeur", "de", "test", "unitaire"].join("-");
const URL_FUNCTION = "http://fonction.test/process-document";
const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const BODY = { document_id: DOCUMENT_ID, attempt_id: ATTEMPT_ID };

const env: Record<string, string | undefined> = {};
const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
const dbFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const post = (body: unknown, secret: string | null = SECRET) =>
  new Request(URL_FUNCTION, {
    method: "POST",
    headers: secret === null ? {} : { Authorization: `Bearer ${secret}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const row = (startedAt: Date) => Response.json([{ processing_started_at: startedAt.toISOString() }]);

const OPENAI_KEY_NAME = ["OPENAI", "API", "KEY"].join("_");

type Backend = {
  text?: string | null;
  superseded?: boolean;
  read?: () => Response;
  fail?: () => Response;
  embeddings?: (input: string[]) => Response;
  complete?: () => Response;
};

// Base et fournisseur simulés, pour le travail complet : chaque appel est conservé.
function backend({ text = "Texte de la Note.", superseded = false, read, fail, embeddings, complete }: Backend = {}) {
  const calls = {
    provider: [] as string[][],
    completed: [] as Record<string, unknown>[],
    failed: [] as Record<string, unknown>[],
    reads: [] as string[],
  };
  dbFetch.mockImplementation(async (url, init) => {
    if (url.includes("api.openai.com")) {
      const { input } = JSON.parse(init?.body as string) as { input: string[] };
      calls.provider.push(input);
      if (embeddings) return embeddings(input);
      return Response.json({ data: input.map((_, index) => ({ index, embedding: new Array(1536).fill(0.1) })) });
    }
    if (url.includes("rpc/complete_processing")) {
      calls.completed.push(JSON.parse(init?.body as string));
      return complete ? complete() : Response.json(true);
    }
    if (url.includes("rpc/fail_processing")) {
      calls.failed.push(JSON.parse(init?.body as string));
      return fail ? fail() : Response.json(true);
    }
    if (url.includes("content_text")) {
      calls.reads.push(url);
      if (read) return read();
      return Response.json(superseded ? [] : [{ content_text: text, text_version: 3 }]);
    }
    return row(new Date());
  });
  return calls;
}

async function runDefaultWork() {
  expect((await handle(post(BODY))).status).toBe(202);
  await waitUntil.mock.calls[0][0];
}

beforeEach(() => {
  Object.assign(env, {
    PROCESS_DOCUMENT_SECRET: SECRET,
    SUPABASE_URL: "http://base.test",
    [OPENAI_KEY_NAME]: "cle-de-test",
    [["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")]: "cle-de-test",
  });
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
  vi.stubGlobal("EdgeRuntime", { waitUntil });
  vi.stubGlobal("fetch", dbFetch);
  dbFetch.mockImplementation(async () => row(new Date()));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  waitUntil.mockReset();
  dbFetch.mockReset();
});

describe("refus, sans rien lancer ni lire", () => {
  it.each([
    ["sans secret", null],
    ["avec un mauvais secret", "mauvais-secret"],
    ["avec un secret vide", ""],
  ])("%s : 401", async (_label, secret) => {
    const response = await handle(post(BODY, secret));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(dbFetch).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("secret non configuré côté fonction : tout appel est refusé", async () => {
    delete env["PROCESS_DOCUMENT_SECRET"];
    expect((await handle(post(BODY))).status).toBe(401);
    expect((await handle(post(BODY, ""))).status).toBe(401);
  });

  it("autre méthode que POST : 405, avant le contrôle du secret", async () => {
    expect((await handle(new Request(URL_FUNCTION))).status).toBe(405);
  });

  it.each([
    ["JSON invalide", "{"],
    ["corps nul", "null"],
    ["identifiant non UUID", { document_id: "abc", attempt_id: ATTEMPT_ID }],
    ["tentative absente", { document_id: DOCUMENT_ID }],
    ["identifiant non textuel", { document_id: 1, attempt_id: 2 }],
  ])("%s : 400", async (_label, body) => {
    expect((await handle(post(body))).status).toBe(400);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("tentative inconnue ou Document plus en cours : 404", async () => {
    dbFetch.mockImplementation(async () => Response.json([]));
    expect((await handle(post(BODY))).status).toBe(404);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("tentative expirée (plus de 3 min) : 404", async () => {
    dbFetch.mockImplementation(async () => row(new Date(Date.now() - 181_000)));
    expect((await handle(post(BODY))).status).toBe(404);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each([
    ["base en erreur", async () => new Response("", { status: 503 })],
    ["base injoignable", () => Promise.reject(new TypeError("réseau"))],
  ])("%s : 500, le travail n'est pas lancé", async (_label, implementation) => {
    dbFetch.mockImplementation(implementation);
    expect((await handle(post(BODY))).status).toBe(500);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("le secret n'apparaît dans aucune réponse ni aucun journal", async () => {
    const log = vi.mocked(console.error);
    const responses = await Promise.all([handle(post(BODY, "mauvais-secret")), handle(post(BODY))]);
    const bodies = await Promise.all(responses.map((response) => response.text()));
    const output = [...bodies, ...log.mock.calls.flat()].join(" ");
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain("mauvais-secret");
  });
});

describe("accusé et travail d'arrière-plan", () => {
  it("répond 202 sans attendre la fin du travail, confié à EdgeRuntime.waitUntil", async () => {
    let finish!: () => void;
    const work = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));

    const response = await handle(post(BODY), work);

    expect(response.status).toBe(202);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledWith({ documentId: DOCUMENT_ID, attemptId: ATTEMPT_ID });
    finish();
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it("accusé et fin du travail : niveau Info, aucun journal au niveau Error", async () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    backend();
    await runDefaultWork();
    const output = info.mock.calls.flat().join(" ");
    expect(output).toContain("process_document_accepted");
    expect(output).toContain("process_document_work_done");
    expect(output).toContain('"passages":1');
    expect(output).toContain('"embed_ms":');
    expect(output).toContain('"complete_ms":');
    expect(output).toContain('"duration_ms":');
    expect(output).not.toContain("Texte de la Note");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("travail complet : texte normalisé, positions, vecteurs, modèle, en un seul appel final", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const calls = backend({ text: "  Bonjour  \r\ne\u0301te\u0301 \r\n" });
    await runDefaultWork();

    expect(calls.provider).toEqual([["Bonjour\nété"]]);
    expect(calls.failed).toEqual([]);
    expect(calls.completed).toHaveLength(1);
    const [completion] = calls.completed;
    expect(completion).toMatchObject({
      p_document_id: DOCUMENT_ID,
      p_attempt_id: ATTEMPT_ID,
      p_content_text: "  Bonjour\nété\n",
      p_text_version: 3,
      p_embedding_model: "text-embedding-3-small",
      p_embedding_version: 1,
    });
    const [passage] = completion.p_passages as { ordinal: number; start: number; end: number; content: string; embedding: number[] }[];
    expect(passage).toMatchObject({ ordinal: 0, start: 2, end: 13, content: "Bonjour\nété" });
    expect(passage.embedding).toHaveLength(1536);
  });

  it("plus de 96 Passages : deux lots, ordre conservé", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const calls = backend({ text: "x".repeat(1200 * 97) });
    await runDefaultWork();
    expect(calls.provider.map((batch) => batch.length)).toEqual([96, 1]);
    const passages = calls.completed[0].p_passages as { ordinal: number; start: number }[];
    expect(passages.map((passage) => passage.ordinal)).toEqual(Array.from({ length: 97 }, (_, index) => index));
    expect(passages[96].start).toBe(1200 * 96);
  });

  it("tentative remplacée avant la lecture : rien n'est écrit, aucun appel à l'IA", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const calls = backend({ superseded: true });
    await runDefaultWork();
    expect(calls).toMatchObject({ provider: [], completed: [], failed: [] });
    expect(vi.mocked(console.log).mock.calls.flat().join(" ")).toContain("process_document_attempt_superseded");
  });

  it("le texte n'est lu que pour la tentative courante, encore en cours", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const calls = backend();
    await runDefaultWork();
    expect(calls.reads).toHaveLength(1);
    expect(calls.reads[0]).toContain(`attempt_id=eq.${ATTEMPT_ID}`);
    expect(calls.reads[0]).toContain("status=eq.processing");
  });

  it("lecture du texte en échec : temporary, aucun appel à l'IA, code journalisé", async () => {
    const calls = backend({ read: () => Response.json({ message: "panne" }, { status: 503 }) });
    await runDefaultWork();
    expect(calls.provider).toEqual([]);
    expect(calls.failed[0]).toMatchObject({ p_kind: "temporary" });
    const output = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(output).toContain("http_503");
    expect(output).toContain('"duration_ms":');
  });

  it("no_text enregistré : journal Info", async () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    backend({ text: "\n\n" });
    await runDefaultWork();
    expect(info.mock.calls.flat().join(" ")).toContain("process_document_no_text");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("no_text refusé (tentative plus courante) : journal Error", async () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    backend({ text: "\n\n", fail: () => Response.json(false) });
    await runDefaultWork();
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("fail_processing_refused");
    expect(info.mock.calls.flat().join(" ")).not.toContain("process_document_no_text");
  });

  it("écriture finale avec un délai de 30 s, les autres appels à la base avec 4 s", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const timeout = vi.spyOn(AbortSignal, "timeout");
    backend();
    await runDefaultWork();
    const delays = timeout.mock.calls.map(([delay]) => delay);
    expect(delays).toContain(30_000);
    expect(delays.filter((delay) => delay === 4_000)).toHaveLength(2);
  });

  it.each([
    ["blanc", " \n\n\t"],
    ["absent", null],
  ])("texte %s : no_text, aucun appel à l'IA", async (_label, text) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const calls = backend({ text });
    await runDefaultWork();
    expect(calls.provider).toEqual([]);
    expect(calls.completed).toEqual([]);
    expect(calls.failed).toHaveLength(1);
    expect(calls.failed[0]).toMatchObject({ p_kind: "no_text" });
  });

  it.each([
    ["refus", () => new Response("{}", { status: 401 }), "AI_UNAVAILABLE"],
    ["panne 5xx, après les nouvelles tentatives", () => new Response("{}", { status: 500 }), "AI_UNAVAILABLE"],
    ["plafond atteint", () => Response.json({ error: { code: "insufficient_quota" } }, { status: 429 }), "AI_BUDGET_EXHAUSTED"],
  ])("IA en échec (%s) : temporary, code journalisé, rien d'écrit", async (_label, response, code) => {
    const calls = backend({ embeddings: response });
    await runDefaultWork();
    expect(calls.completed).toEqual([]);
    expect(calls.failed[0]).toMatchObject({ p_kind: "temporary" });
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain(code);
  });

  it("dimension fausse : AI_OUTPUT_INVALID, temporary, rien d'écrit", async () => {
    const calls = backend({
      embeddings: (input) => Response.json({ data: input.map((_, index) => ({ index, embedding: new Array(1535).fill(0.1) })) }),
    });
    await runDefaultWork();
    expect(calls.completed).toEqual([]);
    expect(calls.failed[0]).toMatchObject({ p_kind: "temporary" });
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("AI_OUTPUT_INVALID");
  });

  it("complete_processing refusé : journal Error, aucun fail_processing", async () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    const calls = backend({ complete: () => Response.json(false) });
    await runDefaultWork();
    expect(calls.failed).toEqual([]);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("complete_processing_refused");
    expect(info.mock.calls.flat().join(" ")).not.toContain("process_document_work_done");
  });

  it("complete_processing en erreur : temporary", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const calls = backend({ complete: () => new Response("", { status: 400 }) });
    await runDefaultWork();
    expect(calls.failed[0]).toMatchObject({ p_kind: "temporary" });
  });

  it("lit la tentative avec la clé service_role, sans lire le texte du Document", async () => {
    await handle(post(BODY));
    const [url, init] = dbFetch.mock.calls[0];
    expect(url).toContain(`id=eq.${DOCUMENT_ID}`);
    expect(url).toContain(`attempt_id=eq.${ATTEMPT_ID}`);
    expect(url).toContain("status=eq.processing");
    expect(url).not.toContain("content_text");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer cle-de-test");
  });

  it("travail en échec : fail_processing (temporary) sur cette tentative", async () => {
    await handle(post(BODY), () => Promise.reject(new Error("panne")));
    await waitUntil.mock.calls[0][0];

    const [url, init] = dbFetch.mock.calls[1];
    expect(url).toBe("http://base.test/rest/v1/rpc/fail_processing");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      p_document_id: DOCUMENT_ID,
      p_attempt_id: ATTEMPT_ID,
      p_kind: "temporary",
      p_message: texts.documentStatus.temporaryReason,
    });
  });

  it("journalise la cause d'un travail en échec, jamais son message", async () => {
    await handle(post(BODY), () => Promise.reject(new TypeError("texte confidentiel du Document")));
    await waitUntil.mock.calls[0][0];
    const output = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(output).toContain("TypeError");
    expect(output).not.toContain("confidentiel");
  });

  it("fail_processing refusé (tentative plus courante) : tracé dans les journaux", async () => {
    dbFetch.mockImplementationOnce(async () => row(new Date()));
    dbFetch.mockImplementation(async () => Response.json(false));
    await handle(post(BODY), () => Promise.reject(new Error("panne")));
    await waitUntil.mock.calls[0][0];
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("fail_processing_refused");
  });

  it("fail_processing en échec : aucune exception, l'expiration prend le relais", async () => {
    dbFetch.mockImplementationOnce(async () => row(new Date()));
    dbFetch.mockImplementation(async () => new Response("", { status: 500 }));
    await handle(post(BODY), () => Promise.reject(new Error("panne")));
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });
});
