// Lecture d'un flux SSE (story 5.5) : événements « event: <nom> » / « data: <ligne> » séparés par une
// ligne vide ; commentaires (« : … ») ignorés ; morceaux coupés n'importe où (même au milieu d'un
// caractère, le décodage est fait par l'appelant avec TextDecoder en mode flux). Module pur.

export type SseEvent = { event: string; data: string };

export type SseParser = {
  // Texte reçu ; renvoie les événements complets qu'il termine, dans l'ordre.
  push(text: string): SseEvent[];
};

export function createSseParser(): SseParser {
  let buffer = "";
  let event = "";
  let data: string[] = [];

  const line = (raw: string, out: SseEvent[]) => {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (text === "") {
      if (data.length > 0) out.push({ event: event || "message", data: data.join("\n") });
      event = "";
      data = [];
      return;
    }
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  };

  return {
    push(text: string): SseEvent[] {
      const out: SseEvent[] = [];
      buffer += text;
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        line(buffer.slice(0, newline), out);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
      return out;
    },
  };
}
