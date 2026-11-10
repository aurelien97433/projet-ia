import { beforeEach, describe, expect, it, vi } from "vitest";
import { appError } from "@/lib/errors";
import { texts } from "@/lib/texts";

// Route Handlers de la Bibliothèque : session vérifiée, paramètres validés, réponses jamais en cache.
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listDocuments: vi.fn(),
  getDocumentStatuses: vi.fn(),
}));
vi.mock("@/server/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => "client-du-collaborateur" }));
vi.mock("@/server/documents/list-documents", () => ({
  listDocuments: mocks.listDocuments,
  getDocumentStatuses: mocks.getDocumentStatuses,
}));

const { GET: listRoute } = await import("@/app/api/documents/route");
const { GET: statusesRoute } = await import("@/app/api/documents/statuses/route");

const USER = { id: "auteur", email: "" };
const ID = "11111111-1111-4111-8111-111111111111";
const request = (path: string) => new Request(`http://localhost${path}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: USER });
});

describe("GET /api/documents", () => {
  it("filtres validés, Auteur pris dans la session, client du Collaborateur", async () => {
    const page = { documents: [], total: 0 };
    mocks.listDocuments.mockResolvedValue(page);
    const response = await listRoute(request("/api/documents?category=procedure&mine=true&search=factu&sort=oldest"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(page);
    expect(mocks.listDocuments).toHaveBeenCalledWith(
      { category: "procedure", mine: true, search: "factu", sort: "oldest" },
      "auteur",
      "client-du-collaborateur",
    );
  });

  it("sans session : 401, aucune lecture", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, ...appError("UNAUTHENTICATED", texts.session.expired, false) });
    const response = await listRoute(request("/api/documents"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });

  it.each([
    ["category=<script>"],
    ["sort=y"],
    [`search=${"a".repeat(201)}`],
  ])("paramètre hostile %s : 400 neutre, valeur jamais reprise", async (query) => {
    const response = await listRoute(request(`/api/documents?${query}`));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(appError("VALIDATION_FAILED", texts.library.loadFailed, false));
    expect(JSON.stringify(body)).not.toContain("script");
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });

  it("panne de lecture : 500 réessayable", async () => {
    mocks.listDocuments.mockRejectedValue(new Error("x"));
    const response = await listRoute(request("/api/documents"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(appError("INTERNAL", texts.library.loadFailed, true));
  });
});

describe("GET /api/documents/statuses", () => {
  it("Statuts des identifiants demandés", async () => {
    mocks.getDocumentStatuses.mockResolvedValue([{ id: ID, effectiveStatus: "ready" }]);
    const response = await statusesRoute(request(`/api/documents/statuses?ids=${ID}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ statuses: [{ id: ID, effectiveStatus: "ready" }] });
    expect(mocks.getDocumentStatuses).toHaveBeenCalledWith([ID], "client-du-collaborateur");
  });

  it("sans session : 401", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, ...appError("UNAUTHENTICATED", texts.session.expired, false) });
    const response = await statusesRoute(request(`/api/documents/statuses?ids=${ID}`));
    expect(response.status).toBe(401);
    expect(mocks.getDocumentStatuses).not.toHaveBeenCalled();
  });

  it("identifiant invalide ou trop d'identifiants : 400", async () => {
    const tooMany = Array.from({ length: 201 }, () => ID).join(",");
    for (const query of ["ids=abc", "", `ids=${tooMany}`]) {
      const response = await statusesRoute(request(`/api/documents/statuses?${query}`));
      expect(response.status).toBe(400);
    }
    expect(mocks.getDocumentStatuses).not.toHaveBeenCalled();
  });

  it("panne de lecture : 500 réessayable", async () => {
    mocks.getDocumentStatuses.mockRejectedValue(new Error("x"));
    const response = await statusesRoute(request(`/api/documents/statuses?ids=${ID}`));
    expect(response.status).toBe(500);
    expect((await response.json()).error.retryable).toBe(true);
  });
});
