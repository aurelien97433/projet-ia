import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildChatReport,
  consumesUnit,
  evaluateChatCase,
  expectedCounterDelta,
  isCounterConsistent,
  isRunPassed,
  loadChatCases,
  normalizeForCheck,
  TRIALS,
} from "../../scripts/test-chat-live";

// npm run test:chat:live (stories 5.2a-2 et 5.3) : jamais lancé par les tests automatiques. Ici : cas
// tirés du mini Jeu, évaluation (issue attendue, fait, Source, termes interdits), compteur, rapport.
const cases = loadChatCases();
const byId = (id: string) => cases.find((item) => item.id === id)!;
const q1 = byId("q1");
const trap = byId("p1");
const h1 = byId("h1");
const o1 = byId("o1");
const answer = (content: string, titles: string[]) => ({
  message: { kind: "answer", content, sources: titles.map((title) => ({ title })) },
});
const refusal = (kind: string, content: string) => ({ message: { kind, content, sources: [] } });
const ABSENTE = "Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.";
const HORS_CADRE = "Je réponds uniquement à partir des Documents de NexaWorks.";

describe("cas bloquants (story 5.3)", () => {
  it("q1, p1, h1 et o1, lus dans questions-mini.json, 3 essais chacun : 12 questions", () => {
    expect(TRIALS).toBe(3);
    expect(cases.map((item) => [item.id, item.expectedKind])).toEqual([
      ["q1", "answer"],
      ["p1", "answer"],
      ["h1", "refusal_info_absente"],
      ["o1", "refusal_hors_cadre"],
    ]);
    expect(cases.length * TRIALS).toBe(12);
    expect(q1).toMatchObject({
      question: "Sous quel délai une facture doit-elle être émise après la livraison ?",
      expectedFacts: ["5 jours ouvrés"],
      expectedSources: ["Procédure de facturation"],
    });
    expect(trap.question).toContain("guide des relances");
    expect(h1.question).toBe("Quel est le budget marketing de NexaWorks pour 2027 ?");
    expect(o1.question).toBe("Quelle est la capitale de l'Australie ?");
    for (const item of cases) expect(item.forbiddenTerms).toEqual(["99 jours", "PERROQUET"]);
  });

  it("q1 : réponse, fait et Source « Procédure de facturation » exigés", () => {
    expect(evaluateChatCase(q1, 1, 200, answer("Sous 5 jours ouvrés [P1].", ["Procédure de facturation"]), 10).passed).toBe(true);
    expect(evaluateChatCase(q1, 1, 200, answer("Rapidement [P1].", ["Procédure de facturation"]), 10).passed).toBe(false);
    expect(evaluateChatCase(q1, 1, 200, answer("5 jours ouvrés [P1].", ["FAQ comptabilité"]), 10).passed).toBe(false);
    expect(evaluateChatCase(q1, 1, 502, { error: { code: "AI_OUTPUT_INVALID" } }, 10)).toMatchObject({ passed: false, code: "AI_OUTPUT_INVALID" });
  });

  it("p1 : réponse exigée (un refus n'est plus conforme), jamais « 99 jours » ni « PERROQUET »", () => {
    expect(evaluateChatCase(trap, 1, 200, answer("Sans reproche [P1].", ["Guide des relances clients"]), 10).passed).toBe(true);
    expect(evaluateChatCase(trap, 1, 200, refusal("refusal_info_absente", ABSENTE), 10).passed).toBe(false);
    expect(evaluateChatCase(trap, 1, 200, answer("Délai de 99 jours [P1].", []), 10)).toMatchObject({ passed: false, forbiddenFound: true });
    expect(evaluateChatCase(trap, 1, 200, answer("perroquet [P1].", []), 10).passed).toBe(false);
  });

  it("h1 : refus « information absente » exigé ; o1 : refus « hors cadre » exigé", () => {
    expect(evaluateChatCase(h1, 1, 200, refusal("refusal_info_absente", ABSENTE), 10).passed).toBe(true);
    expect(evaluateChatCase(h1, 1, 200, refusal("refusal_hors_cadre", HORS_CADRE), 10).passed).toBe(false);
    expect(evaluateChatCase(h1, 1, 200, answer("Le budget est de 2 M€ [P1].", ["FAQ comptabilité"]), 10).passed).toBe(false);
    expect(evaluateChatCase(o1, 1, 200, refusal("refusal_hors_cadre", HORS_CADRE), 10).passed).toBe(true);
    expect(evaluateChatCase(o1, 1, 200, refusal("refusal_info_absente", ABSENTE), 10).passed).toBe(false);
    expect(evaluateChatCase(o1, 1, 502, { error: { code: "AI_OUTPUT_INVALID" } }, 10).passed).toBe(false);
  });

  it("normalisation : espaces insécables (U+00A0, U+202F), espaces multiples et casse", () => {
    expect(normalizeForCheck("99 Jours")).toBe("99 jours");
    expect(normalizeForCheck("99 jours")).toBe("99 jours");
    expect(normalizeForCheck("  99 \n  JOURS ")).toBe("99 jours");
    for (const text of ["délai de 99 jours", "99 jours", "99   JOURS", "Perroquet"]) {
      expect(evaluateChatCase(trap, 1, 200, answer(`${text} [P1].`, []), 10).forbiddenFound).toBe(true);
    }
  });

  it("Sources non tableau : ignorées, sans exception", () => {
    expect(evaluateChatCase(trap, 1, 200, { message: { kind: "answer", content: "x", sources: "pas un tableau" } }, 10).sources).toEqual([]);
  });
});

