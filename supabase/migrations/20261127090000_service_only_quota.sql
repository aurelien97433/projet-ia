-- Story 7.8, correctifs R1 et R2 de l'audit (décision de l'utilisateur du 2026-11-25).
--
-- R1 : begin_summary et end_summary étaient exécutables par authenticated. Un Collaborateur libérait
-- le verrou du Résumé lui-même (end_summary) et lançait N Résumés en parallèle ; il pouvait aussi
-- bloquer le Résumé de tous les Documents en reprenant le verrou en boucle.
-- R2 : reserve_ai_call était exécutable par authenticated. 5 Comptes × 60 réservations directes
-- vidaient le plafond global du projet, sans aucun appel au fournisseur.
--
-- Correctif : les quatre fonctions du garde-fou (reserve_ai_call, release_ai_call, begin_summary,
-- end_summary) ne sont plus exécutables que par service_role. Les Edge Functions chat et summarize les
-- appellent avec la clé service_role et l'identifiant du Collaborateur vérifié auprès d'Auth
-- (/auth/v1/user), jamais un identifiant reçu du navigateur. auth.uid() n'est plus lu : il vaut null
-- avec la clé service_role. Les signatures changent (p_user_id ajouté) : les anciennes sont supprimées,
-- aucune surcharge ne reste. Les règles de calcul sont inchangées.

drop function public.reserve_ai_call();
drop function public.release_ai_call(uuid);
drop function public.begin_summary(uuid);
drop function public.end_summary(uuid);

-- Réserve une unité pour le Collaborateur p_user_id. En une transaction : verrou du compteur global du
-- jour, puis de celui du Compte (toujours dans cet ordre, comme release_ai_call : pas d'interblocage),
-- refus si l'un est atteint, sinon les deux incrémentés. Renvoie
-- { ok, reason ('user' | 'global'), reset_at (prochain 00:00 UTC), reservation_id }.
create function public.reserve_ai_call(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_reset timestamptz := (v_day + 1)::timestamp at time zone 'utc';
  v_quota integer;
  v_cap integer;
  v_user_count integer;
  v_global_count integer;
  v_reservation uuid;
begin
  if p_user_id is null then
    raise exception 'reserve_ai_call : Collaborateur absent' using errcode = '42501';
  end if;

  select value into v_quota from public.ai_limits where key = 'ai_daily_quota';
  select value into v_cap from public.ai_limits where key = 'ai_global_daily_cap';
  if v_quota is null or v_cap is null then
    raise exception 'reserve_ai_call : limites absentes de ai_limits' using errcode = '55000';
  end if;

  insert into public.ai_usage_global (day_utc) values (v_day) on conflict (day_utc) do nothing;
  select count into v_global_count from public.ai_usage_global where day_utc = v_day for update;

  insert into public.ai_usage (user_id, day_utc) values (p_user_id, v_day) on conflict (user_id, day_utc) do nothing;
  select count into v_user_count from public.ai_usage where user_id = p_user_id and day_utc = v_day for update;

  if v_user_count >= v_quota then
    return jsonb_build_object('ok', false, 'reason', 'user', 'reset_at', v_reset);
  end if;
  if v_global_count >= v_cap then
    return jsonb_build_object('ok', false, 'reason', 'global', 'reset_at', v_reset);
  end if;

  update public.ai_usage_global set count = count + 1 where day_utc = v_day;
  update public.ai_usage set count = count + 1 where user_id = p_user_id and day_utc = v_day;
  insert into public.ai_reservations (user_id, day_utc) values (p_user_id, v_day) returning id into v_reservation;

  return jsonb_build_object('ok', true, 'reset_at', v_reset, 'reservation_id', v_reservation);
end;
$$;

-- Rend l'unité d'une réservation du Collaborateur p_user_id, une seule fois, aux deux compteurs du
-- jour de la réservation, jamais sous 0. Renvoie true si l'unité est rendue.
create function public.release_ai_call(p_user_id uuid, p_reservation_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_day date;
begin
  if p_user_id is null then
    raise exception 'release_ai_call : Collaborateur absent' using errcode = '42501';
  end if;

  update public.ai_reservations
    set released_at = now()
    where id = p_reservation_id and user_id = p_user_id and released_at is null
    returning day_utc into v_day;
  if v_day is null then
    return false;
  end if;

  update public.ai_usage_global set count = greatest(count - 1, 0) where day_utc = v_day;
  update public.ai_usage set count = greatest(count - 1, 0) where user_id = p_user_id and day_utc = v_day;
  return true;
end;
$$;

-- Prend le verrou du Document pour le Collaborateur p_user_id : vrai s'il était libre ou expiré (plus
-- de 130 s), faux sinon. Une seule instruction, atomique.
create function public.begin_summary(p_user_id uuid, p_document_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_taken uuid;
begin
  if p_user_id is null then
    raise exception 'begin_summary : Collaborateur absent' using errcode = '42501';
  end if;
  insert into public.summary_requests (document_id, user_id, started_at)
    values (p_document_id, p_user_id, clock_timestamp())
    on conflict (document_id) do update
      set user_id = p_user_id, started_at = clock_timestamp()
      where public.summary_requests.started_at < clock_timestamp() - interval '130 seconds'
    returning document_id into v_taken;
  return v_taken is not null;
end;
$$;

-- Libère le verrou du Document, seulement s'il appartient au Collaborateur p_user_id.
create function public.end_summary(p_user_id uuid, p_document_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.summary_requests where document_id = p_document_id and user_id = p_user_id;
end;
$$;

revoke all on function public.reserve_ai_call(uuid) from public, anon, authenticated, service_role;
revoke all on function public.release_ai_call(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.begin_summary(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.end_summary(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.reserve_ai_call(uuid) to service_role;
grant execute on function public.release_ai_call(uuid, uuid) to service_role;
grant execute on function public.begin_summary(uuid, uuid) to service_role;
grant execute on function public.end_summary(uuid, uuid) to service_role;
