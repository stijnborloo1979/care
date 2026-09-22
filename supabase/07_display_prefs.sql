-- =====================================================================
--  THUIS — weergave-instellingen
--  Supabase migratie, versie 7
--
--  Draai dit na 01_schema.sql.
--
--  Tekstgrootte, contrast en eenvoudige modus horen bij de persoon, niet
--  bij het account dat toevallig ingelogd is. Ze staan daarom op het
--  huishouden: zo kan Els ze van op afstand instellen, en volgt de tablet
--  vanzelf.
-- =====================================================================

alter table public.household
  add column if not exists display_prefs jsonb not null default '{}'::jsonb;

comment on column public.household.display_prefs is
  'scale (1 | 1.15 | 1.3 | 1.5), contrast (normal | high), theme (auto | light | dark), accent (groenblauw | blauw | groen | paars | warm), simple (bool), voice (bool), licht (bool), schermAan (bool), kiosk (bool), kioskTerug (2 | 5 | 10), nachtVan, nachtTot (uur 0-23).';

-- De update-policy op household is voorbehouden aan de beheerder. Deze
-- instellingen mag elk familielid aanpassen, dus gaan ze via een functie
-- in plaats van via een bredere policy.
create or replace function public.set_display_prefs(hh uuid, prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.member_role;
  nieuw jsonb;
begin
  r := public.auth_role(hh);
  if r is null or r not in ('admin', 'member', 'person') then
    raise exception 'Geen recht om de instellingen te wijzigen';
  end if;

  update public.household
     set display_prefs = coalesce(display_prefs, '{}'::jsonb) || coalesce(prefs, '{}'::jsonb)
   where id = hh
   returning display_prefs into nieuw;

  return nieuw;
end;
$$;

grant execute on function public.set_display_prefs(uuid, jsonb) to authenticated;
