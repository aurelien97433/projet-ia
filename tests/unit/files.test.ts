import { describe, expect, it } from "vitest";
import {
  checkFile,
  fileExtension,
  isUploadId,
  mimeForExtension,
  newUploadId,
  titleFromFileName,
  uploadPath,
} from "@/lib/files";

const UUID = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";

describe("fileExtension et checkFile (contrôle avant tout envoi)", () => {
  it.each([
    ["procedure-conges.md", "md"],
    ["notes.TXT", "txt"],
    ["archive.tar.md", "md"],
  ])("%s → %s", (name, extension) => {
    expect(fileExtension(name)).toBe(extension);
  });

  it.each(["rapport.docx", "sans-extension", "notes.txt.exe", "image.pdf", ".md/x", "md", "notes.", "dossier\\notes"])(
    "%s : format refusé",
    (name) => {
      expect(fileExtension(name)).toBeNull();
      expect(checkFile({ name, size: 10 })).toBe("format");
    },
  );

  it("taille : 0 et 1 000 000 octets acceptés, 1 000 001 et 1 200 000 refusés ; format vérifié d'abord", () => {
    expect(checkFile({ name: "a.txt", size: 0 })).toBeNull();
    expect(checkFile({ name: "a.txt", size: 1_000_000 })).toBeNull();
    expect(checkFile({ name: "a.txt", size: 1_000_001 })).toBe("size");
    expect(checkFile({ name: "a.md", size: 1_200_000 })).toBe("size");
    expect(checkFile({ name: "a.docx", size: 1_200_000 })).toBe("format");
    expect(checkFile({ name: "a.txt", size: Number.NaN })).toBe("size");
  });
});

describe("titleFromFileName", () => {
  it("nom sans la dernière extension, espaces retirés", () => {
    expect(titleFromFileName("procedure-conges.md")).toBe("procedure-conges");
    expect(titleFromFileName("  Compte rendu.v2.txt ")).toBe("Compte rendu.v2");
    expect(titleFromFileName("C:\\fakepath\\notes.txt")).toBe("notes");
  });

  it("200 unités au plus, sans couper un caractère composé de deux unités", () => {
    expect(titleFromFileName(`${"a".repeat(250)}.txt`)).toHaveLength(200);
    const emoji = titleFromFileName(`${"a".repeat(199)}😀.txt`);
    expect(emoji).toBe("a".repeat(199));
  });
});

describe("upload_id (motif strict)", () => {
  it("{uuid}.txt ou {uuid}.md en minuscules", () => {
    expect(isUploadId(`${UUID}.txt`)).toBe(true);
    expect(isUploadId(`${UUID}.md`)).toBe(true);
    expect(isUploadId(newUploadId("md"))).toBe(true);
    expect(newUploadId("txt").endsWith(".txt")).toBe(true);
  });

  it.each([
    `${UUID.toUpperCase()}.txt`,
    `${UUID}.TXT`,
    `${UUID}.docx`,
    `${UUID}`,
    `../${UUID}.txt`,
    `x/${UUID}.txt`,
    `${UUID}..txt`,
    `${UUID}.txt `,
    `${UUID}.txt\n`,
    `%2e%2e%2f${UUID}.txt`,
    "",
    null,
    42,
  ])("%j refusé", (value) => {
    expect(isUploadId(value)).toBe(false);
  });

  it("chemin {author_id}/uploads/{upload_id} ; MIME déduit de l'extension", () => {
    expect(uploadPath("auteur", `${UUID}.md`)).toBe(`auteur/uploads/${UUID}.md`);
    expect(mimeForExtension("md")).toBe("text/markdown");
    expect(mimeForExtension("txt")).toBe("text/plain");
  });
});
