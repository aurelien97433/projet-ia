import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AddedOn } from "@/components/documents/added-on";
import { DocumentReader } from "@/components/documents/document-reader";
import { StatusBadge } from "@/components/documents/status-badge";
import { StatusBanner } from "@/components/documents/status-banner";
import { PageTitle } from "@/components/shell/page-title";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDocument } from "@/server/documents/get-document";

// E7 · Document, version minimale : titre, Catégorie, Auteur, date, badge et bandeau de Statut (suivi
// automatique), texte brut. Les actions arrivent avec les stories suivantes.
// Identifiant invalide ou Document absent : E9 (même page qu'un accès refusé).
export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  // Lecture liée à la requête : le client Supabase compare l'expiration du jeton à l'heure courante,
  // valeur que cacheComponents refuse pendant le pré-rendu.
  await connection();
  const { id } = await params;
  const supabase = await createClient();
  const [document, user] = await Promise.all([getDocument(id, supabase), getCurrentUser()]);
  if (!document) notFound();

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <PageTitle>{document.title}</PageTitle>
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
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
              <StatusBadge status={document.effectiveStatus} />
            </dd>
          </div>
        </dl>
      </header>

      <StatusBanner
        key={document.id}
        documentId={document.id}
        isAuthor={document.authorId === user?.id}
        effectiveStatus={document.effectiveStatus}
        effectiveErrorKind={document.effectiveErrorKind}
        effectiveErrorMessage={document.effectiveErrorMessage}
        processingElapsedMs={document.processingElapsedMs}
      />

      <section aria-label={texts.document.textLabel}>
        <DocumentReader text={document.content} />
      </section>
    </article>
  );
}
