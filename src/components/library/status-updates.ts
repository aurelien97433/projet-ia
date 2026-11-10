import { texts } from "@/lib/texts";
import type { DocumentStatusItem, LibraryDocument } from "@/server/documents/list-documents";

// Statuts reçus du suivi groupé (useLibraryStatuses), partagés par la Bibliothèque et le Tableau de
// bord. Seules les lignes présentes dans la réponse changent.
export function statusMap(items: readonly DocumentStatusItem[]): Map<string, LibraryDocument["effectiveStatus"]> {
  return new Map(items.map((item) => [item.id, item.effectiveStatus]));
}

// Annonces des changements de Statut, limitées aux Documents de l'utilisateur (Q4 de la story 3.3).
export function statusAnnouncements(
  documents: readonly LibraryDocument[],
  byId: ReadonlyMap<string, LibraryDocument["effectiveStatus"]>,
  userId: string,
): string[] {
  return documents
    .filter((document) => {
      const next = byId.get(document.id);
      return next && next !== document.effectiveStatus && document.authorId === userId;
    })
    .map((document) => texts.library.statusChanged(document.title, texts.status[byId.get(document.id)!]));
}

// Documents avec leurs nouveaux Statuts ; le même tableau s'il n'y a aucun changement.
export function withStatuses<T extends LibraryDocument>(
  documents: readonly T[],
  byId: ReadonlyMap<string, LibraryDocument["effectiveStatus"]>,
): readonly T[] {
  let changed = false;
  const next = documents.map((document) => {
    const status = byId.get(document.id);
    if (!status || status === document.effectiveStatus) return document;
    changed = true;
    return { ...document, effectiveStatus: status };
  });
  return changed ? next : documents;
}
