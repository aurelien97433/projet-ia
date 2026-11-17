// Citations de la réponse (stories 5.2a-1 et 5.4, AD-11) : repères [P{n}] renvoyant aux Passages
// transmis, numérotés de 1 à n dans l'ordre des consignes (même liste que buildChatMessages). Les
// Sources sont regroupées par Document, dans l'ordre de première citation, avec les Passages cités de
// chacun. Un repère de citation mal formé ou hors liste est renvoyé à part, pour les journaux.
//
// Story 5.4 : le texte est réécrit pour l'enregistrement (décision de l'utilisateur du 2026-11-17,
// Q1 = A) : chaque citation valide devient le renvoi canonique [S{n}] (n = numéro de sa Source), collé
// au mot qui précède ; les citations invalides, les repères coupés ou trop longs (« [P3 », « [S2 ») et
// tout repère [S…] écrit par le modèle sont retirés, avec les espaces laissés par le retrait ; plusieurs
// renvois côte à côte vers la même Source n'en font qu'un. La page remplace [S{n}] par le renvoi
// affiché. Le masquage en flux arrive en 5.5. Module pur.
import type { ChatPassage } from "./prompt.ts";

export type CitedSource = { documentId: string; passageNumbers: number[] };

export type CitationReading = {
  // Sources dans l'ordre de première citation.
  sources: CitedSource[];
  // Numéros de Passage valides, dans l'ordre de première citation, sans doublon.
  cited: number[];
  // Repères de citation mal formés, hors liste, coupés ou trop longs, dans l'ordre d'apparition. Ils ne
  // contiennent que « P » ou « S », des chiffres, des espaces et de la ponctuation de liste : jamais de
  // texte de la réponse.
  unknown: string[];
  // Nombre de repères [S…] écrits par le modèle et retirés (journalisé, jamais leur texte).
  modelRenvoisRemoved: number;
  // Texte réécrit : renvois [S{n}] à la place des citations valides, repères invalides retirés.
  text: string;
};

// Espaces horizontaux, insécables compris (U+00A0, U+202F).
const H = "[ \\t\\u00A0\\u202F]";
// Candidat : « [P » ou « [S », jusqu'à 40 caractères sans crochet ni saut de ligne, puis « ] ».
const CANDIDATE = /\[[PS][^[\]\n]{0,40}\]/g;
// Repère qui ressemble à une citation ([P], [P0], [P1, P2], [P1-2]…) : seulement « P », chiffres,
// espaces et ponctuation de liste ; « [Procédure] » ou « [Pièce jointe] » n'en sont pas.
const CITATION_LIKE = /^\[P[\sP\d,;\-–]*\]$/;
// Repère de renvoi écrit par le modèle ([S1], [S], [S1, S2]…) : retiré, sans quoi la page l'afficherait
// comme un renvoi ; « [Service] » ou « [Société] » n'en sont pas.
const RENVOI_LIKE = /^\[S[\sS\d,;\-–]*\]$/;
// Citation reconnue : un seul numéro, sans zéro initial.
const CITATION = /^\[P([1-9]\d{0,2})\]$/;
// Reste d'un repère après la première lecture : « [P » ou « [S » suivi d'un chiffre (repère coupé,
// non fermé ou plus long que le candidat), avec ses chiffres et sa ponctuation de liste.
const LEFTOVER = new RegExp(`\\[[PS]\\d(?:${H}|[\\d,;\\-–PS])*\\]?`, "g");

