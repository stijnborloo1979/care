-- =====================================================================
--  Demo-woonzorgcentrum (VEREIST_MIGRATIE 85)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;
insert into auth.users (email) values ('d-ik@t'), ('d-x@t');
insert into t_ids select replace(replace(email, 'd-', ''), '@t', ''), id from auth.users where email like 'd-%@t';
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
select pg_temp.als('ik');
insert into t_ids values ('demo', public.maak_demo_wzc());
select pg_temp.gelijk('nog eens: dezelfde demo', public.maak_demo_wzc(), pg_temp.id('demo'));
select pg_temp.gelijk('acht bewoners', (select count(*) from public.org_bewoners(pg_temp.id('demo'))), 8::bigint);
select pg_temp.gelijk('ik zie hun dossier (toegewezen als team lead)',
  (select count(*) from public.care_note where org_id = pg_temp.id('demo')) > 0, true);
select pg_temp.gelijk('dag van een bewoner gevuld',
  (select count(*) from public.dag_van_bewoner((select household_id from public.org_bewoners(pg_temp.id('demo')) limit 1))) > 0, true);
select pg_temp.gelijk('kamers', (select count(*) from public.kamer where org_id = pg_temp.id('demo')), 10::bigint);
select pg_temp.gelijk('iets kwijt op de afdeling', (select count(*) from public.kwijt_op_afdeling(pg_temp.id('demo'))), 1::bigint);

-- Rol wisselen, alleen in de demo
select public.demo_rol(pg_temp.id('demo'), 'org_admin');
select pg_temp.gelijk('nu beheerder', (select role::text from public.org_membership where org_id = pg_temp.id('demo') and profile_id = pg_temp.id('ik')), 'org_admin'::text);
select pg_temp.gelijk('als beheerder geen zorgnotities (J4)', (select count(*) from public.care_note where org_id = pg_temp.id('demo')), 0::bigint);
select public.demo_rol(pg_temp.id('demo'), 'coordinator');
select pg_temp.gelijk('terug coördinator, weer alles', (select count(*) from public.care_note where org_id = pg_temp.id('demo')) > 0, true);
select pg_temp.geweigerd('geen andere rol', format('select public.demo_rol(%L::uuid, ''caregiver'')', pg_temp.id('demo')));

-- Niemand maakt een echt huis tot demo
select pg_temp.als('x');
select pg_temp.geweigerd('een vreemde wisselt niets', format('select public.demo_rol(%L::uuid, ''org_admin'')', pg_temp.id('demo')));
select pg_temp.geweigerd('en wist niets', format('select public.wis_demo_wzc(%L::uuid)', pg_temp.id('demo')));
insert into t_ids values ('echt', public.create_organisation('Echt WZC'));
select pg_temp.geweigerd('demo_rol in een echt huis', format('select public.demo_rol(%L::uuid, ''coordinator'')', pg_temp.id('echt')));
do $$ begin update public.organisation set demo = true where id = (select v from t_ids where k = 'echt'); exception when others then null; end $$;
reset role;
select pg_temp.gelijk('demo-vlag niet zelf te zetten', (select demo from public.organisation where id = pg_temp.id('echt')), false);
set local role authenticated;

-- Alleen de eigenaar wisselt of wist, ook een collega in de demo niet
reset role;
insert into public.org_membership (org_id, profile_id, role) values (pg_temp.id('demo'), pg_temp.id('x'), 'caregiver');
set local role authenticated;
select pg_temp.als('x');
select pg_temp.geweigerd('een collega in de demo promoveert zichzelf niet', format('select public.demo_rol(%L::uuid, ''org_admin'')', pg_temp.id('demo')));
select pg_temp.geweigerd('en wist de demo niet', format('select public.wis_demo_wzc(%L::uuid)', pg_temp.id('demo')));

-- Een familie koppelt nooit aan een demo
reset role;
update public.organisation set koppelcode = 'DEMO1234' where id = pg_temp.id('demo');
insert into public.household (person_name) values ('Echte familie');
insert into t_ids select 'gezin', id from public.household where person_name = 'Echte familie';
insert into public.membership (household_id, profile_id, role) values (pg_temp.id('gezin'), pg_temp.id('x'), 'admin');
set local role authenticated;
select pg_temp.als('x');
select pg_temp.gelijk('koppelcode van een demo werkt niet', public.koppel_met_wzc(pg_temp.id('gezin'), 'DEMO1234'), null::text);

-- Een verzonnen bewoner waar toch iemand lid van werd, blijft bestaan
reset role;
insert into public.membership (household_id, profile_id, role)
select h.id, pg_temp.id('x'), 'admin' from public.household h where h.demo order by h.person_name limit 1;
set local role authenticated;

-- Opruimen
select pg_temp.als('ik');
select public.wis_demo_wzc(pg_temp.id('demo'));
reset role;
select pg_temp.gelijk('demo weg', (select count(*) from public.organisation where id = pg_temp.id('demo')), 0::bigint);
select pg_temp.gelijk('verzonnen bewoners weg, behalve die met een lid', (select count(*) from public.household where demo), 1::bigint);

rollback;
