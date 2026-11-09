// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// L'état de title-focus est propre au module : un module neuf par test simule un nouveau chargement.
async function load() {
  const { PageTitle } = await import("@/components/shell/page-title");
  const focus = await import("@/components/shell/title-focus");
  return { PageTitle, ...focus };
}

const title = () => screen.getByRole("heading", { level: 1 });

beforeEach(() => vi.resetModules());
afterEach(cleanup);

describe("PageTitle et Passage actif", () => {
  it("changement d'écran sans Passage : le titre reçoit le focus", async () => {
    const { PageTitle, shouldFocusTitle } = await load();
    shouldFocusTitle();
    render(<PageTitle>Document</PageTitle>);
    expect(document.activeElement).toBe(title());
  });

  it("premier chargement sans Passage : le focus n'est pas déplacé", async () => {
    const { PageTitle } = await load();
    render(<PageTitle>Document</PageTitle>);
    expect(document.activeElement).toBe(document.body);
  });

  it("changement d'écran avec Passage actif : le titre laisse le focus", async () => {
    const { PageTitle, shouldFocusTitle } = await load();
    shouldFocusTitle();
    render(<PageTitle yieldFocus>Document</PageTitle>);
    expect(document.activeElement).toBe(document.body);
  });

  it("nouveau rendu avec Passage actif : le titre ne reprend pas le focus", async () => {
    const { PageTitle, shouldFocusTitle } = await load();
    shouldFocusTitle();
    const { rerender } = render(<PageTitle yieldFocus>Document</PageTitle>);
    rerender(<PageTitle yieldFocus>Document modifié</PageTitle>);
    expect(document.activeElement).toBe(document.body);
  });

  it("titre qui laisse le focus : l'état partagé est tout de même consommé", async () => {
    const { PageTitle, shouldFocusTitle } = await load();
    render(<PageTitle yieldFocus>Document</PageTitle>);
    expect(shouldFocusTitle()).toBe(true);
  });
});
