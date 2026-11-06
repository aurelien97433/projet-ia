import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerProcessing } from "@/server/documents/trigger-processing";

// Appel de process-document depuis Next.js (AD-5). L'absence réelle de réponse pendant 5 s est
// testée dans tests/integration/trigger-processing.test.ts.
const SECRET = ["valeur", "de", "test", "unitaire"].join("-");
const TARGET = { url: "http://fonction.test/process-document", secret: SECRET };

const rpc = vi.fn();
const abortSignal = vi.fn();
const db = { rpc } as unknown as Parameters<typeof triggerProcessing>[2];
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

const logged = () => vi.mocked(console.error).mock.calls.flat().join(" ");

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  abortSignal.mockResolvedValue({ data: true, error: null });
  rpc.mockReturnValue({ abortSignal });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rpc.mockReset();
  abortSignal.mockReset();
  fetchMock.mockReset();
});

describe("triggerProcessing", () => {
  it("202 : envoie le secret en Bearer avec un délai, aucun abandon", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    await triggerProcessing("doc", "tentative", db, TARGET);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TARGET.url);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(init.body as string)).toEqual({ document_id: "doc", attempt_id: "tentative" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([200, 401, 404, 500, 503])("réponse %i : abandon avec le client du Collaborateur", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await triggerProcessing("doc", "tentative", db, TARGET);
    expect(rpc).toHaveBeenCalledWith("abandon_processing", { p_document_id: "doc", p_attempt_id: "tentative" });
    expect(abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    expect(logged()).toContain(`http_${status}`);
  });

  it("panne réseau : abandon", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await triggerProcessing("doc", "tentative", db, TARGET);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(logged()).toContain("network");
  });

  it("délai dépassé : abandon, cause « timeout »", async () => {
    fetchMock.mockRejectedValue(new DOMException("délai", "TimeoutError"));
    await triggerProcessing("doc", "tentative", db, TARGET);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(logged()).toContain("timeout");
  });

  it("secret absent côté Next.js : aucun appel, abandon", async () => {
    await triggerProcessing("doc", "tentative", db, { ...TARGET, secret: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(logged()).toContain("not_configured");
  });

  it.each([
    ["erreur de la base", () => Promise.resolve({ data: null, error: { code: "57014" } })],
    ["base injoignable", () => Promise.reject(new TypeError("fetch failed"))],
    ["abandon refusé", () => Promise.resolve({ data: false, error: null })],
  ])("%s pendant l'abandon : aucune exception", async (_label, implementation) => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    abortSignal.mockImplementation(implementation);
    await expect(triggerProcessing("doc", "tentative", db, TARGET)).resolves.toBeUndefined();
    expect(logged()).toContain("abandon_processing");
  });

  it("202 avec un corps illisible : la tentative acceptée n'est pas abandonnée", async () => {
    const response = new Response("x", { status: 202 });
    vi.spyOn(response.body!, "cancel").mockRejectedValue(new TypeError("flux en erreur"));
    fetchMock.mockResolvedValue(response);
    await triggerProcessing("doc", "tentative", db, TARGET);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("le secret n'apparaît dans aucun journal", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await triggerProcessing("doc", "tentative", db, TARGET);
    expect(logged()).not.toContain(SECRET);
  });
});
