// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Story 7.8 (R11, R73-F13) : un clic sur l'entrée de l'écran courant dans le menu mobile ne change pas
// d'écran ; il ne doit pas priver le titre du focus à la navigation suivante.
vi.mock("next/navigation", () => ({ usePathname: () => "/bibliotheque" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        event.preventDefault();
        (props as { onClick?: (event: unknown) => void }).onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

async function load() {
  const { MobileNav } = await import("@/components/shell/mobile-nav");
  const focus = await import("@/components/shell/title-focus");
  const { texts } = await import("@/lib/texts");
  return { MobileNav, texts, ...focus };
}

beforeEach(() => vi.resetModules());
afterEach(cleanup);

async function openMenuAndClick(name: RegExp) {
  const { MobileNav, texts, shouldFocusTitle } = await load();
  // Premier chargement consommé : les écrans suivants donnent le focus à leur titre.
  shouldFocusTitle();
  render(<MobileNav account={null} />);
  fireEvent.click(screen.getByRole("button", { name: texts.shell.openMenu }));
  fireEvent.click(await screen.findByRole("link", { name }));
  return shouldFocusTitle;
}

describe("menu mobile et focus du titre", () => {
  it("entrée de l'écran courant : le titre de l'écran suivant reçoit toujours le focus", async () => {
    const shouldFocusTitle = await openMenuAndClick(/bibliothèque/i);
    expect(shouldFocusTitle()).toBe(true);
  });

  it("entrée d'un autre écran : le focus revient sur ☰, le nouveau titre ne le prend pas, puis l'état est consommé", async () => {
    const shouldFocusTitle = await openMenuAndClick(/assistant/i);
    expect(shouldFocusTitle()).toBe(false);
    expect(shouldFocusTitle()).toBe(true);
  });
});
