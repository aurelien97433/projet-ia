import { afterEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";
import { signIn } from "@/server/auth/sign-in";

const PASSWORD = ["mot", "de", "passe", "1"].join("-");
const session = { access_token: "a", refresh_token: "r" };

function fakeAuth(response: unknown) {
  return { signInWithPassword: vi.fn().mockResolvedValue(response) };
}

afterEach(() => vi.restoreAllMocks());

describe("signIn", () => {
  it("ouvre une session avec l'e-mail nettoyé", async () => {
    const auth = fakeAuth({ data: { session, user: {} }, error: null });
    expect(await signIn({ email: " camille@nexaworks.test ", password: PASSWORD }, auth)).toEqual({ status: "success" });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "camille@nexaworks.test", password: PASSWORD });
  });

  it.each([
    ["e-mail mal formé", "camille@", PASSWORD],
    ["e-mail vide", "", PASSWORD],
    ["mot de passe vide", "camille@nexaworks.test", ""],
    ["champs absents", null, null],
    ["valeurs d'un autre type", 42, { mot: "de passe" }],
  ])("%s : message unique, sans appel à Supabase ni champ désigné", async (_label, email, password) => {
    const auth = fakeAuth({ data: {}, error: null });
    expect(await signIn({ email, password }, auth)).toEqual({ status: "invalid_credentials" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("identifiants refusés par Supabase : message unique, sans journalisation", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = fakeAuth({ data: {}, error: { code: "invalid_credentials", status: 400, message: "x" } });
    expect(await signIn({ email: "a@b.test", password: PASSWORD }, auth)).toEqual({ status: "invalid_credentials" });
    expect(log).not.toHaveBeenCalled();
  });

  it("Compte non confirmé : même message, signalé à l'exploitant sans e-mail ni mot de passe", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = fakeAuth({ data: {}, error: { code: "email_not_confirmed", status: 400, message: "x" } });
    expect(await signIn({ email: "camille@b.test", password: PASSWORD }, auth)).toEqual({ status: "invalid_credentials" });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("sign_in_unconfirmed");
    expect(logged).not.toContain("camille");
    expect(logged).not.toContain(PASSWORD);
  });

  it.each([
    ["limitation de débit", { data: {}, error: { code: "over_request_rate_limit", status: 429, message: "x" } }],
    ["erreur inconnue", { data: {}, error: { status: 500, message: "x" } }],
    ["réponse sans session", { data: { session: null, user: null }, error: null }],
  ])("%s : erreur INTERNAL du catalogue, journalisée sans e-mail ni mot de passe", async (_label, response) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await signIn({ email: "camille@nexaworks.test", password: PASSWORD }, fakeAuth(response));
    expect(result).toEqual({
      status: "error",
      error: { code: "INTERNAL", message: texts.signIn.errors.unexpected, retryable: true },
    });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("sign_in_failed");
    expect(logged).not.toContain("camille");
    expect(logged).not.toContain(PASSWORD);
  });

  it("exception du client (Supabase injoignable) : erreur INTERNAL", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = { signInWithPassword: vi.fn().mockRejectedValue(new Error("fetch failed")) };
    const result = await signIn({ email: "a@b.test", password: PASSWORD }, auth);
    expect(result).toMatchObject({ status: "error", error: { code: "INTERNAL", retryable: true } });
  });

  it("le résultat renvoyé au navigateur ne contient jamais le mot de passe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const response of [
      { data: { session, user: {} }, error: null },
      { data: {}, error: { code: "invalid_credentials", status: 400, message: "x" } },
      { data: {}, error: { code: "unexpected_failure", status: 500, message: "x" } },
    ]) {
      const result = await signIn({ email: "a@b.test", password: PASSWORD }, fakeAuth(response));
      expect(JSON.stringify(result)).not.toContain(PASSWORD);
    }
  });
});
