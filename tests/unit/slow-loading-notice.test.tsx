// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SlowLoadingNotice } from "@/components/documents/slow-loading-notice";
import { texts } from "@/lib/texts";

const root = path.resolve(import.meta.dirname, "..", "..");

afterEach(cleanup);

// L'apparition réelle à 10 s est prouvée dans un navigateur (tests/e2e/document-page.spec.ts).
describe("SlowLoadingNotice", () => {
  it("message et lien de rechargement vers l'URL courante, dans une zone annoncée", () => {
    render(<SlowLoadingNotice />);
    const zone = screen.getByRole("status");
    expect(zone.className).not.toContain("slow-loading-notice");
    expect(zone.querySelector(".slow-loading-notice")).not.toBeNull();
    expect(zone.textContent).toContain(texts.document.loadingSlow);
    // Par son texte : jsdom ne donne pas le rôle « link » à un href vide (rôle vérifié en e2e).
    const retry = screen.getByText(texts.document.loadingRetry);
    expect(retry.tagName).toBe("A");
    expect(retry.getAttribute("href")).toBe("");
  });

  it("le délai de 10 s est porté par le CSS, sans minuteur client", () => {
    const css = readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");
    expect(css).toMatch(/\.slow-loading-notice\s*\{\s*visibility: hidden;\s*animation: slow-loading-reveal 0s linear 10s forwards;/);
    const source = readFileSync(path.join(root, "src", "components", "documents", "slow-loading-notice.tsx"), "utf8");
    expect(source).not.toContain('"use client"');
  });
});
