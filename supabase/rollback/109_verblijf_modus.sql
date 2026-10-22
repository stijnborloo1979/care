-- Terugdraaien van 109_verblijf_modus.sql.
-- Zet de vorige versies van de gewijzigde functies terug (letterlijk uit
-- 60, 43, 06, 14 en 08) en verwijdert de hulpvragen aan de afdeling.
-- Open hulpvragen gaan verloren; maak eerst een back-up.

drop trigger if exists stay_routines on public.stay;
drop function if exists public.verblijf_routines();
drop function if exists public.alarm_opgevolgd(uuid);
drop function if exists public.zorg_alarmen(uuid);

do $$
begin
  alter publication supabase_realtime drop table public.zorg_alarm;
exception when others then null;
end
$$;
drop table if exists public.zorg_alarm;
drop function if exists public.ziet_alarm(uuid, uuid, uuid);

-- uit 60_personeel.sql
create or replace function public.mijn_wzc(hh uuid)
returns table (org_id uuid, naam text, sinds timestamptz, afdeling text, kamer text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, coalesce(s.started_at, h.org_linked_at), d.name, s.room
    from public.household h
    join public.organisation o on o.id = h.org_id
    left join public.stay s on s.household_id = h.id and s.ended_at is null
    left join public.department d on d.id = s.department_id
   where h.id = hh
     and (public.family_role(hh) is not null or public.is_self(hh));
$$;

-- uit 43_wie_ze_vroeg.sql
create or replace function public.vraag_hulp(hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  naam text;
begin
  if public.auth_role(hh) is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  select coalesce(h.person_name, 'Thuis') into naam
    from public.household h where h.id = hh;

  perform public.vraag_iets(
    hh, 'hulp', 'alert',
    naam || ' heeft hulp nodig.',
    interval '2 minutes',
    null
  );
end;
$$;

-- uit 06_nightly_job.sql (daar nog onder de naam materialise_day)
create or replace function public.materialise_day_intern(hh uuid, on_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tz  text;
  n   integer := 0;
  st  record;
begin
  select timezone into tz from public.household where id = hh;
  if tz is null then
    raise exception 'Onbekend huishouden';
  end if;

  for st in
    select rs.id, rs.at_time, rs.title, rs.emoji, r.id as routine_id
    from public.routine_step rs
    join public.routine r on r.id = rs.routine_id
    where r.household_id = hh
      and r.active
      and public.rrule_matches(r.rrule, on_day)
    order by rs.at_time
  loop
    insert into public.agenda_event
      (household_id, starts_at, title, emoji, kind, routine_id, routine_step_id)
    values (
      hh,
      (on_day + st.at_time) at time zone tz,
      st.title,
      st.emoji,
      case
        when st.title ilike '%medicatie%' or st.title ilike '%pil%' then 'med'
        when st.title ilike '%ontbijt%' or st.title ilike '%lunch%'
          or st.title ilike '%avondeten%' or st.title ilike '%eten%' then 'meal'
        else 'routine'
      end,
      st.routine_id,
      st.id
    )
    on conflict do nothing;

    if found then
      n := n + 1;
    end if;
  end loop;

  return n;
end;
$$;
revoke execute on function public.materialise_day_intern(uuid, date) from public, anon, authenticated;

-- uit 14_ownership.sql
create or replace function public.check_household_alerts(hh uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tz      text;
  niveau  text;
  vandaag date;
  n       integer := 0;
  med     record;
  laat    integer;
begin
  select timezone, support_level into tz, niveau from public.household where id = hh;
  if tz is null then
    return 0;
  end if;

  -- Zelfstandig of samen: geen meldingen naar familie. Anders is het vanaf
  -- dag één een toezichtsapp, en dat is precies wat deze fase niet is.
  if niveau <> 'ondersteund' then
    return 0;
  end if;

  vandaag := (now() at time zone tz)::date;

  for med in
    select m.name, ml.due_at
    from public.medication_log ml
    join public.medication m on m.id = ml.medication_id
    where ml.household_id = hh
      and ml.taken_at is null
      and ml.due_at < now() - interval '1 hour'
      and (ml.due_at at time zone tz)::date = vandaag
  loop
    insert into public.notification (household_id, level, body, target_role, dedupe_key)
    values (hh, 'warn',
            med.name || ' van ' || to_char(med.due_at at time zone tz, 'HH24:MI') ||
            ' is nog niet bevestigd.',
            null,
            'med:' || vandaag || ':' || med.name)
    on conflict do nothing;
    n := n + 1;
  end loop;

  select count(*) into laat
  from public.agenda_event ae
  where ae.household_id = hh
    and ae.done_at is null
    and (ae.starts_at at time zone tz)::date = vandaag
    and (ae.starts_at at time zone tz)::time < time '12:00'
    and ae.starts_at < now() - interval '1 hour';

  if laat >= 3 then
    insert into public.notification (household_id, level, body, target_role, dedupe_key)
    values (hh, 'warn', 'De ochtendroutine wijkt vandaag af.', null, 'ochtend:' || vandaag)
    on conflict do nothing;
    n := n + 1;
  end if;

  return n;
end;
$$;

-- uit 08_location.sql
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

drop function if exists public.heeft_verblijf(uuid);
