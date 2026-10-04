-- Terugdraaien van 79_nieuws_wzc.sql
-- Weigert zodra er nieuws is: de families lezen het misschien nog.
do $$
begin
  if to_regclass('public.org_nieuws') is not null and exists (select 1 from public.org_nieuws) then
    raise exception 'Er staat nieuws in org_nieuws. Bewaar of wis het eerst bewust.';
  end if;
end
$$;
do $$ begin perform cron.unschedule('nieuws-opruimen'); exception when others then null; end $$;
drop function if exists public.nieuws_voor(uuid);
drop function if exists public.nieuws_opruimen();
drop table if exists public.org_nieuws;
drop function if exists public.org_nieuws_check();
drop function if exists public.mag_nieuws_lezen(uuid, uuid);
drop function if exists public.mag_nieuws_schrijven(uuid, uuid);
