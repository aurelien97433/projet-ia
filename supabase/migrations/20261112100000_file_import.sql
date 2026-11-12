-- Story 2.6a : dépôt et import d'un fichier .txt ou .md (FR-5, FR-7, AD-2, AD-5, AD-7).

-- Bucket privé : 1 000 000 octets au plus (même valeur que tous les contrôles), sans restriction de
-- type MIME (les navigateurs déclarent mal les .md : le type est déduit de l'extension, ci-dessous).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 1000000, null)
on conflict (id) do update
  set public = false, file_size_limit = 1000000, allowed_mime_types = null;

-- Nom d'objet accepté : {auth.uid()}/uploads/{uuid}.{txt|md}, motif ancré, minuscules, sans « .. »,
-- barre oblique supplémentaire ni autre caractère. L'identifiant du Collaborateur est un UUID : sa
-- forme texte ne contient aucun caractère spécial d'expression régulière.
create function public.is_own_upload_path(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_name ~ (
      '^' || (select auth.uid())::text
      || '/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(txt|md)$'
    );
$$;

revoke all on function public.is_own_upload_path(text) from public, anon, authenticated, service_role;
-- Appelée par les politiques ci-dessous, évaluées avec le rôle du Collaborateur.
grant execute on function public.is_own_upload_path(text) to authenticated;

-- Dépôt et lecture des métadonnées par le propriétaire seul, dans son dossier d'uploads (AD-7).
-- Aucune politique de mise à jour (pas d'écrasement) ni de suppression (story 3.4) ; rien pour anon.
create policy "documents : dépôt dans son dossier d'uploads"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'documents' and public.is_own_upload_path(name));

create policy "documents : lecture de son dossier d'uploads"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'documents' and public.is_own_upload_path(name));

-- Un fichier déposé ne crée qu'un Document.
create unique index documents_storage_path_key on public.documents (storage_path) where storage_path is not null;

-- Import d'un fichier déposé (« Importer ») : vérifie l'objet et crée le Document dans la même
-- transaction, avec le jeton du Collaborateur (auth.uid()). Refus sans détail sur l'objet d'un autre :
--   P0001 unauthenticated | invalid_upload_id | upload_not_found | file_too_large
-- Rejeu (même client_request_id, ou même fichier déjà importé) : Document existant, attempt null.
create function public.import_file_document(
  p_title text,
  p_category public.document_category,
  p_upload_id text,
  p_client_request_id uuid
)
returns table (document_id uuid, attempt_to_start uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_path text;
  v_size bigint;
  v_mime text;
  v_id uuid;
  v_attempt uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;
  if p_upload_id is null
    or p_upload_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(txt|md)$' then
    raise exception 'invalid_upload_id' using errcode = 'P0001';
  end if;
  if p_client_request_id is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;

  -- Rejeu de la même demande : le Document déjà créé par CE Collaborateur.
  select d.id into v_id
  from public.documents d
  where d.author_id = v_uid and d.client_request_id = p_client_request_id;
  if found then
    return query select v_id, null::uuid;
    return;
  end if;

  v_path := v_uid::text || '/uploads/' || p_upload_id;

  -- Objet du bucket documents, à ce chemin exact, déposé par ce Collaborateur.
  select (o.metadata ->> 'size')::bigint into v_size
  from storage.objects o
  where o.bucket_id = 'documents'
    and o.name = v_path
    and o.owner_id = v_uid::text;
  if not found or v_size is null then
    raise exception 'upload_not_found' using errcode = 'P0001';
  end if;
  if v_size < 0 or v_size > 1000000 then
    raise exception 'file_too_large' using errcode = 'P0001';
  end if;

  -- Même fichier déjà importé (autre demande) : le Document existant.
  select d.id into v_id from public.documents d where d.storage_path = v_path;
  if found then
    return query select v_id, null::uuid;
    return;
  end if;

  -- Type déduit de l'extension, jamais de la déclaration du navigateur.
  v_mime := case when p_upload_id like '%.md' then 'text/markdown' else 'text/plain' end;

  begin
    insert into public.documents (
      author_id, title, category, kind, storage_path, mime_type, size_bytes, client_request_id
    )
    values (v_uid, btrim(p_title), p_category, 'file', v_path, v_mime, v_size, p_client_request_id)
    returning id, attempt_id into v_id, v_attempt;
  exception when unique_violation then
    -- Deux envois simultanés : celui qui a gagné.
    select d.id into v_id
    from public.documents d
    where (d.author_id = v_uid and d.client_request_id = p_client_request_id) or d.storage_path = v_path;
    if v_id is null then
      raise;
    end if;
    return query select v_id, null::uuid;
    return;
  end;

  -- Statut processing et processing_started_at = now() par défaut : le délai de 3 min démarre ici,
  -- après la vérification de l'objet.
  return query select v_id, v_attempt;
end;
$$;

revoke all on function public.import_file_document(text, public.document_category, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.import_file_document(text, public.document_category, text, uuid) to authenticated;
