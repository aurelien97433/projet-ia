-- Story 5.2a-2 : garde-fou du crédit d'IA (AD-14, décision A + B du 2026-11-13) et enregistrement
-- atomique des échanges de la fonction chat (AD-17, FR-12).
--
-- Garde-fou : un quota par Compte et par jour UTC, et un plafond global du projet par jour UTC,
-- réservés ensemble et de façon atomique AVANT tout appel au fournisseur d'IA. Les limites sont
-- lues dans ai_limits, jamais fournies par l'appelant ; les changer = une instruction SQL
-- (docs/environnements.md), sans redéploiement.

-- Limites du garde-fou. Aucun accès direct par l'API : seules les fonctions ci-dessous les lisent.
create table public.ai_limits (
  key text primary key,
  value integer not null,
  constraint ai_limits_key check (key in ('ai_daily_quota', 'ai_global_daily_cap')),
  constraint ai_limits_value check (value >= 0)
);

-- 60 appels par Compte et par jour (AD-14) ; 300 pour le projet (environ 1,80 $ par jour au coût
-- estimé de 0,006 $ par question), décision de l'utilisateur du 2026-11-16.
insert into public.ai_limits (key, value) values ('ai_daily_quota', 60), ('ai_global_daily_cap', 300);

-- Compteur du Compte pour un jour UTC. Lecture par le propriétaire seul ; écriture par les fonctions.
create table public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_utc date not null,
  count integer not null default 0,
  primary key (user_id, day_utc),
  constraint ai_usage_count check (count >= 0)
);

-- Compteur du projet pour un jour UTC. Aucun accès direct.
create table public.ai_usage_global (
  day_utc date primary key,
  count integer not null default 0,
  constraint ai_usage_global_count check (count >= 0)
);

-- Réservations acceptées : une unité ne peut être rendue qu'une fois, par le Compte qui l'a
-- réservée, sur le jour de sa réservation. Sans elle, un Collaborateur pourrait appeler
-- release_ai_call directement après chaque question et contourner son quota. Aucun accès direct.
create table public.ai_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_utc date not null,
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create index ai_reservations_user_day_idx on public.ai_reservations (user_id, day_utc);

alter table public.ai_limits enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_usage_global enable row level security;
alter table public.ai_reservations enable row level security;

revoke all on table public.ai_limits, public.ai_usage, public.ai_usage_global, public.ai_reservations
  from public, anon, authenticated, service_role;

grant select on table public.ai_usage to authenticated;

create policy "Le propriétaire lit ses compteurs d'IA"
  on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- Réserve une unité pour le Collaborateur connecté. En une transaction : verrou du compteur global
