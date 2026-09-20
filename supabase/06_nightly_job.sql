-- =====================================================================
--  THUIS — de nachtelijke job
--  Supabase migratie, versie 6
--
--  Draai dit na 01_schema.sql. 04 is optioneel (het opruimen van
--  verlopen berichten wordt overgeslagen als die migratie er niet is).
--
--  Dit is het stuk dat ontbrak: routines stonden in de database, maar
--  niets zette ze om in de dag van morgen. Zonder deze job is de agenda
--  morgenvroeg leeg, en vraagt Maria zich af wat ze moet doen.
--
--  Waarom materialiseren en niet berekenen: zo kan Els één ochtend
--  verzetten zonder de routine zelf aan te raken, en blijft de historie
--  kloppen. Een berekende agenda zou beide onmogelijk maken.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Herkomst vastleggen
--
--  Zonder deze kolom weet de job niet wat hij al gemaakt heeft, en staat
--  het ontbijt er na twee keer draaien twee keer.
-- ---------------------------------------------------------------------

alter table public.agenda_event
  add column if not exists routine_step_id uuid references public.routine_step (id) on delete set null;

create unique index if not exists agenda_event_step_unique
  on public.agenda_event (routine_step_id, starts_at)
  where routine_step_id is not null;

alter table public.notification
  add column if not exists dedupe_key text;

create unique index if not exists notification_dedupe_unique
  on public.notification (household_id, dedupe_key)
  where dedupe_key is not null;


-- ---------------------------------------------------------------------
--  2. Herhaling uitlezen
--
--  Een bewust kleine subset van RFC 5545: FREQ met BYDAY en BYMONTHDAY.
--  Dat dekt dagelijks, weekdagen, wekelijks en maandelijks, en dat is
--  alles wat de app aanbiedt. Meer ondersteunen betekent meer manieren
--  waarop een medicatiemoment stilletjes kan wegvallen.
-- ---------------------------------------------------------------------

create or replace function public.rrule_matches(rrule text, d date)
returns boolean
language plpgsql
immutable
as $$
declare
  freq      text;
  byday     text[];
  bymonthd  text[];
  dagcode   text;
begin
  if rrule is null or rrule = '' then
    return true;
  end if;

  freq := upper(coalesce(substring(upper(rrule) from 'FREQ=([A-Z]+)'), 'DAILY'));

  -- isodow: 1 = maandag ... 7 = zondag. Bewust niet to_char(d,'DY'),
  -- want dat hangt af van de taalinstelling van de server.
  dagcode := (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from d)::int];

  if freq = 'DAILY' then
    return true;

  elsif freq = 'WEEKLY' then
    byday := string_to_array(substring(upper(rrule) from 'BYDAY=([A-Z,]+)'), ',');
    if byday is null then
      return true;
    end if;
    return dagcode = any (byday);

  elsif freq = 'MONTHLY' then
    bymonthd := string_to_array(substring(upper(rrule) from 'BYMONTHDAY=([0-9,]+)'), ',');
    if bymonthd is null then
      return extract(day from d) = 1;
    end if;
    return extract(day from d)::text = any (bymonthd);

  elsif freq = 'YEARLY' then
    return to_char(d, 'MM-DD') = coalesce(
      lpad(substring(upper(rrule) from 'BYMONTH=([0-9]+)'), 2, '0') || '-' ||
      lpad(substring(upper(rrule) from 'BYMONTHDAY=([0-9]+)'), 2, '0'),
      to_char(d, 'MM-DD'));
  end if;

  return false;
end;
$$;


-- ---------------------------------------------------------------------
--  3. Een dag klaarzetten
-- ---------------------------------------------------------------------

create or replace function public.materialise_day(hh uuid, on_day date)
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

comment on function public.materialise_day(uuid, date) is
  'Idempotent: twee keer draaien maakt geen dubbele items. Verwijdert een familielid een gematerialiseerd item, dan komt het bij een herhaling voor diezelfde dag wel terug — draai de job daarom alleen voor dagen die nog moeten komen.';


