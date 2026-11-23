-- Story 6.1 : Résumé d'un Document (FR-8, FR-23, AD-18 ; Q2 corrigée, décision de l'utilisateur du
-- 2026-11-20). Les colonnes summary_points, summary_text_version et summary_generated_at existent depuis
-- la story 2.1 ; authenticated ne peut pas les écrire (droits de colonnes : title et category seulement).
--
-- store_summary est la SEULE écriture ajoutée sur documents :
--   - security definer (un Collaborateur résume aussi les Documents d'autrui, et authenticated n'a aucun
--     droit sur summary_*), search_path vide, une seule instruction UPDATE conditionnelle ;
--   - EXECUTE à service_role SEUL : rien pour authenticated, anon ni public. Elle n'est appelée que par
--     l'Edge Function summarize, après la génération, avec la clé service_role des secrets de la
--     fonction (exception datée à AD-2) ; la lecture du Document et la réservation du quota restent
--     faites par summarize avec le jeton du Collaborateur. Un Collaborateur ne peut donc jamais écrire un
--     Résumé arbitraire (visible de tous) en l'appelant directement par l'API (42501).
--
-- Écriture seulement si le Document est prêt, si text_version vaut toujours la version lue avant la
-- génération et si aucun Résumé à jour n'existe (deux demandes concurrentes : une seule écrit). Points
-- validés : tableau JSON de 1 à 5 chaînes non vides de 400 caractères au plus. Renvoie
-- { stored, found, status, summary } : summary = Résumé stocké s'il est à jour (Document prêt,
-- summary_text_version = text_version), sinon null ; jamais le texte du Document.
create function public.store_summary(p_document_id uuid, p_text_version integer, p_points jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_stored boolean;
  v_status public.document_status;
  v_text_version integer;
  v_points jsonb;
  v_summary_version integer;
  v_generated_at timestamptz;
begin
  if p_document_id is null or p_text_version is null then
    raise exception 'store_summary : Document ou version absent' using errcode = '22023';
  end if;
  if p_points is null or jsonb_typeof(p_points) <> 'array'
      or jsonb_array_length(p_points) < 1 or jsonb_array_length(p_points) > 5 then
    raise exception 'store_summary : 1 à 5 points attendus' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_points) as point
    where jsonb_typeof(point) <> 'string'
      or btrim(point #>> '{}') = ''
      or char_length(point #>> '{}') > 400
  ) then
    raise exception 'store_summary : point vide, trop long ou non textuel' using errcode = '22023';
  end if;

  update public.documents
    set summary_points = p_points,
        summary_text_version = p_text_version,
        summary_generated_at = now()
    where id = p_document_id
      and status = 'ready'
      and text_version = p_text_version
      and summary_text_version is distinct from text_version;
  v_stored := found;

  select status, text_version, summary_points, summary_text_version, summary_generated_at
    into v_status, v_text_version, v_points, v_summary_version, v_generated_at
    from public.documents
    where id = p_document_id;
  if not found then
    return jsonb_build_object('stored', false, 'found', false, 'status', null, 'summary', null);
  end if;

  return jsonb_build_object(
    'stored', v_stored,
    'found', true,
    'status', v_status,
    'summary',
    case
      when v_status = 'ready' and v_points is not null and v_summary_version = v_text_version then
        jsonb_build_object('points', v_points, 'text_version', v_summary_version, 'generated_at', v_generated_at)
      else null
    end
  );
end;
$$;

revoke all on function public.store_summary(uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.store_summary(uuid, integer, jsonb) to service_role;
