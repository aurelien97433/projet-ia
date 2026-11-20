-- Story 5.10 (correction de la spec du 2026-11-20, décision de l'utilisateur, option A) : la page de
-- l'Assistant lit au chargement, avec le jeton du Collaborateur (jamais service_role), la limite
-- quotidienne ai_daily_quota pour afficher d'emblée le bloc de limite atteinte. La migration
-- 20261116090000_chat.sql retirait tout droit sur ai_limits ; seul ce qui suit est rouvert :
--   - SELECT des colonnes key et value seulement (droits de colonnes), pour authenticated seul ;
--   - une politique RLS de lecture limitée à la ligne ai_daily_quota (ai_global_daily_cap reste
--     invisible) ;
--   - rien pour anon ni public ; aucun droit d'écriture (ni INSERT, ni UPDATE, ni DELETE).
-- Les limites restent lues par reserve_ai_call (security definer) et modifiées par SQL seulement.

grant select (key, value) on table public.ai_limits to authenticated;

create policy "Le Collaborateur lit la limite quotidienne d'IA"
  on public.ai_limits for select to authenticated
  using (key = 'ai_daily_quota');
