-- =====================================================================
--  Het bezoekboek (VEREIST_MIGRATIE 74)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; hh2 uuid; org uuid; d uuid;
begin
  insert into auth.users (email) select m from unnest(array['b-fa@t', 'b-lid@t', 'b-tab@t', 'b-c1@t', 'b-c2@t', 'b-oa@t', 'b-x@t']) m;
  insert into t_ids select replace(replace(email, 'b-', ''), '@t', ''), id from auth.users where email like 'b-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into public.household (person_name) values ('Jos') returning id into hh2;
  insert into t_ids values ('hh', hh), ('hh2', hh2);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'lid'), 'member'),
    (hh, (select v from t_ids where k = 'tab'), 'person'),
    (hh2, (select v from t_ids where k = 'x'), 'admin');
  insert into public.person_card (household_id, name, relation, kind) values (hh, 'Els', 'Dochter', 'family');
  insert into t_ids select 'els', id from public.person_card where household_id = hh and name = 'Els';
  insert into public.person_card (household_id, name, relation, kind) values (hh2, 'Piet', 'Zoon', 'family');
  insert into t_ids select 'piet', id from public.person_card where household_id = hh2 and name = 'Piet';
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('c1', 'caregiver'), ('c2', 'caregiver'), ('oa', 'org_admin')) x(k, r) join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'A') returning id into d;
  update public.household set org_id = org where id = hh;
  update public.stay set department_id = d where household_id = hh;
  insert into public.care_assignment (stay_id, profile_id) select id, (select v from t_ids where k = 'c1') from public.stay where household_id = hh;
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
create function pg_temp.aantal() returns bigint language sql as $$ select count(*) from public.visit_log $$;

set local role authenticated;

-- 1. Vastleggen
select pg_temp.als('lid');
insert into public.visit_log (household_id, visitor_name, visitor_card, note)
values (pg_temp.id('hh'), 'Els', pg_temp.id('els'), 'Samen koffie gedronken.');
select pg_temp.gelijk('familielid legt een bezoek vast', pg_temp.aantal(), 1::bigint);
select pg_temp.geweigerd('niet in naam van een ander',
  format('insert into public.visit_log (household_id, visitor_name, author_id) values (%L::uuid, ''x'', %L::uuid)', pg_temp.id('hh'), pg_temp.id('fa')));
select pg_temp.geweigerd('niet in de toekomst',
  format('insert into public.visit_log (household_id, visitor_name, visited_at) values (%L::uuid, ''x'', now() + interval ''2 hours'')', pg_temp.id('hh')));
select pg_temp.geweigerd('niet ouder dan 14 dagen',
  format('insert into public.visit_log (household_id, visitor_name, visited_at) values (%L::uuid, ''x'', now() - interval ''20 days'')', pg_temp.id('hh')));
select pg_temp.geweigerd('geen kaart van een ander huishouden',
  format('insert into public.visit_log (household_id, visitor_name, visitor_card) values (%L::uuid, ''x'', %L::uuid)', pg_temp.id('hh'), pg_temp.id('piet')));
select pg_temp.geweigerd('geen foto buiten de eigen map',
  format('insert into public.visit_log (household_id, visitor_name, photo_path) values (%L::uuid, ''x'', %L)', pg_temp.id('hh'), pg_temp.id('hh2')::text || '/bezoek/a.jpg'));

select pg_temp.als('x');
select pg_temp.geweigerd('een vreemde legt niets vast',
  format('insert into public.visit_log (household_id, visitor_name) values (%L::uuid, ''x'')', pg_temp.id('hh')));
select pg_temp.als('tab');
select pg_temp.geweigerd('de tablet legt geen bezoek vast',
  format('insert into public.visit_log (household_id, visitor_name) values (%L::uuid, ''x'')', pg_temp.id('hh')));

-- Het zorgteam mag ook (kapster, vrijwilliger)
select pg_temp.als('c1');
insert into public.visit_log (household_id, visitor_name, note) values (pg_temp.id('hh'), 'De kapster', 'Haar geknipt.');
select pg_temp.als('c2');
select pg_temp.geweigerd('niet-toegewezen medewerker legt niets vast',
  format('insert into public.visit_log (household_id, visitor_name) values (%L::uuid, ''x'')', pg_temp.id('hh')));
select pg_temp.als('oa');
select pg_temp.geweigerd('beheerder legt niets vast (J4)',
  format('insert into public.visit_log (household_id, visitor_name) values (%L::uuid, ''x'')', pg_temp.id('hh')));

-- 2. Lezen
select pg_temp.als('tab');  select pg_temp.gelijk('de persoon ziet de bezoeken', pg_temp.aantal(), 2::bigint);
select pg_temp.als('fa');   select pg_temp.gelijk('de familie ziet ze', pg_temp.aantal(), 2::bigint);
select pg_temp.als('c1');   select pg_temp.gelijk('het zorgteam ziet ze', pg_temp.aantal(), 2::bigint);
select pg_temp.als('c2');   select pg_temp.gelijk('niet-toegewezen medewerker ziet niets', pg_temp.aantal(), 0::bigint);
select pg_temp.als('oa');   select pg_temp.gelijk('beheerder ziet niets', pg_temp.aantal(), 0::bigint);
select pg_temp.als('x');    select pg_temp.gelijk('vreemde ziet niets', pg_temp.aantal(), 0::bigint);

-- 3. Aanpassen en wissen
select pg_temp.als('lid');
update public.visit_log set photo_path = household_id::text || '/bezoek/' || id::text || '-foto.jpg' where visitor_name = 'Els';
select pg_temp.geweigerd('geen foto van een ander bezoek',
  format('update public.visit_log set photo_path = %L where visitor_name = ''Els''', pg_temp.id('hh')::text || '/bezoek/' || gen_random_uuid()::text || '-x.jpg'));
select pg_temp.gelijk('schrijver voegt een foto toe', (select photo_path is not null from public.visit_log where visitor_name = 'Els'), true);
update public.visit_log set note = 'gewijzigd' where visitor_name = 'De kapster';
select pg_temp.gelijk('een ander past niets aan', (select note from public.visit_log where visitor_name = 'De kapster'), 'Haar geknipt.'::text);
select pg_temp.geweigerd('created_at is niet aan te passen',
  'update public.visit_log set created_at = now() - interval ''1 day''');

reset role;
update public.visit_log set created_at = now() - interval '2 days' where visitor_name = 'Els';
set local role authenticated;
select pg_temp.als('lid');
delete from public.visit_log where visitor_name = 'Els';
select pg_temp.gelijk('na 24 uur wist de schrijver niet meer', (select count(*) from public.visit_log where visitor_name = 'Els'), 1::bigint);
select pg_temp.als('fa');
delete from public.visit_log where visitor_name = 'Els';
select pg_temp.gelijk('de familiebeheerder wist wel', (select count(*) from public.visit_log where visitor_name = 'Els'), 0::bigint);

-- 4. Anoniem
reset role;
set local role anon;
select pg_temp.geweigerd('anoniem leest niet', 'select count(*) from public.visit_log');

rollback;
