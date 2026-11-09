// Découpage du texte d'un Document selon ses Passages (AD-8). Fonction pure, sans DOM : les positions
// sont en unités de code JavaScript, sur le texte canonique.
export type PassagePosition = { start: number; end: number };

export type ReaderSegment =
  | { kind: "text"; start: number; text: string }
  | { kind: "passage"; start: number; text: string; position: number; active: boolean };

// « all » : aucun Passage retrouvé ; « some » : au moins un retrouvé, au moins un perdu.
export type MissingPassages = "none" | "some" | "all";

export type ReaderLayout = {
  segments: ReaderSegment[];
  total: number;
  missing: MissingPassages;
};

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

function splitsSurrogatePair(text: string, position: number): boolean {
  return isHighSurrogate(text.charCodeAt(position - 1)) && isLowSurrogate(text.charCodeAt(position));
}

function isValidPosition(text: string, { start, end }: PassagePosition): boolean {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    start < end &&
    end <= text.length &&
    !splitsSurrogatePair(text, start) &&
    !splitsSurrogatePair(text, end)
  );
}

// `activeIndex` désigne un élément de `passages` tel que reçu ; `position` (j) est le rang dans le
// texte, parmi les Passages retrouvés.
export function layoutPassages(text: string, passages: PassagePosition[], activeIndex: number): ReaderLayout {
  const found: (PassagePosition & { index: number })[] = [];
  const candidates = passages
    .map((passage, index) => ({ start: passage.start, end: passage.end, index }))
    .filter((passage) => isValidPosition(text, passage))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  for (const candidate of candidates) {
    const previous = found.at(-1);
    if (!previous || candidate.start >= previous.end) found.push(candidate);
  }

  const active = found.find((passage) => passage.index === activeIndex) ?? found[0];
  const segments: ReaderSegment[] = [];
  let cursor = 0;
  found.forEach((passage, rank) => {
    if (passage.start > cursor) {
      segments.push({ kind: "text", start: cursor, text: text.slice(cursor, passage.start) });
    }
    segments.push({
      kind: "passage",
      start: passage.start,
      text: text.slice(passage.start, passage.end),
      position: rank + 1,
      active: passage === active,
    });
    cursor = passage.end;
  });
  if (cursor < text.length) segments.push({ kind: "text", start: cursor, text: text.slice(cursor) });

  let missing: MissingPassages = "none";
  if (found.length === 0 && passages.length > 0) missing = "all";
  else if (found.length < passages.length) missing = "some";

  return { segments, total: found.length, missing };
}
