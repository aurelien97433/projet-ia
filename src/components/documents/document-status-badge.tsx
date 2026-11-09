"use client";

import { useDocumentStatus } from "@/components/documents/document-status-provider";
import { StatusBadge } from "@/components/documents/status-badge";

// Badge de la page Document : même source d'état que le bandeau.
export function DocumentStatusBadge() {
  const { status } = useDocumentStatus();
  return <StatusBadge status={status.effectiveStatus} />;
}