// Marques provisoires (retirées du texte du modèle avant la réécriture ; le caractère nul ne peut pas
// être enregistré par Postgres) : repère retiré, et renvoi valide « \u0001{n}\u0001 ».
const REMOVED = "\u0000";
const KEPT = "\u0001";
const KEPT_RENVOI = /\u0001(\d+)\u0001/g;
// Repères retirés (avec les espaces horizontaux qui les entourent ou les séparent).
const REMOVED_RUN = new RegExp(`${H}*\\u0000(?:${H}*\\u0000)*${H}*`, "g");
const HAS_SPACE = new RegExp(H);
// Ponctuation qui suit un mot sans espace : l'espace laissé devant elle par le retrait est supprimé.
const CLOSING_PUNCTUATION = /^[.,)\]…]$/;
// Renvois côte à côte (séparés au plus par des espaces horizontaux).
const RENVOI_RUN = new RegExp(`\\[S\\d+\\](?:${H}*\\[S\\d+\\])+`, "g");
// Espaces entre un mot et le renvoi qui le suit : retirés (« A [S1]. » → « A[S1]. », affiché « A¹. »).
const SPACE_BEFORE_RENVOI = new RegExp(`(\\S)${H}+(?=\\[S\\d+\\])`, "g");

export function readCitations(text: string, passages: Pick<ChatPassage, "documentId">[]): CitationReading {
  const source = text.replaceAll(REMOVED, "").replaceAll(KEPT, "");
  const cited: number[] = [];
  const unknown: string[] = [];
  let modelRenvoisRemoved = 0;
  const tokens: { token: string; passage: number | null; removed: boolean }[] = [];
  for (const match of source.matchAll(CANDIDATE)) {
    const token = match[0];
    if (token.startsWith("[S")) {
      const removed = RENVOI_LIKE.test(token);
      if (removed) modelRenvoisRemoved += 1;
      tokens.push({ token, passage: null, removed });
      continue;
    }
    if (!CITATION_LIKE.test(token)) {
      tokens.push({ token, passage: null, removed: false });
      continue;
    }
    const number = CITATION.exec(token);
    const n = number ? Number(number[1]) : 0;
    if (n >= 1 && n <= passages.length) {
      if (!cited.includes(n)) cited.push(n);
      tokens.push({ token, passage: n, removed: false });
    } else {
      unknown.push(token);
      tokens.push({ token, passage: null, removed: true });
    }
  }

  const sources: CitedSource[] = [];
  for (const n of cited) {
    const { documentId } = passages[n - 1];
    const existing = sources.find((source) => source.documentId === documentId);
    if (existing) existing.passageNumbers.push(n);
    else sources.push({ documentId, passageNumbers: [n] });
  }
  const ordinal = (n: number) => sources.findIndex((item) => item.passageNumbers.includes(n)) + 1;

  // Les candidats sont relus dans le même ordre que la boucle ci-dessus.
  let index = 0;
  const marked = source
    .replace(CANDIDATE, (token) => {
      const entry = tokens[index++];
      if (entry.passage !== null) return `${KEPT}${ordinal(entry.passage)}${KEPT}`;
      return entry.removed ? REMOVED : token;
    })
    .replace(LEFTOVER, (token) => {
      unknown.push(token.replace(new RegExp(`${H}+`, "g"), " ").trim());
      return REMOVED;
    });
  const rewritten = dedupeRenvois(cleanRemoved(marked).replace(KEPT_RENVOI, "[S$1]")).replace(SPACE_BEFORE_RENVOI, "$1");
  return { sources, cited, unknown, modelRenvoisRemoved, text: rewritten };
}

// Retire les repères marqués et les espaces qu'ils laissent : rien en début ou fin de ligne ni devant
// une ponctuation fermante ; sinon un seul espace s'il y en avait un autour du repère.
function cleanRemoved(text: string): string {
  return text.replace(REMOVED_RUN, (run: string, offset: number, whole: string) => {
    const before = whole[offset - 1];
    const after = whole[offset + run.length];
    if (before === undefined || after === undefined || /[\r\n]/.test(before + after)) return "";
    if (CLOSING_PUNCTUATION.test(after)) return "";
    return HAS_SPACE.test(run) ? " " : "";
  });
}

// Renvois côte à côte : chaque Source une seule fois, dans l'ordre, sans espace entre eux.
function dedupeRenvois(text: string): string {
  return text.replace(RENVOI_RUN, (run: string) => {
    const numbers = [...run.matchAll(/\[S(\d+)\]/g)].map((match) => match[1]);
    return [...new Set(numbers)].map((n) => `[S${n}]`).join("");
  });
}
