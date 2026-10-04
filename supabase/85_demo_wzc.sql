-- =====================================================================
--  LIFEANGLE Care — een demo-woonzorgcentrum met één klik
--  Supabase migratie, versie 85
--
--  Draai dit na 84_import.sql.
--  Terugdraaien: supabase/rollback/85_demo_wzc.sql
--  Tests: supabase/tests/test_85_demo_wzc.sql
--
--  BESTAAND   wie Care wilde tonen, moest eerst zelf een huis met bewoners,
--             afdelingen en activiteiten opbouwen.
--  VOORGESTELD maak_demo_wzc(): een volledig ingevuld voorbeeldhuis
--             ("Demo · WZC Zonnehof") met afdelingen, kamers, acht
--             verzonnen bewoners, de vaste dag, activiteiten, nieuws, een
--             bezoek, een uitstap, een kwijte bril, zorgnotities, een
--             overdracht en een vraag van een bewoner. Jij bent er
--             coördinator en team lead van beide afdelingen, zodat je alles
--             ziet wat een zorgteam ziet.
--             demo_rol(org, rol): in een demo (en alleen daar) wissel je zelf
--             tussen coördinator en beheerder, om beide schermen te tonen.
--             wis_demo_wzc(org): ruimt de demo volledig op.
--  RISICO     laag. organisation.demo en household.demo markeren alles. De
--             bewoners zijn verzonnen; er hoort geen familie of tablet bij.
--             Een demo telt niet mee als klant.
-- =====================================================================

do $$
begin
  if to_regclass('public.kamer') is null or to_regclass('public.bezitting') is null then
    raise exception 'Draai eerst 81_spullen.sql en 82_kamers.sql';
  end if;
end
$$;

alter table public.organisation add column if not exists demo boolean not null default false;
alter table public.household add column if not exists demo boolean not null default false;

comment on column public.organisation.demo is 'Een voorbeeldhuis van maak_demo_wzc(); verzonnen gegevens.';
comment on column public.household.demo is 'Een verzonnen bewoner van een demo-woonzorgcentrum.';

-- In de app kan niemand iets "demo" maken of een echt huis demo noemen.
create or replace function public.demo_vast()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.demo := false;
    else
      new.demo := old.demo;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.demo_vast() from public, anon, authenticated;

drop trigger if exists organisation_demo_vast on public.organisation;
create trigger organisation_demo_vast before insert or update on public.organisation
  for each row execute function public.demo_vast();
drop trigger if exists household_demo_vast on public.household;
create trigger household_demo_vast before insert or update on public.household
  for each row execute function public.demo_vast();

create or replace function public.maak_demo_wzc()
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ik uuid := auth.uid();
  o uuid;
  linde uuid;
  eik uuid;
  hh uuid;
  st uuid;
  a uuid;
  vandaag date := (now() at time zone 'Europe/Brussels')::date;
  bewoner record;
  namen text[] := array['Rita Peeters', 'Jos Maes', 'Maria Claes', 'Louis De Smet', 'Anna Willems', 'Georges Jacobs', 'Simonne Wouters', 'Frans Mertens'];
  kamers text[] := array['101', '102', '103', '104', '201', '202', '203', '204'];
  i integer;
  ids uuid[] := '{}';
  at timestamptz;
