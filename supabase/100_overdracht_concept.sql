-- =====================================================================
--  100: concept-overdracht per organisatie (uit standaard)
--
--  Zet de functie "concept voor de overdracht" aan of uit. Het concept
--  leest alleen gegevens die de gebruiker mag zien (RLS blijft gelden) en
--  wordt nooit zonder bevestiging opgeslagen.
--
--  Wijzigen mag alleen de org_admin (organisation_write uit 03).
-- =====================================================================

alter table public.organisation
  add column if not exists concept_overdracht boolean not null default false;

comment on column public.organisation.concept_overdracht is
  'Laat medewerkers een concept voor de overdracht maken uit de bronnen van de laatste dienst. Standaard uit.';
