-- =====================================================================
--  Wonen in een WZC verandert de dag (VEREIST_MIGRATIE 109)
--  Hulp gaat naar de afdeling, thuisroutines en zone pauzeren, en na het
--  verblijf komt alles terug zoals het was.
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; hh2 uuid; org uuid; da uuid; db uuid; rt uuid;
begin
  insert into auth.users (email)
    select m from unnest(array['v-fam@t', 'v-pers@t', 'v-ca@t', 'v-cb@t', 'v-co@t', 'v-oa@t',
                               'v-vreemd@t', 'v-fam2@t']) m;
  insert into t_ids select replace(replace(email, 'v-', ''), '@t', ''), id from auth.users where email like 'v-%@t';

  insert into public.organisation (name) values ('WZC Linde') returning id into org;
  insert into public.department (org_id, name) values (org, 'Beuk') returning id into da;
  insert into public.department (org_id, name) values (org, 'Eik') returning id into db;
  insert into t_ids values ('org', org), ('da', da), ('db', db);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('ca', 'caregiver'), ('cb', 'caregiver'),
                                                  ('co', 'coordinator'), ('oa', 'org_admin')) x(k, r)
  join t_ids using (k);
  insert into public.department_staff (department_id, profile_id)
  values (da, (select v from t_ids where k = 'ca')), (db, (select v from t_ids where k = 'cb'));

  -- Maria woont nog thuis, met een ochtendroutine en een veilige zone.
  insert into public.household (person_name) values ('Maria') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role)
  values (hh, (select v from t_ids where k = 'fam'), 'admin'),
         (hh, (select v from t_ids where k = 'pers'), 'person');
  insert into public.routine (household_id, name) values (hh, 'Ochtend') returning id into rt;
  insert into public.routine_step (routine_id, household_id, at_time, title) values (rt, hh, '08:00', 'Ontbijt');
  insert into public.location_setting (household_id, enabled, home_lat, home_lng, radius_m)
  values (hh, true, 51.05, 3.72, 300);

  -- Jos: een tweede bewoner, nog zonder afdeling.
  insert into public.household (person_name) values ('Jos') returning id into hh2;
  insert into t_ids values ('hh2', hh2);
  insert into public.membership (household_id, profile_id, role)
  values (hh2, (select v from t_ids where k = 'fam2'), 'admin');
end $$;

create function pg_temp.als(k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select v from t_ids where t_ids.k = als.k), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t_ids where t_ids.k = id.k $$;
create function pg_temp.gelijk(wat text, kreeg anyelement, verwacht anyelement) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;
create function pg_temp.geweigerd(wat text, sql text) returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then raise notice 'ok: % (geweigerd: %)', wat, sqlerrm; return; end;
  raise exception 'GEZAKT: % — werd niet geweigerd', wat;
end $$;
-- Lezen als eigenaar, voor tabellen die voor de gebruiker dicht zijn.
create function pg_temp.q(sql text) returns text language plpgsql security definer set search_path = public as $$
declare r text;
begin
  execute sql into r;
  return r;
end $$;
create function pg_temp.morgen_routines() returns text language sql as $$
  select pg_temp.q(format(
    $f$select count(*) from public.agenda_event where household_id = %L and routine_step_id is not null
         and (starts_at at time zone 'Europe/Brussels')::date = (now() at time zone 'Europe/Brussels')::date + 1$f$,
    pg_temp.id('hh')))
$$;

-- ---------------------------------------------------------------------
--  A. Thuis: alles zoals voorheen
-- ---------------------------------------------------------------------
select pg_temp.gelijk('thuis: routine van morgen wordt klaargezet',
  public.materialise_day_intern(pg_temp.id('hh'), (now() at time zone 'Europe/Brussels')::date + 1), 1);

set local role authenticated;
select pg_temp.als('pers');
select public.vraag_hulp(pg_temp.id('hh'));
select pg_temp.gelijk('thuis: hulp is een alarm voor familie',
  pg_temp.q(format($f$select level from public.notification where household_id = %L and dedupe_key = 'hulp'$f$, pg_temp.id('hh'))), 'alert');
