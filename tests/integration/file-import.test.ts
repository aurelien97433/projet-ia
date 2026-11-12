import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeText } from "../../supabase/functions/_shared/rag/normalize.ts";
import { localProcessSecret, localSqlRows, localSupabase, uniqueEmail } from "../support/local-supabase";

// Dépôt et import d'un fichier (story 2.6a) sur Supabase local, à deux Comptes : bucket privé, politiques
// Storage (dossier du propriétaire seulement), fonction import_file_document (chemin exact, propriétaire
// réel, taille, motif strict de l'upload_id), idempotence, puis traitement d'un .txt UTF-8 jusqu'à prêt.
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const BUCKET = "documents";

type Account = { id: string; client: SupabaseClient };

let admin: SupabaseClient;
let anon: SupabaseClient;
let a: Account;
let b: Account;
const documents: string[] = [];

async function account(prefix: string): Promise<Account> {
  const client = createClient(localSupabase().url, localSupabase().publishableKey, options);
  const { data, error } = await client.auth.signUp({ email: uniqueEmail(prefix), password: PASSWORD });
  if (error || !data.user) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  return { id: data.user.id, client };
}

const newUploadId = (extension = "txt") => `${crypto.randomUUID()}.${extension}`;

// Dépôt réel par URL signée, comme le navigateur : PUT direct, sans écrasement.
async function deposit(owner: Account, uploadId: string, body: string | Uint8Array<ArrayBuffer>, extension = "txt") {
  const { data, error } = await owner.client.storage.from(BUCKET).createSignedUploadUrl(`${owner.id}/uploads/${uploadId}`);
  if (error || !data) throw new Error(`URL signée impossible : ${error?.message}`);
  const response = await fetch(data.signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "false", "Content-Type": extension === "md" ? "text/markdown" : "text/plain" },
    body,
  });
  return response.status;
}

type ImportRow = { document_id: string; attempt_to_start: string | null };

async function importAs(owner: Pick<Account, "client">, uploadId: unknown, requestId = crypto.randomUUID(), title = "Fichier") {
  const { data, error } = await owner.client.rpc("import_file_document", {
    p_title: title,
    p_category: "procedure",
    p_upload_id: uploadId,
    p_client_request_id: requestId,
  });
  const row = (data as ImportRow[] | null)?.[0];
  if (row) documents.push(row.document_id);
  return { row, error };
}

const countDocuments = async (path: string) =>
  (await admin.from("documents").select("id", { count: "exact", head: true }).eq("storage_path", path)).count;

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  anon = createClient(url, publishableKey, options);
  [a, b] = await Promise.all([account("fichier-a"), account("fichier-b")]);
}, 60_000);

afterAll(async () => {
  if (documents.length > 0) await admin.from("documents").delete().in("id", documents);
  for (const owner of [a, b]) {
    const { data } = await admin.storage.from(BUCKET).list(`${owner.id}/uploads`, { limit: 100 });
    const paths = (data ?? []).map((object) => `${owner.id}/uploads/${object.name}`);
    if (paths.length > 0) await admin.storage.from(BUCKET).remove(paths);
    await admin.auth.admin.deleteUser(owner.id);
  }
});

describe("bucket documents", () => {
  it("privé, 1 000 000 octets au plus, sans restriction de type MIME", async () => {
    const { data, error } = await admin.storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data).toMatchObject({ public: false, file_size_limit: 1_000_000 });
    expect(data?.allowed_mime_types ?? null).toBeNull();
  });

  it("aucune URL publique ; anon ne lit ni ne dépose rien", async () => {
    const uploadId = newUploadId();
    expect(await deposit(a, uploadId, "Texte.")).toBe(200);
    const path = `${a.id}/uploads/${uploadId}`;
    expect((await fetch(anon.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)).ok).toBe(false);
    expect((await anon.storage.from(BUCKET).download(path)).error).not.toBeNull();
    expect((await anon.storage.from(BUCKET).createSignedUploadUrl(`${a.id}/uploads/${newUploadId()}`)).error).not.toBeNull();
    expect((await anon.storage.from(BUCKET).upload(`${a.id}/uploads/${newUploadId()}`, "x")).error).not.toBeNull();
  });

  it("objet de plus de 1 000 000 octets refusé par le bucket", async () => {
    expect(await deposit(a, newUploadId(), "a".repeat(1_000_001))).not.toBe(200);
  });
});

