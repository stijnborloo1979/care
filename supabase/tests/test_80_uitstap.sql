-- =====================================================================
--  Uitstap melden (VEREIST_MIGRATIE 80)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; hh2 uuid; org uuid; da uuid; db uuid;
begin
  insert into auth.users (email) select m from unnest(array['u-fa@t', 'u-lid@t', 'u-tab@t', 'u-c1@t', 'u-c2@t', 'u-c3@t', 'u-oa@t', 'u-x@t']) m;
  insert into t_ids select replace(replace(email, 'u-', ''), '@t', ''), id from auth.users where email like 'u-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into public.household (person_name) values ('Jos') returning id into hh2;
  insert into t_ids values ('hh', hh), ('hh2', hh2);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'lid'), 'member'),
    (hh, (select v from t_ids where k = 'tab'), 'person'),
    (hh2, (select v from t_ids where k = 'x'), 'admin');
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('c1', 'caregiver'), ('c2', 'caregiver'), ('c3', 'caregiver'), ('oa', 'org_admin')) x(k, r) join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'A') returning id into da;
  insert into public.department (org_id, name) values (org, 'B') returning id into db;
  insert into public.department_staff (department_id, profile_id) values (da, (select v from t_ids where k = 'c2')), (db, (select v from t_ids where k = 'c3'));
  update public.household set org_id = org where id in (hh, hh2);
  update public.stay set department_id = da where household_id = hh;
  update public.stay set department_id = db where household_id = hh2;
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
create function pg_temp.aantal() returns bigint language sql as $$ select count(*) from public.uitstap $$;
create function pg_temp.status(w text) returns text language sql as $$ select status from public.uitstap where met_wie = w $$;

set local role authenticated;

-- 1. Melden
select pg_temp.als('lid');
insert into public.uitstap (household_id, met_wie, vertrek, terug, notitie, status)
values (pg_temp.id('hh'), 'Els', now() + interval '1 hour', now() + interval '4 hours', 'Naar de markt', 'terug');
select pg_temp.gelijk('familielid meldt een uitstap', pg_temp.aantal(), 1::bigint);
select pg_temp.gelijk('altijd gepland bij het melden', pg_temp.status('Els'), 'gepland'::text);
select pg_temp.geweigerd('terug na vertrek',
  format('insert into public.uitstap (household_id, met_wie, vertrek, terug) values (%L::uuid, ''x'', now() + interval ''2 hours'', now() + interval ''1 hour'')', pg_temp.id('hh')));
select pg_temp.geweigerd('hoogstens 14 dagen',
  format('insert into public.uitstap (household_id, met_wie, vertrek, terug) values (%L::uuid, ''x'', now(), now() + interval ''20 days'')', pg_temp.id('hh')));
select pg_temp.geweigerd('niet van vorige week',
  format('insert into public.uitstap (household_id, met_wie, vertrek, terug) values (%L::uuid, ''x'', now() - interval ''3 days'', now() - interval ''2 days'')', pg_temp.id('hh')));
select pg_temp.geweigerd('niet in naam van een ander',
  format('insert into public.uitstap (household_id, met_wie, vertrek, terug, created_by) values (%L::uuid, ''x'', now(), now() + interval ''1 hour'', %L::uuid)', pg_temp.id('hh'), pg_temp.id('fa')));
select pg_temp.geweigerd('niet rechtstreeks aan te passen', 'update public.uitstap set status = ''terug''');
select pg_temp.geweigerd('niet te wissen', 'delete from public.uitstap');

select pg_temp.als('c1');
insert into public.uitstap (household_id, met_wie, vertrek, terug) values (pg_temp.id('hh'), 'Jan', now() + interval '1 day', now() + interval '1 day 3 hours');
select pg_temp.gelijk('het toegewezen team meldt er ook een', pg_temp.aantal(), 2::bigint);
select pg_temp.als('tab');
select pg_temp.geweigerd('de tablet meldt niets',
  format('insert into public.uitstap (household_id, met_wie, vertrek, terug) values (%L::uuid, ''x'', now(), now() + interval ''1 hour'')', pg_temp.id('hh')));
