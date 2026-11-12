// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";

// Page Recherche (E5, story 4.1b) : la vue lit `?q=` et interroge POST /api/search (simulé ici).
const push = vi.fn();
const refresh = vi.fn();
const router = { push, refresh, prefetch: vi.fn(), replace: vi.fn() };
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params }));

const { SearchView, SEARCH_TIMEOUT_MS } = await import("@/components/search/search-view");
const { SEARCH_FIELD_ID } = await import("@/components/search/constants");
const { PageTitle } = await import("@/components/shell/page-title");
const { shouldFocusTitle } = await import("@/components/shell/title-focus");

const t = texts.search;
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

type Result = { documentId: string; title: string; category: string; passage: { id: string; start: number; end: number; content: string } };
const result = (documentId: string, title: string, overrides: Partial<Result> = {}): Result => ({
  documentId,
  title,
  category: "procedure",
  passage: { id: `p-${documentId}`, start: 10, end: 60, content: `Passage de ${title}` },
  ...overrides,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = () => vi.mocked(fetch);
const field = () => screen.getByLabelText(t.fieldLabel) as HTMLInputElement;
const status = () => screen.getByRole("status");
const cards = () => within(screen.getByRole("list", { name: t.resultsLabel })).getAllByRole("article");
const linkOf = (card: HTMLElement) => within(card).getByRole("link");
const flush = () => act(async () => {});

function setQuery(q: string | null) {
  params = new URLSearchParams(q === null ? {} : { q });
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  setQuery(null);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("état initial", () => {
  it("sans Requête : champ libellé, phrase d'aide, trois exemples en liens, aucun appel", async () => {
    render(<SearchView />);
    await flush();
    expect(field().value).toBe("");
    expect(field().getAttribute("maxlength")).toBe("500");
    expect(screen.getByRole("search")).toBeTruthy();
    expect(screen.getByText(t.help, { selector: "p" })).toBeTruthy();
    const examples = within(screen.getByRole("list", { name: t.examplesLabel })).getAllByRole("link");
    expect(examples.map((link) => link.textContent)).toEqual([...t.examples]);
    expect(examples.map((link) => new URL(link.getAttribute("href")!, "http://x").searchParams.get("q"))).toEqual([...t.examples]);
    expect(status().textContent).toBe("");
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it.each([["espaces", "   "], ["501 caractères", "x".repeat(501)]])("Requête invalide (%s) : état initial, aucun appel", async (_label, q) => {
    setQuery(q);
    render(<SearchView />);
    await flush();
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(field().value).toBe(q.trim().slice(0, 500));
    expect(screen.getByRole("list", { name: t.examplesLabel })).toBeTruthy();
  });
});

describe("Recherche aboutie", () => {
  it("chargement : trois cartes squelettes ; puis « 2 Documents pertinents » et les cartes, sans score", async () => {
    let resolve!: (response: Response) => void;
    fetchMock().mockReturnValue(new Promise((r) => (resolve = r)));
    setQuery("  organisation des congés ");
    const { container } = render(<SearchView />);
    await flush();

    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("/api/search");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ query: "organisation des congés" });
    expect(field().value).toBe("organisation des congés");
    expect(container.querySelector("[data-search-skeleton]")?.children).toHaveLength(3);
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();

    await act(async () =>
      resolve(json({ results: [result(ID_A, "Procédure congés et absences"), result(ID_B, "FAQ RH", { category: "faq", similarity: 0.9 } as Partial<Result>)] })),
    );
    expect(status().textContent).toBe("2 Documents pertinents");
    expect(container.querySelector("[data-search-skeleton]")).toBeNull();
    expect(cards()).toHaveLength(2);
    const [first, second] = cards();
    expect(within(first).getAllByRole("link")).toHaveLength(1);
    expect(linkOf(first).getAttribute("href")).toBe(`/documents/${ID_A}?passages=10-60&actif=0&depuis=recherche`);
    expect(first.querySelector("h2")?.textContent).toBe("Procédure congés et absences");
    expect(first.querySelector("mark.passage-highlight")?.textContent).toBe("Passage de Procédure congés et absences");
    expect(within(first).getByText(texts.reader.relevantPassageLabel).getAttribute("aria-hidden")).toBe("true");
    expect(within(first).getByText(texts.categories.procedure)).toBeTruthy();
    expect(within(second).getByText(texts.categories.faq)).toBeTruthy();
    // Lien unique : le titre (nom accessible = texte visible) ; sa zone couvre toute la carte.
    expect(linkOf(first).textContent).toBe("Procédure congés et absences");
    expect(linkOf(first).className).toContain("after:inset-0");
    expect(container.textContent).not.toMatch(/0[.,]9|similarit|score/i);
  });

  it("un seul résultat : « 1 Document pertinent » ; Catégorie inconnue : « Autre »", async () => {
    fetchMock().mockImplementation(async () => json({ results: [result(ID_A, "Doc", { category: "inconnue" })] }));
    setQuery("x");
    render(<SearchView />);
    await flush();
    expect(status().textContent).toBe("1 Document pertinent");
    expect(within(cards()[0]).getByText(texts.categories.other)).toBeTruthy();
  });

  it("résultat douteux (identifiant non UUID, positions invalides) : carte écartée, nombre ajusté", async () => {
    fetchMock().mockResolvedValue(
      json({
        results: [
          result("pas-un-uuid", "Douteux"),
          result(ID_B, "Positions", { passage: { id: "p", start: 50, end: 50, content: "x" } }),
          result(ID_A, "Valide"),
        ],
      }),
    );
    setQuery("x");
    render(<SearchView />);
    await flush();
    expect(status().textContent).toBe("1 Document pertinent");
    expect(cards().map((card) => card.querySelector("h2")?.textContent)).toEqual(["Valide"]);
  });

  it("contenu de Document rendu en texte, jamais interprété", async () => {
    const hostile = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
    fetchMock().mockImplementation(async () => json({ results: [result(ID_A, hostile, { passage: { id: "p", start: 0, end: 5, content: hostile } })] }));
    setQuery("x");
    const { container } = render(<SearchView />);
    await flush();
    expect(container.querySelector("img, script")).toBeNull();
    expect(cards()[0].querySelector("mark")?.textContent).toBe(hostile);
  });
});

describe("sans résultat", () => {
  it("message FR-15 (Q1 = B), aucune liste, aucun bouton « Poser la question à l'Assistant »", async () => {
    fetchMock().mockImplementation(async () => json({ results: [] }));
    setQuery("recette de la tarte aux pommes");
    render(<SearchView />);
    await flush();
    expect(status().textContent).toBe(t.noResults);
    expect(t.noResults).not.toMatch(/Assistant/);
    expect(screen.queryByRole("list", { name: t.resultsLabel })).toBeNull();
    expect(screen.queryByText(/Poser la question/)).toBeNull();
  });
});

describe("erreur", () => {
  it.each([
    ["panne 503", () => Promise.resolve(json({ error: { code: "AI_UNAVAILABLE", message: "m", retryable: true } }, 503))],
    ["réseau", () => Promise.reject(new TypeError("réseau"))],
    ["réponse mal formée", () => Promise.resolve(json({ results: [{ documentId: 1 }] }))],
    ["réponse illisible", () => Promise.resolve(new Response("pas du JSON", { status: 200 }))],
  ])("%s : alerte, « Réessayer » relance la même Requête, champ conservé", async (_label, failure) => {
    fetchMock().mockImplementationOnce(failure).mockResolvedValueOnce(json({ results: [result(ID_A, "Doc")] }));
    setQuery("organisation des congés");
    render(<SearchView />);
    await flush();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.failed);
    expect(field().value).toBe("organisation des congés");
    expect(screen.queryByRole("list", { name: t.resultsLabel })).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: t.retry }));
    await flush();
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock().mock.calls[1][1]?.body))).toEqual({ query: "organisation des congés" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(cards()).toHaveLength(1);
  });

  it("session expirée (401) : la page est rafraîchie (redirection vers la connexion), alerte affichée", async () => {
    fetchMock().mockImplementation(async () => json({ error: { code: "UNAUTHENTICATED", message: "m", retryable: false } }, 401));
    setQuery("x");
    render(<SearchView />);
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it(`au-delà de ${SEARCH_TIMEOUT_MS / 1000} s : la Recherche est abandonnée, alerte`, async () => {
    vi.useFakeTimers();
    fetchMock().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("abort", "AbortError")))),
    );
    setQuery("x");
    render(<SearchView />);
    await act(async () => {});
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => vi.advanceTimersByTime(SEARCH_TIMEOUT_MS));
    expect(screen.getByRole("alert").textContent).toContain(t.failed);
  });
});

