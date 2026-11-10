import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMBEDDING_MODEL, EMBEDDING_VERSION } from "../../supabase/functions/_shared/config.ts";
import { localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// match_passages (story 4.1a) sur Supabase local, avec des vecteurs contrôlés : chaque Passage est
// a·e_k + √(1−a²)·e_j, sa similarité cosinus avec e_k vaut exactement a. Les axes sont tirés au sort
// à chaque exécution, et le seuil élevé (≥ 0,8) écarte les Passages des autres tests (vecteurs
// simulés, dont aucune composante n'atteint ce niveau).
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const DIMENSION = 1536;
const SIGNATURE = "extensions.vector, double precision, integer, integer, text, integer";

const axis = Math.floor(Math.random() * (DIMENSION - 4));
const [K, J, EMPTY] = [axis, axis + 1, axis + 3];

function vector(values: Record<number, number>): string {
  const components = new Array<number>(DIMENSION).fill(0);
  for (const [index, value] of Object.entries(values)) components[Number(index)] = value;
  return `[${components.join(",")}]`;
}
const near = (similarity: number) => vector({ [K]: similarity, [J]: Math.sqrt(1 - similarity ** 2) });
const QUERY = vector({ [K]: 1 });

let admin: SupabaseClient;
let anon: SupabaseClient;
let author: SupabaseClient;
let userId: string;
const ids: Record<string, string> = {};

type PassageSeed = { similarity: number; ordinal?: number; textVersion?: number; model?: string; version?: number };

async function seedDocument(key: string, status: "ready" | "processing" | "error", passages: PassageSeed[], textVersion = 1) {
  const { data, error } = await author
    .from("documents")
    .insert({ title: `Doc ${key}`, category: "procedure", content_text: "Texte de test.", client_request_id: crypto.randomUUID() })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  ids[key] = data.id;
  const update = await admin
    .from("documents")
    .update({ status, text_version: textVersion, ...(status === "error" ? { error_kind: "temporary" } : {}) })
    .eq("id", data.id);
  if (update.error) throw new Error(`Mise à jour du Document impossible : ${update.error.message}`);

  const rows = passages.map((passage, index) => ({
    document_id: data.id,
    text_version: passage.textVersion ?? textVersion,
    ordinal: passage.ordinal ?? index,
    start_offset: index * 10,
    end_offset: index * 10 + 5,
    content: `Passage ${key}-${passage.ordinal ?? index}`,
    embedding: near(passage.similarity),
    embedding_model: passage.model ?? EMBEDDING_MODEL,
    embedding_version: passage.version ?? EMBEDDING_VERSION,
  }));
  const insert = await admin.from("passages").insert(rows);
  if (insert.error) throw new Error(`Création des Passages impossible : ${insert.error.message}`);
}

type Row = {
  document_id: string;
  title: string;
  category: string;
  passage_id: string;
  start_offset: number;
  end_offset: number;
  content: string;
  similarity: number;
};

async function match(
  client: SupabaseClient,
  { query = QUERY, min = 0.9, max = 5, perDocument = 1, model = EMBEDDING_MODEL, version = EMBEDDING_VERSION } = {},
) {
  return client.rpc("match_passages", {
    query_embedding: query,
    min_similarity: min,
    max_passages: max,
    max_per_document: perDocument,
    embedding_model: model,
    embedding_version: version,
  });
}

async function matched(options: Parameters<typeof match>[1] = {}): Promise<Row[]> {
  const { data, error } = await match(author, options);
  if (error) throw new Error(`match_passages a échoué : ${error.message}`);
  return data as Row[];
}

const keyOf = (documentId: string) => Object.entries(ids).find(([, id]) => id === documentId)?.[0] ?? "autre";

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  author = createClient(url, publishableKey, options);
  const { data, error } = await author.auth.signUp({ email: uniqueEmail("match"), password: PASSWORD });
  if (error || !data.user) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  userId = data.user.id;

  await seedDocument("deux", "ready", [{ similarity: 0.95 }, { similarity: 0.99 }]);
  await seedDocument("un", "ready", [{ similarity: 0.97 }]);
  await seedDocument("enCours", "processing", [{ similarity: 1 }]);
  await seedDocument("enErreur", "error", [{ similarity: 1 }]);
  await seedDocument(
    "ancien",
    "ready",
    [
      { similarity: 1, textVersion: 1, ordinal: 0 },
      { similarity: 1, model: "text-embedding-3-large", ordinal: 1 },
      { similarity: 1, version: EMBEDDING_VERSION + 1, ordinal: 2 },
    ],
    2,
  );
  await seedDocument("sousSeuil", "ready", [{ similarity: 0.85 }]);
  await seedDocument("egalA", "ready", [{ similarity: 0.93 }]);
  await seedDocument("egalB", "ready", [{ similarity: 0.93 }]);
}, 120_000);

