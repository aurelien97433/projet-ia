import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIBRARY_FILTERS,
  escapeLike,
  escapeRegex,
  libraryQueryString,
  parseLibraryQuery,
  parseStatusIds,
} from "@/lib/schemas/library";

const parse = (query: string) => parseLibraryQuery(new URLSearchParams(query));
const ID = "11111111-1111-4111-8111-111111111111";

describe("parseLibraryQuery", () => {
  it("sans paramètre : filtres par défaut (toutes les Catégories, plus récents d'abord)", () => {
    expect(parse("")).toEqual(DEFAULT_LIBRARY_FILTERS);
  });

  it("combinaison valide", () => {
    expect(parse("category=procedure&mine=true&search=%20FACTU%20&sort=oldest")).toEqual({
      category: "procedure",
      mine: true,
      search: "FACTU",
      sort: "oldest",
    });
  });

  it("recherche de 200 caractères acceptée, 201 refusée", () => {
    expect(parse(`search=${"a".repeat(200)}`)?.search).toHaveLength(200);
    expect(parse(`search=${"a".repeat(201)}`)).toBeNull();
  });

  it.each([
    ["Catégorie inconnue", "category=x"],
    ["tri inconnu", "sort=y"],
    ["mine non booléen", "mine=1"],
    ["paramètre répété", "category=faq&category=procedure"],
    ["Catégorie vide", "category="],
  ])("%s : refusé", (_label, query) => {
    expect(parse(query)).toBeNull();
  });

  it("l'Auteur ne vient jamais du client : un paramètre inconnu est ignoré", () => {
    expect(parse("author_id=autre&mine=false")).toEqual(DEFAULT_LIBRARY_FILTERS);
  });
});

describe("libraryQueryString", () => {
  it("seules les valeurs différentes du défaut sont envoyées, et relues à l'identique", () => {
    expect(libraryQueryString(DEFAULT_LIBRARY_FILTERS)).toBe("");
    const filters = { category: "faq", mine: true, search: "a&b=c %", sort: "oldest" } as const;
    expect(parseLibraryQuery(new URLSearchParams(libraryQueryString(filters)))).toEqual(filters);
  });
});

describe("échappement", () => {
  it("ilike : %, _ et \\ deviennent des caractères ordinaires", () => {
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
    expect(escapeLike("facture")).toBe("facture");
  });

  it("expression régulière : chaque caractère spécial est échappé", () => {
    expect(escapeRegex("a*b.(c)[d]+?^$|{}\\")).toBe("a\\*b\\.\\(c\\)\\[d\\]\\+\\?\\^\\$\\|\\{\\}\\\\");
  });
});

describe("parseStatusIds", () => {
  const ids = (query: string) => parseStatusIds(new URLSearchParams(query));

  it("UUID valides, doublons retirés", () => {
    expect(ids(`ids=${ID},${ID.toUpperCase()}`)).toEqual([ID]);
  });

  it("200 identifiants acceptés, 201 refusés", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`);
    expect(ids(`ids=${many(200).join(",")}`)).toHaveLength(200);
    expect(ids(`ids=${many(201).join(",")}`)).toBeNull();
  });

  it.each([
    ["absent", ""],
    ["vide", "ids="],
    ["identifiant invalide", `ids=${ID},abc`],
    ["paramètre répété", `ids=${ID}&ids=${ID}`],
  ])("%s : refusé", (_label, query) => {
    expect(ids(query)).toBeNull();
  });
});
