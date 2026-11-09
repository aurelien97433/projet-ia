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

export type PassageParams = {
  passages: PassagePosition[];
  activeIndex: number;
};

const MAX_PASSAGES = 20;
const MAX_PARAM_LENGTH = 2_000;
const POSITION_PATTERN = /^(\d{1,7})-(\d{1,7})$/;
const INDEX_PATTERN = /^\d{1,7}$/;
// Entrée invalide : layoutPassages la rejette et le signale, sa place dans la liste est conservée.
const INVALID_PASSAGE: PassagePosition = { start: -1, end: -1 };

function parsePassage(element: string, textLength: number): PassagePosition {
  const match = POSITION_PATTERN.exec(element);
  if (!match) return INVALID_PASSAGE;
  const [start, end] = [Number(match[1]), Number(match[2])];
  return start <= textLength && end <= textLength ? { start, end } : INVALID_PASSAGE;
}

// Paramètres d'URL de la page Document (`?passages=120-340,900-1100&actif=1`). Fonction pure : seuls des
// entiers en sortent, aucune valeur de l'URL n'est reprise. `activeIndex` désigne la liste renvoyée.
export function parsePassageParams(
  params: { passages?: string | string[]; actif?: string | string[] },
  textLength: number,
): PassageParams {
  const { passages: raw, actif } = params;
  if (raw === undefined || raw === "") return { passages: [], activeIndex: 0 };
  const elements = typeof raw === "string" && raw.length <= MAX_PARAM_LENGTH ? raw.split(",") : null;
  if (!elements || elements.length > MAX_PASSAGES) return { passages: [INVALID_PASSAGE], activeIndex: 0 };

  const passages = elements.map((element) => parsePassage(element, textLength));
  const requested = typeof actif === "string" && INDEX_PATTERN.test(actif) ? Number(actif) : 0;
  return { passages, activeIndex: requested < passages.length ? requested : 0 };
}

const isHighSurrogate =(code: number) => code >= 0xd800 && code <= 0xdbff;
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
