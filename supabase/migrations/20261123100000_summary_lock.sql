-- Story 6.1, correctif de revue R1 (décision de l'utilisateur, R1 = A) : un verrou de demande par
-- Document. Sans lui, N demandes simultanées sur un Document sans Résumé coûtaient N appels facturés
-- pour une seule unité décomptée (les perdants rendaient la leur). summarize prend le verrou avec le
-- jeton du Collaborateur, après « Résumé à jour ? » et avant reserve_ai_call ; refusé → 409
-- REQUEST_IN_PROGRESS, sans réservation ni appel. Le verrou est libéré en fin de traitement
-- (end_summary) ; s'il ne l'est pas (panne), il expire après 130 s (délai de la page).

create table public.summary_requests (
  document_id uuid primary key references public.documents (id) on delete cascade,
  user_id uuid not null,
  started_at timestamptz not null
);

-- Aucun accès direct : seules les fonctions ci-dessous lisent et écrivent la table.
alter table public.summary_requests enable row level security;
revoke all on table public.summary_requests from public, anon, authenticated;

-- Prend le verrou du Document pour le Collaborateur connecté : vrai s'il était libre ou expiré (plus
-- de 130 s), faux sinon. Une seule instruction, atomique.
create function public.begin_summary(p_document_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_taken uuid;
begin
  if v_user is null then
    raise exception 'begin_summary : Collaborateur non authentifié' using errcode = '42501';
  end if;
  insert into public.summary_requests (document_id, user_id, started_at)
    values (p_document_id, v_user, clock_timestamp())
    on conflict (document_id) do update
      set user_id = v_user, started_at = clock_timestamp()
      where public.summary_requests.started_at < clock_timestamp() - interval '130 seconds'
    returning document_id into v_taken;
  return v_taken is not null;
end;
$$;

-- Libère le verrou du Document, seulement s'il appartient au Collaborateur connecté.
create function public.end_summary(p_document_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.summary_requests where document_id = p_document_id and user_id = auth.uid();
end;
$$;

revoke all on function public.begin_summary(uuid) from public, anon, authenticated, service_role;
revoke all on function public.end_summary(uuid) from public, anon, authenticated, service_role;
grant execute on function public.begin_summary(uuid) to authenticated;
grant execute on function public.end_summary(uuid) to authenticated;
