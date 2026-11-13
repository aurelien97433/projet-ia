// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentActions } from "@/components/documents/document-actions";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { DocumentStatusProvider, type Status } from "@/components/documents/document-status-provider";
import { StatusBanner } from "@/components/documents/status-banner";
import { texts } from "@/lib/texts";

const refresh = vi.fn();
const push = vi.fn();
const router = { refresh, push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const retryProcessingAction = vi.fn();
const deleteDocumentAction = vi.fn();
vi.mock("@/app/(app)/documents/[id]/actions", () => ({
  retryProcessingAction: (...args: unknown[]) => retryProcessingAction(...args),
  deleteDocumentAction: (...args: unknown[]) => deleteDocumentAction(...args),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const t = texts.documentStatus;
const processing: Status = {
  effectiveStatus: "processing",
  effectiveErrorKind: null,
  effectiveErrorMessage: null,
  processingElapsedMs: 0,
};
const ready: Status = { ...processing, effectiveStatus: "ready" };
const failed: Status = {
  ...processing,
  effectiveStatus: "error",
  effectiveErrorKind: "temporary",
  effectiveErrorMessage: t.temporaryAuthor,
};

function page(status: Status, isAuthor = true) {
  return (
    <DocumentStatusProvider documentId="d1" {...status}>
      <p data-testid="badge">
        <DocumentStatusBadge />
      </p>
      <div data-testid="banner">
        <StatusBanner documentId="d1" title="Procédure" isAuthor={isAuthor} />
      </div>
      <div data-testid="actions">
        <DocumentActions documentId="d1" title="Procédure" isAuthor={isAuthor} />
      </div>
    </DocumentStatusProvider>
  );
}

const badgeText = () => screen.getByTestId("badge").textContent;
const bannerText = () => screen.getByTestId("banner").textContent;
const respondWith = (status: Status) => vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(status)));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  push.mockClear();
  retryProcessingAction.mockReset();
  deleteDocumentAction.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("source unique du Statut", () => {
  it("en cours puis prêt : badge et bandeau changent au même rendu, sans attendre le serveur", async () => {
    const { container } = render(page(processing));
    expect(badgeText()).toContain(texts.status.processing);
    expect(bannerText()).toContain(t.processingTitle);

    // Observateur appelé après chaque rendu validé : aucun rendu ne montre un état mixte.
    const states: [boolean, boolean][] = [];
    const observer = new MutationObserver(() => {
      states.push([badgeText()!.includes(texts.status.ready), bannerText()!.includes(t.ready)]);
    });
    observer.observe(container, { subtree: true, childList: true, characterData: true });

    respondWith(ready);
    await advance(3_000);
    observer.disconnect();

    expect(badgeText()).toContain(texts.status.ready);
    expect(bannerText()).toContain(t.ready);
    expect(states.length).toBeGreaterThan(0);
    for (const [badge, banner] of states) expect(badge).toBe(banner);
  });

  it("Statut reçu du serveur : badge et bandeau s'alignent ensemble et le suivi reprend", async () => {
    const { rerender } = render(page(ready));
    expect(bannerText()).toBe("");
    rerender(page(processing));
    expect(badgeText()).toContain(texts.status.processing);
    expect(bannerText()).toContain(t.processingTitle);

    respondWith(ready);
    await advance(3_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bannerText()).toContain(t.ready);
  });

  it("réponse périmée identique à la précédente : le Statut suivi est conservé", async () => {
    const { rerender } = render(page(processing));
    respondWith(ready);
    await advance(3_000);
    rerender(page(processing));
    expect(badgeText()).toContain(texts.status.ready);
    expect(bannerText()).toContain(t.ready);
  });

  it("le serveur n'a pas rattrapé : rafraîchit, dans une limite de 6 requêtes", async () => {
    render(page(processing));
    respondWith(ready);
    await advance(3_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(refresh).toHaveBeenCalledTimes(6);
  });

  it("le serveur a rattrapé : aucun rafraîchissement supplémentaire", async () => {
    const { rerender } = render(page(processing));
    respondWith(ready);
    await advance(3_000);
    rerender(page(ready));
    await advance(30_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("relance : le Statut renvoyé alimente aussi le badge", async () => {
    retryProcessingAction.mockResolvedValue({ status: "ok", view: processing });
    render(page(failed));
    expect(badgeText()).toContain(texts.status.error);
    fireEvent.click(screen.getByRole("button", { name: t.retry }));
    await advance(0);
    expect(badgeText()).toContain(texts.status.processing);
    expect(bannerText()).toContain(t.processingTitle);
  });

  it("le fournisseur ne s'utilise pas sans contexte", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<DocumentStatusBadge />)).toThrow("DocumentStatusProvider");
  });
});

const noText: Status = {
  ...processing,
  effectiveStatus: "error",
  effectiveErrorKind: "no_text",
  effectiveErrorMessage: t.noText,
};
const d = texts.deleteDocument;
const buttonsIn = (testId: string) =>
  Array.from(screen.getByTestId(testId).querySelectorAll("button")).map((button) => button.textContent);

describe("barre d'actions (story 3.4)", () => {
  it.each([
    ["Auteur, prêt", ready],
    ["Auteur, en cours", processing],
    ["Auteur, erreur temporaire", failed],
  ] as const)("%s : « Supprimer » dans la barre", (_label, status) => {
    render(page(status, true));
    expect(buttonsIn("actions")).toEqual([d.action]);
  });

  it.each([
    ["prêt", ready],
    ["en cours", processing],
    ["sans texte exploitable", noText],
  ] as const)("autre Collaborateur, %s : aucun « Supprimer »", (_label, status) => {
    render(page(status, false));
    expect(screen.getByTestId("actions").childNodes).toHaveLength(0);
    expect(buttonsIn("banner")).not.toContain(d.action);
  });

  it("Auteur, sans texte exploitable : « Supprimer » dans le bandeau seulement, sans relance", () => {
    render(page(noText, true));
    expect(bannerText()).toContain(t.noText);
    expect(buttonsIn("banner")).toEqual([d.action]);
    expect(screen.getByTestId("actions").childNodes).toHaveLength(0);
  });
});

describe("Document supprimé pendant la consultation (story 3.4)", () => {
  const respond = (status: number) =>
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status }));

  it("404 de l'interrogation : message, retour à la Bibliothèque, plus d'action ni de suivi", async () => {
    respond(404);
    render(page(processing, true));
    await advance(3_000);
    expect(bannerText()).toContain(t.deleted);
    expect(bannerText()).not.toContain(t.processingTitle);
    expect(screen.getByRole("link", { name: t.backToLibrary }).getAttribute("href")).toBe("/bibliotheque");
    expect(screen.getByTestId("actions").childNodes).toHaveLength(0);
    expect(buttonsIn("banner")).toEqual([]);
    await advance(10_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("401 de l'interrogation : le serveur décide (rafraîchissement), pas d'état supprimé", async () => {
    respond(401);
    render(page(processing, true));
    await advance(3_000);
    expect(refresh).toHaveBeenCalled();
    expect(bannerText()).not.toContain(t.deleted);
  });

  it("relance refusée en NOT_FOUND : état supprimé, sans rafraîchissement", async () => {
    retryProcessingAction.mockResolvedValue({ status: "error", error: { code: "NOT_FOUND", message: "x", retryable: false } });
    render(page(failed, true));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: t.retry })));
    expect(bannerText()).toContain(t.deleted);
    expect(refresh).not.toHaveBeenCalled();
  });
});
