import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getQuota, nextUtcMidnight, utcDay } = await import("@/server/quota/get-quota");
const { quotaReachedUntil } = await import("@/lib/quota");

// Story 5.10 (Q1 = A) : lecture du quota par le composant serveur de l'Assistant, avec le client du
// Collaborateur (RLS) ; aucun identifiant de Compte n'est passé à la requête ; échec → null.
type Result = { data: unknown; error: { code: string } | null };
function db(usage: Result | Error, limit: Result | Error) {
  const calls: { table: string; filters: [string, unknown][] }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] as [string, unknown][] };
    calls.push(call);
    const outcome = table === "ai_usage" ? usage : limit;
    const settle = () => (outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome));
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      },
      maybeSingle: settle,
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => settle().then(resolve, reject),
    };
    return builder;
  });
  return { client: { from } as never, calls };
}

const NOW = new Date("2026-11-20T23:59:59.000Z");
const LIMIT: Result = { data: { value: 60 }, error: null };

afterEach(() => vi.restoreAllMocks());

describe("getQuota", () => {
  it("compteur du jour UTC et limite ; resetAt = prochain 00:00 UTC ; aucun filtre sur un identifiant de Compte (RLS)", async () => {
    const { client, calls } = db({ data: [{ count: 60 }], error: null }, LIMIT);
    expect(await getQuota(client, NOW)).toEqual({ used: 60, limit: 60, resetAt: "2026-11-21T00:00:00.000Z" });
    expect(calls.find((call) => call.table === "ai_usage")?.filters).toEqual([["day_utc", "2026-11-20"]]);
    expect(calls.find((call) => call.table === "ai_limits")?.filters).toEqual([["key", "ai_daily_quota"]]);
    expect(calls.flatMap((call) => call.filters).some(([column]) => column === "user_id")).toBe(false);
  });

  it("aucune ligne du jour : 0 utilisé", async () => {
    const { client } = db({ data: [], error: null }, LIMIT);
    expect(await getQuota(client, NOW)).toMatchObject({ used: 0, limit: 60 });
  });

  it.each([
    ["compteur refusé", { data: null, error: { code: "42501" } }, LIMIT],
    ["limite refusée", { data: [{ count: 3 }], error: null }, { data: null, error: { code: "42501" } }],
    ["limite absente", { data: [{ count: 3 }], error: null }, { data: null, error: null }],
    ["compteur illisible", { data: [{ count: "beaucoup" }], error: null }, LIMIT],
    ["plusieurs lignes", { data: [{ count: 1 }, { count: 2 }], error: null }, LIMIT],
    ["réseau", new Error("réseau"), LIMIT],
  ] as const)("%s : null, journalisé sans donnée", async (_label, usage, limit) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = db(usage as Result | Error, limit as Result);
    expect(await getQuota(client, NOW)).toBeNull();
    expect(error).toHaveBeenCalled();
    expect(error.mock.calls.join(" ")).toContain("quota_read_failed");
  });

  it("jour UTC et prochain minuit UTC, quel que soit le fuseau", () => {
    expect(utcDay(new Date("2026-11-20T23:30:00.000-02:00"))).toBe("2026-11-21");
    expect(nextUtcMidnight(new Date("2026-12-31T12:00:00.000Z"))).toBe("2027-01-01T00:00:00.000Z");
  });

  it("quotaReachedUntil : resetAt seulement si la limite est atteinte", () => {
    expect(quotaReachedUntil({ used: 60, limit: 60, resetAt: "r" })).toBe("r");
    expect(quotaReachedUntil({ used: 59, limit: 60, resetAt: "r" })).toBeNull();
    expect(quotaReachedUntil(null)).toBeNull();
  });
});
