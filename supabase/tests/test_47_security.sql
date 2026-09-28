-- =====================================================================
--  Beveiligingstests bij migratie 47 (VEREIST_MIGRATIE 47)
--
--  Toont aan dat de lekken uit de audit dicht zijn:
--    V1  achtergrondfuncties niet aanroepbaar voor anon of vreemden
--    V2  documentbestanden niet leesbaar voor organisatiepersoneel
--    V3  privé dagboekopnames niet leesbaar voor familie
--    V6  medicatiemomenten niet klaar te zetten in een vreemd huishouden
--  én dat wat vandaag werkt, blijft werken (onboarding, familie, bewoner).
--
--  Alles draait in één transactie en wordt teruggedraaid.
-- =====================================================================

begin;

create temp table t_ids (k text primary key, v uuid);
grant select on t_ids to public;
create temp table t_log (nr serial primary key, uitkomst text);
grant select, insert on t_log to public;
grant usage on sequence t_log_nr_seq to public;

do $$
declare
  hh uuid; hh2 uuid; org uuid;
  u_admin uuid := gen_random_uuid();
  u_member uuid := gen_random_uuid();
  u_self uuid := gen_random_uuid();
  u_coord uuid := gen_random_uuid();
  u_orgadmin uuid := gen_random_uuid();
  u_vreemd uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values
    (u_admin, 't47-admin@test.be'), (u_member, 't47-member@test.be'),
    (u_self, 't47-self@test.be'), (u_coord, 't47-coord@test.be'),
    (u_orgadmin, 't47-orgadmin@test.be'), (u_vreemd, 't47-vreemd@test.be');

  insert into public.household (person_name, timezone, support_level)
    values ('Maria Test', 'Europe/Brussels', 'ondersteund') returning id into hh;
  insert into public.household (person_name, timezone)
    values ('Andere', 'Europe/Brussels') returning id into hh2;

  insert into public.membership (household_id, profile_id, role) values
    (hh, u_admin, 'admin'), (hh, u_member, 'member'), (hh, u_self, 'admin'),
    (hh2, u_vreemd, 'admin');
  insert into public.person_card (household_id, name, relation, kind, profile_id)
    values (hh, 'Maria', 'ikzelf', 'self', u_self);

  insert into public.organisation (name) values ('WZC Test') returning id into org;
  insert into public.org_membership (org_id, profile_id, role) values
    (org, u_coord, 'coordinator'), (org, u_orgadmin, 'org_admin');
  update public.household set org_id = org where id = hh;

  -- bestanden
  insert into storage.objects (bucket_id, name) values
    ('documents', hh || '/identiteit/id.pdf'),
    ('messages',  hh || '/verhalen/prive.webm'),
    ('messages',  hh || '/verhalen/gedeeld.webm');
  insert into public.life_story (household_id, question, audio_path, shared, created_by) values
    (hh, 'Dagboek', hh || '/verhalen/prive.webm', false, u_self),
    (hh, 'Dagboek', hh || '/verhalen/gedeeld.webm', true, u_self);

  insert into t_ids values ('hh', hh), ('hh2', hh2);
end $$;

create function pg_temp.als(mail text) returns void language plpgsql security definer
set search_path = auth, public as $$
declare uid uuid;
begin
  select id into uid from auth.users where email = mail;
  if uid is null then raise exception 'onbekende testgebruiker %', mail; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t_ids where t_ids.k = id.k $$;

create function pg_temp.ok(wat text) returns void language plpgsql as $$
begin insert into t_log (uitkomst) values ('ok: ' || wat); raise notice 'ok: %', wat; end $$;

create function pg_temp.gelijk(wat text, kreeg bigint, verwacht bigint) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then
    raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg;
  end if;
  perform pg_temp.ok(wat);
end $$;

