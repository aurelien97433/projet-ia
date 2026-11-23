"use client";

import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { useDocumentStatus } from "@/components/documents/document-status-provider";
import { ErrorAlert } from "@/components/forms/error-alert";
import { Button } from "@/components/ui/button";
import type { ErrorCode } from "@/lib/errors";
import { nextUtcMidnight, type QuotaState, quotaReachedUntil } from "@/lib/quota";
import { formatResetMoment } from "@/lib/reset-moment";
import { type StoredSummary, summaryErrorSchema, summaryResponseSchema } from "@/lib/schemas/summary";
import { texts } from "@/lib/texts";
import { useDisplayTimeZone } from "@/lib/use-hydrated";

const t = texts.summary;

// La page abandonne à 130 s (story 6.1, AD-16) : summarize 120 s < relais 125 s < page 130 s <
// maxDuration 150 s.
export const SUMMARY_CLIENT_TIMEOUT_MS = 130_000;

// Échec affiché : code AD-19, message du catalogue, resetAt (plafond global) ; focused : décidé une seule
// fois, à l'arrivée de l'échec, si le focus ira sur l'alerte (règle d'annonce de la 5.10, Q3 = A).
type SummaryFailure = { code: ErrorCode; message: string; resetAt?: string; focused: boolean };

type SummaryContextValue = {
  summary: StoredSummary | null;
  generating: boolean;
  failure: SummaryFailure | null;
  // Limite quotidienne atteinte jusqu'à ce moment (resetAt du serveur), sinon null.
  quotaUntil: string | null;
  // Identifiant du texte du bloc de limite atteinte, qui décrit le bouton en aria-disabled.
  quotaTextId: string;
  announcement: string;
  focusTarget: "summary" | "alert" | null;
  clearFocusTarget: () => void;
  generate: () => void;
};

const SummaryContext = createContext<SummaryContextValue | null>(null);

// Null hors de la page Document (aucun Résumé à proposer).
export const useDocumentSummary = (): SummaryContextValue | null => useContext(SummaryContext);

// Focus « libre » : sur la page (body), sur le bouton du Résumé ou dans le bloc Résumé ; jamais ailleurs,
// où le Collaborateur l'a posé lui-même.
function focusIsFree(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active.closest("[data-summary-zone]") !== null;
}

