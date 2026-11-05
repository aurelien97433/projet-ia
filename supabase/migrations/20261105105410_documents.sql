-- Story 2.2 : Documents et vue de liste (FR-4, FR-7, AD-2, AD-5, AD-6, AD-16).

create type public.document_category as enum (
  'procedure', 'faq', 'meeting_note', 'project_sheet', 'client_report', 'business_resource', 'other'
);
create type public.document_kind as enum ('note', 'file');
create type public.document_status as enum ('processing', 'ready', 'error');
create type public.document_error_kind as enum ('temporary', 'no_text');

-- Un Document de la Base commune. Statut, tentative, erreurs et Résumé ne sont écrits que par les
-- valeurs par défaut et, plus tard, par les fonctions SQL du traitement (stories 2.3 à 2.5, 6.1).
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null,
  category public.document_category not null,
  kind public.document_kind not null default 'note',
  storage_path text,
  mime_type text,
  size_bytes integer,
  -- Texte canonique (AD-8). Note : 1 000 000 octets UTF-8 au plus, même limite que les fichiers.
  content_text text,
  text_version integer not null default 1,
  status public.document_status not null default 'processing',
  error_kind public.document_error_kind,
  error_message text,
  attempt_id uuid not null default gen_random_uuid(),
  processing_started_at timestamptz not null default now(),
  summary_points jsonb,
  summary_text_version integer,
  summary_generated_at timestamptz,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint documents_content_size check (content_text is null or octet_length(content_text) <= 1000000),
  constraint documents_note_has_text check (kind <> 'note' or (content_text is not null and btrim(content_text) <> '')),
  -- Idempotence (AD-16) : un même identifiant de demande ne crée qu'un Document par Auteur.
  constraint documents_author_request_unique unique (author_id, client_request_id)
);

create index documents_created_at_idx on public.documents (created_at desc);

-- Horodatage de modification. Fonction de déclencheur : aucun rôle applicatif ne l'appelle.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger documents_set_updated_at
  before update on public.documents
  for each row
  execute function public.set_updated_at();

alter table public.documents enable row level security;

-- Supabase accorde par défaut tous les droits à authenticated sur une nouvelle table : retrait
-- complet, puis privilèges colonne par colonne. Un appel direct ne peut donc ni fixer l'Auteur, ni
-- le Statut, ni la tentative, ni les erreurs, ni le Résumé (permission denied, 42501).
revoke all on table public.documents from anon, authenticated;
grant select on table public.documents to authenticated;
grant insert (title, category, content_text, client_request_id) on table public.documents to authenticated;
grant update (title, category) on table public.documents to authenticated;

create policy "Les Collaborateurs lisent les Documents"
  on public.documents
  for select
  to authenticated
  using (true);

-- Création : Auteur = Collaborateur connecté, Note en cours de traitement (défense en profondeur :
-- les colonnes author_id, kind et status ne sont de toute façon pas accordées en écriture).
create policy "Un Collaborateur crée ses Notes en cours de traitement"
  on public.documents
  for insert
  to authenticated
  with check (author_id = (select auth.uid()) and status = 'processing' and kind = 'note');

create policy "L'Auteur modifie le titre et la Catégorie de ses Documents"
  on public.documents
  for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- Liste des Documents (AD-6) : hérite de la RLS (security_invoker), sans texte ni Résumé.
-- Statut effectif : un Document en cours depuis plus de 3 min apparaît en erreur temporaire, pour
-- tous et après rechargement, sans tâche planifiée.
create view public.documents_list
with (security_invoker = true)
as
select
  d.id,
  d.author_id,
  p.display_name as author_name,
  d.title,
  d.category,
  d.kind,
  d.mime_type,
  d.size_bytes,
  d.status,
  case
    when d.status = 'processing' and d.processing_started_at < now() - interval '3 minutes'
      then 'error'::public.document_status
    else d.status
  end as effective_status,
  case
    when d.status = 'processing' and d.processing_started_at < now() - interval '3 minutes'
      then 'temporary'::public.document_error_kind
    else d.error_kind
  end as effective_error_kind,
  d.processing_started_at,
  d.text_version,
  d.created_at,
  d.updated_at,
  now() as server_now
from public.documents d
left join public.profiles p on p.id = d.author_id;

revoke all on table public.documents_list from anon, authenticated;
grant select on table public.documents_list to authenticated;
