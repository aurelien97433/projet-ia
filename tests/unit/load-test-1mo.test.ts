import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES as APP_MAX_FILE_BYTES } from "@/lib/files";
import {
  buildLoadFile,
  buildLoadReport,
  checkCleanupCount,
  cliFailure,
  describeError,
  CONDITIONS,
  estimateCost,
  LOAD_TITLE,
  limitLabel,
  LoadTestError,
  APP_LIMIT_BYTES,
  MAX_FILE_BYTES,
  type Measure,
  parseArguments,
  parseSizes,
  proposal,
  SIZE_SQL,
  reportFileFor,
  sizeRange,
  sqlCommand,
  verdict,
} from "../../scripts/load-test-1mo";

// Test de charge 1 Mo (story 2.7) : fonctions pures du script. L'exécution réelle (pile locale par
// l'IA, projet distant par l'utilisateur) n'est jamais lancée par npm test.
const MB = 1_000_000;
const sizes = (database: number) => ({ database, documents: 1 * MB, passages: 2 * MB });
const measure = (overrides: Partial<Measure> = {}): Measure => ({
  kind: "txt",
  documentId: "11111111-1111-4111-8111-111111111111",
  fileBytes: 990_000,
  characters: 960_000,
  status: "ready",
  errorKind: null,
  errorMessage: null,
  durationMs: 2_400,
  passages: 1162,
  before: sizes(100 * MB),
  after: sizes(119 * MB),
  ...overrides,
});

