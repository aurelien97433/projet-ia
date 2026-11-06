-- Story 2.4 : Passages vectorisés et fin de traitement atomique (FR-8, AD-2, AD-4, AD-5, AD-8).

create extension if not exists vector with schema extensions;

-- Passages d'un Document. Positions en unités de code JavaScript dans content_text (AD-8). Écrits
-- seulement par complete_processing : authenticated n'a que la lecture des Documents prêts.
create table public.passages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  text_version integer not null,
  ordinal integer not null,
  start_offset integer not null,
  end_offset integer not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  embedding_model text not null,
  embedding_version integer not null,
  created_at timestamptz not null default now(),
  constraint passages_ordinal_positive check (ordinal >= 0),
  constraint passages_offsets check (start_offset >= 0 and end_offset > start_offset),
  constraint passages_document_order_unique unique (document_id, text_version, ordinal)
);

create index passages_embedding_idx on public.passages
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.passages enable row level security;

revoke all on table public.passages from anon, authenticated;
grant select on table public.passages to authenticated;

-- FR-8 : seuls les Passages d'un Document prêt sont lisibles.
create policy "Les Collaborateurs lisent les Passages des Documents prêts"
  on public.passages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = passages.document_id and d.status = 'ready'
    )
  );

-- Fin réussie d'une tentative, appelée par process-document seul (clé service_role). Le verrou sur
-- le Document exclut toute tentative concurrente. Une transaction unique : toute erreur (dimension,
-- contrainte) annule tout. Tentative plus courante : false, rien n'est écrit.
create function public.complete_processing(
  p_document_id uuid,
  p_attempt_id uuid,
  p_content_text text,
  p_text_version integer,
  p_embedding_model text,
  p_embedding_version integer,
  p_passages jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.documents
  where id = p_document_id
    and attempt_id = p_attempt_id
    and text_version = p_text_version
    and status = 'processing'
    and processing_started_at >= now() - interval '3 minutes'
  for update;
  if not found then
    return false;
  end if;

  -- Un Document prêt sans Passage serait introuvable : l'appel est une erreur, tout est annulé.
  if (case when jsonb_typeof(p_passages) = 'array' then jsonb_array_length(p_passages) > 0 else false end) is not true then
    raise exception 'complete_processing : aucun Passage';
  end if;

  delete from public.passages where document_id = p_document_id;

  insert into public.passages (
    document_id, text_version, ordinal, start_offset, end_offset, content,
    embedding, embedding_model, embedding_version
  )
  select
    p_document_id,
    p_text_version,
    (item ->> 'ordinal')::integer,
    (item ->> 'start')::integer,
    (item ->> 'end')::integer,
    item ->> 'content',
    (item ->> 'embedding')::extensions.vector(1536),
    p_embedding_model,
    p_embedding_version
  from jsonb_array_elements(p_passages) as item;

  update public.documents
  set content_text = p_content_text, status = 'ready', error_kind = null, error_message = null
  where id = p_document_id;

  return true;
end;
$$;

revoke all on function public.complete_processing(uuid, uuid, text, integer, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_processing(uuid, uuid, text, integer, text, integer, jsonb)
  to service_role;
