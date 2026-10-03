-- =====================================================================
--  Medewerkers beheren (VEREIST_MIGRATIE 70)
--  Deel 1 faalt zonder 70: een team lead of toegewezen medewerker die
--  beheerder werd, hield toegang tot de inhoud.
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid; d uuid;
begin
  insert into auth.users (email) select m from unnest(array['m-oa@t', 'm-tl@t', 'm-c1@t', 'm-c2@t', 'm-fa@t']) m;
  insert into t_ids select replace(replace(email, 'm-', ''), '@t', ''), id from auth.users where email like 'm-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values (hh, (select v from t_ids where k = 'fa'), 'admin');
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('oa', 'org_admin'), ('tl', 'caregiver'), ('c1', 'caregiver'), ('c2', 'caregiver')) x(k, r)
  join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'A') returning id into d;
  insert into public.department_staff (department_id, profile_id, role) values (d, (select v from t_ids where k = 'tl'), 'team_lead');
  update public.household set org_id = org where id = hh;
  update public.stay set department_id = d where household_id = hh;
  insert into public.care_assignment (stay_id, profile_id)
  select id, (select v from t_ids where k = 'c1') from public.stay where household_id = hh;
  insert into public.org_invitation (org_id, email, role, token) values (org, 'nieuw@t', 'caregiver', 'tok-70');
  insert into t_ids select 'inv', id from public.org_invitation where token = 'tok-70';
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

-- Vooraf: team lead en toegewezen medewerker hebben toegang
select pg_temp.als('tl');  select pg_temp.gelijk('team lead heeft toegang', public.toegewezen(pg_temp.id('hh')), true);
select pg_temp.als('c1');  select pg_temp.gelijk('toegewezen heeft toegang', public.toegewezen(pg_temp.id('hh')), true);

-- 1. Beheerder worden: toegang weg
select pg_temp.als('oa');
update public.org_membership set role = 'org_admin' where profile_id = pg_temp.id('tl') and org_id = pg_temp.id('org');
update public.org_membership set role = 'org_admin' where profile_id = pg_temp.id('c1') and org_id = pg_temp.id('org');
select pg_temp.als('tl');  select pg_temp.gelijk('team lead die beheerder werd: geen toegang meer', public.toegewezen(pg_temp.id('hh')), false);
select pg_temp.als('c1');  select pg_temp.gelijk('toegewezene die beheerder werd: geen toegang meer', public.toegewezen(pg_temp.id('hh')), false);
select pg_temp.als('c1');  select pg_temp.gelijk('als beheerder mag hij wel toewijzen, zonder inhoud', public.mag_toewijzen(pg_temp.id('hh')), true);

-- Een beheerder die zijn oude toewijzing zelf heropent, krijgt geen toegang
select pg_temp.als('tl');
update public.care_assignment set valid_until = null where profile_id = pg_temp.id('c1');
update public.department_staff set valid_until = null where profile_id = pg_temp.id('tl');
select pg_temp.gelijk('heropende afdelingsplaats geeft een beheerder geen toegang', public.toegewezen(pg_temp.id('hh')), false);
select pg_temp.gelijk('en geen team lead-recht', public.is_team_lead_van(pg_temp.id('org')), false);
select pg_temp.als('c1');
select pg_temp.gelijk('heropende toewijzing geeft een beheerder geen toegang', public.toegewezen(pg_temp.id('hh')), false);
reset role;
update public.care_assignment set valid_until = now() where profile_id = pg_temp.id('c1') and valid_until is null;
update public.department_staff set valid_until = now() where profile_id = pg_temp.id('tl') and valid_until is null;
set local role authenticated;

-- Terug medewerker: de toegang komt niet vanzelf terug
select pg_temp.als('oa');
update public.org_membership set role = 'caregiver' where profile_id = pg_temp.id('c1') and org_id = pg_temp.id('org');
select pg_temp.als('c1');  select pg_temp.gelijk('terug medewerker: toewijzing blijft beëindigd', public.toegewezen(pg_temp.id('hh')), false);

-- 2. Uit dienst: afdeling en toewijzingen eindigen
reset role;
insert into public.care_assignment (stay_id, profile_id)
select id, pg_temp.id('c2') from public.stay where household_id = pg_temp.id('hh');
set local role authenticated;
select pg_temp.als('oa');
update public.org_membership set active = false where profile_id = pg_temp.id('c2') and org_id = pg_temp.id('org');
reset role;
select pg_temp.gelijk('uit dienst: geen lopende toewijzing meer',
  (select count(*) from public.care_assignment where profile_id = pg_temp.id('c2') and valid_until is null), 0::bigint);
select pg_temp.gelijk('met reden', (select reason from public.care_assignment where profile_id = pg_temp.id('c2')), 'uit dienst'::text);
set local role authenticated;

-- Jezelf aanpassen blijft onmogelijk (65)
select pg_temp.als('oa');
select pg_temp.geweigerd('beheerder zet zichzelf niet uit dienst',
  format('update public.org_membership set active = false where profile_id = %L::uuid', pg_temp.id('oa')));

-- 3. Uitnodigingen
select pg_temp.als('c2');
select pg_temp.geweigerd('medewerker trekt geen uitnodiging in', format('select public.trek_uitnodiging_in(%L::uuid)', pg_temp.id('inv')));
select pg_temp.als('fa');
select pg_temp.geweigerd('familie verlengt geen uitnodiging', format('select public.verleng_uitnodiging(%L::uuid)', pg_temp.id('inv')));
select pg_temp.als('oa');
reset role;
update public.org_invitation set expires_at = now() + interval '1 day' where id = pg_temp.id('inv');
set local role authenticated;
select pg_temp.als('oa');
select public.verleng_uitnodiging(pg_temp.id('inv'));
reset role;
select pg_temp.gelijk('verlengd tot 14 dagen',
  (select expires_at > now() + interval '13 days' from public.org_invitation where id = pg_temp.id('inv')), true);
set local role authenticated;
select pg_temp.als('oa');
select public.trek_uitnodiging_in(pg_temp.id('inv'));
reset role;
select pg_temp.gelijk('ingetrokken', (select revoked_at is not null from public.org_invitation where id = pg_temp.id('inv')), true);
set local role authenticated;
select pg_temp.als('oa');
select pg_temp.geweigerd('een ingetrokken uitnodiging verleng je niet', format('select public.verleng_uitnodiging(%L::uuid)', pg_temp.id('inv')));

rollback;
