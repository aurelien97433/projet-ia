import { describe, expect, it } from "vitest";
import {
  buildThread,
  exchangeReply,
  failureMessage,
  failureRetryable,
  hasPendingExchange,
  PENDING_LIMIT_MS,
  PENDING_REFRESH_MS,
  type StoredMessage,
  stripRawCitations,
} from "@/lib/conversation-thread";
import { texts } from "@/lib/texts";

// Règles d'affichage d'un échange enregistré et retrait des repères bruts (story 5.6). Module pur.
const NOW = Date.parse("2026-11-18T10:00:00.000Z");
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1_000).toISOString();
const SOURCE = { documentId: "d1", title: "Procédure de facturation", passageCount: 2 };

let next = 0;
const question = (secondsAgo: number, content = "Question ?", clientRequestId: string | null = null): StoredMessage => ({
  id: `m${++next}`,
  role: "user",
  kind: "question",
  content,
  errorCode: null,
  createdAt: at(secondsAgo),
  clientRequestId,
  sources: [],
});
const assistant = (kind: StoredMessage["kind"], secondsAgo: number, extra: Partial<StoredMessage> = {}): StoredMessage => ({
  id: `m${++next}`,
  role: "assistant",
  kind,
  content: kind === "failure" ? null : "Réponse[S1].",
  errorCode: kind === "failure" ? "AI_TIMEOUT" : null,
  createdAt: at(secondsAgo),
  clientRequestId: null,
  sources: kind === "answer" ? [SOURCE] : [],
  ...extra,
});

describe("règles d'affichage d'un échange", () => {
  it("1. réponse ou refus enregistré l'emporte sur un échec de la même question (avant ou après)", () => {
    expect(exchangeReply(at(200), [assistant("failure", 150), assistant("answer", 100)], NOW)).toEqual({
      kind: "answer",
      content: "Réponse[S1].",
      sources: [SOURCE],
    });
    expect(exchangeReply(at(200), [assistant("refusal_hors_cadre", 150), assistant("failure", 100)], NOW)).toEqual({
      kind: "refusal",
      variant: "hors_cadre",
    });
    expect(exchangeReply(at(200), [assistant("refusal_info_absente", 150)], NOW)).toEqual({ kind: "refusal", variant: "info_absente" });
  });

  it("2. échec seul : échec avec son code ; code inconnu → INTERNAL ; message du catalogue selon le code", () => {
    expect(exchangeReply(at(200), [assistant("failure", 150, { errorCode: "AI_CITATIONS_INVALID" })], NOW)).toEqual({
      kind: "failure",
      code: "AI_CITATIONS_INVALID",
    });
    expect(exchangeReply(at(200), [assistant("failure", 150, { errorCode: "INCONNU" })], NOW)).toEqual({ kind: "failure", code: "INTERNAL" });
    expect(failureMessage("AI_CITATIONS_INVALID")).toBe(texts.assistant.unverifiable);
    expect(failureMessage("AI_BUDGET_EXHAUSTED")).toBe(texts.assistant.budgetExhausted);
    expect(failureMessage("AI_TIMEOUT")).toBe(texts.assistant.failed);
    expect(failureRetryable("AI_TIMEOUT")).toBe(true);
    expect(failureRetryable("AI_BUDGET_EXHAUSTED")).toBe(false);
  });

  it("3. sans message de l'Assistant : en cours pendant 90 s (30 s : en cours), au-delà échec AI_TIMEOUT (10 min : abandonnée)", () => {
    expect(PENDING_LIMIT_MS).toBe(90_000);
    expect(PENDING_REFRESH_MS).toBe(5_000);
    expect(exchangeReply(at(30), [], NOW)).toEqual({ kind: "pending" });
    expect(exchangeReply(at(89.999), [], NOW)).toEqual({ kind: "pending" });
    expect(exchangeReply(at(90), [], NOW)).toEqual({ kind: "failure", code: "AI_TIMEOUT" });
    expect(exchangeReply(at(600), [], NOW)).toEqual({ kind: "failure", code: "AI_TIMEOUT" });
  });

  it("fil : un échange par question, messages de l'Assistant rattachés à la question qui les précède, dans l'ordre", () => {
    const q1 = question(300, "Première ?");
    const q2 = question(200, "Deuxième ?");
    const q3 = question(20, "Troisième ?");
    const thread = buildThread(
      [assistant("answer", 400), q1, assistant("answer", 290), q2, assistant("failure", 190), q3],
      NOW,
    );
    expect(thread.map((exchange) => [exchange.id, exchange.question, exchange.reply.kind])).toEqual([
      [q1.id, "Première ?", "answer"],
      [q2.id, "Deuxième ?", "failure"],
      [q3.id, "Troisième ?", "pending"],
    ]);
    expect(hasPendingExchange(thread)).toBe(true);
    expect(hasPendingExchange(thread.slice(0, 2))).toBe(false);
    expect(buildThread([], NOW)).toEqual([]);
  });

  it("revue, constat 1 : deux questions traitées en même temps, issues dans le désordre → chacune rattachée à sa question par clientRequestId", () => {
    // Q1 à 10:00:00 (le navigateur abandonne à 20 s), Q2 à 10:00:25 ; réponse de Q1 à 10:00:40, échec de Q2 à 10:01:50.
    const q1 = question(120, "Comment poser mes congés ?", "r1");
    const q2 = question(95, "Comment relancer un client ?", "r2");
    const a1 = assistant("answer", 80, { content: "Congés[S1].", clientRequestId: "r1" });
    const f2 = assistant("failure", 10, { errorCode: "AI_TIMEOUT", clientRequestId: "r2" });
    const thread = buildThread([q1, q2, a1, f2], NOW);
    expect(thread.map((exchange) => [exchange.question, exchange.reply])).toEqual([
      ["Comment poser mes congés ?", { kind: "answer", content: "Congés[S1].", sources: [SOURCE] }],
      ["Comment relancer un client ?", { kind: "failure", code: "AI_TIMEOUT" }],
    ]);
  });

  it("messages d'avant la 5.6 (sans identifiant) ou identifiant inconnu : rattachés à la dernière question qui les précède", () => {
    const q1 = question(300, "Ancienne ?", "r1");
    const q2 = question(200, "Récente ?", "r2");
    const legacy = assistant("answer", 250);
    const unknown = assistant("failure", 150, { clientRequestId: "inconnu" });
    const thread = buildThread([q1, legacy, q2, unknown], NOW);
    expect(thread.map((exchange) => exchange.reply.kind)).toEqual(["answer", "failure"]);
  });
});

