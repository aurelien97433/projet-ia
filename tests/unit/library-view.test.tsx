// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryView, SEARCH_DELAY_MS } from "@/components/library/library-view";
import { texts } from "@/lib/texts";
import type { LibraryDocument, LibraryPage } from "@/server/documents/list-documents";

const refresh = vi.fn();
const router = { refresh, push: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = texts.library;
const ME = "moi";

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

const page = (documents: LibraryDocument[], total = documents.length): LibraryPage => ({ documents, total });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = () => vi.mocked(fetch);
const urls = () => fetchMock().mock.calls.map(([url]) => String(url));
const listUrls = () => urls().filter((url) => url.startsWith("/api/documents") && !url.includes("statuses"));
const statusUrls = () => urls().filter((url) => url.includes("/api/documents/statuses"));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const count = () => screen.getByText(/Documents?$|^Aucun Document$/, { selector: "p" });
const table = () => screen.getByRole("table");
const rows = () => within(table()).getAllByRole("row").slice(1);

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("première liste", () => {
  it("lignes du serveur sans requête, titre en lien unique, nombre dans une zone annoncée", () => {
    render(<LibraryView initial={page([doc("a"), doc("b", { category: "faq" })])} userId={ME} />);
    expect(fetch).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(2);
    const links = within(rows()[0]).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveProperty("textContent", "Document a");
    expect(links[0].getAttribute("href")).toBe("/documents/a");
    expect(rows()[1].textContent).toContain(texts.categories.faq);
    expect(rows()[1].textContent).toContain("Camille");
    expect(rows()[1].textContent).toContain(texts.status.ready);
    expect(count().textContent).toBe("2 Documents");
    expect(count().closest("[aria-live='polite']")).not.toBeNull();
    // Les en-têtes ne trient pas : aucun bouton dans le tableau.
    expect(within(table()).queryAllByRole("button")).toHaveLength(0);
  });

  it("nombre : 1 Document, et au-delà de 200 lignes le total exact avec le message", () => {
    const { unmount } = render(<LibraryView initial={page([doc("a")])} userId={ME} />);
    expect(count().textContent).toBe("1 Document");
    unmount();
    render(<LibraryView initial={page([doc("a")], 412)} userId={ME} />);
    expect(count().textContent).toBe("412 Documents");
    expect(screen.getByText(t.truncated(1))).toBeTruthy();
  });

  it("lecture serveur impossible : alerte et « Réessayer »", async () => {
    render(<LibraryView initial={null} userId={ME} />);
    expect(screen.getByRole("alert").textContent).toContain(t.loadFailed);
    fetchMock().mockResolvedValue(json(page([doc("a")])));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: t.retry })));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(rows()).toHaveLength(1);
  });
});

