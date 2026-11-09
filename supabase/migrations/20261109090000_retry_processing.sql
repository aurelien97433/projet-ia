-- Story 2.5 : relance d'un traitement en erreur temporaire (FR-7, FR-13, AD-5, AD-6, AD-16).

-- Dernier identifiant de demande de relance : un rejeu de cette demande ne crée aucune tentative.
alter table public.documents add column last_retry_request_id uuid;

-- Vue reprise à l'identique ; effective_error_message ajoutée en dernier (create or replace l'exige).
create or replace view public.documents_list
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
  now() as server_now,
  case
    when d.status = 'processing' and d.processing_started_at < now() - interval '3 minutes'
      then 'Le traitement n''a pas pu aboutir. Vous pouvez le relancer.'
    else d.error_message
  end as effective_error_message
from public.documents d
left join public.profiles p on p.id = d.author_id;

-- Relance demandée par l'Auteur, avec son jeton. Renvoie la nouvelle tentative, ou null pour un rejeu
-- (rien n'est à déclencher). Le verrou exclut une relance concurrente et une fin de tentative ; le
-- Statut effectif est relu dans la vue, seule détentrice de la règle des 3 min. Après la relance,
-- attempt_id a changé : les écritures tardives de l'ancienne tentative ne modifient rien (false).
create function public.retry_processing(p_document_id uuid, p_client_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid;
  v_last_retry_request_id uuid;
  v_effective_status public.document_status;
  v_effective_error_kind public.document_error_kind;
  v_attempt_id uuid := gen_random_uuid();
begin
  if p_client_request_id is null then
    raise exception 'retry_processing : identifiant de demande manquant' using errcode = '22023';
  end if;

  select author_id, last_retry_request_id
  into v_author_id, v_last_retry_request_id
  from public.documents
  where id = p_document_id
  for update;
  if not found then
    raise exception 'retry_processing : Document absent' using errcode = 'P0002';
  end if;

  if v_author_id is distinct from (select auth.uid()) then
    raise exception 'retry_processing : réservé à l''Auteur' using errcode = '42501';
  end if;

  if v_last_retry_request_id = p_client_request_id then
    return null;
  end if;

  select effective_status, effective_error_kind
  into v_effective_status, v_effective_error_kind
  from public.documents_list
  where id = p_document_id;
  if v_effective_status is distinct from 'error' or v_effective_error_kind is distinct from 'temporary' then
    raise exception 'retry_processing : Statut non relançable' using errcode = '55000';
  end if;

  delete from public.passages where document_id = p_document_id;

  update public.documents
  set
    status = 'processing',
    error_kind = null,
    error_message = null,
    attempt_id = v_attempt_id,
    processing_started_at = now(),
    last_retry_request_id = p_client_request_id
  where id = p_document_id;

  return v_attempt_id;
end;
$$;

revoke all on function public.retry_processing(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.retry_processing(uuid, uuid) to authenticated;
