import { beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";

// Côté serveur de l'import (story 2.6a) : URL de dépôt (createUpload, POST /api/uploads), import
// (importFile) et Server Action (importFileAction). Supabase est simulé ; le vrai Storage et la vraie
// fonction SQL sont prouvés par tests/integration/file-import.test.ts.
const errors = texts.addDocument.errors;
const UUID = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const REQUEST = "9d7c1b2a-3e4f-4a5b-8c6d-7e8f9a0b1c2d";

const mocks = vi.hoisted(() => ({
  user: { id: "auteur", email: "" } as { id: string; email: string } | null,
  importFile: vi.fn(),
  triggerProcessing: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  order: [] as string[],
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.order.push(`redirect:${url}`);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    marker: "client-du-collaborateur",
    storage: { from: () => ({ createSignedUploadUrl: mocks.createSignedUploadUrl }) },
  }),
}));
vi.mock("@/server/auth/require-user", () => ({
  requireUser: async () =>
    mocks.user
      ? { user: mocks.user }
      : { user: null, error: { code: "UNAUTHENTICATED", message: texts.session.expired, retryable: false } },
}));
vi.mock("@/server/documents/trigger-processing", () => ({ triggerProcessing: mocks.triggerProcessing }));

const { createUpload } = await import("@/server/documents/create-upload");
const { importFile } = await import("@/server/documents/import-file");
const { POST } = await import("@/app/api/uploads/route");

