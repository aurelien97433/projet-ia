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
  router.push.mockReset();
  params = new URLSearchParams();
  window.history.replaceState(null, "", "/assistant");
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
    // Story 5.7 : la puce est un bouton qui ouvre le panneau Source (fermé tant qu'elle n'est pas activée).
    expect(within(status).getByRole("button", { name: "Source 1 : Procédure de facturation" }).getAttribute("aria-expanded")).toBe("false");
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
    // Story 5.6 : repère brut [P{n}] d'une réponse d'avant la 5.4 retiré avec l'espace qui le précède.
    expect(answerSegments("A [S3] [S0] fin [P1]", 2)).toEqual([{ kind: "text", text: "A   fin" }]);
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

  it("story 5.6 : seconde question ajoutée au fil, dans la même Conversation (conversationId), nouveau clientRequestId", async () => {
    fetchMock().mockResolvedValueOnce(answer("Première réponse[S1].")).mockResolvedValueOnce(refusal());
    render(<AssistantView />);
    await ask("Première question");
    expect(screen.getByText(answerText("Première réponse Source 1."))).toBeTruthy();
    await ask("Seconde question");
    expect(screen.getByText("Première question")).toBeTruthy();
    expect(screen.getByText(answerText("Première réponse Source 1."))).toBeTruthy();
    expect(Array.from(bubbles()).map((bubble) => bubble.textContent)).toEqual([`${t.you} : Première question`, `${t.you} : Seconde question`]);
    // Une seule région d'annonce : celle du dernier échange.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe(t.refusalInfoAbsente);
    const [first, second] = bodies();
    expect(first.conversationId).toBeUndefined();
    expect(second.conversationId).toBe(CONVERSATION);
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

  it("story 5.8, garde-fou des 17 s : JSON 504 AI_TIMEOUT reçu à la place du flux → panne normale avec « Réessayer », sans texte provisoire", async () => {
    fetchMock().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "AI_TIMEOUT", message: t.failed, retryable: true } }), {
        status: 504,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<AssistantView />);
    await ask("Question");
    await tick();
    expect(provisional()).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.failed);
    expect(within(alert).getByRole("button", { name: t.retry })).toBeTruthy();
    // Question conservée dans le fil.
    expect(bubbles()).toHaveLength(1);
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

