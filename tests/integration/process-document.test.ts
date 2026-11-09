import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";
import { buildMeasureText } from "../../scripts/generate-measure-note";
import { failProcessing } from "../../supabase/functions/_shared/processing.ts";
import { localProcessSecret, localSupabase, uniqueEmail } from "../support/local-supabase";

// Edge Function process-document réelle, servie par Supabase local (secret lu à l'exécution).
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const functionUrl = () => `${localSupabase().url}/functions/v1/process-document`;

let admin: SupabaseClient;
let author: SupabaseClient;
let userId: string;

type Doc = { id: string; attempt_id: string; status: string; updated_at: string };

async function newDocument(text = "Texte."): Promise<Doc> {
  const { data, error } = await author
    .from("documents")
    .insert({ title: "Note", category: "procedure", content_text: text, client_request_id: crypto.randomUUID() })
    .select("id, attempt_id, status, updated_at")
    .single();
  if (error || !data) throw new Error(`Création du Document de test impossible : ${error?.code}`);
  return data;
}

const row = async (id: string): Promise<Doc> =>
  (await admin.from("documents").select("id, attempt_id, status, updated_at").eq("id", id).single()).data!;

const call = (body: unknown, secret?: string) =>
  fetch(functionUrl(), {
    method: "POST",
    headers: secret === undefined ? {} : { Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });

const payload = (doc: Doc) => ({ document_id: doc.id, attempt_id: doc.attempt_id });

async function untilFinished(id: string, timeout = 10_000) {
  await vi.waitFor(async () => expect((await row(id)).status).not.toBe("processing"), { timeout, interval: 100 });
  return (await row(id)).status;
}

async function storedPassages(id: string) {
  const { data } = await admin
    .from("passages")
    .select("ordinal, start_offset, end_offset, content, embedding, embedding_model, embedding_version")
    .eq("document_id", id)
    .order("ordinal");
  return data!;
}

const storedText = async (id: string) =>
  (await admin.from("documents").select("content_text").eq("id", id).single()).data!.content_text as string;

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  author = createClient(url, publishableKey, options);
  const { data, error } = await author.auth.signUp({ email: uniqueEmail("fonction"), password: PASSWORD });
  if (error || !data.user) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  userId = data.user.id;
}, 60_000);

afterAll(async () => {
  await admin.auth.admin.deleteUser(userId);
});

// Lignes de journal de la fonction locale qui citent ce Document, dans l'ordre.
function functionLogs(documentId: string): string[] {
  const output = execSync("docker logs --since 2m supabase_edge_runtime_projet-ia 2>&1", { encoding: "utf8" });
  return output.split(/\r?\n/).filter((line) => line.includes(documentId));
}

describe("chaîne locale complète, avec vecteurs simulés", () => {
  it("texte non canonique : Document prêt, texte normalisé, positions exactes, 1 536 dimensions", async () => {
    const doc = await newDocument("  Première ligne.  \r\n\r\nDeuxie\u0300me ligne.\t\r\n");
    expect((await call(payload(doc), localProcessSecret())).status).toBe(202);
    expect(await untilFinished(doc.id)).toBe("ready");

    const text = await storedText(doc.id);
    expect(text).toBe("  Première ligne.\n\nDeuxième ligne.\n");
    const passages = await storedPassages(doc.id);
    expect(passages).toHaveLength(1);
    for (const passage of passages) {
      expect(text.slice(passage.start_offset, passage.end_offset)).toBe(passage.content);
      expect(passage.embedding_model).toBe("text-embedding-3-small");
      expect(passage.embedding_version).toBe(1);
      expect(JSON.parse(passage.embedding)).toHaveLength(1536);
    }
    expect(functionLogs(doc.id).join(" ")).toContain('"passages":1');
  });

  it("mode simulé actif, et journalisé clairement", async () => {
    const doc = await newDocument();
    await call(payload(doc), localProcessSecret());
    await untilFinished(doc.id);
    const output = functionLogs(doc.id).join(" ");
    expect(output).toContain("embeddings_fake_active");
    expect(output).not.toContain("embeddings_fake_rejected");
  });

  it("Document d'environ 60 000 caractères : prêt en moins d'une minute, Passages contigus", async () => {
    const doc = await newDocument(buildMeasureText(60_000));
    const started = Date.now();
    expect((await call(payload(doc), localProcessSecret())).status).toBe(202);
    expect(await untilFinished(doc.id, 60_000)).toBe("ready");
    expect(Date.now() - started).toBeLessThan(60_000);

    const text = await storedText(doc.id);
    const passages = await storedPassages(doc.id);
    expect(passages.length).toBeGreaterThan(50);
    expect(passages.map((passage) => passage.ordinal)).toEqual(passages.map((_, index) => index));
    for (const passage of passages) {
      expect(text.slice(passage.start_offset, passage.end_offset)).toBe(passage.content);
    }
  });

  it("texte blanc inséré directement : no_text, sans Passage", async () => {
    const doc = await newDocument("\n\n");
    expect((await call(payload(doc), localProcessSecret())).status).toBe(202);
    expect(await untilFinished(doc.id)).toBe("error");
    const { data } = await admin.from("documents").select("error_kind").eq("id", doc.id).single();
    expect(data?.error_kind).toBe("no_text");
    expect(await storedPassages(doc.id)).toEqual([]);
  });
});

