import Link from "next/link";
import type { SearchResult } from "@/lib/schemas/search";
import { texts } from "@/lib/texts";

const categoryLabel = (category: string): string =>
  Object.hasOwn(texts.categories, category)
    ? texts.categories[category as keyof typeof texts.categories]
    : texts.categories.other;

// Résultat de Recherche (EXPERIENCE.md, E5) : une carte par Document, un seul lien vers la page
// Document au Passage. Le lien est le titre (nom accessible = texte visible du lien, WCAG 2.5.3) ;
// sa pseudo-zone `after:` couvre toute la carte, qui reste cliquable partout. Catégorie et Passage
// suivent dans l'ordre de lecture. Tout est rendu en nœuds texte (règles du Lecteur), aucun score.
export function SearchResultCard({ result, href }: { result: SearchResult; href: string }) {
  return (
    <article
      data-document-id={result.documentId}
      className="relative flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-4 text-foreground transition-colors has-[a:focus-visible]:border-ring hover:bg-surface"
    >
      <h2 className="text-base leading-snug font-semibold [overflow-wrap:anywhere]">
        <Link href={href} className="text-primary after:absolute after:inset-0 after:rounded-lg after:content-['']">
          {result.title}
        </Link>
      </h2>
      <p className="text-sm text-muted-foreground">
        <span className="sr-only">{texts.library.categoryLabel} : </span>
        {categoryLabel(result.category)}
      </p>
      <div className="min-w-0">
        <span aria-hidden="true" className="mb-1 block text-xs font-medium text-accent-text uppercase select-none">
          {texts.reader.relevantPassageLabel}
        </span>
        <p className="line-clamp-4 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
          <span className="sr-only">{texts.reader.relevantPassageLabel} : </span>
          <mark className="passage-highlight">{result.passage.content}</mark>
        </p>
      </div>
    </article>
  );
}
