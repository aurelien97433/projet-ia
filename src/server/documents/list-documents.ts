import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentCategory, DocumentStatus } from "@/lib/documents";
import { logEvent } from "@/lib/errors";
import {
  ALL_CATEGORIES,
  MAX_LIBRARY_ROWS,
  escapeLike,
  escapeRegex,
  type LibraryFilters,
} from "@/lib/schemas/library";

export type LibraryDocument = {
  id: string;
  title: string;
  category: DocumentCategory;
  authorId: string;
  authorName: string;
  createdAt: string;
  effectiveStatus: DocumentStatus;
};

export type LibraryPage = { documents: LibraryDocument[]; total: number };

export type DocumentStatusItem = { id: string; effectiveStatus: DocumentStatus };

type Db = Pick<SupabaseClient, "from">;

// Colonnes explicites de la vue : jamais `content_text` (absent de la vue) ni Résumé.
export const LIBRARY_COLUMNS = "id, title, category, author_id, author_name, created_at, effective_status";

type LibraryRow = {
  id: string;
  title: string;
  category: DocumentCategory;
  author_id: string;
  author_name: string | null;
  created_at: string;
  effective_status: DocumentStatus;
};

// Liste de la Bibliothèque (FR-9), lue avec le jeton du Collaborateur (RLS), tous Statuts confondus.
// Le total est exact ; les lignes sont plafonnées à `limit` (MAX_LIBRARY_ROWS par défaut et au plus ;
// 5 pour le Tableau de bord). Tri par date d'ajout, départagé par l'identifiant pour un ordre stable.
// Lecture impossible : exception journalisée.
export async function listDocuments(
  filters: LibraryFilters,
  userId: string,
  db: Db,
  limit: number = MAX_LIBRARY_ROWS,
): Promise<LibraryPage> {
  // Limite hors bornes (non entière, < 1 ou > MAX_LIBRARY_ROWS) : ramenée dans [1, MAX_LIBRARY_ROWS].
  const rowLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), MAX_LIBRARY_ROWS) : MAX_LIBRARY_ROWS;
  const ascending = filters.sort === "oldest";
  let query = db.from("documents_list").select(LIBRARY_COLUMNS, { count: "exact" });
  if (filters.category !== ALL_CATEGORIES) query = query.eq("category", filters.category);
  if (filters.mine) query = query.eq("author_id", userId);
  const search = filters.search.trim();
  if (search) {
    // Voir escapeRegex : un « * » est un joker pour PostgREST, l'expression régulière le neutralise.
    query = query.ilike("title", `%${escapeLike(search).replaceAll("*", "_")}%`);
    if (search.includes("*")) query = query.filter("title", "imatch", escapeRegex(search));
  }
  const { data, error, count } = await query
    .order("created_at", { ascending })
    .order("id", { ascending })
    .limit(rowLimit);

  if (error) {
    logEvent("list_documents_failed", { code: error.code });
    throw new Error("Lecture de la Bibliothèque impossible");
  }
  const rows = (data ?? []) as LibraryRow[];
  return {
    documents: rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      authorId: row.author_id,
      authorName: row.author_name ?? "",
      createdAt: row.created_at,
      effectiveStatus: row.effective_status,
    })),
    total: count ?? rows.length,
  };
}

// Statuts effectifs d'au plus MAX_LIBRARY_ROWS Documents, en une requête (suivi des badges *en
// cours*). Un Document absent ou inaccessible ne figure pas dans la réponse.
export async function getDocumentStatuses(ids: readonly string[], db: Db): Promise<DocumentStatusItem[]> {
  if (ids.length === 0) return [];
  if (ids.length > MAX_LIBRARY_ROWS) throw new Error("Trop d'identifiants");

  const { data, error } = await db.from("documents_list").select("id, effective_status").in("id", ids);
  if (error) {
    logEvent("get_document_statuses_failed", { code: error.code, count: ids.length });
    throw new Error("Lecture des Statuts impossible");
  }
  return ((data ?? []) as { id: string; effective_status: DocumentStatus }[]).map((row) => ({
    id: row.id,
    effectiveStatus: row.effective_status,
  }));
}
