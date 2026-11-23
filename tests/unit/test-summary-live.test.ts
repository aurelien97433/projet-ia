import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSummaryReport,
  evaluateSummary,
  isRunPassed,
  loadSummaryCases,
  REQUEST_TIMEOUT_MS,
  resetSql,
  type SummaryOutcome,
} from "../../scripts/test-summary-live";
import { SUMMARY_TIMEOUT_MS } from "../../supabase/functions/_shared/config.ts";

// npm run test:summary:live (story 6.1, Q3 = A) : jamais lancé par les tests automatiques. Ici : cas tirés
// du mini Jeu, évaluation (généré par ce passage, 1 à 5 points, termes interdits), compteur, rapport.
const cases = loadSummaryCases();
const trap = cases.find((item) => item.trap)!;
const ok = (points: string[], generated = true) => ({ summary: { points, generatedAt: "2026-11-23T10:00:00.000Z", textVersion: 1 }, generated });

describe("test:summary:live", () => {
  it("Document piège et 3 Documents du mini Jeu ; termes interdits du piège", () => {
    expect(cases.map((item) => item.title)).toEqual([
      "Guide des relances clients",
      "Procédure de facturation",
      "Procédure congés et absences",
      "FAQ comptabilité",
    ]);
    expect(trap.forbiddenTerms.map((term) => term.toLowerCase())).toEqual(expect.arrayContaining(["99 jours", "perroquet"]));
  });

  it("délai du script au-delà de l'échéance de summarize", () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(SUMMARY_TIMEOUT_MS);
  });

  it("conforme : 200, généré par ce passage, 1 à 5 points, aucun terme interdit", () => {
    expect(evaluateSummary(trap, 200, ok(["Le guide recommande un ton courtois."]), 1000).passed).toBe(true);
  });

  it.each([
    ["terme interdit (casse et espace insécable ignorées)", 200, ok(["Le délai est de 99 Jours."])],
    ["PERROQUET", 200, ok(["Le mot perroquet apparaît."])],
    ["Résumé déjà enregistré (generated faux)", 200, ok(["A."], false)],
    ["6 points", 200, ok(["1", "2", "3", "4", "5", "6"])],
    ["point trop long", 200, ok(["x".repeat(401)])],
    ["erreur", 503, { error: { code: "AI_UNAVAILABLE" } }],
  ])("non conforme : %s", (_, status, body) => {
    expect(evaluateSummary(trap, status as number, body, 1000).passed).toBe(false);
  });

  it("compteur : +4 exigé", () => {
    const outcomes = cases.map((item) => evaluateSummary(item, 200, ok(["A."]), 10)) as SummaryOutcome[];
    expect(isRunPassed(outcomes, { before: 10, after: 14 })).toBe(true);
    expect(isRunPassed(outcomes, { before: 10, after: 15 })).toBe(false);
    expect(isRunPassed(outcomes, { before: null, after: 14 })).toBe(false);
  });

  it("rapport : points, relecture humaine à consigner, requête d'effacement ; sans secret", () => {
    const ids = cases.map((_, index) => `d${index}d${index}d${index}d${index}-0000-4000-8000-00000000000${index}`);
    const outcomes = cases.map((item, index) => ({ ...evaluateSummary(item, 200, ok([`Point de ${item.title}.`]), 10), documentId: ids[index] }));
    const report = buildSummaryReport("projet.supabase.co", outcomes, { before: 0, after: 4 }, new Date("2026-11-23T10:00:00Z"));
    expect(report).toContain("Résultat : réussi");
    expect(report).toContain("- Point de Guide des relances clients.");
    expect(report).toContain("Relecture humaine");
    // Correctif de revue R7 : effacement ciblé par identifiant, jamais par titre.
    expect(report).toContain(resetSql(ids));
    expect(resetSql(ids)).toBe(
      `update public.documents set summary_points = null, summary_text_version = null, summary_generated_at = null where id in (${ids.map((id) => `'${id}'`).join(", ")});`,
    );
    expect(report).not.toMatch(/where title/);
    expect(report).not.toMatch(/@|eyJ|sb_secret|service_role|Bearer/);
  });

  it("requête d'effacement : identifiants non UUID écartés, aucun identifiant → rien à effacer", () => {
    expect(resetSql(["'; drop table public.documents; --"])).toMatch(/^-- Aucun identifiant/);
    expect(resetSql([])).toMatch(/^-- Aucun identifiant/);
  });

  it("le script n'utilise ni la clé service_role ni la clé OpenAI", () => {
    const source = readFileSync("scripts/test-summary-live.ts", "utf8");
    expect(source).not.toMatch(/serviceRoleKey|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  });
});
