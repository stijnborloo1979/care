-- =====================================================================
--  Teamberichten per afdeling (VEREIST_MIGRATIE 63)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare org uuid; da uuid; db uuid; hh uuid;
begin
  insert into auth.users (email) select m from unnest(array['t-a1@t', 't-a2@t', 't-b1@t', 't-oa@t', 't-co@t', 't-fa@t']) m;
  insert into t_ids select replace(replace(email, 't-', ''), '@t', ''), id from auth.users where email like 't-%@t';
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('a1', 'caregiver'), ('a2', 'caregiver'), ('b1', 'caregiver'),
    ('oa', 'org_admin'), ('co', 'coordinator')) x(k, r) join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'A') returning id into da;
  insert into public.department (org_id, name) values (org, 'B') returning id into db;
  insert into t_ids values ('da', da), ('db', db);
  insert into public.department_staff (department_id, profile_id, role) values
    (da, (select v from t_ids where k = 'a1'), 'staff'),
    (da, (select v from t_ids where k = 'a2'), 'team_lead'),
    (db, (select v from t_ids where k = 'b1'), 'staff');
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into public.membership (household_id, profile_id, role) values (hh, (select v from t_ids where k = 'fa'), 'admin');
  update public.household set org_id = org where id = hh;
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
create function pg_temp.bericht(dep text, wie text, tekst text) returns text language sql as $$
  select format('insert into public.team_message (department_id, body, author_id) values (%L::uuid, %L, %L::uuid)', pg_temp.id(dep), tekst, pg_temp.id(wie))
$$;
create function pg_temp.aantal() returns bigint language sql as $$ select count(*) from public.team_message $$;

set local role authenticated;
select pg_temp.als('a1');
select pg_temp.bericht('da', 'a1', 'Wie neemt de ronde van 14u?') \gexec
select pg_temp.als('a2');
select pg_temp.bericht('da', 'a2', 'Ik doe ze') \gexec
select pg_temp.geweigerd('namens een collega schrijven', pg_temp.bericht('da', 'a1', 'x'));
select pg_temp.geweigerd('in een andere afdeling schrijven', pg_temp.bericht('db', 'a2', 'x'));

select pg_temp.als('a1');
select pg_temp.gelijk('collega op de afdeling leest', pg_temp.aantal(), 2::bigint);
select pg_temp.als('b1');
select pg_temp.gelijk('andere afdeling leest niets', pg_temp.aantal(), 0::bigint);
select pg_temp.als('oa');
select pg_temp.gelijk('org admin zonder afdeling leest niets', pg_temp.aantal(), 0::bigint);
select pg_temp.geweigerd('org admin zonder afdeling schrijft niet', pg_temp.bericht('da', 'oa', 'x'));
select pg_temp.als('co');
select pg_temp.gelijk('coördinator zonder afdeling leest niets', pg_temp.aantal(), 0::bigint);
select pg_temp.als('fa');
select pg_temp.gelijk('familie leest niets', pg_temp.aantal(), 0::bigint);

-- Aanpassen kan niet; wissen alleen eigen bericht binnen 10 minuten
select pg_temp.als('a2');
select pg_temp.geweigerd('aanpassen', 'update public.team_message set body = ''anders''');
delete from public.team_message where body = 'Wie neemt de ronde van 14u?';
select pg_temp.gelijk('een bericht van een ander wissen lukt niet', pg_temp.aantal(), 2::bigint);
delete from public.team_message where body = 'Ik doe ze';
select pg_temp.gelijk('eigen bericht binnen 10 minuten wissen', pg_temp.aantal(), 1::bigint);
reset role;
update public.team_message set created_at = now() - interval '11 minutes';
set local role authenticated;
select pg_temp.als('a1');
delete from public.team_message;
select pg_temp.gelijk('na 10 minuten niet meer', pg_temp.aantal(), 1::bigint);

-- De tijd komt van de server
insert into public.team_message (department_id, body, author_id, created_at)
  values (pg_temp.id('da'), 'Terug in de tijd', pg_temp.id('a1'), now() + interval '1 year');
reset role;
select pg_temp.gelijk('tijd van de server', (select count(*) from public.team_message where body = 'Terug in de tijd' and created_at <= now()), 1::bigint);

-- Bewaartermijn
update public.team_message set created_at = now() - interval '40 days' where body = 'Wie neemt de ronde van 14u?';
set local role authenticated;
select pg_temp.als('co');
select pg_temp.gelijk('coördinator leest de termijn', public.teambericht_termijn(pg_temp.id('org')), 30);
select pg_temp.geweigerd('coördinator zet ze niet', format('select public.zet_teambericht_termijn(%L::uuid, 60)', pg_temp.id('org')));
select pg_temp.als('oa');
select pg_temp.gelijk('gevolg met 30 dagen: 1', public.teambericht_termijn_gevolg(pg_temp.id('org'), 30), 1);
select pg_temp.geweigerd('korter dan een week', format('select public.zet_teambericht_termijn(%L::uuid, 3)', pg_temp.id('org')));
select pg_temp.gelijk('zet 60 dagen: 0 zouden verdwijnen', public.zet_teambericht_termijn(pg_temp.id('org'), 60), 0);
reset role;
select pg_temp.gelijk('opruimen met 60 dagen: niets', public.teambericht_opruimen(), 0);
update public.organisation set teambericht_bewaar_dagen = 30 where id = pg_temp.id('org');
select pg_temp.gelijk('opruimen met 30 dagen: het oude bericht', public.teambericht_opruimen(), 1);
select pg_temp.gelijk('alleen de server ruimt op',
  (select count(*) from unnest(array['anon', 'authenticated']) r where has_function_privilege(r, 'public.teambericht_opruimen()', 'execute')), 0::bigint);

rollback;
