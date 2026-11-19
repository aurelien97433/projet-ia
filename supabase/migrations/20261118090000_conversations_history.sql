-- Story 5.6 : poursuivre une Conversation (FR-20) et lire l'Historique (FR-20, FR-22, AD-17).
--
-- add_question : question suivante ajoutée à une Conversation existante, appelée par chat à la place
-- de start_conversation quand la demande porte un conversationId (après la vérification de son
-- existence par lecture RLS, avant toute réservation). security invoker (exigence S2 de la spec) : RLS
-- et droits de colonnes du Collaborateur. La question d'un autre Compte est refusée par la clé
-- étrangère composite messages (conversation_id, owner_id) → conversations (id, owner_id) (23503) :
-- owner_id prend la valeur auth.uid() par défaut. La date du dernier échange avance (tri de
-- l'Historique). Renvoie { conversation_id, message_id }.
create function public.add_question(p_conversation_id uuid, p_question text, p_client_request_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_message uuid;
begin
  insert into public.messages (conversation_id, role, kind, content, client_request_id)
    values (p_conversation_id, 'user', 'question', p_question, p_client_request_id)
    returning id into v_message;
  update public.conversations set last_message_at = greatest(last_message_at, now()) where id = p_conversation_id;
  return jsonb_build_object('conversation_id', p_conversation_id, 'message_id', v_message);
end;
$$;

revoke all on function public.add_question(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.add_question(uuid, text, uuid) to authenticated;

-- Réponse, refus ou échec rattaché à sa question (revue de la story 5.6, constat 1) : deux questions
-- d'une même Conversation peuvent être traitées en même temps (navigateur qui abandonne à 20 s pendant
-- que chat continue jusqu'à 85 s, ou deux onglets), et leurs issues arriver dans le désordre. chat
-- transmet désormais le client_request_id de la question, enregistré sur le message de l'Assistant
-- (l'index d'unicité messages_owner_request_question_key ne porte que sur les questions).
--
-- Les anciennes signatures sont SUPPRIMÉES, pas surchargées : une seconde fonction avec un paramètre
-- de plus à valeur par défaut rendrait ambigus (« function is not unique ») les appels sans ce
-- paramètre, ceux de la fonction chat encore en production entre la migration et son déploiement.
-- Avec p_client_request_id par défaut à null, ces appels restent valides et enregistrent comme avant.
-- Corps inchangés par ailleurs (20261116090000_chat.sql).
drop function public.save_assistant_answer(uuid, public.message_kind, text, jsonb);
drop function public.record_assistant_failure(uuid, text);

create function public.save_assistant_answer(
  p_conversation_id uuid,
  p_kind public.message_kind,
  p_content text,
  p_sources jsonb,
  p_client_request_id uuid default null
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

  insert into public.messages (conversation_id, role, kind, content, client_request_id)
    values (p_conversation_id, 'assistant', p_kind, p_content, p_client_request_id)
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

create function public.record_assistant_failure(p_conversation_id uuid, p_error_code text, p_client_request_id uuid default null)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_message uuid;
begin
  insert into public.messages (conversation_id, role, kind, error_code, client_request_id)
    values (p_conversation_id, 'assistant', 'failure', p_error_code, p_client_request_id)
    returning id into v_message;
  update public.conversations set last_message_at = greatest(last_message_at, now()) where id = p_conversation_id;
  return v_message;
end;
$$;

revoke all on function public.save_assistant_answer(uuid, public.message_kind, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_assistant_failure(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_assistant_answer(uuid, public.message_kind, text, jsonb, uuid) to authenticated;
grant execute on function public.record_assistant_failure(uuid, text, uuid) to authenticated;

-- Listes de Conversations (Historique, 5 dernières de l'Assistant et du Tableau de bord). Vue
-- security_invoker = true (exigence S1) : elle hérite de la RLS de conversations et de messages, sans
-- quoi elle s'exécuterait avec les droits de son propriétaire.
--
-- unanswered (report de la 5.2b, décision Q2 = A) : le dernier échange (dernière question et messages
-- de l'Assistant qui s'y rattachent) n'a ni réponse ni refus enregistré, et il a un échec, ou la
-- question attend depuis plus de 90 s (AD-16). Mêmes règles que l'affichage d'un échange
-- (src/lib/conversation-thread.ts) : une réponse ou un refus l'emporte sur un échec. Rattachement :
-- même client_request_id que la question ; sinon (messages d'avant la 5.6, identifiant d'aucune
-- question de la Conversation), message postérieur à la dernière question.
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
