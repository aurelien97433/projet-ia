// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentReader } from "@/components/documents/document-reader";
import { texts } from "@/lib/texts";

const t = texts.reader;
const root = path.resolve(import.meta.dirname, "..", "..");
const text = "Première phrase.\nDeuxième phrase.\n\nTroisième phrase.";
const first = { start: 0, end: 16 };
const second = { start: 17, end: 33 };

const scrollIntoView = vi.fn();
let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  scrollIntoView.mockClear();
  window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
  window.matchMedia = ((query: string) => ({ matches: reducedMotion, media: query })) as typeof window.matchMedia;
  vi.spyOn(window.HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 40 } as DOMRect);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const marks = (container: HTMLElement) => [...container.querySelectorAll("mark")];
const hiddenBefore = (mark: Element) => mark.previousElementSibling?.textContent;
const textBlock = (container: HTMLElement) => container.querySelector("p.whitespace-pre-wrap")!;

describe("DocumentReader", () => {
  it("sans Passage : texte seul, ni message ni défilement, retours à la ligne conservés", () => {
    const { container } = render(<DocumentReader text={text} />);
    expect(marks(container)).toHaveLength(0);
    expect(textBlock(container).textContent).toBe(text);
    expect(textBlock(container).className).toContain("whitespace-pre-wrap");
    expect(textBlock(container).className).toContain("[overflow-wrap:anywhere]");
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.getByRole("status").childNodes).toHaveLength(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("un Passage : <mark> actif, texte masqué « 1 sur 1 », étiquette masquée aux lecteurs d'écran", () => {
    const { container } = render(<DocumentReader text={text} passages={[first]} />);
    const [mark] = marks(container);
    expect(mark.textContent).toBe("Première phrase.");
    expect(mark.className).toBe("passage-highlight");
    expect(mark.getAttribute("tabindex")).toBe("-1");
    expect(hiddenBefore(mark)).toBe("Passage utilisé 1 sur 1");
    expect(mark.previousElementSibling?.className).toContain("sr-only");
    expect(mark.previousElementSibling?.className).toContain("select-none");
    const label = screen.getByText(t.activePassageLabel);
    expect(label.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByText(t.somePassagesMissing)).toBeNull();
  });

  it("plusieurs Passages désordonnés : ordre du texte, un seul actif, autres en pointillés sans étiquette", () => {
    const { container } = render(<DocumentReader text={text} passages={[second, first]} activeIndex={1} />);
    const [one, two] = marks(container);
    expect(one.textContent).toBe("Première phrase.");
    expect(one.className).toBe("passage-highlight");
    expect(two.className).toBe("passage-highlight-inactive");
    expect(two.hasAttribute("tabindex")).toBe(false);
    expect(hiddenBefore(one)).toBe("Passage utilisé 1 sur 2");
    expect(hiddenBefore(two)).toBe("Passage utilisé 2 sur 2");
    expect(screen.getAllByText(t.activePassageLabel)).toHaveLength(1);
  });

  it("tous invalides : texte entier et message « Le Passage cité… », sans erreur", () => {
    const { container } = render(
      <DocumentReader
        text={text}
        passages={[
          { start: 900, end: 910 },
          { start: 5, end: 2 },
          { start: 1.5, end: 3 },
        ]}
      />,
    );
    expect(marks(container)).toHaveLength(0);
    expect(textBlock(container).textContent).toBe(text);
    expect(screen.getByRole("status").textContent).toBe(t.allPassagesMissing);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("chevauchement : le premier retenu, « 1 sur 1 », message « Un des Passages… » en tête", () => {
    const { container } = render(<DocumentReader text={text} passages={[first, { start: 10, end: 20 }]} />);
    expect(marks(container)).toHaveLength(1);
    expect(hiddenBefore(marks(container)[0])).toBe("Passage utilisé 1 sur 1");
    const notice = screen.getByText(t.somePassagesMissing);
    expect(notice.compareDocumentPosition(marks(container)[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("Passage actif invalide : le premier retrouvé devient actif", () => {
    const { container } = render(<DocumentReader text={text} passages={[second, first]} activeIndex={7} />);
    expect(marks(container).map((mark) => mark.className)).toEqual(["passage-highlight", "passage-highlight-inactive"]);
  });

  describe("défilement", () => {
    it("au montage : centré, sans déplacer le focus", () => {
      const { container } = render(<DocumentReader text={text} passages={[first]} />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(marks(container)[0]);
      expect(document.activeElement).toBe(document.body);
    });

    it.each([false, true])("saut immédiat dans tous les cas (mouvement réduit : %s)", (reduced) => {
      reducedMotion = reduced;
      render(<DocumentReader text={text} passages={[first]} />);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
    });

    it("Passage plus haut que la zone visible : aligné en haut", () => {
      vi.mocked(window.HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
        height: window.innerHeight + 1,
      } as DOMRect);
      render(<DocumentReader text={text} passages={[first]} />);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
    });

    it("changement d'activeIndex : défile vers le nouveau Passage ; même rendu : aucun nouveau défilement", () => {
      const passages = [first, second];
      const { container, rerender } = render(<DocumentReader text={text} passages={passages} activeIndex={0} />);
      rerender(<DocumentReader text={text} passages={passages} activeIndex={0} />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      rerender(<DocumentReader text={text} passages={passages} activeIndex={1} />);
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(scrollIntoView.mock.contexts[1]).toBe(marks(container)[1]);
    });
  });

  describe("focus du Passage actif", () => {
    it("focusActive : focus sur le <mark>, sans défilement supplémentaire", () => {
      const focus = vi.spyOn(window.HTMLElement.prototype, "focus");
      const { container } = render(<DocumentReader text={text} passages={[first]} focusActive />);
      expect(document.activeElement).toBe(marks(container)[0]);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    it("focusActive, même Passage au nouveau rendu : le focus n'est pas repris", () => {
      const passages = [first, second];
      const { container, rerender } = render(<DocumentReader text={text} passages={passages} focusActive />);
      (document.activeElement as HTMLElement).blur();
      rerender(<DocumentReader text={text} passages={passages} focusActive />);
      expect(document.activeElement).toBe(document.body);
      rerender(<DocumentReader text={text} passages={passages} activeIndex={1} focusActive />);
      expect(document.activeElement).toBe(marks(container)[1]);
    });

    it("focusActive sans Passage retrouvé : ni défilement ni focus", () => {
      render(<DocumentReader text={text} passages={[{ start: 900, end: 910 }]} focusActive />);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(document.body);
    });
  });

  describe("message quand un Passage manque", () => {
    const partial = [{ start: 900, end: 910 }, first];

    it("some : collant sous la barre, le <mark> actif y renvoie", () => {
      const { container } = render(<DocumentReader text={text} passages={partial} activeIndex={1} />);
      const status = screen.getByRole("status");
      expect(status.className).toContain("sticky");
      expect(status.className).toContain("top-14");
      expect(status.className).toContain("lg:top-0");
      const message = screen.getByText(t.somePassagesMissing);
      expect(message.id).not.toBe("");
      expect(marks(container)[0].getAttribute("aria-describedby")).toBe(message.id);
    });

    it("some : un Passage inactif n'y renvoie pas", () => {
      const { container } = render(<DocumentReader text={text} passages={[...partial, second]} activeIndex={1} />);
      expect(marks(container)[1].hasAttribute("aria-describedby")).toBe(false);
    });

    it("some : la hauteur du message est réservée au-dessus du Passage", () => {
      const { container } = render(<DocumentReader text={text} passages={partial} activeIndex={1} />);
      expect(marks(container)[0].style.getPropertyValue("--passage-notice-height")).toBe("40px");
    });

    it("all : message non collant", () => {
      render(<DocumentReader text={text} passages={[{ start: 900, end: 910 }]} />);
      expect(screen.getByRole("status").className).not.toContain("sticky");
    });

    it("aucun Passage manquant : ni collage ni renvoi", () => {
      const { container } = render(<DocumentReader text={text} passages={[first]} />);
      expect(screen.getByRole("status").className).not.toContain("sticky");
      expect(marks(container)[0].hasAttribute("aria-describedby")).toBe(false);
    });
  });

  it("Document « .md piège » réel : balisage en texte, aucun élément créé", () => {
    const trap = readFileSync(path.join(root, "demo", "documents", "test-md-piege.md"), "utf8").replace(/\r\n/g, "\n");
    const start = trap.indexOf("<img");
    const end = trap.indexOf(">", start) + 1;
    const { container } = render(<DocumentReader text={trap} passages={[{ start, end }]} />);
    expect(container.querySelectorAll("script, img, b, a")).toHaveLength(0);
    expect(marks(container)[0].textContent).toBe('<img src="x" onerror="window.__nexamindPiege = true">');
    expect(container.textContent).toContain('<script>window.__nexamindPiege = true; alert("piège");</script>');
    expect(container.textContent).toContain("**Ces astérisques restent visibles**");
  });

  it("le Lecteur reste un composant serveur et le code ne contient aucun HTML brut", () => {
    const source = (...parts: string[]) => readFileSync(path.join(root, "src", ...parts), "utf8");
    expect(source("components", "documents", "document-reader.tsx")).not.toContain("use client");
    const banned = "dangerouslySet" + "InnerHTML";
    const offenders = (readdirSync(path.join(root, "src"), { recursive: true }) as string[])
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => source(file).includes(banned));
    expect(offenders).toEqual([]);
  });
});
