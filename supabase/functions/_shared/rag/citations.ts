// Citations de la réponse (story 5.2a-1, AD-11) : repères [P{n}] renvoyant aux Passages transmis,
// numérotés de 1 à n dans l'ordre des consignes (même liste que buildChatMessages). Les Sources sont
// regroupées par Document, dans l'ordre de première citation, avec les Passages cités de chacun. Un
// repère de citation mal formé ou hors liste est ignoré et renvoyé à part, pour les journaux. Le texte
// n'est pas modifié : le masquage des repères arrive en 5.5, la validation stricte (aucune citation
// valide = AI_CITATIONS_INVALID) en 5.4. Module pur.
import type { ChatPassage } from "./prompt.ts";

export type CitedSource = { documentId: string; passageNumbers: number[] };

export type CitationReading = {
  // Sources dans l'ordre de première citation.
  sources: CitedSource[];
  // Numéros de Passage valides, dans l'ordre de première citation, sans doublon.
  cited: number[];
  // Repères de citation mal formés ou hors liste, dans l'ordre d'apparition. Ils ne contiennent que
  // « P », des chiffres, des espaces et de la ponctuation de liste : jamais de texte de la réponse.
  unknown: string[];
};

// Candidat : « [P », jusqu'à 40 caractères sans crochet ni saut de ligne, puis « ] ».
const CANDIDATE = /\[P[^[\]\n]{0,40}\]/g;
// Repère qui ressemble à une citation ([P], [P0], [P1, P2], [P1-2]…) : seulement « P », chiffres,
// espaces et ponctuation de liste ; « [Procédure] » ou « [Pièce jointe] » n'en sont pas.
const CITATION_LIKE = /^\[P[\sP\d,;\-–]*\]$/;
// Citation reconnue : un seul numéro, sans zéro initial.
const CITATION = /^\[P([1-9]\d{0,2})\]$/;

export function readCitations(text: string, passages: Pick<ChatPassage, "documentId">[]): CitationReading {
  const cited: number[] = [];
  const unknown: string[] = [];
  for (const match of text.matchAll(CANDIDATE)) {
    const token = match[0];
    if (!CITATION_LIKE.test(token)) continue;
    const number = CITATION.exec(token);
    const n = number ? Number(number[1]) : 0;
    if (n >= 1 && n <= passages.length) {
      if (!cited.includes(n)) cited.push(n);
    } else {
      unknown.push(token);
    }
  }

  const sources: CitedSource[] = [];
  for (const n of cited) {
    const { documentId } = passages[n - 1];
    const existing = sources.find((source) => source.documentId === documentId);
    if (existing) existing.passageNumbers.push(n);
    else sources.push({ documentId, passageNumbers: [n] });
  }
  return { sources, cited, unknown };
}
