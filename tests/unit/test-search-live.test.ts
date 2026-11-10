import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReport,
  evaluateCase,
  isPublicKey,
  loadCases,
  LiveSearchError,
  resolveLiveTarget,
} from "../../scripts/test-search-live";

// npm run test:search:live (story 4.1a) : jamais lancé par les tests automatiques. Ici : cible
// exigée, refus de toute autre cible, rapport sans secret ni similarité.
const REF = "abcdefghijklmnopqrst";
const REMOTE = `https://${REF}.supabase.co`;
const PUBLISHABLE = "sb_publishable_exemple";
const jwt = (role: string) =>
  ["e30", Buffer.from(JSON.stringify({ role })).toString("base64url"), "signature"].join(".");
const valid = { linkedRef: REF, seedUrl: REMOTE, publicUrl: REMOTE, publicKey: PUBLISHABLE };

describe("resolveLiveTarget", () => {
  it("projet lié, en https, désigné par .env.seed et par la clé publique : cible acceptée", () => {
    expect(resolveLiveTarget(valid)).toEqual({ host: `${REF}.supabase.co`, url: REMOTE, publicKey: PUBLISHABLE });
  });

  it.each([
    ["aucun projet lié", { linkedRef: null }],
    ["Supabase local", { seedUrl: "http://127.0.0.1:54321" }],
    ["autre projet dans .env.seed", { seedUrl: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co" }],
    ["http", { seedUrl: `http://${REF}.supabase.co` }],
    ["URL illisible", { seedUrl: "pas une url" }],
    ["clé publique d'un autre projet", { publicUrl: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co" }],
    ["clé publique locale", { publicUrl: "http://127.0.0.1:54321" }],
    ["clé absente", { publicKey: undefined }],
    ["clé secrète", { publicKey: "sb_secret_exemple" }],
    ["clé service_role", { publicKey: jwt("service_role") }],
  ])("%s : refusée avant tout appel", (_, override) => {
    expect(() => resolveLiveTarget({ ...valid, ...override })).toThrow(LiveSearchError);
  });

  it("un refus ne cite jamais la clé", () => {
    // Valeur factice composée : check:secrets refuse tout motif de clé secrète écrit en clair.
    const marker = ["valeur", "a", "ne", "pas", "afficher"].join("_");
    expect(() => resolveLiveTarget({ ...valid, publicKey: ["sb", "secret", marker].join("_") })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(marker) }),
    );
  });

  it("clé publique : publiable ou ancienne clé anon seulement", () => {
    expect(isPublicKey(PUBLISHABLE)).toBe(true);
    expect(isPublicKey(jwt("anon"))).toBe(true);
    expect(isPublicKey(jwt("authenticated"))).toBe(false);
    expect(isPublicKey("abc")).toBe(false);
  });
});

describe("cas mesurés", () => {
  it("r1 à r6 avec leur Document attendu, puis s1 à s3 et la tarte aux pommes sans résultat", () => {
    const cases = loadCases();
    expect(cases.map((item) => item.id)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "s1", "s2", "s3", "tarte"]);
    expect(cases.slice(0, 6).every((item) => typeof item.expectedTitle === "string")).toBe(true);
    expect(cases.slice(6).every((item) => item.expectedTitle === null)).toBe(true);
    expect(cases.at(-1)!.query).toBe("recette de la tarte aux pommes");
  });

  it("rang compté sur les titres distincts, conforme dans les 3 premiers", () => {
    const pertinent = { id: "r1", query: "q", expectedTitle: "B" };
    expect(evaluateCase(pertinent, 200, ["A", "A", "B"], 10)).toMatchObject({ rank: 2, passed: true });
    expect(evaluateCase(pertinent, 200, ["A", "C", "D", "B"], 10)).toMatchObject({ rank: 4, passed: false });
    expect(evaluateCase(pertinent, 200, [], 10)).toMatchObject({ rank: null, passed: false });
    expect(evaluateCase(pertinent, 504, [], 10)).toMatchObject({ passed: false });
  });

  it("hors base : conforme seulement sans résultat", () => {
    const outOfBase = { id: "s1", query: "q", expectedTitle: null };
    expect(evaluateCase(outOfBase, 200, [], 10).passed).toBe(true);
    expect(evaluateCase(outOfBase, 200, ["A"], 10).passed).toBe(false);
    expect(evaluateCase(outOfBase, 401, [], 10).passed).toBe(false);
  });
});

describe("rapport", () => {
  const outcomes = [
    evaluateCase({ id: "r1", query: "émettre une facture", expectedTitle: "B" }, 200, ["B"], 812),
    evaluateCase({ id: "s1", query: "gâteau", expectedTitle: null }, 200, ["A"], 640),
  ];

  it("rang et durée par Requête, réserve en cas d'échec, sans similarité ni donnée sensible", () => {
    const report = buildReport(`${REF}.supabase.co`, outcomes, new Date("2026-11-10T12:00:00Z"));
    expect(report).toContain(`Cible : ${REF}.supabase.co`);
    expect(report).toContain("| r1 | émettre une facture | 1 (1 résultats) | 812 ms | oui |");
    expect(report).toContain("| s1 | gâteau | 1 | 640 ms | NON |");
    expect(report).toContain("réserve de la story 4.1a");
    expect(report).not.toMatch(/similarit(y|é) *[:=]? *0|@|sb_|eyJ|password|mot de passe/i);
  });

  it("le script n'utilise ni la clé service_role ni la clé OpenAI", () => {
    const source = readFileSync("scripts/test-search-live.ts", "utf8");
    expect(source).not.toMatch(/serviceRoleKey|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  });
});