describe("fichiers générés", () => {
  it.each(["txt", "md"] as const)(".%s par défaut : texte français de 90 000 à 100 000 octets UTF-8, fin de paragraphe", (kind) => {
    const file = buildLoadFile(kind);
    expect(file.bytes.length).toBeGreaterThanOrEqual(90_000);
    expect(file.bytes.length).toBeLessThanOrEqual(100_000);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    expect(file.characters).toBe(text.length);
    expect(text).toMatch(/[éèàç]/);
    expect(text.endsWith(".\n")).toBe(true);
    if (kind === "md") expect(text).toMatch(/^# Test de charge\n\n## Section 1\n\n/);
  });

  it("limite par défaut identique à celle de l'application (100 Ko) ; --size jusqu'à 1 000 000 ; cible hors bornes refusée", () => {
    expect(APP_LIMIT_BYTES).toBe(APP_MAX_FILE_BYTES);
    expect(APP_MAX_FILE_BYTES).toBe(100_000);
    expect(MAX_FILE_BYTES).toBe(1_000_000);
    expect(parseArguments(["--size=1000000"]).size).toBe(1_000_000);
    for (const kind of ["txt", "md"] as const) {
      const file = buildLoadFile(kind, sizeRange(1_000_000));
      expect(file.bytes.length).toBeGreaterThanOrEqual(990_000);
      expect(file.bytes.length).toBeLessThanOrEqual(1_000_000);
    }
    expect(() => buildLoadFile("txt", { min: 950_000, max: 1_000_000, target: 900_000 })).toThrow(LoadTestError);
  });
});

describe("conditions", () => {
  it("prêt en moins de 3 min, moins de 50 Mo ajoutés, base sous 400 Mo : conforme", () => {
    expect(verdict(measure())).toEqual({ ready: true, inTime: true, addedOk: true, totalOk: true, passes: true });
    expect(CONDITIONS).toEqual({ readyMs: 180_000, addedBytes: 50 * MB, totalBytes: 400 * MB });
  });

  it.each([
    ["en erreur", { status: "error", errorKind: "temporary", durationMs: 5_000 }, "ready"],
    ["attente dépassée", { status: "processing (attente dépassée)", durationMs: null }, "ready"],
    ["3 min exactement", { durationMs: 180_000 }, "inTime"],
    ["50 Mo ajoutés exactement", { after: sizes(150 * MB) }, "addedOk"],
    ["base à 400 Mo exactement", { before: sizes(399 * MB), after: sizes(400 * MB) }, "totalOk"],
  ] as const)("%s : non conforme (%s)", (_label, overrides, failed) => {
    const result = verdict(measure(overrides as Partial<Measure>));
    expect(result[failed]).toBe(false);
    expect(result.passes).toBe(false);
  });

  it("coût : tokens ≈ caractères / 4, à 0,02 $ par million", () => {
    expect(estimateCost(1_000_000)).toEqual({ tokens: 250_000, usd: 0.005 });
  });
});

describe("proposition (jamais appliquée)", () => {
  it("aucune si tout est conforme", () => {
    expect(proposal([measure(), measure({ kind: "md" })])).toBeNull();
  });

  it("chiffrée selon la condition échouée", () => {
    expect(proposal([measure({ durationMs: 240_000 })])).toContain("limite proposée 590000 octets");
    expect(proposal([measure({ after: sizes(200 * MB) })])).toContain("limite proposée 390000 octets");
    expect(proposal([measure({ before: sizes(390 * MB), after: sizes(409 * MB) })])).toContain("base à 409,0 Mo");
    expect(proposal([measure({ status: "error", errorKind: "temporary" })])).toContain("par lots");
  });
});

describe("nettoyage", () => {
  it("--cleanup : refus au-delà de 2 Documents sans --confirm ; exécution normale : jamais bloquée", () => {
    expect(() => checkCleanupCount(2, "cleanup", false)).not.toThrow();
    expect(() => checkCleanupCount(3, "cleanup", false)).toThrow(/--confirm/);
    expect(() => checkCleanupCount(3, "cleanup", true)).not.toThrow();
    expect(() => checkCleanupCount(3, "run", false)).not.toThrow();
    expect(LOAD_TITLE).toBe("Test de charge 1 Mo");
  });

  it("options : --remote, --cleanup, --confirm ; toute autre option refusée", () => {
    expect(parseArguments([])).toEqual({ remote: false, cleanupOnly: false, confirm: false, size: null });
    expect(parseArguments(["--remote", "--cleanup", "--confirm"])).toEqual({ remote: true, cleanupOnly: true, confirm: true, size: null });
    expect(() => parseArguments(["--remote=autre"])).toThrow(LoadTestError);
  });
});

describe("requêtes SQL et tailles", () => {
  it("requête constante, en lecture seule", () => {
    expect(SIZE_SQL).toMatch(/^select /i);
    expect(SIZE_SQL).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|truncate)\b|;|\$\{/i);
  });

  it("tailles lues ; valeur absente ou nulle refusée", () => {
    expect(parseSizes([{ database_bytes: "100", documents_bytes: 2, passages_bytes: "3" }])).toEqual({
      database: 100,
      documents: 2,
      passages: 3,
    });
    expect(() => parseSizes([])).toThrow(LoadTestError);
    expect(() => parseSizes([{ database_bytes: 0, documents_bytes: 1, passages_bytes: 1 }])).toThrow(LoadTestError);
  });
});

describe("rapport", () => {
  const report = (measures: Measure[]) =>
    buildLoadReport({
      host: "projet.supabase.co",
      account: "Compte de mesure 1 de .env.seed",
      date: new Date("2026-11-12T10:00:00Z"),
      measures,
      // Fichiers de 990 000 octets : mesure de la limite d'origine (1 Mo).
      size: 1_000_000,
      afterCleanup: sizes(120 * MB),
      remaining: 0,
    });

  it("conforme : tableau, tailles, journaux à relever, aucune proposition", () => {
    const text = report([measure(), measure({ kind: "md", before: sizes(119 * MB), after: sizes(131 * MB) })]);
    expect(text).toContain("**limite de 1 Mo confirmée**");
    expect(text).toContain("| .txt | 990000 | 960000 | 1162 | ready | 2,4 s | 19,0 Mo | 119,0 Mo |");
    expect(text).toContain("| Après nettoyage | 120,0 Mo |");
    expect(text).toContain("Documents de test restants après nettoyage : 0.");
    expect(text).toContain("| .txt | 11111111-1111-4111-8111-111111111111 | à relever |");
    expect(text).toContain("Aucune : les trois conditions sont réunies");
  });

  it("échec : message enregistré et proposition", () => {
    const text = report([measure({ status: "error", errorKind: "temporary", errorMessage: "Le traitement n'a pas pu aboutir." })]);
    expect(text).toContain("**au moins une condition échouée**");
    expect(text).toContain("- .txt : Le traitement n'a pas pu aboutir.");
    expect(text).toContain("par lots");
  });

  it("aucun secret, e-mail, jeton ni URL signée", () => {
    const text = report([measure()]);
    expect(text).not.toMatch(/@|eyJ|sb_secret|service_role|token=|Bearer|PROCESS_DOCUMENT_SECRET|password/i);
  });
});

