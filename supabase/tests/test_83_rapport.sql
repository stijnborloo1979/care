-- =====================================================================
--  Rapporten (VEREIST_MIGRATIE 83)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare org uuid; da uuid; hh uuid; i int; a uuid;
begin
  insert into auth.users (email) select m from unnest(array['r-oa@t', 'r-co@t', 'r-c1@t', 'r-fa@t']) m;
  insert into t_ids select replace(replace(email, 'r-', ''), '@t', ''), id from auth.users where email like 'r-%@t';
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('oa', 'org_admin'), ('co', 'coordinator'), ('c1', 'caregiver')) x(k, r) join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'Linde') returning id into da;
  insert into public.activity (org_id, department_id, titel, starts_at) values (org, da, 'Zingen', now()) returning id into a;
  insert into public.activity (org_id, titel, starts_at, status) values (org, 'Afgelast', now(), 'geannuleerd');
  for i in 1..3 loop
    insert into public.household (person_name) values ('B' || i) returning id into hh;
    if i = 1 then
      insert into t_ids values ('hh1', hh);
      insert into public.membership (household_id, profile_id, role) values (hh, (select v from t_ids where k = 'fa'), 'admin');
    end if;
    update public.household set org_id = org where id = hh;
    update public.stay set department_id = da where household_id = hh;
    insert into public.activity_participant (activity_id, household_id, status) values (a, hh, case when i < 3 then 'aanwezig' else 'afwezig' end);
    insert into public.visit_log (household_id, visitor_name) values (hh, 'Bezoek');
  end loop;
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
create function pg_temp.r(s text, af text default null, dagen int default 30) returns bigint language sql as $$
  select waarde from public.org_rapport(pg_temp.id('org'), current_date - dagen, current_date) where sleutel = s and afdeling is not distinct from af $$;

set local role authenticated;

select pg_temp.als('co');
select pg_temp.gelijk('bewoners', pg_temp.r('bewoners'), 3::bigint);
select pg_temp.gelijk('bewoners per afdeling', pg_temp.r('bewoners', 'Linde'), 3::bigint);
select pg_temp.gelijk('opnames', pg_temp.r('opnames'), 3::bigint);
select pg_temp.gelijk('activiteiten zonder afgelaste', pg_temp.r('activiteiten'), 1::bigint);
select pg_temp.gelijk('aanwezigheden', pg_temp.r('aanwezig'), 2::bigint);
select pg_temp.gelijk('verschillende deelnemers', pg_temp.r('deelnemers'), 2::bigint);
select pg_temp.gelijk('bezoeken pas vanaf vijf bewoners', pg_temp.r('bezoeken'), null::bigint);
select pg_temp.gelijk('families in de app staat er nooit in', (select count(*) from public.org_rapport(pg_temp.id('org'), current_date - 30, current_date) where sleutel = 'families'), 0::bigint);
select pg_temp.gelijk('geen namen of ids: alleen drie kolommen',
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'org_rapport'), 0::bigint);

reset role;
do $$
declare i int; hh uuid;
begin
  for i in 4..5 loop
    insert into public.household (person_name) values ('B' || i) returning id into hh;
    update public.household set org_id = (select v from t_ids where k = 'org') where id = hh;
  end loop;
end $$;
set local role authenticated;
select pg_temp.als('oa');
select pg_temp.gelijk('vanaf vijf bewoners: bezoeken', pg_temp.r('bezoeken'), 3::bigint);
select pg_temp.gelijk('maar niet over een korte periode', pg_temp.r('bezoeken', null, 7), null::bigint);

-- Een oude periode met maar één bewoner: ook al wonen er nu vijf, geen bezoeken
reset role;
update public.stay set started_at = now() - interval '200 days' where household_id = pg_temp.id('hh1');
alter table public.visit_log disable trigger visit_log_tijd;
update public.visit_log set visited_at = now() - interval '100 days' where household_id = pg_temp.id('hh1');
alter table public.visit_log enable trigger visit_log_tijd;
set local role authenticated;
select pg_temp.als('oa');
select pg_temp.gelijk('een periode met één bewoner toont geen bezoeken',
  (select waarde from public.org_rapport(pg_temp.id('org'), current_date - 150, current_date - 60) where sleutel = 'bezoeken'), null::bigint);

select pg_temp.geweigerd('geen periode van twee jaar',
  format('select * from public.org_rapport(%L::uuid, current_date - 800, current_date)', pg_temp.id('org')));
select pg_temp.als('c1');
select pg_temp.geweigerd('zorgkundige ziet geen rapport', format('select * from public.org_rapport(%L::uuid, current_date - 7, current_date)', pg_temp.id('org')));
select pg_temp.als('fa');
select pg_temp.geweigerd('familie ook niet', format('select * from public.org_rapport(%L::uuid, current_date - 7, current_date)', pg_temp.id('org')));

reset role;
set local role anon;
select pg_temp.geweigerd('anoniem niet', format('select * from public.org_rapport(%L::uuid, current_date - 7, current_date)', pg_temp.id('org')));

rollback;
