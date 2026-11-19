// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadExchange, ThreadSource } from "@/lib/conversation-thread";
import { texts } from "@/lib/texts";

// Panneau Source (story 5.7, E4a) : puce button, aside non modal (≥ 1024 px) ou Sheet modal, Lecteur
// côté client avec le texte lu par GET /api/documents/[id] (simulé ici).
const router = { push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), replace: vi.fn() };
beforeEach(() => router.refresh.mockReset());
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }));

const { AssistantView } = await import("@/components/assistant/assistant-view");

const t = texts.sourcePanel;
const CONVERSATION = "33333333-3333-4333-8333-333333333333";
const DOC = "44444444-4444-4444-8444-444444444444";
const DOC_2 = "55555555-5555-4555-8555-555555555555";
const TEXT = "Préambule. Une facture est émise sous 5 jours ouvrés. Milieu du texte. Relance à 15 jours. Fin.";
const P1 = { start: TEXT.indexOf("Une facture"), end: TEXT.indexOf(" Milieu") };
const P2 = { start: TEXT.indexOf("Relance"), end: TEXT.indexOf(" Fin") };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const documentBody = (overrides: Record<string, unknown> = {}) => ({
  id: DOC,
  title: "Procédure de facturation",
  category: "procedure",
  authorName: "Alice Martin",
  createdAt: "2026-11-10T09:00:00+00:00",
  status: "ready",
  textVersion: 2,
  content: TEXT,
  ...overrides,
});
const notFound = () => json({ error: { code: "NOT_FOUND", message: texts.notFound.text, retryable: false } }, 404);

const source = (overrides: Partial<ThreadSource> = {}): ThreadSource => ({
  documentId: DOC,
  title: "Procédure de facturation",
  passageCount: 1,
  passages: [P1],
  textVersion: 2,
  ...overrides,
});
const conversation = (sources: ThreadSource[]) => ({
  id: CONVERSATION,
  title: "Factures",
  exchanges: [
    { id: "q1", question: "Délai de facture ?", reply: { kind: "answer", content: "Sous 5 jours ouvrés[S1].", sources } },
  ] as ThreadExchange[],
});

const fetchMock = () => vi.mocked(fetch);
const flush = () => act(async () => {});
const chip = (name: RegExp | string) => screen.getByRole("button", { name });
const marks = () => Array.from(document.querySelectorAll("mark"));
const scrollIntoView = vi.fn();
let wide = true;