select pg_temp.gelijk('thuis: geen hulpvraag aan een afdeling',
  pg_temp.q(format($f$select count(*) from public.zorg_alarm where household_id = %L$f$, pg_temp.id('hh'))), '0');
select pg_temp.gelijk('thuis: geen WZC voor de bewoner', (select count(*) from public.mijn_wzc(pg_temp.id('hh'))), 0::bigint);

select pg_temp.als('fam');
select pg_temp.gelijk('thuis: locatie wordt bewaard', public.record_location(pg_temp.id('hh'), 51.05, 3.72, 10), true);
reset role;

-- ---------------------------------------------------------------------
--  B. Koppelen: Maria woont op Beuk
-- ---------------------------------------------------------------------
update public.household set org_id = pg_temp.id('org') where id = pg_temp.id('hh');
update public.stay set department_id = pg_temp.id('da'), room = '12'
 where household_id = pg_temp.id('hh') and ended_at is null;

select pg_temp.gelijk('verblijf: klaargezette thuisroutine van morgen is weg', pg_temp.morgen_routines(), '0');
select pg_temp.gelijk('verblijf: nachtjob zet geen thuisroutines',
  public.materialise_day_intern(pg_temp.id('hh'), (now() at time zone 'Europe/Brussels')::date + 2), 0);
update public.household set support_level = 'ondersteund' where id = pg_temp.id('hh');
select pg_temp.gelijk('verblijf: geen nachtmeldingen voor familie', public.check_household_alerts(pg_temp.id('hh')), 0);

set local role authenticated;
select pg_temp.als('pers');
select pg_temp.gelijk('bewoner ziet waar hij woont',
  (select afdeling || ' ' || kamer from public.mijn_wzc(pg_temp.id('hh'))), 'Beuk 12');

select public.vraag_hulp(pg_temp.id('hh'));
select pg_temp.gelijk('verblijf: één hulpvraag aan de afdeling',
  pg_temp.q(format($f$select count(*) from public.zorg_alarm where household_id = %L and opgevolgd_at is null$f$, pg_temp.id('hh'))), '1');
select pg_temp.gelijk('verblijf: familie krijgt een rustig bericht, geen alarm',
  pg_temp.q(format($f$select level from public.notification where household_id = %L and dedupe_key = 'hulp-wzc'$f$, pg_temp.id('hh'))), 'info');
select public.vraag_hulp(pg_temp.id('hh'));
select pg_temp.gelijk('nog eens drukken telt op, geen tweede kaart',
  pg_temp.q(format($f$select count(*) || '/' || max(herhalingen) from public.zorg_alarm where household_id = %L$f$, pg_temp.id('hh'))), '1/1');
select pg_temp.gelijk('bewoner leest de afdelingslijst niet', (select count(*) from public.zorg_alarm), 0::bigint);

select pg_temp.als('ca');
select pg_temp.gelijk('medewerker van Beuk ziet de hulpvraag', (select count(*) from public.zorg_alarm), 1::bigint);
select pg_temp.gelijk('medewerker van Beuk krijgt naam en kamer',
  (select naam || ' ' || kamer from public.zorg_alarmen(pg_temp.id('org'))), 'Maria 12');

select pg_temp.als('cb');
select pg_temp.gelijk('medewerker van Eik ziet niets', (select count(*) from public.zorg_alarm), 0::bigint);
select pg_temp.gelijk('medewerker van Eik: lege lijst', (select count(*) from public.zorg_alarmen(pg_temp.id('org'))), 0::bigint);
select pg_temp.geweigerd('medewerker van Eik volgt niet op',
  format($q$select public.alarm_opgevolgd(%L)$q$, pg_temp.q(format($f$select id from public.zorg_alarm where household_id = %L$f$, pg_temp.id('hh')))));

select pg_temp.als('oa');
select pg_temp.gelijk('beheerder ziet een hulpvraag mét afdeling niet', (select count(*) from public.zorg_alarm), 0::bigint);
select pg_temp.als('vreemd');
select pg_temp.gelijk('vreemde ziet niets', (select count(*) from public.zorg_alarm), 0::bigint);
select pg_temp.geweigerd('niemand schrijft rechtstreeks in de tabel',
  format($q$update public.zorg_alarm set opgevolgd_at = now() where household_id = %L$q$, pg_temp.id('hh')));

