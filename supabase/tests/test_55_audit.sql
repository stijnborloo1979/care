-- =====================================================================
--  Leesaudit en wijzigingslog (VEREIST_MIGRATIE 55)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid; org2 uuid;
begin
  insert into auth.users (email) select m from unnest(array[
    'a-fa@t', 'a-fm@t', 'a-r@t', 'a-vreemd@t', 'a-orgadmin@t', 'a-staff@t', 'a-ander@t']) m;
  insert into t_ids select replace(replace(email, 'a-', ''), '@t', ''), id from auth.users where email like 'a-%@t';

  insert into public.household (person_name, timezone, support_level) values ('Bewoner', 'Europe/Brussels', 'ondersteund') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'fm'), 'member');
  insert into public.person_card (household_id, profile_id, name, relation, kind)
    values (hh, (select v from t_ids where k = 'r'), 'Bewoner', 'jij', 'self');

  insert into public.document (household_id, category, name, storage_path) values (hh, 'identiteit', 'ID', 'pad/id.pdf');
  insert into t_ids select 'doc', id from public.document where household_id = hh;
  insert into public.life_story (household_id, question, audio_path, shared, created_by)
    values (hh, 'Gedeeld', 'verhalen/a.webm', true, (select v from t_ids where k = 'r'));
  insert into public.life_story (household_id, question, audio_path, shared, created_by)
    values (hh, 'Prive', 'verhalen/b.webm', false, (select v from t_ids where k = 'r'));
  insert into t_ids select 'gedeeld', id from public.life_story where question = 'Gedeeld';
  insert into t_ids select 'prive', id from public.life_story where question = 'Prive';
  insert into public.location_point (household_id, lat, lng) values (hh, 50.85, 4.35);

  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into public.organisation (name) values ('Ander WZC') returning id into org2;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role) values
    (org, (select v from t_ids where k = 'orgadmin'), 'org_admin'),
    (org, (select v from t_ids where k = 'staff'), 'caregiver'),
    (org2, (select v from t_ids where k = 'ander'), 'org_admin');
end $$;

create function pg_temp.als(k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select v from t_ids where t_ids.k = als.k), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t_ids where t_ids.k = id.k $$;
create function pg_temp.gelijk(wat text, kreeg bigint, verwacht bigint) returns void language plpgsql as $$
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
create function pg_temp.inzages(tabel text) returns bigint language sql security definer as $$
  select count(*) from public.audit_log where action = 'inzage' and table_name = tabel
$$;

-- De bestaande log uit 01 werkt zoals voorheen
select pg_temp.gelijk('nieuwe lidmaatschappen gelogd (bestaande trigger, één regel per lid)',
  (select count(*) from public.audit_log where table_name = 'membership' and action = 'INSERT' and household_id = pg_temp.id('hh')), 2);

set local role authenticated;

-- Documenten
select pg_temp.als('fm');
select pg_temp.gelijk('familielid opent document en krijgt het pad', (select count(*) from public.open_document(pg_temp.id('doc')) p where p = 'pad/id.pdf'), 1);
select pg_temp.gelijk('inzage gelogd', pg_temp.inzages('document'), 1);
select public.open_document(pg_temp.id('doc'));
select pg_temp.gelijk('nog eens openen binnen 10 minuten: geen tweede regel', pg_temp.inzages('document'), 1);
select pg_temp.als('fa');
select public.open_document(pg_temp.id('doc'));
select pg_temp.gelijk('familiebeheerder opent: eigen regel', pg_temp.inzages('document'), 2);
select pg_temp.als('vreemd');
select pg_temp.geweigerd('vreemde opent geen document', format('select public.open_document(%L::uuid)', pg_temp.id('doc')));
select pg_temp.gelijk('vreemde laat geen regel achter', pg_temp.inzages('document'), 2);

-- Opnames
select pg_temp.als('fm');
select pg_temp.gelijk('familielid speelt gedeelde opname', (select count(*) from public.open_verhaal_opname(pg_temp.id('gedeeld')) p where p = 'verhalen/a.webm'), 1);
select pg_temp.gelijk('opname gelogd', pg_temp.inzages('life_story'), 1);
select pg_temp.geweigerd('privé-opname blijft dicht', format('select public.open_verhaal_opname(%L::uuid)', pg_temp.id('prive')));
select pg_temp.als('r');
select pg_temp.gelijk('bewoner speelt haar privé-opname', (select count(*) from public.open_verhaal_opname(pg_temp.id('prive')) p where p = 'verhalen/b.webm'), 1);
select pg_temp.gelijk('bewoner zelf wordt niet gelogd', pg_temp.inzages('life_story'), 1);

