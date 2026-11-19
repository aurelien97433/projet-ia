import { beforeEach, describe, expect, it, vi } from "vitest";
import { appError } from "@/lib/errors";
import { conversationListItemSchema, conversationsResponseSchema, parseConversationsLimit } from "@/lib/schemas/chat";
import { texts } from "@/lib/texts";

// GET /api/conversations (story 5.6, Historique) et lecture serveur des Conversations : session
// vérifiée, jeton du Collaborateur, 100 au plus, forme AD-19 en erreur, jamais en cache.
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), listConversations: vi.fn() }));
vi.mock("@/server/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => "client-du-collaborateur" }));
vi.mock("@/server/conversations/list-conversations", () => ({ listConversations: mocks.listConversations }));

const { GET } = await import("@/app/api/conversations/route");
const { listConversations: realList } = await vi.importActual<typeof import("@/server/conversations/list-conversations")>(
  "@/server/conversations/list-conversations",
);
const { getConversation } = await import("@/server/conversations/get-conversation");

const ID = "11111111-1111-4111-8111-111111111111";
const ITEM = { id: ID, title: "Congés", lastMessageAt: "2026-11-18T09:05:00.000Z", unanswered: true };
const request = (query = "") => new Request(`http://localhost/api/conversations${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "moi", email: "" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/conversations", () => {
  it("Conversations du Collaborateur, client de sa session, 100 par défaut, jamais en cache", async () => {
    mocks.listConversations.mockResolvedValue([ITEM]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ conversations: [ITEM] });
    expect(mocks.listConversations).toHaveBeenCalledWith("client-du-collaborateur", 100);
  });

  it("?limit=5 transmis ; hors bornes ou invalide : 400 VALIDATION_FAILED, aucune lecture", async () => {
    mocks.listConversations.mockResolvedValue([]);
    await GET(request("?limit=5"));
    expect(mocks.listConversations).toHaveBeenCalledWith("client-du-collaborateur", 5);
    for (const limit of ["0", "101", "abc", "-1", "2.5", ""]) {
      const response = await GET(request(`?limit=${limit}`));
      expect(response.status, limit).toBe(400);
      expect(await response.json()).toEqual(appError("VALIDATION_FAILED", texts.history.loadFailed, false));
    }
    expect(mocks.listConversations).toHaveBeenCalledTimes(1);
  });

  it("sans session : 401 UNAUTHENTICATED, aucune lecture", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, ...appError("UNAUTHENTICATED", texts.session.expired, false) });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.listConversations).not.toHaveBeenCalled();
  });

  it("lecture en échec : 500 au format AD-19, texte de l'Historique non chargé, réessayable", async () => {
    mocks.listConversations.mockRejectedValue(new Error("base"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(appError("INTERNAL", texts.history.loadFailed, true));
  });

  it("schémas : limite, élément de liste, réponse", () => {
    expect(parseConversationsLimit(null)).toBe(100);
    expect(parseConversationsLimit("1")).toBe(1);
    expect(parseConversationsLimit("100")).toBe(100);
    expect(parseConversationsLimit("1000")).toBeNull();
    expect(conversationListItemSchema.safeParse(ITEM).success).toBe(true);
    expect(conversationListItemSchema.safeParse({ ...ITEM, id: "abc" }).success).toBe(false);
    expect(conversationsResponseSchema.safeParse({ conversations: [ITEM] }).success).toBe(true);
  });
});

// Client Supabase simulé : enregistre les appels de la chaîne de requête et renvoie les lignes données.
function fakeDb(tables: Record<string, { data: unknown; error?: { code: string } | null }>) {
  const calls: { table: string; steps: [string, unknown[]][] }[] = [];
  return {
    calls,
    from(table: string) {
      const steps: [string, unknown[]][] = [];
      calls.push({ table, steps });
      const result = { data: tables[table]?.data ?? null, error: tables[table]?.error ?? null };
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "order", "limit", "in"]) {
        chain[name] = (...args: unknown[]) => {
          steps.push([name, args]);
          return chain;
        };
      }
      chain.maybeSingle = async () => result;
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject);
      return chain;
    },
  };
}

describe("lecture serveur des Conversations", () => {
  it("liste : vue conversation_list, plus récente d'abord, limite ramenée dans [1, 100], dates ISO", async () => {
    const db = fakeDb({ conversation_list: { data: [{ id: ID, title: "Congés", last_message_at: "2026-11-18T09:05:00+00:00", unanswered: false }] } });
    expect(await realList(db as never, 500)).toEqual([{ ...ITEM, unanswered: false }]);
    const steps = db.calls[0].steps;
    expect(db.calls[0].table).toBe("conversation_list");
    expect(steps).toContainEqual(["order", ["last_message_at", { ascending: false }]]);
    expect(steps).toContainEqual(["limit", [100]]);
  });

  it("liste en échec : exception journalisée sans détail", async () => {
    const db = fakeDb({ conversation_list: { data: null, error: { code: "42501" } } });
    await expect(realList(db as never)).rejects.toThrow();
  });

  it("Conversation : identifiant non UUID → null sans lecture ; absente ou d'un autre Compte (RLS) → null", async () => {
    const empty = fakeDb({});
    expect(await getConversation("abc", empty as never)).toBeNull();
    expect(empty.calls).toHaveLength(0);
    const absent = fakeDb({ conversations: { data: null }, messages: { data: [] } });
    expect(await getConversation(ID, absent as never)).toBeNull();
  });

  it("Conversation : messages par created_at, Sources par ordinal et rattachées à leur réponse, règles d'affichage appliquées", async () => {
    const now = Date.parse("2026-11-18T10:00:00.000Z");
    const db = fakeDb({
      conversations: { data: { id: ID, title: "Congés" } },
      messages: {
        data: [
          { id: "q1", role: "user", kind: "question", content: "Q1", error_code: null, created_at: "2026-11-18T09:00:00Z" },
          { id: "a1", role: "assistant", kind: "answer", content: "R [P2].", error_code: null, created_at: "2026-11-18T09:00:05Z" },
          { id: "q2", role: "user", kind: "question", content: "Q2", error_code: null, created_at: "2026-11-18T09:59:30Z" },
        ],
      },
      message_sources: {
        data: [
          { message_id: "a1", ordinal: 1, document_id: null, document_title: "Ancien", passages: [{}, {}] },
          { message_id: "a1", ordinal: 2, document_id: "d2", document_title: "FAQ", passages: [{}] },
        ],
      },
    });
    const view = await getConversation(ID, db as never, now);
    expect(view).toEqual({
      id: ID,
      title: "Congés",
      exchanges: [
        {
          id: "q1",
          question: "Q1",
          reply: {
            kind: "answer",
            content: "R [P2].",
            sources: [
              { documentId: null, title: "Ancien", passageCount: 2 },
              { documentId: "d2", title: "FAQ", passageCount: 1 },
            ],
          },
        },
        { id: "q2", question: "Q2", reply: { kind: "pending" } },
      ],
    });
    const messages = db.calls.find((call) => call.table === "messages")!.steps;
    expect(messages).toContainEqual(["eq", ["conversation_id", ID]]);
    expect(messages).toContainEqual(["order", ["created_at", { ascending: true }]]);
    const sources = db.calls.find((call) => call.table === "message_sources")!.steps;
    expect(sources).toContainEqual(["in", ["message_id", ["a1"]]]);
    expect(sources).toContainEqual(["order", ["ordinal", { ascending: true }]]);
  });
});
