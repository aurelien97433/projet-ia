"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AddedOn } from "@/components/documents/added-on";
import { DocumentReader } from "@/components/documents/document-reader";
import { StatusBadge } from "@/components/documents/status-badge";
import { ErrorAlert } from "@/components/forms/error-alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { documentPassagesHref, layoutPassages, type PassagePosition } from "@/lib/passages";
import { type SourceDocument, sourceDocumentSchema } from "@/lib/schemas/chat";
import { texts } from "@/lib/texts";

const t = texts.sourcePanel;

// Identifiant du panneau, cible de aria-controls des puces de Source.
export const SOURCE_PANEL_ID = "panneau-source";

// Puce ouverte dans le panneau : clé (identifiant de la puce, cible du retour du focus), Document et
// Passages cités. passages et textVersion sont absents dans une réponse d'avant la 5.7 relayée par un
// chat non redéployé : le Document est alors affiché en entier avec le message « Passage introuvable ».
export type SourceSelection = {
  key: string;
  documentId: string;
  title: string;
  passages?: PassagePosition[];
  textVersion?: number;
};

// Position invalide : le Lecteur la rejette et affiche « Passage introuvable » (Document en entier).
const MISSING: PassagePosition[] = [{ start: -1, end: -1 }];

// ≥ 1024 px : aside non modal à droite ; en dessous : Sheet modal (EXPERIENCE.md, E4a).
const WIDE_QUERY = "(min-width: 1024px)";
// matchMedia absent (environnement sans mise en page) : Sheet, la forme qui convient à toute largeur.
const wideQuery = () => (typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY) : null);
function subscribeWide(callback: () => void) {
  const query = wideQuery();
  query?.addEventListener("change", callback);
  return () => query?.removeEventListener("change", callback);
}
export const useWideLayout = () =>
  useSyncExternalStore(
    subscribeWide,
    () => wideQuery()?.matches ?? false,
    () => false,
  );

type SourcePanelProps = {
  // Puce montrée, ou null : panneau fermé.
  selection: SourceSelection | null;
  wide: boolean;
  // ✕, Échap ou « ← Retour à la Conversation » : le parent ferme le panneau. restoreFocus faux : Échap
  // pressé alors que le focus était hors de l'aside (champ de question…), le focus ne bouge pas.
  onClose: (restoreFocus?: boolean) => void;
  // Fermeture du Sheet terminée : le parent rend le focus à la puce d'origine.
  onSheetClosed: () => void;
  // Document supprimé pendant l'ouverture (404) : la puce passe au style supprimé pour la suite de la visite.
  onDeleted: (documentId: string) => void;
};

// Panneau Source (story 5.7, E4a, UX-DR15). À partir de 1024 px : aside non modal à droite, la
// Conversation reste visible et utilisable, Échap le ferme. En dessous : Sheet modal (fond inerte, focus
// piégé), plein écran sous 768 px, avec « ← Retour à la Conversation ». Le Document est lu à chaque
// ouverture par GET /api/documents/[id] ; son texte reste du texte brut (Lecteur, AD-8).
export function SourcePanel({ selection, wide, onClose, onSheetClosed, onDeleted }: SourcePanelProps) {
  // Dernière puce montrée : le Sheet garde son contenu pendant l'animation de fermeture.
  const [shown, setShown] = useState(selection);
  if (selection && selection !== shown) setShown(selection);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!wide || !selection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Échap pendant une composition (IME) l'annule : le panneau reste ouvert.
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      // Focus rendu à la puce seulement s'il était dans le panneau.
      onClose(asideRef.current?.contains(document.activeElement) === true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [wide, selection, onClose]);

  if (wide) {
    if (!selection) return null;
    return (
      <aside
        ref={asideRef}
        id={SOURCE_PANEL_ID}
        aria-labelledby={`${SOURCE_PANEL_ID}-titre`}
        data-source-panel="aside"
        className="sticky top-6 flex max-h-[calc(100dvh-3rem)] w-[22rem] shrink-0 flex-col overflow-y-auto rounded-lg border border-border bg-background p-4 xl:w-[26rem]"
      >
        <SourcePanelBody key={selection.key} selection={selection} sheet={false} onClose={onClose} onDeleted={onDeleted} />
      </aside>
    );
  }

  return (
    <Sheet open={selection !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        id={SOURCE_PANEL_ID}
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        data-source-panel="sheet"
        className="w-full max-w-none gap-0 overflow-y-auto p-4 sm:max-w-none md:w-[32rem] md:max-w-[32rem]"
        // Le focus va sur le titre du panneau (posé par le contenu), jamais sur le premier bouton.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // Sheet démonté parce que la fenêtre passe à ≥ 1024 px, panneau ouvert : le focus reste à l'aside.
          if (selection === null) onSheetClosed();
        }}
      >
        {shown ? <SourcePanelBody key={shown.key} selection={shown} sheet onClose={onClose} onDeleted={onDeleted} /> : null}
      </SheetContent>
    </Sheet>
  );
}

