// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Suspense, use, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";
import { DEFAULT_LIBRARY_FILTERS } from "@/lib/schemas/library";
import type { LibraryDocument, LibraryPage } from "@/server/documents/list-documents";

// Tableau de bord (E3) : la liste « Derniers Documents » est un composant serveur ; ses dépendances
// (session, client Supabase, lecture) sont simulées. L'erreur de lecture ne peut pas être provoquée
// en e2e (lecture côté serveur) : elle est prouvée ici.
const refresh = vi.fn();
const router = { refresh, push: vi.fn(), prefetch: vi.fn() };
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ useRouter: () => router, redirect: (path: string) => redirect(path) }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const supabase = { marker: "client du Collaborateur" };
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => supabase) }));
const getCurrentUser = vi.fn();
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
const listDocuments = vi.fn();
vi.mock("@/server/documents/list-documents", () => ({
  listDocuments: (...args: unknown[]) => listDocuments(...args),
}));

const { RecentDocuments } = await import("@/components/dashboard/recent-documents");
const { RecentDocumentsError } = await import("@/components/dashboard/recent-documents-error");
const { RecentDocumentsList } = await import("@/components/dashboard/recent-documents-list");
const { RecentDocumentsSkeleton } = await import("@/components/dashboard/recent-documents-skeleton");

const ME = "moi";
const NEVER = new Promise<never>(() => {});

function doc(id: string, overrides: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    id,
    title: `Document ${id}`,
    category: "procedure",
    authorId: "autre",
    authorName: "Camille",
    createdAt: "2026-11-10T09:00:00.000Z",
    effectiveStatus: "ready",
    ...overrides,
  };
}

const page = (documents: LibraryDocument[]): LibraryPage => ({ documents, total: documents.length });
const items = () => screen.getAllByRole("listitem");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  refresh.mockReset();
  redirect.mockClear();
  listDocuments.mockReset();
  getCurrentUser.mockReset();
  getCurrentUser.mockResolvedValue({ id: ME, email: "moi@nexaworks.test" });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Derniers Documents (composant serveur)", () => {
  it("lit 5 lignes au plus, filtres par défaut, jeton du Collaborateur ; titre en lien unique, Catégorie · Auteur, badge", async () => {
    listDocuments.mockResolvedValue(
      page([doc("a", { category: "faq", effectiveStatus: "processing" }), doc("b", { authorName: "Lou" }), doc("c", { effectiveStatus: "error" })]),
    );
    render(await RecentDocuments());

    expect(listDocuments).toHaveBeenCalledWith(DEFAULT_LIBRARY_FILTERS, ME, supabase, 5);
    expect(items()).toHaveLength(3);
    expect(items().map((item) => item.getAttribute("data-document-id"))).toEqual(["a", "b", "c"]);
    for (const item of items()) expect(within(item).getAllByRole("link")).toHaveLength(1);
    const first = within(items()[0]).getByRole("link");
    expect(first.textContent).toBe("Document a");
    expect(first.getAttribute("href")).toBe("/documents/a");
    expect(items()[0].textContent).toContain(`${texts.categories.faq} · Camille`);
    expect(items()[0].textContent).toContain(texts.status.processing);
    expect(items()[1].textContent).toContain(`${texts.categories.procedure} · Lou`);
    expect(items()[1].textContent).toContain(texts.status.ready);
    expect(items()[2].textContent).toContain(texts.status.error);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Base vide : message et « Ajouter un Document »", async () => {
    listDocuments.mockResolvedValue(page([]));
    render(await RecentDocuments());
    expect(screen.getByText(texts.library.emptyBase)).toBeTruthy();
    expect(screen.getByRole("link", { name: texts.library.addDocument }).getAttribute("href")).toBe("/ajouter");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lecture en échec : alerte et « Réessayer » dans la liste, aucune exception", async () => {
    listDocuments.mockRejectedValue(new Error("Lecture de la Bibliothèque impossible"));
    render(await RecentDocuments());
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(texts.library.loadFailed);
    expect(within(alert).getByRole("button", { name: texts.library.retry })).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("sans session : redirection vers la connexion, aucune lecture", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(RecentDocuments()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(listDocuments).not.toHaveBeenCalled();
  });
});

