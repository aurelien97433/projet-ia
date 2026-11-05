import { afterEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";

// requireUser : contrôle de session en tête de chaque Server Action protégée.
const getCurrentUser = vi.fn();
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser }));

const { requireUser } = await import("@/server/auth/require-user");

afterEach(() => vi.clearAllMocks());

describe("requireUser", () => {
  it("session valide : renvoie le Collaborateur", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.test" });
    expect(await requireUser()).toEqual({ user: { id: "u1", email: "a@b.test" } });
  });

  it("sans session : UNAUTHENTICATED avec le message de session expirée", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await requireUser()).toEqual({
      user: null,
      error: { code: "UNAUTHENTICATED", message: texts.session.expired, retryable: false },
    });
  });
});

describe("Server Action de création : session vérifiée avant toute écriture", () => {
  it("sans session, aucun client Supabase n'est créé et rien n'est écrit", async () => {
    getCurrentUser.mockResolvedValue(null);
    const createClient = vi.fn();
    vi.doMock("@/lib/supabase/server", () => ({ createClient }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
    const { createNoteAction } = await import("@/app/(app)/ajouter/actions");
    const form = new FormData();
    form.set("title", "Titre");
    const result = await createNoteAction(form);
    expect(result).toMatchObject({ status: "error", error: { code: "UNAUTHENTICATED" } });
    expect(createClient).not.toHaveBeenCalled();
  });
});
