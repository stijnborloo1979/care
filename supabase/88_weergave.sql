-- =====================================================================
--  LIFEANGLE — indeling en kleurpalet kiezen (migratie 88)
--
--  Twee dingen die familie of het woonzorgcentrum kiest, en de persoon
--  nooit:
--
--    indeling  'origineel' (standaard) of 'knoppen'. De originele
--              indeling blijft altijd beschikbaar; 'knoppen' is er naast.
--    palet     het kleurpalet. Per huishouden (household.display_prefs)
--              of, als dat leeg is, het palet van de organisatie, en
--              anders het standaardpalet.
--
--  Het palet verandert alleen kleuren, nooit de indeling.
--
--  Wie mag wat:
--    - familie (admin of member) kiest indeling en palet van het huishouden;
--    - de beheerder of coördinator van de gekoppelde organisatie ook;
--    - de persoon zelf (rol 'person') mag niets van dit alles.
--
--  Dat laatste wordt hier afgedwongen, niet in het scherm: set_display_prefs
--  laat indeling en palet voortaan links liggen, en de enige weg is
--  set_weergave.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Palet van de organisatie (het WZC-palet)
-- ---------------------------------------------------------------------

alter table public.organisation add column if not exists palet text;

alter table public.organisation drop constraint if exists organisation_palet_check;
alter table public.organisation add constraint organisation_palet_check
  check (palet is null or palet in ('standaard', 'linde', 'zacht-blauw', 'hoog-contrast'));

comment on column public.organisation.palet is
  'Standaardpalet voor alle bewoners van deze organisatie. Null = LifeAngle-standaard. Per huishouden overschrijfbaar.';

-- ---------------------------------------------------------------------
--  2. set_display_prefs: indeling en palet horen hier niet meer
-- ---------------------------------------------------------------------

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

  -- Indeling en palet gaan via set_weergave, die de rol van de persoon
  -- uitsluit. Hier halen we ze eruit, zodat niemand ze via deze functie
  -- alsnog kan zetten.
  prefs := coalesce(prefs, '{}'::jsonb) - 'indeling' - 'palet';

  update public.household
     set display_prefs = coalesce(display_prefs, '{}'::jsonb) || prefs
   where id = hh
   returning display_prefs into nieuw;

  return nieuw;
end;
$$;

grant execute on function public.set_display_prefs(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
--  3. set_weergave: indeling en palet van het huishouden
--
--  prefs mag 'indeling' en/of 'palet' bevatten. Een palet van null zet het
--  huishouden terug op het palet van de organisatie.
-- ---------------------------------------------------------------------

create or replace function public.set_weergave(hh uuid, prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  ok boolean;
  ind text := prefs->>'indeling';
  pal text := prefs->>'palet';
  patch jsonb := '{}'::jsonb;
  nieuw jsonb;
begin
  select h.org_id into org from public.household h where h.id = hh;

  ok := public.family_role(hh) in ('admin', 'member')
     or (org is not null and coalesce(public.org_role_of(org)::text, '') in ('org_admin', 'coordinator'));
  if not coalesce(ok, false) then
    raise exception 'Geen recht om de weergave te wijzigen';
  end if;

  if prefs ? 'indeling' then
    if ind is null or ind not in ('origineel', 'knoppen') then
      raise exception 'Onbekende indeling: %', ind;
    end if;
    patch := patch || jsonb_build_object('indeling', ind);
  end if;

  if prefs ? 'palet' then
    if pal is not null and pal not in ('standaard', 'linde', 'zacht-blauw', 'hoog-contrast') then
      raise exception 'Onbekend palet: %', pal;
    end if;
    patch := patch || jsonb_build_object('palet', pal);
  end if;

  update public.household
     set display_prefs = coalesce(display_prefs, '{}'::jsonb) || patch
   where id = hh
   returning display_prefs into nieuw;

  return nieuw;
end;
$$;

grant execute on function public.set_weergave(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
--  4. effective_weergave: wat het scherm van de persoon moet tonen
--
--  Dit is wat de tablet leest. Het palet is het huishoudenspalet, en
--  anders dat van de organisatie, en anders de standaard. Ook de
--  persoon zelf mag dit lezen: het is wat ze ziet, niet wat ze kan wijzigen.
-- ---------------------------------------------------------------------

create or replace function public.effective_weergave(hh uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prefs jsonb;
  orgpalet text;
begin
  if not public.is_member(hh) then
    raise exception 'Geen toegang';
  end if;

  select h.display_prefs, o.palet
    into prefs, orgpalet
    from public.household h
    left join public.organisation o on o.id = h.org_id
   where h.id = hh;

  return jsonb_build_object(
    'indeling', coalesce(prefs->>'indeling', 'origineel'),
    'palet', coalesce(prefs->>'palet', orgpalet, 'standaard'),
    'paletEigen', prefs->>'palet'
  );
end;
$$;

grant execute on function public.effective_weergave(uuid) to authenticated;

-- ---------------------------------------------------------------------
--  5. set_org_palet: het standaardpalet van het woonzorgcentrum
-- ---------------------------------------------------------------------

create or replace function public.set_org_palet(o uuid, palet text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.org_role_of(o)::text, '') not in ('org_admin', 'coordinator') then
    raise exception 'Alleen de beheerder of coördinator kan het palet van de organisatie wijzigen';
  end if;
  if palet is not null and palet not in ('standaard', 'linde', 'zacht-blauw', 'hoog-contrast') then
    raise exception 'Onbekend palet: %', palet;
  end if;

  update public.organisation set palet = set_org_palet.palet where id = o;
  return palet;
end;
$$;

grant execute on function public.set_org_palet(uuid, text) to authenticated;