describe("« Réessayer »", () => {
  // Simule router.refresh : une mise à jour qui suspend jusqu'à la réponse du serveur. Lancée dans une
  // transition, elle garde l'interface affichée et l'état occupé jusqu'à cette réponse.
  function Harness() {
    const [request, setRequest] = useState<Promise<void> | null>(null);
    refresh.mockImplementation(() => {
      setRequest(
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
      );
    });
    return (
      <>
        <RecentDocumentsError />
        <Suspense fallback={<p>repli</p>}>{request ? <Pending request={request} /> : null}</Suspense>
      </>
    );
  }
  function Pending({ request }: { request: Promise<void> }) {
    use(request);
    return null;
  }
  let resolveRefresh: () => void = () => {};

  it("relit la liste par router.refresh, aria-disabled pendant la relecture, un seul appel par clic", async () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: texts.library.retry });
    expect(button.getAttribute("aria-disabled")).toBeNull();

    await act(async () => fireEvent.click(button));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByText("repli")).toBeNull();

    // Pendant la relecture, un second clic est sans effet ; le bouton reste focalisable.
    await act(async () => fireEvent.click(button));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute("disabled")).toBe(false);

    await act(async () => resolveRefresh());
    expect(button.getAttribute("aria-disabled")).toBeNull();
  });
});

describe("squelette", () => {
  it("5 lignes masquées aux lecteurs d'écran, puis message des 10 s", () => {
    const { container } = render(<RecentDocumentsSkeleton />);
    expect(container.querySelectorAll("[data-skeleton-rows] > div")).toHaveLength(5);
    expect(container.querySelector("[data-skeleton-rows]")?.closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain(texts.document.loadingSlow);
  });
});

describe("suivi des badges (Q3)", () => {
  it("toutes les 3 s pour les lignes en cours ; mis à jour sans rechargement, annoncé pour ses Documents seulement", async () => {
    vi.useFakeTimers();
    render(
      <RecentDocumentsList
        documents={[
          doc("a", { effectiveStatus: "processing", authorId: ME, title: "Ma Note" }),
          doc("b", { effectiveStatus: "processing", title: "Note d'un collègue" }),
          doc("c"),
        ]}
        userId={ME}
      />,
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(json({ statuses: [{ id: "a", effectiveStatus: "ready" }, { id: "b", effectiveStatus: "error" }] }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/documents/statuses?ids=a,b"]);
    expect(items()[0].textContent).toContain(texts.status.ready);
    expect(items()[1].textContent).toContain(texts.status.error);
    const live = Array.from(document.querySelectorAll("[aria-live='polite']")).map((zone) => zone.textContent);
    expect(live).toContain(texts.library.statusChanged("Ma Note", texts.status.ready));
    expect(document.body.textContent).not.toContain("« Note d'un collègue »");

    // Plus aucune ligne en cours : le suivi s'arrête.
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("page du Tableau de bord", () => {
  it("bande d'actions et en-tête hors de la frontière de la liste : affichés pendant le chargement, champ de Recherche, sans « Poser une question »", async () => {
    vi.doMock("@/components/dashboard/recent-documents", () => ({
      // Lecture qui ne se termine jamais : la frontière reste sur son squelette.
      RecentDocuments: () => use(NEVER),
    }));
    vi.resetModules();
    const { default: DashboardPage } = await import("@/app/(app)/page");
    const { container } = render(<DashboardPage />);

    expect(screen.getByRole("heading", { level: 1, name: texts.titles.dashboard })).toBeTruthy();
    const add = screen.getByRole("link", { name: texts.library.addDocument });
    expect(add.getAttribute("href")).toBe("/ajouter");
    expect(screen.getByRole("heading", { level: 2, name: texts.dashboard.recentDocuments })).toBeTruthy();
    expect(screen.getByRole("link", { name: texts.dashboard.seeLibrary }).getAttribute("href")).toBe("/bibliotheque");
    expect(container.querySelectorAll("[data-skeleton-rows] > div")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /poser une question/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /poser une question/i })).toBeNull();
    // Champ de Recherche ajouté par la story 4.1b, en tête de la bande d'actions.
    expect(screen.getByRole("searchbox", { name: texts.dashboard.searchLabel })).toBeTruthy();
    vi.doUnmock("@/components/dashboard/recent-documents");
  });
});
