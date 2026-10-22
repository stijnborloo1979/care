-- Terugdraaien van 109_maaltijd_standaard.sql.
-- Nieuwe uitstappen krijgen weer "niet eten mee" als standaard, zoals in 106.
-- Bestaande keuzes blijven staan.

drop function if exists public.maaltijd_analyse_stand(uuid, date, date);
drop function if exists public.maaltijd_dag_overzicht(uuid, date);
drop function if exists public.maaltijd_stand(uuid, uuid, date);

alter table public.uitstap alter column eet_mee set default false;
comment on column public.uitstap.eet_mee is
  'Blijft de bewoner tijdens de uitstap eten? Standaard niet: dan vervalt de maaltijd van het huis. Alleen de familie past dit aan, tot het vertrek.';
