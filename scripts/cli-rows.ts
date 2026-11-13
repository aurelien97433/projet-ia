// Lignes renvoyées par `supabase db query --output-format json`. La forme dépend du mode détecté par la
// CLI (relevé le 2026-11-12, CLI 3.0.0) :
//   - terminal d'un utilisateur : tableau nu        [ { "database_bytes": … } ]
//   - agent (variables AI_AGENT, CLAUDECODE…) :     { "boundary": …, "rows": [ … ], "warning": … }
// La sortie peut aussi commencer par un BOM ou par des lignes de texte. On essaie donc chaque début
// possible (« [ » ou « { »), du premier au dernier, jusqu'à obtenir un JSON complet.
export class CliOutputError extends Error {}

const BOM = /^﻿/;

// Extrait sans secret de la sortie reçue, pour le message d'erreur : adresses de connexion, clés et
// jetons masqués, espaces réduits, 200 caractères au plus.
export function outputExcerpt(stdout: string): string {
  const masked = stdout
    .replace(BOM, "")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[masqué]")
    .replace(/\b(sb_(?:secret|publishable)_[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g, "[masqué]")
    .replace(/(password|passwd|pwd|token|secret|apikey)(\s*[=:]\s*)\S+/gi, "$1$2[masqué]")
    .replace(/\s+/g, " ")
    .trim();
  if (masked === "") return "(sortie vide)";
  return masked.length > 200 ? `${masked.slice(0, 200)}…` : masked;
}

// Toute valeur JSON complète trouvée dans la sortie, en partant du premier « [ » ou « { » possible.
function firstJson(stdout: string): unknown {
  const text = stdout.replace(BOM, "");
  let lastError = "aucun JSON dans la sortie";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character !== "[" && character !== "{") continue;
    const candidate = text.slice(index).trim();
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = (error as Error).message;
      // Texte après le JSON (ligne d'information) : on retire les lignes de fin une à une.
      const lines = candidate.split(/\r?\n/);
      for (let end = lines.length - 1; end > 0; end -= 1) {
        try {
          return JSON.parse(lines.slice(0, end).join("\n"));
        } catch {
          // Essai suivant.
        }
      }
    }
  }
  throw new CliOutputError(lastError);
}

export function parseCliRows(stdout: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = firstJson(stdout);
  } catch (error) {
    throw new CliOutputError(`sortie de la CLI illisible (${(error as Error).message}) ; reçu : ${outputExcerpt(stdout)}`);
  }
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  const rows = (parsed as { rows?: unknown } | null)?.rows;
  if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  throw new CliOutputError(`sortie de la CLI sans lignes de résultat ; reçu : ${outputExcerpt(stdout)}`);
}
