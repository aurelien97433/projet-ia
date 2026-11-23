// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentActions } from "@/components/documents/document-actions";
import { DocumentStatusProvider, type Status } from "@/components/documents/document-status-provider";
import { DocumentSummaryProvider, SummaryBlock } from "@/components/documents/document-summary";
import { appError } from "@/lib/errors";
import type { QuotaState } from "@/lib/quota";
import { formatResetMoment } from "@/lib/reset-moment";
import type { StoredSummary } from "@/lib/schemas/summary";
import { texts } from "@/lib/texts";

// Bloc Résumé et bouton « Générer le Résumé » de la page Document (story 6.1, EXPERIENCE.md E7) : états
// (prêt sans Résumé, génération, succès, Résumé déjà généré, Document non prêt, quota au chargement et à
// la demande, panne, plafond du fournisseur), bouton en aria-disabled, annonce « Résumé généré. », focus.
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("@/app/(app)/documents/[id]/actions", () => ({ deleteDocumentAction: vi.fn(), retryProcessingAction: vi.fn() }));

const t = texts.summary;
const DOC = "d1d1d1d1-0000-4000-8000-000000000001";
const ready: Status = { effectiveStatus: "ready", effectiveErrorKind: null, effectiveErrorMessage: null, processingElapsedMs: 0 };
const processing: Status = { ...ready, effectiveStatus: "processing" };
const SUMMARY: StoredSummary = {
  points: ["La procédure prévoit une validation.", "Le Document indique un délai de 30 jours."],
  generatedAt: "2026-11-23T10:00:00.000Z",
  textVersion: 1,
};
const fetchMock = vi.fn();

function renderPage({ status = ready, summary = null, quota = null }: { status?: Status; summary?: StoredSummary | null; quota?: QuotaState | null } = {}) {
  return render(
    <div>
      <button type="button">Ailleurs</button>
      <DocumentStatusProvider documentId={DOC} {...status}>
        <DocumentSummaryProvider documentId={DOC} initialSummary={summary} quota={quota}>
          <DocumentActions documentId={DOC} title="Procédure de facturation" isAuthor={false} />
          <SummaryBlock />
        </DocumentSummaryProvider>
      </DocumentStatusProvider>
    </div>,
  );
}

