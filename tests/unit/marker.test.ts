import { describe, expect, it } from "vitest";
import { MARKER_MAX_LENGTH, MARKERS, readMarker } from "../../supabase/functions/_shared/rag/marker.ts";

// Marqueur en première ligne (story 5.3, AD-10) : lecture minimale décidée le 2026-11-16 (espaces
// autour, casse, astérisques de mise en gras), rien d'autre ; marqueur retiré du texte.
describe("readMarker", () => {
  it("trois valeurs, seules sur la première ligne ; le texte qui suit est rendu sans le marqueur", () => {
    expect(MARKERS).toEqual(["REPONSE", "REFUS_INFO_ABSENTE", "REFUS_HORS_CADRE"]);
    expect(readMarker("REPONSE\nUne facture est émise sous 5 jours ouvrés [P1].")).toEqual({
      marker: "REPONSE",
      rest: "Une facture est émise sous 5 jours ouvrés [P1].",
    });
    expect(readMarker("REFUS_INFO_ABSENTE\nTexte du modèle.")).toEqual({ marker: "REFUS_INFO_ABSENTE", rest: "Texte du modèle." });
    expect(readMarker("REFUS_HORS_CADRE")).toEqual({ marker: "REFUS_HORS_CADRE", rest: "" });
  });

  it("tolérance : espaces autour, casse, * ou ** autour du mot, fin de ligne \\r\\n", () => {
    expect(readMarker("**reponse**  \nTexte [P1].")).toEqual({ marker: "REPONSE", rest: "Texte [P1]." });
    expect(readMarker("  Reponse\t\nTexte")?.marker).toBe("REPONSE");
    expect(readMarker("*REFUS_HORS_CADRE*")?.marker).toBe("REFUS_HORS_CADRE");
    expect(readMarker(" **Refus_Info_Absente** \r\nx")).toEqual({ marker: "REFUS_INFO_ABSENTE", rest: "x" });
  });

  it("marqueur absent : null", () => {
    expect(readMarker("Voici la réponse : 5 jours ouvrés [P1].")).toBeNull();
    expect(readMarker("")).toBeNull();
    expect(readMarker("\nREPONSE\nTexte")).toBeNull();
  });

  it.each([
    "REPONSE : voici la réponse [P1].",
    "REFUS",
    "REPONSE.",
    "REPONSE:",
    "« REPONSE »",
    "`REPONSE`",
    "RÉPONSE",
    "REPONSE REFUS_HORS_CADRE",
    "**REPONSE*",
    "***REPONSE***",
    "REFUS-HORS-CADRE",
    "Réponse : REPONSE",
  ])("marqueur invalide « %s » : null", (line) => {
    expect(readMarker(`${line}\nTexte [P1].`)).toBeNull();
  });

  it("REPONSE suivi d'un texte vide : marqueur lu, texte vide (refusé par chat)", () => {
    expect(readMarker("REPONSE\n")).toEqual({ marker: "REPONSE", rest: "" });
    expect(readMarker("REPONSE")).toEqual({ marker: "REPONSE", rest: "" });
  });

  it(`première ligne de ${MARKER_MAX_LENGTH} caractères au plus (tampon de la diffusion, 5.5)`, () => {
    expect(MARKER_MAX_LENGTH).toBe(40);
    const padded = (marker: string, length: number) => `${marker}${" ".repeat(length - marker.length)}`;
    expect(readMarker(`${padded("REPONSE", MARKER_MAX_LENGTH)}\nTexte`)?.marker).toBe("REPONSE");
    expect(readMarker(`${padded("REPONSE", MARKER_MAX_LENGTH + 1)}\nTexte`)).toBeNull();
    expect(readMarker(padded("REFUS_HORS_CADRE", MARKER_MAX_LENGTH + 1))).toBeNull();
  });
});
