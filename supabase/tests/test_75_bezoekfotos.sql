-- =====================================================================
--  Bezoekfoto's blijven bij hun bezoek (VEREIST_MIGRATIE 75)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid;
begin
  insert into auth.users (email) select m from unnest(array['f-fa@t', 'f-els@t', 'f-jan@t']) m;
  insert into t_ids select replace(replace(email, 'f-', ''), '@t', ''), id from auth.users where email like 'f-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'els'), 'member'),
    (hh, (select v from t_ids where k = 'jan'), 'member');
  insert into storage.buckets (id, name) values ('memories', 'memories') on conflict do nothing;
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
create temp table t_pad (k text primary key, v text);
grant all on t_pad to public;

set local role authenticated;

-- Els legt een bezoek vast en plaatst er een foto bij
select pg_temp.als('els');
insert into public.visit_log (household_id, visitor_name) values (pg_temp.id('hh'), 'Els');
insert into t_pad select 'els', household_id::text || '/bezoek/' || id::text || '-a.jpg' from public.visit_log where visitor_name = 'Els';
insert into storage.objects (bucket_id, name) select 'memories', v from t_pad where k = 'els';
update public.visit_log set photo_path = (select v from t_pad where k = 'els') where visitor_name = 'Els';
select pg_temp.gelijk('Els plaatst de foto bij haar bezoek', (select count(*) from storage.objects where name = (select v from t_pad where k = 'els')), 1::bigint);

-- Jan plaatst niets bij het bezoek van Els, en wist haar foto niet
select pg_temp.als('jan');
select pg_temp.geweigerd('Jan zet geen bestand bij het bezoek van Els',
  format('insert into storage.objects (bucket_id, name) values (''memories'', %L)',
         pg_temp.id('hh')::text || '/bezoek/' || (select id::text from public.visit_log where visitor_name = 'Els') || '-b.jpg'));
select pg_temp.geweigerd('Jan zet geen bestand in de map zonder bezoek',
  format('insert into storage.objects (bucket_id, name) values (''memories'', %L)', pg_temp.id('hh')::text || '/bezoek/los.jpg'));
delete from storage.objects where name = (select v from t_pad where k = 'els');
select pg_temp.gelijk('Jan wist de foto van Els niet', (select count(*) from storage.objects where name = (select v from t_pad where k = 'els')), 1::bigint);

-- Buiten de map bezoek verandert niets
insert into storage.objects (bucket_id, name) values ('memories', pg_temp.id('hh')::text || '/photos/x/y.jpg');
select pg_temp.gelijk('gewone herinneringsfoto blijft zoals voorheen',
  (select count(*) from storage.objects where name = pg_temp.id('hh')::text || '/photos/x/y.jpg'), 1::bigint);

-- De familiebeheerder mag de foto wel wissen
select pg_temp.als('fa');
delete from storage.objects where name = (select v from t_pad where k = 'els');
select pg_temp.gelijk('familiebeheerder wist', (select count(*) from storage.objects where name = (select v from t_pad where k = 'els')), 0::bigint);

-- Een foto waar (nog) geen bezoek naar wijst
reset role;
insert into storage.objects (bucket_id, name, owner) select 'memories', v, pg_temp.id('els') from t_pad where k = 'els';
update public.visit_log set photo_path = null where visitor_name = 'Els';
set local role authenticated;
select pg_temp.als('jan');
delete from storage.objects where name = (select v from t_pad where k = 'els');
select pg_temp.gelijk('net geplaatst door een ander: Jan wist niet', (select count(*) from storage.objects where name = (select v from t_pad where k = 'els')), 1::bigint);
reset role;
update storage.objects set created_at = now() - interval '2 hours' where name = (select v from t_pad where k = 'els');
set local role authenticated;
select pg_temp.als('jan');
delete from storage.objects where name = (select v from t_pad where k = 'els');
select pg_temp.gelijk('na een uur mag een verweesde bezoekfoto weg', (select count(*) from storage.objects where name = (select v from t_pad where k = 'els')), 0::bigint);

rollback;
