// Masquage des repères pendant la diffusion (story 5.5, AD-11) : le texte provisoire envoyé morceau
// par morceau (événements delta de chat) ne contient jamais un repère [P…] ni [S…], même coupé entre
// deux morceaux ou non fermé à la fin. Le texte validé (readCitations, story 5.4) remplace ensuite ce
// texte provisoire. Règle « rien en delta de pire que le texte final » (décision de l'utilisateur du
// 2026-11-17) : le masque ne fait que retirer du texte, jamais en ajouter ; tout ce qu'il retire est
// soit retiré, soit remplacé par un renvoi [S{n}] dans le texte validé.
//
// Lecture caractère par caractère :
// - « [ » est retenu ; suivi d'autre chose que « P » ou « S », il est rendu tel quel ;
// - « [P » ou « [S » suivi d'une lettre (« [Procédure] », « [Service] ») est rendu dès cette lettre ;
// - « [P » ou « [S » suivi d'un caractère de repère (chiffre, espace, ponctuation de liste, même
//   lettre) ou de « ] » ouvre un repère : il est retiré jusqu'à son « ] », ou jusqu'au premier caractère
//   qui ne peut plus en faire partie ; les espaces qui le précèdent sont retirés avec lui (« A [P1]. »
//   → « A. », comme « A[S1]. » dans le texte validé) ;
// - les espaces horizontaux sont retenus jusqu'au caractère suivant ; ceux du début sont retirés (le
//   texte validé est rogné).
// Tampon borné : au plus STREAM_MASK_MAX_HELD caractères retenus (espaces, puis « [P » au plus).
// Module pur, sans type Deno.

// Espaces horizontaux, insécables compris (même classe que citations.ts).
const HORIZONTAL = /[ \t\u00A0\u202F]/;
const LETTER = /\p{L}/u;
// Caractères d'un repère après « [P » ou « [S » (CITATION_LIKE, RENVOI_LIKE et LEFTOVER de
// citations.ts, sans saut de ligne) : tout espace horizontal (classe \s sans les fins de ligne),
// chiffres, ponctuation de liste, et « P » ou « S » quelle que soit la lettre qui a ouvert le repère
// (« [P1, S3] » est retiré en entier du texte validé).
const TOKEN_CHAR = /[^\S\n\r\v\f\u2028\u2029]|[\d,;\-–PS]/;

// Au plus 41 caractères retenus : 39 espaces, puis « [P » ou « [S ».
export const STREAM_MASK_MAX_HELD = 41;
const MAX_HELD_SPACES = STREAM_MASK_MAX_HELD - 2;

export type StreamMask = {
  // Texte à envoyer pour ce morceau (éventuellement vide).
  push(chunk: string): string;
  // Fin du flux : ce qui reste à envoyer (un repère ouvert ou des espaces de fin ne le sont jamais).
  flush(): string;
  // Nombre de caractères retenus (tests de la borne).
  held(): number;
};

export function createStreamMask(): StreamMask {
  let started = false;
  let spaces = "";
  // "" | "[" | "[P" | "[S"
  let bracket = "";
  // Lettre du repère en cours de retrait, ou null.
  let dropping: "P" | "S" | null = null;
  // Espaces retirés devant le repère en cours de retrait : rendus s'il est interrompu par une lettre
  // (« x [P1a » → « x a », comme le texte validé), jamais sinon.
  let droppedSpaces = "";

  const isTokenChar = (c: string) => TOKEN_CHAR.test(c);

  function read(c: string): string {
    let out = "";
    if (!started) {
      if (/\s/.test(c)) return "";
      started = true;
    }
    if (dropping !== null) {
      if (c === "]") {
        dropping = null;
        return "";
      }
      if (isTokenChar(c)) return "";
      // Repère interrompu (non fermé) : retiré ; le caractère est lu normalement.
      dropping = null;
      if (LETTER.test(c)) spaces = droppedSpaces;
    }
    if (bracket === "[") {
      if (c === "P" || c === "S") {
        bracket = `[${c}`;
        return "";
      }
      out += `${spaces}[`;
      spaces = "";
      bracket = "";
    } else if (bracket !== "") {
      const letter = bracket[1] as "P" | "S";
      if (c === "]" || isTokenChar(c)) {
        // Repère : retiré avec les espaces qui le précèdent.
        dropping = c === "]" ? null : letter;
        droppedSpaces = spaces;
        bracket = "";
        spaces = "";
        return "";
      }
      if (LETTER.test(c)) {
        // Mot entre crochets (« [Procédure] ») : rendu dès qu'il est reconnu.
        out += `${spaces}${bracket}${c}`;
        spaces = "";
        bracket = "";
        return out;
      }
      // « [P » suivi d'un autre caractère : retiré, le caractère est lu normalement.
      bracket = "";
    }
    if (HORIZONTAL.test(c)) {
      spaces += c;
      if (spaces.length > MAX_HELD_SPACES) {
        out += spaces[0];
        spaces = spaces.slice(1);
      }
      return out;
    }
    if (c === "[") {
      bracket = "[";
      return out;
    }
    out += `${spaces}${c}`;
    spaces = "";
    return out;
  }

  return {
    push(chunk: string): string {
      let out = "";
      for (const c of chunk) out += read(c);
      return out;
    },
    flush(): string {
      const out = bracket === "[" ? `${spaces}[` : "";
      spaces = "";
      bracket = "";
      dropping = null;
      droppedSpaces = "";
      return out;
    },
    held(): number {
      return spaces.length + bracket.length + (dropping === null ? 0 : droppedSpaces.length);
    },
  };
}

// Masque appliqué d'un coup à une suite de morceaux (tests, et texte provisoire mis bout à bout).
export function maskChunks(chunks: string[]): string[] {
  const mask = createStreamMask();
  const out = chunks.map((chunk) => mask.push(chunk));
  out.push(mask.flush());
  return out;
}