begin
  if ik is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;
  -- Eén demo per persoon: bestaat ze al, dan die.
  select om.org_id into o
    from public.org_membership om join public.organisation og on og.id = om.org_id
   where om.profile_id = ik and og.demo
   limit 1;
  if o is not null then
    return o;
  end if;

  insert into public.organisation (name, demo) values ('Demo · WZC Zonnehof', true) returning id into o;
  insert into public.org_membership (org_id, profile_id, role, job_title) values (o, ik, 'coordinator', 'Coördinator (demo)');
  insert into public.department (org_id, name) values (o, 'Linde') returning id into linde;
  insert into public.department (org_id, name) values (o, 'Eik') returning id into eik;
  insert into public.department_staff (department_id, profile_id, role) values (linde, ik, 'team_lead'), (eik, ik, 'team_lead');

  insert into public.kamer (org_id, department_id, naam, bedden)
  select o, case when k like '1%' then linde else eik end, k, case when k in ('104', '204') then 2 else 1 end
    from unnest(kamers || array['105', '205']) k;

  for i in 1 .. array_length(namen, 1) loop
    insert into public.household (person_name, org_id, org_linked_at, org_linked_by, demo)
    values (namen[i], o, now() - (i * interval '23 days'), ik, true)
    returning id into hh;
    update public.stay set department_id = case when i <= 4 then linde else eik end,
                           room = kamers[i],
                           started_at = now() - (i * interval '23 days')
     where household_id = hh and ended_at is null;
    ids := ids || hh;
  end loop;

  -- De vaste dag
  insert into public.afdeling_dag (org_id, department_id, titel, soort, emoji, begint, eindigt, dagen, created_by) values
    (o, null, 'Ontbijt', 'maaltijd', '☕', '08:00', '09:00', '{1,2,3,4,5,6,7}', ik),
    (o, null, 'Middagmaal', 'maaltijd', null, '12:00', '13:00', '{1,2,3,4,5,6,7}', ik),
    (o, linde, 'Middagrust', 'rust', null, '13:00', '14:30', '{1,2,3,4,5,6,7}', ik),
    (o, null, 'Koffie en taart', 'maaltijd', '🍰', '15:30', null, '{7}', ik),
    (o, eik, 'Koffie', 'maaltijd', null, '15:00', null, '{1,2,3,4,5,6}', ik),
    (o, null, 'Avondmaal', 'maaltijd', null, '17:30', '18:30', '{1,2,3,4,5,6,7}', ik);

  -- Activiteiten deze en volgende week
  insert into public.activity (org_id, department_id, titel, starts_at, ends_at, plaats, created_by)
  values (o, linde, 'Samen zingen', (vandaag + time '10:30') at time zone 'Europe/Brussels', (vandaag + time '11:30') at time zone 'Europe/Brussels', 'Cafetaria', ik)
  returning id into a;
  insert into public.activity_participant (activity_id, household_id, status, created_by)
  select a, x, case when n <= 3 then 'aanwezig' else 'ingeschreven' end, ik from unnest(ids[1:4]) with ordinality as t(x, n);
  insert into public.activity (org_id, department_id, titel, starts_at, plaats, created_by) values
    (o, null, 'Bingo', (vandaag + time '16:00') at time zone 'Europe/Brussels', 'Zaal', ik),
    (o, null, 'Wandeling in het park', (vandaag + 1 + time '10:00') at time zone 'Europe/Brussels', 'Inkom', ik),
    (o, eik, 'Bakken met de kleinkinderen', (vandaag + 2 + time '14:00') at time zone 'Europe/Brussels', 'Leefruimte Eik', ik),
    (o, null, 'Kapper', (vandaag + 3 + time '09:30') at time zone 'Europe/Brussels', 'Kapsalon', ik),
    (o, null, 'Muziek met Jef', (vandaag + 5 + time '15:00') at time zone 'Europe/Brussels', 'Cafetaria', ik);

  -- Nieuws
  insert into public.org_nieuws (org_id, department_id, titel, tekst, author_id, created_at) values
    (o, null, 'Herfstfeest zaterdag', 'Zaterdag om 14 uur in de cafetaria: muziek, wafels en een tombola. Iedereen welkom, ook kleinkinderen.', ik, now() - interval '1 day'),
    (o, linde, 'Nieuwe kapster op Linde', 'Vanaf dinsdag komt Nadia elke week. Inschrijven kan bij het team.', ik, now() - interval '6 days');

  -- Een bezoek, een uitstap, spullen
  insert into public.visit_log (household_id, visitor_name, note, visited_at, author_id)
  values (ids[1], 'Els', 'Samen foto''s bekeken van de zee.', now() - interval '3 hours', ik),
         (ids[2], 'De kapster', 'Haar geknipt.', now() - interval '1 day', ik);
  insert into public.uitstap (household_id, met_wie, vertrek, terug, notitie, status, vertrokken_at, created_by)
  values (ids[3], 'Dochter Ann', now() - interval '2 hours', now() + interval '2 hours', 'Naar de markt en daarna bij haar eten', 'weg', now() - interval '2 hours', ik),
         (ids[1], 'Els', (vandaag + 1 + time '14:00') at time zone 'Europe/Brussels', (vandaag + 1 + time '17:00') at time zone 'Europe/Brussels', null, 'gepland', null, ik);
  insert into public.bezitting (household_id, naam, soort, kenmerk, waar, kwijt_sinds, kwijt_door, created_by) values
    (ids[1], 'Leesbril', 'bril', 'Rood montuur, naam binnenin', 'Op het nachtkastje', now() - interval '5 hours', ik, ik),
    (ids[1], 'Gebit (boven)', 'gebit', null, 'Bekertje in de badkamer', null, null, ik),
    (ids[2], 'Hoorapparaat links', 'hoorapparaat', 'Beige', 'Doosje op het nachtkastje', null, null, ik);

  -- Zorgnotities, een overdracht en een vraag van een bewoner
  for bewoner in select s.id as stay_id, s.household_id from public.stay s where s.org_id = o and s.ended_at is null and s.household_id = any (ids[1:3]) loop
    insert into public.care_note (household_id, stay_id, org_id, category, body, visibility, author_id)
    values (bewoner.household_id, bewoner.stay_id, o, 'maaltijd', 'Goed gegeten bij het middagmaal, extra soep gevraagd.', 'familie', ik),
           (bewoner.household_id, bewoner.stay_id, o, 'stemming', 'Wat onrustig na het bezoek; met een wandeling in de gang ging het beter.', 'team', ik);
  end loop;
  insert into public.handover (department_id, shift_date, shift, body, author_id)
  values (linde, vandaag, 'vroeg', 'Rustige ochtend. Rita zoekt haar leesbril (kwijt gemeld). Jos naar de kapper om 9u30 morgen. Maria is op uitstap met haar dochter tot 16u.', ik);
  select s.id into st from public.stay s where s.household_id = ids[4] and s.ended_at is null;
  insert into public.resident_message (household_id, stay_id, van, body, created_at)
  values (ids[4], st, 'bewoner', 'Mag ik vanavond wat later naar bed? Er is voetbal.', now() - interval '40 minutes');

  return o;
