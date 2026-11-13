-- Story 5.1 : Conversations, messages et Sources, strictement privés (FR-12, FR-20, FR-22, NFR-1,
-- NFR-8, AD-2, AD-16, AD-17). Écrits par la fonction chat avec le jeton du Collaborateur (stories 5.2a
-- et suivantes) ; lus par Next.js avec ce même jeton. Aucun accès pour anon.

create type public.message_role as enum ('user', 'assistant');
create type public.message_kind as enum ('question', 'answer', 'refusal_info_absente', 'refusal_hors_cadre', 'failure');

-- Passages d'une Source (décision Q1 = A du 2026-11-13) : 1 à 20 objets ayant exactement les clés
-- passage_id (UUID), start et end (entiers, 0 <= start < end). Aucun extrait de texte ne peut y entrer.
-- Appelée par la contrainte de message_sources, évaluée avec le rôle de l'appelant.
create function public.is_valid_source_passages(p_passages jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  element jsonb;
begin
  if jsonb_typeof(p_passages) is distinct from 'array' or jsonb_array_length(p_passages) not between 1 and 20 then
    return false;
  end if;
  for element in select value from jsonb_array_elements(p_passages) loop
    if jsonb_typeof(element) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(element) as key) is distinct from array['end', 'passage_id', 'start']
      or jsonb_typeof(element -> 'passage_id') <> 'string'
      or (element ->> 'passage_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(element -> 'start') <> 'number'
      or jsonb_typeof(element -> 'end') <> 'number'
      or (element ->> 'start') !~ '^[0-9]{1,9}$'
      or (element ->> 'end') !~ '^[0-9]{1,9}$' then
      return false;
    end if;
    if (element ->> 'start')::integer >= (element ->> 'end')::integer then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.is_valid_source_passages(jsonb) from public, anon;
grant execute on function public.is_valid_source_passages(jsonb) to authenticated, service_role;

-- Une Conversation, créée à la première question acceptée (AD-17), titrée d'après cette question.
-- Tailles mesurées sur le texte brut ; texte non vide = au moins un caractère autre qu'un blanc
-- (espaces, tabulations, retours à la ligne).
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_title_length check (char_length(title) between 1 and 120 and title ~ '[^[:space:]]'),
  -- La date du dernier échange peut avancer, jamais précéder la création.
  constraint conversations_last_message_after_creation check (last_message_at >= created_at),
  -- Cible des clés étrangères composites : un message ne référence qu'une Conversation de son propriétaire.
  constraint conversations_id_owner_unique unique (id, owner_id)
);

create index conversations_owner_last_message_idx on public.conversations (owner_id, last_message_at desc);

-- Un message : question du Collaborateur, ou réponse, refus ou échec de l'Assistant.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  role public.message_role not null,
  kind public.message_kind not null,
  content text,
  standalone_question text,
  error_code text,
  client_request_id uuid,
  -- clock_timestamp() et non now() : une question et sa réponse écrites dans la même transaction
  -- (chat, 5.2a) restent ordonnées.
  created_at timestamptz not null default clock_timestamp(),
  -- Cohérence du propriétaire : (conversation_id, owner_id) doit exister tel quel dans conversations,
  -- quel que soit le chemin d'écriture (jeton, security definer, service_role).
  constraint messages_conversation_owner_fk foreign key (conversation_id, owner_id)
    references public.conversations (id, owner_id) on delete cascade,
  -- Cible de la clé composite des Sources : propriétaire et type du message.
  constraint messages_id_owner_kind_unique unique (id, owner_id, kind),
  constraint messages_role_kind check ((role = 'user') = (kind = 'question')),
  -- Question : texte de 1 à 2 000 caractères (NFR-8), identifiant de demande obligatoire (AD-16).
  constraint messages_question check (
    kind <> 'question'
    or (content is not null and char_length(content) between 1 and 2000 and content ~ '[^[:space:]]' and client_request_id is not null)
  ),
  -- Réponse ou refus : texte de 1 à 20 000 caractères.
  constraint messages_answer check (
    kind not in ('answer', 'refusal_info_absente', 'refusal_hors_cadre')
    or (content is not null and char_length(content) between 1 and 20000 and content ~ '[^[:space:]]')
  ),
  -- Échec : sans texte, avec un code AD-19 (AD-17).
  constraint messages_failure check (
    (kind = 'failure') = (error_code is not null)
    and (kind <> 'failure' or content is null)
  ),
  constraint messages_error_code_format check (error_code is null or (char_length(error_code) <= 64 and error_code ~ '^[A-Z_]+$')),
  constraint messages_standalone_question check (
    standalone_question is null
    or (kind = 'question' and char_length(standalone_question) between 1 and 2000 and standalone_question ~ '[^[:space:]]')
  )
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

