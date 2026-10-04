-- =====================================================================
--  De dag van de afdeling (VEREIST_MIGRATIE 78)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; hh2 uuid; hh3 uuid; org uuid; org2 uuid; da uuid; db uuid; dx uuid;
begin
  insert into auth.users (email) select m from unnest(array['d-fa@t', 'd-tab@t', 'd-c1@t', 'd-c2@t', 'd-oa@t', 'd-co@t', 'd-x@t', 'd-fb@t', 'd-tl@t']) m;
  insert into t_ids select replace(replace(email, 'd-', ''), '@t', ''), id from auth.users where email like 'd-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into public.household (person_name) values ('Jos') returning id into hh2;
  insert into public.household (person_name) values ('Thuis') returning id into hh3;
  insert into t_ids values ('hh', hh), ('hh2', hh2), ('hh3', hh3);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'tab'), 'person'),
    (hh2, (select v from t_ids where k = 'fb'), 'admin'),
    (hh3, (select v from t_ids where k = 'x'), 'admin');
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into public.organisation (name) values ('Ander') returning id into org2;
  insert into t_ids values ('org', org), ('org2', org2);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('c1', 'caregiver'), ('c2', 'caregiver'), ('oa', 'org_admin'), ('co', 'coordinator'), ('tl', 'caregiver')) x(k, r) join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'A') returning id into da;
  insert into public.department (org_id, name) values (org, 'B') returning id into db;
  insert into public.department (org_id, name) values (org2, 'X') returning id into dx;
  insert into t_ids values ('da', da), ('db', db), ('dx', dx);
  insert into public.department_staff (department_id, profile_id, role) values (da, (select v from t_ids where k = 'tl'), 'team_lead');
  update public.household set org_id = org where id in (hh, hh2);
  update public.stay set department_id = da where household_id = hh;
  update public.stay set department_id = db where household_id = hh2;
  insert into public.care_assignment (stay_id, profile_id) select id, (select v from t_ids where k = 'c1') from public.stay where household_id = hh;
  insert into public.care_assignment (stay_id, profile_id) select id, (select v from t_ids where k = 'c1') from public.stay where household_id = hh2;
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
-- Vandaag in Brussel, en dezelfde dag een week later (zelfde weekdag)
create function pg_temp.vandaag() returns date language sql stable as $$ select (now() at time zone 'Europe/Brussels')::date $$;
create function pg_temp.dag(hh text) returns bigint language sql as $$ select count(*) from public.dag_van_bewoner(pg_temp.id(hh)) $$;

set local role authenticated;

-- 1. Beheren
select pg_temp.als('co');
insert into public.afdeling_dag (org_id, department_id, titel, soort, emoji, begint, eindigt)
values (pg_temp.id('org'), null, 'Middagmaal', 'maaltijd', '🍽️', '12:00', '13:00');
insert into public.afdeling_dag (org_id, department_id, titel, soort, begint)
values (pg_temp.id('org'), pg_temp.id('da'), 'Koffie op A', 'maaltijd', '15:00');
insert into public.afdeling_dag (org_id, department_id, titel, soort, begint)
values (pg_temp.id('org'), pg_temp.id('db'), 'Koffie op B', 'maaltijd', '15:30');
-- Op geen enkele dag (een lege lijst kan niet), dus een dag die vandaag niet is
insert into public.afdeling_dag (org_id, department_id, titel, begint, dagen)
values (pg_temp.id('org'), pg_temp.id('da'), 'Niet vandaag', '10:00',
        array[((extract(isodow from pg_temp.vandaag())::int % 7) + 1)]::smallint[]);
insert into public.activity (org_id, department_id, titel, starts_at)
values (pg_temp.id('org'), pg_temp.id('da'), 'Samen zingen', (pg_temp.vandaag() + time '14:00') at time zone 'Europe/Brussels');
insert into public.activity (org_id, department_id, titel, starts_at)
values (pg_temp.id('org'), null, 'Morgen', (pg_temp.vandaag() + 1 + time '14:00') at time zone 'Europe/Brussels');
select pg_temp.gelijk('coördinator plant de dag', (select count(*) from public.afdeling_dag), 4::bigint);

