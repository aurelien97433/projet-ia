// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "@/lib/texts";

// Champ de Recherche du Tableau de bord (E3, story 4.1b).
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), prefetch: vi.fn() }) }));

const { DashboardSearch } = await import("@/components/dashboard/dashboard-search");
const { ActionBand } = await import("@/components/dashboard/action-band");

const t = texts.dashboard;
const field = () => screen.getByRole("searchbox", { name: t.searchLabel }) as HTMLInputElement;

beforeEach(() => push.mockReset());
afterEach(cleanup);

describe("DashboardSearch", () => {
  it("libellé masqué, texte indicatif, bouton « Rechercher », 500 caractères au plus", () => {
    render(<DashboardSearch />);
    expect(screen.getByText(t.searchLabel).className).toContain("sr-only");
    expect(field().placeholder).toBe(t.searchPlaceholder);
    expect(field().maxLength).toBe(500);
    expect(screen.getByRole("button", { name: t.searchSubmit })).toBeTruthy();
  });

  it("Entrée : ouvre /recherche?q=… (Requête encodée, espaces retirés)", () => {
    render(<DashboardSearch />);
    fireEvent.change(field(), { target: { value: " organisation des congés " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith("/recherche?q=organisation+des+cong%C3%A9s");
  });

  it("Requête vide : rien, le focus reste dans le champ", () => {
    render(<DashboardSearch />);
    fireEvent.change(field(), { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field());
  });

  it("bande d'actions : le champ est en tête, avant « Ajouter un Document », sans « Poser une question »", () => {
    const { container } = render(<ActionBand />);
    const band = container.querySelector("[data-action-band]")!;
    expect(band.firstElementChild?.getAttribute("role")).toBe("search");
    expect(screen.getByRole("link", { name: texts.library.addDocument })).toBeTruthy();
    expect(screen.queryByText(/Poser une question/)).toBeNull();
  });
});
