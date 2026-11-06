-- Story 2.3 : fin de tentative d'un traitement (AD-5, AD-6). Une seule mise à jour conditionnelle :
-- seule la tentative courante, en cours et commencée il y a moins de 3 min peut écrire. Une
-- tentative périmée ne modifie donc rien, et les deux fonctions renvoient false.

-- Échec signalé par process-document, seul appelant (clé service_role).
create function public.fail_processing(
  p_document_id uuid,
  p_attempt_id uuid,
  p_kind public.document_error_kind,
  p_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents
  set status = 'error', error_kind = p_kind, error_message = p_message
  where id = p_document_id
    and attempt_id = p_attempt_id
    and status = 'processing'
    and processing_started_at >= now() - interval '3 minutes';
  return found;
end;
$$;

revoke all on function public.fail_processing(uuid, uuid, public.document_error_kind, text)
  from public, anon, authenticated;
grant execute on function public.fail_processing(uuid, uuid, public.document_error_kind, text)
  to service_role;

-- Abandon demandé par Next.js avec le jeton de l'Auteur, quand process-document n'a pas accusé
-- réception en 5 s. Next.js n'a pas la clé service_role (AD-20).
create function public.abandon_processing(p_document_id uuid, p_attempt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents
  set
    status = 'error',
    error_kind = 'temporary',
    error_message = 'Le traitement n''a pas pu aboutir. Vous pouvez le relancer.'
  where id = p_document_id
    and attempt_id = p_attempt_id
    and author_id = (select auth.uid())
    and status = 'processing'
    and processing_started_at >= now() - interval '3 minutes';
  return found;
end;
$$;

revoke all on function public.abandon_processing(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.abandon_processing(uuid, uuid) to authenticated;
