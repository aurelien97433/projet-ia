import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { embed } from "../../supabase/functions/_shared/ai.ts";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from "../../supabase/functions/_shared/config.ts";
import { embeddingDeps, fakeVector } from "../../supabase/functions/_shared/fake-embeddings.ts";

// Vectorisation simulée (story 2.4) : vecteurs reproductibles, et rejet hors de la pile locale.
const LOCAL = "http://kong:8000";
const env: Record<string, string | undefined> = {};

const cosine = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const norm = (vector: number[]) => Math.sqrt(cosine(vector, vector));

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fakeVector", () => {
  it.each(["Bonjour", "Procédure de facturation", "???", "😀", "a b a b"])(
    "« %s » : dimension 1 536, nombres finis, norme 1",
    (text) => {
      const vector = fakeVector(text);
      expect(vector).toHaveLength(EMBEDDING_DIMENSION);
      expect(vector.every(Number.isFinite)).toBe(true);
      expect(norm(vector)).toBeCloseTo(1, 10);
    },
  );

  it("est déterministe, d'un appel à l'autre", () => {
    expect(fakeVector("Procédure de facturation")).toEqual(fakeVector("Procédure de facturation"));
  });

  it("garde une valeur figée : un changement casserait les futurs tests de recherche", () => {
    const nonZero = fakeVector("facturation").flatMap((value, index) => (value === 0 ? [] : [[index, value]]));
    expect(nonZero).toEqual([
      [17, -0.5],
      [160, -0.5],
      [283, 0.5],
      [1118, -0.5],
    ]);
  });

  it("deux textes qui partagent des mots sont plus proches que deux textes sans rapport", () => {
    const query = fakeVector("procédure de facturation des clients");
    const close = fakeVector("la facturation des clients suit une procédure");
    const far = fakeVector("gestion annuelle des congés payés");
    expect(cosine(query, close)).toBeGreaterThan(cosine(query, far));
  });
});

describe("embeddingDeps", () => {
  it("sans EMBEDDINGS_FAKE : vectorisation réelle, aucun journal", () => {
    env.SUPABASE_URL = LOCAL;
    expect(embeddingDeps("doc")).toBeUndefined();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("une autre valeur que 1 n'active rien", () => {
    env.SUPABASE_URL = LOCAL;
    env.EMBEDDINGS_FAKE = "true";
    expect(embeddingDeps("doc")).toBeUndefined();
  });

  it.each([
    ["le projet distant", "https://abcdefghijklmnopqrst.supabase.co"],
    ["un hôte qui commence par kong", "https://kong.exemple.test"],
    ["kong en sous-domaine", "https://exemple.kong.test"],
    ["kong dans le chemin", "https://exemple.test/kong"],
    ["kong en identifiant", "https://kong@exemple.test"],
    ["une URL invalide", "kong"],
    ["une URL absente", undefined],
  ])("EMBEDDINGS_FAKE avec %s : rejeté, vectorisation réelle, journal Error", (_label, url) => {
    env.EMBEDDINGS_FAKE = "1";
    env.SUPABASE_URL = url;
    expect(embeddingDeps("doc")).toBeUndefined();
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("embeddings_fake_rejected");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("rejetée, la vectorisation appelle bien le fournisseur réel", async () => {
    env.EMBEDDINGS_FAKE = "1";
    env.SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
    const provider = vi.fn(async () =>
      Response.json({ data: [{ index: 0, embedding: new Array(EMBEDDING_DIMENSION).fill(0.1) }] }),
    );
    await embed(["Bonjour"], { deps: { fetch: provider, apiKey: "cle", ...embeddingDeps("doc") } });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("pile locale : activation journalisée au niveau Info, sans clé ni réseau", async () => {
    env.EMBEDDINGS_FAKE = "1";
    env.SUPABASE_URL = LOCAL;
    const network = vi.fn();
    vi.stubGlobal("fetch", network);

    const texts = Array.from({ length: 97 }, (_, index) => `Passage numéro ${index}`);
    const { vectors, model } = await embed(texts, { deps: embeddingDeps("doc") });

    expect(network).not.toHaveBeenCalled();
    expect(vi.mocked(console.log).mock.calls.flat().join(" ")).toContain("embeddings_fake_active");
    expect(console.error).not.toHaveBeenCalled();
    expect(model).toBe(EMBEDDING_MODEL);
    expect(vectors).toHaveLength(97);
    expect(vectors[96]).toEqual(fakeVector(texts[96]));
  });
});
