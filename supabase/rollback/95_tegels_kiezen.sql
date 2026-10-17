-- Terugdraaien van 95_tegels_kiezen.sql.
-- Zet set_weergave terug op de versie uit 94, en effective_weergave en
-- set_display_prefs op die uit 90. De tegelkeuze in display_prefs blijft
-- staan, maar de app leest die dan niet meer.

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
  kf jsonb := prefs->'knoppenFotos';
  schoon jsonb := '{}'::jsonb;
  schoon_f jsonb := '{}'::jsonb;
  rec record;
  patch jsonb := '{}'::jsonb;
  nieuw jsonb;
  knoppen text[] := array['nu', 'vandaag', 'wie', 'memory', 'fotos', 'radio', 'help', 'medicatie', 'zoeken', 'praten'];
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

  if prefs ? 'knoppenFotos' then
    if kf is null or jsonb_typeof(kf) = 'null' then
      kf := '{}'::jsonb;
    end if;
    if jsonb_typeof(kf) <> 'object' then
      raise exception 'Knopfoto''s moeten een object zijn';
    end if;
    for rec in select key, value from jsonb_each(kf) loop
      if not (rec.key = any (knoppen)) then
        raise exception 'Onbekende knop: %', rec.key;
      end if;
      if jsonb_typeof(rec.value) = 'null' then
        continue;
      end if;
      -- Alleen een pad in de map van dit huishouden en van deze knop.
      if jsonb_typeof(rec.value) <> 'string'
         or not starts_with(rec.value #>> '{}', hh::text || '/knoppen/' || rec.key || '/')
         or position('..' in rec.value #>> '{}') > 0
         or length(rec.value #>> '{}') > 300 then
        raise exception 'Ongeldige foto voor %', rec.key;
      end if;
      schoon_f := schoon_f || jsonb_build_object(rec.key, rec.value #>> '{}');
    end loop;
    patch := patch || jsonb_build_object('knoppenFotos', schoon_f);
  end if;

  update public.household
     set display_prefs = coalesce(display_prefs, '{}'::jsonb) || patch
   where id = hh
   returning display_prefs into nieuw;

  return nieuw;
end;
$$;

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
    'knoppenKleuren', coalesce(prefs->'knoppenKleuren', '{}'::jsonb),
    'knoppenFotos', coalesce(prefs->'knoppenFotos', '{}'::jsonb)
  );
end;
$$;

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

  -- Indeling, palet, knopkleuren en knopfoto's gaan via set_weergave, die de
  -- rol van de persoon uitsluit.
  prefs := coalesce(prefs, '{}'::jsonb) - 'indeling' - 'palet' - 'knoppenKleuren' - 'knoppenFotos';

  update public.household
     set display_prefs = coalesce(display_prefs, '{}'::jsonb) || prefs
   where id = hh
   returning display_prefs into nieuw;

  return nieuw;
end;
$$;