-- ---------------------------------------------------------------------
--  4. Meldingen
--
--  Geen spam: alleen wat afwijkt, en per ding hoogstens één melding per
--  dag. Dat laatste doet de dedupe_key.
-- ---------------------------------------------------------------------

create or replace function public.check_household_alerts(hh uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tz      text;
  vandaag date;
  n       integer := 0;
  med     record;
  laat    integer;
begin
  select timezone into tz from public.household where id = hh;
  if tz is null then
    return 0;
  end if;
  vandaag := (now() at time zone tz)::date;

  -- medicatie die meer dan een uur geleden had gemoeten
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

  -- een ochtend die afwijkt: drie of meer items van voor de middag open
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


-- ---------------------------------------------------------------------
--  5. De job zelf
--
--  Zet morgen klaar, vul vandaag aan als er nog niets stond, ruim op en
--  kijk of er iets afwijkt. Eén functie, zodat er ook maar één ding in
--  de planner hoeft te staan.
-- ---------------------------------------------------------------------

create or replace function public.run_nightly()
returns table (household_id uuid, events_added integer, alerts_added integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  h        record;
  morgen   date;
  vandaag  date;
  toegev   integer;
  alerts   integer;
begin
  for h in select id, timezone from public.household loop
    vandaag := (now() at time zone h.timezone)::date;
    morgen  := vandaag + 1;

    toegev := public.materialise_day(h.id, morgen);

    -- Vangnet: draaide de job gisteren niet, dan staat vandaag er alsnog.
    if not exists (
      select 1 from public.agenda_event ae
      where ae.household_id = h.id
        and (ae.starts_at at time zone h.timezone)::date = vandaag
    ) then
      toegev := toegev + public.materialise_day(h.id, vandaag);
    end if;

    perform public.ensure_medication_log(h.id, morgen);
    perform public.ensure_medication_log(h.id, vandaag);

    alerts := public.check_household_alerts(h.id);

    household_id := h.id;
    events_added := toegev;
    alerts_added := alerts;
    return next;
  end loop;
end;
$$;

-- Verlopen berichten opruimen hoort hier ook, maar alleen als 04 gedraaid is.
do $$
begin
  if to_regprocedure('public.cleanup_expired_messages()') is not null then
    execute $f$
      create or replace function public.run_nightly_full()
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        perform public.run_nightly();
        perform public.cleanup_expired_messages();
      end;
      $body$;
    $f$;
  end if;
end
$$;


-- ---------------------------------------------------------------------
--  6. Inplannen
--
--  Zet eerst pg_cron aan: Dashboard -> Database -> Extensions -> pg_cron.
--  Daarna draait dit blok de planning erin. Lukt het niet, dan kan je de
--  job ook elke nacht aanroepen vanuit een edge function met een
--  scheduled trigger.
--
--  02:30 is bewust: na middernacht staat de nieuwe dag vast, en het is
--  ruim voor iemand opstaat.
-- ---------------------------------------------------------------------

do $$
begin
  perform cron.unschedule('thuis-nightly');
exception when others then
  null;
end
$$;

do $$
begin
  perform cron.schedule('thuis-nightly', '30 2 * * *', 'select public.run_nightly()');
exception when others then
  raise notice 'pg_cron staat nog niet aan. Zet de extensie aan en draai dit blok opnieuw, of roep run_nightly() aan vanuit een edge function.';
end
$$;


-- ---------------------------------------------------------------------
--  7. Meteen één keer draaien, zodat morgen niet leeg is
-- ---------------------------------------------------------------------

select * from public.run_nightly();


-- =====================================================================
--  Controleren
--
--    select public.rrule_matches('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
--                                current_date + 1);
--
--    select starts_at, title from public.agenda_event
--     where household_id = '<id>'
--       and starts_at > now()
--     order by starts_at limit 20;
-- =====================================================================
