import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encodeWindows1252, FIXTURE_TEXTS, fixtureBytes, FIXTURES_DIR } from "../../scripts/generate-file-fixtures";
import { decodeFileText, hasForbiddenControl } from "../../supabase/functions/_shared/rag/extract.ts";

// Décodage des fichiers importés (story 2.6b, AD-8) : vrais fichiers de test (tests/fixtures/files),
// puis octets ciblés.
const fixture = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES_DIR, name)));

describe("fichiers de test versionnés", () => {
  it("identiques, octet pour octet, à ceux du script (aucune conversion des fins de ligne par git)", () => {
    for (const [name, bytes] of Object.entries(fixtureBytes())) expect(fixture(name)).toEqual(bytes);
  });

  it("table Windows-1252 du script conforme au décodeur standard", () => {
    const text = "éèàçôûùÉ€œŒ";
    expect(new TextDecoder("windows-1252").decode(encodeWindows1252(text))).toBe(text);
  });
});

describe("decodeFileText sur les fichiers réels", () => {
  it("UTF-8 : lu tel quel, accents compris", () => {
    expect(decodeFileText(fixture("utf8.txt"))).toEqual({ ok: true, text: FIXTURE_TEXTS.utf8, encoding: "utf-8" });
  });

  it("UTF-8 avec BOM : BOM retiré", () => {
    const result = decodeFileText(fixture("utf8-bom.md"));
    expect(result).toEqual({ ok: true, text: FIXTURE_TEXTS.utf8Bom, encoding: "utf-8" });
    expect(result.ok && result.text.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("Windows-1252 : repli, accents et « € », « œ » corrects", () => {
    expect(decodeFileText(fixture("windows-1252.txt"))).toEqual({
      ok: true,
      text: FIXTURE_TEXTS.windows1252,
      encoding: "windows-1252",
    });
  });

  it("vide et espaces : lus (le traitement les signale comme sans texte exploitable)", () => {
    expect(decodeFileText(fixture("vide.txt"))).toEqual({ ok: true, text: "", encoding: "utf-8" });
    expect(decodeFileText(fixture("espaces.txt"))).toMatchObject({ ok: true });
  });

  it("binaire renommé .txt : encodage non pris en charge", () => {
    expect(decodeFileText(fixture("binaire.txt"))).toEqual({ ok: false, reason: "encoding" });
  });
});

describe("decodeFileText, cas limites", () => {
  it.each([
    ["octet nul (UTF-8 valide)", [0x41, 0x00, 0x42]],
    ["échappement U+001B (UTF-8 valide)", [0x41, 0x1b, 0x42]],
    ["DEL U+007F", [0x41, 0x7f]],
    ["saut de page U+000C", [0x41, 0x0c]],
    ["tabulation verticale U+000B", [0x41, 0x0b]],
    ["C1 en UTF-8 (U+0085)", [0x41, 0xc2, 0x85]],
    ["C1 du repli Windows-1252 (octet 0x81 non attribué)", [0xe9, 0x81]],
    ["UTF-16 avec BOM", [0xff, 0xfe, 0x41, 0x00]],
  ])("%s : refusé", (_label, bytes) => {
    expect(decodeFileText(Uint8Array.from(bytes))).toEqual({ ok: false, reason: "encoding" });
  });

  it("tabulation, saut de ligne et retour chariot : acceptés", () => {
    expect(decodeFileText(new TextEncoder().encode("a\tb\r\nc\n"))).toEqual({ ok: true, text: "a\tb\r\nc\n", encoding: "utf-8" });
  });

  it("BOM UTF-8 suivi d'octets invalides : repli sans « ï»¿ »", () => {
    expect(decodeFileText(Uint8Array.from([0xef, 0xbb, 0xbf, 0x43, 0x6f, 0xfb, 0x74]))).toEqual({
      ok: true,
      text: "Coût",
      encoding: "windows-1252",
    });
  });

  it("BOM seul : texte vide ; ArrayBuffer accepté", () => {
    expect(decodeFileText(Uint8Array.from([0xef, 0xbb, 0xbf]))).toEqual({ ok: true, text: "", encoding: "utf-8" });
    expect(decodeFileText(new TextEncoder().encode("Été").buffer)).toEqual({ ok: true, text: "Été", encoding: "utf-8" });
  });

  it("caractères hors BMP et symboles : acceptés", () => {
    expect(hasForbiddenControl("Coût 😀 « € » — œ")).toBe(false);
  });
});