end;
$$;

revoke execute on function public.maak_demo_wzc() from public, anon;
grant execute on function public.maak_demo_wzc() to authenticated, service_role;

-- Alleen in een demo: zelf wisselen tussen coördinator en beheerder.
create or replace function public.demo_rol(org uuid, rol text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  d uuid;
begin
  if auth.uid() is null
     or not exists (select 1 from public.organisation where id = org and demo)
     or not exists (select 1 from public.org_membership where org_id = org and profile_id = auth.uid()) then
    raise exception 'Dit kan alleen in een demo' using errcode = '42501';
  end if;
  if rol not in ('org_admin', 'coordinator') then
    raise exception 'Onbekende rol' using errcode = '22023';
  end if;
  update public.org_membership set role = rol::public.org_role, active = true
   where org_id = org and profile_id = auth.uid();
  -- Terug coördinator: weer team lead van elke afdeling (beheerder worden
  -- beëindigde die rijen, 70).
  if rol = 'coordinator' then
    for d in select id from public.department where org_id = org and archived_at is null loop
      if not exists (select 1 from public.department_staff ds
                      where ds.department_id = d and ds.profile_id = auth.uid()
                        and (ds.valid_until is null or ds.valid_until > now())) then
        insert into public.department_staff (department_id, profile_id, role) values (d, auth.uid(), 'team_lead');
      end if;
    end loop;
  end if;
end;
$$;

revoke execute on function public.demo_rol(uuid, text) from public, anon;
grant execute on function public.demo_rol(uuid, text) to authenticated, service_role;

-- De demo opruimen: verzonnen bewoners en het voorbeeldhuis.
create or replace function public.wis_demo_wzc(org uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.organisation where id = org and demo)
     or not exists (select 1 from public.org_membership where org_id = org and profile_id = auth.uid()) then
    raise exception 'Dit kan alleen in een demo' using errcode = '42501';
  end if;
  delete from public.household h
   where h.demo and exists (select 1 from public.stay s where s.household_id = h.id and s.org_id = org);
  delete from public.organisation where id = org and demo;
end;
$$;

revoke execute on function public.wis_demo_wzc(uuid) from public, anon;
grant execute on function public.wis_demo_wzc(uuid) to authenticated, service_role;
