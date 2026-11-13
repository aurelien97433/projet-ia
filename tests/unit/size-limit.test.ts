import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_TEXT_BYTES } from "@/lib/documents";
import { MAX_FILE_BYTES } from "@/lib/files";
import { texts } from "@/lib/texts";
import { APP_LIMIT_BYTES } from "../../scripts/load-test-1mo";

// Limite de taille (story 2.7, décision du 2026-11-12) : 100 Ko = 100 000 octets, la même valeur dans
// l'application, l'Edge Function, la base (dernière migration) et le script de charge. Les Edge
// Functions et les migrations n'importent rien de src/ : seul ce test garantit leur concordance.
const root = path.resolve(import.meta.dirname, "..", "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const migrations = readdirSync(path.join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
const lastMention = (pattern: RegExp) => {
  const file = [...migrations].reverse().find((name) => pattern.test(read(path.join("supabase", "migrations", name))));
  return file ? read(path.join("supabase", "migrations", file)) : "";
};

describe("limite de 100 Ko partout", () => {
  it("application : texte des Notes et fichiers", () => {
    expect(MAX_TEXT_BYTES).toBe(100_000);
    expect(MAX_FILE_BYTES).toBe(MAX_TEXT_BYTES);
    expect(APP_LIMIT_BYTES).toBe(MAX_TEXT_BYTES);
  });

  it("Edge Function process-document : texte converti", () => {
    expect(read("supabase/functions/process-document/index.ts")).toContain("const MAX_TEXT_BYTES = 100_000;");
  });

  it("base : dernière valeur du bucket, de la contrainte et de la fonction d'import", () => {
    expect(lastMention(/file_size_limit/)).toMatch(/file_size_limit = 100000\b/);
    expect(lastMention(/documents_content_size/)).toMatch(/octet_length\(content_text\) <= 100000\)/);
    expect(lastMention(/function public\.import_file_document/)).toMatch(/v_size > 100000 then/);
  });

  it("messages : 100 Ko, jamais 1 Mo", () => {
    const messages = [
      texts.addDocument.formats,
      texts.addDocument.errors.fileTooLarge,
      texts.addDocument.errors.textTooLarge,
      texts.documentStatus.noTextTooLarge,
    ];
    for (const message of messages) {
      expect(message).toContain("100 Ko");
      expect(message).not.toContain("1 Mo");
    }
    expect(read("supabase/functions/process-document/index.ts")).toContain(JSON.stringify(texts.documentStatus.noTextTooLarge));
  });
});