select pg_temp.als('ca');
select public.alarm_opgevolgd(id) from public.zorg_alarm;
select pg_temp.gelijk('opgevolgd: van de lijst', (select count(*) from public.zorg_alarmen(pg_temp.id('org'))), 0::bigint);
select pg_temp.gelijk('opgevolgd: staat in het zorglogboek',
  pg_temp.q(format($f$select count(*) from public.care_log where household_id = %L and title = 'Hulpvraag opgevolgd door het zorgteam'$f$, pg_temp.id('hh'))), '1');

select pg_temp.als('pers');
select public.vraag_hulp(pg_temp.id('hh'));
select pg_temp.gelijk('na opvolgen is een nieuwe vraag een nieuwe kaart',
  pg_temp.q(format($f$select count(*) || '/' || count(*) filter (where opgevolgd_at is null) from public.zorg_alarm where household_id = %L$f$, pg_temp.id('hh'))), '2/1');

select pg_temp.als('fam');
select pg_temp.gelijk('verblijf: locatie wordt niet bewaard', public.record_location(pg_temp.id('hh'), 50.0, 4.0, 10), false);
select pg_temp.gelijk('verblijf: geen zonemelding',
  pg_temp.q(format($f$select count(*) from public.notification where household_id = %L and body like 'De veilige zone%%'$f$, pg_temp.id('hh'))), '0');
reset role;

-- ---------------------------------------------------------------------
--  C. Een verblijf zonder afdeling: de vraag landt nooit bij niemand
-- ---------------------------------------------------------------------
update public.household set org_id = pg_temp.id('org') where id = pg_temp.id('hh2');
set local role authenticated;
select pg_temp.als('fam2');
select public.vraag_hulp(pg_temp.id('hh2'));
select pg_temp.als('co');
select pg_temp.gelijk('zonder afdeling: coördinator ziet de vraag',
  (select count(*) from public.zorg_alarmen(pg_temp.id('org')) where naam = 'Jos'), 1::bigint);
select pg_temp.als('oa');
select pg_temp.gelijk('zonder afdeling: beheerder ziet de vraag',
  (select count(*) from public.zorg_alarmen(pg_temp.id('org')) where naam = 'Jos'), 1::bigint);
select pg_temp.als('ca');
select pg_temp.gelijk('zonder afdeling: medewerker van Beuk niet',
  (select count(*) from public.zorg_alarmen(pg_temp.id('org')) where naam = 'Jos'), 0::bigint);
reset role;

-- ---------------------------------------------------------------------
--  D. Het verblijf stopt: alles komt terug
-- ---------------------------------------------------------------------
update public.household set org_id = null where id = pg_temp.id('hh');
-- Alles in deze test gebeurt binnen één transactie, dus op één now(): de
-- wachttijd van de eerste hulpvraag zou de volgende inslikken.
update public.notification set read_at = now() where household_id = pg_temp.id('hh');
select pg_temp.gelijk('na het verblijf: open hulpvraag is gesloten',
  pg_temp.q(format($f$select count(*) from public.zorg_alarm where household_id = %L and opgevolgd_at is null$f$, pg_temp.id('hh'))), '0');
select pg_temp.gelijk('na het verblijf: routine van morgen staat er weer', pg_temp.morgen_routines(), '1');

set local role authenticated;
select pg_temp.als('pers');
select public.vraag_hulp(pg_temp.id('hh'));
select pg_temp.gelijk('na het verblijf: hulp is weer een alarm voor familie',
  pg_temp.q(format($f$select level from public.notification where household_id = %L and dedupe_key = 'hulp'$f$, pg_temp.id('hh'))), 'alert');
select pg_temp.als('fam');
select pg_temp.gelijk('na het verblijf: locatie werkt weer', public.record_location(pg_temp.id('hh'), 51.05, 3.72, 10), true);
select pg_temp.gelijk('heeft_verblijf is niet aanroepbaar via de API',
  has_function_privilege('authenticated', 'public.heeft_verblijf(uuid)', 'execute'), false);
reset role;

rollback;