beforeEach(() => {
  wide = true;
  scrollIntoView.mockClear();
  window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width: 1024px") ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  window.history.replaceState(null, "", `/assistant/${CONVERSATION}`);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function open(sources: ThreadSource[] = [source()], name: RegExp | string = /^Source 1 :/) {
  render(<AssistantView conversation={conversation(sources)} />);
  await flush();
  const button = chip(name);
  button.focus();
  fireEvent.click(button);
  await flush();
  return button;
}

describe("panneau Source, ≥ 1024 px (aside non modal)", () => {
  it("puce button : aria-expanded, aria-controls, sélectionnée ; panneau à droite, focus sur le titre, métadonnées, Passage surligné", async () => {
    fetchMock().mockResolvedValue(json(documentBody()));
    render(<AssistantView conversation={conversation([source()])} />);
    await flush();
    const button = chip("Source 1 : Procédure de facturation");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("panneau-source");
    fireEvent.click(button);

    // Ouverture : titre focalisé avant même la lecture, puce sélectionnée.
    const panel = screen.getByRole("complementary", { name: "Procédure de facturation" });
    expect(panel.id).toBe("panneau-source");
    expect(document.activeElement).toBe(within(panel).getByRole("heading", { level: 2 }));
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("data-selected")).toBe("true");
    expect(fetchMock()).toHaveBeenCalledWith(`/api/documents/${DOC}`, expect.objectContaining({ cache: "no-store" }));
    // Conversation non modale : aucun dialogue, champ toujours accessible.
    expect(screen.queryByRole("dialog")).toBeNull();
    await flush();

    expect(within(panel).getByText(texts.categories.procedure)).toBeTruthy();
    expect(within(panel).getByText("Alice Martin")).toBeTruthy();
    expect(within(panel).getByText(texts.document.addedOnLabel)).toBeTruthy();
    expect(within(panel).getByText(texts.status.ready)).toBeTruthy();
    const full = within(panel).getByRole("link", { name: t.openFullPage });
    expect(full.getAttribute("href")).toBe(`/documents/${DOC}?passages=${P1.start}-${P1.end}&actif=0`);
    expect(marks().map((mark) => mark.textContent)).toEqual(["Une facture est émise sous 5 jours ouvrés."]);
    expect(within(panel).getByText(texts.reader.passagePosition(1, 1))).toBeTruthy();
    // Défilement jusqu'au Passage, sans déplacer le focus ; un seul Passage : ni compteur ni boutons.
    expect(scrollIntoView.mock.contexts[0]).toBe(marks()[0]);
    expect(document.activeElement?.tagName).toBe("H2");
    expect(within(panel).queryByRole("button", { name: t.next })).toBeNull();
    // Texte brut : jamais interprété.
    expect(panel.innerHTML).not.toContain("<b>");
  });

  it("Échap ou ✕ : panneau fermé, focus rendu à la puce, aria-expanded=false", async () => {
    fetchMock().mockResolvedValue(json(documentBody()));
    const button = await open();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await flush();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    await flush();
    fireEvent.click(within(screen.getByRole("complementary")).getByRole("button", { name: t.close }));
    await flush();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("autre puce, panneau ouvert : contenu remplacé, puce 2 sélectionnée, puce 1 non", async () => {
    fetchMock()
      .mockResolvedValueOnce(json(documentBody()))
      .mockResolvedValueOnce(json(documentBody({ id: DOC_2, title: "FAQ comptabilité", category: "faq" })));
    const first = await open([source(), source({ documentId: DOC_2, title: "FAQ comptabilité", passages: [P2] })]);
    const second = chip(/^Source 2 :/);
    fireEvent.click(second);
    await flush();
    expect(fetchMock().mock.calls[1][0]).toBe(`/api/documents/${DOC_2}`);
    expect(screen.getByRole("complementary", { name: "FAQ comptabilité" })).toBeTruthy();
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
    expect(second.getAttribute("aria-expanded")).toBe("true");
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(first.getAttribute("data-selected")).toBeNull();
    expect(marks().map((mark) => mark.textContent)).toEqual(["Relance à 15 jours."]);
  });

  it("plusieurs Passages : « Passage 1 sur 2 », Précédent aria-disabled, Suivant fait défiler et annonce, focus gardé sur le bouton", async () => {
    fetchMock().mockResolvedValue(json(documentBody()));
    await open([source({ passageCount: 2, passages: [P1, P2] })], /^Source 1 : .*, 2 Passages$/);
    const panel = screen.getByRole("complementary");
    const position = panel.querySelector("[data-source-position]")!;
    expect(position.getAttribute("aria-live")).toBe("polite");
    expect(position.textContent).toBe(t.position(1, 2));
    const previous = within(panel).getByRole("button", { name: t.previous });
    const next = within(panel).getByRole("button", { name: t.next });
    expect(previous.getAttribute("aria-disabled")).toBe("true");
    expect(next.getAttribute("aria-disabled")).toBeNull();
    expect(document.querySelector("mark.passage-highlight")?.textContent).toBe("Une facture est émise sous 5 jours ouvrés.");

    scrollIntoView.mockClear();
    next.focus();
    fireEvent.click(next);
    await flush();
    expect(position.textContent).toBe(t.position(2, 2));
    expect(document.querySelector("mark.passage-highlight")?.textContent).toBe("Relance à 15 jours.");
    expect(scrollIntoView.mock.contexts[0]).toBe(document.querySelector("mark.passage-highlight"));
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(previous.getAttribute("aria-disabled")).toBeNull();
    // « Ouvrir la page complète » garde le Passage actif.
    expect(within(panel).getByRole("link", { name: t.openFullPage }).getAttribute("href")).toBe(
      `/documents/${DOC}?passages=${P1.start}-${P1.end}%2C${P2.start}-${P2.end}&actif=1`,
    );
    // Extrémité : sans effet, focus gardé.
    fireEvent.click(next);
    await flush();
    expect(position.textContent).toBe(t.position(2, 2));
    expect(document.activeElement).toBe(next);
  });

  it("Passages cités dans le désordre : ouverture sur le premier dans l'ordre du texte, « Passage 1 sur 2 », actif transmis à la page complète", async () => {
    fetchMock().mockResolvedValue(json(documentBody()));
    await open([source({ passageCount: 2, passages: [P2, P1] })], /^Source 1 :/);
    const panel = screen.getByRole("complementary");
    expect(panel.querySelector("[data-source-position]")!.textContent).toBe(t.position(1, 2));
    expect(document.querySelector("mark.passage-highlight")?.textContent).toBe("Une facture est émise sous 5 jours ouvrés.");
    expect(within(panel).getByRole("button", { name: t.previous }).getAttribute("aria-disabled")).toBe("true");
    expect(within(panel).getByRole("link", { name: t.openFullPage }).getAttribute("href")).toBe(
      `/documents/${DOC}?passages=${P2.start}-${P2.end}%2C${P1.start}-${P1.end}&actif=1`,
    );
  });

  it("Document supprimé pendant l'ouverture (404) : « Ce Document a été supprimé. » sans « Réessayer », puce au style supprimé", async () => {
    fetchMock().mockResolvedValue(notFound());
    await open();
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText(t.deleted)).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: t.retry })).toBeNull();
    expect(within(panel).queryByRole("link", { name: t.openFullPage })).toBeNull();
    // Puce : texte simple non focalisable, « {titre} — Document supprimé ».
    expect(screen.queryByRole("button", { name: /^Source 1 :/ })).toBeNull();
    const deleted = document.querySelector("[data-source-chip][data-deleted]")!;
    expect(deleted.textContent).toContain(texts.assistant.sourceDeleted("Procédure de facturation"));
    // Fermeture : la puce n'est plus focalisable, le focus va dans le champ.
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await flush();
    expect(document.activeElement).toBe(screen.getByLabelText(texts.assistant.fieldLabel));
  });

  it("session expirée (401) : rafraîchissement de la page (renvoi vers la connexion)", async () => {
    fetchMock().mockResolvedValue(json({ error: { code: "UNAUTHENTICATED", message: texts.session.expired, retryable: false } }, 401));
    await open();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("Échap avec le focus hors du panneau (champ) : panneau fermé, focus laissé dans le champ ; Échap en composition ignoré", async () => {
    fetchMock().mockResolvedValue(json(documentBody()));
    await open();
    const field = screen.getByLabelText(texts.assistant.fieldLabel);
    field.focus();
    fireEvent.keyDown(field, { key: "Escape", isComposing: true });
    await flush();
    expect(screen.getByRole("complementary")).toBeTruthy();
    fireEvent.keyDown(field, { key: "Escape" });
    await flush();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("lecture en panne : message et « Réessayer », qui relit le Document", async () => {
    fetchMock()
      .mockResolvedValueOnce(json({ error: { code: "INTERNAL", message: t.loadFailed, retryable: true } }, 500))
      .mockResolvedValueOnce(json(documentBody()));
    await open();
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByRole("alert").textContent).toContain(t.loadFailed);
    fireEvent.click(within(panel).getByRole("button", { name: t.retry }));
    await flush();
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(marks()).toHaveLength(1);
    expect(within(panel).queryByRole("alert")).toBeNull();
  });

  it("chargement : squelettes et message des 10 s (avec « Réessayer ») ; réseau en panne → alerte", async () => {
    let reject!: (error: Error) => void;
    fetchMock().mockImplementation(() => new Promise((_, fail) => (reject = fail)));
    await open();
    const panel = screen.getByRole("complementary");
    expect(panel.querySelector("[data-skeleton-rows]")).toBeTruthy();
    // Région d'annonce de la suppression présente dès l'ouverture, vide.
    const region = panel.querySelector("[data-source-deleted]")!;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.textContent).toBe("");
    expect(within(panel).getByText(texts.document.loadingSlow)).toBeTruthy();
    await act(async () => reject(new TypeError("réseau")));
    expect(within(panel).getByRole("alert").textContent).toContain(t.loadFailed);
  });

  it("Q2 = A : texte modifié depuis la réponse (version différente) → Document entier, message « Passage introuvable », sans surlignage", async () => {
    fetchMock().mockResolvedValue(json(documentBody({ textVersion: 3 })));
    await open();
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText(texts.reader.allPassagesMissing)).toBeTruthy();
    expect(marks()).toHaveLength(0);
    expect(within(panel).getByText(TEXT)).toBeTruthy();
    expect(within(panel).getByRole("link", { name: t.openFullPage }).getAttribute("href")).toBe(`/documents/${DOC}`);
  });

  it("Passage introuvable (positions hors du texte, ou absentes) : Document entier avec le message", async () => {
    fetchMock().mockImplementation(async () => json(documentBody()));
    await open([source({ passages: [{ start: 5, end: 99_999 }] })]);
    expect(screen.getByText(texts.reader.allPassagesMissing)).toBeTruthy();
    expect(marks()).toHaveLength(0);
    cleanup();
    await open([source({ passages: undefined, textVersion: undefined })]);
    expect(screen.getByText(texts.reader.allPassagesMissing)).toBeTruthy();
  });

  it("Source d'un Document supprimé (documentId nul) : texte simple, non focalisable, aucune lecture", async () => {
    render(<AssistantView conversation={conversation([{ documentId: null, title: "Ancien", passageCount: 1 }])} />);
    await flush();
    expect(screen.queryByRole("button", { name: /^Source 1 :/ })).toBeNull();
    const deleted = document.querySelector("[data-source-chip][data-deleted]")!;
    expect(deleted.textContent).toContain(texts.assistant.sourceDeleted("Ancien"));
    expect(deleted.querySelector("[tabindex], button, a")).toBeNull();
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("un seul panneau à la fois : ouvrir l'Historique ferme le panneau Source", async () => {
    fetchMock().mockImplementation(async (input) =>
      String(input).startsWith("/api/conversations") ? json({ conversations: [] }) : json(documentBody()),
    );
    await open();
    expect(screen.getByRole("complementary")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: texts.history.open }));
    await flush();
    expect(screen.getByRole("dialog", { name: texts.history.title })).toBeTruthy();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

describe("panneau Source, < 1024 px (Sheet modal)", () => {
  it("Sheet modal avec « ← Retour à la Conversation » : focus sur le titre, retour rendant le focus à la puce", async () => {
    wide = false;
    fetchMock().mockResolvedValue(json(documentBody()));
    const button = await open();
    const dialog = screen.getByRole("dialog", { name: "Procédure de facturation" });
    expect(dialog.id).toBe("panneau-source");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "Procédure de facturation" }));
    expect(marks()).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: t.back }));
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("Échap ferme le Sheet et rend le focus à la puce", async () => {
    wide = false;
    fetchMock().mockResolvedValue(json(documentBody()));
    const button = await open();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe("réponse reçue de chat (événement done, story 5.7 Q1 = A)", () => {
  it("positions et version de la Source transmises au panneau", async () => {
    window.history.replaceState(null, "", "/assistant");
    fetchMock().mockImplementation(async (input) =>
      String(input) === "/api/chat"
        ? json({
            conversationId: CONVERSATION,
            message: {
              kind: "answer",
              content: "Sous 5 jours ouvrés[S1].",
              sources: [{ documentId: DOC, title: "Procédure de facturation", passageNumbers: [1], passages: [P1], textVersion: 2 }],
            },
          })
        : json(documentBody()),
    );
    render(<AssistantView />);
    const field = screen.getByLabelText(texts.assistant.fieldLabel);
    fireEvent.change(field, { target: { value: "Délai ?" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await flush();
    fireEvent.click(chip(/^Source 1 :/));
    await flush();
    expect(marks().map((mark) => mark.textContent)).toEqual(["Une facture est émise sous 5 jours ouvrés."]);
  });
});
