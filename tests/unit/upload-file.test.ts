import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadFile } from "@/app/(app)/ajouter/upload-file";

// Dépôt navigateur (story 2.6a) : demande d'URL signée à Next.js, puis PUT direct sur le Storage.
type Behaviour = "ok" | "status-400" | "error" | "timeout" | "hang";
let behaviour: Behaviour = "ok";
const sent: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];

class FakeXhr {
  status = 0;
  timeout = 0;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private request = { url: "", method: "", headers: {} as Record<string, string>, body: undefined as unknown };
  open(method: string, url: string) {
    Object.assign(this.request, { method, url });
  }
  setRequestHeader(name: string, value: string) {
    this.request.headers[name] = value;
  }
  abort() {
    this.onabort?.();
  }
  send(body: unknown) {
    this.request.body = body;
    sent.push(this.request);
    queueMicrotask(() => {
      if (behaviour === "hang") return;
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
      if (behaviour === "error") return this.onerror?.();
      if (behaviour === "timeout") return this.ontimeout?.();
      this.status = behaviour === "ok" ? 200 : 400;
      this.onload?.();
    });
  }
}

const fetchMock = vi.fn();
const file = (name: string) => new File(["Texte"], name, { type: "application/octet-stream" });

beforeEach(() => {
  behaviour = "ok";
  sent.length = 0;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(Response.json({ uploadId: "u.md", signedUrl: "https://stockage/signe" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("uploadFile", () => {
  it("demande nom et taille seulement, puis PUT du fichier, sans écrasement, type déduit de l'extension", async () => {
    const progress = vi.fn();
    const value = file("procedure.MD");
    expect(await uploadFile(value, progress, new AbortController().signal)).toEqual({ status: "uploaded", uploadId: "u.md" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/uploads");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ fileName: "procedure.MD", size: 5 });
    expect(sent[0]).toMatchObject({
      method: "PUT",
      url: "https://stockage/signe",
      headers: { "x-upsert": "false", "Content-Type": "text/markdown" },
      body: value,
    });
    expect(progress).toHaveBeenCalledWith(0.5);
  });

  it.each([
    [401, {}, { status: "unauthenticated" }],
    [400, { error: { code: "FILE_TOO_LARGE" } }, { status: "rejected", reason: "size" }],
    [400, { error: { code: "FILE_TYPE_UNSUPPORTED" } }, { status: "rejected", reason: "format" }],
    [500, { error: { code: "INTERNAL" } }, { status: "failed" }],
    [200, { uploadId: 1 }, { status: "failed" }],
  ])("réponse %i de la demande : %j, aucun PUT", async (status, body, expected) => {
    fetchMock.mockResolvedValueOnce(Response.json(body, { status }));
    expect(await uploadFile(file("a.txt"), vi.fn(), new AbortController().signal)).toEqual(expected);
    expect(sent).toHaveLength(0);
  });

  it.each(["status-400", "error", "timeout"] as const)("PUT en échec (%s) : failed", async (value) => {
    behaviour = value;
    expect(await uploadFile(file("a.txt"), vi.fn(), new AbortController().signal)).toEqual({ status: "failed" });
  });

  it("réseau en panne à la demande : failed ; abandon pendant le PUT : aborted", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("réseau"));
    expect(await uploadFile(file("a.txt"), vi.fn(), new AbortController().signal)).toEqual({ status: "failed" });

    behaviour = "hang";
    const controller = new AbortController();
    const pending = uploadFile(file("a.txt"), vi.fn(), controller.signal);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    controller.abort();
    expect(await pending).toEqual({ status: "aborted" });
  });
});
