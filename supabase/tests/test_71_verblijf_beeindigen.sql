-- =====================================================================
--  Het WZC beëindigt een verblijf (VEREIST_MIGRATIE 71)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid; org2 uuid; d uuid;
begin
  insert into auth.users (email) select m from unnest(array['v-oa@t', 'v-co@t', 'v-c1@t', 'v-fa@t', 'v-ander@t']) m;
  insert into t_ids select replace(replace(email, 'v-', ''), '@t', ''), id from auth.users where email like 'v-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values (hh, (select v from t_ids where k = 'fa'), 'admin');
  insert into public.organisation (name) values ('WZC Een') returning id into org;
  insert into public.organisation (name) values ('WZC Twee') returning id into org2;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('oa', 'org_admin'), ('co', 'coordinator'), ('c1', 'caregiver')) x(k, r)
  join t_ids using (k);
  insert into public.org_membership (org_id, profile_id, role) values (org2, (select v from t_ids where k = 'ander'), 'org_admin');
  insert into public.department (org_id, name) values (org, 'A') returning id into d;
  update public.household set org_id = org where id = hh;
  update public.stay set department_id = d where household_id = hh;
  insert into public.care_assignment (stay_id, profile_id)
  select id, (select v from t_ids where k = 'c1') from public.stay where household_id = hh;
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

select pg_temp.als('c1');
select pg_temp.geweigerd('zorgmedewerker beëindigt niet', format('select public.beeindig_verblijf(%L::uuid, ''verhuisd'')', pg_temp.id('hh')));
select pg_temp.als('ander');
select pg_temp.geweigerd('ander WZC beëindigt niet', format('select public.beeindig_verblijf(%L::uuid, ''verhuisd'')', pg_temp.id('hh')));
select pg_temp.als('fa');
select pg_temp.geweigerd('familie gebruikt hiervoor ontkoppelen', format('select public.beeindig_verblijf(%L::uuid, ''verhuisd'')', pg_temp.id('hh')));
select pg_temp.als('co');
select pg_temp.geweigerd('zonder geldige reden', format('select public.beeindig_verblijf(%L::uuid, ''zomaar'')', pg_temp.id('hh')));

select pg_temp.als('c1');
select pg_temp.gelijk('vooraf: het team heeft toegang', public.toegewezen(pg_temp.id('hh')), true);

select pg_temp.als('co');
select public.beeindig_verblijf(pg_temp.id('hh'), 'verhuisd');

select pg_temp.als('c1');
select pg_temp.gelijk('nadien: het team heeft geen toegang', public.toegewezen(pg_temp.id('hh')), false);
select pg_temp.als('co');
select pg_temp.gelijk('de bewoner staat niet meer in de lijst van het WZC',
  (select count(*) from public.org_bewoners(pg_temp.id('org'))), 0::bigint);
select pg_temp.geweigerd('twee keer beëindigen', format('select public.beeindig_verblijf(%L::uuid, ''verhuisd'')', pg_temp.id('hh')));

reset role;
select pg_temp.gelijk('reden en wie bij het verblijf',
  (select end_reason || '/' || (ended_by = pg_temp.id('co'))::text from public.stay where household_id = pg_temp.id('hh')), 'verhuisd/true'::text);
select pg_temp.gelijk('toewijzing beëindigd',
  (select count(*) from public.care_assignment where valid_until is null and profile_id = pg_temp.id('c1')), 0::bigint);
select pg_temp.gelijk('familie krijgt een melding zonder de reden',
  (select count(*) from public.notification where household_id = pg_temp.id('hh') and body like 'WZC Een heeft het verblijf afgesloten%' and body not like '%verhuisd%'), 1::bigint);
select pg_temp.gelijk('familie blijft beheerder', (select role::text from public.membership where profile_id = pg_temp.id('fa')), 'admin'::text);

-- Opnieuw koppelen blijft kunnen, door de familie
set local role authenticated;
select pg_temp.als('fa');
select public.link_household_to_org(pg_temp.id('hh'), pg_temp.id('org'));
reset role;
select pg_temp.gelijk('nieuw verblijf na opnieuw koppelen',
  (select count(*) from public.stay where household_id = pg_temp.id('hh') and ended_at is null), 1::bigint);

rollback;