select pg_temp.geweigerd('geen afdeling van een ander huis',
  format('insert into public.afdeling_dag (org_id, department_id, titel, begint) values (%L::uuid, %L::uuid, ''x'', ''09:00'')', pg_temp.id('org'), pg_temp.id('dx')));
select pg_temp.geweigerd('ook een activiteit niet',
  format('insert into public.activity (org_id, department_id, titel, starts_at) values (%L::uuid, %L::uuid, ''x'', now())', pg_temp.id('org'), pg_temp.id('dx')));
select pg_temp.geweigerd('geen onbestaande weekdag',
  format('insert into public.afdeling_dag (org_id, titel, begint, dagen) values (%L::uuid, ''x'', ''09:00'', ''{8}'')', pg_temp.id('org')));
select pg_temp.geweigerd('einde na begin',
  format('insert into public.afdeling_dag (org_id, titel, begint, eindigt) values (%L::uuid, ''x'', ''09:00'', ''08:00'')', pg_temp.id('org')));
update public.afdeling_dag set org_id = pg_temp.id('org2') where titel = 'Middagmaal';
select pg_temp.gelijk('org_id ligt vast', (select org_id from public.afdeling_dag where titel = 'Middagmaal'), pg_temp.id('org'));

select pg_temp.gelijk('created_by is wie het schreef', (select created_by from public.afdeling_dag where titel = 'Middagmaal'), pg_temp.id('co'));

select pg_temp.als('tl');
insert into public.afdeling_dag (org_id, department_id, titel, begint) values (pg_temp.id('org'), pg_temp.id('da'), 'Wandelen op A', '16:00');
select pg_temp.geweigerd('team lead plant niet voor een andere afdeling',
  format('insert into public.afdeling_dag (org_id, department_id, titel, begint) values (%L::uuid, %L::uuid, ''x'', ''09:00'')', pg_temp.id('org'), pg_temp.id('db')));
select pg_temp.geweigerd('team lead plant niet voor het hele huis',
  format('insert into public.afdeling_dag (org_id, titel, begint) values (%L::uuid, ''x'', ''09:00'')', pg_temp.id('org')));
update public.afdeling_dag set titel = 'gekaapt' where titel = 'Middagmaal';
select pg_temp.gelijk('en past het hele huis niet aan', (select count(*) from public.afdeling_dag where titel = 'gekaapt'), 0::bigint);
delete from public.afdeling_dag where titel = 'Wandelen op A';

select pg_temp.als('c1');
select pg_temp.geweigerd('zorgkundige plant niet',
  format('insert into public.afdeling_dag (org_id, titel, begint) values (%L::uuid, ''x'', ''09:00'')', pg_temp.id('org')));
select pg_temp.gelijk('maar ziet de dag wel', (select count(*) from public.afdeling_dag), 4::bigint);
select pg_temp.als('fa');
select pg_temp.gelijk('familie leest de tabel niet rechtstreeks', (select count(*) from public.afdeling_dag), 0::bigint);
select pg_temp.geweigerd('en plant niets',
  format('insert into public.afdeling_dag (org_id, titel, begint) values (%L::uuid, ''x'', ''09:00'')', pg_temp.id('org')));

-- 2. De dag van één bewoner: hele huis + eigen afdeling + activiteit van vandaag
select pg_temp.als('tab');
select pg_temp.gelijk('de tablet ziet middagmaal, koffie op A en zingen', pg_temp.dag('hh'), 3::bigint);
select pg_temp.gelijk('niet de koffie van B',
  (select count(*) from public.dag_van_bewoner(pg_temp.id('hh')) where titel = 'Koffie op B'), 0::bigint);
