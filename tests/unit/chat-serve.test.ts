import { afterEach, describe, expect, it, vi } from "vitest";

// Point d'entrée de chat (story 5.2a-2, AD-17) : le travail est confié à EdgeRuntime.waitUntil, pour
// qu'il se termine même si le relais se déconnecte. Deno.serve et EdgeRuntime sont simulés AVANT
// l'import du module, qui les lit à son chargement.
const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  waitUntil.mockReset();
});

describe("chat : Deno.serve et EdgeRuntime.waitUntil", () => {
  it("chaque requête : la promesse du travail est confiée à waitUntil, et la même réponse est rendue", async () => {
    let served: ((request: Request) => Promise<Response>) | undefined;
    vi.stubGlobal("Deno", {
      env: { get: () => undefined },
      serve: (handler: (request: Request) => Promise<Response>) => {
        served = handler;
      },
    });
    vi.stubGlobal("EdgeRuntime", { waitUntil });
    vi.resetModules();
    await import("../../supabase/functions/chat/index.ts");
    expect(served).toBeDefined();

    // Requête refusée sans appel réseau (méthode) : le chemin d'entrée est le même pour toute requête.
    const response = await served!(new Request("http://localhost/functions/v1/chat", { method: "GET" }));
    expect(response.status).toBe(405);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    const work = waitUntil.mock.calls[0][0];
    expect(work).toBeInstanceOf(Promise);
    await expect(work).resolves.toBe(response);
  });
});
