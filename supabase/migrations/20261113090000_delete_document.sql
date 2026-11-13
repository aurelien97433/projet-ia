-- Story 3.4 : suppression d'un Document par son Auteur (FR-12, FR-13, AD-2, AD-7).
-- Ordre imposé : le Document d'abord (ses Passages suivent en cascade), puis son objet Storage, que
-- l'Auteur ne peut retirer qu'une fois plus aucun Document ne le référence.

-- Document : privilège de table (aucune colonne en jeu), puis politique réservée à l'Auteur. Rien
-- pour anon (privilèges retirés en 2.2). Les clés étrangères en cascade ou en set null s'appliquent
-- sans passer par la RLS, ce qui est voulu.
grant delete on table public.documents to authenticated;

create policy "L'Auteur supprime ses Documents"
  on public.documents
  for delete
  to authenticated
  using (author_id = (select auth.uid()));

-- Vrai si l'objet est dans le dossier d'uploads du Collaborateur ET qu'aucun Document ne le
-- référence. security definer : la réponse ne dépend pas de la politique de lecture de documents
-- (aujourd'hui ouverte à tous les Collaborateurs). La fonction est aussi appelable directement par
-- l'API (RPC) : le contrôle du dossier est donc fait ici même, pour qu'elle ne réponde jamais sur le
-- chemin d'un autre Compte (faux), ni sur un chemin nul (faux).
create function public.is_unreferenced_upload(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_own_upload_path(p_name), false)
    and not exists (select 1 from public.documents where storage_path = p_name);
$$;

revoke all on function public.is_unreferenced_upload(text) from public, anon, authenticated, service_role;
-- Appelée par la politique ci-dessous, évaluée avec le rôle du Collaborateur.
grant execute on function public.is_unreferenced_upload(text) to authenticated;

-- Objet : son propre dossier d'uploads seulement, et seulement s'il n'appartient plus à aucun
-- Document. L'API Storage exige aussi la lecture (politique existante, même dossier).
create policy "documents : suppression d'un fichier de son dossier sans Document"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and public.is_own_upload_path(name)
    and public.is_unreferenced_upload(name)
  );
