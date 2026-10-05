-- =====================================================================
--  Kamers en bezetting (VEREIST_MIGRATIE 82)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid; org2 uuid; da uuid; dx uuid;
begin
  insert into auth.users (email) select m from unnest(array['k-oa@t', 'k-co@t', 'k-c1@t', 'k-fa@t', 'k-ander@t']) m;
  insert into t_ids select replace(replace(email, 'k-', ''), '@t', ''), id from auth.users where email like 'k-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values (hh, (select v from t_ids where k = 'fa'), 'admin');
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into public.organisation (name) values ('Ander') returning id into org2;
  insert into t_ids values ('org', org), ('org2', org2);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('oa', 'org_admin'), ('co', 'coordinator'), ('c1', 'caregiver')) x(k, r) join t_ids using (k);
  insert into public.org_membership (org_id, profile_id, role) values (org2, (select v from t_ids where k = 'ander'), 'org_admin');
  insert into public.department (org_id, name) values (org, 'A') returning id into da;
  insert into public.department (org_id, name) values (org2, 'X') returning id into dx;
  insert into t_ids values ('da', da), ('dx', dx);
  update public.household set org_id = org where id = hh;
  update public.stay set department_id = da, room = '12' where household_id = hh;
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
create function pg_temp.kamers() returns bigint language sql as $$ select count(*) from public.kamer $$;
create function pg_temp.bezet() returns bigint language sql as $$ select count(*) from public.bezetting(pg_temp.id('org')) $$;

set local role authenticated;

select pg_temp.als('co');
insert into public.kamer (org_id, department_id, naam, bedden) values (pg_temp.id('org'), pg_temp.id('da'), ' 12 ', 1), (pg_temp.id('org'), pg_temp.id('da'), '14', 2);
select pg_temp.gelijk('coördinator maakt kamers', pg_temp.kamers(), 2::bigint);
select pg_temp.gelijk('naam zonder spaties', (select count(*) from public.kamer where naam = '12'), 1::bigint);
select pg_temp.geweigerd('geen dubbele kamer op een afdeling',
  format('insert into public.kamer (org_id, department_id, naam) values (%L::uuid, %L::uuid, ''14'')', pg_temp.id('org'), pg_temp.id('da')));
select pg_temp.geweigerd('geen afdeling van een ander huis',
  format('insert into public.kamer (org_id, department_id, naam) values (%L::uuid, %L::uuid, ''1'')', pg_temp.id('org'), pg_temp.id('dx')));
select pg_temp.geweigerd('hoogstens 4 bedden',
  format('insert into public.kamer (org_id, department_id, naam, bedden) values (%L::uuid, %L::uuid, ''9'', 6)', pg_temp.id('org'), pg_temp.id('da')));
update public.kamer set org_id = pg_temp.id('org2') where naam = '14';
select pg_temp.gelijk('org_id ligt vast', (select org_id from public.kamer where naam = '14'), pg_temp.id('org'));

select pg_temp.als('c1');
select pg_temp.gelijk('zorgkundige ziet de kamers', pg_temp.kamers(), 2::bigint);
select pg_temp.geweigerd('maar maakt er geen',
  format('insert into public.kamer (org_id, department_id, naam) values (%L::uuid, %L::uuid, ''1'')', pg_temp.id('org'), pg_temp.id('da')));
select pg_temp.gelijk('en ziet de bezetting', pg_temp.bezet(), 1::bigint);
select pg_temp.gelijk('met de afdeling als id', (select department_id from public.bezetting(pg_temp.id('org'))), pg_temp.id('da'));

select pg_temp.als('oa');   select pg_temp.gelijk('beheerder ziet de bezetting', pg_temp.bezet(), 1::bigint);
select pg_temp.als('fa');   select pg_temp.gelijk('familie ziet geen kamers', pg_temp.kamers(), 0::bigint);
select pg_temp.gelijk('en geen bezetting', pg_temp.bezet(), 0::bigint);
select pg_temp.als('ander'); select pg_temp.gelijk('ander huis ziet niets', pg_temp.kamers() + pg_temp.bezet(), 0::bigint);

reset role;
set local role anon;
select pg_temp.geweigerd('anoniem niet', 'select count(*) from public.kamer');

rollback;
