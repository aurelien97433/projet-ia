// Texte d'un fichier importé (.txt, .md). Story 2.6a : lecture minimale en UTF-8, BOM retiré, sans
// repli. La story 2.6b ajoute le décodage strict, le repli Windows-1252 et le contrôle des caractères
// (AD-8) ; ne pas l'anticiper ici.
export function decodeFileText(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}
