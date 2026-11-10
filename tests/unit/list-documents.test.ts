import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LIBRARY_FILTERS, MAX_LIBRARY_ROWS, type LibraryFilters } from "@/lib/schemas/library";
import { LIBRARY_COLUMNS, getDocumentStatuses, listDocuments } from "@/server/documents/list-documents";

// Requête de la Bibliothèque : colonnes explicites sans texte, filtres traduits, total exact.
const USER = "11111111-1111-4111-8111-111111111111";

type Call = [string, ...unknown[]];

// Constructeur de requête factice : enregistre chaque appel et se résout sur `result`.
function fakeDb(result: { data: unknown; error: unknown; count?: number | null }) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "ilike", "filter", "order", "limit", "in"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  const from = vi.fn(() => builder);
  return { db: { from } as never, from, calls };
}

const row = {
  id: "d1",
  title: "Procédure de facturation",
  category: "procedure",
  author_id: USER,
  author_name: null,
  created_at: "2026-11-10T09:00:00+00:00",
  effective_status: "processing",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listDocuments", () => {
  it("colonnes explicites de documents_list, sans content_text, total exact, plus récents d'abord", async () => {
    const { db, from, calls } = fakeDb({ data: [row], error: null, count: 412 });
    const page = await listDocuments(DEFAULT_LIBRARY_FILTERS, USER, db);

    expect(from).toHaveBeenCalledWith("documents_list");
    expect(calls[0]).toEqual(["select", LIBRARY_COLUMNS, { count: "exact" }]);
    expect(LIBRARY_COLUMNS).toBe("id, title, category, author_id, author_name, created_at, effective_status");
    expect(LIBRARY_COLUMNS).not.toMatch(/content_text|summary|\*/);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(calls).toContainEqual(["order", "id", { ascending: false }]);
    expect(calls).toContainEqual(["limit", MAX_LIBRARY_ROWS]);
    expect(calls.map(([method]) => method)).not.toContain("eq");
    expect(calls.map(([method]) => method)).not.toContain("ilike");
    expect(page).toEqual({
      total: 412,
      documents: [
        {
          id: "d1",
          title: "Procédure de facturation",
          category: "procedure",
          authorId: USER,
          authorName: "",
          createdAt: "2026-11-10T09:00:00+00:00",
          effectiveStatus: "processing",
        },
      ],
    });
  });

  it("filtres combinés : Catégorie, Auteur de la session, recherche échappée, plus anciens d'abord", async () => {
    const { db, calls } = fakeDb({ data: [], error: null, count: 0 });
    const filters: LibraryFilters = { category: "procedure", mine: true, search: " 50%_x ", sort: "oldest" };
    await listDocuments(filters, USER, db);
    expect(calls).toContainEqual(["eq", "category", "procedure"]);
    expect(calls).toContainEqual(["eq", "author_id", USER]);
    expect(calls).toContainEqual(["ilike", "title", "%50\\%\\_x%"]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: true }]);
    expect(calls).toContainEqual(["order", "id", { ascending: true }]);
    expect(calls.map(([method]) => method)).not.toContain("filter");
  });

  it("« * » : jamais un joker, recherche resserrée par une expression régulière échappée", async () => {
    const { db, calls } = fakeDb({ data: [], error: null, count: 0 });
    await listDocuments({ ...DEFAULT_LIBRARY_FILTERS, search: "a*b." }, USER, db);
    expect(calls).toContainEqual(["ilike", "title", "%a_b.%"]);
    expect(calls).toContainEqual(["filter", "title", "imatch", "a\\*b\\."]);
  });

  it("erreur de la base : exception journalisée, jamais une liste vide", async () => {
    const { db } = fakeDb({ data: null, error: { code: "57014" } });
    await expect(listDocuments(DEFAULT_LIBRARY_FILTERS, USER, db)).rejects.toThrow();
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("list_documents_failed");
  });
});

describe("getDocumentStatuses", () => {
  it("une seule requête groupée, id et Statut effectif seulement", async () => {
    const { db, from, calls } = fakeDb({ data: [{ id: "d1", effective_status: "ready" }], error: null });
    expect(await getDocumentStatuses(["d1", "d2"], db)).toEqual([{ id: "d1", effectiveStatus: "ready" }]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("documents_list");
    expect(calls).toEqual([
      ["select", "id, effective_status"],
      ["in", "id", ["d1", "d2"]],
    ]);
  });

  it("aucun identifiant : aucune requête ; plus que le plafond : refusé", async () => {
    const { db, from } = fakeDb({ data: [], error: null });
    expect(await getDocumentStatuses([], db)).toEqual([]);
    await expect(getDocumentStatuses(Array.from({ length: MAX_LIBRARY_ROWS + 1 }, String), db)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });

  it("erreur de la base : exception journalisée", async () => {
    const { db } = fakeDb({ data: null, error: { code: "57014" } });
    await expect(getDocumentStatuses(["d1"], db)).rejects.toThrow();
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("get_document_statuses_failed");
  });
});
