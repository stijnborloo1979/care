-- Terugdraaien van 54_noodtoegang.sql. Verwijdert de noodtoegang en haar log.
-- Er verandert niets aan andere tabellen of toegangsregels.
-- Let op: de meldingen die al naar de familie gingen, blijven staan.

drop function if exists public.stop_noodtoegang(uuid);
drop function if exists public.nood_inzage(uuid);
drop function if exists public.start_noodtoegang(uuid, text);
drop function if exists public.actieve_noodtoegang(uuid);
drop function if exists public.is_team_lead_van(uuid);
drop table if exists public.emergency_access_log;
drop table if exists public.emergency_access;
drop function if exists public.mag_noodtoegang_zien(uuid);
