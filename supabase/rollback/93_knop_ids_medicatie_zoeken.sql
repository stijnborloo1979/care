-- Terugdraaien van 93_knop_ids_medicatie_zoeken.sql.
-- Zet set_weergave terug op de lijst uit 90, zonder medicatie en zoeken.
-- Kleuren of foto's die al voor die tegels zijn opgeslagen, worden dan
-- door de server geweigerd bij een volgende wijziging; de app negeert ze.

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
