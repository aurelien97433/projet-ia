import { Fragment, useId } from "react";
import { PassageScroller } from "@/components/documents/passage-scroller";
import { layoutPassages, type PassagePosition } from "@/lib/passages";
import { texts } from "@/lib/texts";

type DocumentReaderProps = {
  text: string;
  passages?: PassagePosition[];
  activeIndex?: number;
};

const t = texts.reader;

// Lecteur de Document (AD-8), partagé avec le panneau Source. Composant serveur : le texte n'est pas
// transmis à un composant client. Tout le contenu est rendu en nœuds texte, jamais interprété.
export function DocumentReader({ text, passages = [], activeIndex = 0 }: DocumentReaderProps) {
  const activeId = useId();
  const { segments, total, missing } = layoutPassages(text, passages, activeIndex);
  const notice = { none: null, some: t.somePassagesMissing, all: t.allPassagesMissing }[missing];
  const active = segments.find((segment) => segment.kind === "passage" && segment.active);

  return (
    <div className="flex max-w-reading min-w-0 flex-col gap-4">
      {/* Zone vivante toujours présente : le message est annoncé même si le Lecteur reste monté. */}
      <div role="status" className="empty:-mb-4">
        {notice && <p className="rounded-lg bg-pending-soft p-4 text-sm text-foreground">{notice}</p>}
      </div>
      <p className="text-base leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
        {segments.map((segment) =>
          segment.kind === "text" ? (
            <Fragment key={segment.start}>{segment.text}</Fragment>
          ) : (
            <Fragment key={segment.start}>
              {segment.active && (
                <span aria-hidden="true" className="mb-1 block text-xs font-medium text-accent-text uppercase select-none">
                  {t.activePassageLabel}
                </span>
              )}
              <span className="sr-only select-none">{t.passagePosition(segment.position, total)}</span>
              <mark
                id={segment.active ? activeId : undefined}
                tabIndex={segment.active ? -1 : undefined}
                className={segment.active ? "passage-highlight" : "passage-highlight-inactive"}
              >
                {segment.text}
              </mark>
            </Fragment>
          ),
        )}
      </p>
      {active && <PassageScroller targetId={activeId} scrollKey={`${activeIndex}:${active.start}:${active.text.length}`} />}
    </div>
  );
}