-- du jour, puis de celui du Compte (toujours dans cet ordre, comme release_ai_call : pas d'interblocage),
-- refus si l'un est atteint, sinon les deux incrémentés. Renvoie
-- { ok, reason ('user' | 'global'), reset_at (prochain 00:00 UTC), reservation_id }.
create function public.reserve_ai_call()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_reset timestamptz := (v_day + 1)::timestamp at time zone 'utc';
  v_quota integer;
  v_cap integer;
  v_user_count integer;
  v_global_count integer;
  v_reservation uuid;
begin
  if v_user is null then
    raise exception 'reserve_ai_call : Collaborateur non authentifié' using errcode = '42501';
  end if;

  select value into v_quota from public.ai_limits where key = 'ai_daily_quota';
  select value into v_cap from public.ai_limits where key = 'ai_global_daily_cap';
  if v_quota is null or v_cap is null then
    raise exception 'reserve_ai_call : limites absentes de ai_limits' using errcode = '55000';
  end if;

  insert into public.ai_usage_global (day_utc) values (v_day) on conflict (day_utc) do nothing;
  select count into v_global_count from public.ai_usage_global where day_utc = v_day for update;

  insert into public.ai_usage (user_id, day_utc) values (v_user, v_day) on conflict (user_id, day_utc) do nothing;
  select count into v_user_count from public.ai_usage where user_id = v_user and day_utc = v_day for update;

  if v_user_count >= v_quota then
    return jsonb_build_object('ok', false, 'reason', 'user', 'reset_at', v_reset);
  end if;
  if v_global_count >= v_cap then
    return jsonb_build_object('ok', false, 'reason', 'global', 'reset_at', v_reset);
  end if;

  update public.ai_usage_global set count = count + 1 where day_utc = v_day;
  update public.ai_usage set count = count + 1 where user_id = v_user and day_utc = v_day;
  insert into public.ai_reservations (user_id, day_utc) values (v_user, v_day) returning id into v_reservation;

  return jsonb_build_object('ok', true, 'reset_at', v_reset, 'reservation_id', v_reservation);
end;
$$;

-- Rend l'unité d'une réservation du Collaborateur connecté, une seule fois, aux deux compteurs du
-- jour de la réservation, jamais sous 0. La fonction chat ne l'appelle que si aucun appel facturable
-- au fournisseur n'a abouti (règle de libération du 2026-11-13). Renvoie true si l'unité est rendue.
create function public.release_ai_call(p_reservation_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_day date;
begin
  if v_user is null then
    raise exception 'release_ai_call : Collaborateur non authentifié' using errcode = '42501';
  end if;

  update public.ai_reservations
    set released_at = now()
    where id = p_reservation_id and user_id = v_user and released_at is null
    returning day_utc into v_day;
  if v_day is null then
    return false;
  end if;

  update public.ai_usage_global set count = greatest(count - 1, 0) where day_utc = v_day;
  update public.ai_usage set count = greatest(count - 1, 0) where user_id = v_user and day_utc = v_day;
  return true;
end;
$$;

revoke all on function public.reserve_ai_call() from public, anon, authenticated, service_role;
revoke all on function public.release_ai_call(uuid) from public, anon, authenticated, service_role;
grant execute on function public.reserve_ai_call() to authenticated;
grant execute on function public.release_ai_call(uuid) to authenticated;

-- Conversation et première question, ensemble (AD-17) : une question refusée (identifiant de
-- demande déjà utilisé, 23505) ne laisse aucune Conversation vide. security invoker : RLS et droits
-- de colonnes du Collaborateur. Renvoie { conversation_id, message_id }.
create function public.start_conversation(p_title text, p_question text, p_client_request_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_conversation uuid;
  v_message uuid;
begin
  insert into public.conversations (title) values (p_title) returning id into v_conversation;
  insert into public.messages (conversation_id, role, kind, content, client_request_id)
    values (v_conversation, 'user', 'question', p_question, p_client_request_id)
    returning id into v_message;
  return jsonb_build_object('conversation_id', v_conversation, 'message_id', v_message);
end;
$$;

-- Réponse ou refus de l'Assistant, ses Sources et la date du dernier échange, en une transaction.
-- security invoker : RLS et droits de colonnes du Collaborateur. p_sources : tableau d'objets
-- { document_id, document_title, text_version, passages }, dans l'ordre des Sources (numérotées à
-- partir de 1). Titre et version sont relus dans documents par chat, jamais fournis par le modèle.
-- Un Document supprimé entre la Recherche et cet enregistrement (23503 sur document_id) : la Source
-- est gardée avec document_id nul, titre et version conservés (FR-12). Renvoie
-- { message_id, sources: [{ ordinal, document_id, document_title }] }.
create function public.save_assistant_answer(
  p_conversation_id uuid,
  p_kind public.message_kind,
  p_content text,
  p_sources jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_message uuid;
  v_source jsonb;
  v_ordinal integer := 0;
  v_document uuid;
  v_constraint text;
  v_saved jsonb := '[]'::jsonb;
  v_sources jsonb := coalesce(p_sources, '[]'::jsonb);
begin
  if p_kind not in ('answer', 'refusal_info_absente', 'refusal_hors_cadre') then
    raise exception 'save_assistant_answer : type de message refusé' using errcode = '22023';
  end if;
  if jsonb_typeof(v_sources) <> 'array' then
    raise exception 'save_assistant_answer : Sources mal formées' using errcode = '22023';
  end if;
  -- Une réponse a au moins une Source ; un refus n'en a aucune.
  if (p_kind = 'answer') <> (jsonb_array_length(v_sources) > 0) then
    raise exception 'save_assistant_answer : Sources incohérentes avec le type de message' using errcode = '22023';
  end if;

  insert into public.messages (conversation_id, role, kind, content)
    values (p_conversation_id, 'assistant', p_kind, p_content)
    returning id into v_message;

  for v_source in select value from jsonb_array_elements(v_sources) loop
    v_ordinal := v_ordinal + 1;
    v_document := (v_source ->> 'document_id')::uuid;
    begin
      insert into public.message_sources (message_id, ordinal, document_id, document_title, text_version, passages)
        values (v_message, v_ordinal, v_document, v_source ->> 'document_title', (v_source ->> 'text_version')::integer, v_source -> 'passages');
    exception when foreign_key_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'message_sources_document_id_fkey' then
        raise;
      end if;
      v_document := null;
      insert into public.message_sources (message_id, ordinal, document_id, document_title, text_version, passages)
        values (v_message, v_ordinal, null, v_source ->> 'document_title', (v_source ->> 'text_version')::integer, v_source -> 'passages');
    end;
    v_saved := v_saved || jsonb_build_array(jsonb_build_object(
      'ordinal', v_ordinal, 'document_id', v_document, 'document_title', v_source ->> 'document_title'));
  end loop;

  update public.conversations set last_message_at = greatest(last_message_at, now()) where id = p_conversation_id;

  return jsonb_build_object('message_id', v_message, 'sources', v_saved);
end;
$$;

-- Échec de l'Assistant (AD-17) : sans texte, avec son code AD-19, et date du dernier échange.
create function public.record_assistant_failure(p_conversation_id uuid, p_error_code text)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_message uuid;
begin
  insert into public.messages (conversation_id, role, kind, error_code)
    values (p_conversation_id, 'assistant', 'failure', p_error_code)
    returning id into v_message;
  update public.conversations set last_message_at = greatest(last_message_at, now()) where id = p_conversation_id;
  return v_message;
end;
$$;

revoke all on function public.start_conversation(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.save_assistant_answer(uuid, public.message_kind, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.record_assistant_failure(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.start_conversation(text, text, uuid) to authenticated;
grant execute on function public.save_assistant_answer(uuid, public.message_kind, text, jsonb) to authenticated;
grant execute on function public.record_assistant_failure(uuid, text) to authenticated;
