-- =====================================================================
--  Bewaartermijn per WZC (VEREIST_MIGRATIE 61)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid;
begin
  insert into auth.users (email) select m from unnest(array['b-oa@t', 'b-co@t', 'b-s@t', 'b-fa@t']) m;
  insert into t_ids select replace(replace(email, 'b-', ''), '@t', ''), id from auth.users where email like 'b-%@t';
  insert into public.household (person_name, timezone) values ('Rita', 'Europe/Brussels') returning id into hh;
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into t_ids values ('hh', hh), ('org', org);
  insert into public.org_membership (org_id, profile_id, role) values
    (org, (select v from t_ids where k = 'oa'), 'org_admin'),
    (org, (select v from t_ids where k = 'co'), 'coordinator'),
    (org, (select v from t_ids where k = 's'), 'caregiver');
  update public.household set org_id = org where id = hh;
  insert into public.care_assignment (stay_id, profile_id)
    select id, (select v from t_ids where k = 's') from public.stay where household_id = hh;
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
create function pg_temp.maanden_na_vertrek() returns integer language sql security definer as $$
  select (extract(year from age(n.retention_until, s.ended_at)) * 12 + extract(month from age(n.retention_until, s.ended_at)))::int
    from public.care_note n join public.stay s on s.id = n.stay_id limit 1
$$;

select pg_temp.gelijk('standaard 24 maanden', (select bewaartermijn_maanden from public.organisation where id = pg_temp.id('org')), 24);

set local role authenticated;
select pg_temp.als('s');
insert into public.care_note (household_id, body) values (pg_temp.id('hh'), 'Goed geslapen');
insert into public.care_note (household_id, body) values (pg_temp.id('hh'), 'Wandeling gemaakt');

select pg_temp.als('co');
select pg_temp.gelijk('coördinator leest de termijn', public.bewaartermijn(pg_temp.id('org')), 24);
select pg_temp.geweigerd('coördinator zet de termijn niet', format('select public.zet_bewaartermijn(%L::uuid, 12)', pg_temp.id('org')));
select pg_temp.als('s');
select pg_temp.gelijk('zorgmedewerker leest de termijn niet', public.bewaartermijn(pg_temp.id('org')), null::integer);
select pg_temp.als('oa');
select pg_temp.geweigerd('korter dan 6 maanden kan niet', format('select public.zet_bewaartermijn(%L::uuid, 3)', pg_temp.id('org')));
select pg_temp.geweigerd('langer dan 120 maanden kan niet', format('select public.zet_bewaartermijn(%L::uuid, 200)', pg_temp.id('org')));
select pg_temp.gelijk('beheerder zet 12 maanden; nog niets binnenkort gewist', public.zet_bewaartermijn(pg_temp.id('org'), 12), 0);
reset role;

select pg_temp.gelijk('wie er nog woont, heeft nog geen termijn',
  (select count(*) from public.care_note where retention_until is null), 2::bigint);

-- Vertrek: de termijn van dit WZC
update public.household set org_id = null where id = pg_temp.id('hh');
select pg_temp.gelijk('bij vertrek: 12 maanden', pg_temp.maanden_na_vertrek(), 12);

-- Termijn wijzigen geldt ook voor wie al vertrokken is
set local role authenticated;
select pg_temp.als('oa');
select public.zet_bewaartermijn(pg_temp.id('org'), 36);
reset role;
select pg_temp.gelijk('na wijziging: 36 maanden, ook voor wie al vertrok', pg_temp.maanden_na_vertrek(), 36);

-- Gevolg van een kortere termijn: lang geleden vertrokken
update public.stay set started_at = now() - interval '3 years', ended_at = now() - interval '2 years' where household_id = pg_temp.id('hh');
set local role authenticated;
select pg_temp.als('oa');
select pg_temp.gelijk('met 12 maanden worden 2 notities binnen de week gewist', public.bewaartermijn_gevolg(pg_temp.id('org'), 12), 2);
select pg_temp.gelijk('met 36 maanden niet', public.bewaartermijn_gevolg(pg_temp.id('org'), 36), 0);
select pg_temp.als('co');
select pg_temp.gelijk('coördinator krijgt geen telling', public.bewaartermijn_gevolg(pg_temp.id('org'), 12), 0);
select pg_temp.als('oa');
select pg_temp.gelijk('zet 12: geeft het aantal terug', public.zet_bewaartermijn(pg_temp.id('org'), 12), 2);
reset role;
select pg_temp.gelijk('de opruiming wist ze', public.care_note_opruimen(), 2);

rollback;
