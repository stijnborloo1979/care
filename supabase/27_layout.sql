-- =====================================================================
--  THUIS — de indeling van het scherm van de persoon
--  Supabase migratie, versie 27
--
--  Draai dit na 01_schema.sql en 07_display_prefs.sql.
--
--  Familie stelt samen welke blokken op het dagscherm staan, in welke
--  volgorde en hoe groot. Net als de weergave-instellingen hoort dat bij
--  de persoon en niet bij het account dat toevallig inlogt: zo regelt Els
--  het van op afstand en volgt de tablet vanzelf.
--
--  Bewust GEEN posities, alleen volgorde en grootte. Met x/y klopt een
--  indeling alleen op het scherm waarop ze gemaakt is; draait de tablet of
--  zet de persoon de tekst groter, dan schuift alles over elkaar. Volgorde
--  plus grootte herschikt zichzelf, en de leesvolgorde blijft gelijk aan
--  wat je ziet — wat voor de voorleesfunctie de volgorde is die telt.
-- =====================================================================

alter table public.household
  add column if not exists home_layout jsonb not null default '{}'::jsonb;

comment on column public.household.home_layout is
  'De indeling van het dagscherm: {"versie":1,"tegels":[{"id":"nu","maat":"vol"},…]}. Volgorde en grootte, geen posities. Leeg betekent: de standaardindeling.';


-- ---------------------------------------------------------------------
--  Bewaren
--
--  Zorgverleners niet: de indeling van iemands huiskamerscherm is een
--  familiebeslissing, geen zorghandeling. De persoon zelf wel — wie de
--  app zelf gebruikt, richt ook zijn eigen scherm in.
--
--  De regels (maximum aantal, "Wat nu?" bovenaan, halve tegels bij grote
--  tekst) staan in de app, maar het maximum staat hier nog eens: een
--  indeling met vijftig tegels hoort de database niet te bewaren, ook niet
--  als er ooit een ander scherm langs deze functie komt.
-- ---------------------------------------------------------------------

create or replace function public.set_home_layout(hh uuid, layout jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.member_role;
  tegels jsonb;
  nieuw jsonb;
begin
  r := public.auth_role(hh);
  if r is null or r not in ('admin', 'member', 'person') then
    raise exception 'Geen recht om de indeling te wijzigen';
  end if;

  tegels := layout -> 'tegels';

  if tegels is null or jsonb_typeof(tegels) <> 'array' then
    raise exception 'Een indeling heeft een lijst tegels';
  end if;

  if jsonb_array_length(tegels) > 6 then
    raise exception 'Hoogstens zes tegels';
  end if;

  -- Helemaal vervangen, niet samenvoegen zoals display_prefs: een tegel
  -- weghalen moet ook echt weghalen.
  update public.household
     set home_layout = jsonb_build_object('versie', 1, 'tegels', tegels)
   where id = hh
   returning home_layout into nieuw;

  return nieuw;
end;
$$;

grant execute on function public.set_home_layout(uuid, jsonb) to authenticated;

comment on function public.set_home_layout(uuid, jsonb) is
  'Vervangt de indeling van het dagscherm. Familie en de persoon zelf; zorgverleners niet.';
