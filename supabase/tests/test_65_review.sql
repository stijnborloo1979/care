-- =====================================================================
--  Herstellingen na de review (VEREIST_MIGRATIE 65)
--  Elk geval faalde vóór 65 (zie het rapport van de review).
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;
create temp table t_code (v text);
grant all on t_code to public;

do $$
declare hh uuid; hh2 uuid; org uuid; d uuid;
begin
  insert into auth.users (email) select m from unnest(array['v-oa@t', 'v-tl@t', 'v-s@t', 'v-s2@t', 'v-fa@t', 'v-x@t']) m;
  insert into t_ids select replace(replace(email, 'v-', ''), '@t', ''), id from auth.users where email like 'v-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into public.household (person_name) values ('Jos') returning id into hh2;
  insert into t_ids values ('hh', hh), ('hh2', hh2);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'), (hh2, (select v from t_ids where k = 'x'), 'admin');
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('oa', 'org_admin'), ('tl', 'coordinator'), ('s', 'caregiver'), ('s2', 'caregiver')) x(k, r)
  join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'A') returning id into d;
  insert into t_ids values ('dep', d);
  insert into public.department_staff (department_id, profile_id, role) values (d, (select v from t_ids where k = 'tl'), 'team_lead');
  update public.household set org_id = org where id = hh;
  update public.stay set department_id = d where household_id = hh;
  insert into public.care_assignment (stay_id, profile_id) select id, (select v from t_ids where k = 's') from public.stay where household_id = hh;
end $$;

insert into t_code select koppelcode from public.organisation where name = 'WZC';

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

-- 1. De org admin maakt zichzelf geen team lead, en ziet dus niets
select pg_temp.als('oa');
select pg_temp.geweigerd('org admin zet zichzelf op een afdeling',
  format('insert into public.department_staff (department_id, profile_id, role) values (%L::uuid, %L::uuid, ''team_lead'')', pg_temp.id('dep'), pg_temp.id('oa')));
select pg_temp.gelijk('org admin blijft zonder toegang', public.toegewezen(pg_temp.id('hh')), false);
select pg_temp.geweigerd('org admin maakt zichzelf geen coördinator',
  format('update public.org_membership set role = ''coordinator'' where profile_id = %L::uuid', pg_temp.id('oa')));
select pg_temp.geweigerd('geen familielid of vreemde op een afdeling',
  format('insert into public.department_staff (department_id, profile_id, role) values (%L::uuid, %L::uuid, ''staff'')', pg_temp.id('dep'), pg_temp.id('fa')));
-- Een medewerker op een afdeling zetten blijft gewoon werken
insert into public.department_staff (department_id, profile_id, role) values (pg_temp.id('dep'), pg_temp.id('s2'), 'staff');
select pg_temp.gelijk('een zorgmedewerker op de afdeling zetten werkt', (select count(*) from public.department_staff where profile_id = pg_temp.id('s2')), 1::bigint);
-- Een andere medewerker zijn rol aanpassen mag de beheerder nog wel
update public.org_membership set role = 'coordinator' where profile_id = pg_temp.id('s2');
reset role;
select pg_temp.gelijk('beheerder past de rol van een ander aan', (select role::text from public.org_membership where profile_id = pg_temp.id('s2')), 'coordinator');

-- 2. Een team lead uit dienst wijst niemand meer toe
update public.org_membership set active = false where profile_id = pg_temp.id('tl');
set local role authenticated;
select pg_temp.als('tl');
select pg_temp.gelijk('team lead uit dienst: mag niet meer toewijzen', public.mag_toewijzen(pg_temp.id('hh')), false);
select pg_temp.geweigerd('team lead uit dienst: wijs_toe', format('select public.wijs_toe(%L::uuid, %L::uuid)', pg_temp.id('hh'), pg_temp.id('s2')));
reset role;
update public.org_membership set active = true where profile_id = pg_temp.id('tl');
set local role authenticated;
select pg_temp.als('tl');
select pg_temp.gelijk('weer in dienst: mag weer', public.mag_toewijzen(pg_temp.id('hh')), true);

-- 3. De koppelcode is niet rechtstreeks leesbaar of aanpasbaar
select pg_temp.als('s');
select pg_temp.geweigerd('zorgmedewerker leest de koppelcode niet', 'select koppelcode from public.organisation');
select pg_temp.gelijk('maar wel de naam', (select name from public.organisation where id = pg_temp.id('org')), 'WZC');
select pg_temp.als('oa');
select pg_temp.geweigerd('beheerder zet de koppelcode niet rechtstreeks',
  format('update public.organisation set koppelcode = ''AAAAAAAA'' where id = %L::uuid', pg_temp.id('org')));
select pg_temp.geweigerd('beheerder zet de bewaartermijn niet rechtstreeks',
  format('update public.organisation set bewaartermijn_maanden = 6 where id = %L::uuid', pg_temp.id('org')));
update public.organisation set name = 'WZC De Linde' where id = pg_temp.id('org');
select pg_temp.gelijk('de naam aanpassen kan nog', (select name from public.organisation where id = pg_temp.id('org')), 'WZC De Linde');
select pg_temp.gelijk('de code via de functie lezen kan nog', public.org_koppelcode(pg_temp.id('org')) ~ '^[A-Z2-9]{8}$', true);

-- 4. Raden wordt afgeremd
select pg_temp.als('x');
do $$ begin
  for i in 1..10 loop
    perform public.koppel_met_wzc((select v from t_ids where k = 'hh2'), 'FOUT' || i);
  end loop;
end $$;
reset role;
select pg_temp.gelijk('tien mislukte pogingen bewaard', (select count(*) from public.koppel_poging where profile_id = pg_temp.id('x')), 10::bigint);
set local role authenticated;
select pg_temp.als('x');
select pg_temp.geweigerd('de elfde poging binnen het uur, zelfs met de juiste code',
  format('select public.koppel_met_wzc(%L::uuid, %L)', pg_temp.id('hh2'), (select v from t_code)));
reset role;
select pg_temp.gelijk('Jos is niet gekoppeld', (select org_id from public.household where id = pg_temp.id('hh2')), null::uuid);
update public.koppel_poging set at = now() - interval '2 hours';
set local role authenticated;
select pg_temp.als('x');
select pg_temp.gelijk('na een uur werkt de juiste code', public.koppel_met_wzc(pg_temp.id('hh2'), (select v from t_code)), 'WZC De Linde');
reset role;

rollback;
