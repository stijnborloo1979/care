-- Terugdraaien van 104_spraak_basis.sql.
drop function if exists public.spraak_log_opschonen();
drop function if exists public.spraak_vraag_registreren(uuid, text);
drop table if exists public.spraak_log;
alter table public.org_membership drop column if exists spraak_aan;
alter table public.organisation drop column if exists spraak_lezen;
