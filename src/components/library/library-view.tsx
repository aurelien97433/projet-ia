"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorAlert } from "@/components/forms/error-alert";
import { ADD_HREF } from "@/components/shell/nav-items";
import { Button } from "@/components/ui/button";
import {
  ALL_CATEGORIES,
  DEFAULT_LIBRARY_FILTERS,
  libraryQueryString,
  type LibraryCategory,
  type LibraryFilters as Filters,
  type LibrarySort,
} from "@/lib/schemas/library";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";
import type { DocumentStatusItem, LibraryPage } from "@/server/documents/list-documents";
import { LibraryFilters } from "./library-filters";
import { LibraryTable } from "./library-table";
import { statusAnnouncements, statusMap, withStatuses } from "./status-updates";
import { useLibraryStatuses } from "./use-library-statuses";

const t = texts.library;

export const SEARCH_DELAY_MS = 250;
// Au-delà, la liste est considérée comme non chargée : alerte et « Réessayer ».
const LOAD_TIMEOUT_MS = 10_000;

// Liste affichée et filtres qui l'ont produite : les états vides se lisent sur ces filtres-là, pas
// sur ceux en cours de saisie. `version` change à chaque résultat de filtre, et lui seul.
type Result = { page: LibraryPage; filters: Filters; version: number };

function emptyState(filters: Filters): "base" | "mine" | "filtered" {
  const noCategory = filters.category === ALL_CATEGORIES;
  const noSearch = filters.search.trim() === "";
  if (noCategory && noSearch && !filters.mine) return "base";
  if (noCategory && noSearch && filters.mine) return "mine";
  return "filtered";
}

// Bibliothèque (E6) : la première liste vient du serveur ; chaque changement de filtre interroge
// GET /api/documents. Une requête plus récente annule la précédente, et une réponse périmée est
// ignorée. En cas d'erreur, les filtres restent tels quels et « Réessayer » les reprend.
export function LibraryView({ initial, userId }: { initial: LibraryPage | null; userId: string }) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(DEFAULT_LIBRARY_FILTERS);
  const [result, setResult] = useState<Result | null>(
    initial ? { page: initial, filters: DEFAULT_LIBRARY_FILTERS, version: 0 } : null,
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(initial === null);
  const [statusAnnouncement, setStatusAnnouncement] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const refreshZoneRef = useRef<HTMLDivElement>(null);
  const documentsRef = useRef(result?.page.documents ?? []);
  useEffect(() => {
    documentsRef.current = result?.page.documents ?? [];
  });

  useEffect(
    () => () => {
      clearTimeout(searchTimerRef.current);
      controllerRef.current?.abort();
    },
    [],
  );

  const load = useCallback(
    async (next: Filters) => {
      clearTimeout(searchTimerRef.current);
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
      const isCurrent = () => controllerRef.current === controller;
      setLoading(true);
      try {
        const query = libraryQueryString(next);
        const response = await fetch(`/api/documents${query ? `?${query}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        if (response.status === 401) router.refresh();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const page = (await response.json()) as LibraryPage;
        if (!isCurrent()) return;
        setResult((previous) => ({ page, filters: next, version: (previous?.version ?? 0) + 1 }));
        setFailed(false);
      } catch {
        // Requête remplacée par une plus récente : sa fin n'a plus d'effet.
        if (!isCurrent()) return;
        setFailed(true);
      } finally {
        clearTimeout(timeout);
        if (isCurrent()) {
          controllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [router],
  );

  function change(next: Filters) {
    setFilters(next);
    void load(next);
  }

  function changeSearch(search: string) {
    const next = { ...filters, search };
    setFilters(next);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => void load(next), SEARCH_DELAY_MS);
  }

  function resetFilters() {
    change(DEFAULT_LIBRARY_FILTERS);
    categoryRef.current?.focus();
  }

  // Statuts reçus du suivi : seules les lignes présentes dans la réponse changent ; un changement
  // sur un Document de l'utilisateur est annoncé (Q4).
  const applyStatuses = useCallback(
    (items: DocumentStatusItem[]) => {
      const byId = statusMap(items);
      const announcements = statusAnnouncements(documentsRef.current, byId, userId);
      if (announcements.length > 0) setStatusAnnouncement(announcements.join(" "));
      setResult((previous) => {
        if (!previous) return previous;
        const documents = withStatuses(previous.page.documents, byId);
        return documents !== previous.page.documents
          ? { ...previous, page: { ...previous.page, documents: [...documents] } }
          : previous;
      });
    },
    [userId],
  );

  const documents = result?.page.documents ?? [];
  const processingIds = documents.filter((document) => document.effectiveStatus === "processing").map((d) => d.id);
  const { failing, refreshNow } = useLibraryStatuses(processingIds, applyStatuses);

  async function refreshStatuses() {
    await refreshNow();
    // « Actualiser » a disparu : le focus retomberait sur la page, il passe à la zone du message.
    if (document.activeElement === document.body) refreshZoneRef.current?.focus();
  }

  const total = result?.page.total ?? 0;
  const empty = result !== null && documents.length === 0 && total === 0;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <LibraryFilters
        filters={filters}
        categoryRef={categoryRef}
        onCategoryChange={(category: LibraryCategory) => change({ ...filters, category })}
        onMineChange={(mine) => change({ ...filters, mine })}
        onSearchChange={changeSearch}
        onSortChange={(sort: LibrarySort) => change({ ...filters, sort })}
      />

      {/* Zones toujours présentes : un lecteur d'écran n'annonce que les changements d'une zone déjà là. */}
      <div ref={refreshZoneRef} tabIndex={-1} role="status" className="empty:hidden">
        {failing && !failed ? (
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

      {failed ? (
        <ErrorAlert
          title={t.loadFailed}
          action={
            <Button
              type="button"
              variant="outline"
              aria-disabled={loading || undefined}
              className={loading ? "cursor-not-allowed opacity-70" : undefined}
              onClick={async () => {
                if (loading) return;
                await load(filters);
                // L'alerte et son bouton ont disparu : le focus revient à la barre de filtres.
                if (document.activeElement === document.body) categoryRef.current?.focus();
              }}
            >
              {t.retry}
            </Button>
          }
        />
      ) : null}

      <div aria-live="polite" className={cn("flex flex-col gap-1 text-sm", failed && "hidden")}>
        {result ? (
          <>
            <p key={result.version} className="font-medium text-foreground">
              {t.count(total)}
            </p>
            {total > documents.length ? (
              <p className="text-muted-foreground">{t.truncated(documents.length)}</p>
            ) : null}
          </>
        ) : null}
      </div>

      {result && !failed ? (
        <div aria-busy={loading || undefined} className={cn("min-w-0 transition-opacity", loading && "opacity-60")}>
          {empty ? (
            <EmptyState kind={emptyState(result.filters)} onReset={resetFilters} />
          ) : (
            <LibraryTable documents={documents} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ kind, onReset }: { kind: "base" | "mine" | "filtered"; onReset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-foreground">
      <p>{kind === "base" ? t.emptyBase : kind === "mine" ? t.emptyMine : t.noResults}</p>
      {kind === "filtered" ? (
        <Button type="button" variant="outline" onClick={onReset}>
          {t.resetFilters}
        </Button>
      ) : (
        <Button asChild>
          <Link href={ADD_HREF}>{t.addDocument}</Link>
        </Button>
      )}
    </div>
  );
}