-- Idempotence (AD-16) : une seule question par (Collaborateur, identifiant de demande). La réponse
-- peut reprendre l'identifiant de sa question ; deux Collaborateurs peuvent avoir le même.
create unique index messages_owner_request_question_key on public.messages (owner_id, client_request_id)
  where role = 'user';

-- Une Source d'une réponse : un Document, ses Passages cités (identifiants et positions seulement,
-- aucun extrait : décision du 2026-11-13), et une copie du titre qui survit à la suppression du Document.
create table public.message_sources (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Toujours 'answer' : avec la clé composite, une Source ne se rattache qu'à une réponse (ni question,
  -- ni refus, ni échec). Non accordée en écriture.
  message_kind public.message_kind not null default 'answer',
  ordinal integer not null,
  -- FR-12 : la suppression du Document met cette colonne à null, sans passer par la RLS (voulu).
  document_id uuid references public.documents (id) on delete set null,
  document_title text not null,
  text_version integer not null,
  passages jsonb not null,
  constraint message_sources_message_owner_fk foreign key (message_id, owner_id, message_kind)
    references public.messages (id, owner_id, kind) on delete cascade,
  constraint message_sources_answer_only check (message_kind = 'answer'),
  -- Une Source par Document cité, numérotées de 1 à 20 au plus.
  constraint message_sources_ordinal check (ordinal between 1 and 20),
  constraint message_sources_title_length check (char_length(document_title) between 1 and 200 and document_title ~ '[^[:space:]]'),
  constraint message_sources_text_version check (text_version >= 1),
  constraint message_sources_passages check (public.is_valid_source_passages(passages))
);

create unique index message_sources_message_ordinal_key on public.message_sources (message_id, ordinal);
create index message_sources_document_idx on public.message_sources (document_id);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_sources enable row level security;

-- Supabase accorde par défaut tous les droits sur une nouvelle table : retrait complet, puis
-- privilèges colonne par colonne. Ni id, ni owner_id (valeur par défaut auth.uid(), contrôlée par
-- les politiques), ni les horodatages ne sont fixés par un appel.
revoke all on table public.conversations, public.messages, public.message_sources from anon, authenticated;

grant select on table public.conversations, public.messages, public.message_sources to authenticated;
grant insert (title) on table public.conversations to authenticated;
grant insert (conversation_id, role, kind, content, standalone_question, error_code, client_request_id)
  on table public.messages to authenticated;
grant insert (message_id, ordinal, document_id, document_title, text_version, passages)
  on table public.message_sources to authenticated;
-- Seules modifications : date du dernier échange d'une Conversation ; remplacement d'un échec de
-- l'Assistant lors d'un « Réessayer » (AD-16, AD-17). owner_id, conversation_id, role et
-- client_request_id ne sont jamais modifiables. Aucune suppression (FR-21, P1 : cascades déjà posées).
grant update (last_message_at) on table public.conversations to authenticated;
grant update (kind, content, error_code) on table public.messages to authenticated;

create policy "Le propriétaire lit ses Conversations"
  on public.conversations for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Le propriétaire crée ses Conversations"
  on public.conversations for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Le propriétaire met à jour la date de ses Conversations"
  on public.conversations for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Le propriétaire lit ses messages"
  on public.messages for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Le propriétaire crée ses messages"
  on public.messages for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- Seul un échec de l'Assistant peut être remplacé ; le résultat reste un message de l'Assistant.
create policy "Le propriétaire remplace un échec de l'Assistant"
  on public.messages for update to authenticated
  using (owner_id = (select auth.uid()) and role = 'assistant' and kind = 'failure')
  with check (owner_id = (select auth.uid()) and role = 'assistant');

create policy "Le propriétaire lit ses Sources"
  on public.message_sources for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Le propriétaire crée ses Sources"
  on public.message_sources for insert to authenticated
  with check (owner_id = (select auth.uid()));
