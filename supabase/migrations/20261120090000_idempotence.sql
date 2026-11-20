-- Story 5.9 : idempotence des questions (AD-16, AD-17). Rejeu complet du client_request_id : une
-- question déjà réglée est renvoyée sans appel ni quota ; une question en échec, ou sans résultat depuis
-- plus de 90 s, est réessayée sur place (question réutilisée, échec remplacé) ; un réessai à la fois.
--
-- Aucune fonction security definer : toutes sont security invoker (RLS et droits de colonnes du
-- Collaborateur), search_path vide, EXECUTE à authenticated seul. Signatures modifiées : SUPPRIMÉES puis
-- recréées, jamais surchargées (leçon de la 5.6) ; le nouveau paramètre a la valeur par défaut null, donc
-- la fonction chat encore en production entre la migration et son déploiement garde le comportement
-- de la 5.8. Aucune écriture sur les anciennes lignes hors du remplacement d'un échec par son
-- propriétaire (politique « Le propriétaire remplace un échec de l'Assistant », 20261113120000).

-- Date d'un échec remplacé (Q1 et Q2 = A) : à chaque modification d'une ligne d'échec (réclamation par
-- begin_retry, ou remplacement par le résultat du réessai), created_at prend l'heure du moment. Elle
-- sert d'horodatage à la réclamation (« en cours depuis moins de 90 s ») et place le résultat après sa
-- question. authenticated ne reçoit aucun droit sur created_at : la colonne n'est fixée que par ce
-- déclencheur, jamais par un appel (une modification explicite de la date, réservée à l'administrateur,
-- est respectée). Fonction de déclencheur : aucun EXECUTE accordé (non appelable).
create function public.stamp_replaced_failure()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.stamp_replaced_failure() from public, anon, authenticated, service_role;

create trigger messages_stamp_replaced_failure
  before update on public.messages
  for each row
  when (old.kind = 'failure' and new.created_at is not distinct from old.created_at)
  execute function public.stamp_replaced_failure();

