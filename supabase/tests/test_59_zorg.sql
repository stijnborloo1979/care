-- =====================================================================
--  Zorgnotities, overdracht en activiteiten (VEREIST_MIGRATIE 59)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; hh2 uuid; org uuid; org2 uuid; da uuid; db uuid;
begin
  insert into auth.users (email) select m from unnest(array[
    'z-r@t', 'z-fa@t', 'z-fm@t', 'z-s@t', 'z-s2@t', 'z-ta@t', 'z-tb@t', 'z-oa@t', 'z-co@t', 'z-x@t']) m;
  insert into t_ids select replace(replace(email, 'z-', ''), '@t', ''), id from auth.users where email like 'z-%@t';

  insert into public.household (person_name, timezone, support_level) values ('Rita', 'Europe/Brussels', 'ondersteund') returning id into hh;
  insert into public.household (person_name, timezone) values ('Roger', 'Europe/Brussels') returning id into hh2;
  insert into t_ids values ('hh', hh), ('hh2', hh2);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'fm'), 'member');
  insert into public.person_card (household_id, profile_id, name, relation, kind)
    values (hh, (select v from t_ids where k = 'r'), 'Rita', 'jij', 'self');

  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into public.organisation (name) values ('Ander') returning id into org2;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select o, v, r::public.org_role from (values
    (org, 's', 'caregiver'), (org, 's2', 'caregiver'), (org, 'ta', 'coordinator'), (org, 'tb', 'coordinator'),
    (org, 'oa', 'org_admin'), (org, 'co', 'coordinator'), (org2, 'x', 'caregiver')) x(o, k, r)
  join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'A') returning id into da;
  insert into public.department (org_id, name) values (org, 'B') returning id into db;
  insert into t_ids values ('da', da), ('db', db);
  insert into public.department_staff (department_id, profile_id, role) values
    (da, (select v from t_ids where k = 'ta'), 'team_lead'),
    (db, (select v from t_ids where k = 'tb'), 'team_lead'),
    (da, (select v from t_ids where k = 's'), 'staff');

  update public.household set org_id = org where id in (hh, hh2);
  update public.stay set department_id = da where household_id = hh;
  update public.stay set department_id = db where household_id = hh2;
  insert into public.care_assignment (stay_id, profile_id)
    select id, (select v from t_ids where k = 's') from public.stay where household_id = hh;
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
create function pg_temp.notitie(hh text, tekst text, zicht text default 'team') returns text language sql as $$
  select format('insert into public.care_note (household_id, body, visibility) values (%L::uuid, %L, %L)', pg_temp.id(hh), tekst, zicht)
$$;
create function pg_temp.act(t text) returns uuid language sql security definer as $$
  select id from public.activity where titel = t
$$;
create function pg_temp.notities() returns bigint language sql as $$ select count(*) from public.care_note $$;

set local role authenticated;

-- ---- Zorgnotities ---------------------------------------------------
select pg_temp.als('s');
select pg_temp.notitie('hh', 'Slecht geslapen, onrustig rond 3u') \gexec
select pg_temp.notitie('hh', 'Goed gegeten, opgewekt bij de activiteit', 'familie') \gexec
-- De app kan auteur, verblijf en organisatie niet zelf kiezen
insert into public.care_note (household_id, body, author_id, org_id, stay_id)
  select pg_temp.id('hh'), 'Gespoofd', pg_temp.id('oa'), pg_temp.id('org'), id from public.stay where household_id = pg_temp.id('hh2');
reset role;
select pg_temp.gelijk('auteur en verblijf komen altijd van de server',
  (select count(*) from public.care_note n join public.stay s on s.id = n.stay_id
    where n.body = 'Gespoofd' and n.author_id = pg_temp.id('s') and s.household_id = pg_temp.id('hh')), 1);
set local role authenticated;

select pg_temp.als('s2');
select pg_temp.geweigerd('niet-toegewezen medewerker schrijft niet', pg_temp.notitie('hh', 'x'));
select pg_temp.als('oa');
select pg_temp.geweigerd('org admin schrijft niet', pg_temp.notitie('hh', 'x'));
select pg_temp.als('fa');
select pg_temp.geweigerd('familie schrijft geen zorgnotitie', pg_temp.notitie('hh', 'x'));
select pg_temp.als('s');
select pg_temp.geweigerd('een notitie over een bewoner die je niet toegewezen bent', pg_temp.notitie('hh2', 'x'));
select pg_temp.geweigerd('een notitie aanpassen', 'update public.care_note set body = ''anders''');
select pg_temp.geweigerd('een notitie wissen', 'delete from public.care_note');

