// Fichiers de test réels du décodage (story 2.6b), écrits octet par octet dans tests/fixtures/files/.
// Lancement : npx tsx scripts/generate-file-fixtures.ts (résultat déterministe, fichiers versionnés).
// Le fichier de près de 1 Mo n'est jamais versionné : les tests le génèrent à l'exécution.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const FIXTURES_DIR = path.resolve(import.meta.dirname, "..", "tests", "fixtures", "files");

// Windows-1252 des caractères utilisés ici (hors ASCII) : table limitée, contrôlée par un test.
const CP1252: Record<string, number> = {
  "é": 0xe9, "è": 0xe8, "à": 0xe0, "ç": 0xe7, "ô": 0xf4, "û": 0xfb, "ù": 0xf9, "É": 0xc9, "€": 0x80, "œ": 0x9c, "Œ": 0x8c,
};

export function encodeWindows1252(text: string): Uint8Array {
  return Uint8Array.from(Array.from(text), (character) => {
    const code = character.codePointAt(0)!;
    if (code < 0x80) return code;
    const byte = CP1252[character];
    if (byte === undefined) throw new Error(`Caractère absent de la table Windows-1252 : ${character}`);
    return byte;
  });
}

export const FIXTURE_TEXTS = {
  utf8: "Procédure congés et absences\r\nPoser ses congés deux semaines à l'avance. Coût : 12 €.\r\n",
  utf8Bom: "# Été 2026\n\nRéunion d'équipe : « ordre du jour » validé.\n",
  windows1252: "Procédure congés : à poser avant l'été.\r\nCoût du séjour : 12 €. Cœur de métier, reçu à l'hôtel.\r\n",
};

export function fixtureBytes(): Record<string, Uint8Array> {
  const utf8 = new TextEncoder();
  return {
    "utf8.txt": utf8.encode(FIXTURE_TEXTS.utf8),
    "utf8-bom.md": Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8.encode(FIXTURE_TEXTS.utf8Bom)]),
    "windows-1252.txt": encodeWindows1252(FIXTURE_TEXTS.windows1252),
    "vide.txt": new Uint8Array(),
    "espaces.txt": utf8.encode("   \r\n\t \n  \n"),
    // En-tête PNG, octets nuls et octets de contrôle : un binaire renommé « .txt ».
    "binaire.txt": Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x06, 0x00, 0x00, 0x00, 0x5c, 0x72, 0xa8, 0x66, 0x00,
    ]),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  for (const [name, bytes] of Object.entries(fixtureBytes())) {
    writeFileSync(path.join(FIXTURES_DIR, name), bytes);
    console.log(`${name} : ${bytes.length} octets`);
  }
}