describe("politiques Storage : dossier du propriétaire seulement", () => {
  it("A dépose dans {A}/uploads/{uuid}.txt|.md ; jamais d'écrasement", async () => {
    const uploadId = newUploadId("md");
    expect(await deposit(a, uploadId, "# Titre\n", "md")).toBe(200);
    const again = await a.client.storage.from(BUCKET).upload(`${a.id}/uploads/${uploadId}`, "autre", { upsert: true });
    expect(again.error).not.toBeNull();
  });

  it.each([
    ["dossier de B", (id: string, other: string) => `${other}/uploads/${newUploadId()}`],
    ["remontée « .. »", (id: string) => `${id}/uploads/../${newUploadId()}`],
    ["sous-dossier", (id: string) => `${id}/uploads/x/${newUploadId()}`],
    ["hors de uploads", (id: string) => `${id}/autre/${newUploadId()}`],
    ["extension .docx", (id: string) => `${id}/uploads/${crypto.randomUUID()}.docx`],
    ["extension en majuscules", (id: string) => `${id}/uploads/${crypto.randomUUID()}.TXT`],
    ["nom libre", (id: string) => `${id}/uploads/procedure.txt`],
    ["racine du bucket", () => newUploadId()],
  ])("A refusé : %s (URL signée et dépôt direct)", async (_label, pathOf) => {
    const path = pathOf(a.id, b.id);
    expect((await a.client.storage.from(BUCKET).createSignedUploadUrl(path)).error).not.toBeNull();
    expect((await a.client.storage.from(BUCKET).upload(path, "x")).error).not.toBeNull();
  });

  it("B ne lit ni le contenu ni les métadonnées du dossier de A", async () => {
    const uploadId = newUploadId();
    expect(await deposit(a, uploadId, "Secret de A.")).toBe(200);
    const path = `${a.id}/uploads/${uploadId}`;
    expect((await b.client.storage.from(BUCKET).download(path)).error).not.toBeNull();
    expect((await b.client.storage.from(BUCKET).info(path)).error).not.toBeNull();
    expect((await b.client.storage.from(BUCKET).list(`${a.id}/uploads`)).data ?? []).toEqual([]);
    expect((await b.client.storage.from(BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
    // A lit les métadonnées de son propre objet (vérification à « Importer »).
    expect((await a.client.storage.from(BUCKET).info(path)).data?.size).toBe("Secret de A.".length);
  });
});

describe("import_file_document", () => {
  it("import : Document file, MIME déduit de l'extension, taille, en cours, tentative à lancer", async () => {
    const md = newUploadId("md");
    expect(await deposit(a, md, "# Procédure\nTexte.\n", "md")).toBe(200);
    const { row, error } = await importAs(a, md, undefined, "  Procédure congés  ");
    expect(error).toBeNull();
    expect(row?.attempt_to_start).toEqual(expect.any(String));
    const { data } = await admin
      .from("documents")
      .select("author_id, title, kind, storage_path, mime_type, size_bytes, status, attempt_id, content_text")
      .eq("id", row!.document_id)
      .single();
    expect(data).toEqual({
      author_id: a.id,
      title: "Procédure congés",
      kind: "file",
      storage_path: `${a.id}/uploads/${md}`,
      mime_type: "text/markdown",
      size_bytes: new TextEncoder().encode("# Procédure\nTexte.\n").length,
      status: "processing",
      attempt_id: row!.attempt_to_start,
      content_text: null,
    });

    const txt = newUploadId("txt");
    expect(await deposit(a, txt, "Texte.")).toBe(200);
    const plain = await importAs(a, txt);
    expect((await admin.from("documents").select("mime_type").eq("id", plain.row!.document_id).single()).data?.mime_type).toBe(
      "text/plain",
    );
  });

  it("fichier vide accepté (le traitement le signale, story 2.6b)", async () => {
    const uploadId = newUploadId();
    expect(await deposit(a, uploadId, "")).toBe(200);
    const { row, error } = await importAs(a, uploadId);
    expect(error).toBeNull();
    expect(row?.document_id).toEqual(expect.any(String));
  });

  it("idempotente : même demande ou même fichier → même Document, sans nouvelle tentative", async () => {
    const uploadId = newUploadId();
    expect(await deposit(a, uploadId, "Texte.")).toBe(200);
    const requestId = crypto.randomUUID();
    const first = await importAs(a, uploadId, requestId);
    const replay = await importAs(a, uploadId, requestId);
    const otherRequest = await importAs(a, uploadId);
    expect(replay.row).toEqual({ document_id: first.row!.document_id, attempt_to_start: null });
    expect(otherRequest.row).toEqual({ document_id: first.row!.document_id, attempt_to_start: null });
    expect(await countDocuments(`${a.id}/uploads/${uploadId}`)).toBe(1);
  });

  it("imports simultanés du même fichier : un seul Document, une seule tentative à lancer", async () => {
    for (let round = 0; round < 3; round++) {
      const uploadId = newUploadId();
      expect(await deposit(a, uploadId, "Texte.")).toBe(200);
      const requestId = crypto.randomUUID();
      const results = await Promise.all([
        importAs(a, uploadId, requestId),
        importAs(a, uploadId, requestId),
        importAs(a, uploadId),
      ]);
      for (const { error } of results) expect(error).toBeNull();
      expect(new Set(results.map(({ row }) => row?.document_id)).size).toBe(1);
      expect(results.filter(({ row }) => row?.attempt_to_start).length).toBe(1);
      expect(await countDocuments(`${a.id}/uploads/${uploadId}`)).toBe(1);
    }
  });

  it("upload_id de A importé par B : refusé, aucun Document", async () => {
    const uploadId = newUploadId();
    expect(await deposit(a, uploadId, "Texte de A.")).toBe(200);
    const { row, error } = await importAs(b, uploadId);
    expect(row).toBeUndefined();
    expect(error?.message).toBe("upload_not_found");
    expect(await countDocuments(`${b.id}/uploads/${uploadId}`)).toBe(0);
    expect(await countDocuments(`${a.id}/uploads/${uploadId}`)).toBe(0);
  });

  it("objet absent : refusé", async () => {
    expect((await importAs(a, newUploadId())).error?.message).toBe("upload_not_found");
  });

  it.each([
    ["chemin forgé « .. »", () => `../${b.id}/uploads/${newUploadId()}`],
    ["chemin complet de B", () => `${b.id}/uploads/${newUploadId()}`],
    ["barre oblique", () => `x/${newUploadId()}`],
    ["« .. » dans le nom", () => `${crypto.randomUUID()}..txt`],
    ["majuscules", () => `${crypto.randomUUID().toUpperCase()}.txt`],
    ["extension .docx", () => `${crypto.randomUUID()}.docx`],
    ["espace final", () => `${newUploadId()} `],
    ["saut de ligne", () => `${newUploadId()}\n`],
    ["% encodé", () => `%2e%2e%2f${newUploadId()}`],
    ["vide", () => ""],
    ["absent", () => null],
  ])("appel direct avec upload_id invalide (%s) : refusé sans Document", async (_label, value) => {
    const before = (await admin.from("documents").select("id", { count: "exact", head: true }).eq("author_id", a.id)).count;
    const { row, error } = await importAs(a, value());
    expect(row).toBeUndefined();
    expect(error?.message).toBe("invalid_upload_id");
    expect((await admin.from("documents").select("id", { count: "exact", head: true }).eq("author_id", a.id)).count).toBe(before);
  });

  it("objet dans le dossier de A mais pas déposé par A (propriétaire réel) : refusé", async () => {
    const uploadId = newUploadId();
    // Déposé par service_role : aucun propriétaire.
    const { error } = await admin.storage.from(BUCKET).upload(`${a.id}/uploads/${uploadId}`, "Posé par un tiers.");
    expect(error).toBeNull();
    expect((await importAs(a, uploadId)).error?.message).toBe("upload_not_found");
  });

  it("taille enregistrée au-delà de 1 000 000 octets : refusé", async () => {
    const uploadId = newUploadId();
    expect(await deposit(a, uploadId, "Texte.")).toBe(200);
    localSqlRows(
      `update storage.objects set metadata = jsonb_set(metadata, '{size}', '1000001') where bucket_id = 'documents' and name = '${a.id}/uploads/${uploadId}'`,
    );
    expect((await importAs(a, uploadId)).error?.message).toBe("file_too_large");
  });

  it("anon : exécution refusée ; insertion directe d'un Document file : refusée", async () => {
    const uploadId = newUploadId();
    expect(await deposit(a, uploadId, "Texte.")).toBe(200);
    expect((await importAs({ client: anon }, uploadId)).error).not.toBeNull();
    const direct = await a.client.from("documents").insert({
      title: "Direct",
      category: "faq",
      kind: "file",
      storage_path: `${a.id}/uploads/${uploadId}`,
      client_request_id: crypto.randomUUID(),
    });
    expect(direct.error).not.toBeNull();
  });
});

describe("traitement d'un fichier importé", () => {
  it(".txt UTF-8 simple (BOM compris) : prêt, texte lu et normalisé", async () => {
    const uploadId = newUploadId();
    const text = "Procédure congés.\r\nPoser ses congés deux semaines à l'avance.\r\n";
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
    expect(await deposit(a, uploadId, bytes)).toBe(200);
    const { row } = await importAs(a, uploadId);

    const response = await fetch(`${localSupabase().url}/functions/v1/process-document`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localProcessSecret()}` },
      body: JSON.stringify({ document_id: row!.document_id, attempt_id: row!.attempt_to_start }),
    });
    expect(response.status).toBe(202);
    await vi.waitFor(
      async () =>
        expect((await admin.from("documents").select("status").eq("id", row!.document_id).single()).data?.status).toBe("ready"),
      { timeout: 15_000, interval: 200 },
    );
    const { data } = await admin.from("documents").select("content_text").eq("id", row!.document_id).single();
    expect(data?.content_text).toBe(normalizeText(text));
    expect(data?.content_text).not.toContain("\r");
    expect(data?.content_text).not.toContain("﻿");
  }, 30_000);
});