select pg_temp.gelijk('tijd in Brussel',
  (select begint from public.dag_van_bewoner(pg_temp.id('hh')) where titel = 'Middagmaal'),
  (pg_temp.vandaag() + time '12:00') at time zone 'Europe/Brussels');
select pg_temp.gelijk('morgen telt morgen',
  (select count(*) from public.dag_van_bewoner(pg_temp.id('hh'), pg_temp.vandaag() + 1) where titel = 'Morgen'), 1::bigint);
select pg_temp.gelijk('de tablet ziet niet de dag van een ander', pg_temp.dag('hh2'), 0::bigint);
select pg_temp.als('fa');   select pg_temp.gelijk('de familie ziet de dag', pg_temp.dag('hh'), 3::bigint);
select pg_temp.als('fb');   select pg_temp.gelijk('familie van B ziet B', pg_temp.dag('hh2'), 2::bigint);
select pg_temp.gelijk('maar niet de dag van Rita', pg_temp.dag('hh'), 0::bigint);
select pg_temp.als('c1');   select pg_temp.gelijk('het zorgteam ziet de dag', pg_temp.dag('hh'), 3::bigint);
select pg_temp.als('c2');   select pg_temp.gelijk('niet-toegewezen medewerker niet', pg_temp.dag('hh'), 0::bigint);
select pg_temp.als('oa');   select pg_temp.gelijk('beheerder niet (J4)', pg_temp.dag('hh'), 0::bigint);
select pg_temp.als('x');    select pg_temp.gelijk('vreemde niet', pg_temp.dag('hh'), 0::bigint);
select pg_temp.gelijk('thuis zonder verblijf: leeg', pg_temp.dag('hh3'), 0::bigint);

select pg_temp.gelijk('geen dag van voor het verblijf',
  (select count(*) from public.dag_van_bewoner(pg_temp.id('hh'), pg_temp.vandaag() - 30)), 0::bigint);
select pg_temp.gelijk('niet ver vooruit',
  (select count(*) from public.dag_van_bewoner(pg_temp.id('hh'), pg_temp.vandaag() + 30)), 0::bigint);

-- 3. Aanwezigheid komt mee, en alleen het team duidt ze aan
select pg_temp.als('fa');
select pg_temp.geweigerd('familie vult zelf geen "was erbij" in',
  format('insert into public.activity_participant (activity_id, household_id, status) select id, %L::uuid, ''aanwezig'' from public.activity where titel = ''Samen zingen''', pg_temp.id('hh')));
select pg_temp.als('c1');
insert into public.activity_participant (activity_id, household_id, status)
select id, pg_temp.id('hh'), 'ingeschreven' from public.activity where titel = 'Samen zingen';
update public.activity_participant set status = 'aanwezig' where household_id = pg_temp.id('hh');
select pg_temp.als('tab');
select pg_temp.gelijk('Rita was bij het zingen',
  (select deelname from public.dag_van_bewoner(pg_temp.id('hh')) where titel = 'Samen zingen'), 'aanwezig'::text);

-- 4. Uitgeschakeld en na het verblijf
select pg_temp.als('co');
update public.afdeling_dag set actief = false where titel = 'Koffie op A';
select pg_temp.als('tab');
select pg_temp.gelijk('uitgeschakeld staat er niet op', pg_temp.dag('hh'), 2::bigint);
reset role;
update public.stay set ended_at = now() where household_id = pg_temp.id('hh');
set local role authenticated;
select pg_temp.als('fa');
select pg_temp.gelijk('na het verblijf niets meer', pg_temp.dag('hh'), 0::bigint);

-- 5. Anoniem
reset role;
set local role anon;
select pg_temp.geweigerd('anoniem leest de tabel niet', 'select count(*) from public.afdeling_dag');
select pg_temp.geweigerd('anoniem roept de functie niet aan', format('select * from public.dag_van_bewoner(%L::uuid)', pg_temp.id('hh')));

rollback;
