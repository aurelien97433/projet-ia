import { describe, expect, it } from "vitest";
import { PUBLIC_PATHS, SIGN_IN_PATH, accessRedirect } from "@/lib/auth/routes";
import { DEFAULT_NEXT_PATH, safeNextPath } from "@/lib/auth/safe-redirect";

describe("safeNextPath : chemin interne uniquement", () => {
  it.each([
    ["/", "/"],
    ["/bibliotheque", "/bibliotheque"],
    ["/bibliotheque?categorie=rh&page=2", "/bibliotheque?categorie=rh&page=2"],
    ["/documents/123#passage-4", "/documents/123#passage-4"],
    ["/recherche?q=d%C3%A9lai%20de%20paiement", "/recherche?q=d%C3%A9lai%20de%20paiement"],
    ["/assistant/./abc", "/assistant/abc"],
  ])("accepte %j", (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });

  it.each([
    // URL absolues et schémas
    "https://exemple.com",
    "http://exemple.com/bibliotheque",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "exemple.com",
    "bibliotheque",
    // Chemins relatifs au protocole et barres obliques inverses
    "//exemple.com",
    "///exemple.com",
    "/\\exemple.com",
    "\\\\exemple.com",
    "/\\/exemple.com",
    // Caractères de contrôle (supprimés par l'analyseur d'URL, ils reformeraient « //hôte »)
    "/\t/exemple.com",
    "/\n/exemple.com",
    "/\r\n/exemple.com",
    "\u0000/bibliotheque",
    // Variantes encodées, une ou plusieurs fois
    "%2F%2Fexemple.com",
    "/%2F%2Fexemple.com",
    "/%2fexemple.com",
    "/%5Cexemple.com",
    "/%5cexemple.com",
    "%5C%5Cexemple.com",
    "/%252F%252Fexemple.com",
    "/%25252F%25252Fexemple.com",
    "%68ttps://exemple.com",
    "https%3A%2F%2Fexemple.com",
    "/%09/exemple.com",
    "/%0A/exemple.com",
    "/bibliotheque?retour=%5C",
    // Normalisation qui produirait « //hôte »
    "/a/..//exemple.com",
    "/./%2F/exemple.com",
    // Encodage invalide ou excessif, valeurs vides ou d'un autre type
    "/%E0%A4%A",
    "/%",
    `/${"%25".repeat(10)}2F`,
    "",
    `/${"a".repeat(2048)}`,
    null,
    undefined,
    42,
    ["/bibliotheque"],
  ])("refuse %j et renvoie le Tableau de bord", (value) => {
    expect(safeNextPath(value)).toBe(DEFAULT_NEXT_PATH);
  });
});

describe("accessRedirect : protection des routes sans boucle", () => {
  it("ne redirige jamais une route /api/ : elle vérifie la session et répond en JSON", () => {
    expect(accessRedirect("/api/documents/abc/status", "", false)).toBeNull();
    expect(accessRedirect("/api/documents/abc/status", "", true)).toBeNull();
    expect(accessRedirect("/apiculture", "", false)).toContain("/connexion");
  });

  it.each(["/", "/bibliotheque", "/assistant", "/recherche", "/ajouter", "/route-inconnue"])(
    "Visiteur sur %s : redirigé vers /connexion",
    (path) => {
      const target = accessRedirect(path, "", false);
      expect(target?.startsWith(SIGN_IN_PATH)).toBe(true);
    },
  );

  it("conserve la page demandée, avec sa requête, dans le paramètre suite", () => {
    expect(accessRedirect("/bibliotheque", "?categorie=rh", false)).toBe(
      "/connexion?suite=%2Fbibliotheque%3Fcategorie%3Drh",
    );
    expect(accessRedirect("/", "", false)).toBe("/connexion");
  });

  it("la page demandée conservée repasse safeNextPath sans être altérée", () => {
    const target = new URL(accessRedirect("/bibliotheque", "?categorie=rh", false)!, "http://h.invalid");
    expect(safeNextPath(target.searchParams.get("suite"))).toBe("/bibliotheque?categorie=rh");
  });

  it.each(["/bibliotheque", "/"])("Collaborateur connecté sur %s : aucune redirection", (path) => {
    expect(accessRedirect(path, "", true)).toBeNull();
  });

  it.each(PUBLIC_PATHS)("Visiteur sur %s : aucune redirection (pas de boucle)", (path) => {
    expect(accessRedirect(path, "", false)).toBeNull();
    expect(accessRedirect(path, "?suite=%2Fbibliotheque", false)).toBeNull();
  });

  it.each(PUBLIC_PATHS)("Collaborateur connecté sur %s : renvoyé vers / qui n'est pas redirigé à son tour", (path) => {
    const target = accessRedirect(path, "", true);
    expect(target).toBe("/");
    expect(accessRedirect(target!, "", true)).toBeNull();
  });

  it("toute chaîne de redirections se termine en une étape au plus, avec ou sans session", () => {
    for (const signedIn of [false, true]) {
      for (const start of ["/", "/bibliotheque", ...PUBLIC_PATHS]) {
        const first = accessRedirect(start, "", signedIn);
        if (!first) continue;
        const url = new URL(first, "http://h.invalid");
        expect(accessRedirect(url.pathname, url.search, signedIn)).toBeNull();
      }
    }
  });
});
