-- Terugdraaien van 68_bericht_zorgteam.sql
-- Weigert zodra er berichten zijn: die zouden anders verloren gaan.
do $$
begin
  if to_regclass('public.resident_message') is not null
     and exists (select 1 from public.resident_message) then
    raise exception 'Er staan nog berichten van bewoners. Bewaar of wis ze eerst bewust.';
  end if;
end
$$;

do $$ begin perform cron.unschedule('bewonerberichten-opruimen'); exception when others then null; end $$;
drop function if exists public.bewonerbericht_opruimen();
drop function if exists public.antwoord_aan_bewoner(uuid, text);
drop function if exists public.markeer_bericht_gezien(uuid);
drop function if exists public.bericht_aan_zorgteam(uuid, text);
drop table if exists public.resident_message;
drop function if exists public.lopend_verblijf(uuid);
drop function if exists public.is_bewoner(uuid);
