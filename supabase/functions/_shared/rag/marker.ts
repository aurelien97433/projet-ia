// Marqueur de la génération (story 5.3, AD-10) : REPONSE, REFUS_INFO_ABSENTE ou REFUS_HORS_CADRE, seul
// sur la première ligne. Lecture minimale (décision de l'utilisateur du 2026-11-16) : espaces autour,
// casse, astérisques de mise en gras (* ou **) autour du mot ; rien d'autre (texte sur la même
// ligne, ponctuation, autre mot : invalide). Le marqueur est retiré, jamais affiché ni enregistré.
// Module pur, sans type Deno, réutilisable par la diffusion (5.5) : la première ligne tient dans un
// tampon de MARKER_MAX_LENGTH caractères au plus.

export const MARKERS = ["REPONSE", "REFUS_INFO_ABSENTE", "REFUS_HORS_CADRE"] as const;
export type Marker = (typeof MARKERS)[number];

// Longueur maximale de la première ligne (saut de ligne exclu) : au-delà, le marqueur est invalide.
export const MARKER_MAX_LENGTH = 40;

export type MarkerReading = { marker: Marker; rest: string };

// Mot éventuellement entouré du même nombre d'astérisques (1 ou 2), espaces autour.
const MARKER_LINE = /^[ \t]*(\*{0,2})([A-Za-z_]+)\1[ \t]*$/;

// Marqueur lu sur la première ligne et texte qui suit (après le premier saut de ligne, tel quel), ou
// null si le marqueur est absent ou invalide.
export function readMarker(text: string): MarkerReading | null {
  const newline = text.indexOf("\n");
  const line = (newline === -1 ? text : text.slice(0, newline)).replace(/\r$/, "");
  if (line.length > MARKER_MAX_LENGTH) return null;
  const match = MARKER_LINE.exec(line);
  if (!match) return null;
  const word = match[2].toUpperCase();
  const marker = MARKERS.find((candidate) => candidate === word);
  if (!marker) return null;
  return { marker, rest: newline === -1 ? "" : text.slice(newline + 1) };
}
