// Page de retour après connexion (FR-2) : uniquement un chemin interne à l'application.
// Toute autre valeur est remplacée par le Tableau de bord : URL absolue, « //hôte », barre oblique
// inverse, schéma (javascript:), caractère de contrôle, y compris sous forme encodée une ou
// plusieurs fois (%2F%2F, %5C…), ou chemin que la normalisation transforme en « //hôte ».
export const DEFAULT_NEXT_PATH = "/";
export const NEXT_PARAM = "suite";

const MAX_LENGTH = 2048;
const MAX_DECODE_ROUNDS = 5;
// Origine fictive : sert seulement à vérifier que la résolution du chemin reste sur la même origine.
const PROBE_ORIGIN = "http://nexamind.invalid";
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function isUnsafe(value: string): boolean {
  return (
    !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || CONTROL_CHARACTERS.test(value)
  );
}

// Chemin résolu par l'analyseur d'URL (« /a/..//hôte » devient « //hôte »), ou null s'il sort de l'origine.
function normalize(value: string): string | null {
  try {
    const url = new URL(value, PROBE_ORIGIN);
    return url.origin === PROBE_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

// Vrai si la valeur et chacune de ses formes décodées restent, avant et après normalisation,
// un chemin interne.
function staysInternal(value: string): boolean {
  let current = value;
  for (let round = 0; ; round += 1) {
    const normalized = normalize(current);
    if (isUnsafe(current) || normalized === null || isUnsafe(normalized)) return false;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return false;
    }
    if (decoded === current) return true;
    // Encodage imbriqué au-delà du raisonnable : refusé plutôt que décodé sans fin.
    if (round === MAX_DECODE_ROUNDS) return false;
    current = decoded;
  }
}

export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return DEFAULT_NEXT_PATH;
  if (!staysInternal(value)) return DEFAULT_NEXT_PATH;
  // Le chemin renvoyé est la forme normalisée, contrôlée elle aussi avec ses formes décodées.
  const path = normalize(value);
  return path !== null && staysInternal(path) ? path : DEFAULT_NEXT_PATH;
}