describe("appel de la CLI (échec du 2026-11-12 : confirmation exigée hors terminal interactif)", () => {
  // Sortie réelle de `supabase db query --remote=…` sans --read-only, relevée sur le poste Windows.
  const consentRequired = JSON.stringify({
    target: { kind: "linked", project_ref: "lkjjtcfegplipalraqml", project_name: "projet-ia", environment: "production" },
    _tag: "Error",
    error: {
      code: "HostedMutationConsentRequiredError",
      message:
        "Confirmation required: Run a SQL statement (target: project projet-ia (lkjjtcfegplipalraqml) · production). This run can't ask because it is running in agent mode. Nothing was changed.",
      suggestion: "For a read-only statement, pass --read-only instead.",
    },
  });

  it("commande : --read-only toujours, --remote=<réf> seulement pour le projet distant, requête constante", () => {
    const remote = sqlCommand("lkjjtcfegplipalraqml");
    expect(remote).toContain(" db query --remote=lkjjtcfegplipalraqml --read-only --output-format json ");
    expect(remote.endsWith(`"${SIZE_SQL}"`)).toBe(true);
    const local = sqlCommand(null);
    expect(local).toContain(" db query --read-only --output-format json ");
    expect(local).not.toContain("--remote");
  });

  it("cause réelle affichée : code et message de l'erreur JSON de la CLI", () => {
    expect(cliFailure(consentRequired, "Target: project projet-ia (lkjjtcfegplipalraqml) · production\n", 1)).toBe(
      "HostedMutationConsentRequiredError : Confirmation required: Run a SQL statement (target: project projet-ia (lkjjtcfegplipalraqml) · production). This run can't ask because it is running in agent mode. Nothing was changed.",
    );
  });

  it("sortie non JSON : stderr sans la ligne « Target: » ; sinon le code de sortie", () => {
    expect(cliFailure("", "Target: local\nfailed to connect to postgres\n", 1)).toBe("failed to connect to postgres");
    expect(cliFailure("", "", 127)).toBe("code de sortie 127, sans message");
    expect(cliFailure("", "", null)).toBe("code de sortie inconnu, sans message");
  });

  it("aucun secret dans la cause affichée", () => {
    // Valeurs factices composées à l'exécution : check:secrets refuse toute forme de clé écrite telle quelle.
    const fakeKey = ["sb", "secret", "abcdef123456"].join("_");
    const fakeJwt = ["eyJhbGciOi", "eyJyb2xlIjoi", "c2lnbmF0dXJl"].join(".");
    const leaked = cliFailure(
      "",
      [
        "connexion à postgresql://postgres.abc:motdepasse@aws-0.pooler.supabase.com:6543/postgres refusée",
        `clé ${fakeKey} et jeton ${fakeJwt}`,
        "password=motdepasse token: abc123",
      ].join("\n"),
      1,
    );
    expect(leaked).not.toContain(fakeKey);
    expect(leaked).not.toContain(fakeJwt);
    expect(leaked).not.toMatch(/motdepasse|abc123/);
    expect(leaked).toContain("postgres://[masqué]");
  });
});

