-- Story 4.1a : Recherche sémantique côté serveur (FR-14, FR-15, AD-2, AD-4).

-- Passages les plus proches d'une Requête vectorisée. security invoker : la RLS du Collaborateur
-- s'applique (Documents prêts seulement). Seuls comptent les Passages de la version active de la
-- vectorisation (modèle et version passés par _shared/config.ts) et du texte courant du Document.
-- Au plus max_per_document Passages par Document, puis max_passages au total, par similarité
-- cosinus décroissante (départage stable : Document, puis ordre du Passage).
create function public.match_passages(
  query_embedding extensions.vector,
  min_similarity double precision,
  max_passages integer,
  max_per_document integer,
  embedding_model text,
  embedding_version integer
)
returns table (
  document_id uuid,
  title text,
  category text,
  passage_id uuid,
  start_offset integer,
  end_offset integer,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- La dimension d'un paramètre n'est pas contrôlée par PostgreSQL : la conversion explicite
  -- refuse tout vecteur qui n'a pas 1 536 dimensions.
  with query as (
    select query_embedding::extensions.vector(1536) as embedding
  ),
  scored as (
    select
      p.document_id,
      d.title,
      d.category::text as category,
      p.id as passage_id,
      p.ordinal,
      p.start_offset,
      p.end_offset,
      p.content,
      1 - (p.embedding operator(extensions.<=>) q.embedding) as similarity
    from query q
    cross join public.passages p
    join public.documents d on d.id = p.document_id
    where d.status = 'ready'
      and p.text_version = d.text_version
      and p.embedding_model = match_passages.embedding_model
      and p.embedding_version = match_passages.embedding_version
  ),
  ranked as (
    select
      s.*,
      row_number() over (partition by s.document_id order by s.similarity desc, s.ordinal, s.passage_id) as document_rank
    from scored s
    where s.similarity >= min_similarity
  )
  select r.document_id, r.title, r.category, r.passage_id, r.start_offset, r.end_offset, r.content, r.similarity
  from ranked r
  where r.document_rank <= max_per_document
  order by r.similarity desc, r.document_id, r.ordinal, r.passage_id
  limit greatest(max_passages, 0);
$$;

revoke all on function public.match_passages(extensions.vector, double precision, integer, integer, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.match_passages(extensions.vector, double precision, integer, integer, text, integer)
  to authenticated;