describe("filtres", () => {
  it("recherche : une seule requête 250 ms après la dernière frappe", async () => {
    render(<LibraryView initial={page([doc("a")])} userId={ME} />);
    fetchMock().mockResolvedValue(json(page([])));
    const search = screen.getByLabelText(t.searchLabel);
    fireEvent.change(search, { target: { value: "f" } });
    await advance(200);
    fireEvent.change(search, { target: { value: "factu" } });
    await advance(SEARCH_DELAY_MS - 1);
    expect(fetch).not.toHaveBeenCalled();
    await advance(1);
    expect(listUrls()).toEqual(["/api/documents?search=factu"]);
  });

  it("combinaison : Catégorie, Mes Documents, recherche et tri cumulés", async () => {
    render(<LibraryView initial={page([doc("a")])} userId={ME} />);
    fetchMock().mockImplementation(async () => json(page([doc("a")])));
    fireEvent.change(screen.getByLabelText(t.categoryLabel), { target: { value: "procedure" } });
    const mine = screen.getByRole("switch", { name: t.mine });
    expect(mine.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(mine);
    expect(mine.getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText(t.searchLabel), { target: { value: "FACTU" } });
    fireEvent.change(screen.getByLabelText(t.sortLabel), { target: { value: "oldest" } });
    await advance(SEARCH_DELAY_MS);
    // Le tri part aussitôt et emporte la recherche en attente : aucune requête de plus à 250 ms.
    expect(listUrls().at(-1)).toBe("/api/documents?category=procedure&mine=true&search=FACTU&sort=oldest");
    expect(listUrls()).toHaveLength(3);
  });

  it("réponse périmée ignorée : seule la requête la plus récente compte, la précédente est annulée", async () => {
    render(<LibraryView initial={page([doc("a")])} userId={ME} />);
    let resolveFirst: (response: Response) => void = () => {};
    const signals: AbortSignal[] = [];
    fetchMock()
      .mockImplementationOnce((_url, init) => {
        signals.push(init!.signal!);
        return new Promise((resolve) => (resolveFirst = resolve));
      })
      .mockImplementationOnce(async (_url, init) => {
        signals.push(init!.signal!);
        return json(page([doc("recent")]));
      });
    fireEvent.change(screen.getByLabelText(t.categoryLabel), { target: { value: "faq" } });
    fireEvent.change(screen.getByLabelText(t.categoryLabel), { target: { value: "procedure" } });
    await advance(0);
    expect(signals[0].aborted).toBe(true);
    await act(async () => resolveFirst(json(page([doc("perime"), doc("perime2")]))));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("Document recent");
    expect(count().textContent).toBe("1 Document");
  });

  it("le nombre est remplacé à chaque résultat de filtre, même identique", async () => {
    render(<LibraryView initial={page([doc("a")])} userId={ME} />);
    const before = count();
    fetchMock().mockImplementation(async () => json(page([doc("a")])));
    fireEvent.click(screen.getByRole("switch", { name: t.mine }));
    await advance(0);
    expect(count().textContent).toBe("1 Document");
    expect(count()).not.toBe(before);
  });
});

describe("états", () => {
  async function filterTo(result: LibraryPage, trigger: () => void) {
    fetchMock().mockResolvedValue(json(result));
    trigger();
    await advance(SEARCH_DELAY_MS);
  }

  it("Base vide : message et « Ajouter un Document »", () => {
    render(<LibraryView initial={page([])} userId={ME} />);
    expect(screen.getByText(t.emptyBase)).toBeTruthy();
    expect(screen.getByRole("link", { name: t.addDocument }).getAttribute("href")).toBe("/ajouter");
    expect(count().textContent).toBe("Aucun Document");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("« Mes Documents » seul et vide : invitation à ajouter", async () => {
    render(<LibraryView initial={page([doc("a")])} userId={ME} />);
    await filterTo(page([]), () => fireEvent.click(screen.getByRole("switch", { name: t.mine })));
    expect(screen.getByText(t.emptyMine)).toBeTruthy();
    expect(screen.getByRole("link", { name: t.addDocument })).toBeTruthy();
  });

  it("autre combinaison vide : « Réinitialiser les filtres » remet tout par défaut", async () => {
    render(<LibraryView initial={page([doc("a")])} userId={ME} />);
    await filterTo(page([]), () =>
      fireEvent.change(screen.getByLabelText(t.searchLabel), { target: { value: "zzz" } }),
    );
    expect(screen.getByText(t.noResults)).toBeTruthy();
    fetchMock().mockResolvedValue(json(page([doc("a")])));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: t.resetFilters })));
    expect(listUrls().at(-1)).toBe("/api/documents");
    expect((screen.getByLabelText(t.searchLabel) as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(screen.getByLabelText(t.categoryLabel));
    expect(rows()).toHaveLength(1);
  });

  it("erreur : alerte, filtres conservés, « Réessayer » relance les mêmes filtres", async () => {
    render(<LibraryView initial={page([doc("a")])} userId={ME} />);
    fetchMock().mockResolvedValue(json({ error: { code: "INTERNAL" } }, 500));
    fireEvent.change(screen.getByLabelText(t.categoryLabel), { target: { value: "faq" } });
    await advance(0);
    expect(screen.getByRole("alert").textContent).toContain(t.loadFailed);
    expect(screen.queryByRole("table")).toBeNull();
    expect((screen.getByLabelText(t.categoryLabel) as HTMLSelectElement).value).toBe("faq");

    fetchMock().mockRejectedValueOnce(new TypeError("réseau coupé"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: t.retry })));
    expect(screen.getByRole("alert")).toBeTruthy();

    fetchMock().mockResolvedValue(json(page([doc("f", { category: "faq" })])));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: t.retry })));
    expect(listUrls().slice(-3)).toEqual(Array(3).fill("/api/documents?category=faq"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it("session expirée (401) : router.refresh et alerte", async () => {
    render(<LibraryView initial={page([doc("a")])} userId={ME} />);
    fetchMock().mockResolvedValue(json({ error: { code: "UNAUTHENTICATED" } }, 401));
    fireEvent.click(screen.getByRole("switch", { name: t.mine }));
    await advance(0);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("suivi des Statuts", () => {
  const status = (id: string, effectiveStatus: string) => ({ id, effectiveStatus });

  it("une requête groupée toutes les 3 s pour les lignes en cours ; prêt sans rechargement, annoncé pour ses Documents", async () => {
    render(
      <LibraryView
        initial={page([
          doc("a", { effectiveStatus: "processing", authorId: ME, title: "Ma Note" }),
          doc("b", { effectiveStatus: "processing" }),
          doc("c"),
        ])}
        userId={ME}
      />,
    );
    fetchMock().mockResolvedValue(json({ statuses: [status("a", "processing"), status("b", "processing")] }));
    await advance(2_999);
    expect(fetch).not.toHaveBeenCalled();
    await advance(1);
    expect(statusUrls()).toEqual(["/api/documents/statuses?ids=a,b"]);

    // b est absent de la réponse : il garde son état.
    fetchMock().mockResolvedValue(json({ statuses: [status("a", "ready")] }));
    await advance(3_000);
    expect(rows()[0].textContent).toContain(texts.status.ready);
    expect(rows()[1].textContent).toContain(texts.status.processing);
    const live = Array.from(document.querySelectorAll("[aria-live='polite']")).map((zone) => zone.textContent);
    expect(live).toContain(t.statusChanged("Ma Note", texts.status.ready));

    // Seul b reste en cours ; un changement chez un autre Auteur n'est pas annoncé.
    fetchMock().mockResolvedValue(json({ statuses: [status("b", "error")] }));
    await advance(3_000);
    expect(statusUrls().at(-1)).toBe("/api/documents/statuses?ids=b");
    expect(rows()[1].textContent).toContain(texts.status.error);
    expect(document.body.textContent).not.toContain("« Document b »");
    // Plus aucune ligne en cours : le suivi s'arrête.
    const calls = fetchMock().mock.calls.length;
    await advance(10_000);
    expect(fetchMock().mock.calls.length).toBe(calls);
  });

  it("3 échecs : message et « Actualiser » au-dessus de la liste, jusqu'au premier succès", async () => {
    render(<LibraryView initial={page([doc("a", { effectiveStatus: "processing" })])} userId={ME} />);
    fetchMock().mockResolvedValue(json({}, 500));
    await advance(6_000);
    expect(screen.queryByText(texts.documentStatus.statusUnavailable)).toBeNull();
    await advance(3_000);
    expect(screen.getByText(texts.documentStatus.statusUnavailable)).toBeTruthy();
    const refreshButton = screen.getByRole("button", { name: texts.documentStatus.refresh });
    expect(refreshButton.compareDocumentPosition(table()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fetchMock().mockResolvedValue(json({ statuses: [status("a", "ready")] }));
    await act(async () => fireEvent.click(refreshButton));
    expect(screen.queryByText(texts.documentStatus.statusUnavailable)).toBeNull();
    expect(rows()[0].textContent).toContain(texts.status.ready);
  });

  it("session expirée : router.refresh, le suivi s'arrête", async () => {
    render(<LibraryView initial={page([doc("a", { effectiveStatus: "processing" })])} userId={ME} />);
    fetchMock().mockResolvedValue(json({ error: { code: "UNAUTHENTICATED" } }, 401));
    await advance(3_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(9_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