describe("describeError (message « undefined » du nettoyage, 2026-11-12)", () => {
  it.each([
    ["erreur Postgres", { code: "57014", message: "canceling statement due to statement timeout" }, "57014 : canceling statement due to statement timeout"],
    ["panne réseau sans code", { message: "TypeError: fetch failed" }, "TypeError: fetch failed"],
    ["délai dépassé sans code ni message", { name: "TimeoutError" }, "TimeoutError"],
    ["code vide", { code: "", message: "" }, "cause non précisée"],
    ["erreur absente", null, "cause non précisée"],
  ])("%s", (_label, error, expected) => {
    expect(describeError(error)).toBe(expected);
    expect(describeError(error)).not.toContain("undefined");
  });

  it("secrets masqués", () => {
    expect(describeError({ message: "échec postgresql://u:motdepasse@hote/base" })).not.toContain("motdepasse");
  });
});

describe("option --size (mesure de confirmation de l'option B, 2026-11-12)", () => {
  it("--size=300000 : deux fichiers de 290 000 à 300 000 octets, rapport distinct de celui de 1 Mo", () => {
    const args = parseArguments(["--remote", "--size=300000"]);
    expect(args).toEqual({ remote: true, cleanupOnly: false, confirm: false, size: 300_000 });
    const range = sizeRange(args.size);
    expect(range).toEqual({ min: 290_000, max: 300_000, target: 299_000 });
    for (const kind of ["txt", "md"] as const) {
      const file = buildLoadFile(kind, range);
      expect(file.bytes.length).toBeGreaterThanOrEqual(290_000);
      expect(file.bytes.length).toBeLessThanOrEqual(300_000);
    }
    expect(reportFileFor(300_000)).toBe(path.join("docs", "mesures", "charge-300000-octets.md"));
    expect(reportFileFor(null)).toBe(path.join("docs", "mesures", "charge-100000-octets.md"));
  });

  it("sans --size : limite en vigueur, fichiers de 90 000 à 100 000 octets", () => {
    expect(parseArguments([]).size).toBeNull();
    expect(sizeRange(null)).toEqual({ min: 90_000, max: 100_000, target: 99_000 });
  });

  it("rapport existant jamais écrasé : -2, -3…", () => {
    const base = path.join("docs", "mesures", "charge-100000-octets");
    const existing = new Set([`${base}.md`, `${base}-2.md`]);
    expect(reportFileFor(null, (file) => existing.has(file))).toBe(`${base}-3.md`);
    expect(reportFileFor(150_000, (file) => existing.has(file))).toBe(path.join("docs", "mesures", "charge-150000-octets.md"));
  });

  it.each(["--size=0", "--size=19999", "--size=1000001", "--size=abc", "--size=3e5", "--size="])("%s : refusé", (arg) => {
    expect(() => parseArguments([arg])).toThrow(LoadTestError);
  });

  it("titre du rapport selon la taille mesurée", () => {
    const text = buildLoadReport({
      host: "projet.supabase.co",
      account: "Compte de mesure 1 de .env.seed",
      date: new Date("2026-11-12T15:00:00Z"),
      measures: [measure({ fileBytes: 299_100 }), measure({ kind: "md", fileBytes: 298_700 })],
      afterCleanup: null,
      remaining: 0,
    });
    expect(text.split("\n")[0]).toBe("# Test de charge : fichiers de 298700 à 299100 octets (story 2.7)");
  });
});

describe("libellé de la limite confirmée", () => {
  it("1 Mo par défaut, sinon la taille demandée", () => {
    expect(limitLabel(null)).toBe("limite de 100 Ko");
    expect(limitLabel(100_000)).toBe("limite de 100 Ko");
    expect(limitLabel(1_000_000)).toBe("limite de 1 Mo");
    expect(limitLabel(300_000)).toBe("limite de 300000 octets");
    const text = buildLoadReport({
      host: "projet.supabase.co",
      account: "Compte de mesure 1 de .env.seed",
      date: new Date("2026-11-12T15:00:00Z"),
      measures: [measure({ fileBytes: 299_100 }), measure({ kind: "md", fileBytes: 298_700 })],
      size: 300_000,
      afterCleanup: null,
      remaining: 0,
    });
    expect(text).toContain("**limite de 300000 octets confirmée**");
    expect(text).not.toContain("1 Mo confirmée");
  });
});
