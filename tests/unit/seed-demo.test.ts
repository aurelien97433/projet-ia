import { describe, expect, it, vi } from "vitest";
import {
  assertReports,
  confirmRemote,
  type DocumentReport,
  type ExistingState,
  formatPlan,
  loadFullSet,
  loadMiniSet,
  parseArguments,
  planAction,
  type SeedPlan,
  parseSeedEnv,
  requestIdFor,
  SeedError,
  targetHost,
  waitForReady,
} from "../../scripts/seed-demo";

// Logique du préchargement, sans réseau. Le script réel est testé sur Supabase local.
const KEY = "a".repeat(40);
const SECRET = "b".repeat(64);

const SERVICE_NAME = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
const SECRET_NAME = ["PROCESS", "DOCUMENT", "SECRET"].join("_");

function envText(overrides: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    SEED_SUPABASE_URL: "http://127.0.0.1:54321/",
    [SERVICE_NAME]: KEY,
    [SECRET_NAME]: SECRET,
    ...Object.fromEntries(
      ["DEMO_ACCOUNT_A", "DEMO_ACCOUNT_B", "MEASURE_ACCOUNT_1", "MEASURE_ACCOUNT_2", "MEASURE_ACCOUNT_3"].flatMap((name, index) => [
        [`${name}_EMAIL`, `compte${index}@exemple.test`],
        [`${name}_PASSWORD`, `mot-de-passe-${index}`],
      ]),
    ),
    ...overrides,
  };
  return Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");
}

const failure = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SeedError);
    return (error as Error).message;
  }
  throw new Error("aucun échec");
};

describe("parseSeedEnv", () => {
  it("lit les variables, retire la barre finale de l'URL", () => {
    const config = parseSeedEnv(envText());
    expect(config.url).toBe("http://127.0.0.1:54321");
    expect(config.serviceRoleKey).toBe(KEY);
    expect(config.processSecret).toBe(SECRET);
    expect(config.demoA.email).toBe("compte0@exemple.test");
    expect(config.demoB.password).toBe("mot-de-passe-1");
    expect(config.measure).toHaveLength(3);
  });

  it("nomme chaque variable absente ou vide, sans afficher de valeur", () => {
    const message = failure(() => parseSeedEnv(envText({ [SECRET_NAME]: "", DEMO_ACCOUNT_B_PASSWORD: "  " })));
    expect(message).toContain(SECRET_NAME);
    expect(message).toContain("DEMO_ACCOUNT_B_PASSWORD");
    expect(message).not.toContain(KEY);
  });

  it("refuse le nom de la variable collé comme valeur, sans l'afficher comme valeur", () => {
    const message = failure(() => parseSeedEnv(envText({ [SECRET_NAME]: SECRET_NAME })));
    expect(message).toContain("ressemble au nom d'une variable");
    expect(message).toContain("valeur masquée");
  });

  it("refuse deux Comptes à la même adresse", () => {
    const message = failure(() => parseSeedEnv(envText({ DEMO_ACCOUNT_B_EMAIL: "COMPTE0@exemple.test" })));
    expect(message).toContain("même adresse");
  });

  it("refuse un secret trop court", () => {
    const message = failure(() => parseSeedEnv(envText({ [SERVICE_NAME]: "cle-courte" })));
    expect(message).toContain("moins de 32 caractères");
    expect(message).not.toContain("cle-courte");
  });
});

describe("targetHost", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321"])("%s : local, sans --remote", (url) => {
    expect(targetHost(url, false)).toBe(new URL(url).hostname);
  });

  it("projet distant : refusé sans --remote, accepté avec", () => {
    const url = "https://abcdefghijklmnopqrst.supabase.co";
    expect(failure(() => targetHost(url, false))).toContain("--remote");
    expect(targetHost(url, true)).toBe("abcdefghijklmnopqrst.supabase.co");
  });

  it("projet distant en http : refusé, même avec --remote", () => {
    expect(failure(() => targetHost("http://abcdefghijklmnopqrst.supabase.co", true))).toContain("https");
  });

  it("URL invalide : échec clair", () => {
    expect(failure(() => targetHost("pas une url", true))).toContain("SEED_SUPABASE_URL");
  });
});

describe("parseArguments", () => {
  it.each([
    [["--mini", "--env-file", "autre"]],
    [["--mini", "--seed-file=autre"]],
    [["--mini", "--seed-file"]],
    [["--mini", "--distant"]],
  ])("refuse une option inconnue ou incomplète : %j", (argv) => {
    expect(failure(() => parseArguments(argv))).toContain("option non reconnue ou incomplète");
  });

  // Story 7.1b : sans --mini, Jeu complet.
  it("--mini facultatif ; lit --remote, --yes et --seed-file", () => {
    expect(parseArguments([])).toEqual({ mini: false, remote: false, yes: false, seedFile: ".env.seed" });
    expect(parseArguments(["--mini"])).toEqual({ mini: true, remote: false, yes: false, seedFile: ".env.seed" });
    expect(parseArguments(["--remote", "--yes", "--seed-file", "autre"])).toEqual({ mini: false, remote: true, yes: true, seedFile: "autre" });
  });
});

