import type { DocumentStatus } from "@/lib/documents";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

const STYLES: Record<DocumentStatus, { symbol: string; className: string }> = {
  ready: { symbol: "●", className: "bg-success-soft text-success" },
  processing: { symbol: "◔", className: "bg-pending-soft text-pending" },
  error: { symbol: "▲", className: "bg-destructive-soft text-destructive" },
};

// Badge de Statut (DESIGN.md) : symbole et texte, jamais la couleur seule. Le symbole est décoratif :
// le texte suffit aux lecteurs d'écran.
export function StatusBadge({ status }: { status: DocumentStatus }) {
  const { symbol, className } = STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", className)}>
      <span aria-hidden="true" className={cn(status === "processing" && "motion-safe:animate-[spin_3s_linear_infinite]")}>
        {symbol}
      </span>
      {texts.status[status]}
    </span>
  );
}