describe("repères bruts des réponses d'avant la 5.4 (retrait à l'affichage)", () => {
  it("texte réel de la 5.2b : « … 5 jours ouvrés [P2]. » → « … 5 jours ouvrés. »", () => {
    expect(stripRawCitations("1. Une facture doit être émise sous 5 jours ouvrés [P2].")).toBe(
      "1. Une facture doit être émise sous 5 jours ouvrés.",
    );
  });

  it("toutes les formes de CITATION_LIKE, avec l'espace qui précède ; texte de la mesure de la 5.2a", () => {
    expect(stripRawCitations("A [P1][P3]. B [P1, P2] [P]. C [P1-2]. D [P1 ; P2].")).toBe("A. B. C. D.");
    expect(stripRawCitations("sans reproche. [P1] 2. Vous rappelez le numéro. [P1]")).toBe("sans reproche. 2. Vous rappelez le numéro.");
  });

  it("intouchés : renvois [S{n}] de la 5.4, « [Procédure] », « [Pièce jointe] », retour à la ligne", () => {
    expect(stripRawCitations("Réponse[S1]. Voir [Procédure] et [Pièce jointe].")).toBe("Réponse[S1]. Voir [Procédure] et [Pièce jointe].");
    expect(stripRawCitations("Ligne 1\n[Procédure] suite")).toBe("Ligne 1\n[Procédure] suite");
    expect(stripRawCitations("")).toBe("");
  });

  it("repère en début de ligne (revue, constat 5) : retiré avec les espaces qui le suivent, aucune espace laissée en tête", () => {
    expect(stripRawCitations("Ligne 1\n[P1] ligne 2")).toBe("Ligne 1\nligne 2");
    expect(stripRawCitations("[P1] [P2] Début. Ligne 1\n  [P3]  Suite [P4].")).toBe("Début. Ligne 1\nSuite.");
    expect(stripRawCitations("")).toBe("");
  });
});
