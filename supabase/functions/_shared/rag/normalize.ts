// Texte canonique (AD-8) : fins de ligne « \n », forme NFC, sans espace ni tabulation en fin de ligne.
// Il est l'unique référence pour l'affichage, le découpage et les positions des Passages.
function trimLineEnd(line: string): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t")) end -= 1;
  return line.slice(0, end);
}

export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").normalize("NFC").split("\n").map(trimLineEnd).join("\n");
}
