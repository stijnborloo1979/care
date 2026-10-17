-- =====================================================================
--  LIFEANGLE — kleur per knop (migratie 89)
--
--  Bovenop 88: familie of het WZC kan per knop van het scherm met grote
--  knoppen een kleur kiezen. De kleuren komen uit een vaste lijst die vooraf
--  gecontroleerd is op contrast met witte tekst (zie paletten.ts). De
--  server controleert dezelfde lijst, zodat een browser die iets anders
--  stuurt, geweigerd wordt.
--
--  Opslag: household.display_prefs.knoppenKleuren, een object
--  { "<knop>": "#hex" }. Een knop die niet in het object staat, krijgt de
--  gewone vormgeving.
--
--  Draai dit na 88_weergave.sql. Deze migratie vervangt set_weergave,
--  set_display_prefs en effective_weergave.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. set_display_prefs: knopkleuren horen hier ook niet
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

  -- Indeling, palet en knopkleuren gaan via set_weergave, die de rol van de
  -- persoon uitsluit.
  prefs := coalesce(prefs, '{}'::jsonb) - 'indeling' - 'palet' - 'knoppenKleuren';

  update public.household
     set display_prefs = coalesce(display_prefs, '{}'::jsonb) || prefs
   where id = hh
   returning display_prefs into nieuw;

  return nieuw;
end;
$$;

grant execute on function public.set_display_prefs(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
--  2. set_weergave: indeling, palet en knopkleuren van het huishouden
--
--  knoppenKleuren vervangt het hele object. Een waarde van null haalt die
--  knop uit de lijst. Alleen de knoppen hieronder, en alleen kleuren uit
--  de lijst; al het andere wordt geweigerd.
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
  kk jsonb := prefs->'knoppenKleuren';
  schoon jsonb := '{}'::jsonb;
  rec record;
  patch jsonb := '{}'::jsonb;
  nieuw jsonb;
  knoppen text[] := array['nu', 'vandaag', 'wie', 'memory', 'fotos', 'radio', 'help'];
  kleuren text[] := array[
    '#0f5d63', '#1d6b63', '#2f6b3a', '#1f4e79', '#17568f', '#2b3f8f',
    '#66409a', '#7a2f5e', '#9a4a2a', '#7a5a12', '#5c1f08', '#1f1d1a'
  ];
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

  if prefs ? 'knoppenKleuren' then
    if kk is null or jsonb_typeof(kk) = 'null' then
      kk := '{}'::jsonb;
    end if;
    if jsonb_typeof(kk) <> 'object' then
      raise exception 'Knopkleuren moeten een object zijn';
    end if;
    for rec in select key, value from jsonb_each(kk) loop
      if not (rec.key = any (knoppen)) then
        raise exception 'Onbekende knop: %', rec.key;
      end if;
      if jsonb_typeof(rec.value) = 'null' then
        continue;
      end if;
      if jsonb_typeof(rec.value) <> 'string' or not ((rec.value #>> '{}') = any (kleuren)) then
        raise exception 'Onbekende kleur voor %', rec.key;
      end if;
      schoon := schoon || jsonb_build_object(rec.key, rec.value #>> '{}');
    end loop;
    patch := patch || jsonb_build_object('knoppenKleuren', schoon);
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
--  3. effective_weergave: ook de knopkleuren
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
    'paletEigen', prefs->>'palet',
    'knoppenKleuren', coalesce(prefs->'knoppenKleuren', '{}'::jsonb)
  );
end;
$$;

grant execute on function public.effective_weergave(uuid) to authenticated;
