import { afterEach, describe, expect, it, vi } from "vitest";

// Déconnexion : portée « local », retour sur /connexion?deconnecte=1 même si le serveur Auth refuse
// la révocation (supabase-js efface alors tout de même la session locale).
const signOut = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signOut } }) }));
vi.mock("next/navigation", () => ({ redirect }));

const { signOutAction } = await import("@/server/auth/sign-out");

afterEach(() => vi.clearAllMocks());

describe("signOutAction", () => {
  it("ferme la session de ce navigateur seulement, puis redirige avec « Vous êtes déconnecté. »", async () => {
    signOut.mockResolvedValue({ error: null });
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT /connexion?deconnecte=1");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("refus du serveur Auth : journalisé, redirection maintenue", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    signOut.mockResolvedValue({ error: { code: "unexpected_failure", status: 500 } });
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT /connexion?deconnecte=1");
    expect(log.mock.calls.flat().join(" ")).toContain("sign_out_failed");
  });
});