-- Classement d'une demande (AD-16, Q2 = A), appelé par chat avant toute réservation. Verrou
-- consultatif TRANSACTIONNEL sur (Compte, client_request_id) : libéré à la fin de l'appel (une
-- transaction par appel de l'API), il sérialise deux classements du même identifiant du même Compte ;
-- la clé comprend auth.uid(), donc un autre Compte ne bloque jamais celui-ci. Toutes les lectures et
-- écritures passent par la RLS (owner_id = auth.uid() en plus, explicitement).
--
-- Rattachement d'un message de l'Assistant à la question (mêmes règles que conversation-thread.ts et
-- conversation_list) : même client_request_id ; sinon (messages d'avant la 5.6), message postérieur à
-- la question et antérieur à la question suivante.
--
-- Issues (jsonb, champ outcome) :
--   new         aucune question de ce Compte avec cet identifiant : nouvelle question (chemin de la 5.8) ;
--   mismatch    question existante mais texte (ou Conversation fournie) différent : VALIDATION_FAILED ;
--   replay      réponse ou refus enregistré (l'emporte sur un échec) : renvoyé tel quel, avec ses
--               Sources dans l'ordre ;
--   in_progress réessai réclamé depuis moins de 90 s, ou question sans message de l'Assistant depuis
--               moins de 90 s : 409 avec la Conversation ;
--   retry       dernier résultat en échec, ou question sans résultat depuis plus de 90 s : l'échec
--               rattaché par le même client_request_id est RÉCLAMÉ (error_code REQUEST_IN_PROGRESS,
--               date du moment) ; à défaut (aucun échec, ou échec d'avant la 5.6 sans identifiant),
--               une ligne d'échec REQUEST_IN_PROGRESS est insérée. Renvoie la question, sa question
--               autonome, sa date, la ligne à remplacer et le code de l'échec précédent (rétabli si le
--               quota refuse le réessai).
-- Une réclamation n'est jamais bloquée au-delà de 90 s : passé ce délai, une ligne REQUEST_IN_PROGRESS
-- est traitée comme un échec, donc réessayable.
create function public.begin_retry(p_client_request_id uuid, p_question text, p_conversation_id uuid default null)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_question public.messages%rowtype;
  v_settled public.messages%rowtype;
  v_failure public.messages%rowtype;
  v_claimed public.messages%rowtype;
  v_previous text;
  v_sources jsonb;
begin
  if v_owner is null or p_client_request_id is null then
    raise exception 'begin_retry : session ou identifiant absent' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || '/' || p_client_request_id::text, 5009));

  select * into v_question from public.messages
    where owner_id = v_owner and role = 'user' and client_request_id = p_client_request_id;
  if not found then
    return jsonb_build_object('outcome', 'new');
  end if;

  if v_question.content is distinct from p_question
    or (p_conversation_id is not null and p_conversation_id <> v_question.conversation_id) then
    return jsonb_build_object('outcome', 'mismatch');
  end if;

  -- Messages de l'Assistant rattachés à la question : réponse ou refus d'abord (le plus récent).
  select a.* into v_settled from public.messages a
    where a.owner_id = v_owner and a.conversation_id = v_question.conversation_id and a.role = 'assistant'
      and a.kind <> 'failure'
      and (a.client_request_id = v_question.client_request_id or (
        not exists (
          select 1 from public.messages o
          where o.conversation_id = v_question.conversation_id and o.role = 'user' and o.client_request_id = a.client_request_id
        )
        and a.created_at > v_question.created_at
        and not exists (
          select 1 from public.messages n
          where n.conversation_id = v_question.conversation_id and n.role = 'user'
            and n.created_at > v_question.created_at and n.created_at < a.created_at
        )
      ))
    order by a.created_at desc
    limit 1;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object(
        'document_id', s.document_id,
        'document_title', s.document_title,
        'text_version', s.text_version,
        'passages', s.passages
      ) order by s.ordinal), '[]'::jsonb)
      into v_sources
      from public.message_sources s
      where s.message_id = v_settled.id and s.owner_id = v_owner;
    return jsonb_build_object(
      'outcome', 'replay',
      'conversation_id', v_question.conversation_id,
      'kind', v_settled.kind,
      'content', v_settled.content,
      'sources', v_sources
    );
  end if;

  -- Réessai déjà réclamé depuis moins de 90 s, QUELLE QUE SOIT sa place parmi les échecs (revue de la
  -- 5.9 : un échec tardif du chat d'origine, inséré sans p_replace_message_id après la réclamation, ne
  -- doit jamais la masquer) : en cours. Les lignes REQUEST_IN_PROGRESS portent toujours l'identifiant.
  if exists (
    select 1 from public.messages r
    where r.owner_id = v_owner and r.conversation_id = v_question.conversation_id and r.role = 'assistant'
      and r.kind = 'failure' and r.client_request_id = v_question.client_request_id
      and r.error_code = 'REQUEST_IN_PROGRESS' and r.created_at > clock_timestamp() - interval '90 seconds'
  ) then
    return jsonb_build_object('outcome', 'in_progress', 'conversation_id', v_question.conversation_id);
  end if;

  -- Dernier échec rattaché (tout rattachement), pour le code précédent.
  select a.* into v_failure from public.messages a
    where a.owner_id = v_owner and a.conversation_id = v_question.conversation_id and a.role = 'assistant'
      and a.kind = 'failure'
      and (a.client_request_id = v_question.client_request_id or (
        not exists (
          select 1 from public.messages o
          where o.conversation_id = v_question.conversation_id and o.role = 'user' and o.client_request_id = a.client_request_id
        )
        and a.created_at > v_question.created_at
        and not exists (
          select 1 from public.messages n
          where n.conversation_id = v_question.conversation_id and n.role = 'user'
            and n.created_at > v_question.created_at and n.created_at < a.created_at
        )
      ))
    order by a.created_at desc
    limit 1;

  if found then
    v_previous := case when v_failure.error_code = 'REQUEST_IN_PROGRESS' then 'AI_TIMEOUT' else v_failure.error_code end;
  else
    if v_question.created_at > clock_timestamp() - interval '90 seconds' then
      return jsonb_build_object('outcome', 'in_progress', 'conversation_id', v_question.conversation_id);
    end if;
    v_previous := 'AI_TIMEOUT';
  end if;

  -- Réclamation : seul un échec rattaché par le même identifiant est remplacé sur place (date mise à
  -- jour par le déclencheur) ; sinon une ligne d'échec REQUEST_IN_PROGRESS est ajoutée.
  if v_failure.id is not null and v_failure.client_request_id = v_question.client_request_id then
    update public.messages set error_code = 'REQUEST_IN_PROGRESS'
      where id = v_failure.id and owner_id = v_owner and role = 'assistant' and kind = 'failure'
      returning * into v_claimed;
  end if;
  if v_claimed.id is null then
    insert into public.messages (conversation_id, role, kind, error_code, client_request_id)
      values (v_question.conversation_id, 'assistant', 'failure', 'REQUEST_IN_PROGRESS', v_question.client_request_id)
      returning * into v_claimed;
  end if;

  return jsonb_build_object(
    'outcome', 'retry',
    'conversation_id', v_question.conversation_id,
    'question', v_question.content,
    'standalone_question', v_question.standalone_question,
    'question_created_at', v_question.created_at,
    'replace_message_id', v_claimed.id,
    'previous_error_code', v_previous
  );
end;
$$;

