-- =====================================================================
--  Nieuws van het woonzorgcentrum (VEREIST_MIGRATIE 79)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; hh2 uuid; org uuid; org2 uuid; da uuid; db uuid; dx uuid;
begin
  insert into auth.users (email) select m from unnest(array['n-fa@t', 'n-tab@t', 'n-fb@t', 'n-c1@t', 'n-tl@t', 'n-oa@t', 'n-co@t', 'n-x@t', 'n-ander@t']) m;
  insert into t_ids select replace(replace(email, 'n-', ''), '@t', ''), id from auth.users where email like 'n-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into public.household (person_name) values ('Jos') returning id into hh2;
  insert into t_ids values ('hh', hh), ('hh2', hh2);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'tab'), 'person'),
    (hh2, (select v from t_ids where k = 'fb'), 'admin');
  insert into public.organisation (name) values ('WZC Zonnehof') returning id into org;
  insert into public.organisation (name) values ('Ander') returning id into org2;
  insert into t_ids values ('org', org), ('org2', org2);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('c1', 'caregiver'), ('tl', 'caregiver'), ('oa', 'org_admin'), ('co', 'coordinator')) x(k, r) join t_ids using (k);
  insert into public.org_membership (org_id, profile_id, role) values (org2, (select v from t_ids where k = 'ander'), 'org_admin');
  insert into public.department (org_id, name) values (org, 'Linde') returning id into da;
  insert into public.department (org_id, name) values (org, 'Eik') returning id into db;
  insert into public.department (org_id, name) values (org2, 'X') returning id into dx;
  insert into t_ids values ('da', da), ('db', db), ('dx', dx);
  insert into public.department_staff (department_id, profile_id, role) values (da, (select v from t_ids where k = 'tl'), 'team_lead');
  update public.household set org_id = org where id in (hh, hh2);
  update public.stay set department_id = da where household_id = hh;
  update public.stay set department_id = db where household_id = hh2;
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
create function pg_temp.aantal() returns bigint language sql as $$ select count(*) from public.org_nieuws $$;
create function pg_temp.voor(hh text) returns bigint language sql as $$ select count(*) from public.nieuws_voor(pg_temp.id(hh)) $$;
create function pg_temp.schrijf(org text, dep text, titel text) returns text language sql as $$
  select format('insert into public.org_nieuws (org_id, department_id, titel, tekst) values (%L::uuid, %L::uuid, %L, ''tekst'')',
                pg_temp.id(org), pg_temp.id(dep), titel) $$;

set local role authenticated;

-- 1. Schrijven
select pg_temp.als('co');
insert into public.org_nieuws (org_id, titel, tekst) values (pg_temp.id('org'), 'Zomerfeest', 'Zaterdag om 14 uur in de tuin.');
select pg_temp.als('oa');
insert into public.org_nieuws (org_id, department_id, titel, tekst) values (pg_temp.id('org'), pg_temp.id('db'), 'Eik: nieuwe kapster', 'Vanaf maandag.');
select pg_temp.als('tl');
insert into public.org_nieuws (org_id, department_id, titel, tekst) values (pg_temp.id('org'), pg_temp.id('da'), 'Linde: uitstap', 'Naar de markt.');
select pg_temp.geweigerd('team lead niet aan iedereen', pg_temp.schrijf('org', 'onbekend', 'x'));
select pg_temp.geweigerd('team lead niet aan een andere afdeling', pg_temp.schrijf('org', 'db', 'x'));
select pg_temp.als('c1');
select pg_temp.geweigerd('zorgkundige schrijft geen nieuws', pg_temp.schrijf('org', 'onbekend', 'x'));
select pg_temp.als('fa');
select pg_temp.geweigerd('familie schrijft geen nieuws', pg_temp.schrijf('org', 'onbekend', 'x'));
select pg_temp.als('ander');
select pg_temp.geweigerd('beheerder van een ander huis niet', pg_temp.schrijf('org', 'onbekend', 'x'));
select pg_temp.als('co');
select pg_temp.geweigerd('geen afdeling van een ander huis', pg_temp.schrijf('org', 'dx', 'x'));
select pg_temp.geweigerd('niet in naam van een ander',
  format('insert into public.org_nieuws (org_id, titel, tekst, author_id) values (%L::uuid, ''x'', ''y'', %L::uuid)', pg_temp.id('org'), pg_temp.id('oa')));
