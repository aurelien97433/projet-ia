import { describe, expect, it, vi } from "vitest";
import { ERROR_CODES, appError } from "@/lib/errors";
import { texts } from "@/lib/texts";
import { signUp } from "@/server/auth/sign-up";

const PASSWORD = ["mot", "de", "passe", "1"].join("-");
const session = { access_token: "a", refresh_token: "r" };

function fakeAuth(response: unknown) {
  return { signUp: vi.fn().mockResolvedValue(response) };
}

describe("signUp", () => {
  it("crée le Compte et renvoie un succès quand Supabase ouvre une session", async () => {
    const auth = fakeAuth({ data: { session, user: {} }, error: null });
    const result = await signUp({ email: "  camille@nexaworks.test ", password: PASSWORD }, auth);
    expect(result).toEqual({ status: "success" });
    expect(auth.signUp).toHaveBeenCalledWith({ email: "camille@nexaworks.test", password: PASSWORD });
  });

  it.each([
    ["camille@", PASSWORD, { email: texts.signUp.errors.invalidEmail }],
    ["", PASSWORD, { email: texts.signUp.errors.invalidEmail }],
    ["camille@nexaworks.test", "1234567", { password: texts.signUp.errors.passwordTooShort }],
    [null, null, { email: texts.signUp.errors.invalidEmail, password: texts.signUp.errors.passwordTooShort }],
  ])("refuse %j sans appeler Supabase", async (email, password, fieldErrors) => {
    const auth = fakeAuth({ data: {}, error: null });
    const result = await signUp({ email, password }, auth);
    expect(result).toEqual({ status: "invalid", fieldErrors });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it.each(["user_already_exists", "email_exists"])("signale un e-mail déjà utilisé (%s) avec le message du catalogue", async (code) => {
    const auth = fakeAuth({ data: {}, error: { code, status: 422, message: "x" } });
    expect(await signUp({ email: "a@b.test", password: PASSWORD }, auth)).toEqual({
      status: "invalid",
      fieldErrors: { email: texts.signUp.errors.emailTaken },
      emailTaken: true,
    });
  });

  it.each([
    ["email_address_invalid", undefined, { email: texts.signUp.errors.invalidEmail }],
    ["weak_password", ["length"], { password: texts.signUp.errors.passwordTooShort }],
    ["weak_password", ["characters"], { password: texts.signUp.errors.passwordRejected }],
    ["weak_password", ["length", "pwned"], { password: texts.signUp.errors.passwordRejected }],
    ["weak_password", undefined, { password: texts.signUp.errors.passwordRejected }],
  ])("traduit le refus Supabase %s (motifs %j) en erreur de champ", async (code, reasons, fieldErrors) => {
    const auth = fakeAuth({ data: {}, error: { code, status: 422, message: "x", reasons } });
    expect(await signUp({ email: "a@b.test", password: PASSWORD }, auth)).toEqual({ status: "invalid", fieldErrors });
  });

  it("refuse un mot de passe de plus de 72 octets sans appeler Supabase, accepte 72", async () => {
    const tooLong = fakeAuth({ data: {}, error: null });
    expect(await signUp({ email: "a@b.test", password: "a".repeat(73) }, tooLong)).toEqual({
      status: "invalid",
      fieldErrors: { password: texts.signUp.errors.passwordTooLong },
    });
    // 37 caractères accentués = 74 octets : refusé aussi.
    expect(await signUp({ email: "a@b.test", password: "é".repeat(37) }, tooLong)).toEqual({
      status: "invalid",
      fieldErrors: { password: texts.signUp.errors.passwordTooLong },
    });
    expect(tooLong.signUp).not.toHaveBeenCalled();

    const ok = fakeAuth({ data: { session, user: {} }, error: null });
    expect(await signUp({ email: "a@b.test", password: "a".repeat(72) }, ok)).toEqual({ status: "success" });
  });

  it.each([
    ["erreur Supabase inconnue", () => fakeAuth({ data: {}, error: { code: "unexpected_failure", status: 500, message: "x" } })],
    ["exception réseau", () => ({ signUp: vi.fn().mockRejectedValue(new Error("fetch failed")) })],
  ])("renvoie la forme d'erreur unique pour une %s, sans détail ni mot de passe", async (_label, makeAuth) => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await signUp({ email: "a@b.test", password: PASSWORD }, makeAuth());
    expect(result).toEqual({
      status: "error",
      error: { code: "INTERNAL", message: texts.signUp.errors.unexpectedTitle, retryable: true },
    });
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain("a@b.test");
    errorLog.mockRestore();
  });

  it("Compte accepté sans session (confirmation par e-mail active) : résultat dédié, journalisé, ni panne ni succès", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = fakeAuth({ data: { session: null, user: { id: "u1" } }, error: null });
    const result = await signUp({ email: "a@b.test", password: PASSWORD }, auth);
    expect(result).toEqual({ status: "confirmation_required" });
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("sign_up_without_session");
    expect(logged).toContain("email_confirmation_enabled");
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain("a@b.test");
    errorLog.mockRestore();
  });

  it("ne renvoie jamais le mot de passe", async () => {
    const results = await Promise.all([
      signUp({ email: "bad", password: PASSWORD }, fakeAuth({})),
      signUp({ email: "a@b.test", password: PASSWORD }, fakeAuth({ data: {}, error: { code: "user_already_exists" } })),
    ]);
    expect(JSON.stringify(results)).not.toContain(PASSWORD);
  });
});

describe("appError", () => {
  it("produit la forme { error: { code, message, retryable, resetAt? } }", () => {
    expect(appError("INTERNAL", "m", true)).toEqual({ error: { code: "INTERNAL", message: "m", retryable: true } });
    expect(appError("QUOTA_EXCEEDED", "m", false, "2026-11-05T00:00:00Z")).toEqual({
      error: { code: "QUOTA_EXCEEDED", message: "m", retryable: false, resetAt: "2026-11-05T00:00:00Z" },
    });
  });

  it("contient exactement les codes de l'architecture (AD-19, §6)", () => {
    expect([...ERROR_CODES]).toEqual([
      "VALIDATION_FAILED",
      "UNAUTHENTICATED",
      "NOT_FOUND",
      "FORBIDDEN",
      "FILE_TYPE_UNSUPPORTED",
      "FILE_TOO_LARGE",
      "QUOTA_EXCEEDED",
      "REQUEST_IN_PROGRESS",
      "AI_UNAVAILABLE",
      "AI_TIMEOUT",
      "AI_BUDGET_EXHAUSTED",
      "AI_OUTPUT_INVALID",
      "AI_CITATIONS_INVALID",
      "PROCESSING_NO_TEXT",
      "PROCESSING_TEMPORARY",
      "INTERNAL",
    ]);
  });
});
