// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";

// Page Assistant (E4, story 5.2b) : la vue n'appelle que POST /api/chat (simulé ici).
const refresh = vi.fn();
const router = { push: vi.fn(), refresh, prefetch: vi.fn(), replace: vi.fn() };
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params }));

const { AssistantView, answerSegments, CHAT_CLIENT_TIMEOUT_MS, CHAT_FIRST_DISPLAY_TIMEOUT_MS } = await import("@/components/assistant/assistant-view");
const { ASSISTANT_FIELD_ID, assistantHref } = await import("@/components/assistant/constants");

const t = texts.assistant;
const CONVERSATION = "33333333-3333-4333-8333-333333333333";
const DOC = "44444444-4444-4444-8444-444444444444";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const answer = (content = "Une facture est émise sous 5 jours ouvrés[S1].", sources?: unknown[]) =>
  json({
    conversationId: CONVERSATION,
    message: {
      kind: "answer",
      content,
      sources: sources ?? [{ documentId: DOC, title: "Procédure de facturation", passageNumbers: [1] }],
    },
  });
const refusal = () => json({ conversationId: CONVERSATION, message: { kind: "refusal_info_absente", content: t.refusalInfoAbsente, sources: [] } });
const failure = (code: string, status: number, retryable: boolean, message: string, resetAt?: string) =>
  json({ error: resetAt ? { code, message, retryable, resetAt } : { code, message, retryable } }, status);

const fetchMock = () => vi.mocked(fetch);
const field = () => screen.getByLabelText(t.fieldLabel) as HTMLTextAreaElement;
const send = () => screen.getByRole("button", { name: t.submit });
const flush = () => act(async () => {});
const bodies = () => fetchMock().mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
const thread = () => screen.getByRole("list", { name: t.threadLabel });
const bubbles = () => document.querySelectorAll("[data-question-bubble]");
// Texte de la réponse tel qu'il est lu (renvois compris, « Source 1 ») : le paragraphe entier.
const answerText = (text: string) => (_: string, element: Element | null) =>
  element?.matches("[data-answer] p") === true && element.textContent === text;
// Puce de Source : [texte affiché (points médians, masqué aux lecteurs d'écran), nom accessible].
const chipView = (chip: HTMLElement) => [
  chip.querySelector("[aria-hidden='true']")?.textContent,
  chip.querySelector(".sr-only")?.textContent,
];
const counter = () => document.querySelector("[data-counter]")!;
const NBSP = String.fromCharCode(0xa0);

function type(value: string) {
  fireEvent.change(field(), { target: { value } });
}

async function ask(value: string) {
  type(value);
  fireEvent.keyDown(field(), { key: "Enter" });
  await flush();
}