select pg_temp.geweigerd('niet aan te passen', 'update public.org_nieuws set titel = ''ander'' ');
insert into public.org_nieuws (org_id, titel, tekst, created_at) values (pg_temp.id('org'), 'Toekomst', 'x', now() + interval '10 years');
select pg_temp.gelijk('de tijd komt van de server', (select created_at <= now() from public.org_nieuws where titel = 'Toekomst'), true);
delete from public.org_nieuws where titel = 'Toekomst';

-- 2. Lezen
select pg_temp.als('fa');   select pg_temp.gelijk('familie op Linde: alles + Linde', pg_temp.aantal(), 2::bigint);
select pg_temp.gelijk('nieuws_voor geeft hetzelfde', pg_temp.voor('hh'), 2::bigint);
select pg_temp.gelijk('afzender in woorden', (select van from public.nieuws_voor(pg_temp.id('hh')) where titel = 'Zomerfeest'), 'WZC Zonnehof'::text);
select pg_temp.gelijk('afdeling erbij', (select afdeling from public.nieuws_voor(pg_temp.id('hh')) where titel like 'Linde%'), 'Linde'::text);
select pg_temp.gelijk('niet het nieuws van een ander huishouden', pg_temp.voor('hh2'), 0::bigint);
select pg_temp.als('tab');  select pg_temp.gelijk('de bewoner ziet het ook', pg_temp.voor('hh'), 2::bigint);
select pg_temp.als('fb');   select pg_temp.gelijk('familie op Eik: alles + Eik', pg_temp.aantal(), 2::bigint);
select pg_temp.als('c1');   select pg_temp.gelijk('medewerkers zien alles', pg_temp.aantal(), 3::bigint);
select pg_temp.gelijk('maar nieuws_voor alleen met een band', pg_temp.voor('hh'), 0::bigint);
select pg_temp.als('x');    select pg_temp.gelijk('vreemde ziet niets', pg_temp.aantal(), 0::bigint);
select pg_temp.als('ander'); select pg_temp.gelijk('ander huis ziet niets', pg_temp.aantal(), 0::bigint);

-- 3. Wissen
select pg_temp.als('c1');
delete from public.org_nieuws;
select pg_temp.gelijk('zorgkundige wist niets', (select count(*) from public.org_nieuws), 3::bigint);
select pg_temp.als('tl');
delete from public.org_nieuws where titel = 'Zomerfeest';
select pg_temp.als('co');
select pg_temp.gelijk('team lead wist niet wat een ander schreef', pg_temp.aantal(), 3::bigint);
select pg_temp.als('oa');
delete from public.org_nieuws where titel = 'Zomerfeest';
select pg_temp.gelijk('org admin wist wel', pg_temp.aantal(), 2::bigint);

-- 4. Na het verblijf en na 180 dagen
reset role;
update public.stay set ended_at = now() where household_id = pg_temp.id('hh');
set local role authenticated;
select pg_temp.als('fa');
select pg_temp.gelijk('na het verblijf geen nieuws meer', pg_temp.aantal(), 0::bigint);
reset role;
update public.org_nieuws set created_at = now() - interval '200 days' where titel like 'Eik%';
select pg_temp.gelijk('opruimen na 180 dagen', public.nieuws_opruimen(), 1);

-- 5. Anoniem
set local role anon;
select pg_temp.geweigerd('anoniem leest niet', 'select count(*) from public.org_nieuws');

rollback;
