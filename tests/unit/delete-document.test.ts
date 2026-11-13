import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";

// Suppression côté serveur (story 3.4) : validation, Document puis objet, refus traduits, échec du
// Storage sans effet sur le résultat, journaux sans texte.
const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));

vi.mock("@/server/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeDb().db }));

const { deleteDocument } = await import("@/server/documents/delete-document");
const { deleteDocumentAction } = await import("@/app/(app)/documents/[id]/actions");

const t = texts.deleteDocument;
const DOC = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PATH = `${USER}/uploads/33333333-3333-4333-8333-333333333333.txt`;

type Result = { data: unknown; error: unknown };

function fakeDb({
  deleted = { data: [{ storage_path: null }], error: null } as Result | Error,
  read = { data: null, error: null } as Result,
  removed = { data: [{ name: PATH }], error: null } as Result | Error,
} = {}) {
  const order: string[] = [];
  const deleteSelect = vi.fn<(columns: string) => Promise<Result>>(async () => {
    order.push("delete");
    if (deleted instanceof Error) throw deleted;
    return deleted;
  });
  const deleteEq = vi.fn<(column: string, value: string) => { select: typeof deleteSelect }>(() => ({ select: deleteSelect }));
  const maybeSingle = vi.fn(async () => {
    order.push("read");
    return read;
  });
  const from = vi.fn(() => ({
    delete: () => ({ eq: deleteEq }),
    select: () => ({ eq: () => ({ maybeSingle }) }),
  }));
  const remove = vi.fn<(paths: string[]) => Promise<Result>>(async () => {
    order.push("remove");
    if (removed instanceof Error) throw removed;
    return removed;
  });
  const storage = { from: vi.fn(() => ({ remove })) };
  return { db: { from, storage } as never, order, deleteEq, deleteSelect, remove, storage };
}

let errors: ReturnType<typeof vi.spyOn>;
let infos: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.requireUser.mockReset();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  infos = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const logged = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])));

describe("deleteDocument", () => {
  it("Note : Document supprimé par son identifiant, aucun appel au Storage", async () => {
    const fake = fakeDb();
    expect(await deleteDocument({ documentId: DOC }, USER, fake.db)).toEqual({ status: "ok" });
    expect(fake.deleteEq).toHaveBeenCalledWith("id", DOC);
    expect(fake.deleteSelect).toHaveBeenCalledWith("storage_path");
    expect(fake.storage.from).not.toHaveBeenCalled();
    expect(logged(infos)).toContainEqual({ event: "document_deleted", document_id: DOC, user_id: USER, file: false });
  });

  it("fichier importé : Document d'abord, puis son objet dans le bucket documents", async () => {
    const fake = fakeDb({ deleted: { data: [{ storage_path: PATH }], error: null } });
    expect(await deleteDocument({ documentId: DOC }, USER, fake.db)).toEqual({ status: "ok" });
    expect(fake.order).toEqual(["delete", "remove"]);
    expect(fake.storage.from).toHaveBeenCalledWith("documents");
    expect(fake.remove).toHaveBeenCalledWith([PATH]);
    expect(errors).not.toHaveBeenCalled();
  });

  it.each([
    ["erreur du Storage", { data: null, error: { name: "StorageApiError", message: "texte" } }, "StorageApiError"],
    ["objet écarté par la politique (liste vide)", { data: [], error: null }, "not_removed"],
    ["exception", new Error("réseau"), "exception"],
  ] as const)("objet non retiré (%s) : succès quand même, échec journalisé par code", async (_label, removed, code) => {
    const fake = fakeDb({ deleted: { data: [{ storage_path: PATH }], error: null }, removed: removed as Result | Error });
    expect(await deleteDocument({ documentId: DOC }, USER, fake.db)).toEqual({ status: "ok" });
    expect(logged(errors)).toEqual([{ event: "delete_document_file_failed", document_id: DOC, user_id: USER, code }]);
  });

  it("aucune ligne supprimée, Document encore lisible (autre Auteur) : FORBIDDEN, sans Storage", async () => {
    const fake = fakeDb({ deleted: { data: [], error: null }, read: { data: { id: DOC }, error: null } });
    const result = await deleteDocument({ documentId: DOC }, USER, fake.db);
    expect(result).toEqual({ status: "error", error: { code: "FORBIDDEN", message: t.forbidden, retryable: false } });
    expect(fake.storage.from).not.toHaveBeenCalled();
    expect(logged(errors)).toEqual([{ event: "delete_document_refused", document_id: DOC, user_id: USER }]);
  });

  it("aucune ligne supprimée, Document absent : NOT_FOUND (supprimé entre-temps)", async () => {
    const fake = fakeDb({ deleted: { data: [], error: null } });
    const result = await deleteDocument({ documentId: DOC }, USER, fake.db);
    expect(result).toMatchObject({ status: "error", error: { code: "NOT_FOUND", message: texts.documentStatus.deleted } });
    expect(errors).not.toHaveBeenCalled();
  });

  it.each([
    ["erreur de la base", { data: null, error: { code: "42501", message: "texte" } }],
    ["exception", new Error("réseau")],
  ] as const)("suppression en échec (%s) : INTERNAL relançable, sans Storage", async (_label, deleted) => {
    const fake = fakeDb({ deleted: deleted as Result | Error });
    const result = await deleteDocument({ documentId: DOC }, USER, fake.db);
    expect(result).toEqual({ status: "error", error: { code: "INTERNAL", message: t.failed, retryable: true } });
    expect(fake.storage.from).not.toHaveBeenCalled();
  });

  it("relecture en échec après un refus : INTERNAL", async () => {
    const fake = fakeDb({ deleted: { data: [], error: null }, read: { data: null, error: { code: "08006" } } });
    expect(await deleteDocument({ documentId: DOC }, USER, fake.db)).toMatchObject({ error: { code: "INTERNAL" } });
  });

  it.each([undefined, "", "pas-un-uuid", 42, { id: DOC }])("identifiant invalide (%s) : refusé sans appel", async (documentId) => {
    const fake = fakeDb();
    const result = await deleteDocument({ documentId }, USER, fake.db);
    expect(result).toMatchObject({ status: "error", error: { code: "VALIDATION_FAILED" } });
    expect(fake.order).toEqual([]);
  });
});

describe("deleteDocumentAction", () => {
  it("sans session : UNAUTHENTICATED, rien n'est supprimé", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, error: { code: "UNAUTHENTICATED", message: "m", retryable: false } });
    expect(await deleteDocumentAction(DOC)).toEqual({ status: "error", error: { code: "UNAUTHENTICATED", message: "m", retryable: false } });
  });

  it("avec session : suppression avec le client du Collaborateur", async () => {
    mocks.requireUser.mockResolvedValue({ user: { id: USER } });
    expect(await deleteDocumentAction(DOC)).toEqual({ status: "ok" });
  });
});
