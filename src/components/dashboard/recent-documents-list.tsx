"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/documents/status-badge";
import { statusAnnouncements, statusMap, withStatuses } from "@/components/library/status-updates";
import { useLibraryStatuses } from "@/components/library/use-library-statuses";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";
import type { DocumentStatusItem, LibraryDocument } from "@/server/documents/list-documents";

// Liste « Derniers Documents » (E3) : plus récent en tête, un seul lien par élément (le titre), la
// ligne restant cliquable à la souris par la zone du lien étendue en CSS. Les badges *en cours* sont
// suivis comme dans la Bibliothèque (Q3) : même route groupée, même annonce limitée aux Documents de
// l'utilisateur, sans déplacer le focus ni le défilement.
export function RecentDocumentsList({ documents: initial, userId }: { documents: LibraryDocument[]; userId: string }) {
  const [documents, setDocuments] = useState<readonly LibraryDocument[]>(initial);
  const [statusAnnouncement, setStatusAnnouncement] = useState("");
  const documentsRef = useRef(documents);
  useEffect(() => {
    documentsRef.current = documents;
  });
  const refreshZoneRef = useRef<HTMLDivElement>(null);

  const applyStatuses = useCallback(
    (items: DocumentStatusItem[]) => {
      const byId = statusMap(items);
      const announcements = statusAnnouncements(documentsRef.current, byId, userId);
      if (announcements.length > 0) setStatusAnnouncement(announcements.join(" "));
      setDocuments((previous) => withStatuses(previous, byId));
    },
    [userId],
  );

  const processingIds = documents.filter((document) => document.effectiveStatus === "processing").map((d) => d.id);
  const { failing, refreshNow } = useLibraryStatuses(processingIds, applyStatuses);

  async function refreshStatuses() {
    await refreshNow();
    if (document.activeElement === document.body) refreshZoneRef.current?.focus();
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Zones toujours présentes : un lecteur d'écran n'annonce que les changements d'une zone déjà là. */}
      <div ref={refreshZoneRef} tabIndex={-1} role="status" className="empty:hidden">
        {failing ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-pending-soft p-4 text-sm text-foreground">
            <p>{texts.documentStatus.statusUnavailable}</p>
            <Button type="button" variant="outline" onClick={refreshStatuses}>
              {texts.documentStatus.refresh}
            </Button>
          </div>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </p>

      <ul className="flex min-w-0 flex-col border-t">
        {documents.map((document) => (
          <li
            key={document.id}
            data-document-id={document.id}
            className="relative flex min-w-0 flex-col gap-2 border-b py-3 hover:bg-surface sm:flex-row sm:items-start sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/documents/${document.id}`}
                className="font-medium [overflow-wrap:anywhere] text-primary underline-offset-4 after:absolute after:inset-0 hover:underline"
              >
                {document.title}
              </Link>
              <p className="mt-0.5 text-xs [overflow-wrap:anywhere] text-muted-foreground">
                {texts.categories[document.category]} · {document.authorName}
              </p>
            </div>
            <div className="shrink-0">
              <StatusBadge status={document.effectiveStatus} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