const storage = () => ({ storage: { from: () => ({ createSignedUploadUrl: mocks.createSignedUploadUrl }) } }) as never;
const post = (body: unknown) =>
  POST(new Request("http://x/api/uploads", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  mocks.user = { id: "auteur", email: "" };
  mocks.order.length = 0;
  mocks.createSignedUploadUrl.mockReset();
  mocks.createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: "https://stockage/signe", token: "t" }, error: null });
  mocks.triggerProcessing.mockReset();
  mocks.triggerProcessing.mockImplementation(async () => mocks.order.push("trigger"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("createUpload", () => {
  it("upload_id choisi par le serveur ({uuid}.{ext}), chemin du Collaborateur, sans écrasement", async () => {
    const result = await createUpload({ fileName: "Procédure.MD", size: 1_000_000 }, "auteur", storage());
    expect(result).toMatchObject({ status: "created", signedUrl: "https://stockage/signe" });
    const uploadId = (result as { uploadId: string }).uploadId;
    expect(uploadId).toMatch(/^[0-9a-f-]{36}\.md$/);
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(`auteur/uploads/${uploadId}`);
  });

  it.each([
    [{ fileName: "rapport.docx", size: 10 }, "FILE_TYPE_UNSUPPORTED", errors.fileFormat],
    [{ fileName: "", size: 10 }, "FILE_TYPE_UNSUPPORTED", errors.fileFormat],
    [{ size: 10 }, "FILE_TYPE_UNSUPPORTED", errors.fileFormat],
    [{ fileName: "a.txt", size: 1_200_000 }, "FILE_TOO_LARGE", errors.fileTooLarge],
    [{ fileName: "a.txt", size: -1 }, "FILE_TOO_LARGE", errors.fileTooLarge],
    [{ fileName: "a.txt", size: 1.5 }, "FILE_TOO_LARGE", errors.fileTooLarge],
    [{ fileName: "a.txt", size: "10" }, "FILE_TOO_LARGE", errors.fileTooLarge],
    [null, "FILE_TYPE_UNSUPPORTED", errors.fileFormat],
  ])("refus %j : %s, aucune URL", async (body, code, message) => {
    expect(await createUpload(body, "auteur", storage())).toEqual({
      status: "invalid",
      error: { code, message, retryable: false },
    });
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refus du Storage ou exception : INTERNAL réessayable, sans détail", async () => {
    mocks.createSignedUploadUrl.mockResolvedValueOnce({ data: null, error: { name: "StorageApiError", message: "RLS" } });
    mocks.createSignedUploadUrl.mockRejectedValueOnce(new Error("réseau"));
    for (let i = 0; i < 2; i++) {
      expect(await createUpload({ fileName: "a.txt", size: 1 }, "auteur", storage())).toEqual({
        status: "error",
        error: { code: "INTERNAL", message: errors.uploadFailed, retryable: true },
      });
    }
  });
});

describe("POST /api/uploads", () => {
  it("sans session : 401, jamais en cache, aucune URL", async () => {
    mocks.user = null;
    const response = await post({ fileName: "a.txt", size: 1 });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("valide : 200 { uploadId, signedUrl } ; invalide : 400 ; corps illisible : 400", async () => {
    const ok = await post({ fileName: "a.txt", size: 1 });
    expect(ok.status).toBe(200);
    expect(Object.keys(await ok.json()).sort()).toEqual(["signedUrl", "uploadId"]);
    expect((await post({ fileName: "a.docx", size: 1 })).status).toBe(400);
    expect((await post("{pas du json")).status).toBe(400);
  });

  it("panne du Storage : 500", async () => {
    mocks.createSignedUploadUrl.mockResolvedValueOnce({ data: null, error: { name: "x", message: "x" } });
    expect((await post({ fileName: "a.txt", size: 1 })).status).toBe(500);
  });
});

describe("importFile", () => {
  const rpc = vi.fn();
  const db = { rpc } as never;
  const input = (overrides: Record<string, unknown> = {}) => ({
    title: "  Procédure  ",
    category: "procedure",
    uploadId: `${UUID}.md`,
    clientRequestId: REQUEST,
    ...overrides,
  });

  beforeEach(() => rpc.mockReset());

  it("appelle import_file_document avec le titre épuré ; création → tentative à lancer", async () => {
    rpc.mockResolvedValue({ data: [{ document_id: "doc", attempt_to_start: "tentative" }], error: null });
    expect(await importFile(input(), "auteur", db)).toEqual({ status: "created", id: "doc", attemptToStart: "tentative" });
    expect(rpc).toHaveBeenCalledWith("import_file_document", {
      p_title: "Procédure",
      p_category: "procedure",
      p_upload_id: `${UUID}.md`,
      p_client_request_id: REQUEST,
    });
  });

  it("rejeu : même Document, aucune tentative", async () => {
    rpc.mockResolvedValue({ data: [{ document_id: "doc", attempt_to_start: null }], error: null });
    expect(await importFile(input(), "auteur", db)).toEqual({ status: "created", id: "doc", attemptToStart: null });
  });

  it("champs invalides : erreurs par champ, aucun appel", async () => {
    expect(await importFile(input({ title: " ", category: "x", uploadId: "../x.md" }), "auteur", db)).toEqual({
      status: "invalid",
      fieldErrors: { title: errors.titleMissing, category: errors.categoryMissing, file: errors.fileMissing },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("identifiant de demande invalide : erreur réessayable, aucun appel", async () => {
    expect(await importFile(input({ clientRequestId: "x" }), "auteur", db)).toMatchObject({
      status: "error",
      error: { code: "INTERNAL", message: errors.saveFailed },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["upload_not_found", "invalid_upload_id", "file_too_large"])(
    "refus %s de la base : dépôt à refaire (« Le fichier n'a pas pu être déposé. »)",
    async (message) => {
      rpc.mockResolvedValue({ data: null, error: { code: "P0001", message } });
      expect(await importFile(input(), "auteur", db)).toEqual({ status: "invalid", fieldErrors: { file: errors.uploadFailed } });
    },
  );

  it("session expirée entre la vérification et l'appel : UNAUTHENTICATED, non réessayable", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "unauthenticated" } });
    expect(await importFile(input(), "auteur", db)).toEqual({
      status: "error",
      error: { code: "UNAUTHENTICATED", message: texts.session.expired, retryable: false },
    });
  });

  it("ligne sans identifiant de Document : jamais « créé » (pas de redirection vers /documents/null)", async () => {
    rpc.mockResolvedValue({ data: [{ document_id: null, attempt_to_start: null }], error: null });
    expect(await importFile(input(), "auteur", db)).toMatchObject({ status: "error", error: { code: "INTERNAL" } });
  });

  it("autre erreur ou exception : alerte réessayable, sans détail", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "08006", message: "connexion perdue" } });
    rpc.mockRejectedValueOnce(new Error("réseau"));
    for (let i = 0; i < 2; i++) {
      expect(await importFile(input(), "auteur", db)).toEqual({
        status: "error",
        error: { code: "INTERNAL", message: errors.saveFailed, retryable: true },
      });
    }
  });
});

describe("importFileAction", () => {
  const form = () => {
    const data = new FormData();
    data.set("title", "Procédure");
    data.set("category", "procedure");
    data.set("uploadId", `${UUID}.txt`);
    data.set("clientRequestId", REQUEST);
    return data;
  };

  // Module de l'action rechargé avec importFile simulé ; le simulacre est toujours retiré (try/finally).
  async function withAction(run: (action: (data: FormData) => Promise<unknown>) => Promise<void>) {
    vi.doMock("@/server/documents/import-file", () => ({ importFile: mocks.importFile }));
    vi.resetModules();
    try {
      const { importFileAction } = await import("@/app/(app)/ajouter/actions");
      await run(importFileAction);
    } finally {
      vi.doUnmock("@/server/documents/import-file");
      vi.resetModules();
    }
  }

  beforeEach(() => mocks.importFile.mockReset());

  it("création : déclenche le traitement puis redirige vers la page du Document", () =>
    withAction(async (action) => {
      mocks.importFile.mockResolvedValue({ status: "created", id: "doc", attemptToStart: "tentative" });
      await expect(action(form())).rejects.toThrow("NEXT_REDIRECT");
      expect(mocks.importFile.mock.calls[0][0]).toEqual({
        title: "Procédure",
        category: "procedure",
        uploadId: `${UUID}.txt`,
        clientRequestId: REQUEST,
      });
      expect(mocks.triggerProcessing).toHaveBeenCalledWith("doc", "tentative", expect.objectContaining({ marker: "client-du-collaborateur" }));
      expect(mocks.order).toEqual(["trigger", "redirect:/documents/doc"]);
    }));

  it("rejeu : même page, aucun nouveau déclenchement", () =>
    withAction(async (action) => {
      mocks.importFile.mockResolvedValue({ status: "created", id: "doc", attemptToStart: null });
      await expect(action(form())).rejects.toThrow("NEXT_REDIRECT");
      expect(mocks.triggerProcessing).not.toHaveBeenCalled();
    }));

  it("sans session : aucun import", () =>
    withAction(async (action) => {
      mocks.user = null;
      expect(await action(form())).toMatchObject({ status: "error", error: { code: "UNAUTHENTICATED" } });
      expect(mocks.importFile).not.toHaveBeenCalled();
    }));
});
