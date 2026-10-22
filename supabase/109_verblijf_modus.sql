-- =====================================================================
--  LIFEANGLE — wonen in een woonzorgcentrum verandert de dag (stap 1)
--  Supabase migratie, versie 109
--
--  Draai dit na 108_menu.sql.
--  Terugdraaien: supabase/rollback/109_verblijf_modus.sql
--
--  BESTAAND   een koppeling met een WZC opent een verblijf (stay), maar
--             bijna alles bleef zich gedragen alsof de persoon thuis woont:
--               - "Ik heb hulp nodig" ging alleen naar familie, ook als de
--                 verpleging op tien meter zat;
--               - de nachtjob zette de thuisroutines in de agenda, naast de
--                 maaltijden van de afdeling: twee ontbijten;
--               - familie kreeg "de ochtendroutine wijkt af" over een dag die
--                 het WZC regelt;
--               - de veilige zone rond de oude woning sloeg meteen alarm;
--               - de bewoner zag "Je bent thuis" op het Help-scherm.
--  VOORGESTELD
--             heeft_verblijf(hh) is de enige bron voor "woont in een WZC".
--             Niets wordt gewist bij een koppeling: thuisroutines, zone en
--             meldingen pauzeren, en komen vanzelf terug na het verblijf.
--             Hulp gaat bij een verblijf naar iedereen van de afdeling
--             (zorg_alarm), familie krijgt een rustig bericht in kopie.
--  REDEN      veiligheid eerst: een hulpvraag moet bij wie kan komen.
--  RISICO     middel. vraag_hulp, materialise_day_intern,
--             check_household_alerts, record_location en mijn_wzc krijgen
--             een nieuwe versie. Zonder verblijf gedragen ze zich exact
--             zoals voorheen (zie test_109_verblijf_modus.sql).
--
--  Wie ziet een hulpvraag
--  ----------------------
--    elke medewerker die nu op de afdeling van het verblijf staat
--    (werkt_op_afdeling), wie persoonlijk toegewezen is (toegewezen), en —
--    alleen als het verblijf nog geen afdeling heeft — de coördinatoren en
--    beheerders van het WZC. Een hulpvraag mag nooit bij niemand landen.
--
--  Nog niet in deze stap
--  ---------------------
--    pushmeldingen naar medewerkers (die hebben nog geen push), medicatie
--    (stap 2) en "Mijn kamer" (stap 3).
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Eén bron: woont deze persoon nu in een WZC?
--
--  Zonder rechtencontrole, dus niet aanroepbaar via de API. Voor de app
--  bestaan lopend_verblijf() en mijn_wzc(), die wel controleren wie vraagt.
-- ---------------------------------------------------------------------

create or replace function public.heeft_verblijf(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.stay where household_id = hh and ended_at is null);
$$;

revoke execute on function public.heeft_verblijf(uuid) from public, anon, authenticated;
grant execute on function public.heeft_verblijf(uuid) to service_role;