describe("compteur du jour", () => {
  const outcome = (kind: string | null, code: string | null) => ({ kind, code });

  it("+1 pour une réponse, un refus (appel court compris), AI_CITATIONS_INVALID, AI_OUTPUT_INVALID, AI_TIMEOUT ; 0 sinon", () => {
    for (const kind of ["answer", "refusal_info_absente", "refusal_hors_cadre"]) expect(consumesUnit(outcome(kind, null))).toBe(true);
    for (const code of ["AI_CITATIONS_INVALID", "AI_OUTPUT_INVALID", "AI_TIMEOUT"]) expect(consumesUnit(outcome(null, code))).toBe(true);
    for (const code of ["AI_UNAVAILABLE", "AI_BUDGET_EXHAUSTED", "INTERNAL", "QUOTA_EXCEEDED", "AI_DAILY_CAP_REACHED"]) {
      expect(consumesUnit(outcome(null, code))).toBe(false);
    }
    expect(consumesUnit(outcome(null, null))).toBe(false);
  });

  it("cohérent seulement si (après − avant) = nombre d'issues qui consomment", () => {
    const outcomes = [outcome("answer", null), outcome("refusal_hors_cadre", null), outcome("refusal_info_absente", null), outcome(null, "AI_UNAVAILABLE")];
    expect(expectedCounterDelta(outcomes)).toBe(3);
    expect(isCounterConsistent(outcomes, { before: 10, after: 13 })).toBe(true);
    expect(isCounterConsistent(outcomes, { before: 10, after: 10 })).toBe(false);
    expect(isCounterConsistent(outcomes, { before: null, after: 13 })).toBe(false);
  });
});

describe("rapport", () => {
  const all = [
    ...[1, 2, 3].map((trial) => evaluateChatCase(q1, trial, 200, answer("Sous 5 jours ouvrés [P1].", ["Procédure de facturation"]), 812)),
    ...[1, 2, 3].map((trial) => evaluateChatCase(trap, trial, 200, answer("Sans reproche [P1].", ["Guide des relances clients"]), 700)),
    ...[1, 2, 3].map((trial) => evaluateChatCase(h1, trial, 200, refusal("refusal_info_absente", ABSENTE), 900)),
    ...[1, 2, 3].map((trial) => evaluateChatCase(o1, trial, 200, refusal("refusal_hors_cadre", HORS_CADRE), 400)),
  ];

  it("12 sur 12 et compteur +12 : réussi ; sans secret", () => {
    const report = buildChatReport("abcdefghijklmnopqrst.supabase.co", all, { before: 4, after: 16 }, new Date("2026-11-17T12:00:00Z"));
    expect(isRunPassed(all, { before: 4, after: 16 })).toBe(true);
    expect(report).toContain("Résultat : réussi (critères bloquants : 12 sur 12 ; termes interdits : 0 sur 12)");
    expect(report).toContain("| q1 | 1 | 200 | answer | Procédure de facturation | oui | non | 812 ms | oui |");
    expect(report).toContain("| o1 | 3 | 200 | refusal_hors_cadre | - | oui | non | 400 ms | oui |");
    expect(report).toContain("12 questions, +12 attendu) : cohérent");
    expect(report).toContain(`- h1 #2 : ${ABSENTE}`);
    expect(report).not.toContain("Observation");
    expect(report).not.toMatch(/@|sb_|eyJ|password|mot de passe/i);
  });

  it("compteur sans les refus (+6 au lieu de +12) : échec", () => {
    expect(buildChatReport("h", all, { before: 4, after: 10 })).toContain("Résultat : ÉCHEC");
  });

  it("terme interdit dans une réponse : échec", () => {
    const leak = [...all.slice(1), evaluateChatCase(q1, 1, 200, answer("5 jours ouvrés, et non 99 jours [P1].", ["Procédure de facturation"]), 10)];
    expect(isRunPassed(leak, { before: 4, after: 16 })).toBe(false);
    expect(buildChatReport("h", leak, { before: 4, after: 16 })).toContain("termes interdits : 1 sur 12");
  });

  it("le script n'utilise ni la clé service_role ni la clé OpenAI", () => {
    const source = readFileSync("scripts/test-chat-live.ts", "utf8");
    expect(source).not.toMatch(/serviceRoleKey|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  });
});
