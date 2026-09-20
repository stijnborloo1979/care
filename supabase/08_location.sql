-- =====================================================================
--  THUIS — locatie en veilige zones
--  Supabase migratie, versie 8
--
--  Draai dit na 01_schema.sql.
--
--  Uitgangspunt uit de brief: locatie is optioneel, vraagt expliciete
--  toestemming, en is altijd zichtbaar wanneer ze aan staat. Dit is geen
--  volgsysteem. Er wordt niets bijgehouden zolang niemand toestemt, en de
--  persoon kan het zelf uitzetten.
-- =====================================================================

create table if not exists public.location_point (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  at            timestamptz not null default now(),
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    integer,
  inside_zone   boolean,
  source        text not null default 'device' check (source in ('device', 'manual'))
);

create index if not exists location_point_hh_idx on public.location_point (household_id, at desc);

alter table public.location_point enable row level security;

drop policy if exists location_point_read on public.location_point;
create policy location_point_read on public.location_point for select
  using (public.is_member(household_id));

-- Schrijven gebeurt uitsluitend via record_location(): die controleert
-- eerst of de toestemming er is.
drop policy if exists location_point_write on public.location_point;
create policy location_point_write on public.location_point for insert
  with check (false);

-- Afstand in meter, goed genoeg voor zones van enkele honderden meter.
create or replace function public.afstand_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create or replace function public.set_location_consent(
  hh uuid,
  aan boolean,
  home_lat double precision default null,
  home_lng double precision default null,
  radius integer default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.member_role;
begin
  r := public.auth_role(hh);
  -- De persoon zelf mag dit altijd uitzetten. Aanzetten kan alleen de
  -- beheerder of de persoon zelf, niet zomaar elk familielid.
  if r is null or (r not in ('admin', 'person') and aan) then
    raise exception 'Geen recht om de locatie-instelling te wijzigen';
  end if;

  insert into public.location_setting (household_id, enabled, consent_at, consent_by,
                                       home_lat, home_lng, radius_m)
  values (hh, aan, case when aan then now() end, case when aan then auth.uid() end,
          home_lat, home_lng, coalesce(radius, 500))
  on conflict (household_id) do update
    set enabled = excluded.enabled,
        consent_at = case when excluded.enabled then now() else null end,
        consent_by = case when excluded.enabled then auth.uid() else null end,
        home_lat = coalesce(excluded.home_lat, location_setting.home_lat),
        home_lng = coalesce(excluded.home_lng, location_setting.home_lng),
        radius_m = coalesce(excluded.radius_m, location_setting.radius_m);

  -- Aan- en uitzetten hoort in het logboek: het is een beslissing over
  -- privacy, geen instelling die stil mag veranderen.
  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (hh, now(),
          case when aan then 'Locatie delen aangezet' else 'Locatie delen uitgezet' end,
          auth.uid(), 'family');
end;
$$;

create or replace function public.record_location(
  hh uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy integer default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.location_setting;
  binnen   boolean := true;
  vorige   boolean;
  tz       text;
begin
  if public.auth_role(hh) is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  select * into s from public.location_setting where household_id = hh;
  if s.household_id is null or not s.enabled then
    -- Geen toestemming, geen punt. Stil weigeren, zonder fout: de app
    -- hoort hier niet op te crashen.
    return false;
  end if;

  if s.home_lat is not null and s.home_lng is not null then
    binnen := public.afstand_m(p_lat, p_lng, s.home_lat, s.home_lng) <= coalesce(s.radius_m, 500);
  end if;

  select lp.inside_zone into vorige
  from public.location_point lp
  where lp.household_id = hh
  order by lp.at desc
  limit 1;

  insert into public.location_point (household_id, lat, lng, accuracy_m, inside_zone)
  values (hh, p_lat, p_lng, p_accuracy, binnen);

  -- Alleen melden bij een overgang, niet bij elk punt buiten de zone.
  if not binnen and coalesce(vorige, true) then
    select timezone into tz from public.household where id = hh;
    insert into public.notification (household_id, level, body, dedupe_key)
    values (hh, 'warn', 'De veilige zone is verlaten.',
            'zone:' || to_char(now() at time zone coalesce(tz, 'Europe/Brussels'), 'YYYY-MM-DD HH24:MI'))
    on conflict do nothing;

    insert into public.care_log (household_id, occurred_at, title, source)
    values (hh, now(), 'Veilige zone verlaten', 'system');
  end if;

  return binnen;
end;
$$;

create or replace function public.last_location(hh uuid)
returns table (at timestamptz, lat double precision, lng double precision, inside_zone boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select lp.at, lp.lat, lp.lng, lp.inside_zone
  from public.location_point lp
  where lp.household_id = hh
  order by lp.at desc
  limit 1;
$$;

-- Niets langer bewaren dan nodig: locatiegeschiedenis van weken terug
-- heeft geen enkel nut en is wel een risico.
create or replace function public.cleanup_location(dagen integer default 7)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.location_point where at < now() - (dagen || ' days')::interval;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.set_location_consent(uuid, boolean, double precision, double precision, integer) to authenticated;
grant execute on function public.record_location(uuid, double precision, double precision, integer) to authenticated;
grant execute on function public.last_location(uuid) to authenticated;
