import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentStatus } from "@/server/documents/get-document-status";

// Lecture du Statut : une panne de la base n'est jamais présentée comme un Document absent.
const ID = "11111111-1111-4111-8111-111111111111";

function fakeDb(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { db: { from } as never, from, eq };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getDocumentStatus", () => {
  it("lit le Statut effectif dans documents_list", async () => {
    const { db, from, eq } = fakeDb({ data: { effective_status: "error", effective_error_kind: "temporary" }, error: null });
    expect(await getDocumentStatus(ID, db)).toEqual({ effectiveStatus: "error", effectiveErrorKind: "temporary" });
    expect(from).toHaveBeenCalledWith("documents_list");
    expect(eq).toHaveBeenCalledWith("id", ID);
  });

  it("identifiant invalide : null, sans appel à la base", async () => {
    const { db, from } = fakeDb({ data: null, error: null });
    expect(await getDocumentStatus("abc", db)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("Document absent : null", async () => {
    expect(await getDocumentStatus(ID, fakeDb({ data: null, error: null }).db)).toBeNull();
  });

  it("erreur de la base : exception journalisée, jamais null", async () => {
    await expect(getDocumentStatus(ID, fakeDb({ data: null, error: { code: "57014" } }).db)).rejects.toThrow();
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("get_document_status_failed");
  });
});
