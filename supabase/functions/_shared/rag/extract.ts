// Texte d'un fichier importé (.txt, .md), AD-8 et story 2.6b :
//   1. UTF-8 strict (TextDecoder fatal), BOM retiré ;
//   2. en cas d'échec, repli sur Windows-1252 (fichiers français enregistrés sous Windows) ;
//   3. dans les deux cas, refus d'un résultat contenant des caractères de contrôle autres que tabulation,
//      saut de ligne et retour chariot (le retour chariot précède la normalisation des fins de ligne).
// Fonction pure : elle ne lève jamais d'exception pour un contenu illisible, elle le signale.
//
// Limites connues (décision du 2026-11-12) : un fichier dans un encodage proche (ISO-8859-15, Mac Roman…)
// sans caractère de contrôle est lu comme Windows-1252, avec quelques caractères faux ; un binaire sans
// aucun octet de contrôle n'est pas détecté.
export type FileText = { ok: true; text: string; encoding: "utf-8" | "windows-1252" } | { ok: false; reason: "encoding" };

// Catégorie Cc sauf \t, \n, \r : C0 (U+0000–U+001F), DEL (U+007F) et C1 (U+0080–U+009F).
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

export function hasForbiddenControl(text: string): boolean {
  return FORBIDDEN_CONTROL.test(text);
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

const hasUtf8Bom = (view: Uint8Array) => view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf;

export function decodeFileText(bytes: ArrayBuffer | Uint8Array): FileText {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const utf8 = decodeUtf8(view);
  // Repli : un BOM UTF-8 suivi d'octets invalides donnerait « ï»¿ » en Windows-1252 ; il est retiré.
  const fallback = () => new TextDecoder("windows-1252").decode(hasUtf8Bom(view) ? view.subarray(3) : view);
  const decoded: { text: string; encoding: "utf-8" | "windows-1252" } =
    utf8 !== null ? { text: utf8, encoding: "utf-8" } : { text: fallback(), encoding: "windows-1252" };
  if (hasForbiddenControl(decoded.text)) return { ok: false, reason: "encoding" };
  return { ok: true, ...decoded };
}
