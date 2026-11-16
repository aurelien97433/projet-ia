// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";

// Page Assistant (E4, story 5.2b) : la vue n'appelle que POST /api/chat (simulé ici).
const refresh = vi.fn();
const router = { push: vi.fn(), refresh, prefetch: vi.fn(), replace: vi.fn() };
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params }));

const { AssistantView, CHAT_CLIENT_TIMEOUT_MS } = await import("@/components/assistant/assistant-view");
const { ASSISTANT_FIELD_ID, assistantHref } = await import("@/components/assistant/constants");

const t = texts.assistant;
const CONVERSATION = "33333333-3333-4333-8333-333333333333";
const DOC = "44444444-4444-4444-8444-444444444444";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const answer = (content = "Une facture est émise sous 5 jours ouvrés [P1].", sources?: unknown[]) =>
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
    // Citations laissées telles quelles jusqu'à la 5.4.
    expect(within(status).getByText("Une facture est émise sous 5 jours ouvrés [P1].")).toBeTruthy();
    const chips = within(within(status).getByRole("list", { name: t.sourcesLabel })).getAllByRole("listitem");
    expect(chips.map((chip) => chip.textContent)).toEqual(["Procédure de facturation"]);
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
    const hostile = `<img src=x onerror="alert(1)"><script>alert(2)</script> [P1]`;
    fetchMock().mockResolvedValue(
      answer(hostile, [
        { documentId: DOC, title: "Procédure de facturation", passageNumbers: [1, 2] },
        { documentId: null, title: "Ancienne FAQ", passageNumbers: [3] },
      ]),
    );
    const { container } = render(<AssistantView />);
    await ask("Question");
    expect(container.querySelector("img, script")).toBeNull();
    expect(screen.getByText(hostile)).toBeTruthy();
    const chips = within(screen.getByRole("list", { name: t.sourcesLabel })).getAllByRole("listitem");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      `Procédure de facturation · ${t.passagesCount(2)}`,
      "Ancienne FAQ — Document supprimé",
    ]);
    expect(chips[1].getAttribute("data-deleted")).toBe("true");
  });

  it("refus provisoire : texte du refus seul, bloc distinct, sans zone Sources ni bouton ; focus dans le champ", async () => {
    fetchMock().mockResolvedValue(refusal());
    render(<AssistantView />);
    field().focus();
    await ask("recette du gâteau au chocolat");
    const status = screen.getByRole("status");
    const block = status.querySelector("[data-refusal]");
    expect(block?.textContent).toBe(t.refusalInfoAbsente);
    expect(block?.querySelector("svg")).not.toBeNull();
    expect(status.querySelector("[data-answer]")).toBeNull();
    expect(within(status).queryByRole("list", { name: t.sourcesLabel })).toBeNull();
    expect(within(status).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it("seconde question : l'échange précédent disparaît de l'écran, nouveau clientRequestId", async () => {
    fetchMock().mockResolvedValueOnce(answer("Première réponse [P1].")).mockResolvedValueOnce(refusal());
    render(<AssistantView />);
    await ask("Première question");
    expect(screen.getByText("Première réponse [P1].")).toBeTruthy();
    await ask("Seconde question");
    expect(screen.queryByText("Première question")).toBeNull();
    expect(screen.queryByText("Première réponse [P1].")).toBeNull();
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
    expect(screen.getByText("Une facture est émise sous 5 jours ouvrés [P1].")).toBeTruthy();
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

  it("délai client de 85 s, au-delà du relais (70 s) et sous maxDuration (120 s) : requête abandonnée, alerte AI_TIMEOUT avec « Réessayer »", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetchMock().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = (init as RequestInit).signal ?? undefined;
          signal?.addEventListener("abort", () => reject(new DOMException("abandon", "AbortError")));
        }),
    );
    expect(CHAT_CLIENT_TIMEOUT_MS).toBe(85_000);
    render(<AssistantView />);
    type("Question");
    fireEvent.keyDown(field(), { key: "Enter" });
    await act(() => vi.advanceTimersByTimeAsync(84_000));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(signal?.aborted).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(signal?.aborted).toBe(true);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.failedTitle);
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
