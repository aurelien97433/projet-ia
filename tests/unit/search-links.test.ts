import { describe, expect, it } from "vitest";
import { parseSearchQueryParam, resultHref, searchHref } from "@/lib/search-links";

const ID = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";
const result = (documentId: string, start: number, end: number) => ({
  documentId,
  passage: { id: "p", start, end, content: "Passage" },
});

describe("parseSearchQueryParam", () => {
  it("Requête valide : espaces retirés aux extrémités", () => {
    expect(parseSearchQueryParam("  organisation des congés ")).toEqual({
      query: "organisation des congés",
      fieldValue: "organisation des congés",
    });
  });

  it.each([null, "", "   ", "\n\t"])("absente ou vide (%j) : état initial, champ vide", (raw) => {
    expect(parseSearchQueryParam(raw)).toEqual({ query: null, fieldValue: "" });
  });

  it("500 caractères : Requête lancée ; 501 : état initial, champ pré-rempli des 500 premiers", () => {
    expect(parseSearchQueryParam("a".repeat(500)).query).toBe("a".repeat(500));
    expect(parseSearchQueryParam(`${"b".repeat(500)}c`)).toEqual({ query: null, fieldValue: "b".repeat(500) });
  });
});

describe("searchHref", () => {
  it("encode la Requête dans ?q= (espaces, accents, &, #, ?, /)", () => {
    const href = searchHref(" congés & absences #1 ?/ ")!;
    expect(href.startsWith("/recherche?q=")).toBe(true);
    expect(new URL(href, "http://x").searchParams.get("q")).toBe("congés & absences #1 ?/");
    expect(new URL(href, "http://x").searchParams.getAll("q")).toHaveLength(1);
  });

  it("Requête vide ou faite d'espaces : aucune adresse", () => {
    expect(searchHref("")).toBeNull();
    expect(searchHref("   ")).toBeNull();
  });
});

describe("resultHref", () => {
  it("lien vers la page Document au Passage, actif 0, depuis=recherche", () => {
    const href = resultHref(result(ID, 120, 340))!;
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe(`/documents/${ID}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ passages: "120-340", actif: "0", depuis: "recherche" });
  });

  it.each([
    ["identifiant non UUID", result("d1", 0, 10)],
    ["identifiant avec chemin", result(`${ID}/../x`, 0, 10)],
    ["identifiant avec paramètres", result(`${ID}?depuis=x`, 0, 10)],
    ["début négatif", result(ID, -1, 10)],
    ["fin avant le début", result(ID, 10, 10)],
    ["position décimale", result(ID, 1.5, 10)],
    ["position infinie", result(ID, 0, Number.POSITIVE_INFINITY)],
  ])("%s : aucun lien", (_label, value) => {
    expect(resultHref(value)).toBeNull();
  });
});
