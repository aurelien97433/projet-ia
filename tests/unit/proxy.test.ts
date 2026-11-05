import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Proxy (updateSession) : cookies de session rafraîchis et en-têtes anti-cache conservés, que la
// requête passe ou soit redirigée. Le client Supabase est simulé : getClaims déclenche le
// rafraîchissement (setAll) comme le fait @supabase/ssr quand le jeton a expiré.
const NO_STORE = "private, no-cache, no-store, must-revalidate, max-age=0";
const state: { sub: string | null; refresh: boolean } = { sub: null, refresh: false };

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    { cookies }: { cookies: { setAll: (cookies: unknown[], headers: Record<string, string>) => unknown } },
  ) => ({
    auth: {
      getClaims: async () => {
        if (state.refresh) {
          await cookies.setAll(
            [{ name: "sb-test-auth-token", value: "nouveau-jeton", options: { path: "/", maxAge: 400 * 24 * 3600 } }],
            { "Cache-Control": NO_STORE, Expires: "0", Pragma: "no-cache" },
          );
        }
        return { data: state.sub ? { claims: { sub: state.sub } } : null, error: null };
      },
    },
  }),
}));

const { updateSession } = await import("@/lib/supabase/proxy");

const request = (path: string) => new NextRequest(new URL(path, "http://nexamind.test"));

beforeEach(() => {
  state.sub = null;
  state.refresh = false;
});

describe("updateSession", () => {
  it("Visiteur sur une page protégée : 307 vers /connexion avec la page demandée", async () => {
    const response = await updateSession(request("/bibliotheque?categorie=rh"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://nexamind.test/connexion?suite=%2Fbibliotheque%3Fcategorie%3Drh");
  });

  it("Visiteur sur /connexion : la requête passe", async () => {
    const response = await updateSession(request("/connexion"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("session rafraîchie puis redirection (/connexion → /) : nouveaux cookies et en-têtes anti-cache repris", async () => {
    state.sub = "u1";
    state.refresh = true;
    const response = await updateSession(request("/connexion"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://nexamind.test/");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("nouveau-jeton");
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("session rafraîchie sur une page protégée : la requête passe avec les cookies et les en-têtes anti-cache", async () => {
    state.sub = "u1";
    state.refresh = true;
    const response = await updateSession(request("/bibliotheque"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("nouveau-jeton");
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("session valide sans rafraîchissement : aucun cookie posé", async () => {
    state.sub = "u1";
    const response = await updateSession(request("/bibliotheque"));
    expect(response.cookies.getAll()).toEqual([]);
  });
});
