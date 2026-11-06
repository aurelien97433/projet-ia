// Découpage d'un texte canonique en Passages (architecture §4). Sans chevauchement, chaque Passage
// vérifie text.slice(start, end) === content, avec des positions en unités de code JavaScript.
import { CHUNK_MAX_LENGTH, CHUNK_TARGET_LENGTH } from "../config.ts";

export type Chunk = { start: number; end: number; content: string };

// En dessous, un Passage serait un fragment sans intérêt pour la recherche (« M. », un titre seul).
const MIN_PASSAGE_LENGTH = CHUNK_TARGET_LENGTH / 2;

const isSpace = (char: string) => /\s/.test(char);

function matchEnds(window: string, pattern: RegExp): number[] {
  return [...window.matchAll(pattern)].map((match) => match.index + match[0].length);
}

// Fin de paragraphe la plus proche de la cible, parmi celles d'une longueur raisonnable.
function paragraphCut(window: string): number | undefined {
  const ends = [...window.matchAll(/\n[ \t]*\n/g)]
    .map((match) => match.index)
    .filter((end) => end >= MIN_PASSAGE_LENGTH && end <= CHUNK_MAX_LENGTH);
  return ends.sort((a, b) => Math.abs(a - CHUNK_TARGET_LENGTH) - Math.abs(b - CHUNK_TARGET_LENGTH))[0];
}

// Première fin de phrase atteignant la cible, sinon la dernière avant le maximum.
function sentenceCut(window: string): number | undefined {
  // L'espace éventuel avant un guillemet fermant suit l'usage français (« Bonjour ! »).
  const ends = matchEnds(window, /[.!?…]+(?:\s?["'»”)\]]+)?(?=\s)/g).filter(
    (end) => end >= MIN_PASSAGE_LENGTH && end <= CHUNK_MAX_LENGTH,
  );
  return ends.find((end) => end >= CHUNK_TARGET_LENGTH) ?? ends.at(-1);
}

// Liste ou texte sans ponctuation : dernière fin de ligne avant le maximum.
function lineCut(window: string): number | undefined {
  const end = window.lastIndexOf("\n", CHUNK_MAX_LENGTH);
  return end >= MIN_PASSAGE_LENGTH ? end : undefined;
}

// Phrase trop longue : dernier espace avant la limite, sinon la limite, sans séparer une paire de
// surrogates.
function hardCut(window: string): number {
  for (let index = CHUNK_MAX_LENGTH; index > 0; index -= 1) {
    if (isSpace(window[index])) return index;
  }
  const code = window.charCodeAt(CHUNK_MAX_LENGTH - 1);
  return code >= 0xd800 && code <= 0xdbff ? CHUNK_MAX_LENGTH - 1 : CHUNK_MAX_LENGTH;
}

export function chunkText(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  let position = 0;

  while (position < text.length) {
    if (isSpace(text[position])) {
      position += 1;
      continue;
    }

    const start = position;
    let cut = text.length;
    if (text.length - start > CHUNK_MAX_LENGTH) {
      // Un caractère de plus que le maximum, pour voir ce qui suit une fin de phrase à la limite.
      const window = text.slice(start, start + CHUNK_MAX_LENGTH + 1);
      cut = start + (paragraphCut(window) ?? sentenceCut(window) ?? lineCut(window) ?? hardCut(window));
    }

    let end = cut;
    while (isSpace(text[end - 1])) end -= 1;
    chunks.push({ start, end, content: text.slice(start, end) });
    position = cut;
  }

  return chunks;
}
