// Contrôle d'un secret reçu en « Authorization: Bearer ». Comparaison à durée constante, pour ne
// rien révéler de la valeur attendue. Secret attendu absent : tout appel est refusé.
function sameSecret(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export function hasBearerSecret(request: Request, expected: string | undefined): boolean {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return Boolean(expected) && token !== "" && sameSecret(token, expected!);
}
