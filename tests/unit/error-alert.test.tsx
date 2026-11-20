// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorAlert } from "@/components/forms/error-alert";

// Story 5.10 (Q3 = A, alertes lues deux fois) : une alerte qui reçoit le focus n'a pas de role="alert" ;
// celles qui ne le reçoivent pas le gardent.
afterEach(cleanup);

describe("ErrorAlert", () => {
  it("par défaut : role=\"alert\", focalisable par programme", () => {
    render(<ErrorAlert title="Titre">Texte</ErrorAlert>);
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("tabindex")).toBe("-1");
    expect(alert.getAttribute("aria-labelledby")).toBeNull();
  });

  it("focused : pas de role=\"alert\" (annoncée une seule fois, par le focus) ; groupe nommé par le titre, décrit par le texte", () => {
    render(
      <ErrorAlert title="Titre" focused>
        Texte
      </ErrorAlert>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    const group = screen.getByRole("group", { name: "Titre" });
    expect(document.getElementById(group.getAttribute("aria-describedby")!)?.textContent).toBe("Texte");
  });

  it("focused sans texte : nommé par le titre, sans description ; live = false : ni rôle ni annonce", () => {
    render(<ErrorAlert title="Titre seul" focused />);
    expect(screen.getByRole("group", { name: "Titre seul" }).getAttribute("aria-describedby")).toBeNull();
    cleanup();
    const { container } = render(<ErrorAlert title="Ancienne" live={false} />);
    expect(container.querySelector("[data-error-alert]")?.getAttribute("role")).toBeNull();
  });
});