-- Lezen
select pg_temp.gelijk('toegewezen medewerker leest alles', pg_temp.notities(), 3);
select pg_temp.als('ta');
select pg_temp.gelijk('team lead van de afdeling leest alles', pg_temp.notities(), 3);
select pg_temp.als('tb');
select pg_temp.gelijk('team lead van een andere afdeling leest niets', pg_temp.notities(), 0);
select pg_temp.als('s2');
select pg_temp.gelijk('niet-toegewezen medewerker leest niets', pg_temp.notities(), 0);
select pg_temp.als('oa');
select pg_temp.gelijk('org admin leest niets (J4)', pg_temp.notities(), 0);
select pg_temp.als('x');
select pg_temp.gelijk('andere organisatie leest niets', pg_temp.notities(), 0);
select pg_temp.als('fa');
select pg_temp.gelijk('familiebeheerder leest alleen notities voor familie', pg_temp.notities(), 1);
select pg_temp.als('fm');
select pg_temp.gelijk('familielid leest alleen notities voor familie', pg_temp.notities(), 1);
select pg_temp.als('r');
select pg_temp.gelijk('de bewoner leest de notities voor familie', pg_temp.notities(), 1);

-- Correctie: een nieuwe notitie die naar de oude verwijst
select pg_temp.als('s');
insert into public.care_note (household_id, body, vervangt)
  select pg_temp.id('hh'), 'Correctie: onrustig rond 4u', id from public.care_note where body like 'Slecht geslapen%';
select pg_temp.gelijk('correctie toegevoegd, het origineel blijft', pg_temp.notities(), 4);

-- Zonder toestemming om mee te kijken ziet familie niets meer, de bewoner wel
reset role;
update public.household set support_level = 'zelf' where id = pg_temp.id('hh');
set local role authenticated;
select pg_temp.als('fa');
select pg_temp.gelijk('fase zelf: familie leest geen zorgnotities', pg_temp.notities(), 0);
select pg_temp.als('r');
select pg_temp.gelijk('fase zelf: de bewoner wel', pg_temp.notities(), 1);
reset role;
update public.household set support_level = 'ondersteund' where id = pg_temp.id('hh');
set local role authenticated;

-- Noodtoegang leest de zorgnotities van de laatste 24 uur
select pg_temp.als('tb');
insert into t_ids select 'nood', public.start_noodtoegang(pg_temp.id('hh'), 'Valalarm op kamer 12, nachtdienst');
select pg_temp.gelijk('noodtoegang: zorgnotities erbij',
  (select jsonb_array_length(public.nood_inzage(pg_temp.id('nood')) -> 'zorgnotities')), 4);

-- ---- Overdracht -----------------------------------------------------
select pg_temp.als('ta');
insert into public.handover (department_id, shift_date, shift, body, author_id)
  values (pg_temp.id('da'), current_date, 'nacht', 'Rita onrustig, kamer 12 nakijken', pg_temp.id('ta'));
select pg_temp.als('s');
insert into public.handover (department_id, shift_date, shift, body, author_id)
  values (pg_temp.id('da'), current_date, 'vroeg', 'Alles rustig', pg_temp.id('s'));
select pg_temp.gelijk('medewerker van de afdeling leest de overdracht', (select count(*) from public.handover), 2);
select pg_temp.geweigerd('overdracht namens een ander', format(
  'insert into public.handover (department_id, shift_date, shift, body, author_id) values (%L::uuid, current_date, ''laat'', ''x'', %L::uuid)',
  pg_temp.id('da'), pg_temp.id('ta')));
select pg_temp.als('s2');
select pg_temp.geweigerd('medewerker van geen afdeling schrijft geen overdracht', format(
  'insert into public.handover (department_id, shift_date, shift, body, author_id) values (%L::uuid, current_date, ''laat'', ''x'', %L::uuid)',
  pg_temp.id('da'), pg_temp.id('s2')));
