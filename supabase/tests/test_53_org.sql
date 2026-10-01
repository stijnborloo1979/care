-- =====================================================================
--  J4: een organisatie ziet geen inhoud, een toegewezen medewerker wel
--  (VEREIST_MIGRATIE 53)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant select on t_ids to public;

do $$
declare
  hh uuid; hh2 uuid; org uuid; dep uuid; st uuid;
  u uuid;
begin
  insert into auth.users (email) select m from unnest(array[
    'o-admin@t', 'o-member@t', 'o-orgadmin@t', 'o-coord@t', 'o-staff@t',
    'o-teamlead@t', 'o-anderstaff@t', 'o-thuiszorg@t']) m;
  insert into t_ids select replace(replace(email, 'o-', ''), '@t', ''), id from auth.users where email like 'o-%@t';

  insert into public.household (person_name, timezone, support_level) values ('Bewoner A', 'Europe/Brussels', 'ondersteund') returning id into hh;
  insert into public.household (person_name, timezone, support_level) values ('Bewoner B', 'Europe/Brussels', 'ondersteund') returning id into hh2;
  insert into t_ids values ('hh', hh), ('hh2', hh2);

  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'admin'), 'admin'),
    (hh, (select v from t_ids where k = 'member'), 'member'),
    (hh, (select v from t_ids where k = 'thuiszorg'), 'caregiver');

  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values
    ('orgadmin', 'org_admin'), ('coord', 'coordinator'), ('staff', 'caregiver'),
    ('teamlead', 'coordinator'), ('anderstaff', 'caregiver')) x(k, r)
  join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'Afdeling A') returning id into dep;
  insert into public.department_staff (department_id, profile_id, role)
    values (dep, (select v from t_ids where k = 'teamlead'), 'team_lead');

  -- A en B wonen in het WZC; A op afdeling A, B zonder afdeling
  update public.household set org_id = org where id in (hh, hh2);
  update public.stay set department_id = dep, room = '12' where household_id = hh and ended_at is null;
  insert into public.care_assignment (stay_id, profile_id)
  select id, (select v from t_ids where k = 'staff') from public.stay where household_id = hh and ended_at is null;

  -- inhoud
  insert into public.agenda_event (household_id, starts_at, title, kind) values (hh, now() + interval '1 day', 'Kine', 'appt'), (hh2, now() + interval '1 day', 'Kapper', 'appt');
  insert into public.life_story (household_id, question, body, shared, created_by) values (hh, 'Vertel', 'Een verhaal', true, (select v from t_ids where k = 'admin'));
  insert into public.location_point (household_id, lat, lng) values (hh, 50.8, 4.3);
  insert into public.document (household_id, category, name) values (hh, 'identiteit', 'ID');
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
  exception when others then raise notice 'ok: % (geweigerd)', wat; return; end;
  raise exception 'GEZAKT: % — werd niet geweigerd', wat;
end $$;
create function pg_temp.inhoud(hh uuid) returns bigint language sql as $$
  select (select count(*) from public.agenda_event where household_id = hh)
       + (select count(*) from public.life_story where household_id = hh)
       + (select count(*) from public.location_point where household_id = hh)
       + (select count(*) from public.document where household_id = hh)
$$;

set local role authenticated;

-- Org admin en coördinator: geen inhoud, wel de bewonerslijst
select pg_temp.als('orgadmin');
select pg_temp.gelijk('org admin ziet geen inhoud van A', pg_temp.inhoud(pg_temp.id('hh')), 0);
select pg_temp.gelijk('org admin ziet huishouden A niet', (select count(*) from public.household where id = pg_temp.id('hh')), 0);
select pg_temp.gelijk('org admin ziet de bewonerslijst (2)', (select count(*) from public.org_bewoners(pg_temp.id('org'))), 2);
select pg_temp.gelijk('bewonerslijst toont afdeling en kamer',
  (select count(*) from public.org_bewoners(pg_temp.id('org')) where afdeling = 'Afdeling A' and room = '12'), 1);
select pg_temp.geweigerd('org admin kan geen afspraak via spraak toevoegen',
  format('select public.voice_add_event(%L::uuid, now() + interval ''1 day'', ''x'', ''appt'', '''', '''', gen_random_uuid())', pg_temp.id('hh')));
