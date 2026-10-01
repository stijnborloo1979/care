-- =====================================================================
--  Verblijven en toewijzingen (VEREIST_MIGRATIE 52)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant select on t_ids to public;

do $$
declare
  hh uuid; org uuid; org2 uuid; dep uuid; st uuid;
  u_admin uuid := gen_random_uuid(); u_member uuid := gen_random_uuid();
  u_orgadmin uuid := gen_random_uuid(); u_staff uuid := gen_random_uuid();
  u_ander uuid := gen_random_uuid(); u_vreemd uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values
    (u_admin, 's-admin@t'), (u_member, 's-member@t'), (u_orgadmin, 's-orgadmin@t'),
    (u_staff, 's-staff@t'), (u_ander, 's-ander@t'), (u_vreemd, 's-vreemd@t');
  insert into public.household (person_name, timezone) values ('S', 'Europe/Brussels') returning id into hh;
  insert into public.membership (household_id, profile_id, role) values (hh, u_admin, 'admin'), (hh, u_member, 'member');
  insert into public.organisation (name) values ('WZC Een') returning id into org;
  insert into public.organisation (name) values ('WZC Twee') returning id into org2;
  insert into public.org_membership (org_id, profile_id, role) values
    (org, u_orgadmin, 'org_admin'), (org, u_staff, 'caregiver'), (org2, u_ander, 'org_admin');
  insert into public.department (org_id, name) values (org, 'Afdeling A') returning id into dep;
  insert into t_ids values ('hh', hh), ('org', org), ('org2', org2), ('dep', dep),
    ('u_staff', u_staff), ('u_admin', u_admin);
end $$;

create function pg_temp.als(mail text) returns void language plpgsql security definer set search_path = auth, public as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = mail), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t_ids where t_ids.k = id.k $$;
create function pg_temp.gelijk(wat text, kreeg bigint, verwacht bigint) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;

-- Koppelen opent een verblijf
update public.household set org_id = pg_temp.id('org'), org_linked_at = now() where id = pg_temp.id('hh');
select pg_temp.gelijk('koppelen opent één verblijf',
  (select count(*) from public.stay where household_id = pg_temp.id('hh') and ended_at is null), 1);

-- Toewijzing op dat verblijf (als server, zoals de latere RPC)
insert into public.care_assignment (stay_id, profile_id)
select id, pg_temp.id('u_staff') from public.stay where household_id = pg_temp.id('hh') and ended_at is null;

-- Zichtbaarheid
set local role authenticated;
select pg_temp.als('s-admin@t');
select pg_temp.gelijk('familiebeheerder ziet het verblijf', (select count(*) from public.stay), 1);
select pg_temp.als('s-member@t');
select pg_temp.gelijk('familielid ziet het verblijf niet', (select count(*) from public.stay), 0);
select pg_temp.als('s-orgadmin@t');
select pg_temp.gelijk('org admin ziet het verblijf', (select count(*) from public.stay), 1);
select pg_temp.gelijk('org admin ziet de afdeling', (select count(*) from public.department), 1);
select pg_temp.als('s-staff@t');
select pg_temp.gelijk('medewerker ziet eigen toewijzing', (select count(*) from public.care_assignment), 1);
select pg_temp.als('s-ander@t');
select pg_temp.gelijk('andere organisatie ziet niets', (select count(*) from public.stay) + (select count(*) from public.department), 0);
select pg_temp.als('s-vreemd@t');
select pg_temp.gelijk('vreemde ziet niets', (select count(*) from public.stay) + (select count(*) from public.care_assignment), 0);

-- Schrijven
do $$ begin
  perform pg_temp.als('s-member@t');
  begin
    insert into public.department (org_id, name) values (pg_temp.id('org'), 'Hack');
    raise exception 'GEZAKT: familielid kon een afdeling maken';
  exception when insufficient_privilege then raise notice 'ok: familielid kan geen afdeling maken'; end;
  begin
    insert into public.stay (household_id, org_id) values (pg_temp.id('hh'), pg_temp.id('org2'));
    raise exception 'GEZAKT: gebruiker kon zelf een verblijf maken';
  exception when insufficient_privilege then raise notice 'ok: niemand maakt rechtstreeks een verblijf'; end;
end $$;
reset role;

-- Loskoppelen sluit het verblijf en de toewijzing
update public.household set org_id = null where id = pg_temp.id('hh');
select pg_temp.gelijk('loskoppelen sluit het verblijf',
  (select count(*) from public.stay where household_id = pg_temp.id('hh') and ended_at is null), 0);
select pg_temp.gelijk('toewijzing eindigt mee',
  (select count(*) from public.care_assignment where valid_until is null), 0);

-- Naar een andere organisatie: één open verblijf, geschiedenis blijft
update public.household set org_id = pg_temp.id('org2') where id = pg_temp.id('hh');
select pg_temp.gelijk('nieuw verblijf bij WZC Twee',
  (select count(*) from public.stay where household_id = pg_temp.id('hh') and ended_at is null and org_id = pg_temp.id('org2')), 1);
select pg_temp.gelijk('geschiedenis: twee verblijven',
  (select count(*) from public.stay where household_id = pg_temp.id('hh')), 2);

-- De gegevens van de bewoner zijn na dit alles onaangeroerd
select pg_temp.gelijk('huishouden bestaat nog', (select count(*) from public.household where id = pg_temp.id('hh')), 1);

rollback;
