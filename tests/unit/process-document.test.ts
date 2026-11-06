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

beforeEach(() => {
  Object.assign(env, {
    PROCESS_DOCUMENT_SECRET: SECRET,
    SUPABASE_URL: "http://base.test",
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
    await handle(post(BODY));
    await waitUntil.mock.calls[0][0];
    const output = info.mock.calls.flat().join(" ");
    expect(output).toContain("process_document_accepted");
    expect(output).toContain("process_document_work_done");
    expect(console.error).not.toHaveBeenCalled();
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
