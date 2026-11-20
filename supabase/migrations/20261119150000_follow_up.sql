-- Story 5.8 : questions de suivi (FR-19, AD-12). La question autonome produite par la reformulation est
-- enregistrée avec la question, à son insertion (Q1 = A) : authenticated n'a pas le droit de modifier
-- messages.standalone_question, et la question reste enregistrée avant la recherche (AD-17). Contrainte
-- existante messages_standalone_question : 1 à 2 000 caractères, question seulement. Aucune écriture
-- sur les anciennes lignes.
--
-- L'ancienne signature est SUPPRIMÉE, pas surchargée (leçon de la 5.6) : une seconde fonction avec un
-- paramètre de plus à valeur par défaut rendrait ambigus (« function is not unique ») les appels sans
-- ce paramètre, ceux de la fonction chat encore en production entre la migration et son déploiement.
-- Avec p_standalone_question par défaut à null, ces appels restent valides et enregistrent comme en 5.7.
-- Corps inchangé par ailleurs (20261118090000_conversations_history.sql) ; security invoker (RLS et
-- droits de colonnes du Collaborateur), search_path vide, EXECUTE à authenticated seul.
drop function public.add_question(uuid, text, uuid);

create function public.add_question(
  p_conversation_id uuid,
  p_question text,
  p_client_request_id uuid,
  p_standalone_question text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_message uuid;
begin
  insert into public.messages (conversation_id, role, kind, content, standalone_question, client_request_id)
    values (p_conversation_id, 'user', 'question', p_question, p_standalone_question, p_client_request_id)
    returning id into v_message;
  update public.conversations set last_message_at = greatest(last_message_at, now()) where id = p_conversation_id;
  return jsonb_build_object('conversation_id', p_conversation_id, 'message_id', v_message);
end;
$$;

revoke all on function public.add_question(uuid, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.add_question(uuid, text, uuid, text) to authenticated;
