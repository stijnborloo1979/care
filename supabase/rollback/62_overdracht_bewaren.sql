-- Terugdraaien van 62_overdracht_bewaren.sql: overdrachten blijven weer
-- voor altijd bewaard. Wat al gewist is, komt niet terug.

do $$
begin
  perform cron.unschedule('overdracht-opruimen');
exception when others then
  null;
end
$$;

drop function if exists public.overdracht_opruimen();
drop function if exists public.zet_overdracht_termijn(uuid, integer);
drop function if exists public.overdracht_termijn_gevolg(uuid, integer);
drop function if exists public.overdracht_termijn(uuid);
alter table public.organisation drop constraint if exists organisation_overdracht_bewaar_check;
alter table public.organisation drop column if exists overdracht_bewaar_dagen;
