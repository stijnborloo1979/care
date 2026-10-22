-- =====================================================================
--  Weekmenu van het woonzorgcentrum (VEREIST_MIGRATIE 108)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid; org2 uuid;
begin
  insert into auth.users (email) select m from unnest(array['m-fa@t', 'm-tab@t', 'm-c1@t', 'm-co@t', 'm-oa@t', 'm-ander@t']) m;
  insert into t_ids select replace(replace(email, 'm-', ''), '@t', ''), id from auth.users where email like 'm-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'tab'), 'person');
  insert into public.organisation (name) values ('WZC Menu') returning id into org;
  insert into public.organisation (name) values ('Ander WZC') returning id into org2;
  insert into t_ids values ('org', org), ('org2', org2);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('c1', 'caregiver'), ('co', 'coordinator'), ('oa', 'org_admin')) x(k, r) join t_ids using (k);
  insert into public.org_membership (org_id, profile_id, role) values (org2, (select v from t_ids where k = 'ander'), 'org_admin');
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
-- Een dag opslaan als SQL-tekst, zodat geweigerd() die kan proberen.
create function pg_temp.bewaar(org text, dag date, soep text, soep_all text) returns text language sql as $$
  select format('select public.menu_bewaar(%L::uuid, %L::date, %L, %L, null, null, null, null, null)', pg_temp.id(org), dag, soep, soep_all) $$;

set local role authenticated;

-- 1. Een medewerker vult een concept in, zonder allergenen
select pg_temp.als('c1');
select pg_temp.gelijk('medewerker slaat een dag op', (select (public.menu_bewaar(pg_temp.id('org'), '2026-10-26', 'Groentesoep', null, 'Kip', null, 'Pudding', null, null)).status), 'concept');

-- 2. Een medewerker mag geen allergenen invullen
select pg_temp.geweigerd('medewerker vult geen allergenen in', pg_temp.bewaar('org', '2026-10-27', 'Tomatensoep', 'gluten'));

-- 3. Een medewerker kan een menu niet direct bevestigen
-- De update slaagt wel, maar de trigger zet de status terug op concept.
update public.org_menu set status = 'gepubliceerd' where org_id = pg_temp.id('org');
select pg_temp.gelijk('medewerker kan niet bevestigen via de tabel', (select status from public.org_menu where org_id = pg_temp.id('org') and datum = '2026-10-26'), 'concept');
select pg_temp.geweigerd('medewerker kan het menu niet bevestigen via de RPC',
  format('select public.menu_publiceer(%L::uuid, ''2026-10-26'', ''2026-10-26'')', pg_temp.id('org')));

-- 4. Een medewerker past een bestaande dag aan, zonder allergenen te wijzigen
select pg_temp.gelijk('medewerker wijzigt het middagmaal', (select (public.menu_bewaar(pg_temp.id('org'), '2026-10-26', 'Groentesoep', null, 'Vis', null, 'Pudding', null, null)).middag), 'Vis');

-- 5. De coördinator vult allergenen in en bevestigt de week
select pg_temp.als('co');
select pg_temp.gelijk('coördinator vult allergenen in', (select (public.menu_bewaar(pg_temp.id('org'), '2026-10-26', 'Groentesoep', 'selderij', 'Vis', 'vis', 'Pudding', 'melk', null)).soep_allergenen), 'selderij');
select pg_temp.gelijk('coördinator bevestigt de week', public.menu_publiceer(pg_temp.id('org'), '2026-10-26', '2026-11-01'), 1);

-- 6. De medewerker past het bevestigde menu aan: het wordt weer concept
select pg_temp.als('c1');
select pg_temp.gelijk('wijziging maakt het menu weer concept', (select (public.menu_bewaar(pg_temp.id('org'), '2026-10-26', 'Pompoensoep', 'selderij', 'Vis', 'vis', 'Pudding', 'melk', null)).status), 'concept');
select pg_temp.gelijk('de allergenen van het bevestigde menu blijven staan', (select soep_allergenen from public.org_menu where org_id = pg_temp.id('org') and datum = '2026-10-26'), 'selderij');
select pg_temp.geweigerd('medewerker kan allergenen niet overschrijven', format(
  'select public.menu_bewaar(%L::uuid, ''2026-10-26'', ''Pompoensoep'', ''gluten'', ''Vis'', ''vis'', ''Pudding'', ''melk'', null)', pg_temp.id('org')));

-- 7. Bewoners en familie zien alleen het bevestigde menu
select pg_temp.als('co');
select pg_temp.gelijk('coördinator bevestigt de dag opnieuw', public.menu_publiceer(pg_temp.id('org'), '2026-10-26', '2026-10-26'), 1);
select pg_temp.als('tab');
select pg_temp.gelijk('bewoner ziet het bevestigde menu', (select count(*) from public.org_menu where org_id = pg_temp.id('org')), 1::bigint);
select pg_temp.als('fa');
select pg_temp.gelijk('familie ziet het bevestigde menu', (select count(*) from public.org_menu where org_id = pg_temp.id('org')), 1::bigint);
select pg_temp.als('ander');
select pg_temp.gelijk('een ander WZC ziet niets', (select count(*) from public.org_menu where org_id = pg_temp.id('org')), 0::bigint);
select pg_temp.geweigerd('een ander WZC vult geen menu in', pg_temp.bewaar('org', '2026-10-28', 'x', null));

-- 8. Het logboek houdt elke opslag bij, en is alleen voor medewerkers
select pg_temp.als('co');
select pg_temp.gelijk('logboek bevat de opslagen', (select count(*) from public.org_menu_logboek where org_id = pg_temp.id('org') and datum = '2026-10-26') >= 4, true);
select pg_temp.als('tab');
select pg_temp.gelijk('bewoner ziet het logboek niet', (select count(*) from public.org_menu_logboek), 0::bigint);
