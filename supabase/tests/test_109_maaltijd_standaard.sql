-- =====================================================================
--  Maaltijden standaard gegeten (VEREIST_MIGRATIE 109)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare org uuid; dep uuid; hh uuid; hh2 uuid; m_ontbijt uuid;
begin
  insert into auth.users (email) select m from unnest(array['s-team@t', 's-fa@t', 's-tab@t']) m;
  insert into t_ids select replace(replace(email, 's-', ''), '@t', ''), id from auth.users where email like 's-%@t';
  insert into public.organisation (name) values ('WZC Standaard') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role) values (org, (select v from t_ids where k = 'team'), 'caregiver');
  insert into public.department (org_id, name) values (org, 'Linde') returning id into dep;
  insert into t_ids values ('dep', dep);
  insert into public.department_staff (department_id, profile_id) values (dep, (select v from t_ids where k = 'team'));
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into public.household (person_name) values ('Jos') returning id into hh2;
  insert into t_ids values ('hh', hh), ('hh2', hh2);
  insert into public.membership (household_id, profile_id, role) values (hh, (select v from t_ids where k = 'fa'), 'admin');
  insert into public.membership (household_id, profile_id, role) values (hh2, (select v from t_ids where k = 'fa'), 'admin');
  insert into public.stay (household_id, org_id, department_id, started_at) values (hh, org, dep, now() - interval '30 days');
  insert into public.stay (household_id, org_id, department_id, started_at) values (hh2, org, dep, now() - interval '30 days');
  insert into public.afdeling_dag (org_id, department_id, titel, soort, begint, dagen)
    values (org, dep, 'Middagmaal', 'maaltijd', '12:00', '{1,2,3,4,5,6,7}') returning id into m_ontbijt;
  insert into t_ids values ('moment', m_ontbijt);
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

set local role authenticated;

-- 1. Zonder registratie is een maaltijd standaard gegeten, en niet bevestigd
select pg_temp.als('team');
select pg_temp.gelijk('maaltijd staat standaard op gegeten',
  (select status from public.maaltijd_dag_overzicht(pg_temp.id('org'), current_date) where household_id = pg_temp.id('hh') and afdeling_dag_id = pg_temp.id('moment')), 'gegeten');
select pg_temp.gelijk('de bron is standaard',
  (select bron from public.maaltijd_dag_overzicht(pg_temp.id('org'), current_date) where household_id = pg_temp.id('hh') and afdeling_dag_id = pg_temp.id('moment')), 'standaard');

-- 2. Het overzicht van de dag: beide bewoners staan erop, beiden standaard
select pg_temp.gelijk('overzicht toont beide bewoners', (select count(*) from public.maaltijd_dag_overzicht(pg_temp.id('org'), current_date)), 2::bigint);

-- 3. Het team bevestigt er één als niet gegeten: die telt als bevestigd
select public.maaltijd_zet(pg_temp.id('hh'), pg_temp.id('moment'), current_date, 'niet', null);
select pg_temp.gelijk('bevestigde registratie wint van de standaard',
  (select bron from public.maaltijd_dag_overzicht(pg_temp.id('org'), current_date) where household_id = pg_temp.id('hh') and afdeling_dag_id = pg_temp.id('moment')), 'team');

-- 4. De analyse: een bevestigde en een standaard maaltijd, apart geteld
select pg_temp.gelijk('analyse telt twee maaltijden verwacht',
  (select aantal_verwacht from public.maaltijd_analyse_stand(pg_temp.id('org'), current_date, current_date)), 2::bigint);
select pg_temp.gelijk('analyse telt één bevestigd',
  (select aantal_geregistreerd from public.maaltijd_analyse_stand(pg_temp.id('org'), current_date, current_date)), 1::bigint);
select pg_temp.gelijk('analyse telt één niet gegeten',
  (select aantal_niet from public.maaltijd_analyse_stand(pg_temp.id('org'), current_date, current_date)), 1::bigint);

-- 5. Nieuwe uitstap: blijft eten is de standaard
select pg_temp.als('fa');
insert into public.uitstap (household_id, met_wie, vertrek, terug, created_by)
  values (pg_temp.id('hh2'), 'Els', ((current_date + 1) + time '08:00') at time zone 'Europe/Brussels', ((current_date + 1) + time '18:00') at time zone 'Europe/Brussels', auth.uid());
select pg_temp.gelijk('nieuwe uitstap: blijft eten standaard', (select eet_mee from public.uitstap where household_id = pg_temp.id('hh2')), true);
select pg_temp.als('team');
select pg_temp.gelijk('maaltijd tijdens die uitstap blijft standaard gegeten',
  (select status from public.maaltijd_dag_overzicht(pg_temp.id('org'), (current_date + 1)) where household_id = pg_temp.id('hh2') and afdeling_dag_id = pg_temp.id('moment')), 'gegeten');

-- 6. Familie zet "blijft niet eten" aan: de maaltijd valt weg, bron uitstap
select pg_temp.als('fa');
select public.uitstap_eetkeuze((select id from public.uitstap where household_id = pg_temp.id('hh2')), false);
select pg_temp.als('team');
select pg_temp.gelijk('uitstap zonder eten zet de maaltijd op niet',
  (select status from public.maaltijd_dag_overzicht(pg_temp.id('org'), (current_date + 1)) where household_id = pg_temp.id('hh2') and afdeling_dag_id = pg_temp.id('moment')), 'niet');
select pg_temp.gelijk('de bron is uitstap',
  (select bron from public.maaltijd_dag_overzicht(pg_temp.id('org'), (current_date + 1)) where household_id = pg_temp.id('hh2') and afdeling_dag_id = pg_temp.id('moment')), 'uitstap');
select pg_temp.gelijk('analyse telt de uitstap niet mee (Rita blijft wel)',
  (select aantal_verwacht from public.maaltijd_analyse_stand(pg_temp.id('org'), (current_date + 1), (current_date + 1))), 1::bigint);
select pg_temp.gelijk('de keuken telt die dag geen eter van hh2',
  (select count(*) from public.maaltijd_dag_overzicht(pg_temp.id('org'), (current_date + 1)) where household_id = pg_temp.id('hh2') and status <> 'niet'), 0::bigint);
