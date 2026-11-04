-- Story 1.3 : profils des Collaborateurs et règles d'accès de base (AD-2, FR-1, FR-2, NFR-1).

-- Le rôle anon (Visiteur) n'a aucun privilège sur le schéma public, ni sur les objets futurs.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
-- PostgreSQL accorde EXECUTE à PUBLIC (dont anon hérite) sur toute nouvelle fonction. Ce défaut
-- est global : il ne se retire pas schéma par schéma. Chaque fonction appelable par un
-- Collaborateur devra donc recevoir un GRANT EXECUTE ... TO authenticated explicite.
alter default privileges for role postgres revoke execute on functions from public;

-- Un profil par Compte, créé à l'inscription. Le nom (display_name) est lisible par tout
-- Collaborateur (Auteur affiché dans la Bibliothèque) ; l'e-mail ne l'est pas. Jamais modifiable
-- depuis l'application. Seule l'inscription par e-mail est activée (pas de téléphone ni d'anonyme).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
-- Lecture limitée aux colonnes utiles : un Collaborateur ne lit pas l'e-mail des autres.
grant select (id, display_name, created_at) on table public.profiles to authenticated;

create policy "Les Collaborateurs lisent les profils"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Déclencheur sur auth.users : security definer pour écrire dans public.profiles, qu'aucun
-- rôle applicatif ne peut modifier ; search_path vide pour n'utiliser que des noms qualifiés.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), split_part(coalesce(new.email, ''), '@', 1));
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Comptes créés avant cette migration (projet distant) : profil créé une fois.
insert into public.profiles (id, email, display_name)
select id, coalesce(email, ''), split_part(coalesce(email, ''), '@', 1)
from auth.users
on conflict (id) do nothing;