// Story 7.1b : action décidée par une seule fonction, pour le plan et pour l'écriture.
describe("planAction", () => {
  const document = { title: "Procédure congés et absences", category: "procedure" };
  const state = (overrides: Partial<ExistingState> = {}): ExistingState => ({
    title: document.title,
    category: document.category,
    status: "ready",
    sameText: true,
    passages: 3,
    effectiveStatus: "ready",
    ...overrides,
  });

  it.each<[string, ExistingState | null, string]>([
    ["absent", null, "créé"],
    ["prêt, même texte, Passages", state(), "déjà prêt"],
    ["prêt, autre titre", state({ title: "Ancien titre" }), "titre ou Catégorie à jour"],
    ["prêt, texte modifié", state({ sameText: false }), "mis à jour"],
    ["en erreur, même texte", state({ status: "error", effectiveStatus: "error" }), "repris"],
    ["prêt sans Passage", state({ passages: 0 }), "repris"],
    ["en cours vivant, même texte", state({ status: "processing", effectiveStatus: "processing" }), "déjà en cours"],
    ["en cours vivant, texte modifié", state({ status: "processing", effectiveStatus: "processing", sameText: false }), "mis à jour"],
    ["en cours expiré", state({ status: "processing", effectiveStatus: "error" }), "repris"],
  ])("%s → %s", (_, existing, expected) => {
    expect(planAction(document, existing)).toBe(expected);
  });
});

describe("formatPlan", () => {
  const plan: SeedPlan = {
    accounts: [
      { label: "Auteur A (Claire Martin)", exists: true },
      { label: "Compte de mesure 3", exists: false },
    ],
    documents: [
      { title: "Procédure congés et absences", author: "Karim Benali", action: "mis à jour" },
      { title: "FAQ du support interne", author: "Karim Benali", action: "créé" },
      { title: "FAQ comptabilité", author: "Claire Martin", action: "déjà prêt" },
    ],
    outside: [{ title: "Note personnelle", author: "Camille", status: "ready" }],
  };

  it("cible, Comptes, résumé et action par Document, Documents hors manifeste jamais supprimés", () => {
    const text = formatPlan(plan, "lkjjtcfegplipalraqml.supabase.co (Jeu complet)").join("\n");
    expect(text).toContain("rien n'est encore écrit");
    expect(text).toContain("cible : lkjjtcfegplipalraqml.supabase.co (Jeu complet)");
    expect(text).toContain("Documents du Jeu (3) : 1 à créer, 1 inchangé, 1 texte mis à jour (retraité)");
    expect(text).toContain("Procédure congés et absences (Karim Benali) : texte mis à jour (retraité)");
    expect(text).toContain("Compte de mesure 3 : à créer");
    expect(text).toContain("Documents hors manifeste (1, affichés seulement, jamais supprimés)");
    expect(text).toContain("Note personnelle (Camille, ready)");
    expect(text).not.toMatch(/@/);
  });

  it("aucun Document hors manifeste : dit explicitement", () => {
    expect(formatPlan({ ...plan, outside: [] }, "h").join("\n")).toContain("Documents hors manifeste : aucun.");
  });
});

describe("confirmRemote", () => {
  it("--yes : confirmé sans question", async () => {
    const ask = vi.fn();
    await expect(confirmRemote(true, false, ask)).resolves.toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it("« oui » seulement (casse et espaces ignorés) ; toute autre réponse refuse", async () => {
    await expect(confirmRemote(false, true, async () => " Oui ")).resolves.toBe(true);
    for (const answer of ["", "o", "yes", "non"]) await expect(confirmRemote(false, true, async () => answer)).resolves.toBe(false);
  });

  it("sans terminal interactif ni --yes : refus explicite, aucune question", async () => {
    const ask = vi.fn();
    await expect(confirmRemote(false, false, ask)).rejects.toThrow("--yes");
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("loadFullSet", () => {
  it("15 Documents, le mini Jeu en sous-ensemble avec les mêmes clés, titres et textes", () => {
    const full = loadFullSet();
    const mini = loadMiniSet();
    expect(full.documents).toHaveLength(15);
    for (const document of mini.documents) {
      const same = full.documents.find((candidate) => candidate.key === document.key);
      expect(same, document.key).toEqual(document);
    }
  });
});

describe("requestIdFor", () => {
  it("UUID valide et déterministe, différent pour chaque clé", () => {
    const id = requestIdFor("procedure-facturation");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(requestIdFor("procedure-facturation")).toBe(id);
    expect(requestIdFor("faq-comptabilite")).not.toBe(id);
  });
});

describe("waitForReady", () => {
  const options = { timeoutMs: 50, pollMs: 5 };

  it("attend le passage à prêt", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ status: "processing", errorKind: null })
      .mockResolvedValue({ status: "ready", errorKind: null });
    await waitForReady("Note", read, options);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("Document en erreur : échec explicite, Document nommé", async () => {
    await expect(waitForReady("Note", async () => ({ status: "error", errorKind: "temporary" }), options)).rejects.toThrow(
      "« Note » est passé en erreur (temporary)",
    );
  });

  it("délai dépassé : échec explicite", async () => {
    await expect(waitForReady("Note", async () => ({ status: "processing", errorKind: null }), options)).rejects.toThrow(
      "« Note » n'est pas prêt",
    );
  });
});

describe("assertReports", () => {
  const report: DocumentReport = {
    key: "note",
    title: "Note",
    action: "créé",
    status: "ready",
    passages: 2,
    model: "text-embedding-3-small",
    realEmbeddings: true,
    durationMs: 10,
  };

  it("accepte des Documents prêts, avec Passages et vrais vecteurs", () => {
    expect(() => assertReports([report], true)).not.toThrow();
  });

  it.each([
    ["pas prêt", { status: "error" }, "n'est pas prêt"],
    ["sans Passage", { passages: 0 }, "aucun Passage"],
    ["autre modèle", { model: "autre" }, "modèle attendu"],
  ])("%s : refusé", (_label, change, message) => {
    expect(() => assertReports([{ ...report, ...change }], false)).toThrow(message);
  });

  it("vecteurs simulés : refusés en distant, acceptés en local", () => {
    const fake = { ...report, realEmbeddings: false };
    expect(() => assertReports([fake], true)).toThrow("vrais vecteurs");
    expect(() => assertReports([fake], false)).not.toThrow();
  });
});