-- Voert een opdracht uit en verwacht dat ze geweigerd wordt.
create function pg_temp.geweigerd(wat text, sql text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    perform pg_temp.ok(wat || ' (geweigerd: ' || sqlstate || ')');
    return;
  end;
  raise exception 'GEZAKT: % — werd niet geweigerd', wat;
end $$;

-- ---------------------------------------------------------------------
--  V1: achtergrondfuncties
-- ---------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.geweigerd('anon: pending_embeddings', 'select * from public.pending_embeddings(5)');
select pg_temp.geweigerd('anon: cleanup_location',   'select public.cleanup_location(0)');
select pg_temp.geweigerd('anon: run_nightly',        'select * from public.run_nightly()');
select pg_temp.geweigerd('anon: materialise_day',
  format('select public.materialise_day(%L::uuid, current_date)', pg_temp.id('hh')));
reset role;

set local role authenticated;
select pg_temp.als('t47-vreemd@test.be');
select pg_temp.geweigerd('vreemde: pending_embeddings', 'select * from public.pending_embeddings(5)');
select pg_temp.geweigerd('vreemde: set_embedding',
  format('select public.set_embedding(''item'', %L::uuid, null)', gen_random_uuid()));
select pg_temp.geweigerd('vreemde: cleanup_location', 'select public.cleanup_location(0)');
select pg_temp.geweigerd('vreemde: cleanup_expired_messages', 'select public.cleanup_expired_messages()');
select pg_temp.geweigerd('vreemde: run_nightly', 'select * from public.run_nightly()');
select pg_temp.geweigerd('vreemde: run_nightly_full', 'select * from public.run_nightly_full()');
select pg_temp.geweigerd('vreemde: check_household_alerts',
  format('select public.check_household_alerts(%L::uuid)', pg_temp.id('hh')));
select pg_temp.geweigerd('vreemde: materialise_day op vreemd huishouden',
  format('select public.materialise_day(%L::uuid, current_date)', pg_temp.id('hh')));

-- V6
select pg_temp.geweigerd('vreemde: ensure_medication_log',
  format('select public.ensure_medication_log(%L::uuid)', pg_temp.id('hh')));
select pg_temp.geweigerd('vreemde: med_items_klaarzetten',
  format('select public.med_items_klaarzetten(%L::uuid, now())', pg_temp.id('hh')));
select pg_temp.geweigerd('vreemde: med_doses_bij',
  format('select * from public.med_doses_bij(%L::uuid)', gen_random_uuid()));

-- Wat moet blijven werken: de onboarding zet de eerste dagen klaar.
select pg_temp.als('t47-admin@test.be');
do $$ begin
  perform public.materialise_day(pg_temp.id('hh'), current_date);
  perform pg_temp.ok('familiebeheerder: materialise_day op eigen huishouden werkt nog');
end $$;
do $$ begin
  perform public.dag_klaarzetten(pg_temp.id('hh'));
  perform pg_temp.ok('familiebeheerder: dag_klaarzetten werkt nog');
end $$;
reset role;

-- De server (cron, edge functions met service role) mag alles nog.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  perform * from public.pending_embeddings(1);
  perform public.cleanup_location(7);
  perform pg_temp.ok('service_role: achtergrondfuncties werken nog');
end $$;
reset role;

-- ---------------------------------------------------------------------
--  V2: documentbestanden
-- ---------------------------------------------------------------------

set local role authenticated;
select pg_temp.als('t47-coord@test.be');
select pg_temp.gelijk('coördinator ziet geen documentbestanden',
  (select count(*) from storage.objects where bucket_id = 'documents'), 0);
select pg_temp.als('t47-orgadmin@test.be');
select pg_temp.gelijk('org admin ziet geen documentbestanden',
  (select count(*) from storage.objects where bucket_id = 'documents'), 0);
select pg_temp.als('t47-member@test.be');
select pg_temp.gelijk('familielid ziet documentbestand nog',
  (select count(*) from storage.objects where bucket_id = 'documents'), 1);
select pg_temp.als('t47-admin@test.be');
select pg_temp.gelijk('familiebeheerder ziet documentbestand nog',
  (select count(*) from storage.objects where bucket_id = 'documents'), 1);

-- ---------------------------------------------------------------------
--  V3: dagboekopnames
-- ---------------------------------------------------------------------

select pg_temp.als('t47-member@test.be');
select pg_temp.gelijk('familielid ziet privé opname niet',
  (select count(*) from storage.objects where bucket_id = 'messages' and name like '%/verhalen/prive.webm'), 0);
select pg_temp.gelijk('familielid ziet gedeelde opname wel',
  (select count(*) from storage.objects where bucket_id = 'messages' and name like '%/verhalen/gedeeld.webm'), 1);
select pg_temp.als('t47-self@test.be');
select pg_temp.gelijk('bewoner ziet beide eigen opnames',
  (select count(*) from storage.objects where bucket_id = 'messages' and name like '%/verhalen/%'), 2);
select pg_temp.als('t47-vreemd@test.be');
select pg_temp.gelijk('vreemde ziet geen opnames',
  (select count(*) from storage.objects where bucket_id = 'messages'), 0);

reset role;
select uitkomst as "TEST 47 GESLAAGD" from t_log order by nr;
rollback;