describe("travail d'arrière-plan", () => {
  it("se termine après l'accusé : il n'est pas interrompu à la fin de la requête (per_worker)", async () => {
    const doc = await newDocument();
    expect((await call(payload(doc), localProcessSecret())).status).toBe(202);

    await vi.waitFor(() => expect(functionLogs(doc.id).join(" ")).toContain("process_document_work_done"), {
      timeout: 10_000,
      interval: 500,
    });
    const logs = functionLogs(doc.id);
    const accepted = logs.findIndex((line) => line.includes("process_document_accepted"));
    const done = logs.findIndex((line) => line.includes("process_document_work_done"));
    expect(accepted).toBeGreaterThanOrEqual(0);
    expect(done).toBeGreaterThan(accepted);
  });
});

describe("failProcessing sur la vraie fonction SQL", () => {
  it("écrit l'erreur de cette tentative, puis refuse une tentative plus courante", async () => {
    const { url, serviceRoleKey } = localSupabase();
    const env: Record<string, string> = { SUPABASE_URL: url, [["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")]: serviceRoleKey };
    vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
    try {
      const doc = await newDocument();
      const attempt = { documentId: doc.id, attemptId: doc.attempt_id };
      const message = texts.documentStatus.temporaryAuthor;

      expect(await failProcessing(attempt, "temporary", message)).toBe(true);
      const { data } = await admin.from("documents").select("status, error_kind, error_message").eq("id", doc.id).single();
      expect(data).toEqual({ status: "error", error_kind: "temporary", error_message: message });

      expect(await failProcessing(attempt, "temporary", message)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("process-document", () => {
  it("bon secret, tentative courante : 202 en moins de 5 s, puis Document prêt", async () => {
    const doc = await newDocument();
    const started = Date.now();
    const response = await call(payload(doc), localProcessSecret());
    expect(response.status).toBe(202);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(await untilFinished(doc.id)).toBe("ready");
  });

  it("sans secret : 401 de la fonction, pas de la passerelle, rien de modifié", async () => {
    const doc = await newDocument();
    const response = await call(payload(doc));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(await row(doc.id)).toEqual(doc);
  });

  it("mauvais secret : 401, rien de modifié", async () => {
    const doc = await newDocument();
    expect((await call(payload(doc), "mauvais-secret")).status).toBe(401);
    expect(await row(doc.id)).toEqual(doc);
  });

  it("jeton de Collaborateur valide : refusé, seul le secret fait foi", async () => {
    const doc = await newDocument();
    const { data } = await author.auth.getSession();
    expect((await call(payload(doc), data.session!.access_token)).status).toBe(401);
    expect(await row(doc.id)).toEqual(doc);
  });

  it("tentative inconnue : 404, rien de modifié", async () => {
    const doc = await newDocument();
    const response = await call({ document_id: doc.id, attempt_id: crypto.randomUUID() }, localProcessSecret());
    expect(response.status).toBe(404);
    expect(await row(doc.id)).toEqual(doc);
  });

  it("Document inconnu : 404", async () => {
    const response = await call(
      { document_id: crypto.randomUUID(), attempt_id: crypto.randomUUID() },
      localProcessSecret(),
    );
    expect(response.status).toBe(404);
  });

  it("Document plus en cours : 404, rien de modifié", async () => {
    const doc = await newDocument();
    await admin.from("documents").update({ status: "ready" }).eq("id", doc.id);
    const before = await row(doc.id);
    expect((await call(payload(doc), localProcessSecret())).status).toBe(404);
    expect(await row(doc.id)).toEqual(before);
  });

  it("tentative expirée : 404, rien de modifié", async () => {
    const doc = await newDocument();
    await admin
      .from("documents")
      .update({ processing_started_at: new Date(Date.now() - 181_000).toISOString() })
      .eq("id", doc.id);
    const before = await row(doc.id);
    expect((await call(payload(doc), localProcessSecret())).status).toBe(404);
    expect(await row(doc.id)).toEqual(before);
  });

  it("corps invalide : 400", async () => {
    expect((await call({ document_id: "abc" }, localProcessSecret())).status).toBe(400);
  });
});
