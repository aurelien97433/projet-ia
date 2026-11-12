import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";
import { FIXTURE_TEXTS, FIXTURES_DIR } from "../../scripts/generate-file-fixtures";
import { normalizeText } from "../../supabase/functions/_shared/rag/normalize.ts";
import { localProcessSecret, localSupabase, uniqueEmail } from "../support/local-supabase";

// Décodage des fichiers importés (story 2.6b), de bout en bout sur Supabase local : vrais fichiers de
// test déposés par URL signée, importés, puis traités par la fonction process-document locale.
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = ["Mot", "de", "passe", "test", "2026"].join("-");
const BUCKET = "documents";

let admin: SupabaseClient;
let author: SupabaseClient;
let authorId: string;
const documents: string[] = [];

type Final = { status: string; error_kind: string | null; error_message: string | null; content_text: string | null };

async function importAndProcess(bytes: Uint8Array<ArrayBuffer>, extension: "txt" | "md"): Promise<Final> {
  const uploadId = `${crypto.randomUUID()}.${extension}`;
  const { data: signed, error } = await author.storage.from(BUCKET).createSignedUploadUrl(`${authorId}/uploads/${uploadId}`);
  if (error || !signed) throw new Error(`URL signée impossible : ${error?.message}`);
  const put = await fetch(signed.signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: bytes });
  expect(put.status).toBe(200);

  const { data } = await author.rpc("import_file_document", {
    p_title: "Fichier",
    p_category: "procedure",
    p_upload_id: uploadId,
    p_client_request_id: crypto.randomUUID(),
  });
  const row = (data as { document_id: string; attempt_to_start: string }[])[0];
  documents.push(row.document_id);

  const response = await fetch(`${localSupabase().url}/functions/v1/process-document`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localProcessSecret()}` },
    body: JSON.stringify({ document_id: row.document_id, attempt_id: row.attempt_to_start }),
  });
  expect(response.status).toBe(202);

  const read = async () =>
    (await admin.from("documents").select("status, error_kind, error_message, content_text").eq("id", row.document_id).single())
      .data as Final;
  await vi.waitFor(async () => expect((await read()).status).not.toBe("processing"), { timeout: 20_000, interval: 200 });
  return read();
}

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES_DIR, name)));

beforeAll(async () => {
  const { url, publishableKey, serviceRoleKey } = localSupabase();
  admin = createClient(url, serviceRoleKey, options);
  author = createClient(url, publishableKey, options);
  const { data, error } = await author.auth.signUp({ email: uniqueEmail("decodage"), password: PASSWORD });
  if (error || !data.user) throw new Error(`Création du Compte de test impossible : ${error?.code}`);
  authorId = data.user.id;
}, 60_000);

afterAll(async () => {
  if (documents.length > 0) await admin.from("documents").delete().in("id", documents);
  const { data } = await admin.storage.from(BUCKET).list(`${authorId}/uploads`, { limit: 100 });
  const paths = (data ?? []).map((object) => `${authorId}/uploads/${object.name}`);
  if (paths.length > 0) await admin.storage.from(BUCKET).remove(paths);
  await admin.auth.admin.deleteUser(authorId);
});

describe("fichiers lisibles : prêts, accents corrects", () => {
  it.each([
    ["utf8.txt", "txt", FIXTURE_TEXTS.utf8],
    ["utf8-bom.md", "md", FIXTURE_TEXTS.utf8Bom],
    ["windows-1252.txt", "txt", FIXTURE_TEXTS.windows1252],
  ] as const)("%s", async (name, extension, text) => {
    const final = await importAndProcess(fixture(name), extension);
    expect(final).toMatchObject({ status: "ready", error_kind: null });
    expect(final.content_text).toBe(normalizeText(text));
    expect(final.content_text).not.toContain("﻿");
    expect(final.content_text).not.toContain("�");
  }, 30_000);
});

describe("fichiers inexploitables : no_text, message propre à la cause", () => {
  it.each([
    ["vide.txt", texts.documentStatus.noText],
    ["espaces.txt", texts.documentStatus.noText],
    ["binaire.txt", texts.documentStatus.noTextEncoding],
  ])("%s", async (name, message) => {
    expect(await importAndProcess(fixture(name), "txt")).toEqual({
      status: "error",
      error_kind: "no_text",
      error_message: message,
      content_text: null,
    });
  }, 30_000);

  it("Windows-1252 de 1 000 000 octets, généré pendant le test (2 000 000 octets une fois converti)", async () => {
    // Lignes de « é » (0xE9) : un fichier à la limite du bucket, jamais versionné.
    const line = [...new Array(99).fill(0xe9), 0x0a];
    const bytes = new Uint8Array(1_000_000);
    for (let index = 0; index < bytes.length; index++) bytes[index] = line[index % line.length];
    expect(await importAndProcess(bytes, "txt")).toEqual({
      status: "error",
      error_kind: "no_text",
      error_message: texts.documentStatus.noTextTooLarge,
      content_text: null,
    });
  }, 60_000);
});

describe("relance", () => {
  it("un no_text n'est pas relançable (retry_processing refuse)", async () => {
    const id = documents.at(-1)!;
    const { error } = await author.rpc("retry_processing", { p_document_id: id, p_client_request_id: crypto.randomUUID() });
    expect(error).not.toBeNull();
    expect((await admin.from("documents").select("status, error_kind").eq("id", id).single()).data).toEqual({
      status: "error",
      error_kind: "no_text",
    });
  });
});
