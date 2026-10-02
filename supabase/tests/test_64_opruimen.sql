-- =====================================================================
--  Opruimen en zorgteam (VEREIST_MIGRATIE 64)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid; d uuid;
begin
  insert into auth.users (email) select m from unnest(array['o-oa@t', 'o-co@t', 'o-s@t', 'o-tl@t', 'o-fa@t', 'o-fm@t', 'o-x@t', 'o-r@t']) m;
  insert into t_ids select replace(replace(email, 'o-', ''), '@t', ''), id from auth.users where email like 'o-%@t';
  update public.profile set full_name = 'Tom Maes' where id = (select v from t_ids where k = 's');
  update public.profile set full_name = 'Lies Peeters' where id = (select v from t_ids where k = 'tl');
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'), (hh, (select v from t_ids where k = 'fm'), 'member');
  insert into public.person_card (household_id, profile_id, name, relation, kind) values (hh, (select v from t_ids where k = 'r'), 'Rita', 'jij', 'self');
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('oa', 'org_admin'), ('co', 'coordinator'), ('s', 'caregiver'), ('tl', 'coordinator')) x(k, r)
  join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'A') returning id into d;
  insert into public.department_staff (department_id, profile_id, role) values (d, (select v from t_ids where k = 'tl'), 'team_lead');
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
create function pg_temp.lidmaatschappen() returns bigint language sql security definer as $$
  select count(*) from public.membership where household_id = pg_temp.id('hh') and role = 'caregiver'
$$;
create function pg_temp.toewijzingen() returns bigint language sql security definer as $$
  select count(*) from public.care_assignment ca join public.stay s on s.id = ca.stay_id
   where s.household_id = pg_temp.id('hh') and (ca.valid_until is null or ca.valid_until > now())
$$;

select pg_temp.gelijk('org_oversees bestaat niet meer', to_regprocedure('public.org_oversees(uuid)') is null, true);

set local role authenticated;
-- assign_caregiver maakt nu een toewijzing, geen lidmaatschap meer
select pg_temp.als('co');
select public.assign_caregiver(pg_temp.id('hh'), pg_temp.id('s'));
select pg_temp.gelijk('assign_caregiver: een toewijzing', pg_temp.toewijzingen(), 1::bigint);
select pg_temp.gelijk('assign_caregiver: geen lidmaatschap meer', pg_temp.lidmaatschappen(), 0::bigint);
select pg_temp.als('s');
select pg_temp.geweigerd('een zorgmedewerker wijst niemand toe', format('select public.assign_caregiver(%L::uuid, %L::uuid)', pg_temp.id('hh'), pg_temp.id('s')));
select pg_temp.als('x');
select pg_temp.geweigerd('een vreemde wijst niemand toe', format('select public.assign_caregiver(%L::uuid, %L::uuid)', pg_temp.id('hh'), pg_temp.id('s')));

-- Zorgteam: familie en bewoner zien wie volgt
select pg_temp.als('fm');
select pg_temp.gelijk('familie ziet het zorgteam', (select string_agg(naam || ':' || rol, ', ') from public.zorgteam(pg_temp.id('hh'))), 'Tom Maes:toegewezen, Lies Peeters:team lead');
select pg_temp.als('r');
select pg_temp.gelijk('de bewoner ook', (select count(*) from public.zorgteam(pg_temp.id('hh'))), 2::bigint);
select pg_temp.als('x');
select pg_temp.gelijk('een vreemde niet', (select count(*) from public.zorgteam(pg_temp.id('hh'))), 0::bigint);
select pg_temp.als('s');
select pg_temp.gelijk('de medewerker zelf niet (hij heeft zijn eigen scherm)', (select count(*) from public.zorgteam(pg_temp.id('hh'))), 0::bigint);

-- unassign_caregiver stopt de toewijzing
select pg_temp.als('co');
select public.unassign_caregiver(pg_temp.id('hh'), pg_temp.id('s'));
select pg_temp.gelijk('unassign_caregiver: toewijzing gestopt', pg_temp.toewijzingen(), 0::bigint);
select pg_temp.als('fm');
select pg_temp.gelijk('zorgteam na het stoppen: alleen de team lead', (select string_agg(naam, ',') from public.zorgteam(pg_temp.id('hh'))), 'Lies Peeters');
select pg_temp.geweigerd('een familielid (geen beheerder) stopt niets', format('select public.unassign_caregiver(%L::uuid, %L::uuid)', pg_temp.id('hh'), pg_temp.id('s')));

-- De familiebeheerder kan nog altijd een zorgverlener-lid weghalen (zoals in 03)
reset role;
insert into public.membership (household_id, profile_id, role) values (pg_temp.id('hh'), pg_temp.id('x'), 'caregiver');
set local role authenticated;
select pg_temp.als('fa');
select public.unassign_caregiver(pg_temp.id('hh'), pg_temp.id('x'));
select pg_temp.gelijk('familiebeheerder haalt een zorgverlener-lid weg', pg_temp.lidmaatschappen(), 0::bigint);
reset role;

rollback;