beforeEach(() => {
  refresh.mockReset();
  params = new URLSearchParams();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("état initial", () => {
  it("phrase d'introduction, champ libellé « Votre question », compteur « 0 / 2 000 », aide clavier, aucun appel", async () => {
    render(<AssistantView />);
    await flush();
    expect(screen.getByText(t.intro)).toBeTruthy();
    expect(field().id).toBe(ASSISTANT_FIELD_ID);
    expect(field().value).toBe("");
    expect(field().getAttribute("placeholder")).toBe(t.placeholder);
    expect(counter().textContent).toBe(`0 / 2${NBSP}000`);
    expect(field().getAttribute("aria-describedby")).toContain(`${ASSISTANT_FIELD_ID}-compteur`);
    expect(screen.getByText(t.keyboardHelp)).toBeTruthy();
    expect(send().getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("list", { name: t.threadLabel })).toBeNull();
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("?question= : champ pré-rempli (2 000 caractères au plus), jamais envoyé d'office", async () => {
    params = new URLSearchParams({ question: "recette du gâteau au chocolat" });
    render(<AssistantView />);
    await flush();
    expect(field().value).toBe("recette du gâteau au chocolat");
    cleanup();
    params = new URLSearchParams({ question: "x".repeat(2_500) });
    render(<AssistantView />);
    await flush();
    expect(field().value).toHaveLength(2_000);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("assistantHref : Requête encodée, tronquée à 2 000 caractères ; vide → /assistant", () => {
    expect(assistantHref("congés & absences #1 ?/")).toBe(`/assistant?question=${encodeURIComponent("congés & absences #1 ?/").replace(/%20/g, "+")}`);
    expect(new URL(assistantHref("y".repeat(2_100)), "http://x").searchParams.get("question")).toHaveLength(2_000);
    expect(assistantHref("   ")).toBe("/assistant");
  });
});

describe("envoi", () => {
  it("nominal : question affichée, état neutre occupé, « Envoyer » aria-disabled, puis réponse d'un bloc et puce de Source", async () => {
    let release!: (response: Response) => void;
    fetchMock().mockImplementation(() => new Promise((resolve) => (release = resolve)));
    render(<AssistantView />);
    field().focus();
    type("  Sous quel délai une facture doit-elle être émise ?  ");
    fireEvent.keyDown(field(), { key: "Enter" });

    // Question affichée dès l'envoi ; état neutre, sans rien qui préjuge de l'issue.
    expect(within(thread()).getByText("Sous quel délai une facture doit-elle être émise ?")).toBeTruthy();
    const pending = screen.getByText(t.pending);
    // État neutre dans la région d'annonce (rendue même vide), remplacé ensuite par la réponse.
    expect(screen.getByRole("status").contains(pending)).toBe(true);
    expect(send().getAttribute("aria-disabled")).toBe("true");
    expect(field().value).toBe("");
    expect(screen.getByRole("status").textContent).toBe(t.pending);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("/api/chat");
    expect((init as RequestInit).method).toBe("POST");
    expect(bodies()[0].question).toBe("Sous quel délai une facture doit-elle être émise ?");
    expect(bodies()[0].clientRequestId).toMatch(UUID);

    await act(async () => release(answer()));
    expect(screen.queryByText(t.pending)).toBeNull();
    const status = screen.getByRole("status");
    // Story 5.4 : renvoi ¹ précédé du texte masqué « Source », aucun repère brut.
    expect(within(status).getByText(answerText("Une facture est émise sous 5 jours ouvrés Source 1."))).toBeTruthy();
    const chips = within(within(status).getByRole("list", { name: t.sourcesLabel })).getAllByRole("listitem");
    expect(chips.map(chipView)).toEqual([["1 · Procédure de facturation", "Source 1 : Procédure de facturation"]]);
    expect(status.textContent).not.toMatch(/\[[PS]/);
    // Puces non cliquables (5.7).
    expect(within(status).queryByRole("button")).toBeNull();
    expect(within(status).queryByRole("link")).toBeNull();
    expect(send().getAttribute("aria-disabled")).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it("« Envoyer » cliqué : occupé dès le premier clic, second clic ignoré ; le focus revient dans le champ", async () => {
    let release!: (response: Response) => void;
    fetchMock().mockImplementation(() => new Promise((resolve) => (release = resolve)));
    render(<AssistantView />);
    type("Question");
    send().focus();
    fireEvent.click(send());
    fireEvent.click(send());
    expect(send().getAttribute("aria-disabled")).toBe("true");
    // Entrée pendant la génération : rien.
    type("Autre question");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    send().focus();
    await act(async () => release(answer()));
    expect(document.activeElement).toBe(field());
    expect(field().value).toBe("Autre question");
  });

  it("réponse rendue en texte brut, jamais interprétée comme HTML ; Source de Document supprimé ; plusieurs Passages", async () => {
    const hostile = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
    fetchMock().mockResolvedValue(
      answer(`${hostile}[S1]`, [
        { documentId: DOC, title: "Procédure de facturation", passageNumbers: [1, 2] },
        { documentId: null, title: "Ancienne FAQ", passageNumbers: [3] },
      ]),
    );
    const { container } = render(<AssistantView />);
    await ask("Question");
    expect(container.querySelector("img, script")).toBeNull();
    expect(screen.getByText(answerText(`${hostile} Source 1`))).toBeTruthy();
    const chips = within(screen.getByRole("list", { name: t.sourcesLabel })).getAllByRole("listitem");
    expect(chips.map(chipView)).toEqual([
      ["1 · Procédure de facturation · 2 Passages", "Source 1 : Procédure de facturation, 2 Passages"],
      ["2 · Ancienne FAQ — Document supprimé", "Source 2 : Ancienne FAQ — Document supprimé"],
    ]);
    expect(chips[1].getAttribute("data-deleted")).toBe("true");
  });

  it("story 5.4 : renvois ¹ ² en exposant, non cliquables, lus « Source n » ; puces numérotées dans l'ordre", async () => {
    fetchMock().mockResolvedValue(
      answer("Relancez à J+15[S1].\n1. Appeler[S2][S1].\n2. Écrire[S9].", [
        { documentId: DOC, title: "Procédure de facturation", passageNumbers: [2] },
        { documentId: DOC, title: "FAQ comptabilité", passageNumbers: [1] },
      ]),
    );
    const { container } = render(<AssistantView />);
    await ask("Question");
    const renvois = [...container.querySelectorAll("[data-answer] sup")];
    expect(renvois.map((renvoi) => renvoi.textContent)).toEqual([" Source 1", " Source 2", " Source 1"]);
    expect(renvois.map((renvoi) => renvoi.querySelector(".sr-only")?.textContent)).toEqual([" Source ", " Source ", " Source "]);
    for (const renvoi of renvois) {
      expect(renvoi.closest("a, button")).toBeNull();
      expect(renvoi.getAttribute("tabindex")).toBeNull();
    }
    // Renvoi sans Source correspondante : retiré ; aucun repère brut à l'écran ; mise en forme gardée.
    const text = container.querySelector("[data-answer] p")!;
    expect(text.textContent).toBe("Relancez à J+15 Source 1.\n1. Appeler Source 2, Source 1.\n2. Écrire.");
    expect(text.textContent).not.toMatch(/\[[PS]/);
    const chips = within(screen.getByRole("list", { name: t.sourcesLabel })).getAllByRole("listitem");
    expect(chips.map(chipView)).toEqual([
      ["1 · Procédure de facturation", "Source 1 : Procédure de facturation"],
      ["2 · FAQ comptabilité", "Source 2 : FAQ comptabilité"],
    ]);
  });

  it("story 5.4 : découpage du texte en segments (answerSegments)", () => {
    expect(answerSegments("A [S1]. B [S2][S1]", 2)).toEqual([
      { kind: "text", text: "A " },
      { kind: "renvoi", ordinal: 1 },
      { kind: "text", text: ". B " },
      { kind: "renvoi", ordinal: 2 },
      { kind: "renvoi", ordinal: 1 },
    ]);
    expect(answerSegments("A [S3] [S0] fin [P1]", 2)).toEqual([{ kind: "text", text: "A   fin [P1]" }]);
    expect(answerSegments("", 1)).toEqual([]);
  });

  it("refus « information absente » (story 5.3) : bloc distinct, texte du catalogue, trois suites, sans zone Sources ; focus dans le champ", async () => {
    fetchMock().mockResolvedValue(refusal());
    render(<AssistantView />);
    field().focus();
    await ask("Quel est le budget marketing de NexaWorks pour 2027 ?");
    const status = screen.getByRole("status");
    const block = document.querySelector<HTMLElement>("[data-refusal]")!;
    expect(block.getAttribute("data-refusal")).toBe("info_absente");
    // Un seul bloc à l'écran ; seul le texte (icône et phrase) est dans la région d'annonce, les suites
    // sont hors de la région (décision du 2026-11-17).
    expect(block.contains(status)).toBe(true);
    expect(status.textContent).toBe(t.refusalInfoAbsente);
    expect(status.querySelector("svg")).not.toBeNull();
    expect(within(status).queryByRole("button")).toBeNull();
    expect(within(status).queryByRole("link")).toBeNull();
    expect(status.contains(block.querySelector("[data-refusal-actions]"))).toBe(false);
    expect(status.querySelector("[data-answer]")).toBeNull();
    expect(within(status).queryByRole("list", { name: t.sourcesLabel })).toBeNull();
    expect(within(block).getByRole("button", { name: t.reformulate })).toBeTruthy();
    expect(within(block).getByRole("link", { name: t.searchDocuments }).getAttribute("href")).toBe(
      `/recherche?${new URLSearchParams({ q: "Quel est le budget marketing de NexaWorks pour 2027 ?" })}`,
    );
    expect(within(block).getByRole("link", { name: t.addDocument }).getAttribute("href")).toBe("/ajouter");
    expect(within(block).getAllByRole("button")).toHaveLength(1);
    expect(within(block).getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it("refus « hors cadre » (story 5.3) : texte du catalogue et « Reformuler la question » seulement", async () => {
    fetchMock().mockResolvedValue(
      json({ conversationId: CONVERSATION, message: { kind: "refusal_hors_cadre", content: t.refusalHorsCadre, sources: [] } }),
    );
    render(<AssistantView />);
    await ask("Quelle est la capitale de l'Australie ?");
    const block = document.querySelector<HTMLElement>("[data-refusal]")!;
    expect(block.getAttribute("data-refusal")).toBe("hors_cadre");
    expect(screen.getByRole("status").textContent).toBe(t.refusalHorsCadre);
    expect(within(screen.getByRole("status")).queryByRole("button")).toBeNull();
    expect(t.refusalHorsCadre).toBe("Je réponds uniquement à partir des Documents de NexaWorks.");
    expect(within(block).getAllByRole("button").map((button) => button.textContent)).toEqual([t.reformulate]);
    expect(within(block).queryByRole("link")).toBeNull();
    expect(screen.getByRole("status").querySelector("[data-answer]")).toBeNull();
  });

  it("« Reformuler la question » : la question revient dans le champ, focus, curseur à la fin ; aucun envoi", async () => {
    fetchMock().mockResolvedValue(refusal());
    render(<AssistantView />);
    await ask("  Quel est le budget marketing ?  ");
    type("brouillon");
    const block = document.querySelector<HTMLElement>("[data-refusal]")!;
    const button = within(block).getByRole("button", { name: t.reformulate });
    button.focus();
    fireEvent.click(button);
    expect(field().value).toBe("Quel est le budget marketing ?");
    expect(document.activeElement).toBe(field());
    expect(field().selectionStart).toBe("Quel est le budget marketing ?".length);
    expect(field().selectionEnd).toBe("Quel est le budget marketing ?".length);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("libellés des suites du refus (EXPERIENCE.md, UX-DR11)", () => {
    expect([t.reformulate, t.searchDocuments, t.addDocument]).toEqual([
      "Reformuler la question",
      "Rechercher dans les Documents",
      "Ajouter un Document",
    ]);
  });

  it("seconde question : l'échange précédent disparaît de l'écran, nouveau clientRequestId", async () => {
    fetchMock().mockResolvedValueOnce(answer("Première réponse[S1].")).mockResolvedValueOnce(refusal());
    render(<AssistantView />);
    await ask("Première question");
    expect(screen.getByText(answerText("Première réponse Source 1."))).toBeTruthy();
    await ask("Seconde question");
    expect(screen.queryByText("Première question")).toBeNull();
    expect(screen.queryByText(answerText("Première réponse Source 1."))).toBeNull();
    expect(bubbles()).toHaveLength(1);
    expect(bubbles()[0].textContent).toContain("Seconde question");
    expect(screen.getAllByRole("listitem").length).toBe(2);
    const [first, second] = bodies();
    expect(first.clientRequestId).not.toBe(second.clientRequestId);
  });
});

describe("clavier", () => {
  it("Maj+Entrée : aucune envoi (retour à la ligne laissé au champ)", async () => {
    render(<AssistantView />);
    type("Ligne 1");
    const event = fireEvent.keyDown(field(), { key: "Enter", shiftKey: true });
    expect(event).toBe(true); // comportement par défaut conservé
    await flush();
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("Entrée pendant une composition IME : ignorée", async () => {
    render(<AssistantView />);
    type("かんじ");
    fireEvent.keyDown(field(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(field(), { key: "Enter", keyCode: 229 });
    await flush();
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

describe("saisie invalide (aucun appel)", () => {
  it("vide ou faite d'espaces : message « Écrivez votre question… », relié au champ ; disparaît à la frappe", async () => {
    render(<AssistantView />);
    await ask("   \n  ");
    expect(fetchMock()).not.toHaveBeenCalled();
    const message = screen.getByText(t.questionEmpty);
    expect(field().getAttribute("aria-describedby")).toContain(message.id);
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field());
    type("Q");
    expect(screen.queryByText(t.questionEmpty)).toBeNull();
  });

  it("2 001 caractères : compteur et message de longueur, aucun appel ; 2 000 : envoyée", async () => {
    fetchMock().mockResolvedValue(answer());
    render(<AssistantView />);
    await ask("a".repeat(2_001));
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(screen.getByText(t.questionTooLong)).toBeTruthy();
    expect(counter().textContent).toBe(`2${NBSP}001 / 2${NBSP}000`);
    expect(counter().className).toContain("text-destructive");
    await ask("a".repeat(2_000));
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("textes de saisie invalide propres, distincts de la panne (report g)", () => {
    expect(t.questionEmpty).toBe("Écrivez votre question avant de l'envoyer.");
    expect(t.invalidRequest).toBe("Votre question n'a pas pu être envoyée. Vérifiez-la puis réessayez.");
    expect(t.invalidRequest).not.toBe(t.failed);
  });
});

describe("erreurs", () => {
  it("panne 503 : alerte à la place de la réponse, focus sur l'alerte, question conservée ; « Réessayer » : même question, nouveau clientRequestId, une seule bulle", async () => {
    let release!: (response: Response) => void;
    fetchMock()
      .mockResolvedValueOnce(failure("AI_UNAVAILABLE", 503, true, t.failed))
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    render(<AssistantView />);
    await ask("Sous quel délai ?");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.failedTitle);
    expect(alert.textContent).toContain(t.failed);
    expect(document.activeElement).toBe(alert);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(bubbles()).toHaveLength(1);

    fireEvent.click(within(alert).getByRole("button", { name: t.retry }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(t.pending);
    // L'alerte disparue, le focus est dans le champ pendant l'attente.
    expect(document.activeElement).toBe(field());
    expect(bubbles()).toHaveLength(1);
    expect(send().getAttribute("aria-disabled")).toBe("true");
    const [first, second] = bodies();
    expect(second.question).toBe(first.question);
    expect(second.clientRequestId).toMatch(UUID);
    expect(second.clientRequestId).not.toBe(first.clientRequestId);

    await act(async () => release(answer()));
    expect(screen.getByText(answerText("Une facture est émise sous 5 jours ouvrés Source 1."))).toBeTruthy();
    expect(bubbles()).toHaveLength(1);
    expect(document.activeElement).toBe(field());
  });

  it.each([
    ["QUOTA_EXCEEDED", 429, texts.assistant.quotaExceeded("demain à 0 h 00 (UTC)")],
    ["AI_DAILY_CAP_REACHED", 503, texts.assistant.dailyCapReached("demain à 0 h 00 (UTC)")],
  ])("%s : texte du catalogue (heure UTC), sans « Réessayer », même si réessayable", async (code, status, message) => {
    fetchMock().mockResolvedValue(failure(code, status, true, message, "2026-11-17T00:00:00.000Z"));
    render(<AssistantView />);
    await ask("Question");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(alert.textContent).toContain("(UTC)");
    expect(within(alert).queryByRole("button")).toBeNull();
    expect(document.activeElement).toBe(alert);
  });

  it("409 REQUEST_IN_PROGRESS : « déjà en cours », sans « Réessayer »", async () => {
    fetchMock().mockResolvedValue(failure("REQUEST_IN_PROGRESS", 409, false, t.inProgress));
    render(<AssistantView />);
    await ask("Question");
    expect(screen.getByRole("alert").textContent).toBe(t.inProgress);
    expect(within(screen.getByRole("alert")).queryByRole("button")).toBeNull();
  });

  it("400 VALIDATION_FAILED de la route : texte de saisie invalide, jamais celui de la panne", async () => {
    fetchMock().mockResolvedValue(failure("VALIDATION_FAILED", 400, false, t.invalidRequest));
    render(<AssistantView />);
    await ask("Question");
    expect(screen.getByRole("alert").textContent).toBe(t.invalidRequest);
    expect(screen.getByRole("alert").textContent).not.toContain(t.failed);
  });

  it("AI_CITATIONS_INVALID réessayable : message de réponse non vérifiable et « Réessayer »", async () => {
    fetchMock().mockResolvedValue(failure("AI_CITATIONS_INVALID", 502, true, t.unverifiable));
    render(<AssistantView />);
    await ask("Question");
    expect(screen.getByRole("alert").textContent).toContain(t.unverifiable);
    expect(within(screen.getByRole("alert")).getByRole("button", { name: t.retry })).toBeTruthy();
  });

  it("AI_OUTPUT_INVALID non réessayable : pas de « Réessayer »", async () => {
    fetchMock().mockResolvedValue(failure("AI_OUTPUT_INVALID", 502, false, t.failed));
    render(<AssistantView />);
    await ask("Question");
    expect(within(screen.getByRole("alert")).queryByRole("button")).toBeNull();
  });

  it("401 : rafraîchissement (session expirée), sans « Réessayer »", async () => {
    fetchMock().mockResolvedValue(failure("UNAUTHENTICATED", 401, false, texts.session.expired));
    render(<AssistantView />);
    await ask("Question");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe(texts.session.expired);
    expect(within(screen.getByRole("alert")).queryByRole("button")).toBeNull();
  });

  it.each([
    ["réseau", () => Promise.reject(new TypeError("réseau"))],
    ["réponse illisible", () => Promise.resolve(new Response("<html>", { status: 502 }))],
    ["succès mal formé", () => Promise.resolve(json({ conversationId: CONVERSATION, message: { kind: "answer" } }))],
  ])("%s : panne locale réessayable", async (_label, respond) => {
    fetchMock().mockImplementation(respond);
    render(<AssistantView />);
    await ask("Question");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.failed);
    expect(within(alert).getByRole("button", { name: t.retry })).toBeTruthy();
  });
});

describe("revue de la 5.2b", () => {
  it.each([
    ["VALIDATION_FAILED", 400, t.invalidRequest],
    ["REQUEST_IN_PROGRESS", 409, t.inProgress],
    ["QUOTA_EXCEEDED", 429, t.quotaExceeded("demain à 0 h 00 (UTC)")],
    ["AI_DAILY_CAP_REACHED", 503, t.dailyCapReached("demain à 0 h 00 (UTC)")],
    ["UNAUTHENTICATED", 401, texts.session.expired],
  ])("erreur %s sans « Réessayer » : la question revient dans le champ resté vide", async (code, status, message) => {
    fetchMock().mockResolvedValue(failure(code, status, false, message));
    render(<AssistantView />);
    await ask("  Ma question  ");
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(field().value).toBe("Ma question");
  });

  it("erreur sans « Réessayer » : un texte saisi entre-temps n'est pas remplacé", async () => {
    let release!: (response: Response) => void;
    fetchMock().mockImplementation(() => new Promise((resolve) => (release = resolve)));
    render(<AssistantView />);
    await ask("Ma question");
    type("Nouveau texte");
    await act(async () => release(failure("REQUEST_IN_PROGRESS", 409, false, t.inProgress)));
    expect(field().value).toBe("Nouveau texte");
  });

  it("erreur avec « Réessayer » : le champ reste vide", async () => {
    fetchMock().mockResolvedValue(failure("AI_UNAVAILABLE", 503, true, t.failed));
    render(<AssistantView />);
    await ask("Ma question");
    expect(field().value).toBe("");
  });

  it("compteur mesuré après suppression des espaces, comme le contrôle de longueur", async () => {
    render(<AssistantView />);
    type(`${"a".repeat(1_995)}${" ".repeat(10)}`);
    expect(counter().textContent).toBe(`1${NBSP}995 / 2${NBSP}000`);
    expect(field().getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByText(t.questionTooLong)).toBeNull();
    type(`   ${"a".repeat(2_001)}   `);
    expect(counter().textContent).toBe(`2${NBSP}001 / 2${NBSP}000`);
    expect(field().getAttribute("aria-invalid")).toBe("true");
  });

  it("message de saisie et région d'annonce rendus même vides (jamais masqués)", async () => {
    let release!: (response: Response) => void;
    fetchMock().mockImplementation(() => new Promise((resolve) => (release = resolve)));
    render(<AssistantView />);
    const message = document.getElementById(`${ASSISTANT_FIELD_ID}-erreur`)!;
    expect(message.getAttribute("aria-live")).toBe("polite");
    expect(message.className).not.toContain("hidden");
    await ask("Question");
    expect(screen.getByRole("status").className).not.toContain("hidden");
    await act(async () => release(failure("AI_UNAVAILABLE", 503, true, t.failed)));
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByRole("status").className).not.toContain("hidden");
  });
});

// Story 5.5 : réponse progressive (flux SSE relayé par /api/chat).
function controlledStream(headers: Record<string, string> = {}) {
  let target!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      target = controller;
    },
  });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8", ...headers } }),
    send: (event: string, data: unknown) => target.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
    raw: (text: string) => target.enqueue(encoder.encode(text)),
    close: () => target.close(),
  };
}
const DONE = {
  conversationId: CONVERSATION,
  message: {
    kind: "answer",
    content: "Une facture est émise sous 5 jours ouvrés[S1].",
    sources: [{ documentId: DOC, title: "Procédure de facturation", passageNumbers: [1] }],
  },
};
const provisional = () => document.querySelector("[data-provisional]");
const tick = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe("réponse progressive (story 5.5)", () => {
  it("demande le flux ; texte provisoire qui s'écrit, aria-busy, hors de la région d'annonce ; puis remplacé par la réponse validée", async () => {
    const stream = controlledStream();
    fetchMock().mockResolvedValue(stream.response);
    render(<AssistantView />);
    await ask("Sous quel délai une facture doit-elle être émise ?");
    const [, init] = fetchMock().mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Accept: "text/event-stream" });
    expect(screen.getByRole("status").textContent).toBe(t.pending);

    // Commentaire d'ouverture ignoré ; premier delta, coupé au milieu d'un événement.
    stream.raw(": flux\n\nevent: delta\ndata: {\"text\":\"Une fac");
    await tick();
    expect(provisional()).toBeNull();
    stream.raw("ture\"}\n\n");
    await tick();
    expect(provisional()?.getAttribute("aria-busy")).toBe("true");
    expect(provisional()?.textContent).toContain("Une facture");
    expect(screen.getByRole("status").contains(provisional())).toBe(false);
    // La région d'annonce ne lit pas le texte provisoire.
    expect(screen.getByRole("status").textContent).toBe("");
    expect(send().getAttribute("aria-disabled")).toBe("true");

    stream.send("delta", { text: " est émise sous 5 jours ouvrés." });
    await tick();
    expect(provisional()?.textContent).toContain("Une facture est émise sous 5 jours ouvrés.");

    stream.send("done", DONE);
    await tick();
    expect(provisional()).toBeNull();
    const status = screen.getByRole("status");
    expect(within(status).getByText(answerText("Une facture est émise sous 5 jours ouvrés Source 1."))).toBeTruthy();
    expect(within(within(status).getByRole("list", { name: t.sourcesLabel })).getAllByRole("listitem")).toHaveLength(1);
    expect(status.textContent).not.toMatch(/\[[PS]/);
    expect(send().getAttribute("aria-disabled")).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it.each([
    ["information absente", "refusal_info_absente", t.refusalInfoAbsente],
    ["hors cadre", "refusal_hors_cadre", t.refusalHorsCadre],
  ])("refusal (%s) : bloc de refus d'un coup, sans texte provisoire", async (_, kind, text) => {
    const stream = controlledStream();
    fetchMock().mockResolvedValue(stream.response);
    render(<AssistantView />);
    await ask("Question");
    stream.send("refusal", { kind, content: text });
    await tick();
    expect(provisional()).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(text);
    expect(document.querySelector("[data-refusal]")).not.toBeNull();
  });

  it("error après des delta (citations invalides) : texte provisoire retiré, alerte et « Réessayer », question conservée", async () => {
    const stream = controlledStream();
    fetchMock().mockResolvedValue(stream.response);
    render(<AssistantView />);
    await ask("Question");
    stream.send("delta", { text: "Texte provisoire PERROQUET" });
    await tick();
    expect(provisional()).not.toBeNull();
    stream.send("error", { code: "AI_CITATIONS_INVALID", message: t.unverifiable, retryable: true });
    await tick();
    expect(provisional()).toBeNull();
    expect(document.body.textContent).not.toContain("PERROQUET");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.unverifiable);
    expect(within(alert).getByRole("button", { name: t.retry })).toBeTruthy();
    expect(document.activeElement).toBe(alert);
    expect(within(thread()).getByText("Question")).toBeTruthy();
  });

  it.each([
    ["flux fermé sans événement final", (stream: ReturnType<typeof controlledStream>) => stream.close()],
    ["événement final illisible", (stream: ReturnType<typeof controlledStream>) => stream.raw("event: done\ndata: {pas du json\n\n")],
    ["done mal formé", (stream: ReturnType<typeof controlledStream>) => stream.send("done", { conversationId: "x", message: {} })],
  ])("%s : panne réessayable, texte provisoire retiré", async (_, finish) => {
    const stream = controlledStream();
    fetchMock().mockResolvedValue(stream.response);
    render(<AssistantView />);
    await ask("Question");
    stream.send("delta", { text: "Début" });
    await tick();
    finish(stream);
    await tick();
    expect(provisional()).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(t.failed);
  });

  it("réponse JSON d'un bloc (refus avant le flux) : traitée comme avant", async () => {
    fetchMock().mockResolvedValue(failure("QUOTA_EXCEEDED", 429, false, t.quotaExceeded("demain"), "2026-11-17T00:00:00.000Z"));
    render(<AssistantView />);
    await ask("Question");
    expect(screen.getByRole("alert").textContent).toBe(t.quotaExceeded("demain"));
  });

  it("20 s sans premier affichage : requête abandonnée, alerte AI_TIMEOUT avec « Réessayer », question conservée", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetchMock().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = (init as RequestInit).signal ?? undefined;
          signal?.addEventListener("abort", () => reject(new DOMException("abandon", "AbortError")));
        }),
    );
    expect(CHAT_FIRST_DISPLAY_TIMEOUT_MS).toBe(20_000);
    render(<AssistantView />);
    type("Question");
    fireEvent.keyDown(field(), { key: "Enter" });
    await act(() => vi.advanceTimersByTimeAsync(19_900));
    expect(signal?.aborted).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(signal?.aborted).toBe(true);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.failedTitle);
    expect(within(alert).getByRole("button", { name: t.retry })).toBeTruthy();
    expect(within(thread()).getByText("Question")).toBeTruthy();
  });

  it("en-têtes reçus mais aucun événement en 20 s : panne ; un delta avant 20 s lève ce délai, 90 s au total retire le texte provisoire", async () => {
    vi.useFakeTimers();
    const silent = controlledStream();
    fetchMock().mockResolvedValueOnce(silent.response);
    render(<AssistantView />);
    await ask("Question");
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(screen.getByRole("alert").textContent).toContain(t.failed);

    cleanup();
    const slow = controlledStream();
    fetchMock().mockResolvedValueOnce(slow.response);
    render(<AssistantView />);
    await ask("Question");
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    slow.send("delta", { text: "Début" });
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(provisional()?.textContent).toContain("Début");
    await act(() => vi.advanceTimersByTimeAsync(80_000));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(CHAT_CLIENT_TIMEOUT_MS).toBe(90_000);
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(provisional()).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.failedTitle);
    expect(within(alert).getByRole("button", { name: t.retry })).toBeTruthy();
  });
});

describe("mesure du flux (?mesure=1, story 5.5)", () => {
  it("sans ?mesure=1 : aucun instrument", async () => {
    render(<AssistantView />);
    await flush();
    expect(document.querySelector("[data-measure]")).toBeNull();
  });

  it("avec ?mesure=1 : premier delta, fin, morceaux et région relevés ; résultat copié sans identifiant, jeton ni e-mail", async () => {
    params = new URLSearchParams({ mesure: "1" });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const stream = controlledStream({ "x-vercel-id": "cdg1::fra1::abcd1-1763390000000-0123456789ab" });
    fetchMock().mockResolvedValue(stream.response);
    render(<AssistantView />);
    expect(screen.getByRole("heading", { name: t.measureTitle })).toBeTruthy();
    expect((screen.getByRole("button", { name: t.measureCopy }) as HTMLButtonElement).disabled).toBe(true);
    await ask("Sous quel délai une facture doit-elle être émise après la livraison ?");
    stream.send("delta", { text: "Une facture" });
    await tick();
    stream.send("delta", { text: " est émise." });
    await tick();
    stream.send("done", DONE);
    await tick();
    expect(document.querySelector("[data-measure-count]")?.textContent).toBe(t.measureCount(1));
    fireEvent.click(screen.getByRole("button", { name: t.measureCopy }));
    await flush();
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String((writeText.mock.calls[0] as unknown[])[0]);
    expect(copied).toContain("q1 — Sous quel délai une facture doit-elle être émise après la livraison ?");
    expect(copied).toContain("| fra1 |");
    expect(copied).not.toContain(CONVERSATION);
    expect(copied).not.toContain(DOC);
    expect(copied).not.toContain("abcd1");
    expect(copied).not.toContain("::");
    expect(copied).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(copied).not.toContain("@");
    expect(screen.getByText(t.measureCopied)).toBeTruthy();
  });
});
