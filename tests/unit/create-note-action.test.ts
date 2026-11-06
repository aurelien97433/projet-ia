import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Action de création : déclenchement du traitement, redirection sans ?ajoute=1, rejeu.
const mocks = vi.hoisted(() => ({
  createNote: vi.fn(),
  triggerProcessing: vi.fn(),
  order: [] as string[],
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.order.push(`redirect:${url}`);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => "client-du-collaborateur" }));
vi.mock("@/server/auth/require-user", () => ({ requireUser: async () => ({ user: { id: "auteur", email: "" } }) }));
vi.mock("@/server/documents/create-note", () => ({ createNote: mocks.createNote }));
vi.mock("@/server/documents/trigger-processing", () => ({ triggerProcessing: mocks.triggerProcessing }));

const { createNoteAction } = await import("@/app/(app)/ajouter/actions");

beforeEach(() => {
  mocks.order.length = 0;
  mocks.createNote.mockReset();
  mocks.triggerProcessing.mockReset();
  mocks.triggerProcessing.mockImplementation(async () => {
    mocks.order.push("trigger");
  });
});

describe("createNoteAction", () => {
  it("création : déclenche avec le client du Collaborateur, puis redirige sans notification", async () => {
    mocks.createNote.mockResolvedValue({ status: "created", id: "doc", attemptToStart: "tentative" });
    await expect(createNoteAction(new FormData())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.triggerProcessing).toHaveBeenCalledWith("doc", "tentative", "client-du-collaborateur");
    expect(mocks.order).toEqual(["trigger", "redirect:/documents/doc"]);
  });

  it("rejeu : aucun nouvel appel, même page", async () => {
    mocks.createNote.mockResolvedValue({ status: "created", id: "doc", attemptToStart: null });
    await expect(createNoteAction(new FormData())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.triggerProcessing).not.toHaveBeenCalled();
    expect(mocks.order).toEqual(["redirect:/documents/doc"]);
  });

  it("saisie invalide : ni appel ni redirection", async () => {
    const invalid = { status: "invalid", fieldErrors: { title: "Indiquez un titre." } };
    mocks.createNote.mockResolvedValue(invalid);
    expect(await createNoteAction(new FormData())).toEqual(invalid);
    expect(mocks.order).toEqual([]);
  });
});
