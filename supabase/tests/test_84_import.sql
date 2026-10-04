-- =====================================================================
--  Bewoners importeren en de familie uitnodigen (VEREIST_MIGRATIE 84)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare org uuid; org2 uuid;
begin
  insert into auth.users (email) select m from unnest(array['i-oa@t', 'i-co@t', 'i-c1@t', 'i-fa@t', 'i-ander@t']) m;
  insert into t_ids select replace(replace(email, 'i-', ''), '@t', ''), id from auth.users where email like 'i-%@t';
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into public.organisation (name) values ('Ander') returning id into org2;
  insert into t_ids values ('org', org), ('org2', org2);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('oa', 'org_admin'), ('co', 'coordinator'), ('c1', 'caregiver')) x(k, r) join t_ids using (k);
  insert into public.org_membership (org_id, profile_id, role) values (org2, (select v from t_ids where k = 'ander'), 'org_admin');
  insert into public.department (org_id, name) values (org, 'Linde');
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
create function pg_temp.lijst() returns jsonb language sql as $$
  select '[{"naam":"Rita Peeters","afdeling":"linde","kamer":"12"},{"naam":"Jos Maes","afdeling":"Linde"},{"naam":"rita peeters"},{"naam":""},{"naam":"Piet","afdeling":"Onbekend"}]'::jsonb $$;
create function pg_temp.aantal() returns bigint language sql as $$
  select count(*) from public.stay where org_id = pg_temp.id('org') and ended_at is null $$;

set local role authenticated;

-- 1. Proef: alleen nakijken
select pg_temp.als('co');
select pg_temp.gelijk('proef: twee ok',
  (select count(*) from public.importeer_bewoners(pg_temp.id('org'), pg_temp.lijst(), true) where status = 'ok'), 2::bigint);
select pg_temp.gelijk('proef: dubbel overgeslagen',
  (select melding from public.importeer_bewoners(pg_temp.id('org'), pg_temp.lijst(), true) where rij = 3), 'Staat twee keer in de lijst'::text);
select pg_temp.gelijk('proef: onbekende afdeling is een fout',
  (select status from public.importeer_bewoners(pg_temp.id('org'), pg_temp.lijst(), true) where rij = 5), 'fout'::text);
reset role;
select pg_temp.gelijk('proef bewaart niets', pg_temp.aantal(), 0::bigint);
set local role authenticated;
select pg_temp.als('co');

-- 2. Echt
select count(*) from public.importeer_bewoners(pg_temp.id('org'), pg_temp.lijst(), false);
reset role;
select pg_temp.gelijk('twee bewoners met een open verblijf', pg_temp.aantal(), 2::bigint);
select pg_temp.gelijk('op afdeling Linde, kamer 12',
  (select d.name || '/' || s.room from public.stay s join public.household h on h.id = s.household_id join public.department d on d.id = s.department_id where h.person_name = 'Rita Peeters'), 'Linde/12'::text);
insert into t_ids select 'rita', id from public.household where person_name = 'Rita Peeters';
set local role authenticated;
select pg_temp.als('co');
select pg_temp.gelijk('opnieuw importeren: woont hier al',
  (select melding from public.importeer_bewoners(pg_temp.id('org'), '[{"naam":"Rita Peeters"}]'::jsonb, false)), 'Woont hier al'::text);

select pg_temp.als('c1');
select pg_temp.geweigerd('zorgkundige importeert niet', format('select * from public.importeer_bewoners(%L::uuid, %L::jsonb, true)', pg_temp.id('org'), '[{"naam":"x"}]'));
select pg_temp.als('ander');
select pg_temp.geweigerd('beheerder van een ander huis niet', format('select * from public.importeer_bewoners(%L::uuid, %L::jsonb, true)', pg_temp.id('org'), '[{"naam":"x"}]'));
select pg_temp.als('oa');
select pg_temp.geweigerd('hoogstens 500', format('select * from public.importeer_bewoners(%L::uuid, (select jsonb_agg(jsonb_build_object(''naam'', ''B'' || g)) from generate_series(1, 501) g), true)', pg_temp.id('org')));

-- 3. De familie uitnodigen
select pg_temp.als('oa');
select pg_temp.gelijk('nog geen familie', (select heeft_familie from public.familie_status(pg_temp.id('org')) where household_id = pg_temp.id('rita')), false);
select count(*) from public.nodig_familie_uit(pg_temp.id('rita'), 'Els@Voorbeeld.be', 'dochter');
select pg_temp.gelijk('uitgenodigd', (select uitgenodigd from public.familie_status(pg_temp.id('org')) where household_id = pg_temp.id('rita')), true);
reset role;
select pg_temp.gelijk('als familiebeheerder, adres in kleine letters',
  (select role::text || ' ' || email from public.invitation where household_id = pg_temp.id('rita') and revoked_at is null), 'admin els@voorbeeld.be'::text);
insert into public.membership (household_id, profile_id, role) values (pg_temp.id('rita'), pg_temp.id('fa'), 'admin');
set local role authenticated;
select pg_temp.als('oa');
select pg_temp.geweigerd('niet meer als er al een familiebeheerder is', format('select * from public.nodig_familie_uit(%L::uuid, ''x@y.be'')', pg_temp.id('rita')));
select pg_temp.als('c1');
select pg_temp.geweigerd('zorgkundige nodigt niet uit', format('select * from public.nodig_familie_uit(%L::uuid, ''x@y.be'')', pg_temp.id('rita')));
select pg_temp.gelijk('en ziet de familiestatus niet', (select count(*) from public.familie_status(pg_temp.id('org'))), 0::bigint);
select pg_temp.als('ander');
select pg_temp.gelijk('ander huis ziet niets', (select count(*) from public.familie_status(pg_temp.id('org'))), 0::bigint);

reset role;
set local role anon;
select pg_temp.geweigerd('anoniem niet', format('select * from public.importeer_bewoners(%L::uuid, %L::jsonb, true)', pg_temp.id('org'), '[{"naam":"x"}]'));

rollback;
