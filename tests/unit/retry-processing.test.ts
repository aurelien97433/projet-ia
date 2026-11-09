import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";

// Relance côté serveur : traduction des refus, déclenchement attendu, rejeu, relecture du Statut.
const mocks = vi.hoisted(() => ({
  triggerProcessing: vi.fn(),
  requireUser: vi.fn(),
  order: [] as string[],
}));

vi.mock("@/server/documents/trigger-processing", () => ({ triggerProcessing: mocks.triggerProcessing }));
vi.mock("@/server/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeDb({ data: null, error: { code: "42501" } }).db }));

const { retryProcessing } = await import("@/server/documents/retry-processing");
const { retryProcessingAction } = await import("@/app/(app)/documents/[id]/actions");

const t = texts.documentStatus;
const DOC = "11111111-1111-4111-8111-111111111111";
const REQUEST = "22222222-2222-4222-8222-222222222222";
const ATTEMPT = "33333333-3333-4333-8333-333333333333";
const input = { documentId: DOC, clientRequestId: REQUEST };

const ROW = {
  effective_status: "processing",
  effective_error_kind: null,
  effective_error_message: null,
  processing_started_at: "2026-11-09T10:00:00.000000+00:00",
  server_now: "2026-11-09T10:00:02.000000+00:00",
};
const VIEW = { effectiveStatus: "processing", effectiveErrorKind: null, effectiveErrorMessage: null, processingElapsedMs: 2_000 };

type Read = { data: unknown; error: unknown };

function fakeDb(rpcResult: { data: unknown; error: unknown } | Error, read: Read = { data: ROW, error: null }) {
  const rpc = vi.fn(async () => {
    mocks.order.push("rpc");
    if (rpcResult instanceof Error) throw rpcResult;
    return rpcResult;
  });
  const maybeSingle = vi.fn(async () => {
    mocks.order.push("read");
    return read;
  });
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
  return { db: { rpc, from } as never, rpc, from };
}

beforeEach(() => {
  mocks.order.length = 0;
  mocks.triggerProcessing.mockReset();
  mocks.triggerProcessing.mockImplementation(async () => {
    mocks.order.push("trigger");
  });
  mocks.requireUser.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("retryProcessing", () => {
  it("relance acceptée : déclenche et attend, puis relit le Statut", async () => {
    const { db, rpc } = fakeDb({ data: ATTEMPT, error: null });
    expect(await retryProcessing(input, "auteur", db)).toEqual({ status: "ok", view: VIEW });
    expect(rpc).toHaveBeenCalledWith("retry_processing", { p_document_id: DOC, p_client_request_id: REQUEST });
    expect(mocks.triggerProcessing).toHaveBeenCalledWith(DOC, ATTEMPT, db);
    expect(mocks.order).toEqual(["rpc", "trigger", "read"]);
  });

  it("rejeu (null) : aucun déclenchement, Statut relu", async () => {
    const { db } = fakeDb({ data: null, error: null });
    expect(await retryProcessing(input, "auteur", db)).toEqual({ status: "ok", view: VIEW });
    expect(mocks.triggerProcessing).not.toHaveBeenCalled();
    expect(mocks.order).toEqual(["rpc", "read"]);
  });

  it("déclenchement refusé : le Statut relu montre l'erreur", async () => {
    const row = { ...ROW, effective_status: "error", effective_error_kind: "temporary", effective_error_message: "Raison." };
    const { db } = fakeDb({ data: ATTEMPT, error: null }, { data: row, error: null });
    expect(await retryProcessing(input, "auteur", db)).toMatchObject({
      status: "ok",
      view: { effectiveStatus: "error", effectiveErrorKind: "temporary" },
    });
  });

  it.each([
    ["exception", { data: null, error: { code: "57014" } }],
    ["Document disparu", { data: null, error: null }],
  ])("relecture impossible après relance (%s) : en cours supposé", async (_label, read) => {
    const { db } = fakeDb({ data: ATTEMPT, error: null }, read);
    expect(await retryProcessing(input, "auteur", db)).toEqual({
      status: "ok",
      view: { ...VIEW, processingElapsedMs: 0 },
    });
  });

  it("identifiants invalides : ni appel, ni déclenchement", async () => {
    const { db, rpc } = fakeDb({ data: ATTEMPT, error: null });
    expect(await retryProcessing({ documentId: "abc", clientRequestId: REQUEST }, "auteur", db)).toMatchObject({
      status: "error",
      error: { code: "VALIDATION_FAILED", message: t.retryFailed, retryable: false },
    });
    expect(await retryProcessing({ documentId: DOC, clientRequestId: undefined }, "auteur", db)).toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["42501", "FORBIDDEN", t.forbidden, false],
    ["P0002", "NOT_FOUND", texts.notFound.text, false],
    ["XX000", "INTERNAL", t.retryFailed, true],
  ])("refus %s : %s, sans déclenchement", async (dbCode, code, message, retryable) => {
    const { db } = fakeDb({ data: null, error: { code: dbCode } });
    expect(await retryProcessing(input, "auteur", db)).toEqual({ status: "error", error: { code, message, retryable } });
    expect(mocks.triggerProcessing).not.toHaveBeenCalled();
  });

  it("55000 : pas d'erreur, le Statut relu est renvoyé, sans déclenchement", async () => {
    const { db } = fakeDb({ data: null, error: { code: "55000" } });
    expect(await retryProcessing(input, "auteur", db)).toEqual({ status: "ok", view: VIEW });
    expect(mocks.triggerProcessing).not.toHaveBeenCalled();
  });

  it("55000 et relecture impossible : échec de la relance", async () => {
    const { db } = fakeDb({ data: null, error: { code: "55000" } }, { data: null, error: { code: "57014" } });
    expect(await retryProcessing(input, "auteur", db)).toEqual({
      status: "error",
      error: { code: "INTERNAL", message: t.retryFailed, retryable: true },
    });
  });

  it("exception de l'appel : échec de la relance, jamais de détail technique", async () => {
    const { db } = fakeDb(new Error("détail interne"));
    const result = await retryProcessing(input, "auteur", db);
    expect(result).toEqual({ status: "error", error: { code: "INTERNAL", message: t.retryFailed, retryable: true } });
    expect(JSON.stringify(result)).not.toContain("détail interne");
  });
});

describe("retryProcessingAction", () => {
  it("sans session : UNAUTHENTICATED, sans appel à la base", async () => {
    const error = { code: "UNAUTHENTICATED", message: texts.session.expired, retryable: false };
    mocks.requireUser.mockResolvedValue({ user: null, error });
    expect(await retryProcessingAction(DOC, REQUEST)).toEqual({ status: "error", error });
    expect(mocks.order).toEqual([]);
  });

  it("avec session : traduit le refus de la base reçu par le client du Collaborateur", async () => {
    mocks.requireUser.mockResolvedValue({ user: { id: "autre", email: "" } });
    expect(await retryProcessingAction(DOC, REQUEST)).toMatchObject({ status: "error", error: { code: "FORBIDDEN" } });
  });
});