select pg_temp.als('c2');
select pg_temp.geweigerd('een collega zonder toewijzing meldt niets',
  format('insert into public.uitstap (household_id, met_wie, vertrek, terug) values (%L::uuid, ''x'', now(), now() + interval ''1 hour'')', pg_temp.id('hh')));
select pg_temp.als('oa');
select pg_temp.geweigerd('de beheerder meldt niets (J4)',
  format('insert into public.uitstap (household_id, met_wie, vertrek, terug) values (%L::uuid, ''x'', now(), now() + interval ''1 hour'')', pg_temp.id('hh')));

-- 2. Lezen
select pg_temp.als('tab');  select pg_temp.gelijk('de bewoner ziet het', pg_temp.aantal(), 2::bigint);
select pg_temp.als('fa');   select pg_temp.gelijk('de familie ziet het', pg_temp.aantal(), 2::bigint);
select pg_temp.als('c1');   select pg_temp.gelijk('het zorgteam ziet het', pg_temp.aantal(), 2::bigint);
select pg_temp.als('c2');   select pg_temp.gelijk('niet-toegewezen collega niet', pg_temp.aantal(), 0::bigint);
select pg_temp.als('oa');   select pg_temp.gelijk('beheerder niet', pg_temp.aantal(), 0::bigint);
select pg_temp.als('x');    select pg_temp.gelijk('vreemde niet', pg_temp.aantal(), 0::bigint);

-- 3. Vertrokken en terug
select pg_temp.als('x');
select pg_temp.geweigerd('een vreemde zet niets',
  format('select public.uitstap_stap(%L::uuid, ''weg'')', (select id from public.uitstap limit 0)));
reset role;
select pg_temp.als('x');
set local role authenticated;
select pg_temp.geweigerd('een vreemde zet niets (met id)',
  format('select public.uitstap_stap(%L::uuid, ''weg'')', (select v from t_ids where k = 'hh')));
reset role;
insert into t_ids select 'els', id from public.uitstap where met_wie = 'Els';
insert into t_ids select 'jan', id from public.uitstap where met_wie = 'Jan';
set local role authenticated;
select pg_temp.als('x');
select pg_temp.geweigerd('een vreemde zet de uitstap niet op weg', format('select public.uitstap_stap(%L::uuid, ''weg'')', pg_temp.id('els')));
select pg_temp.als('tab');
select pg_temp.geweigerd('de tablet ook niet', format('select public.uitstap_stap(%L::uuid, ''weg'')', pg_temp.id('els')));
select pg_temp.als('c1');
select pg_temp.geweigerd('terug kan pas na vertrek', format('select public.uitstap_stap(%L::uuid, ''terug'')', pg_temp.id('els')));
select public.uitstap_stap(pg_temp.id('els'), 'weg');
select pg_temp.gelijk('het team duidt vertrokken aan', pg_temp.status('Els'), 'weg'::text);
select pg_temp.geweigerd('annuleren kan niet meer na vertrek', format('select public.uitstap_stap(%L::uuid, ''geannuleerd'')', pg_temp.id('els')));
select public.uitstap_stap(pg_temp.id('els'), 'terug');
select pg_temp.gelijk('en terug', pg_temp.status('Els'), 'terug'::text);
reset role;
select pg_temp.gelijk('de familie hoort dat ze terug is',
  (select count(*) from public.notification where household_id = pg_temp.id('hh') and body like 'Rita is terug%'), 1::bigint);
set local role authenticated;
select pg_temp.als('fa');
select public.uitstap_stap(pg_temp.id('jan'), 'geannuleerd');
select pg_temp.gelijk('de familie annuleert', pg_temp.status('Jan'), 'geannuleerd'::text);

-- 4. Opruimen
reset role;
update public.uitstap set terug_at = now() - interval '100 days', vertrek = now() - interval '101 days', terug = now() - interval '100 days' where met_wie = 'Els';
insert into public.uitstap (household_id, met_wie, vertrek, terug, status) values (pg_temp.id('hh'), 'Vergeten', now() - interval '101 days', now() - interval '100 days', 'weg');
select pg_temp.gelijk('opruimen na 90 dagen, ook als niemand terug aanduidde', public.uitstap_opruimen(), 2);

-- 5. Anoniem
set local role anon;
select pg_temp.geweigerd('anoniem leest niet', 'select count(*) from public.uitstap');

rollback;