type PanelState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "deleted" }
  | { status: "ready"; document: SourceDocument };

type SourcePanelBodyProps = {
  selection: SourceSelection;
  sheet: boolean;
  onClose: (restoreFocus?: boolean) => void;
  onDeleted: (documentId: string) => void;
};

// Contenu du panneau pour une puce (remonté à chaque puce : une autre Source remplace le contenu).
function SourcePanelBody({ selection, sheet, onClose, onDeleted }: SourcePanelBodyProps) {
  const { documentId } = selection;
  const router = useRouter();
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // Index du Passage actif dans la liste de la Source. À l'ouverture (-1) : le premier Passage retrouvé
  // dans l'ordre du texte, soit « Passage 1 sur {k} » avec « Précédent » inactif (EXPERIENCE.md, E4a).
  const [activeIndex, setActiveIndex] = useState(-1);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = `${SOURCE_PANEL_ID}-titre`;
  const positionId = useId();

  // À l'ouverture : focus sur le titre du panneau, sans défilement (le Lecteur défile jusqu'au Passage).
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 404) {
          if (!controller.signal.aborted) setState({ status: "deleted" });
          return;
        }
        // Session expirée : le rafraîchissement renvoie vers la page de connexion (comme pour le chat).
        if (response.status === 401 && !controller.signal.aborted) router.refresh();
        const parsed = sourceDocumentSchema.safeParse(response.ok ? await response.json() : undefined);
        if (controller.signal.aborted) return;
        setState(parsed.success ? { status: "ready", document: parsed.data } : { status: "error" });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [documentId, attempt, router]);

  // Supprimé pendant l'ouverture : la puce passe aussitôt au style supprimé.
  useEffect(() => {
    if (state.status === "deleted") onDeleted(documentId);
  }, [state.status, documentId, onDeleted]);

  const loaded = state.status === "ready" ? state.document : null;
  // Q2 = A : positions appliquées seulement sur la version du texte enregistrée avec la Source ; sinon
  // (texte modifié, positions absentes) : Document entier, message « Passage introuvable ».
  const applicable =
    loaded !== null &&
    selection.passages !== undefined &&
    selection.passages.length > 0 &&
    selection.textVersion === loaded.textVersion;
  const passages = applicable ? (selection.passages as PassagePosition[]) : MISSING;
  const layout = loaded ? layoutPassages(loaded.content, passages, activeIndex) : null;
  const found = layout ? layout.segments.flatMap((segment) => (segment.kind === "passage" ? [segment] : [])) : [];
  const current = found.find((segment) => segment.active);
  const total = layout?.total ?? 0;
  const position = current?.position ?? 0;
  const fullPage = documentPassagesHref(documentId, applicable ? passages : [], current?.index ?? 0);

  // « Précédent » / « Suivant » : le focus reste sur le bouton ; aux extrémités, aria-disabled.
  function go(step: -1 | 1) {
    const target = found.find((segment) => segment.position === position + step);
    if (target) setActiveIndex(target.index);
  }

  const titleClass = "text-lg font-semibold text-foreground outline-none [overflow-wrap:anywhere]";
  const titleText = loaded?.title ?? selection.title;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        {sheet ? (
          <Button type="button" variant="ghost" className="-ml-2" onClick={() => onClose()} data-source-back>
            {t.back}
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" variant="ghost" size="icon" onClick={() => onClose()} data-source-close>
          <XIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">{t.close}</span>
        </Button>
      </div>

      <header className="flex min-w-0 flex-col gap-3">
        {sheet ? (
          <SheetTitle ref={titleRef} tabIndex={-1} className={titleClass}>
            {titleText}
          </SheetTitle>
        ) : (
          <h2 ref={titleRef} id={titleId} tabIndex={-1} className={titleClass}>
            {titleText}
          </h2>
        )}
        {loaded ? (
          <>
            <dl className="flex flex-col items-start gap-x-4 gap-y-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex gap-1">
                <dt className="sr-only">{texts.document.categoryLabel}</dt>
                <dd>{texts.categories[loaded.category]}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="sr-only">{texts.document.authorLabel}</dt>
                <dd className="[overflow-wrap:anywhere]">{loaded.authorName}</dd>
              </div>
              <div className="flex gap-1">
                <dt>{texts.document.addedOnLabel}</dt>
                <dd>
                  <AddedOn iso={loaded.createdAt} />
                </dd>
              </div>
              <div className="flex gap-1">
                <dt className="sr-only">{texts.document.statusLabel}</dt>
                <dd>
                  <StatusBadge status={loaded.status} />
                </dd>
              </div>
            </dl>
            {fullPage ? (
              <Link href={fullPage} data-source-full-page className="self-start text-sm font-medium text-primary underline underline-offset-4">
                {t.openFullPage}
              </Link>
            ) : null}
            {total > 1 ? (
              <div role="group" aria-label={t.navigationLabel} className="flex flex-wrap items-center gap-2" data-source-nav>
                <p id={positionId} aria-live="polite" className="text-sm text-foreground" data-source-position>
                  {t.position(position, total)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-disabled={position <= 1 || undefined}
                  className="aria-disabled:opacity-60"
                  onClick={() => go(-1)}
                >
                  {t.previous}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-disabled={position >= total || undefined}
                  className="aria-disabled:opacity-60"
                  onClick={() => go(1)}
                >
                  {t.next}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </header>

      {state.status === "loading" ? (
        <div className="flex flex-col gap-4">
          <div aria-hidden="true" data-skeleton-rows className="flex animate-pulse flex-col gap-3">
            <div className="h-4 w-2/3 rounded-md bg-surface" />
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-20 w-full rounded-md bg-surface" />
            ))}
          </div>
          {/* Au-delà de 10 s (CSS, comme SlowLoadingNotice) : message et « Réessayer », sans rechargement de la page. */}
          <div role="status">
            <div className="slow-loading-notice flex flex-col items-start gap-3 text-sm text-foreground">
              <p>{texts.document.loadingSlow}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setState({ status: "loading" });
                  setAttempt((value) => value + 1);
                }}
              >
                {texts.document.loadingRetry}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {state.status === "error" ? (
        <ErrorAlert
          title={t.loadFailed}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              {t.retry}
            </Button>
          }
        />
      ) : null}

      {/* Région présente dès l'ouverture, vide : « Ce Document a été supprimé. » y est annoncé. */}
      <div role="status" data-source-deleted className="empty:hidden">
        {state.status === "deleted" ? <p className="rounded-lg bg-surface p-4 text-sm text-foreground">{t.deleted}</p> : null}
      </div>

      {loaded ? (
        <section aria-label={t.textLabel} className="min-w-0">
          <DocumentReader text={loaded.content} passages={passages} activeIndex={current?.index ?? activeIndex} />
        </section>
      ) : null}
    </div>
  );
}
