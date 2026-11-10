import Link from "next/link";
import { AddedOn } from "@/components/documents/added-on";
import { StatusBadge } from "@/components/documents/status-badge";
import { texts } from "@/lib/texts";
import type { LibraryDocument } from "@/server/documents/list-documents";

const c = texts.library.columns;

// Tableau de la Bibliothèque (E6). Un seul lien par ligne, le titre ; la ligne entière reste
// cliquable à la souris grâce à la zone du lien étendue en CSS (::after), sans JavaScript.
// À partir de 1 024 px : toutes les colonnes. De 768 à 1 023 px : l'Auteur passe sous le titre.
// Sous 768 px (Q3) : Titre et Statut seulement, « Catégorie · Auteur · date » sous le titre.
export function LibraryTable({ documents }: { documents: readonly LibraryDocument[] }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b text-xs font-semibold text-muted-foreground">
          <th scope="col" className="py-2 pr-3 font-semibold">
            {c.title}
          </th>
          <th scope="col" className="hidden py-2 pr-3 font-semibold md:table-cell">
            {c.category}
          </th>
          <th scope="col" className="hidden py-2 pr-3 font-semibold lg:table-cell">
            {c.author}
          </th>
          <th scope="col" className="hidden py-2 pr-3 font-semibold md:table-cell">
            {c.addedOn}
          </th>
          <th scope="col" className="py-2 font-semibold">
            {c.status}
          </th>
        </tr>
      </thead>
      <tbody>
        {documents.map((document) => (
          <tr key={document.id} data-document-id={document.id} className="relative border-b hover:bg-surface">
            <td className="min-w-0 py-3 pr-3 align-top">
              <Link
                href={`/documents/${document.id}`}
                className="font-medium text-primary underline-offset-4 after:absolute after:inset-0 hover:underline"
              >
                {document.title}
              </Link>
              <p className="mt-0.5 text-xs text-muted-foreground md:hidden">
                {texts.categories[document.category]} · {document.authorName} · <AddedOn iso={document.createdAt} />
              </p>
              <p className="mt-0.5 hidden text-xs text-muted-foreground md:block lg:hidden">{document.authorName}</p>
            </td>
            <td className="hidden py-3 pr-3 align-top md:table-cell">{texts.categories[document.category]}</td>
            <td className="hidden py-3 pr-3 align-top lg:table-cell">{document.authorName}</td>
            <td className="hidden py-3 pr-3 align-top whitespace-nowrap md:table-cell">
              <AddedOn iso={document.createdAt} />
            </td>
            <td className="py-3 align-top">
              <StatusBadge status={document.effectiveStatus} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