select pg_temp.als('tb');
select pg_temp.gelijk('andere afdeling leest de overdracht niet', (select count(*) from public.handover), 0);
select pg_temp.als('oa');
select pg_temp.gelijk('org admin leest de overdracht niet', (select count(*) from public.handover), 0);
select pg_temp.als('fa');
select pg_temp.gelijk('familie leest de overdracht niet', (select count(*) from public.handover), 0);

-- ---- Activiteiten ---------------------------------------------------
select pg_temp.als('co');
insert into public.activity (org_id, titel, starts_at) values (pg_temp.id('org'), 'Zingen', now() + interval '1 day');
select pg_temp.als('ta');
insert into public.activity (org_id, department_id, titel, starts_at) values (pg_temp.id('org'), pg_temp.id('da'), 'Wandeling', now() + interval '2 days');
select pg_temp.als('s');
select pg_temp.geweigerd('zorgmedewerker plant geen activiteit', format(
  'insert into public.activity (org_id, titel, starts_at) values (%L::uuid, ''x'', now())', pg_temp.id('org')));
select pg_temp.gelijk('medewerker ziet de activiteiten', (select count(*) from public.activity), 2);
select pg_temp.als('r');
select pg_temp.gelijk('bewoner ziet de activiteiten', (select count(*) from public.activity), 2);
select pg_temp.als('fm');
select pg_temp.gelijk('familie ziet de activiteiten', (select count(*) from public.activity), 2);
select pg_temp.als('x');
select pg_temp.gelijk('andere organisatie ziet ze niet', (select count(*) from public.activity), 0);

-- Deelname
select pg_temp.als('fa');
insert into public.activity_participant (activity_id, household_id)
  select id, pg_temp.id('hh') from public.activity where titel = 'Zingen';
select pg_temp.als('fm');
select pg_temp.geweigerd('familielid (geen beheerder) schrijft niet in', format(
  'insert into public.activity_participant (activity_id, household_id) values (%L::uuid, %L::uuid)', pg_temp.act('Wandeling'), pg_temp.id('hh')));
select pg_temp.als('s');
select pg_temp.geweigerd('medewerker schrijft geen bewoner in die hij niet volgt', format(
  'insert into public.activity_participant (activity_id, household_id) values (%L::uuid, %L::uuid)', pg_temp.act('Zingen'), pg_temp.id('hh2')));
select pg_temp.als('tb');
insert into public.activity_participant (activity_id, household_id)
  select id, pg_temp.id('hh2') from public.activity where titel = 'Zingen';
select pg_temp.als('s');
update public.activity_participant set status = 'aanwezig' where household_id = pg_temp.id('hh');
select pg_temp.gelijk('team ziet de deelnemerslijst', (select count(*) from public.activity_participant), 2);
select pg_temp.als('fa');
select pg_temp.gelijk('familie ziet alleen de eigen deelname', (select count(*) from public.activity_participant), 1);
select pg_temp.gelijk('aanwezigheid aangeduid door het team', (select count(*) from public.activity_participant where status = 'aanwezig'), 1);

-- ---- Vertrek uit het WZC --------------------------------------------
reset role;
update public.household set org_id = null where id = pg_temp.id('hh');
select pg_temp.gelijk('bij vertrek krijgen de notities een bewaartermijn van 2 jaar',
  (select count(*) from public.care_note n join public.stay s on s.id = n.stay_id
    where n.household_id = pg_temp.id('hh') and n.retention_until = s.ended_at + interval '2 years'), 4);
set local role authenticated;
select pg_temp.als('s');
select pg_temp.gelijk('na vertrek leest de medewerker niets meer', pg_temp.notities(), 0);
select pg_temp.geweigerd('na vertrek geen nieuwe notitie', pg_temp.notitie('hh', 'x'));
select pg_temp.als('fa');
select pg_temp.geweigerd('na vertrek geen inschrijving meer', format(
  'insert into public.activity_participant (activity_id, household_id) values (%L::uuid, %L::uuid)', pg_temp.act('Wandeling'), pg_temp.id('hh')));
reset role;

-- Opruimen na de bewaartermijn
update public.care_note set retention_until = now() - interval '1 day' where household_id = pg_temp.id('hh');
select pg_temp.gelijk('opruimen wist wat over de termijn is', public.care_note_opruimen(), 4);
select pg_temp.gelijk('alleen de server kan opruimen',
  (select count(*) from unnest(array['anon', 'authenticated']) r where has_function_privilege(r, 'public.care_note_opruimen()', 'execute')), 0);

rollback;
