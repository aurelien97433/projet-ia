-- Story 2.7 : limite de 100 000 octets (100 Ko) pour les fichiers .txt et .md et pour les Notes.
-- Mesures : docs/mesures/charge-100000-octets.md. Au-delà, l'écriture finale des Passages
-- (complete_processing) dépasse la limite de 8 s par instruction de l'API (statement_timeout de la
-- connexion authenticator) sur le plan gratuit. Même valeur que tous les contrôles de l'application.

-- Bucket : tout objet de plus de 100 000 octets est refusé au dépôt.
update storage.buckets set file_size_limit = 100000 where id = 'documents';

-- Texte canonique (Notes et fichiers, mesuré après normalisation) : 100 000 octets UTF-8 au plus.
-- Aucun Document existant ne dépasse cette taille (vérifié en lecture seule le 2026-11-12 : 4 036 octets).
alter table public.documents drop constraint documents_content_size;
alter table public.documents
  add constraint documents_content_size check (content_text is null or octet_length(content_text) <= 100000);

-- Import d'un fichier déposé : même fonction qu'en 2.6a, limite de taille à 100 000 octets. Les droits
-- (REVOKE de public, anon, authenticated, service_role ; EXECUTE pour authenticated) sont conservés
-- par CREATE OR REPLACE.
create or replace function public.import_file_document(
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
  if v_size < 0 or v_size > 100000 then
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