// Story 5.6 : Conversation rouverte (/assistant/[id]), fil, poursuite, adresse, Historique.
describe("Conversation enregistrée et Historique (story 5.6)", () => {
  type Thread = import("@/lib/conversation-thread").ThreadExchange[];
  const SOURCE = { documentId: DOC, title: "Procédure de facturation", passageCount: 1 };
  const conversation = (exchanges: Thread) => ({ id: CONVERSATION, title: "Congés", exchanges });
  const OLD: Thread = [
    {
      id: "q1",
      question: "Sous quel délai une facture doit-elle être émise ?",
      reply: { kind: "answer", content: "Une facture est émise sous 5 jours ouvrés [P2].", sources: [SOURCE] },
    },
    { id: "q2", question: "Et pour un avoir ?", reply: { kind: "failure", code: "AI_TIMEOUT" } },
  ];
  const OTHER = "55555555-5555-4555-8555-555555555555";
  const list = (conversations: unknown[]) => json({ conversations });
  const row = (id: string, title: string, unanswered = false) => ({ id, title, lastMessageAt: "2026-11-18T09:05:00.000Z", unanswered });

  it("rouverte : tous les échanges, repère [P2] retiré à l'affichage, puce gardée ; focus dans le champ ; « Réessayer » sur le dernier échange seulement", async () => {
    const exchanges: Thread = [OLD[0], { ...OLD[1], id: "q0" }, OLD[1]];
    render(<AssistantView title={<h1>Congés</h1>} conversation={conversation(exchanges)} />);
    await flush();
    expect(bubbles()).toHaveLength(3);
    const answerParagraph = document.querySelector("[data-answer] p")!;
    expect(answerParagraph.textContent).toBe("Une facture est émise sous 5 jours ouvrés.");
    expect(document.body.textContent).not.toContain("[P");
    expect(document.querySelectorAll("[data-source-chip]")).toHaveLength(1);
    // Deux pannes : seule la dernière est annoncée et propose « Réessayer ».
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: t.retry })).toHaveLength(1);
    expect(document.querySelectorAll("[data-exchange-reply='error']")).toHaveLength(2);
    expect(document.activeElement).toBe(field());
    expect(screen.queryByText(t.intro)).toBeNull();
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("« Réessayer » sur un échec enregistré : même question, dans la même Conversation (Q3 = A)", async () => {
    fetchMock().mockResolvedValue(answer());
    render(<AssistantView conversation={conversation(OLD)} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: t.retry }));
    await flush();
    expect(bodies()[0]).toMatchObject({ question: "Et pour un avoir ?", conversationId: CONVERSATION });
    expect(bubbles()).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toContain("Source 1");
  });

  it("poursuivre : la question part avec le conversationId de la page", async () => {
    fetchMock().mockResolvedValue(answer());
    render(<AssistantView conversation={conversation(OLD.slice(0, 1))} />);
    await ask("Et pour un avoir ?");
    expect(bodies()[0]).toMatchObject({ question: "Et pour un avoir ?", conversationId: CONVERSATION });
    expect(bubbles()).toHaveLength(2);
  });

  it("question enregistrée en cours : état neutre, « Envoyer » inactif, rechargement toutes les 5 s, puis l'issue reçue du serveur", async () => {
    vi.useFakeTimers();
    const pending: Thread = [{ id: "q1", question: "Question en cours", reply: { kind: "pending" } }];
    const { rerender } = render(<AssistantView conversation={conversation(pending)} />);
    expect(screen.getByRole("status").textContent).toBe(t.pending);
    expect(send().getAttribute("aria-disabled")).toBe("true");
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledTimes(2);
    rerender(<AssistantView conversation={conversation([{ ...pending[0], reply: { kind: "failure", code: "AI_TIMEOUT" } }])} />);
    expect(screen.getByRole("alert").textContent).toContain(t.failed);
    await act(async () => vi.advanceTimersByTime(15_000));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("première question sur /assistant : l'adresse devient /assistant/{id} sans rechargement ; une erreur qui porte la Conversation aussi", async () => {
    fetchMock().mockResolvedValue(answer());
    render(<AssistantView />);
    await ask("Première question");
    expect(window.location.pathname).toBe(`/assistant/${CONVERSATION}`);
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByText("Première question")).toBeTruthy();

    cleanup();
    window.history.replaceState(null, "", "/assistant");
    const stream = controlledStream();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(stream.response);
    render(<AssistantView />);
    await ask("Question en panne");
    stream.send("error", { code: "AI_TIMEOUT", message: t.failed, retryable: true, conversationId: OTHER });
    await tick();
    expect(window.location.pathname).toBe(`/assistant/${OTHER}`);
  });

  it("?mesure=1 gardé dans la nouvelle adresse", async () => {
    params = new URLSearchParams({ mesure: "1" });
    fetchMock().mockResolvedValue(answer());
    render(<AssistantView />);
    await ask("Question mesurée");
    expect(`${window.location.pathname}${window.location.search}`).toBe(`/assistant/${CONVERSATION}?mesure=1`);
  });

  it("5 dernières Conversations sous le champ tant qu'aucune Conversation n'est active", async () => {
    fetchMock().mockResolvedValue(answer());
    render(<AssistantView recent={<p>Liste récente</p>} />);
    expect(screen.getByText("Liste récente")).toBeTruthy();
    await ask("Première question");
    expect(screen.queryByText("Liste récente")).toBeNull();
  });

  it("« + Nouvelle Conversation » sur /assistant : retour à l'état vide sans rechargement, adresse /assistant", async () => {
    fetchMock().mockResolvedValue(answer());
    render(<AssistantView recent={<p>Liste récente</p>} />);
    await ask("Première question");
    refresh.mockClear();
    fireEvent.click(screen.getByRole("link", { name: texts.history.newConversation }));
    await flush();
    // Revue, constat 4 : les 5 dernières sont relues (la Conversation commencée y figure).
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(bubbles()).toHaveLength(0);
    expect(screen.getByText(t.intro)).toBeTruthy();
    expect(screen.getByText("Liste récente")).toBeTruthy();
    expect(window.location.pathname).toBe("/assistant");
    expect(document.activeElement).toBe(field());
    await ask("Nouvelle question");
    expect(bodies()[1].conversationId).toBeUndefined();
  });

  it("Historique : liste lue à l'ouverture (100 au plus), plus récente d'abord, focus sur la Conversation active, « Sans réponse » en texte", async () => {
    fetchMock().mockResolvedValue(list([row(OTHER, "Autre", true), row(CONVERSATION, "Congés")]));
    render(<AssistantView conversation={conversation(OLD.slice(0, 1))} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: texts.history.open }));
    await flush();
    expect(fetchMock().mock.calls[0][0]).toBe("/api/conversations?limit=100");
    const panel = screen.getByRole("dialog", { name: texts.history.title });
    const links = within(panel).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([`/assistant/${OTHER}`, `/assistant/${CONVERSATION}`]);
    expect(links[1].getAttribute("aria-current")).toBe("page");
    expect(links[0].getAttribute("aria-current")).toBeNull();
    expect(document.activeElement).toBe(links[1]);
    expect(links[0].textContent).toContain(texts.history.unanswered);
    expect(links[1].textContent).not.toContain(texts.history.unanswered);
    // Panneau placé avant le fil dans le DOM.
    const container = document.querySelector("[data-history-container]")!;
    expect(container.contains(panel)).toBe(true);
    expect(container.compareDocumentPosition(document.querySelector("ol")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Historique : choisir une ligne ferme le panneau et place le focus dans le champ ; Échap rend le focus à « Historique »", async () => {
    fetchMock().mockResolvedValue(list([row(CONVERSATION, "Congés")]));
    render(<AssistantView />);
    const trigger = screen.getByRole("button", { name: texts.history.open });
    fireEvent.click(trigger);
    await flush();
    const link = within(screen.getByRole("dialog")).getByRole("link");
    expect(document.activeElement).toBe(link);
    fireEvent.click(link);
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(field());

    fireEvent.click(trigger);
    await flush();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Historique vide : « Aucune Conversation pour le moment. » et « Poser une première question » (focus dans le champ)", async () => {
    fetchMock().mockResolvedValue(list([]));
    render(<AssistantView />);
    fireEvent.click(screen.getByRole("button", { name: texts.history.open }));
    await flush();
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText(texts.history.empty)).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: texts.history.firstQuestion }));
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it("Historique en panne : « L'Historique n'a pas pu être chargé. » et « Réessayer », qui relit la liste", async () => {
    fetchMock()
      .mockResolvedValueOnce(json({ error: { code: "INTERNAL", message: texts.history.loadFailed, retryable: true } }, 500))
      .mockResolvedValueOnce(list([row(CONVERSATION, "Congés")]));
    render(<AssistantView />);
    fireEvent.click(screen.getByRole("button", { name: texts.history.open }));
    await flush();
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByRole("alert").textContent).toContain(texts.history.loadFailed);
    fireEvent.click(within(panel).getByRole("button", { name: texts.history.retry }));
    await flush();
    expect(within(panel).getAllByRole("link")).toHaveLength(1);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("revue, constat 6 : rouvert par ?historique=1 après une première ouverture, le panneau repart des squelettes, sans l'ancienne liste", async () => {
    let resolveSecond!: (response: Response) => void;
    fetchMock()
      .mockResolvedValueOnce(list([row(CONVERSATION, "Congés")]))
      .mockReturnValueOnce(new Promise<Response>((resolve) => (resolveSecond = resolve)));
    const view = render(<AssistantView />);
    fireEvent.click(screen.getByRole("button", { name: texts.history.open }));
    await flush();
    expect(within(screen.getByRole("dialog")).getAllByRole("link")).toHaveLength(1);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();

    params = new URLSearchParams({ historique: "1" });
    view.rerender(<AssistantView />);
    await flush();
    const panel = screen.getByRole("dialog", { name: texts.history.title });
    expect(panel.querySelector("[data-skeleton-rows]")).not.toBeNull();
    expect(within(panel).queryAllByRole("link")).toHaveLength(0);
    resolveSecond(list([row(OTHER, "Autre"), row(CONVERSATION, "Congés")]));
    await flush();
    expect(within(panel).getAllByRole("link")).toHaveLength(2);
  });

  it("?historique=1 : panneau ouvert d'emblée", async () => {
    params = new URLSearchParams({ historique: "1" });
    fetchMock().mockResolvedValue(list([]));
    render(<AssistantView />);
    await flush();
    expect(screen.getByRole("dialog", { name: texts.history.title })).toBeTruthy();
  });
});
