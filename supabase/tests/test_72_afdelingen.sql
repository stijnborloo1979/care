-- =====================================================================
--  Afdelingen hernoemen en archiveren (VEREIST_MIGRATIE 72)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid; d uuid; d2 uuid;
begin
  insert into auth.users (email) select m from unnest(array['a-oa@t', 'a-co@t', 'a-c1@t', 'a-fa@t']) m;
  insert into t_ids select replace(replace(email, 'a-', ''), '@t', ''), id from auth.users where email like 'a-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values (hh, (select v from t_ids where k = 'fa'), 'admin');
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('oa', 'org_admin'), ('co', 'coordinator'), ('c1', 'caregiver')) x(k, r)
  join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'A') returning id into d;
  insert into public.department (org_id, name) values (org, 'B') returning id into d2;
  insert into t_ids values ('d', d), ('d2', d2);
  insert into public.department_staff (department_id, profile_id, role) values (d2, (select v from t_ids where k = 'c1'), 'team_lead');
  update public.household set org_id = org where id = hh;
  update public.stay set department_id = d where household_id = hh;
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

set local role authenticated;

-- Hernoemen: alleen de beheerder
select pg_temp.als('oa');
update public.department set name = 'Gelijkvloers' where id = pg_temp.id('d');
select pg_temp.gelijk('beheerder hernoemt', (select name from public.department where id = pg_temp.id('d')), 'Gelijkvloers'::text);
select pg_temp.als('co');
update public.department set name = 'X' where id = pg_temp.id('d');
select pg_temp.gelijk('coördinator hernoemt niet', (select name from public.department where id = pg_temp.id('d')), 'Gelijkvloers'::text);

-- Archiveren
select pg_temp.als('co');
select pg_temp.geweigerd('coördinator archiveert niet', format('select public.archiveer_afdeling(%L::uuid)', pg_temp.id('d2')));
select pg_temp.als('oa');
select pg_temp.geweigerd('niet met een bewoner erop', format('select public.archiveer_afdeling(%L::uuid)', pg_temp.id('d')));
select public.archiveer_afdeling(pg_temp.id('d2'));
select pg_temp.gelijk('gearchiveerd', (select archived_at is not null from public.department where id = pg_temp.id('d2')), true);
reset role;
select pg_temp.gelijk('team lead verliest zijn plaats',
  (select count(*) from public.department_staff where department_id = pg_temp.id('d2') and valid_until is null), 0::bigint);
set local role authenticated;

-- Op een gearchiveerde afdeling verblijft of werkt niemand
select pg_temp.als('oa');
select pg_temp.geweigerd('geen bewoner naar een gearchiveerde afdeling',
  format('select public.zet_verblijf(%L::uuid, %L::uuid, ''1'')', pg_temp.id('hh'), pg_temp.id('d2')));
select pg_temp.geweigerd('geen medewerker op een gearchiveerde afdeling',
  format('insert into public.department_staff (department_id, profile_id, role) values (%L::uuid, %L::uuid, ''staff'')', pg_temp.id('d2'), pg_temp.id('c1')));

-- Terugzetten
select public.herstel_afdeling(pg_temp.id('d2'));
select public.zet_verblijf(pg_temp.id('hh'), pg_temp.id('d2'), '7');
reset role;
select pg_temp.gelijk('na terugzetten kan het weer', (select department_id from public.stay where household_id = pg_temp.id('hh') and ended_at is null), pg_temp.id('d2'));

rollback;
