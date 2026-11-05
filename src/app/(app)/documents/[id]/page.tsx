import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AddedOn } from "@/components/documents/added-on";
import { StatusBadge } from "@/components/documents/status-badge";
import { PageTitle } from "@/components/shell/page-title";
import { createClient } from "@/lib/supabase/server";
import { texts } from "@/lib/texts";
import { getDocument } from "@/server/documents/get-document";

// E7 · Document, version minimale (story 2.2) : titre, Catégorie, Auteur, date, badge de Statut et
// texte brut. Bandeau, interrogation du Statut et actions arrivent avec les stories 2.3 et suivantes.
// Identifiant invalide ou Document absent : E9 (même page qu'un accès refusé).
export default async function DocumentPage({ params, searchParams }: PageProps<"/documents/[id]">) {
  // Lecture liée à la requête : le client Supabase compare l'expiration du jeton à l'heure courante,
  // valeur que cacheComponents refuse pendant le pré-rendu.
  await connection();
  const { id } = await params;
  const { ajoute } = await searchParams;
  const supabase = await createClient();
  const document = await getDocument(id, supabase);
  if (!document) notFound();

  return (
    <article className="flex flex-col gap-6">
      {ajoute === "1" ? (
        <div role="status" className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground">
          {texts.document.added}
        </div>
      ) : null}

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

      {/* Texte brut (AD-8) : nœud texte React, jamais de HTML interprété. */}
      <section aria-label={texts.document.textLabel}>
        <p className="max-w-reading text-base leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
          {document.content}
        </p>
      </section>
    </article>
  );
}
