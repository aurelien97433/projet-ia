import { describe, expect, it } from "vitest";
import { readCitations } from "../../supabase/functions/_shared/rag/citations.ts";
import { createStreamMask, maskChunks, STREAM_MASK_MAX_HELD } from "../../supabase/functions/_shared/rag/stream-mask.ts";

// Masquage des repères pendant la diffusion (story 5.5, AD-11) : aucun [P…] ni [S…] dans un delta,
// même coupé entre deux morceaux ou non fermé à la fin ; « [Procédure] » rendu dès qu'il est reconnu ;
// tampon borné ; rien de ce qui part en delta n'est absent du texte validé (décision de l'utilisateur
// du 2026-11-17).
const sent = (chunks: string[]) => maskChunks(chunks).filter((text) => text !== "");
const joined = (chunks: string[]) => maskChunks(chunks).join("");
const REPERE = /\[[PS]/;
const passages = (n: number) => Array.from({ length: n }, (_, index) => ({ documentId: `d${index + 1}` }));

// Texte validé tel qu'affiché, renvois [S{n}] retirés : le texte provisoire mis bout à bout doit en
// être une sous-suite (rien d'ajouté).
const displayed = (text: string) => readCitations(text, passages(8)).text.replace(/\[S\d+\]/g, "");
function isSubsequence(small: string, large: string): boolean {
  let index = 0;
  for (const c of large) if (index < small.length && small[index] === c) index += 1;
  return index === small.length;
}

describe("masquage en flux", () => {
  it("matrice : « A [P1]. B [P2]. » en 6 morceaux → « A », « . B », « . »", () => {
    expect(sent(["A [", "P1", "]. B", " [P", "2]", "."])).toEqual(["A", ". B", "."]);
  });

  it("repère coupé entre deux morceaux (« …délai [P » + « 1]. Suite ») : jamais « [P » envoyé", () => {
    const out = sent(["Relancez sous 15 jours de délai [P", "1]. Suite du texte."]);
    expect(out.join("")).toBe("Relancez sous 15 jours de délai. Suite du texte.");
    for (const text of out) expect(text).not.toMatch(REPERE);
  });

  it("repère non fermé à la fin (« … fin [P3 ») : jamais envoyé", () => {
    const out = maskChunks(["Texte de", " fin [P3"]);
    expect(out.join("")).toBe("Texte de fin");
    expect(out.join("")).not.toContain("[P");
  });

  it("« [ » seul en fin de flux : rendu (gardé aussi dans le texte validé)", () => {
    expect(joined(["Voir [", ""])).toBe("Voir [");
  });

  it("« [Procédure] », « [Service] » : rendus dès la lettre qui suit « [P » ou « [S »", () => {
    const mask = createStreamMask();
    expect(mask.push("Voir [P")).toBe("Voir");
    expect(mask.push("r")).toBe(" [Pr");
    expect(mask.push("océdure] et [Service]")).toBe("océdure] et [Service]");
  });

  it("repère à lettres mêlées (« [P1, S3] », « [S1, P2] ») : retiré en entier, même coupé, comme dans le texte validé", () => {
    for (const repere of ["[P1, S3]", "[S1, P2]", "[P1;S2-P3]"]) {
      const text = `Fait ${repere}. Suite.`;
      expect(displayed(text)).toBe("Fait. Suite.");
      for (const size of [1, 2, 3, 5]) {
        const chunks = text.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")) ?? [];
        const out = sent(chunks);
        expect(out.join("")).toBe("Fait. Suite.");
        for (const piece of out) expect(piece).not.toMatch(/[PS]\d|\]/);
      }
    }
  });

  it("autre espace horizontal Unicode dans un repère (« [P1\\u2003 2] ») : retiré en entier, comme dans le texte validé", () => {
    for (const space of ["\u2003", "\u2009", "\u3000"]) {
      const text = `Fait [P1${space}2]. Suite.`;
      expect(displayed(text)).toBe("Fait. Suite.");
      expect(joined([`Fait [P1${space}`, "2]. Suite."])).toBe("Fait. Suite.");
    }
    // Un saut de ligne n'appartient jamais à un repère.
    expect(joined(["1. Étape [P1\n2. Suite"])).toBe("1. Étape\n2. Suite");
  });

  it("repères de toutes formes retirés : [P1][P2], [P1, P2], [P], [P0], [S1], [S1, S2], [PP1]", () => {
    for (const repere of ["[P1][P2]", "[P1, P2]", "[P]", "[P0]", "[S1]", "[S1, S2]", "[PP1]", "[P1-2]", "[P1 ; P2]"]) {
      const out = joined([`Fait ${repere}.`, " Suite."]);
      expect(out).toBe("Fait. Suite.");
    }
  });

  it("repère coupé à chaque caractère : jamais un « [P » ou « [S » dans un morceau envoyé", () => {
    const text = "A [P1]. B [P2][S3] fin [Procédure] et [P12, P3]. Dernier [P4";
    const out = sent([...text]);
    for (const piece of out) expect(piece).not.toMatch(/\[[PS](?!r)/);
    expect(out.join("")).toBe("A. B fin [Procédure] et. Dernier");
  });

  it("repère suivi d'autre chose qu'un caractère de repère : retiré, la suite est envoyée (« x [P1a » → « x a »)", () => {
    expect(joined(["x [P1a y"])).toBe("x a y");
    expect(joined(["x [P.y"])).toBe("x .y");
  });

  it("espaces du début retirés (texte validé rogné) ; espaces de fin jamais envoyés", () => {
    expect(joined(["\n  Bonjour", "   "])).toBe("Bonjour");
  });

  it("sauts de ligne gardés (puces, étapes)", () => {
    expect(joined(["1. Étape [P1]\n2. Autre [P2]\n"])).toBe("1. Étape\n2. Autre\n");
  });

  it(`tampon borné : au plus ${STREAM_MASK_MAX_HELD} caractères retenus, même avec de longues suites d'espaces`, () => {
    const mask = createStreamMask();
    mask.push("Début");
    let max = 0;
    for (const c of `${" ".repeat(200)}[P`) {
      mask.push(c);
      max = Math.max(max, mask.held());
    }
    expect(max).toBeLessThanOrEqual(STREAM_MASK_MAX_HELD);
    expect(STREAM_MASK_MAX_HELD).toBe(41);
    // Un repère de plus de 40 caractères n'est jamais retenu en entier.
    const long = createStreamMask();
    long.push(`x [P1${", 2".repeat(30)}`);
    expect(long.held()).toBeLessThanOrEqual(STREAM_MASK_MAX_HELD);
    expect(long.push("] fin")).toBe(" fin");
  });

  it("rien de ce qui part en delta n'est absent du texte validé (repères, citations invalides, piège)", () => {
    const cases = [
      "Une facture est émise sous 5 jours ouvrés [P1].",
      "Relance à 15 jours [P2] ; la note dit 21 jours [P5]. Les Documents ne concordent pas : 15 jours[P2], 21 jours[P5].",
      "A [P1]. B [P9]. C [P1, P2]. D [S4] E.",
      "Ton courtois [P3], sans reproche [P3][P4].",
      "1. Ouvrir la fiche [P1]\n2. Valider [P2]",
      "Fin ouverte [P3",
    ];
    for (const text of cases) {
      for (const size of [1, 2, 3, 5, 8]) {
        const chunks = text.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")) ?? [];
        const provisional = joined(chunks);
        expect(provisional).not.toMatch(REPERE);
        expect(isSubsequence(provisional, displayed(text))).toBe(true);
      }
    }
  });
});
