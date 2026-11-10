// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LibraryLoading from "@/app/(app)/bibliotheque/loading";
import { texts } from "@/lib/texts";

afterEach(cleanup);

// L'apparition du message à 10 s est prouvée en e2e sur la page Document (même composant).
describe("chargement de la Bibliothèque", () => {
  it("squelette de 8 lignes, masqué aux lecteurs d'écran, et message des 10 s", () => {
    const { container } = render(<LibraryLoading />);
    const rows = container.querySelectorAll("[data-skeleton-rows] > div");
    expect(rows).toHaveLength(8);
    expect(container.querySelector("[data-skeleton-rows]")?.closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain(texts.document.loadingSlow);
  });
});
