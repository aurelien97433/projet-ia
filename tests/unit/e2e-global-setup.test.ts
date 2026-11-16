import { describe, expect, it, vi } from "vitest";
import { AI_COUNTER_TABLES, assertLocalTarget, resetAiCounters } from "../e2e/global-setup";

// Préparation des tests de bout en bout (story 5.2b) : remise à zéro automatique des compteurs d'IA,
// refusée hors de la pile locale.
describe("resetAiCounters", () => {
  it("pile locale : vide les trois tables puis vérifie qu'elles sont à zéro", () => {
    const sql = vi.fn((query: string) => (query.startsWith("select") ? [{ ai_reservations: 0, ai_usage: "0", ai_usage_global: 0 }] : []));
    resetAiCounters("http://127.0.0.1:54321", sql);
    expect(AI_COUNTER_TABLES).toEqual(["ai_reservations", "ai_usage", "ai_usage_global"]);
    expect(sql.mock.calls[0][0]).toBe("truncate table public.ai_reservations, public.ai_usage, public.ai_usage_global");
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("compteur restant : échec explicite", () => {
    const sql = vi.fn((query: string) => (query.startsWith("select") ? [{ ai_reservations: 0, ai_usage: 2, ai_usage_global: 0 }] : []));
    expect(() => resetAiCounters("http://127.0.0.1:54321", sql)).toThrow(/ai_usage/);
  });

  it.each([
    ["aucune ligne", []],
    ["deux lignes", [{ ai_reservations: 0, ai_usage: 0, ai_usage_global: 0 }, { ai_reservations: 0, ai_usage: 0, ai_usage_global: 0 }]],
    ["clé absente", [{ ai_reservations: 0, ai_usage: 0 }]],
    ["valeur nulle (null)", [{ ai_reservations: 0, ai_usage: null, ai_usage_global: 0 }]],
    ["valeur vide", [{ ai_reservations: 0, ai_usage: "", ai_usage_global: 0 }]],
    ["valeur non numérique", [{ ai_reservations: 0, ai_usage: "zéro", ai_usage_global: 0 }]],
    ["booléen", [{ ai_reservations: 0, ai_usage: false, ai_usage_global: 0 }]],
  ])("vérification illisible (%s) : échec explicite", (_label, rows) => {
    const sql = vi.fn((query: string) => (query.startsWith("select") ? (rows as Record<string, unknown>[]) : []));
    expect(() => resetAiCounters("http://127.0.0.1:54321", sql)).toThrow(/Compteurs d'IA|Vérification des compteurs/);
  });

  it.each(["https://projet.supabase.co", "http://localhost:54321", "http://127.0.0.2:54321", "pas une adresse", ""])(
    "cible %s : refusée, aucune requête",
    (url) => {
      const sql = vi.fn(() => []);
      expect(() => resetAiCounters(url, sql)).toThrow(/pile Supabase locale/);
      expect(() => assertLocalTarget(url)).toThrow();
      expect(sql).not.toHaveBeenCalled();
    },
  );
});
