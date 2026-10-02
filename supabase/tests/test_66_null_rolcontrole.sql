-- =====================================================================
--  NULL-veilige rolcontrole (VEREIST_MIGRATIE 66)
--  Een aangemelde vreemde roept elke functie aan op een huishouden waar hij
--  niets mee te maken heeft. Vóór 66 lukte dat voor de meeste.
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid;
begin
  insert into auth.users (email) select m from unnest(array['n-fa@t', 'n-x@t']) m;
  insert into t_ids select replace(replace(email, 'n-', ''), '@t', ''), id from auth.users where email like 'n-%@t';
  insert into public.household (person_name, timezone) values ('Rita', 'Europe/Brussels') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values (hh, (select v from t_ids where k = 'fa'), 'admin');
  insert into public.task (household_id, title) values (hh, 'Apotheek');
  insert into t_ids select 'taak', id from public.task where household_id = hh;
  insert into public.medication (household_id, name, at_time) values (hh, 'Pil', '08:00');
  insert into t_ids select 'med', id from public.medication where household_id = hh;
  insert into public.agenda_event (household_id, starts_at, title, kind) values (hh, now() + interval '1 day', 'Kapper', 'appt');
  insert into t_ids select 'ev', id from public.agenda_event where household_id = hh;
end $$;

create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t_ids where t_ids.k = id.k $$;
create function pg_temp.geweigerd(wat text, sql text) returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then raise notice 'ok: % (geweigerd: %)', wat, sqlerrm; return; end;
  raise exception 'GEZAKT: % — werd niet geweigerd', wat;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('x'), 'role', 'authenticated')::text, true);

select pg_temp.geweigerd('vreemde zet de dag niet klaar', format('select public.dag_klaarzetten(%L::uuid)', pg_temp.id('hh')));
select pg_temp.geweigerd('vreemde plant geen bezoek', format('select public.plan_bezoek(%L::uuid, current_date + 1, ''15:00'')', pg_temp.id('hh')));
select pg_temp.geweigerd('vreemde neemt geen afspraak op', format('select public.neem_op(%L::uuid)', pg_temp.id('ev')));
select pg_temp.geweigerd('vreemde laat niets los', format('select public.laat_los(%L::uuid)', pg_temp.id('ev')));
select pg_temp.geweigerd('vreemde wijst geen taak toe', format('select public.assign_task(%L::uuid, %L::uuid)', pg_temp.id('taak'), pg_temp.id('x')));
select pg_temp.geweigerd('vreemde neemt geen taak op', format('select public.claim_task(%L::uuid)', pg_temp.id('taak')));
select pg_temp.geweigerd('vreemde vinkt geen taak af', format('select public.complete_task(%L::uuid)', pg_temp.id('taak')));
select pg_temp.geweigerd('vreemde past de voorraad niet aan', format('select public.set_medication_stock(%L::uuid, 3)', pg_temp.id('med')));
select pg_temp.geweigerd('vreemde past de verslag-instellingen niet aan', format('select public.set_report_prefs(%L::uuid, ''{}''::jsonb)', pg_temp.id('hh')));
select pg_temp.geweigerd('vreemde stuurt geen testmelding', format('select public.test_push(%L::uuid)', pg_temp.id('hh')));
select pg_temp.geweigerd('vreemde zet geen kanaal op dit huishouden', format('select public.set_alert_channel(%L::uuid, ''telegram'', ''123456789'')', pg_temp.id('hh')));
select pg_temp.geweigerd('vreemde maakt geen koppelcode voor een tablet', format('select public.create_pairing_code(%L::uuid)', pg_temp.id('hh')));
select pg_temp.geweigerd('vreemde zet de medicatie van vandaag niet klaar', format('select public.sync_medication_today(%L::uuid)', pg_temp.id('hh')));

-- De familiebeheerder kan het allemaal nog
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('fa'), 'role', 'authenticated')::text, true);
select public.dag_klaarzetten(pg_temp.id('hh'));
select public.claim_task(pg_temp.id('taak'));
select public.set_medication_stock(pg_temp.id('med'), 3);
select public.neem_op(pg_temp.id('ev'));
do $$ begin raise notice 'ok: familiebeheerder kan alles nog'; end $$;
reset role;

-- Ook anoniem: niets
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.geweigerd('anoniem zet de dag niet klaar', format('select public.dag_klaarzetten(%L::uuid)', pg_temp.id('hh')));
reset role;

rollback;
