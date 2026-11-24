import { describe, expect, it } from "vitest";
import {
  API_ROUTES,
  browserSecretValues,
  buildSecurityReport,
  evaluateSm6,
  evaluateUnauthenticated,
  extractStaticPaths,
  isSecurityPassed,
  listApiRoutes,
  readAppOrigin,
  redact,
  routeRequest,
  scanBrowserFile,
  seedValuesToRedact,
  SM6_MARK,
  type SecurityReportInput,
  type Sm6Observations,
} from "../../scripts/test-security-live";

// test:security:live (story 7.3) : évaluation des réponses, rapport sans secret, liste des Route
// Handlers. Aucun appel réseau : le script lui-même n'est lancé que par l'utilisateur.

const UNAUTH = { error: { code: "UNAUTHENTICATED", message: "Votre session a expiré.", retryable: false } };

const okObservations: Sm6Observations = {
  noteReady: true,
  bReadsNote: true,
  bFindsNote: true,
  bUpdate: { error: null, rows: 0 },
  bDelete: { error: null, rows: 0 },
  noteUnchanged: true,
  aConversations: 4,
  aMessages: 9,
  bConversations: 0,
  bMessages: 0,
};

function passingInput(): SecurityReportInput {
  return {
    date: new Date("2026-11-24T10:00:00Z"),
    sm6: evaluateSm6(okObservations),
    sm6Error: null,
    cleanup: { noteRemaining: 0, markedLeft: 0, error: null },
    unauthenticated: API_ROUTES.map(({ route, method }) => evaluateUnauthenticated(route, method, 401, UNAUTH)),
    browser: { files: 12, findings: [], failedFetches: 0, passed: true },
    browserError: null,
  };
}

describe("Route Handlers", () => {
  it("la liste testée est exactement celle de src/app/api (9 routes, sans « quota »)", () => {
    expect(API_ROUTES.map((r) => r.route).sort()).toEqual(listApiRoutes());
    expect(API_ROUTES).toHaveLength(9);
    expect(API_ROUTES.some((r) => r.route.includes("quota"))).toBe(false);
  });

  it("adresse appelée : identifiant aléatoire à la place de [id], corps JSON pour les POST", () => {
    const status = routeRequest("documents/[id]/status", "GET");
    expect(status.path).toMatch(/^\/api\/documents\/[0-9a-f-]{36}\/status$/);
    expect(status.body).toBeUndefined();
    expect(routeRequest("documents/statuses", "GET").path).toMatch(/\?ids=[0-9a-f-]{36}$/);
    expect(JSON.parse(routeRequest("search", "POST").body!)).toHaveProperty("query");
    expect(JSON.parse(routeRequest("documents/[id]/summary", "POST").body!)).toEqual({});
  });
});

describe("appels sans session", () => {
  it("conforme : 401, UNAUTHENTICATED, rien d'autre que l'erreur", () => {
    expect(evaluateUnauthenticated("chat", "POST", 401, UNAUTH).passed).toBe(true);
  });

  it.each([
    ["statut 200", 200, UNAUTH],
    ["redirection", 307, null],
    ["autre code", 401, { error: { code: "INTERNAL", message: "x", retryable: true } }],
    ["donnée en plus du corps d'erreur", 401, { ...UNAUTH, documents: [] }],
    ["donnée dans l'erreur", 401, { error: { ...UNAUTH.error, userId: "x" } }],
    ["corps illisible", 401, null],
    ["tableau", 401, []],
  ])("non conforme : %s", (_label, status, body) => {
    expect(evaluateUnauthenticated("documents", "GET", status as number, body).passed).toBe(false);
  });
});

describe("SM-6", () => {
  it("trois critères conformes", () => {
    expect(evaluateSm6(okObservations).map((c) => c.passed)).toEqual([true, true, true]);
  });

  it("refus par erreur accepté comme 0 ligne, code consigné dans le détail", () => {
    const criteria = evaluateSm6({ ...okObservations, bUpdate: { error: "42501", rows: 0 }, bDelete: { error: "PGRST301", rows: 0 } });
    expect(criteria[1].passed).toBe(true);
    expect(criteria[1].detail).toContain("refus (code 42501)");
    expect(criteria[1].detail).toContain("refus (code PGRST301)");
  });

  it("refus par erreur mais Note changée : non conforme (la Note relue reste la preuve)", () => {
    expect(evaluateSm6({ ...okObservations, bUpdate: { error: "42501", rows: 0 }, noteUnchanged: false })[1].passed).toBe(false);
  });

  it.each<[string, Partial<Sm6Observations>, number]>([
    ["B ne retrouve pas la Note", { bFindsNote: false }, 0],
    ["Note pas prête", { noteReady: false }, 0],
    ["B modifie la Note", { bUpdate: { error: null, rows: 1 } }, 1],
    ["B supprime la Note", { bDelete: { error: null, rows: 1 } }, 1],
    ["Note changée", { noteUnchanged: false }, 1],
    ["B voit la Conversation", { bConversations: 1 }, 2],
    ["B voit un message", { bMessages: 2 }, 2],
    ["lecture illisible", { bMessages: null }, 2],
    ["succès vide : A n'a aucune Conversation", { aConversations: 0, aMessages: null }, 2],
    ["succès vide : A n'a aucun message", { aMessages: 0 }, 2],
    ["Conversations de A illisibles", { aConversations: null }, 2],
  ])("échec : %s", (_label, change, index) => {
    expect(evaluateSm6({ ...okObservations, ...change })[index].passed).toBe(false);
  });
});