const generateButton = () => screen.getByRole("button", { name: new RegExp(`^(${t.generate}|${t.generating})$`) });
const status = () => screen.getByRole("status");

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Document prêt sans Résumé", () => {
  it("« Générer le Résumé » dans la barre d'actions ; aucun appel au chargement", () => {
    renderPage();
    const actions = screen.getByRole("group", { name: texts.document.actionsLabel });
    expect(actions.contains(generateButton())).toBe(true);
    expect(generateButton().getAttribute("aria-disabled")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(t.notReady)).toBeNull();
  });

  it("génération : « Génération du Résumé… » en aria-disabled, squelette ; succès : points et mention au-dessus, annonce, bouton retiré, focus sur le Résumé", async () => {
    const pending = deferred();
    fetchMock.mockReturnValue(pending.promise);
    renderPage();
    generateButton().focus();
    await act(async () => fireEvent.click(generateButton()));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/documents/${DOC}/summary`);
    expect(init.method).toBe("POST");
    expect(generateButton().textContent).toBe(t.generating);
    expect(generateButton().getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelector("[data-summary-skeleton]")).not.toBeNull();

    // Seconde activation ignorée.
    await act(async () => fireEvent.click(generateButton()));
    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => pending.resolve(Response.json({ summary: SUMMARY, generated: true })));
    const block = document.querySelector("[data-summary-block]") as HTMLElement;
    expect(block).not.toBeNull();
    expect(screen.getByRole("heading", { name: t.title })).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(SUMMARY.points);
    expect(block.textContent).toContain(t.mention(new Date(SUMMARY.generatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })));
    expect(status().textContent).toBe(t.generated);
    expect(screen.queryByRole("button", { name: t.generate })).toBeNull();
    expect(document.activeElement).toBe(block);
  });

  it("Résumé déjà à jour renvoyé par le serveur (generated faux) : simplement affiché", async () => {
    fetchMock.mockResolvedValue(Response.json({ summary: SUMMARY, generated: false }));
    renderPage();
    await act(async () => fireEvent.click(generateButton()));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("panne : alerte « Le Résumé n'a pas pu être généré. » avec « Réessayer », focus sur l'alerte annoncée une fois ; « Réessayer » relance", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(appError("AI_UNAVAILABLE", t.failed, true), { status: 503 }));
    renderPage();
    generateButton().focus();
    await act(async () => fireEvent.click(generateButton()));
    const alert = document.querySelector("[data-error-alert]") as HTMLElement;
    expect(alert.textContent).toContain(t.failed);
    // Focus déplacé sur l'alerte : groupe nommé par son titre, sans role="alert" (règle de la 5.10).
    expect(document.activeElement).toBe(alert);
    expect(alert.getAttribute("role")).toBe("group");
    expect(screen.getByRole("group", { name: t.failed })).toBe(alert);

    fetchMock.mockResolvedValueOnce(Response.json({ summary: SUMMARY, generated: true }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: t.retry })));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[data-error-alert]")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("panne alors que le focus est ailleurs : role=\"alert\", focus laissé en place", async () => {
    const pending = deferred();
    fetchMock.mockReturnValue(pending.promise);
    renderPage();
    await act(async () => fireEvent.click(generateButton()));
    screen.getByRole("button", { name: "Ailleurs" }).focus();
    await act(async () => pending.resolve(Response.json(appError("AI_TIMEOUT", t.failed, true), { status: 504 })));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.failed);
    expect(document.activeElement?.textContent).toBe("Ailleurs");
  });

  it("délai de la page (130 s) ou réseau : même alerte avec « Réessayer »", async () => {
    fetchMock.mockRejectedValue(new DOMException("délai", "TimeoutError"));
    renderPage();
    await act(async () => fireEvent.click(generateButton()));
    expect(document.querySelector("[data-error-alert]")?.textContent).toContain(t.failed);
    expect(screen.getByRole("button", { name: t.retry })).toBeTruthy();
  });

  it("Résumé déjà en cours de génération (409, verrou) : alerte avec le texte du catalogue et « Réessayer »", async () => {
    fetchMock.mockResolvedValue(Response.json(appError("REQUEST_IN_PROGRESS", t.inProgress, false), { status: 409 }));
    renderPage();
    await act(async () => fireEvent.click(generateButton()));
    const alert = document.querySelector("[data-error-alert]") as HTMLElement;
    expect(alert.textContent).toContain(t.failed);
    expect(alert.textContent).toContain(t.inProgress);
    expect(screen.getByRole("button", { name: t.retry })).toBeTruthy();
  });

  it("plafond du fournisseur : alerte sans « Réessayer »", async () => {
    fetchMock.mockResolvedValue(Response.json(appError("AI_BUDGET_EXHAUSTED", texts.assistant.budgetExhausted, false), { status: 503 }));
    renderPage();
    await act(async () => fireEvent.click(generateButton()));
    const alert = document.querySelector("[data-error-alert]") as HTMLElement;
    expect(alert.textContent).toContain(t.failed);
    expect(alert.textContent).toContain(texts.assistant.budgetExhausted);
    expect(screen.queryByRole("button", { name: t.retry })).toBeNull();
  });

  it("Document supprimé entre-temps (404) : état « supprimé » de la page, plus de bouton", async () => {
    fetchMock.mockResolvedValue(Response.json(appError("NOT_FOUND", texts.notFound.text, false), { status: 404 }));
    renderPage();
    await act(async () => fireEvent.click(generateButton()));
    expect(screen.queryByRole("button", { name: t.generate })).toBeNull();
    expect(document.querySelector("[data-error-alert]")).toBeNull();
  });
});

describe("Résumé déjà généré (autre Collaborateur, rechargement)", () => {
  it("bloc affiché d'emblée au-dessus, sans bouton ni appel", () => {
    renderPage({ summary: SUMMARY });
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(SUMMARY.points);
    expect(screen.queryByRole("button", { name: t.generate })).toBeNull();
    expect(status().textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Document non prêt", () => {
  it("en cours : pas de bouton, « Le Résumé sera disponible quand le Document sera prêt. »", () => {
    renderPage({ status: processing });
    expect(screen.queryByRole("button", { name: t.generate })).toBeNull();
    expect(screen.getByText(t.notReady)).toBeTruthy();
  });

  it("en erreur : même message, aucun Résumé affiché même s'il existait", () => {
    renderPage({ status: { ...ready, effectiveStatus: "error", effectiveErrorKind: "temporary" }, summary: SUMMARY });
    expect(screen.getByText(t.notReady)).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("refus DOCUMENT_NOT_READY à la demande : message d'attente, page resynchronisée", async () => {
    fetchMock.mockResolvedValue(Response.json(appError("DOCUMENT_NOT_READY", t.notReady, false), { status: 409 }));
    renderPage();
    await act(async () => fireEvent.click(generateButton()));
    expect(screen.getByText(t.notReady)).toBeTruthy();
    expect(mocks.refresh).toHaveBeenCalled();
  });
});

describe("quota quotidien", () => {
  const resetAt = new Date(Date.now() + 3_600_000).toISOString();

  it("atteint au chargement : bloc neutre avec l'heure locale, bouton en aria-disabled décrit par le bloc, aucun appel", async () => {
    renderPage({ quota: { used: 60, limit: 60, resetAt } });
    const block = document.querySelector("[data-summary-quota]") as HTMLElement;
    expect(block.textContent).toBe(t.quotaExceeded(formatResetMoment(resetAt, new Date())));
    expect(block.getAttribute("role")).toBeNull();
    expect(block.textContent).not.toContain("(UTC)");
    const button = generateButton();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy && document.getElementById(describedBy)?.textContent).toBe(block.textContent);
    await act(async () => fireEvent.click(button));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sous la limite : page normale", () => {
    renderPage({ quota: { used: 59, limit: 60, resetAt } });
    expect(document.querySelector("[data-summary-quota]")).toBeNull();
    expect(generateButton().getAttribute("aria-disabled")).toBeNull();
  });

  it("QUOTA_EXCEEDED à la demande : bloc neutre, aucune alerte d'erreur", async () => {
    fetchMock.mockResolvedValue(Response.json(appError("QUOTA_EXCEEDED", "x", false, resetAt), { status: 429 }));
    renderPage();
    await act(async () => fireEvent.click(generateButton()));
    expect(document.querySelector("[data-summary-quota]")).not.toBeNull();
    expect(document.querySelector("[data-error-alert]")).toBeNull();
    expect(generateButton().getAttribute("aria-disabled")).toBe("true");
  });

  it("réactivation sans rechargement au moment du rétablissement", async () => {
    renderPage({ quota: { used: 60, limit: 60, resetAt: new Date(Date.now() + 80).toISOString() } });
    expect(generateButton().getAttribute("aria-disabled")).toBe("true");
    await waitFor(() => expect(document.querySelector("[data-summary-quota]")).toBeNull());
    expect(generateButton().getAttribute("aria-disabled")).toBeNull();
  });
});