// Résumé de la page Document (story 6.1, EXPERIENCE.md E7, AD-18) : état partagé entre le bouton
// « Générer le Résumé » (barre d'actions) et le bloc Résumé (au-dessus du texte). Le Résumé à jour et le
// quota du Collaborateur sont lus par le composant serveur ; la génération passe par
// POST /api/documents/[id]/summary (jamais d'appel direct à l'Edge Function ni au fournisseur).
export function DocumentSummaryProvider({
  documentId,
  initialSummary,
  quota,
  children,
}: {
  documentId: string;
  initialSummary: StoredSummary | null;
  quota: QuotaState | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { markDeleted } = useDocumentStatus();
  const [summary, setSummary] = useState<StoredSummary | null>(initialSummary);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState<SummaryFailure | null>(null);
  const [quotaUntil, setQuotaUntil] = useState<string | null>(() => quotaReachedUntil(quota));
  const [announcement, setAnnouncement] = useState("");
  const [focusTarget, setFocusTarget] = useState<"summary" | "alert" | null>(null);
  const busyRef = useRef(false);
  const quotaTextId = useId();

  // Résumé reçu du serveur (rafraîchissement de la page) : il fait foi s'il existe.
  const [syncedSummary, setSyncedSummary] = useState(initialSummary);
  if (initialSummary !== syncedSummary) {
    setSyncedSummary(initialSummary);
    if (initialSummary) setSummary(initialSummary);
  }

  // Réactivation sans rechargement (comme l'Assistant, story 5.10) : à resetAt, et au retour sur
  // l'onglet si resetAt est passé.
  useEffect(() => {
    if (quotaUntil === null) return;
    const resetMs = Date.parse(quotaUntil);
    const lift = () => setQuotaUntil((current) => (current === quotaUntil ? null : current));
    const timer = setTimeout(lift, Math.max(0, resetMs - Date.now()));
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() >= resetMs) lift();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [quotaUntil]);

  const generate = useCallback(async () => {
    // Bouton occupé dès la première activation : une seconde activation est ignorée.
    if (busyRef.current || quotaUntil !== null) return;
    busyRef.current = true;
    setGenerating(true);
    setFailure(null);
    setAnnouncement("");
    const fail = (next: Omit<SummaryFailure, "focused">) => {
      const focused = focusIsFree();
      setFailure({ ...next, focused });
      setFocusTarget(focused ? "alert" : null);
    };
    try {
      const response = await fetch(`/api/documents/${documentId}/summary`, {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(SUMMARY_CLIENT_TIMEOUT_MS),
      });
      const body: unknown = await response.json().catch(() => undefined);
      if (response.ok) {
        const parsed = summaryResponseSchema.safeParse(body);
        if (parsed.success) {
          setSummary(parsed.data.summary);
          setAnnouncement(t.generated);
          // Le bouton disparaît : le focus passe au bloc Résumé s'il était libre.
          setFocusTarget(focusIsFree() ? "summary" : null);
          return;
        }
        fail({ code: "AI_UNAVAILABLE", message: t.failed });
        return;
      }
      const error = summaryErrorSchema.safeParse(body);
      if (!error.success) {
        fail({ code: "AI_UNAVAILABLE", message: t.failed });
        return;
      }
      const { code, message, resetAt } = error.data.error;
      if (code === "QUOTA_EXCEEDED") {
        setQuotaUntil(resetAt ?? nextUtcMidnight());
        return;
      }
      if (code === "NOT_FOUND") {
        markDeleted();
        return;
      }
      if (code === "UNAUTHENTICATED" || code === "DOCUMENT_NOT_READY") router.refresh();
      fail({ code, message, resetAt });
    } catch {
      // Délai de la page (130 s) ou réseau : même alerte de panne, avec « Réessayer ».
      fail({ code: "AI_TIMEOUT", message: t.failed });
    } finally {
      busyRef.current = false;
      setGenerating(false);
    }
  }, [documentId, markDeleted, quotaUntil, router]);

  const clearFocusTarget = useCallback(() => setFocusTarget(null), []);

  return (
    <SummaryContext
      value={{
        summary,
        generating,
        failure,
        quotaUntil,
        quotaTextId,
        announcement,
        focusTarget,
        clearFocusTarget,
        generate: () => void generate(),
      }}
    >
      {children}
    </SummaryContext>
  );
}

// « Générer le Résumé » (barre d'actions, Document prêt sans Résumé à jour) : « Génération du Résumé… »
// et aria-disabled pendant la génération ; aria-disabled, décrit par le bloc de limite atteinte, quand
// le quota est atteint. Jamais disabled (le focus resterait perdu, EXPERIENCE.md).
export function GenerateSummaryButton() {
  const context = useDocumentSummary();
  if (!context || context.summary) return null;
  const { generating, quotaUntil, quotaTextId, generate } = context;
  const inactive = generating || quotaUntil !== null;
  return (
    <Button
      type="button"
      variant="outline"
      data-summary-zone
      aria-disabled={inactive || undefined}
      aria-describedby={quotaUntil !== null ? quotaTextId : undefined}
      className={inactive ? "cursor-not-allowed opacity-70" : undefined}
      onClick={() => {
        if (!inactive) generate();
      }}
    >
      {generating ? t.generating : t.generate}
    </Button>
  );
}

// Bloc Résumé (au-dessus du texte) : Résumé à jour (points et mention de génération), ou, pour un
// Document prêt sans Résumé, état de génération, limite atteinte ou panne ; Document en cours ou en
// erreur : message d'attente. Région d'annonce toujours présente (« Résumé généré. »).
export function SummaryBlock() {
  const context = useDocumentSummary();
  const { status, deleted } = useDocumentStatus();
  const timeZone = useDisplayTimeZone();
  const headingId = useId();
  const summaryRef = useRef<HTMLElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const focusTarget = context?.focusTarget ?? null;
  const clearFocusTarget = context?.clearFocusTarget;

  useEffect(() => {
    if (focusTarget === null) return;
    if (focusTarget === "summary") summaryRef.current?.focus();
    else alertRef.current?.focus();
    clearFocusTarget?.();
  }, [focusTarget, clearFocusTarget]);

  if (!context || deleted) return null;
  const { summary, generating, failure, quotaUntil, quotaTextId, announcement, generate } = context;
  const ready = status.effectiveStatus === "ready";

  // Région d'annonce et bloc dans une enveloppe sans boîte (display: contents) : la région, hors du flux
  // (sr-only), n'ajoute aucun écart à la page, et n'est pas un enfant direct de l'article (celui du
  // bandeau de Statut reste le seul).
  const announcer = (
    <p role="status" className="sr-only">
      {announcement}
    </p>
  );
  const area = (content: React.ReactNode) => (
    <div data-summary-area className="contents">
      {announcer}
      {content}
    </div>
  );

  if (!ready) {
    return area(
      <p data-summary-not-ready className="text-sm text-muted-foreground">
        {t.notReady}
      </p>,
    );
  }

  if (summary) {
    const date = new Date(summary.generatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone });
    return area(
      <section
        ref={summaryRef}
        tabIndex={-1}
        data-summary-zone
        data-summary-block
        aria-labelledby={headingId}
        className="rounded-lg border border-border bg-surface p-4 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <h2 id={headingId} className="text-base font-semibold">
          {t.title}
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-[15px] [overflow-wrap:anywhere]">
          {summary.points.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">{t.mention(date)}</p>
      </section>,
    );
  }

  let content: React.ReactNode = null;
  if (generating) {
    // Trois lignes squelettes (EXPERIENCE.md, « Résumé : génération ») ; l'état est porté par le bouton.
    content = (
      <div
        data-summary-zone
        data-summary-skeleton
        aria-hidden="true"
        className="flex animate-pulse flex-col gap-2 rounded-lg border border-border p-4 motion-reduce:animate-none"
      >
        <div className="h-4 w-11/12 rounded bg-surface" />
        <div className="h-4 w-4/5 rounded bg-surface" />
        <div className="h-4 w-2/3 rounded bg-surface" />
      </div>
    );
  } else if (quotaUntil !== null) {
    content = (
      <div data-summary-zone data-summary-quota className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface p-4 text-[15px] text-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <p id={quotaTextId} className="min-w-0 [overflow-wrap:anywhere]">
          {t.quotaExceeded(formatResetMoment(quotaUntil, new Date(), timeZone))}
        </p>
      </div>
    );
  } else if (failure?.code === "DOCUMENT_NOT_READY") {
    content = (
      <p data-summary-not-ready className="text-sm text-muted-foreground">
        {t.notReady}
      </p>
    );
  } else if (failure) {
    // Plafond du fournisseur ou plafond global : alerte sans « Réessayer » ; sinon panne avec « Réessayer ».
    const withoutRetry = failure.code === "AI_BUDGET_EXHAUSTED" || failure.code === "AI_DAILY_CAP_REACHED";
    const text =
      failure.code === "AI_BUDGET_EXHAUSTED"
        ? texts.assistant.budgetExhausted
        : failure.code === "AI_DAILY_CAP_REACHED"
          ? t.dailyCapReached(failure.resetAt ? formatResetMoment(failure.resetAt, new Date(), timeZone) : "demain")
          : failure.code === "REQUEST_IN_PROGRESS"
            ? t.inProgress
            : null;
    content = (
      <div data-summary-zone>
        <ErrorAlert
          ref={alertRef}
          focused={failure.focused}
          title={t.failed}
          action={
            withoutRetry ? undefined : (
              <Button type="button" variant="outline" onClick={generate}>
                {t.retry}
              </Button>
            )
          }
        >
          {text}
        </ErrorAlert>
      </div>
    );
  }

  return area(content);
}