describe("code envoyé au navigateur", () => {
  it("chemins /_next/static/ extraits du HTML et des morceaux (barres échappées comprises), sans doublon", () => {
    const html =
      '<script src="/_next/static/chunks/a1.js"></script><link href="/_next/static/css/b2.css"/>' +
      'self.__next_f.push(["\\/_next\\/static\\/chunks\\/c3.js","/_next/static/chunks/a1.js"]) /_next/static/media/f.woff2';
    expect(extractStaticPaths(html).sort()).toEqual(["/_next/static/chunks/a1.js", "/_next/static/chunks/c3.js", "/_next/static/css/b2.css"]);
  });

  it("constats : adresse d'OpenAI, nom d'un secret, clé construite à l'exécution, valeur de .env.seed ; jamais la valeur", () => {
    const fakeKey = ["sk", "proj", "x".repeat(30)].join("-");
    const text = `fetch("https://api.openai.com/v1")\nconst k="${fakeKey}"\nSUPABASE_SERVICE_ROLE_KEY\nmotdepasse-demo-123`;
    const findings = scanBrowserFile("/_next/static/chunks/x.js", text, ["motdepasse-demo-123"]);
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain("adresse d'OpenAI");
    expect(kinds).toContain("clé OpenAI");
    expect(kinds).toContain("nom d'un secret");
    expect(kinds).toContain("valeur d'un secret de l'environnement");
    expect(JSON.stringify(findings)).not.toContain(fakeKey);
  });

  it("code ordinaire : aucun constat", () => {
    expect(scanBrowserFile("/connexion", "<html><body>Connexion</body></html>", ["motdepasse-demo-123"])).toEqual([]);
  });

  it("valeurs cherchées : celles de .env.seed, sauf l'URL Supabase (publique) et l'URL de production", () => {
    const seed = "SEED_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\nUJ2_LIVE_URL=https://prod.exemple.test\nDEMO_ACCOUNT_A_PASSWORD=motdepasse-a-123\nX=court";
    expect(browserSecretValues(seed)).toEqual(["motdepasse-a-123"]);
  });
});

describe("rapport", () => {
  it("réussi seulement si tout est conforme", () => {
    expect(isSecurityPassed(passingInput())).toBe(true);
    expect(isSecurityPassed({ ...passingInput(), cleanup: { ...passingInput().cleanup, markedLeft: 1 } })).toBe(false);
    expect(isSecurityPassed({ ...passingInput(), cleanup: { ...passingInput().cleanup, noteRemaining: null } })).toBe(false);
    expect(isSecurityPassed({ ...passingInput(), sm6Error: "interrompu" })).toBe(false);
    expect(isSecurityPassed({ ...passingInput(), unauthenticated: passingInput().unauthenticated.slice(1) })).toBe(false);
    expect(isSecurityPassed({ ...passingInput(), browser: null, browserError: "page en erreur" })).toBe(false);
  });

  it("contenu : trois critères SM-6, 9 routes, écart « quota », nettoyage, portée du code envoyé, aucune Conversation créée", () => {
    const report = buildSecurityReport(passingInput());
    expect(report).toContain("Résultat : réussi");
    expect(report).toContain("## SM-6");
    expect(report.match(/^\| [123] \|/gm)).toHaveLength(3);
    expect(report.match(/^\| \/api\//gm)).toHaveLength(9);
    expect(report).toContain("« quota »");
    expect(report).toContain(`Documents « ${SM6_MARK} » restants (tous Auteurs, contrôle final) : 0`);
    expect(report).not.toContain("NON supprimée");
    expect(report).toContain("aucune Conversation créée, 0 unité");
    expect(report).toContain("Portée : la page /connexion");
    expect(report).not.toMatch(/https?:\/\//);
  });

  it("aucun secret, e-mail, jeton ni URL de production : valeurs de .env.seed masquées", () => {
    const seed = [
      "SEED_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co",
      "UJ2_LIVE_URL=https://nexamind-prod.exemple.test",
      "DEMO_ACCOUNT_A_EMAIL=demo.a@exemple.test",
      "DEMO_ACCOUNT_A_PASSWORD=motdepasse-a-123",
    ].join("\n");
    const values = seedValuesToRedact(seed);
    const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9", "signature"].join(".");
    const text = `incident chez demo.a@exemple.test sur https://nexamind-prod.exemple.test/api (nexamind-prod.exemple.test) motdepasse-a-123 ${jwt}`;
    const output = redact(text, values);
    for (const forbidden of ["demo.a@exemple.test", "nexamind-prod.exemple.test", "motdepasse-a-123", jwt]) expect(output).not.toContain(forbidden);
    const report = redact(buildSecurityReport({ ...passingInput(), sm6Error: text }), values);
    expect(report).not.toContain("demo.a@exemple.test");
    expect(report).not.toContain("nexamind-prod");
  });

  it("URL de production : https exigé", () => {
    expect(readAppOrigin({ UJ2_LIVE_URL: "https://prod.exemple.test/chemin" })).toBe("https://prod.exemple.test");
    expect(() => readAppOrigin({ UJ2_LIVE_URL: "http://prod.exemple.test" })).toThrow(/https/);
    expect(() => readAppOrigin({})).toThrow(/UJ2_LIVE_URL/);
  });
});
