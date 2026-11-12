import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFileText } from "../../supabase/functions/_shared/rag/extract.ts";
import { downloadFile, readDocumentText } from "../../supabase/functions/_shared/processing.ts";

// Lecture du texte d'un fichier importé par process-document (story 2.6a) : téléchargement avec
// service_role et décodage UTF-8 minimal (BOM retiré). Le décodage complet relève de la story 2.6b.
const env: Record<string, string> = {};
const fetchMock = vi.fn();
const ATTEMPT = { documentId: "doc", attemptId: "tentative" };
const SERVICE_KEY_NAME = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");

beforeEach(() => {
  Object.assign(env, { SUPABASE_URL: "http://base.test", [SERVICE_KEY_NAME]: "cle-de-test" });
  vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const encode = (text: string) => new TextEncoder().encode(text);

describe("decodeFileText", () => {
  it("UTF-8, accents compris ; BOM retiré", () => {
    expect(decodeFileText(encode("Procédure congés"))).toBe("Procédure congés");
    expect(decodeFileText(new Uint8Array([0xef, 0xbb, 0xbf, ...encode("Été")]))).toBe("Été");
    expect(decodeFileText(new Uint8Array())).toBe("");
  });
});

describe("readDocumentText", () => {
  const rows = (row: Record<string, unknown> | null) => Response.json(row ? [row] : []);

  it("Note : texte de la base, aucun téléchargement", async () => {
    fetchMock.mockResolvedValueOnce(rows({ content_text: "Texte.", text_version: 2, kind: "note", storage_path: null }));
    const download = vi.fn();
    expect(await readDocumentText(ATTEMPT, download)).toEqual({ text: "Texte.", textVersion: 2 });
    expect(download).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain("select=content_text%2Ctext_version%2Ckind%2Cstorage_path");
  });

  it("fichier sans texte extrait : téléchargé puis décodé", async () => {
    fetchMock.mockResolvedValueOnce(rows({ content_text: null, text_version: 1, kind: "file", storage_path: "a/uploads/x.md" }));
    const download = vi.fn(async () => encode("# Titre"));
    expect(await readDocumentText(ATTEMPT, download)).toEqual({ text: "# Titre", textVersion: 1 });
    expect(download).toHaveBeenCalledWith("a/uploads/x.md");
  });

  it("tentative remplacée : null, aucun téléchargement", async () => {
    fetchMock.mockResolvedValueOnce(rows(null));
    const download = vi.fn();
    expect(await readDocumentText(ATTEMPT, download)).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it("fichier sans chemin ou téléchargement en échec : erreur (le traitement passe en erreur temporaire)", async () => {
    fetchMock.mockResolvedValueOnce(rows({ content_text: null, text_version: 1, kind: "file", storage_path: null }));
    await expect(readDocumentText(ATTEMPT, vi.fn())).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(rows({ content_text: null, text_version: 1, kind: "file", storage_path: "p" }));
    await expect(readDocumentText(ATTEMPT, vi.fn(async () => Promise.reject(new Error("404"))))).rejects.toThrow();
  });
});

describe("downloadFile", () => {
  it("bucket documents, service_role, chemin encodé segment par segment", async () => {
    fetchMock.mockResolvedValueOnce(new Response(encode("Texte")));
    expect(new TextDecoder().decode(await downloadFile("auteur/uploads/a b.txt"))).toBe("Texte");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://base.test/storage/v1/object/documents/auteur/uploads/a%20b.txt");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer cle-de-test" });
  });

  it("réponse en erreur : DbError (code http_404, sans contenu)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("absent", { status: 404 }));
    await expect(downloadFile("p")).rejects.toMatchObject({ code: "http_404" });
  });
});
