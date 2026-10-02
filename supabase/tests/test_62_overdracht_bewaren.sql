-- =====================================================================
--  Bewaartermijn van de overdracht per WZC (VEREIST_MIGRATIE 62)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare org uuid; org2 uuid; d uuid; d2 uuid;
begin
  insert into auth.users (email) select m from unnest(array['h-oa@t', 'h-co@t', 'h-s@t', 'h-oa2@t']) m;
  insert into t_ids select replace(replace(email, 'h-', ''), '@t', ''), id from auth.users where email like 'h-%@t';
  insert into public.organisation (name) values ('WZC Een') returning id into org;
  insert into public.organisation (name) values ('WZC Twee') returning id into org2;
  insert into t_ids values ('org', org), ('org2', org2);
  insert into public.org_membership (org_id, profile_id, role) values
    (org, (select v from t_ids where k = 'oa'), 'org_admin'),
    (org, (select v from t_ids where k = 'co'), 'coordinator'),
    (org, (select v from t_ids where k = 's'), 'caregiver'),
    (org2, (select v from t_ids where k = 'oa2'), 'org_admin');
  insert into public.department (org_id, name) values (org, 'A') returning id into d;
  insert into public.department (org_id, name) values (org2, 'B') returning id into d2;
  -- WZC Een: 10, 40 en 100 dagen oud; WZC Twee: 40 dagen oud
  insert into public.handover (department_id, shift_date, shift, body) values
    (d, current_date - 10, 'vroeg', 'recent'),
    (d, current_date - 40, 'laat', 'maand oud'),
    (d, current_date - 100, 'nacht', 'oud'),
    (d2, current_date - 40, 'vroeg', 'ander wzc');
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

select pg_temp.gelijk('standaard 30 dagen', (select overdracht_bewaar_dagen from public.organisation where id = pg_temp.id('org')), 30);

set local role authenticated;
select pg_temp.als('co');
select pg_temp.gelijk('coördinator leest de termijn', public.overdracht_termijn(pg_temp.id('org')), 30);
select pg_temp.geweigerd('coördinator zet ze niet', format('select public.zet_overdracht_termijn(%L::uuid, 60)', pg_temp.id('org')));
select pg_temp.gelijk('coördinator krijgt geen telling', public.overdracht_termijn_gevolg(pg_temp.id('org'), 7), 0);
select pg_temp.als('s');
select pg_temp.gelijk('zorgmedewerker leest de termijn niet', public.overdracht_termijn(pg_temp.id('org')), null::integer);
select pg_temp.als('oa2');
select pg_temp.gelijk('beheerder van een ander WZC ziet niets', public.overdracht_termijn(pg_temp.id('org')), null::integer);
select pg_temp.als('oa');
select pg_temp.geweigerd('korter dan 7 dagen kan niet', format('select public.zet_overdracht_termijn(%L::uuid, 3)', pg_temp.id('org')));
select pg_temp.geweigerd('langer dan een jaar kan niet', format('select public.zet_overdracht_termijn(%L::uuid, 400)', pg_temp.id('org')));
select pg_temp.gelijk('gevolg met 30 dagen: 2 overdrachten', public.overdracht_termijn_gevolg(pg_temp.id('org'), 30), 2);
select pg_temp.gelijk('gevolg met 7 dagen: 3', public.overdracht_termijn_gevolg(pg_temp.id('org'), 7), 3);
select pg_temp.gelijk('zet 60 dagen: 1 zou verdwijnen', public.zet_overdracht_termijn(pg_temp.id('org'), 60), 1);
reset role;

select pg_temp.gelijk('opruimen: per WZC de eigen termijn', public.overdracht_opruimen(), 2);
select pg_temp.gelijk('van WZC Een blijven de recente', (select string_agg(body, ',' order by shift_date desc) from public.handover h
   join public.department d on d.id = h.department_id where d.org_id = pg_temp.id('org')), 'recent,maand oud');
select pg_temp.gelijk('van WZC Twee is de overdracht van 40 dagen weg (termijn 30)', (select count(*) from public.handover h
   join public.department d on d.id = h.department_id where d.org_id = pg_temp.id('org2')), 0::bigint);
select pg_temp.gelijk('alleen de server ruimt op',
  (select count(*) from unnest(array['anon', 'authenticated']) r where has_function_privilege(r, 'public.overdracht_opruimen()', 'execute')), 0::bigint);

rollback;
