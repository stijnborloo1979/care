-- =====================================================================
--  De spullen van de bewoner (VEREIST_MIGRATIE 81)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; hh2 uuid; org uuid; da uuid; db uuid;
begin
  insert into auth.users (email) select m from unnest(array['s-fa@t', 's-lid@t', 's-tab@t', 's-c1@t', 's-c2@t', 's-c3@t', 's-oa@t', 's-x@t']) m;
  insert into t_ids select replace(replace(email, 's-', ''), '@t', ''), id from auth.users where email like 's-%@t';
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
create function pg_temp.aantal() returns bigint language sql as $$ select count(*) from public.bezitting $$;
create function pg_temp.kwijt() returns bigint language sql as $$ select count(*) from public.kwijt_op_afdeling(pg_temp.id('org')) $$;

set local role authenticated;

-- 1. Vastleggen
select pg_temp.als('lid');
insert into public.bezitting (household_id, naam, soort, kenmerk, waar, kwijt_sinds)
values (pg_temp.id('hh'), 'Leesbril', 'bril', 'Rood montuur, naam binnenin', 'Op het nachtkastje', now());
select pg_temp.gelijk('familielid legt een bril vast', pg_temp.aantal(), 1::bigint);
select pg_temp.gelijk('niet meteen kwijt', (select kwijt_sinds from public.bezitting where naam = 'Leesbril'), null::timestamptz);
select pg_temp.geweigerd('geen .. in het pad',
  format('update public.bezitting set foto_path = household_id::text || ''/spullen/'' || id::text || ''-/../x.jpg'' where naam = ''Leesbril'''));
select pg_temp.geweigerd('geen foto buiten de eigen map',
  format('insert into public.bezitting (household_id, naam, foto_path) values (%L::uuid, ''x'', %L)', pg_temp.id('hh'), pg_temp.id('hh2')::text || '/spullen/a.jpg'));
update public.bezitting set foto_path = household_id::text || '/spullen/' || id::text || '-f.jpg' where naam = 'Leesbril';
select pg_temp.gelijk('foto bij de eigen bezitting', (select foto_path is not null from public.bezitting where naam = 'Leesbril'), true);
select pg_temp.geweigerd('kwijt niet rechtstreeks', 'update public.bezitting set kwijt_sinds = now()');
select pg_temp.geweigerd('huishouden niet te verplaatsen', format('update public.bezitting set household_id = %L::uuid', pg_temp.id('hh2')));

select pg_temp.als('c1');
insert into public.bezitting (household_id, naam, soort) values (pg_temp.id('hh'), 'Gebit', 'gebit');
select pg_temp.gelijk('het toegewezen team ook', pg_temp.aantal(), 2::bigint);
select pg_temp.als('c2');
select pg_temp.geweigerd('een collega van de afdeling legt niets vast',
  format('insert into public.bezitting (household_id, naam) values (%L::uuid, ''x'')', pg_temp.id('hh')));
select pg_temp.als('tab');
select pg_temp.geweigerd('de tablet legt niets vast',
  format('insert into public.bezitting (household_id, naam) values (%L::uuid, ''x'')', pg_temp.id('hh')));
select pg_temp.als('oa');
select pg_temp.geweigerd('de beheerder niet (J4)',
  format('insert into public.bezitting (household_id, naam) values (%L::uuid, ''x'')', pg_temp.id('hh')));

-- 2. Lezen
select pg_temp.als('tab');  select pg_temp.gelijk('de bewoner ziet haar spullen', pg_temp.aantal(), 2::bigint);
select pg_temp.als('c1');   select pg_temp.gelijk('het team ziet ze', pg_temp.aantal(), 2::bigint);
select pg_temp.als('c2');   select pg_temp.gelijk('een collega ziet de lijst niet', pg_temp.aantal(), 0::bigint);
select pg_temp.als('oa');   select pg_temp.gelijk('de beheerder niet', pg_temp.aantal(), 0::bigint);
select pg_temp.als('x');    select pg_temp.gelijk('een vreemde niet', pg_temp.aantal(), 0::bigint);

