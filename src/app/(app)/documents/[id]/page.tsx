import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AddedOn } from "@/components/documents/added-on";
import { DocumentActions } from "@/components/documents/document-actions";
import { DocumentReader } from "@/components/documents/document-reader";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { DocumentStatusProvider } from "@/components/documents/document-status-provider";
import { StatusBanner } from "@/components/documents/status-banner";
import { PageTitle } from "@/components/shell/page-title";
import { layoutPassages, parsePassageOrigin, parsePassageParams } from "@/lib/passages";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDocument } from "@/server/documents/get-document";

// E7 · Document : titre, Catégorie, Auteur, date, badge, bandeau de Statut (suivi automatique), barre
// d'actions et Lecteur, avec les Passages de l'URL (`?passages=120-340,900-1100&actif=1`) ;
// `&depuis=recherche` (story 4.1b) : étiquette « Passage pertinent ».
// Identifiant invalide ou Document absent : E9 (même page qu'un accès refusé).
export default async function DocumentPage({ params, searchParams }: PageProps<"/documents/[id]">) {
  // Lecture liée à la requête : le client Supabase compare l'expiration du jeton à l'heure courante,
  // valeur que cacheComponents refuse pendant le pré-rendu.
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [document, user] = await Promise.all([getDocument(id, supabase), getCurrentUser()]);
  if (!document) notFound();

  const { passages, activeIndex } = parsePassageParams(query, document.content.length);
  const origin = parsePassageOrigin(query.depuis);
  const hasActivePassage = layoutPassages(document.content, passages, activeIndex).total > 0;
  const isAuthor = document.authorId === user?.id;

  return (
    <article className="flex flex-col gap-6">
      {/* Le fournisseur n'englobe que ce qui lit le Statut : le texte n'entre jamais dans un composant client. */}
      <DocumentStatusProvider
        key={document.id}
        documentId={document.id}
        effectiveStatus={document.effectiveStatus}
        effectiveErrorKind={document.effectiveErrorKind}
        effectiveErrorMessage={document.effectiveErrorMessage}
        processingElapsedMs={document.processingElapsedMs}
      >
        <header className="flex flex-col gap-3">
          <PageTitle yieldFocus={hasActivePassage}>{document.title}</PageTitle>
          <dl className="flex flex-col items-start gap-x-4 gap-y-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex gap-1">
              <dt className="sr-only">{texts.document.categoryLabel}</dt>
              <dd>{texts.categories[document.category]}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="sr-only">{texts.document.authorLabel}</dt>
              <dd>{document.authorName}</dd>
            </div>
            <div className="flex gap-1">
              <dt>{texts.document.addedOnLabel}</dt>
              <dd>
                <AddedOn iso={document.createdAt} />
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="sr-only">{texts.document.statusLabel}</dt>
              <dd>
                <DocumentStatusBadge />
              </dd>
            </div>
          </dl>
        </header>

        <StatusBanner documentId={document.id} title={document.title} isAuthor={isAuthor} />
        <DocumentActions documentId={document.id} title={document.title} isAuthor={isAuthor} />
      </DocumentStatusProvider>

      <section aria-label={texts.document.textLabel}>
        <DocumentReader text={document.content} passages={passages} activeIndex={activeIndex} origin={origin} focusActive />
      </section>
    </article>
  );
}
