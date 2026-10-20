-- Terugdraaien van 106: de keuze "blijft eten" verdwijnt.
drop function if exists public.uitstap_eetkeuze(uuid, boolean);
alter table public.uitstap drop column if exists eet_mee;