select pg_temp.geweigerd('org admin kan zichzelf niet toewijzen',
  format('insert into public.care_assignment (stay_id, profile_id) select id, %L::uuid from public.stay where household_id = %L::uuid and ended_at is null',
         pg_temp.id('orgadmin'), pg_temp.id('hh')));

select pg_temp.als('coord');
select pg_temp.gelijk('coördinator zonder toewijzing ziet geen inhoud', pg_temp.inhoud(pg_temp.id('hh')), 0);

-- Toegewezen medewerker: zoals een zorgverlener in Home
select pg_temp.als('staff');
select pg_temp.gelijk('toegewezen medewerker ziet agenda van A', (select count(*) from public.agenda_event where household_id = pg_temp.id('hh')), 1);
select pg_temp.gelijk('toegewezen medewerker ziet gedeeld verhaal van A', (select count(*) from public.life_story where household_id = pg_temp.id('hh')), 1);
select pg_temp.gelijk('toegewezen medewerker ziet geen documenten', (select count(*) from public.document), 0);
select pg_temp.gelijk('toegewezen medewerker ziet niets van B', pg_temp.inhoud(pg_temp.id('hh2')), 0);

-- Team lead van de afdeling
select pg_temp.als('teamlead');
select pg_temp.gelijk('team lead ziet agenda van A (zijn afdeling)', (select count(*) from public.agenda_event where household_id = pg_temp.id('hh')), 1);
select pg_temp.gelijk('team lead ziet niets van B (geen afdeling)', pg_temp.inhoud(pg_temp.id('hh2')), 0);

select pg_temp.als('anderstaff');
select pg_temp.gelijk('niet-toegewezen medewerker ziet niets', pg_temp.inhoud(pg_temp.id('hh')) + pg_temp.inhoud(pg_temp.id('hh2')), 0);

-- Familie en thuiszorg: ongewijzigd
select pg_temp.als('admin');
select pg_temp.gelijk('familiebeheerder ziet alles van A', pg_temp.inhoud(pg_temp.id('hh')), 4);
select pg_temp.als('member');
select pg_temp.gelijk('familielid ziet alles van A', pg_temp.inhoud(pg_temp.id('hh')), 4);
select pg_temp.als('thuiszorg');
select pg_temp.gelijk('thuiszorg via uitnodiging: agenda, verhaal, locatie (geen documenten)', pg_temp.inhoud(pg_temp.id('hh')), 3);
reset role;

-- Ontslag uit de organisatie: toegang weg
update public.org_membership set active = false where profile_id = pg_temp.id('staff');
set local role authenticated;
select pg_temp.als('staff');
select pg_temp.gelijk('medewerker na ontslag ziet niets', pg_temp.inhoud(pg_temp.id('hh')), 0);
reset role;
update public.org_membership set active = true where profile_id = pg_temp.id('staff');

-- Toewijzing verlopen
update public.care_assignment set valid_until = now() - interval '1 minute', valid_from = now() - interval '1 day';
set local role authenticated;
select pg_temp.als('staff');
select pg_temp.gelijk('medewerker na einde toewijzing ziet niets', pg_temp.inhoud(pg_temp.id('hh')), 0);
reset role;

-- Bewoner verlaat het WZC: organisatie weg, familie blijft
update public.care_assignment set valid_until = null;
update public.household set org_id = null where id = pg_temp.id('hh');
set local role authenticated;
select pg_temp.als('staff');
select pg_temp.gelijk('na vertrek: medewerker ziet niets', pg_temp.inhoud(pg_temp.id('hh')), 0);
select pg_temp.als('teamlead');
select pg_temp.gelijk('na vertrek: team lead ziet niets', pg_temp.inhoud(pg_temp.id('hh')), 0);
select pg_temp.als('admin');
select pg_temp.gelijk('na vertrek: familie ziet alles, dagboek bestaat nog', pg_temp.inhoud(pg_temp.id('hh')), 4);
select pg_temp.als('orgadmin');
select pg_temp.gelijk('na vertrek: niet meer op de bewonerslijst', (select count(*) from public.org_bewoners(pg_temp.id('org'))), 1);
reset role;

rollback;
