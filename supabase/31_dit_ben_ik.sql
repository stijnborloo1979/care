-- =====================================================================
--  THUIS — "Dit ben ik"
--  Supabase migratie, versie 31
--
--  Draai dit na 01_schema.sql en 07_display_prefs.sql.
--
--  Wie naar het ziekenhuis of een woonzorgcentrum gaat, komt daar aan als
--  een naam op een lijst. Het personeel weet op dag één niet hoe ze heet
--  voor haar familie, wie haar dochter is, dat ze onrustig wordt rond vier
--  uur, of dat ze rustiger wordt van muziek.
--
--  De app weet dat bijna allemaal al: familie, voorkeuren, routines, het
--  levensverhaal. Drie dingen niet, en het zijn net de drie waar zorg het
--  meest aan heeft. Die komen hier.
--
--  Bewust vrije tekst en geen keuzelijsten. Wat iemand rustig maakt, laat
--  zich niet aanvinken.
-- =====================================================================

alter table public.household
  add column if not exists profiel jsonb not null default '{}'::jsonb;

comment on column public.household.profiel is
  'Voor "Dit ben ik": noemNaam (hoe ze aangesproken wil worden), omgang (hoe je best praat), rust (wat helpt bij onrust), vermijden (waar ze van overstuur raakt), vrij (wat familie er nog bij wil zetten).';


create or replace function public.set_profiel(hh uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r      public.member_role;
  nieuw  jsonb;
begin
  r := public.auth_role(hh);
  if r is null or r not in ('admin', 'member', 'person') then
    raise exception 'Geen recht om dit profiel te wijzigen';
  end if;

  -- Samenvoegen, niet vervangen: twee familieleden die elk een veld
  -- invullen, horen elkaars werk niet te wissen.
  update public.household
     set profiel = coalesce(profiel, '{}'::jsonb) || coalesce(p, '{}'::jsonb)
   where id = hh
   returning profiel into nieuw;

  return nieuw;
end;
$$;

grant execute on function public.set_profiel(uuid, jsonb) to authenticated;

comment on function public.set_profiel(uuid, jsonb) is
  'Vult de velden van "Dit ben ik" aan. Familie en de persoon zelf; zorgverleners lezen alleen.';
