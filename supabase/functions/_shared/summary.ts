// Fonction summarize (story 6.1, AD-18) : validation de la demande, lecture du Document et du Résumé
// stocké, réponse de store_summary. Fonctions pures, sans type Deno : importées par summarize et testées
// par Vitest.
import { SUMMARY_MAX_POINTS, SUMMARY_POINT_MAX_LENGTH } from "./config.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Demande reçue : { documentId } (UUID), rien d'autre n'est lu. Null si elle est invalide.
export function parseSummaryRequest(body: unknown): { documentId: string } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { documentId } = body as { documentId?: unknown };
  if (typeof documentId !== "string" || !UUID.test(documentId)) return null;
  return { documentId: documentId.toLowerCase() };
}

// Résumé renvoyé au relais : points, date de génération (ISO) et version du texte résumée.
export type StoredSummary = { points: string[]; generatedAt: string; textVersion: number };

// Points stockés relus strictement (même règle que store_summary) : sinon null (jamais affichés).
export function isSummaryPoints(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= SUMMARY_MAX_POINTS &&
    value.every((point) => typeof point === "string" && point.trim() !== "" && Array.from(point).length <= SUMMARY_POINT_MAX_LENGTH)
  );
}

// Résumé à jour d'une ligne (Document lu, ou réponse de store_summary), ou null.
function storedSummary(points: unknown, summaryVersion: unknown, textVersion: unknown, generatedAt: unknown): StoredSummary | null {
  if (!isSummaryPoints(points) || !Number.isInteger(summaryVersion) || summaryVersion !== textVersion) return null;
  if (typeof generatedAt !== "string" || Number.isNaN(Date.parse(generatedAt))) return null;
  return { points, generatedAt: new Date(generatedAt).toISOString(), textVersion: summaryVersion as number };
}

// Document lu avec le jeton du Collaborateur (RLS) : Statut enregistré, version, titre, texte et Résumé
// à jour s'il existe.
export type SummaryDocument = {
  id: string;
  title: string;
  status: "processing" | "ready" | "error";
  textVersion: number;
  text: string;
  summary: StoredSummary | null;
};

export function parseSummaryDocument(value: unknown): SummaryDocument | null {
  const row = value as Record<string, unknown> | null;
  if (typeof row !== "object" || row === null) return null;
  if (typeof row.id !== "string" || typeof row.title !== "string" || !Number.isInteger(row.text_version)) return null;
  if (row.status !== "processing" && row.status !== "ready" && row.status !== "error") return null;
  if (!(row.content_text === null || typeof row.content_text === "string")) return null;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    textVersion: row.text_version as number,
    text: (row.content_text as string | null) ?? "",
    summary: storedSummary(row.summary_points, row.summary_text_version, row.text_version, row.summary_generated_at),
  };
}

// Réponse de store_summary : écriture faite ou non, Document trouvé, Statut et Résumé à jour stocké.
export type StoreResult = { stored: boolean; found: boolean; status: string | null; summary: StoredSummary | null };

export function parseStoreResult(value: unknown): StoreResult | null {
  const row = value as Record<string, unknown> | null;
  if (typeof row !== "object" || row === null || typeof row.stored !== "boolean" || typeof row.found !== "boolean") return null;
  const raw = row.summary as Record<string, unknown> | null | undefined;
  const summary =
    raw && typeof raw === "object" ? storedSummary(raw.points, raw.text_version, raw.text_version, raw.generated_at) : null;
  // Écriture faite : le Résumé stocké est forcément lisible ; sinon la réponse est illisible.
  if (row.stored && !summary) return null;
  return { stored: row.stored, found: row.found, status: typeof row.status === "string" ? row.status : null, summary };
}