-- mijn_wzc: ook de bewoner zelf (de tablet) mag weten waar hij woont, en
-- de bron is het open verblijf, niet household.org_id.
create or replace function public.mijn_wzc(hh uuid)
returns table (org_id uuid, naam text, sinds timestamptz, afdeling text, kamer text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, s.started_at, d.name, s.room
    from public.stay s
    join public.organisation o on o.id = s.org_id
    left join public.department d on d.id = s.department_id
   where s.household_id = hh
     and s.ended_at is null
     and (public.family_role(hh) is not null or public.is_bewoner(hh));
$$;

revoke execute on function public.mijn_wzc(uuid) from public, anon;
grant execute on function public.mijn_wzc(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  2. De hulpvraag aan de afdeling
-- ---------------------------------------------------------------------

create table if not exists public.zorg_alarm (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.household (id) on delete cascade,
  stay_id         uuid not null references public.stay (id) on delete cascade,
  org_id          uuid not null references public.organisation (id) on delete cascade,
  department_id   uuid references public.department (id) on delete set null,
  soort           text not null default 'hulp' check (soort in ('hulp')),
  herhalingen     integer not null default 0,
  created_at      timestamptz not null default now(),
  laatst_at       timestamptz not null default now(),
  opgevolgd_at    timestamptz,
  opgevolgd_door  uuid references public.profile (id) on delete set null
);

comment on table public.zorg_alarm is
  'Een hulpvraag van een bewoner aan zijn afdeling. Open tot een medewerker "Ik ga" drukt. Geen vrije tekst, dus geen gezondheidsgegevens.';

-- Hoogstens één open hulpvraag per bewoner: nog eens drukken telt op.
create unique index if not exists zorg_alarm_een_open
  on public.zorg_alarm (household_id, soort) where opgevolgd_at is null;
create index if not exists zorg_alarm_org_open
  on public.zorg_alarm (org_id, created_at desc) where opgevolgd_at is null;


create or replace function public.ziet_alarm(dep uuid, org uuid, hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    (dep is not null and public.werkt_op_afdeling(dep))
    or public.toegewezen(hh)
    -- Zonder afdeling: de coördinatoren en beheerders, anders ziet niemand het.
    or (dep is null and coalesce(public.org_role_of(org)::text, '') in ('coordinator', 'org_admin'))
  );
$$;

revoke execute on function public.ziet_alarm(uuid, uuid, uuid) from public, anon;
grant execute on function public.ziet_alarm(uuid, uuid, uuid) to authenticated;

alter table public.zorg_alarm enable row level security;

-- Alleen lezen via de policy (nodig voor realtime). Schrijven gaat
-- uitsluitend via vraag_hulp() en alarm_opgevolgd().
drop policy if exists zorg_alarm_lezen on public.zorg_alarm;
create policy zorg_alarm_lezen on public.zorg_alarm for select
  using (public.ziet_alarm(department_id, org_id, household_id));

revoke all on public.zorg_alarm from anon;
revoke insert, update, delete on public.zorg_alarm from authenticated;
grant select on public.zorg_alarm to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.zorg_alarm;
exception when others then null;
end
$$;


-- Wat er nu openstaat voor deze medewerker, binnen één organisatie.
-- Na twaalf uur valt een vergeten vraag van de lijst: dan is ze opgevolgd
-- buiten de app, of niet meer actueel.
create or replace function public.zorg_alarmen(org uuid)
returns table (
  id            uuid,
  household_id  uuid,
  naam          text,
  kamer         text,
  afdeling      text,
  herhalingen   integer,
  created_at    timestamptz,
  laatst_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.household_id, h.person_name, s.room, d.name,
         a.herhalingen, a.created_at, a.laatst_at
    from public.zorg_alarm a
    join public.household h on h.id = a.household_id
    join public.stay s on s.id = a.stay_id
    left join public.department d on d.id = a.department_id
   where a.org_id = org
     and a.opgevolgd_at is null
     and s.ended_at is null
     and a.created_at > now() - interval '12 hours'
     and public.ziet_alarm(a.department_id, a.org_id, a.household_id)
   order by a.created_at;
$$;

revoke execute on function public.zorg_alarmen(uuid) from public, anon;
grant execute on function public.zorg_alarmen(uuid) to authenticated;


-- "Ik ga": de vraag is opgevolgd. Komt in het zorglogboek, zodat familie
-- ziet dát er gereageerd is, en door wie.
create or replace function public.alarm_opgevolgd(alarm uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a public.zorg_alarm;
  tz text;
begin
  select * into a from public.zorg_alarm where id = alarm;
  if a.id is null or not public.ziet_alarm(a.department_id, a.org_id, a.household_id) then
    raise exception 'Deze hulpvraag bestaat niet of is niet voor jou' using errcode = '42501';
  end if;
  if a.opgevolgd_at is not null then
    return; -- een collega was sneller; dat is goed nieuws, geen fout
  end if;

  update public.zorg_alarm
     set opgevolgd_at = now(), opgevolgd_door = auth.uid()
   where id = alarm;

  select timezone into tz from public.household where id = a.household_id;
  insert into public.care_log (household_id, occurred_at, title, note, author_id, source)
  values (a.household_id, now(), 'Hulpvraag opgevolgd door het zorgteam',
          'Gevraagd om ' || to_char(a.created_at at time zone coalesce(tz, 'Europe/Brussels'), 'HH24:MI'),
          auth.uid(), 'caregiver');
end;
$$;

revoke execute on function public.alarm_opgevolgd(uuid) from public, anon;
grant execute on function public.alarm_opgevolgd(uuid) to authenticated;


-- vraag_hulp: thuis zoals voorheen (familie, niveau alert). In een WZC
-- naar de afdeling; familie krijgt een rustig bericht, geen alarm: wie
-- 's nachts op een uur rijden woont, kan niet komen en hoeft dus niet
-- gewekt te worden.
create or replace function public.vraag_hulp(hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  naam text;
  s    public.stay;
begin
  if public.auth_role(hh) is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  select coalesce(h.person_name, 'Thuis') into naam
    from public.household h where h.id = hh;

  select * into s from public.stay where household_id = hh and ended_at is null;

  if s.id is null then
    perform public.vraag_iets(hh, 'hulp', 'alert', naam || ' heeft hulp nodig.', interval '2 minutes', null);
    return;
  end if;

  -- Nog eens drukken telt op bij de open vraag, zodat de afdeling ziet dat
  -- het dringender wordt, en er geen tweede kaart bijkomt.
  update public.zorg_alarm
     set herhalingen = herhalingen + 1, laatst_at = now(),
         department_id = s.department_id, stay_id = s.id
   where household_id = hh and soort = 'hulp' and opgevolgd_at is null;
  if not found then
    insert into public.zorg_alarm (household_id, stay_id, org_id, department_id, soort)
    values (hh, s.id, s.org_id, s.department_id, 'hulp');
  end if;

  -- Een eigen sleutel: anders slikt de wachttijd van een eerdere vraag van
  -- thuis (of van na het verblijf) dit bericht in.
  perform public.vraag_iets(hh, 'hulp-wzc', 'info',
    naam || ' vroeg hulp. De afdeling is verwittigd.', interval '2 minutes', null);
end;
$$;


-- ---------------------------------------------------------------------
--  3. De dag: geen thuisroutines tijdens een verblijf
--
--  Zelfde lichaam als in 06, met één voorwaarde erbij. Wat familie zelf
--  plant (bezoek, afspraken) staat los van routines en blijft.
-- ---------------------------------------------------------------------

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

  -- Het WZC regelt de dag; de afdelingsdag (78) staat al op de tablet.
  if public.heeft_verblijf(hh) then
    return 0;
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
grant execute on function public.materialise_day_intern(uuid, date) to service_role;


-- Bij het begin van een verblijf: wat de nachtjob al uit routines
-- klaarzette en nog moet komen, gaat weg. Afgevinkte items blijven
-- (geschiedenis), net als alles wat niet uit een routine komt.
-- Bij het einde: morgen opnieuw uit de routines. Vandaag niet — dan staan
-- er ineens items van vanochtend open die niemand deed. Open hulpvragen
-- van dat verblijf sluiten mee: de afdeling kan er niets meer mee.
create or replace function public.verblijf_routines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
begin
  if tg_op = 'INSERT' and new.ended_at is null then
    delete from public.agenda_event
     where household_id = new.household_id
       and routine_step_id is not null
       and done_at is null
       and starts_at > now();
  elsif tg_op = 'UPDATE' and old.ended_at is null and new.ended_at is not null then
    update public.zorg_alarm set opgevolgd_at = now()
     where stay_id = new.id and opgevolgd_at is null;
    if public.heeft_verblijf(new.household_id) then
      return new;  -- meteen een nieuw verblijf: geen routines
    end if;
    select timezone into tz from public.household where id = new.household_id;
    perform public.materialise_day_intern(
      new.household_id, ((now() at time zone coalesce(tz, 'Europe/Brussels'))::date + 1));
  end if;
  return new;
end;
$$;

revoke execute on function public.verblijf_routines() from public, anon, authenticated;

drop trigger if exists stay_routines on public.stay;
create trigger stay_routines
  after insert or update of ended_at on public.stay
  for each row execute function public.verblijf_routines();


-- ---------------------------------------------------------------------
--  4. Meldingen uit de nachtjob: niet over een dag die het WZC regelt
--
--  Zelfde lichaam als in 14. Medicatie komt in stap 2 naar de afdeling;
--  tot dan gaat er tijdens een verblijf niets naar familie, want familie
--  kan een gemiste inname in het WZC niet oplossen.
-- ---------------------------------------------------------------------

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

  if niveau <> 'ondersteund' then
    return 0;
  end if;

  if public.heeft_verblijf(hh) then
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

revoke execute on function public.check_household_alerts(uuid) from public, anon, authenticated;
grant execute on function public.check_household_alerts(uuid) to service_role;


-- ---------------------------------------------------------------------
--  5. Locatie: gepauzeerd tijdens een verblijf
--
--  De veilige zone ligt rond de oude woning. Geen punt bewaren en geen
--  melding: in een WZC volgt het team, niet een kaart. De instelling zelf
--  blijft staan en werkt weer na het verblijf.
-- ---------------------------------------------------------------------

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

  if public.heeft_verblijf(hh) then
    return false;
  end if;

  select * into s from public.location_setting where household_id = hh;
  if s.household_id is null or not s.enabled then
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
