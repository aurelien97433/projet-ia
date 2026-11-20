// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AddedOn } from "@/components/documents/added-on";

// Story 5.10 (report de la 5.6) : la date d'ajout suit le correctif de ConversationDate. Le serveur et
// l'hydratation rendent la même date dans un fuseau fixe (Europe/Paris) ; le navigateur passe ensuite à
// son propre fuseau. Fuseau du processus de test : New York, pour que l'écart soit visible.
const ISO = "2026-11-19T23:30:00.000Z"; // 20 novembre à Paris (00:30), 19 novembre à New York (18:30).
let originalTz: string | undefined;

beforeAll(() => {
  originalTz = process.env.TZ;
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = originalTz;
});
afterEach(cleanup);

describe("AddedOn", () => {
  it("rendu serveur : date de Paris (lendemain d'un ajout à 23:30 UTC), sans dépendre du fuseau du serveur", () => {
    const html = renderToString(<AddedOn iso={ISO} />);
    expect(html).toContain("20 novembre 2026");
    expect(html).toContain(`dateTime="${ISO}"`);
  });

  it("navigateur : fuseau du navigateur une fois monté", () => {
    const { container } = render(<AddedOn iso={ISO} />);
    expect(container.querySelector("time")?.textContent).toBe("19 novembre 2026");
  });

  it("hydratation du rendu serveur : aucun avertissement, puis fuseau du navigateur", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = renderToString(<AddedOn iso={ISO} />);
    document.body.appendChild(container);
    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(container, <AddedOn iso={ISO} />, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(container.querySelector("time")?.textContent).toBe("19 novembre 2026");
    container.remove();
    error.mockRestore();
  });
});
