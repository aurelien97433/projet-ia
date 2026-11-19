// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ConversationDate } from "@/components/assistant/conversation-rows";

// Revue de la story 5.6, constat 2 : la date du dernier échange est rendue côté serveur (Vercel, UTC).
// Le serveur rend un fuseau fixe (Europe/Paris), identique à l'hydratation ; le navigateur affiche
// ensuite son propre fuseau. Fuseau du processus de test : New York, pour que l'écart soit visible.
const ISO = "2026-11-19T09:15:00.000Z"; // 10:15 à Paris, 04:15 à New York.
let originalTz: string | undefined;

beforeAll(() => {
  originalTz = process.env.TZ;
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = originalTz;
});
afterEach(cleanup);

describe("ConversationDate", () => {
  it("rendu serveur : heure de Paris, sans dépendre du fuseau du serveur", () => {
    const html = renderToString(<ConversationDate iso={ISO} />);
    expect(html).toContain("10:15");
    expect(html).toContain(`dateTime="${ISO}"`);
  });

  it("navigateur : fuseau du navigateur une fois monté", () => {
    const { container } = render(<ConversationDate iso={ISO} />);
    expect(container.querySelector("time")?.textContent).toContain("04:15");
    expect(container.querySelector("time")?.textContent).toContain("19 novembre 2026");
  });
});
