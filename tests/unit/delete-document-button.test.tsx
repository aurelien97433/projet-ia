// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteDocumentButton } from "@/components/documents/delete-document-button";
import { DocumentStatusProvider, type Status } from "@/components/documents/document-status-provider";
import { StatusBanner } from "@/components/documents/status-banner";
import { texts } from "@/lib/texts";

// Bouton « Supprimer » (story 3.4) : dialogue de confirmation, focus par défaut sur « Annuler »,
// succès (notification puis Bibliothèque), refus, Document déjà supprimé, état occupé.
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  deleteDocumentAction: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock("@/app/(app)/documents/[id]/actions", () => ({
  deleteDocumentAction: (...args: unknown[]) => mocks.deleteDocumentAction(...args),
  retryProcessingAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const d = texts.deleteDocument;
const ready: Status = { effectiveStatus: "ready", effectiveErrorKind: null, effectiveErrorMessage: null, processingElapsedMs: 0 };

function renderButton() {
  return render(
    <DocumentStatusProvider documentId="d1" {...ready}>
      <StatusBanner documentId="d1" title="Procédure de facturation" isAuthor />
      <DeleteDocumentButton documentId="d1" title="Procédure de facturation" />
    </DocumentStatusProvider>,
  );
}

const openDialog = async () => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: d.action })));
  return screen.getByRole("alertdialog");
};

const confirm = async () => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: d.confirm })));
};

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.push.mockReset();
  mocks.deleteDocumentAction.mockReset();
  mocks.toast.mockReset();
  mocks.toast.error.mockReset();
});

afterEach(() => cleanup());

describe("DeleteDocumentButton", () => {
  it("ouvre le dialogue du catalogue, focus sur « Annuler »", async () => {
    renderButton();
    const dialog = await openDialog();
    expect(dialog.textContent).toContain(d.title("Procédure de facturation"));
    expect(dialog.textContent).toContain(d.text);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: d.cancel }));
  });

  it("« Annuler » : rien n'est supprimé, le focus revient au bouton", async () => {
    renderButton();
    await openDialog();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: d.cancel })));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.deleteDocumentAction).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: d.action }));
  });

  it("confirmation : action appelée une fois, notification, retour à la Bibliothèque", async () => {
    mocks.deleteDocumentAction.mockResolvedValue({ status: "ok" });
    renderButton();
    await openDialog();
    await confirm();
    expect(mocks.deleteDocumentAction).toHaveBeenCalledExactlyOnceWith("d1");
    expect(mocks.toast).toHaveBeenCalledWith(d.done);
    expect(mocks.push).toHaveBeenCalledWith("/bibliotheque");
    // Occupé jusqu'au changement d'écran : un nouveau clic n'ouvre plus le dialogue.
    const busy = screen.getByRole("button", { name: d.deleting });
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    await act(async () => fireEvent.click(busy));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("refus (autre Auteur) : notification « Cette action n'est pas autorisée. », rien ne change", async () => {
    mocks.deleteDocumentAction.mockResolvedValue({
      status: "error",
      error: { code: "FORBIDDEN", message: d.forbidden, retryable: false },
    });
    renderButton();
    await openDialog();
    await confirm();
    expect(mocks.toast.error).toHaveBeenCalledWith(d.forbidden);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: d.action }).getAttribute("aria-disabled")).toBeNull();
  });

  it("Document déjà supprimé : état « supprimé » de la page, sans notification", async () => {
    mocks.deleteDocumentAction.mockResolvedValue({
      status: "error",
      error: { code: "NOT_FOUND", message: texts.documentStatus.deleted, retryable: false },
    });
    renderButton();
    await openDialog();
    await confirm();
    expect(screen.getByRole("status").textContent).toContain(texts.documentStatus.deleted);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("session expirée : rafraîchissement (le serveur redirige)", async () => {
    mocks.deleteDocumentAction.mockResolvedValue({
      status: "error",
      error: { code: "UNAUTHENTICATED", message: "m", retryable: false },
    });
    renderButton();
    await openDialog();
    await confirm();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("exception réseau : notification d'échec, bouton de nouveau utilisable", async () => {
    mocks.deleteDocumentAction.mockRejectedValue(new Error("réseau"));
    renderButton();
    await openDialog();
    await confirm();
    expect(mocks.toast.error).toHaveBeenCalledWith(d.failed);
    expect(screen.getByRole("button", { name: d.action })).toBeTruthy();
  });
});
