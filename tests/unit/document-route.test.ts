import { beforeEach, describe, expect, it, vi } from "vitest";
import { appError } from "@/lib/errors";
import { sourceDocumentSchema } from "@/lib/schemas/chat";
import { texts } from "@/lib/texts";

// GET /api/documents/[id] (story 5.7, panneau Source) : exigences R1 à R4 de la revue.
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createClient: vi.fn() }));
vi.mock("@/server/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

const { GET } = await import("@/app/api/documents/[id]/route");

const ID = "11111111-1111-4111-8111-111111111111";
const META = {
  id: ID,
  title: "Procédure de facturation",
  category: "procedure",
  author_id: "auteur",
  author_name: "Alice Martin",
  created_at: "2026-11-10T09:00:00+00:00",
  effective_status: "ready",
  effective_error_kind: null,
  effective_error_message: null,
  processing_started_at: null,
  server_now: "2026-11-19T09:00:00+00:00",
};
const BODY = { content_text: "Texte <b>brut</b> du Document.", text_version: 3 };

type Result = { data: unknown; error: unknown };

// Client Supabase factice : documents_list (métadonnées) et documents (texte, version).
function fakeClient(meta: Result, body: Result) {
  const tables: string[] = [];
  const selects: string[] = [];
  const from = vi.fn((table: string) => {
    tables.push(table);
    return {
      select: (columns: string) => {
        selects.push(columns);
        return { eq: () => ({ maybeSingle: async () => (table === "documents_list" ? meta : body) }) };
      },
    };
  });
  return { client: { from }, tables, selects };
}

const call = (id: string) => GET(new Request(`http://localhost/api/documents/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "moi", email: "" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/documents/[id]", () => {
  it("Document lu avec le client de la session (R1) : métadonnées, Statut effectif, version et texte brut, no-store (R2)", async () => {
    const fake = fakeClient({ data: META, error: null }, { data: BODY, error: null });
    mocks.createClient.mockResolvedValue(fake.client);
    const response = await call(ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const json = await response.json();
    expect(json).toEqual({
      id: ID,
      title: "Procédure de facturation",
      category: "procedure",
      authorName: "Alice Martin",
      createdAt: "2026-11-10T09:00:00+00:00",
      status: "ready",
      textVersion: 3,
      content: "Texte <b>brut</b> du Document.",
    });
    expect(sourceDocumentSchema.safeParse(json).success).toBe(true);
    expect(fake.selects).toContain("content_text, text_version");
    // Aucun identifiant d'Auteur transmis au navigateur.
    expect(JSON.stringify(json)).not.toContain("auteur\"");
  });

  it("sans session : 401 UNAUTHENTICATED (AD-19), no-store, aucune lecture (R3)", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, ...appError("UNAUTHENTICATED", texts.session.expired, false) });
    const response = await call(ID);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("identifiant non UUID, Document inexistant ou supprimé : même 404 NOT_FOUND neutre, no-store (R4)", async () => {
    const absent = fakeClient({ data: null, error: null }, { data: null, error: null });
    mocks.createClient.mockResolvedValue(absent.client);
    const responses = [await call("abc"), await call(ID), await call("22222222-2222-4222-8222-222222222222")];
    const bodies = await Promise.all(responses.map((response) => response.text()));
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual(appError("NOT_FOUND", texts.notFound.text, false));
    // Identifiant non UUID : aucune lecture.
    expect(absent.tables).toHaveLength(4);
  });

  it("vérification de session en panne : 500 INTERNAL au format AD-19, no-store (R2)", async () => {
    mocks.requireUser.mockRejectedValue(new Error("auth"));
    const response = await call(ID);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(appError("INTERNAL", texts.sourcePanel.loadFailed, true));
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("lecture en panne : 500 INTERNAL réessayable, texte du catalogue, no-store", async () => {
    const broken = fakeClient({ data: null, error: { code: "42501" } }, { data: null, error: null });
    mocks.createClient.mockResolvedValue(broken.client);
    const response = await call(ID);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(appError("INTERNAL", texts.sourcePanel.loadFailed, true));
  });
});
