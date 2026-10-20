-- Terugdraaien van 107: de maaltijdregistratie verdwijnt.
drop function if exists public.maaltijd_analyse(uuid, date, date);
drop function if exists public.maaltijd_zet(uuid, uuid, date, text, text);
drop function if exists public.mag_maaltijd(uuid);
drop table if exists public.maaltijd_registratie;