describe("envoi et passage des paramètres", () => {
  it("nouvelle Requête : l'adresse /recherche?q=… est poussée (encodée), sans appel direct", async () => {
    render(<SearchView />);
    await flush();
    fireEvent.change(field(), { target: { value: "  congés & absences #1 " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledTimes(1);
    const href = String(push.mock.calls[0][0]);
    expect(new URL(href, "http://x").pathname).toBe("/recherche");
    expect(new URL(href, "http://x").searchParams.get("q")).toBe("congés & absences #1");
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("Requête vide : rien, le focus reste dans le champ", async () => {
    render(<SearchView />);
    await flush();
    fireEvent.change(field(), { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field());
  });

  it("même Requête que l'adresse : relancée sans nouvelle entrée d'historique", async () => {
    fetchMock().mockImplementation(async () => json({ results: [] }));
    setQuery("congés");
    render(<SearchView />);
    await flush();
    fireEvent.submit(screen.getByRole("search"));
    await flush();
    expect(push).not.toHaveBeenCalled();
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("nouvelle adresse pendant une Recherche : l'ancienne est annulée et sa réponse ignorée ; le champ suit l'URL", async () => {
    let resolveOld!: (response: Response) => void;
    fetchMock()
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce(json({ results: [result(ID_B, "Nouveau")] }));
    setQuery("ancienne");
    const { rerender } = render(<SearchView />);
    await flush();
    const oldSignal = fetchMock().mock.calls[0][1]?.signal;

    setQuery("nouvelle");
    rerender(<SearchView />);
    await flush();
    expect(oldSignal?.aborted).toBe(true);
    expect(field().value).toBe("nouvelle");
    await act(async () => resolveOld(json({ results: [result(ID_A, "Ancien")] })));
    expect(cards().map((card) => card.querySelector("h2")?.textContent)).toEqual(["Nouveau"]);

    setQuery(null);
    rerender(<SearchView />);
    await flush();
    expect(field().value).toBe("");
    expect(screen.getByRole("list", { name: t.examplesLabel })).toBeTruthy();
  });
});

describe("focus", () => {
  it("arrivée par changement d'écran (Tableau de bord → /recherche?q=…) : champ, puis annonce du nombre", async () => {
    fetchMock().mockImplementation(async () => json({ results: [result(ID_A, "Doc")] }));
    setQuery("organisation des congés");
    shouldFocusTitle(); // premier écran déjà affiché : ce rendu est un changement d'écran
    render(
      <>
        <PageTitle focusTargetId={SEARCH_FIELD_ID}>{texts.titles.search}</PageTitle>
        <SearchView />
      </>,
    );
    await flush();
    expect(document.activeElement?.textContent).toBe("1 Document pertinent");
    expect(status().contains(document.activeElement)).toBe(true);
  });

  it("nouvel envoi depuis le champ : focus sur le message sans résultat", async () => {
    fetchMock().mockImplementation(async () => json({ results: [] }));
    setQuery("x");
    render(<SearchView />);
    await flush();
    field().focus();
    fireEvent.submit(screen.getByRole("search"));
    await flush();
    expect(document.activeElement?.textContent).toBe(t.noResults);
  });

  it("erreur après un envoi : le focus va sur l'alerte", async () => {
    fetchMock().mockResolvedValueOnce(json({ results: [] })).mockRejectedValueOnce(new TypeError("réseau"));
    setQuery("x");
    render(<SearchView />);
    await flush();
    field().focus();
    fireEvent.submit(screen.getByRole("search"));
    await flush();
    expect(document.activeElement).toBe(screen.getByRole("alert"));
  });

  it("premier chargement complet (focus sur la page) : le focus n'est pas déplacé", async () => {
    fetchMock().mockImplementation(async () => json({ results: [result(ID_A, "Doc")] }));
    setQuery("congés");
    render(<SearchView />);
    await flush();
    expect(status().textContent).toBe("1 Document pertinent");
    expect(document.activeElement).toBe(document.body);
  });

  it("focus posé ailleurs pendant la Recherche : il n'est pas repris", async () => {
    let resolve!: (response: Response) => void;
    fetchMock().mockResolvedValueOnce(json({ results: [] })).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    setQuery("x");
    render(
      <>
        <button type="button">Ailleurs</button>
        <SearchView />
      </>,
    );
    await flush();
    field().focus();
    fireEvent.submit(screen.getByRole("search"));
    await flush();
    screen.getByRole("button", { name: "Ailleurs" }).focus();
    await act(async () => resolve(json({ results: [result(ID_A, "Doc")] })));
    expect(document.activeElement?.textContent).toBe("Ailleurs");
  });
});
