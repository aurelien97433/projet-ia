import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_TEXT_BYTES } from "@/lib/documents";
import { noteSchema } from "@/lib/schemas/documents";
import { texts } from "@/lib/texts";
import { createNote } from "@/server/documents/create-note";

const e = texts.addDocument.errors;
const REQUEST_ID = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const USER = "11111111-1111-4111-8111-111111111111";
const valid = { title: "Procédure de facturation", category: "procedure", content: "Texte.", clientRequestId: REQUEST_ID };

afterEach(() => vi.restoreAllMocks());

describe("noteSchema", () => {
  it("accepte une Note valide et nettoie le titre", () => {
    const parsed = noteSchema.parse({ ...valid, title: "  Titre  " });
    expect(parsed.title).toBe("Titre");
  });

  it.each([
    ["titre vide", { title: "   " }, "title", e.titleMissing],
    ["titre absent", { title: undefined }, "title", e.titleMissing],
    ["titre de 201 caractères", { title: "a".repeat(201) }, "title", e.titleTooLong],
    ["aucune Catégorie", { category: "" }, "category", e.categoryMissing],
    ["Catégorie inconnue", { category: "secret" }, "category", e.categoryMissing],
    ["texte vide", { content: "  \n " }, "content", e.textMissing],
    ["texte absent", { content: null }, "content", e.textMissing],
  ])("%s : message du catalogue sur le bon champ", (_label, patch, field, message) => {
    const result = noteSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues.find((issue) => issue.path[0] === field)?.message).toBe(message);
  });

  it("texte de 1 000 000 octets exactement : accepté ; 1 000 001 octets : refusé", () => {
    expect(noteSchema.safeParse({ ...valid, content: "a".repeat(MAX_TEXT_BYTES) }).success).toBe(true);
    const tooLarge = noteSchema.safeParse({ ...valid, content: "a".repeat(MAX_TEXT_BYTES + 1) });
    expect(tooLarge.error?.issues[0].message).toBe(e.textTooLarge);
  });

  it("limite comptée en octets UTF-8, pas en caractères : 500 001 « é » (1 000 002 octets) refusés", () => {
    expect(noteSchema.safeParse({ ...valid, content: "é".repeat(500_000) }).success).toBe(true);
    expect(noteSchema.safeParse({ ...valid, content: "é".repeat(500_001) }).error?.issues[0].message).toBe(e.textTooLarge);
  });

  it("texte canonique avant la mesure : « \\r\\n » de l'envoi du formulaire compté comme « \\n », forme NFC", () => {
    // 1 000 000 octets en « \n » deviennent 1 000 000 + 10 000 octets une fois envoyés en « \r\n ».
    const lines = "a".repeat(99) + "\r\n";
    const sent = lines.repeat(10_000);
    const parsed = noteSchema.parse({ ...valid, content: sent });
    expect(parsed.content).toBe(("a".repeat(99) + "\n").repeat(10_000));
    expect(noteSchema.parse({ ...valid, content: "é" }).content).toBe("é");
  });

  it("identifiant de demande obligatoire et au format UUID", () => {
    expect(noteSchema.safeParse({ ...valid, clientRequestId: "abc" }).success).toBe(false);
    expect(noteSchema.safeParse({ ...valid, clientRequestId: undefined }).success).toBe(false);
  });
});

// Client Supabase simulé : enregistre les appels de la chaîne insert/select/eq.
function fakeDb(insertResult: { data: unknown; error: unknown }, existing: { data: unknown } = { data: null }) {
  const calls: { op: string; args: unknown[] }[] = [];
  const query = (result: unknown) => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const op of ["insert", "select", "eq"]) {
      chain[op] = (...args: unknown[]) => {
        calls.push({ op, args });
        return chain;
      };
    }
    chain.single = async () => result;
    chain.maybeSingle = async () => result;
    return chain;
  };
  let first = true;
  const db = {
    from: vi.fn(() => {
      const chain = query(first ? insertResult : existing);
      first = false;
      return chain;
    }),
  };
  return { db: db as never, calls };
}

describe("createNote", () => {
  it("insère seulement les colonnes accordées, jamais l'Auteur, le Statut ni la tentative", async () => {
    const { db, calls } = fakeDb({ data: { id: "doc-1", attempt_id: "tentative-1" }, error: null });
    expect(await createNote(valid, USER, db)).toEqual({ status: "created", id: "doc-1", attemptToStart: "tentative-1" });
    const inserted = calls.find((call) => call.op === "insert")?.args[0];
    expect(inserted).toEqual({
      title: valid.title,
      category: "procedure",
      content_text: "Texte.",
      client_request_id: REQUEST_ID,
    });
  });

  it("saisie invalide : messages par champ, aucun appel à la base", async () => {
    const { db } = fakeDb({ data: null, error: null });
    const result = await createNote({ ...valid, title: "", category: "", content: "" }, USER, db);
    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { title: e.titleMissing, category: e.categoryMissing, content: e.textMissing },
    });
    expect((db as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("rejeu (23505) : renvoie le Document de CE Collaborateur, filtré sur author_id", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, calls } = fakeDb({ data: null, error: { code: "23505" } }, { data: { id: "doc-existant" } });
    expect(await createNote(valid, USER, db)).toEqual({ status: "created", id: "doc-existant", attemptToStart: null });
    const filters = calls.filter((call) => call.op === "eq").map((call) => call.args);
    expect(filters).toEqual([
      ["author_id", USER],
      ["client_request_id", REQUEST_ID],
    ]);
  });

  it("rejeu sans Document de ce Collaborateur : erreur, jamais le Document d'un autre", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb({ data: null, error: { code: "23505" } }, { data: null });
    expect(await createNote(valid, USER, db)).toMatchObject({ status: "error", error: { code: "INTERNAL" } });
  });

  it("erreur inattendue : message du catalogue, journal sans titre ni texte", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "Contenu confidentiel";
    const { db } = fakeDb({ data: null, error: { code: "42501" } });
    const result = await createNote({ ...valid, title: "Titre confidentiel", content: secret }, USER, db);
    expect(result).toEqual({
      status: "error",
      error: { code: "INTERNAL", message: e.saveFailed, retryable: true },
    });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("create_note_failed");
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain("Titre confidentiel");
  });

  it("identifiant de demande invalide : erreur, pas un message de champ", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb({ data: null, error: null });
    expect(await createNote({ ...valid, clientRequestId: "x" }, USER, db)).toMatchObject({ status: "error" });
  });
});
