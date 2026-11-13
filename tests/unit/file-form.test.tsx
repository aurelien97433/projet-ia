// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";

// Onglet Fichier (story 2.6a) : contrôle avant envoi, dépôt, échec et « Réessayer », titre prérempli,
// import idempotent. Dépôt et Server Action simulés.
const t = texts.addDocument;
const UPLOAD = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b.md";

const mocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  importFileAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, back: vi.fn(), push: vi.fn() }),
  unstable_rethrow: () => {},
}));
vi.mock("@/app/(app)/ajouter/upload-file", () => ({ uploadFile: mocks.uploadFile }));
vi.mock("@/app/(app)/ajouter/actions", () => ({ importFileAction: mocks.importFileAction }));

const { FileForm } = await import("@/app/(app)/ajouter/file-form");

const fileInput = () => document.querySelector<HTMLInputElement>("input[type=file]")!;
const title = () => screen.getByLabelText(new RegExp(`^${t.titleLabel}`)) as HTMLInputElement;
const category = () => screen.getByLabelText(new RegExp(`^${t.categoryLabel}`)) as HTMLSelectElement;
const importButton = () => screen.getByRole("button", { name: new RegExp(`${t.importSubmit}|${t.importing}`) });
const fileStatus = () => document.getElementById("file-message")!;
const flush = () => act(async () => {});

function file(name: string, size = 20) {
  const value = new File(["x"], name, { type: "" });
  Object.defineProperty(value, "size", { value: size });
  return value;
}

async function choose(value: File) {
  fireEvent.change(fileInput(), { target: { files: [value] } });
  await flush();
}

beforeEach(() => {
  mocks.uploadFile.mockReset();
  mocks.importFileAction.mockReset();
  mocks.refresh.mockReset();
  mocks.uploadFile.mockResolvedValue({ status: "uploaded", uploadId: UPLOAD });
});

// Actions laissées en attente par un test : résolues à la fin. React 19 rattache toute nouvelle transition
// à une action asynchrone encore en cours ; sans cela, isPending resterait vrai dans les tests suivants.
const pending: (() => void)[] = [];
function hang() {
  return new Promise((resolve) =>
    pending.push(() => resolve({ status: "error", error: { code: "INTERNAL", message: t.errors.saveFailed, retryable: true } })),
  );
}

afterEach(async () => {
  await act(async () => pending.splice(0).forEach((release) => release()));
  cleanup();
});

