// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";

// « Mes dernières Conversations » (story 5.6) : Tableau de bord et état vide de l'Assistant. La liste est
// un composant serveur ; session, client Supabase et lecture sont simulés.
const router = { refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
const supabase = { marker: "client du Collaborateur" };
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => supabase) }));
const getCurrentUser = vi.fn();
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
const listConversations = vi.fn();
vi.mock("@/server/conversations/list-conversations", () => ({
  listConversations: (...args: unknown[]) => listConversations(...args),
}));

const { RecentConversationsSection } = await import("@/components/assistant/recent-conversations-section");

const ID = "11111111-1111-4111-8111-111111111111";

// Rend la section puis le contenu de sa frontière Suspense (composant serveur asynchrone).
async function renderSection() {
  const section = RecentConversationsSection();
  const suspense = (section.props.children as React.ReactElement[])[1] as React.ReactElement<{ children: React.ReactElement }>;
  const List = suspense.props.children.type as () => Promise<React.ReactElement>;
  render(
    <>
      {section.props.children[0]}
      {await List()}
    </>,
  );
}

beforeEach(() => {
  listConversations.mockReset();
  getCurrentUser.mockResolvedValue({ id: "moi", email: "" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Mes dernières Conversations", () => {
  it("5 au plus, client du Collaborateur ; ligne = lien vers la Conversation, date, « Sans réponse » en texte ; « Voir tout l'Historique »", async () => {
    listConversations.mockResolvedValue([
      { id: ID, title: "Comment poser mes congés ?", lastMessageAt: "2026-11-18T09:05:00.000Z", unanswered: true },
    ]);
    await renderSection();
    expect(listConversations).toHaveBeenCalledWith(supabase, 5);
    expect(screen.getByRole("heading", { level: 2, name: texts.history.recentTitle })).toBeTruthy();
    expect(screen.getByRole("link", { name: texts.history.seeAll }).getAttribute("href")).toBe("/assistant?historique=1");
    const list = screen.getByRole("list", { name: texts.history.recentTitle });
    const link = within(list).getByRole("link");
    expect(link.getAttribute("href")).toBe(`/assistant/${ID}`);
    expect(link.textContent).toContain("Comment poser mes congés ?");
    expect(link.textContent).toContain(texts.history.unanswered);
    expect(link.querySelector("time")?.getAttribute("dateTime")).toBe("2026-11-18T09:05:00.000Z");
  });

  it("vide : « Vous n'avez pas encore posé de question. » et deux exemples qui préremplissent le champ (?question=), jamais envoyés", async () => {
    listConversations.mockResolvedValue([]);
    await renderSection();
    expect(screen.getByText(texts.history.noQuestionYet)).toBeTruthy();
    const examples = within(screen.getByRole("list", { name: texts.history.examplesLabel })).getAllByRole("link");
    expect(examples.map((link) => link.textContent)).toEqual(["Comment poser mes congés ?", "Comment relancer un client qui n'a pas payé ?"]);
    expect(examples.map((link) => new URL(link.getAttribute("href")!, "http://x").searchParams.get("question"))).toEqual([
      "Comment poser mes congés ?",
      "Comment relancer un client qui n'a pas payé ?",
    ]);
  });

  it("lecture en échec : alerte confinée à la liste, « Réessayer » relit la route", async () => {
    listConversations.mockRejectedValue(new Error("base"));
    await renderSection();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(texts.library.loadFailed);
    within(alert).getByRole("button", { name: texts.library.retry }).click();
    expect(router.refresh).toHaveBeenCalled();
  });
});