-- Locatie: zelfde antwoord als voorheen, nu met log
select pg_temp.als('fa');
select pg_temp.gelijk('last_location geeft de laatste positie', (select count(*) from public.last_location(pg_temp.id('hh')) where lat = 50.85 and lng = 4.35), 1);
select pg_temp.gelijk('locatie gelogd', pg_temp.inzages('location_point'), 1);
select public.last_location(pg_temp.id('hh'));
select public.last_location(pg_temp.id('hh'));
select pg_temp.gelijk('verversen binnen 30 minuten: één regel', pg_temp.inzages('location_point'), 1);
select pg_temp.als('vreemd');
select pg_temp.gelijk('vreemde krijgt geen positie', (select count(*) from public.last_location(pg_temp.id('hh'))), 0);
select pg_temp.gelijk('en laat geen regel achter', pg_temp.inzages('location_point'), 1);

-- Rechtstreeks loggen of knoeien
select pg_temp.geweigerd('vreemde kan geen inzage loggen', format('select public.audit_inzage(%L::uuid, ''document'', null)', pg_temp.id('hh')));
select pg_temp.als('fa');
select pg_temp.geweigerd('onbekende soort inzage', format('select public.audit_inzage(%L::uuid, ''household'', null)', pg_temp.id('hh')));
select pg_temp.geweigerd('rechtstreeks in de log schrijven', format('insert into public.audit_log (household_id, table_name, action) values (%L::uuid, ''x'', ''inzage'')', pg_temp.id('hh')));
select pg_temp.geweigerd('de log wissen', 'delete from public.audit_log');
select pg_temp.geweigerd('de log aanpassen', 'update public.audit_log set actor_id = null');

-- Wie mag
update public.membership set role = 'admin' where profile_id = pg_temp.id('fm') and household_id = pg_temp.id('hh');
reset role;
select pg_temp.gelijk('rolwijziging gelogd, één keer (bestaande trigger)',
  (select count(*) from public.audit_log where table_name = 'membership' and action = 'UPDATE'
      and actor_id = pg_temp.id('fa')), 1);
update public.membership set role = 'member' where profile_id = pg_temp.id('fm');

-- Verblijf en toewijzing
update public.household set org_id = pg_temp.id('org') where id = pg_temp.id('hh');
insert into public.care_assignment (stay_id, profile_id)
select id, pg_temp.id('staff') from public.stay where household_id = pg_temp.id('hh') and ended_at is null;
select pg_temp.gelijk('verblijf en toewijzing gelogd, met organisatie',
  (select count(*) from public.audit_log where table_name in ('stay', 'care_assignment') and action = 'INSERT'
      and household_id = pg_temp.id('hh') and org_id = pg_temp.id('org')), 2);

-- Wie leest de log
set local role authenticated;
select pg_temp.als('fa');
select pg_temp.gelijk('familiebeheerder ziet alle inzages van zijn huishouden',
  (select count(*) from public.audit_log where action = 'inzage'), 4);
select pg_temp.als('fm');
select pg_temp.gelijk('familielid (geen beheerder) ziet de log niet', (select count(*) from public.audit_log), 0);
select pg_temp.als('orgadmin');
select pg_temp.gelijk('org admin ziet verblijf en toewijzing', (select count(*) from public.audit_log where table_name in ('stay', 'care_assignment')), 2);
select pg_temp.gelijk('org admin ziet niet wie van de familie wat las', (select count(*) from public.audit_log where action = 'inzage'), 0);
select pg_temp.gelijk('org admin ziet geen familierollen of documentwijzigingen', (select count(*) from public.audit_log where table_name in ('membership', 'document')), 0);
select pg_temp.als('ander');
select pg_temp.gelijk('andere organisatie ziet niets van dit WZC of deze bewoner',
  (select count(*) from public.audit_log where org_id = pg_temp.id('org') or household_id = pg_temp.id('hh')), 0);
select pg_temp.gelijk('maar wel de wijziging in de eigen organisatie', (select count(*) from public.audit_log where table_name = 'org_membership'), 1);

-- Toegewezen medewerker wordt ook gelogd
select pg_temp.als('staff');
select public.last_location(pg_temp.id('hh'));
reset role;
select pg_temp.gelijk('toegewezen medewerker bekeek de locatie: gelogd met rol',
  (select count(*) from public.audit_log where action = 'inzage' and actor_id = pg_temp.id('staff') and detail ->> 'rol' = 'caregiver'), 1);

-- Een gewist huishouden: de nieuwe triggers schrijven niets bij
-- (de bestaande uit 01 doet dat wel; dat gedrag is niet veranderd)
create temp table t_voor as select count(*) n from public.audit_log where table_name in ('stay', 'care_assignment', 'org_membership', 'department_staff');
delete from public.household where id = pg_temp.id('hh');
select pg_temp.gelijk('wissen schrijft geen nieuwe verblijf- of toewijzingsregels',
  (select count(*) from public.audit_log where table_name in ('stay', 'care_assignment', 'org_membership', 'department_staff')) - (select n from t_voor), 0);

-- Anon
select pg_temp.gelijk('anon kan niets loggen of openen',
  (select count(*) from unnest(array['public.audit_inzage(uuid,text,uuid)', 'public.open_document(uuid)',
     'public.open_verhaal_opname(uuid)', 'public.audit_wijziging()']) f
    where has_function_privilege('anon', f, 'execute')), 0);

rollback;
