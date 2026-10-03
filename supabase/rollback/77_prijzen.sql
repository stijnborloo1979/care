-- Terugdraaien van 77_prijzen.sql
drop function if exists public.publieke_prijzen();
alter table public.plan drop constraint if exists plan_prijs_check;
alter table public.plan
  drop column if exists omschrijving, drop column if exists eenheid,
  drop column if exists prijs_maand_cent, drop column if exists prijs_jaar_cent,
  drop column if exists minimum_maand_cent, drop column if exists btw_inbegrepen,
  drop column if exists proefdagen, drop column if exists zichtbaar, drop column if exists volgorde;
