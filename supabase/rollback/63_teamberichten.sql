-- Terugdraaien van 63_teamberichten.sql. LET OP: de teamberichten gaan weg.

do $$
begin
  perform cron.unschedule('teamberichten-opruimen');
exception when others then
  null;
end
$$;

drop function if exists public.teambericht_opruimen();
drop function if exists public.zet_teambericht_termijn(uuid, integer);
drop function if exists public.teambericht_termijn_gevolg(uuid, integer);
drop function if exists public.teambericht_termijn(uuid);
alter table public.organisation drop constraint if exists organisation_teambericht_bewaar_check;
alter table public.organisation drop column if exists teambericht_bewaar_dagen;
drop table if exists public.team_message;
drop function if exists public.team_message_tijd();