-- 3. Kwijt en gevonden
reset role;
insert into t_ids select 'bril', id from public.bezitting where naam = 'Leesbril';
insert into t_ids select 'gebit', id from public.bezitting where naam = 'Gebit';
set local role authenticated;
select pg_temp.als('x');
select pg_temp.geweigerd('een vreemde meldt niets kwijt', format('select public.meld_kwijt(%L::uuid)', pg_temp.id('bril')));
select pg_temp.als('c2');
select pg_temp.geweigerd('een collega meldt niets kwijt', format('select public.meld_kwijt(%L::uuid)', pg_temp.id('bril')));
select pg_temp.als('tab');
select public.meld_kwijt(pg_temp.id('bril'));
select pg_temp.gelijk('de bewoner meldt haar bril kwijt', (select kwijt_sinds is not null from public.bezitting where naam = 'Leesbril'), true);
select pg_temp.als('c1');
select public.meld_kwijt(pg_temp.id('gebit'));
reset role;
select pg_temp.gelijk('de familie hoort het als het team iets kwijt meldt',
  (select count(*) from public.notification where household_id = pg_temp.id('hh') and body like 'Het zorgteam zoekt Gebit%'), 1::bigint);
set local role authenticated;

select pg_temp.als('c2');   select pg_temp.gelijk('de collega van de afdeling ziet wat kwijt is', pg_temp.kwijt(), 2::bigint);
select pg_temp.gelijk('met bewoner en kamer, zonder foto',
  (select bewoner from public.kwijt_op_afdeling(pg_temp.id('org')) where naam = 'Gebit'), 'Rita'::text);
select pg_temp.als('c3');   select pg_temp.gelijk('een andere afdeling niet', pg_temp.kwijt(), 0::bigint);
select pg_temp.geweigerd('en vindt er niets', format('select public.markeer_gevonden(%L::uuid)', pg_temp.id('gebit')));
select pg_temp.als('oa');   select pg_temp.gelijk('de beheerder niet (J4)', pg_temp.kwijt(), 0::bigint);
select pg_temp.als('c1');   select pg_temp.gelijk('het toegewezen team wel', pg_temp.kwijt(), 2::bigint);

select pg_temp.als('c2');
select public.markeer_gevonden(pg_temp.id('gebit'));
select pg_temp.gelijk('een collega van de afdeling vindt het gebit', pg_temp.kwijt(), 1::bigint);
reset role;
select pg_temp.gelijk('de familie hoort dat het gevonden is',
  (select count(*) from public.notification where household_id = pg_temp.id('hh') and body like 'Gebit van Rita is gevonden%'), 1::bigint);
set local role authenticated;
select pg_temp.als('lid');
select public.markeer_gevonden(pg_temp.id('bril'));
reset role;
set local role authenticated;
select pg_temp.als('c1');
select public.meld_kwijt(pg_temp.id('gebit'));
select public.markeer_gevonden(pg_temp.id('gebit'));
select public.meld_kwijt(pg_temp.id('gebit'));
reset role;
select pg_temp.gelijk('kwijt-gevonden-kwijt: geen reeks meldingen',
  (select count(*) from public.notification where household_id = pg_temp.id('hh') and body like 'Het zorgteam zoekt Gebit%'), 1::bigint);
set local role authenticated;
select pg_temp.als('c2');
select public.markeer_gevonden(pg_temp.id('gebit'));
reset role;
select pg_temp.gelijk('geen melding als de familie het kwijt niet hoorde',
  (select count(*) from public.notification where household_id = pg_temp.id('hh') and body like 'Leesbril%gevonden%'), 0::bigint);

-- 4. Wissen
set local role authenticated;
select pg_temp.als('c2');
delete from public.bezitting;
select pg_temp.als('fa');
select pg_temp.gelijk('een collega wist niets', pg_temp.aantal(), 2::bigint);
delete from public.bezitting where naam = 'Gebit';
select pg_temp.gelijk('de familie wist', pg_temp.aantal(), 1::bigint);

-- 5. Anoniem
reset role;
set local role anon;
select pg_temp.geweigerd('anoniem leest niet', 'select count(*) from public.bezitting');
select pg_temp.geweigerd('anoniem roept niets aan', format('select * from public.kwijt_op_afdeling(%L::uuid)', pg_temp.id('org')));

rollback;