revoke all on function public.begin_retry(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.begin_retry(uuid, text, uuid) to authenticated;

-- Remplacement de l'échec (Q1 = A) : avec p_replace_message_id, la ligne d'échec de ce Compte, de cette
-- Conversation et de cette question (même client_request_id) est mise à jour (type, contenu, code ;
-- date par le déclencheur) au lieu d'une insertion, et les Sources sont ajoutées à la ligne remplacée.
-- Ligne absente, d'un autre Compte (RLS), d'une autre question ou déjà remplacée par une réponse :
-- erreur P0002, rien n'est écrit. Sans le paramètre : comportement de la 5.6 (insertion).
drop function public.save_assistant_answer(uuid, public.message_kind, text, jsonb, uuid);
drop function public.record_assistant_failure(uuid, text, uuid);

create function public.save_assistant_answer(
  p_conversation_id uuid,
  p_kind public.message_kind,
  p_content text,
  p_sources jsonb,
  p_client_request_id uuid default null,
  p_replace_message_id uuid default null
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

  if p_replace_message_id is null then
    insert into public.messages (conversation_id, role, kind, content, client_request_id)
      values (p_conversation_id, 'assistant', p_kind, p_content, p_client_request_id)
      returning id into v_message;
  else
    update public.messages set kind = p_kind, content = p_content, error_code = null
      where id = p_replace_message_id and conversation_id = p_conversation_id
        and owner_id = (select auth.uid()) and role = 'assistant' and kind = 'failure'
        and client_request_id is not distinct from p_client_request_id
      returning id into v_message;
    if v_message is null then
      raise exception 'save_assistant_answer : échec à remplacer introuvable' using errcode = 'P0002';
    end if;
  end if;

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

create function public.record_assistant_failure(
  p_conversation_id uuid,
  p_error_code text,
  p_client_request_id uuid default null,
  p_replace_message_id uuid default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_message uuid;
begin
  if p_replace_message_id is null then
    insert into public.messages (conversation_id, role, kind, error_code, client_request_id)
      values (p_conversation_id, 'assistant', 'failure', p_error_code, p_client_request_id)
      returning id into v_message;
  else
    update public.messages set error_code = p_error_code, content = null
      where id = p_replace_message_id and conversation_id = p_conversation_id
        and owner_id = (select auth.uid()) and role = 'assistant' and kind = 'failure'
        and client_request_id is not distinct from p_client_request_id
      returning id into v_message;
    if v_message is null then
      raise exception 'record_assistant_failure : échec à remplacer introuvable' using errcode = 'P0002';
    end if;
  end if;
  update public.conversations set last_message_at = greatest(last_message_at, now()) where id = p_conversation_id;
  return v_message;
end;
$$;

revoke all on function public.save_assistant_answer(uuid, public.message_kind, text, jsonb, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_assistant_failure(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_assistant_answer(uuid, public.message_kind, text, jsonb, uuid, uuid) to authenticated;
grant execute on function public.record_assistant_failure(uuid, text, uuid, uuid) to authenticated;

-- Listes de Conversations : la ligne d'échec REQUEST_IN_PROGRESS d'un réessai en cours compte comme
-- « en cours » pendant 90 s, puis comme un échec (même règle que conversation-thread.ts). unanswered :
-- le dernier échange n'a ni réponse ni refus, aucune réclamation REQUEST_IN_PROGRESS de moins de 90 s
-- (quelle que soit sa place parmi ses échecs), et il a un échec ou sa question attend depuis plus de 90 s. Colonnes inchangées ;
-- security_invoker = true (exigence S1 de la 5.6), SELECT à authenticated seul.
drop view public.conversation_list;

create view public.conversation_list
with (security_invoker = true)
as
select
  c.id,
  c.title,
  c.last_message_at,
  coalesce(
    (
      select
        not exists (
          select 1 from public.messages a
          where a.conversation_id = c.id and a.role = 'assistant' and a.kind <> 'failure'
            and (a.client_request_id = q.client_request_id or (a.created_at > q.created_at and not exists (
              select 1 from public.messages o
              where o.conversation_id = c.id and o.role = 'user' and o.client_request_id = a.client_request_id
            )))
        )
        -- Réessai réclamé depuis moins de 90 s, quelle que soit sa place parmi les échecs : en cours.
        and not exists (
          select 1 from public.messages r
          where r.conversation_id = c.id and r.role = 'assistant' and r.kind = 'failure'
            and r.client_request_id = q.client_request_id
            and r.error_code = 'REQUEST_IN_PROGRESS' and r.created_at >= now() - interval '90 seconds'
        )
        and (
          exists (
            select 1 from public.messages f
            where f.conversation_id = c.id and f.role = 'assistant' and f.kind = 'failure'
              and (f.client_request_id = q.client_request_id or (f.created_at > q.created_at and not exists (
                select 1 from public.messages o
                where o.conversation_id = c.id and o.role = 'user' and o.client_request_id = f.client_request_id
              )))
          )
          or q.created_at < now() - interval '90 seconds'
        )
      from public.messages q
      where q.conversation_id = c.id and q.role = 'user'
      order by q.created_at desc
      limit 1
    ),
    false
  ) as unanswered
from public.conversations c;

revoke all on table public.conversation_list from public, anon, authenticated;
grant select on table public.conversation_list to authenticated;