describe("choix du fichier", () => {
  it("zone de dépôt : « Choisir un fichier », formats, sélecteur limité à .txt et .md", () => {
    render(<FileForm />);
    expect(screen.getByRole("button", { name: t.chooseFile }).getAttribute("aria-describedby")).toContain("file-formats");
    expect(screen.getByText(t.formats)).toBeTruthy();
    expect(fileInput().accept).toBe(".txt,.md");
    expect(fileInput().tabIndex).toBe(-1);
  });

  it.each([
    ["rapport.docx", 20, t.errors.fileFormat],
    ["notes.txt", 100_001, t.errors.fileTooLarge],
  ])("%s (%i octets) : refusé avant tout envoi, autres champs conservés", async (name, size, message) => {
    render(<FileForm />);
    fireEvent.change(title(), { target: { value: "Mon titre" } });
    fireEvent.change(category(), { target: { value: "faq" } });
    await choose(file(name, size));
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(fileStatus().textContent).toBe(message);
    expect(title().value).toBe("Mon titre");
    expect(category().value).toBe("faq");
  });

  it("fichier valide : titre prérempli sans l'extension, dépôt, « Importer » inactif pendant le dépôt", async () => {
    let finish!: (value: unknown) => void;
    mocks.uploadFile.mockImplementation((_file, onProgress: (ratio: number) => void) => {
      onProgress(0.4);
      return new Promise((resolve) => (finish = resolve));
    });
    render(<FileForm />);
    await choose(file("procedure-conges.md"));
    expect(title().value).toBe("procedure-conges");
    expect(fileStatus().textContent).toContain(t.uploading);
    expect(screen.getByRole("progressbar", { name: t.uploading }).getAttribute("value")).toBe("40");
    expect(importButton().getAttribute("aria-disabled")).toBe("true");
    expect(importButton().textContent).toBe(t.importSubmit);

    fireEvent.submit(importButton().closest("form")!);
    expect(mocks.importFileAction).not.toHaveBeenCalled();

    await act(async () => finish({ status: "uploaded", uploadId: UPLOAD }));
    expect(importButton().hasAttribute("aria-disabled")).toBe(false);
    expect(fileStatus().textContent).toBe(t.uploaded("procedure-conges.md"));
  });

  it("titre modifié par le Collaborateur : jamais remplacé par un nouveau fichier", async () => {
    render(<FileForm />);
    await choose(file("premier.txt"));
    fireEvent.change(title(), { target: { value: "Mon titre" } });
    await choose(file("second.txt"));
    expect(title().value).toBe("Mon titre");
  });

  it("échec du dépôt : message, « Réessayer » relance un dépôt, champs conservés", async () => {
    mocks.uploadFile.mockResolvedValueOnce({ status: "failed" });
    render(<FileForm />);
    fireEvent.change(category(), { target: { value: "procedure" } });
    await choose(file("notes.txt"));
    expect(fileStatus().textContent).toBe(t.errors.uploadFailed);
    expect(title().value).toBe("notes");

    fireEvent.click(screen.getByRole("button", { name: t.retry }));
    await flush();
    expect(mocks.uploadFile).toHaveBeenCalledTimes(2);
    expect(mocks.uploadFile.mock.calls[1][0]).toBe(mocks.uploadFile.mock.calls[0][0]);
    expect(fileStatus().textContent).toBe(t.uploaded("notes.txt"));
    expect(category().value).toBe("procedure");
  });

  it("session expirée pendant le dépôt : page rafraîchie, échec affiché", async () => {
    mocks.uploadFile.mockResolvedValueOnce({ status: "unauthenticated" });
    render(<FileForm />);
    await choose(file("notes.txt"));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(fileStatus().textContent).toBe(t.errors.uploadFailed);
  });
});

describe("« Importer »", () => {
  async function ready() {
    render(<FileForm />);
    await choose(file("procedure-conges.md"));
    fireEvent.change(category(), { target: { value: "procedure" } });
  }

  it("sans fichier : « Choisissez un fichier. », focus sur « Choisir un fichier », aucun appel", async () => {
    render(<FileForm />);
    fireEvent.change(title(), { target: { value: "Titre" } });
    fireEvent.change(category(), { target: { value: "faq" } });
    fireEvent.submit(importButton().closest("form")!);
    expect(fileStatus().textContent).toBe(t.errors.fileMissing);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: t.chooseFile }));
    expect(mocks.importFileAction).not.toHaveBeenCalled();
  });

  it("envoie titre, Catégorie, upload_id et un identifiant de demande réutilisé par « Réessayer »", async () => {
    mocks.importFileAction.mockResolvedValue({ status: "error", error: { code: "INTERNAL", message: t.errors.saveFailed, retryable: true } });
    await ready();
    fireEvent.submit(importButton().closest("form")!);
    await flush();
    const first = mocks.importFileAction.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(first)).toMatchObject({ title: "procedure-conges", category: "procedure", uploadId: UPLOAD });
    expect(screen.getByRole("alert").textContent).toContain(t.errors.saveFailed);

    fireEvent.submit(importButton().closest("form")!);
    await flush();
    const second = mocks.importFileAction.mock.calls[1][0] as FormData;
    expect(second.get("clientRequestId")).toBe(first.get("clientRequestId"));
  });

  it("nouveau fichier après un échec d'import : nouvel identifiant de demande", async () => {
    mocks.importFileAction.mockResolvedValue({ status: "error", error: { code: "INTERNAL", message: t.errors.saveFailed, retryable: true } });
    await ready();
    fireEvent.submit(importButton().closest("form")!);
    await flush();
    await choose(file("autre.md"));
    fireEvent.submit(importButton().closest("form")!);
    await flush();
    const [first, second] = mocks.importFileAction.mock.calls.map(([data]) => (data as FormData).get("clientRequestId"));
    expect(second).not.toBe(first);
  });

  it("fichier refusé par la base : dépôt à refaire (« Réessayer »), titre et Catégorie conservés", async () => {
    mocks.importFileAction.mockResolvedValue({ status: "invalid", fieldErrors: { file: t.errors.uploadFailed } });
    await ready();
    fireEvent.submit(importButton().closest("form")!);
    await flush();
    expect(fileStatus().textContent).toBe(t.errors.uploadFailed);
    expect(screen.getByRole("button", { name: t.retry })).toBeTruthy();
    expect(title().value).toBe("procedure-conges");
    expect(category().value).toBe("procedure");
  });
});

