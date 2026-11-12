"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorAlert } from "@/components/forms/error-alert";
import { Button } from "@/components/ui/button";
import { SEARCH_QUERY_MAX_LENGTH, searchResponseSchema, type SearchResult } from "@/lib/schemas/search";
import { parseSearchQueryParam, resultHref, searchHref } from "@/lib/search-links";
import { texts } from "@/lib/texts";
import { SEARCH_FIELD_ID } from "./constants";
import { SearchResultCard } from "./search-result-card";
import { SearchSkeleton } from "./search-skeleton";

const t = texts.search;

// Au-delà, la Recherche est considérée comme en échec (la route relaie déjà avec un délai de 12 s).
export const SEARCH_TIMEOUT_MS = 15_000;

type Card = { result: SearchResult; href: string };

type Outcome = { kind: "success"; cards: Card[] } | { kind: "error" };
type View = { kind: "idle" } | { kind: "loading" } | Outcome;

// Résultats affichables : seuls ceux dont le lien a pu être construit (UUID, positions valides).
function toCards(results: SearchResult[]): Card[] {
  return results.flatMap((result) => {
    const href = resultHref(result);
    return href ? [{ result, href }] : [];
  });
}

// Page Recherche (E5). L'URL (`?q=`) est la seule source de la Requête : un envoi pousse une nouvelle
// adresse, et la vue interroge POST /api/search pour chaque Requête valide. Une Recherche en cours est
// annulée par la suivante. Le focus va sur l'annonce (ou l'alerte) quand la Recherche a été lancée
// depuis la vue, ou à l'arrivée par changement d'écran ; jamais au premier chargement complet.
export function SearchView() {
  const router = useRouter();
  const raw = useSearchParams().get("q");
  const { query, fieldValue } = parseSearchQueryParam(raw);

  const [value, setValue] = useState(fieldValue);
  const [syncedRaw, setSyncedRaw] = useState(raw);
  // Retour arrière ou nouvelle adresse : le champ reprend la Requête de l'URL.
  if (raw !== syncedRaw) {
    setSyncedRaw(raw);
    setValue(fieldValue);
  }

  // Issue de la dernière Recherche, rattachée à sa clé (Requête et tentative) : une issue ancienne
  // n'est jamais affichée pour une nouvelle Requête, qui apparaît en chargement dès son rendu.
  const [attempt, setAttempt] = useState(0);
  const key = query === null ? null : `${attempt}:${query}`;
  const [outcome, setOutcome] = useState<(Outcome & { key: string }) | null>(null);
  const view: View = key === null ? { kind: "idle" } : outcome?.key === key ? outcome : { kind: "loading" };
  const containerRef = useRef<HTMLDivElement>(null);
  const announcementRef = useRef<HTMLParagraphElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const focusOnResultRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (requested: string, requestKey: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
      const isCurrent = () => controllerRef.current === controller;

      // Recherche demandée par le Collaborateur (envoi, exemple, « Réessayer » : intention notée au
      // moment de l'action, car le bouton ou l'exemple disparaît dès le chargement), ou focus dans la vue
      // ou sur le titre de l'écran (arrivée par changement d'écran) : le focus suivra le résultat.
      const active = document.activeElement;
      focusOnResultRef.current =
        focusOnResultRef.current ||
        (active !== null && active !== document.body && containerRef.current?.contains(active) === true) ||
        active?.tagName === "H1";

      let next: Outcome = { kind: "error" };
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: requested }),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        if (response.status === 401) router.refresh();
        if (response.ok) {
          const parsed = searchResponseSchema.safeParse(await response.json());
          if (parsed.success) next = { kind: "success", cards: toCards(parsed.data.results) };
        }
      } catch {
        // Réseau, délai ou réponse illisible : erreur, sauf si une Recherche plus récente a pris le relais.
      } finally {
        clearTimeout(timeout);
      }
      if (!isCurrent()) return;
      controllerRef.current = null;
      setOutcome({ ...next, key: requestKey });
    },
    [router],
  );

  useEffect(() => {
    if (query === null || key === null) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      return;
    }
    void run(query, key);
  }, [query, key, run]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  // Résultat affiché : le focus va sur l'annonce ou l'alerte si la Recherche vient du Collaborateur
  // et que le focus n'a pas été posé ailleurs entre-temps.
  useEffect(() => {
    if (view.kind !== "success" && view.kind !== "error") return;
    if (!focusOnResultRef.current) return;
    focusOnResultRef.current = false;
    const active = document.activeElement;
    const free = active === null || active === document.body || containerRef.current?.contains(active) === true;
    if (!free) return;
    (view.kind === "error" ? alertRef.current : announcementRef.current)?.focus();
  }, [view.kind, outcome]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = searchHref(value);
    if (!href) {
      fieldRef.current?.focus();
      return;
    }
    // Même Requête que l'adresse actuelle : la Recherche est relancée, sans nouvelle entrée d'historique.
    focusOnResultRef.current = true;
    if (parseSearchQueryParam(value).query === query) setAttempt((count) => count + 1);
    else router.push(href);
  }

  return (
    <div ref={containerRef} className="flex min-w-0 flex-col gap-6">
      <form role="search" onSubmit={submit} className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={SEARCH_FIELD_ID} className="text-sm font-medium text-foreground">
          {t.fieldLabel}
        </label>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <input
            ref={fieldRef}
            id={SEARCH_FIELD_ID}
            type="search"
            name="q"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t.help}
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            autoComplete="off"
            enterKeyHint="search"
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-[15px] text-foreground"
          />
          <Button type="submit" className="h-10 w-full sm:w-auto">
            {t.submit}
          </Button>
        </div>
      </form>

      {view.kind === "idle" ? (
        <div className="flex min-w-0 flex-col gap-3 text-sm text-foreground">
          <p>{t.help}</p>
          <ul aria-label={t.examplesLabel} className="flex min-w-0 flex-wrap gap-2">
            {t.examples.map((example) => (
              <li key={example} className="min-w-0">
                <Link
                  href={searchHref(example) ?? "/recherche"}
                  onClick={() => (focusOnResultRef.current = true)}
                  className="inline-flex min-h-10 items-center rounded-full border px-3 text-sm text-primary [overflow-wrap:anywhere] hover:bg-surface"
                >
                  {example}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Zone toujours présente : un lecteur d'écran n'annonce que les changements d'une zone déjà là. */}
      <div role="status" className="empty:hidden">
        {view.kind === "success" ? (
          <p ref={announcementRef} tabIndex={-1} className="text-sm font-medium text-foreground">
            {view.cards.length > 0 ? t.count(view.cards.length) : t.noResults}
          </p>
        ) : null}
      </div>

      {view.kind === "error" ? (
        <ErrorAlert
          ref={alertRef}
          title={t.failed}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                focusOnResultRef.current = true;
                setAttempt((count) => count + 1);
              }}
            >
              {t.retry}
            </Button>
          }
        />
      ) : null}

      {view.kind === "loading" ? (
        <div aria-busy="true">
          <SearchSkeleton />
        </div>
      ) : null}

      {view.kind === "success" && view.cards.length > 0 ? (
        <ul aria-label={t.resultsLabel} className="flex min-w-0 flex-col gap-3">
          {view.cards.map(({ result, href }) => (
            <li key={result.documentId} className="min-w-0">
              <SearchResultCard result={result} href={href} />
            </li>
          ))}
        </ul>
      ) : null}

      {/* Emplacement réservé (story 5.2b) : bouton « Poser la question à l'Assistant » dans l'état sans
          résultat, avec la phrase complète de FR-15, ajoutés ensemble une fois l'Assistant utilisable
          (même règle que la story 3.2). Rien n'est affiché avant. */}
    </div>
  );
}