afterAll(async () => {
  await admin.auth.admin.deleteUser(userId);
});

describe("match_passages", () => {
  it("Documents prêts seulement, 1 Passage par Document (le meilleur), similarité décroissante", async () => {
    const rows = await matched();
    // Similarités égales (0,93) : départage par identifiant de Document.
    const ties = ["egalA", "egalB"].sort((a, b) => (ids[a] < ids[b] ? -1 : 1));
    expect(rows.map((row) => keyOf(row.document_id))).toEqual(["deux", "un", ...ties]);
    expect(rows[0].content).toBe("Passage deux-1");
    expect(rows[0].similarity).toBeCloseTo(0.99, 6);
    expect(rows[1].similarity).toBeCloseTo(0.97, 6);
  });

  it("colonnes : Document, titre, Catégorie, Passage seul et positions", async () => {
    const [first] = await matched();
    expect(Object.keys(first).sort()).toEqual(
      ["category", "content", "document_id", "end_offset", "passage_id", "similarity", "start_offset", "title"].sort(),
    );
    expect(first).toMatchObject({ title: "Doc deux", category: "procedure", start_offset: 10, end_offset: 15 });
  });

  it("en cours, en erreur, ancienne version du texte, autre modèle ou autre version : jamais renvoyés", async () => {
    const keys = (await matched({ min: 0.5, max: 50 })).map((row) => keyOf(row.document_id));
    for (const excluded of ["enCours", "enErreur", "ancien"]) expect(keys).not.toContain(excluded);
  });

  it("modèle ou version demandés différents : seuls leurs Passages comptent", async () => {
    const large = await matched({ model: "text-embedding-3-large" });
    expect(large.map((row) => keyOf(row.document_id))).toEqual(["ancien"]);
    const v2 = await matched({ version: EMBEDDING_VERSION + 1 });
    expect(v2.map((row) => keyOf(row.document_id))).toEqual(["ancien"]);
  });

  it("seuil appliqué : 0,85 exclu à 0,9, inclus à 0,8", async () => {
    expect((await matched()).map((row) => keyOf(row.document_id))).not.toContain("sousSeuil");
    expect((await matched({ min: 0.8 })).map((row) => keyOf(row.document_id))).toContain("sousSeuil");
  });

  it("limite totale, puis plusieurs Passages par Document si demandé", async () => {
    expect((await matched({ max: 1 })).map((row) => row.content)).toEqual(["Passage deux-1"]);
    expect((await matched({ max: 3, perDocument: 2 })).map((row) => row.content)).toEqual([
      "Passage deux-1",
      "Passage un-0",
      "Passage deux-0",
    ]);
    expect(await matched({ max: 0 })).toEqual([]);
  });

  it("départage stable des similarités égales : ordre identique d'un appel à l'autre", async () => {
    const first = (await matched()).map((row) => row.document_id);
    for (let index = 0; index < 3; index += 1) expect((await matched()).map((row) => row.document_id)).toEqual(first);
  });

  it("hors base (aucun Passage proche) : aucune ligne", async () => {
    expect(await matched({ query: vector({ [EMPTY]: 1 }) })).toEqual([]);
  });

  it("vecteur d'une autre dimension : refusé", async () => {
    const { error } = await match(author, { query: "[1,0,0]" });
    expect(error).not.toBeNull();
  });

  it("Visiteur (anon) : appel refusé", async () => {
    const { data, error } = await match(anon);
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("droits : exécution réservée à authenticated, security invoker, search_path vide", () => {
    // Une seule ligne : la commande passe par le shell, qui coupe aux retours à la ligne sous Windows.
    const fn = `'public.match_passages(${SIGNATURE})'`;
    const [row] = localSqlRows(
      [
        `select has_function_privilege('anon', ${fn}, 'execute') as anon,`,
        `has_function_privilege('authenticated', ${fn}, 'execute') as authenticated,`,
        "p.prosecdef as definer, p.provolatile as volatility, p.proconfig as config,",
        "exists (select 1 from information_schema.routine_privileges r",
        "where r.routine_name = 'match_passages' and r.grantee = 'PUBLIC') as public",
        "from pg_proc p where p.proname = 'match_passages'",
      ].join(" "),
    );
    expect(row).toMatchObject({ anon: false, authenticated: true, definer: false, volatility: "s", public: false });
    expect(JSON.stringify(row.config)).toContain("search_path");
  });
});