describe("revue (story 2.6a) : cas ajoutés", () => {
  async function ready() {
    render(<FileForm />);
    await choose(file("procedure-conges.md"));
    fireEvent.change(category(), { target: { value: "procedure" } });
  }

  it("action en échec (exception) : alerte réessayable, champs conservés, même identifiant au nouvel envoi", async () => {
    mocks.importFileAction.mockRejectedValueOnce(new Error("réseau")).mockResolvedValueOnce({
      status: "error",
      error: { code: "INTERNAL", message: t.errors.saveFailed, retryable: true },
    });
    await ready();
    fireEvent.submit(importButton().closest("form")!);
    await flush();
    expect(screen.getByRole("alert").textContent).toContain(t.errors.saveFailed);
    expect(title().value).toBe("procedure-conges");
    expect(category().value).toBe("procedure");
    fireEvent.click(screen.getByRole("button", { name: t.retry }));
    await flush();
    const [first, second] = mocks.importFileAction.mock.calls.map(([data]) => (data as FormData).get("clientRequestId"));
    expect(second).toBe(first);
  });

  it("au-delà de 10 s sans réponse : formulaire déverrouillé, alerte réessayable", async () => {
    vi.useFakeTimers();
    try {
      mocks.importFileAction.mockImplementation(hang);
      await ready();
      fireEvent.submit(importButton().closest("form")!);
      await act(async () => {});
      expect(importButton().getAttribute("aria-disabled")).toBe("true");
      await act(async () => vi.advanceTimersByTime(10_000));
      expect(screen.getByRole("alert").textContent).toContain(t.errors.saveFailed);
      expect(importButton().hasAttribute("aria-disabled")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("« Annuler » avec seulement un fichier déposé : confirmation d'abandon", async () => {
    render(<FileForm />);
    await choose(file("seul.txt"));
    fireEvent.change(title(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    expect(screen.getByRole("alertdialog", { name: t.abandon.title })).toBeTruthy();
  });

  it("glisser-déposer : même contrôle et même dépôt que le sélecteur", async () => {
    render(<FileForm />);
    const zone = document.querySelector("[data-drop-zone]")!;
    fireEvent.drop(zone, { dataTransfer: { files: [file("rapport.docx")] } });
    await flush();
    expect(fileStatus().textContent).toBe(t.errors.fileFormat);
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    fireEvent.drop(zone, { dataTransfer: { files: [file("depose.md")] } });
    await flush();
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(title().value).toBe("depose");
  });

  it("refus de la base puis « Réessayer » réussi : le message d'échec disparaît, « Fichier déposé » revient", async () => {
    mocks.importFileAction.mockResolvedValue({ status: "invalid", fieldErrors: { file: t.errors.uploadFailed } });
    await ready();
    fireEvent.submit(importButton().closest("form")!);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: t.retry }));
    await flush();
    expect(fileStatus().textContent).toBe(t.uploaded("procedure-conges.md"));
  });

  it("import en cours : un nouveau fichier est ignoré (la demande envoyée ne change pas de fichier)", async () => {
    mocks.importFileAction.mockImplementation(hang);
    await ready();
    fireEvent.submit(importButton().closest("form")!);
    await flush();
    await choose(file("autre.md"));
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(fileStatus().textContent).toBe(t.uploaded("procedure-conges.md"));
  });
});
