-- =====================================================================
--  Noodtoegang (VEREIST_MIGRATIE 54)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare
  org uuid; org2 uuid; depa uuid; depb uuid; a uuid; b uuid; c uuid;
begin
  insert into auth.users (email) select m from unnest(array[
    'n-ta@t', 'n-tb@t', 'n-t2@t', 'n-staff@t', 'n-orgadmin@t', 'n-fa@t', 'n-fm@t']) m;
  insert into t_ids select replace(replace(email, 'n-', ''), '@t', ''), id from auth.users where email like 'n-%@t';
  update public.profile set full_name = 'Tine Teamlead' where id = (select v from t_ids where k = 'ta');

  insert into public.household (person_name, timezone) values ('Bewoner A', 'Europe/Brussels') returning id into a;
  insert into public.household (person_name, timezone) values ('Bewoner B', 'Europe/Brussels') returning id into b;
  insert into public.household (person_name, timezone) values ('Thuis C', 'Europe/Brussels') returning id into c;
  insert into t_ids values ('a', a), ('b', b), ('c', c);
  insert into public.membership (household_id, profile_id, role) values
    (b, (select v from t_ids where k = 'fa'), 'admin'),
    (b, (select v from t_ids where k = 'fm'), 'member');

  insert into public.organisation (name) values ('WZC Zon') returning id into org;
  insert into public.organisation (name) values ('WZC Maan') returning id into org2;
  insert into public.org_membership (org_id, profile_id, role)
  select o, v, r::public.org_role from (values
    (org, 'ta', 'coordinator'), (org, 'tb', 'coordinator'), (org, 'staff', 'caregiver'),
    (org, 'orgadmin', 'org_admin'), (org2, 't2', 'coordinator')) x(o, k, r)
  join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'Afdeling A') returning id into depa;
  insert into public.department (org_id, name) values (org, 'Afdeling B') returning id into depb;
  insert into public.department_staff (department_id, profile_id, role) values
    (depa, (select v from t_ids where k = 'ta'), 'team_lead'),
    (depb, (select v from t_ids where k = 'tb'), 'team_lead'),
    (depa, (select v from t_ids where k = 'staff'), 'staff');
end $$;

do $$
declare d2 uuid; org uuid; org2 uuid;
begin
  select id into org from public.organisation where name = 'WZC Zon';
  select id into org2 from public.organisation where name = 'WZC Maan';
  insert into public.department (org_id, name) values (org2, 'Maan 1') returning id into d2;
  insert into public.department_staff (department_id, profile_id, role) values (d2, (select v from t_ids where k = 't2'), 'team_lead');

  -- A woont op afdeling A, B op afdeling B; C woont thuis
  update public.household set org_id = org where id in ((select v from t_ids where k = 'a'), (select v from t_ids where k = 'b'));
  update public.stay set department_id = (select id from public.department where org_id = org and name = 'Afdeling A')
   where household_id = (select v from t_ids where k = 'a') and ended_at is null;
  update public.stay set department_id = (select id from public.department where org_id = org and name = 'Afdeling B')
   where household_id = (select v from t_ids where k = 'b') and ended_at is null;
  insert into t_ids values ('org', org);

  -- inhoud van B
  insert into public.agenda_event (household_id, starts_at, title, kind) values ((select v from t_ids where k = 'b'), now() + interval '1 hour', 'Kine', 'appt');
  insert into public.memory_note (household_id, category, title, body) values ((select v from t_ids where k = 'b'), 'voorkeuren', 'Koffie', 'Zonder suiker');
  insert into public.memory_note (household_id, category, title, body) values ((select v from t_ids where k = 'b'), 'dingen', 'Sleutel', 'Bij de buurman');
  insert into public.care_log (household_id, title, note) values ((select v from t_ids where k = 'b'), 'Ontbijt', 'Goed gegeten');
  insert into public.person_card (household_id, name, relation, phone, kind) values ((select v from t_ids where k = 'b'), 'Els', 'dochter', '+32470000000', 'family');
  insert into public.life_story (household_id, question, body, shared) values ((select v from t_ids where k = 'b'), 'Vertel', 'Verhaal', true);
  insert into public.document (household_id, category, name) values ((select v from t_ids where k = 'b'), 'identiteit', 'ID');
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
create function pg_temp.start(hh text, reden text default 'Val in de gang, familie niet bereikbaar') returns text language sql as $$
  select format('select public.start_noodtoegang(%L::uuid, %L)', pg_temp.id(hh), reden)
$$;

set local role authenticated;

-- Wie mag niet starten
select pg_temp.als('ta');
select pg_temp.geweigerd('reden te kort', pg_temp.start('b', 'val'));
select pg_temp.geweigerd('eigen afdeling: al gewone toegang', pg_temp.start('a'));
select pg_temp.geweigerd('bewoner zonder verblijf', pg_temp.start('c'));
select pg_temp.als('staff');
select pg_temp.geweigerd('gewone medewerker kan niet starten', pg_temp.start('b'));
select pg_temp.als('orgadmin');
select pg_temp.geweigerd('org admin kan niet starten', pg_temp.start('b'));
select pg_temp.als('t2');
select pg_temp.geweigerd('team lead van een andere organisatie kan niet starten', pg_temp.start('b'));
select pg_temp.als('fa');
select pg_temp.geweigerd('familiebeheerder kan niet starten', pg_temp.start('b'));
reset role;
select pg_temp.gelijk('geweigerde pogingen laten niets achter', (select count(*) from public.emergency_access), 0);

-- Team lead van een andere afdeling start
set local role authenticated;
select pg_temp.als('ta');
insert into t_ids select 'nood1', public.start_noodtoegang(pg_temp.id('b'), '  Val in de gang, familie niet bereikbaar  ');
select pg_temp.gelijk('noodtoegang gestart', (select count(*) from public.emergency_access where id = pg_temp.id('nood1')), 1);
select pg_temp.gelijk('duurt 4 uur',
  (select count(*) from public.emergency_access where id = pg_temp.id('nood1') and expires_at - started_at = interval '4 hours'), 1);
select pg_temp.geweigerd('tweede start terwijl de eerste loopt', pg_temp.start('b'));

-- De gewone regels zijn niet veranderd
select pg_temp.gelijk('rechtstreeks lezen blijft dicht (agenda)', (select count(*) from public.agenda_event where household_id = pg_temp.id('b')), 0);
select pg_temp.gelijk('rechtstreeks lezen blijft dicht (contacten)', (select count(*) from public.person_card where household_id = pg_temp.id('b')), 0);

-- Inzage: alleen de vaste set
create temp table t_inzage as select public.nood_inzage(pg_temp.id('nood1')) as j;
select pg_temp.gelijk('inzage: naam', (select count(*) from t_inzage where j -> 'bewoner' ->> 'naam' = 'Bewoner B'), 1);
select pg_temp.gelijk('inzage: agenda', (select jsonb_array_length(j -> 'agenda') from t_inzage), 1);
select pg_temp.gelijk('inzage: alleen voorkeuren, niet de andere notities', (select jsonb_array_length(j -> 'voorkeuren') from t_inzage), 1);
select pg_temp.gelijk('inzage: logboek', (select jsonb_array_length(j -> 'logboek') from t_inzage), 1);
select pg_temp.gelijk('inzage: contactpersoon met telefoon',
  (select count(*) from t_inzage, jsonb_array_elements(j -> 'contacten') x where x ->> 'telefoon' = '+32470000000'), 1);
select pg_temp.gelijk('inzage: geen verhalen, documenten, locatie of medicatie',
  (select count(*) from t_inzage, jsonb_object_keys(j) k where k not in ('noodtoegang', 'bewoner', 'voorkeuren', 'agenda', 'logboek', 'contacten')), 0);
select public.nood_inzage(pg_temp.id('nood1'));
select pg_temp.gelijk('log: start en twee inzages', (select count(*) from public.emergency_access_log where access_id = pg_temp.id('nood1')), 3);

select pg_temp.als('staff');
select pg_temp.geweigerd('een ander kan de inzage niet gebruiken', format('select public.nood_inzage(%L::uuid)', pg_temp.id('nood1')));
select pg_temp.als('fa');
select pg_temp.geweigerd('ook de familie niet', format('select public.nood_inzage(%L::uuid)', pg_temp.id('nood1')));
reset role;

-- Melding aan de familiebeheerder
select pg_temp.gelijk('melding voor de familiebeheerder',
  (select count(*) from public.notification where household_id = pg_temp.id('b') and level = 'alert'
      and target_role = 'admin' and body like 'Noodtoegang: Tine Teamlead (WZC Zon)%Val in de gang%'), 1);

-- Wie ziet de noodtoegang en de log
set local role authenticated;
select pg_temp.als('fa');
select pg_temp.gelijk('familiebeheerder ziet de noodtoegang en de log',
  (select count(*) from public.emergency_access) + (select count(*) from public.emergency_access_log), 4);
select pg_temp.gelijk('familiebeheerder ziet de melding', (select count(*) from public.notification where body like 'Noodtoegang:%'), 1);
select pg_temp.als('fm');
select pg_temp.gelijk('familielid (geen beheerder) ziet ze niet',
  (select count(*) from public.emergency_access) + (select count(*) from public.emergency_access_log), 0);
select pg_temp.als('orgadmin');
select pg_temp.gelijk('org admin ziet de noodtoegang', (select count(*) from public.emergency_access), 1);
select pg_temp.als('tb');
select pg_temp.gelijk('andere team lead ziet ze niet', (select count(*) from public.emergency_access), 0);
select pg_temp.als('t2');
select pg_temp.gelijk('andere organisatie ziet ze niet', (select count(*) from public.emergency_access), 0);

-- Niemand schrijft rechtstreeks
select pg_temp.als('ta');
select pg_temp.geweigerd('rechtstreeks een noodtoegang aanmaken',
  format('insert into public.emergency_access (household_id, stay_id, org_id, profile_id, reason, expires_at) select %L::uuid, id, org_id, %L::uuid, ''xxxxxxxxxxxxxxxxxxxxxxxx'', now() + interval ''9 hours'' from public.stay where household_id = %L::uuid',
         pg_temp.id('b'), pg_temp.id('ta'), pg_temp.id('b')));
select pg_temp.geweigerd('de eigen noodtoegang verlengen',
  format('update public.emergency_access set expires_at = now() + interval ''9 hours'' where id = %L::uuid', pg_temp.id('nood1')));
select pg_temp.geweigerd('de log wissen', 'delete from public.emergency_access_log');
select pg_temp.als('orgadmin');
select pg_temp.geweigerd('ook de org admin wist de log niet', 'delete from public.emergency_access_log');

-- Stoppen
select pg_temp.als('fm');
select pg_temp.geweigerd('familielid kan niet stoppen', format('select public.stop_noodtoegang(%L::uuid)', pg_temp.id('nood1')));
select pg_temp.als('fa');
select public.stop_noodtoegang(pg_temp.id('nood1'));
select pg_temp.gelijk('familiebeheerder stopte de noodtoegang', (select count(*) from public.emergency_access where ended_at is not null and ended_by = pg_temp.id('fa')), 1);
select pg_temp.als('ta');
select pg_temp.geweigerd('na het stoppen geen inzage meer', format('select public.nood_inzage(%L::uuid)', pg_temp.id('nood1')));

-- Hoogstens 3 starts per 24 uur
insert into t_ids select 'nood2', public.start_noodtoegang(pg_temp.id('b'), 'Tweede keer, opnieuw gevallen');
select public.stop_noodtoegang(pg_temp.id('nood2'));
insert into t_ids select 'nood3', public.start_noodtoegang(pg_temp.id('b'), 'Derde keer, nachtdienst vraagt info');
select public.stop_noodtoegang(pg_temp.id('nood3'));
select pg_temp.geweigerd('vierde start binnen 24 uur', pg_temp.start('b'));
select pg_temp.gelijk('stoppen werd gelogd', (select count(*) from public.emergency_access_log where action = 'einde'), 3);
reset role;

-- Na 4 uur is het voorbij
update public.emergency_access set started_at = started_at - interval '2 days', expires_at = expires_at - interval '2 days';
set local role authenticated;
select pg_temp.als('ta');
insert into t_ids select 'nood4', public.start_noodtoegang(pg_temp.id('b'), 'Na een dag opnieuw een vraag');
reset role;
update public.emergency_access set started_at = now() - interval '5 hours', expires_at = now() - interval '1 hour' where id = pg_temp.id('nood4');
set local role authenticated;
select pg_temp.als('ta');
select pg_temp.geweigerd('na 4 uur geen inzage meer', format('select public.nood_inzage(%L::uuid)', pg_temp.id('nood4')));

-- Bewoner verlaat het WZC tijdens een noodtoegang
insert into t_ids select 'nood5', public.start_noodtoegang(pg_temp.id('b'), 'Valalarm op de kamer gaat af');
reset role;
update public.household set org_id = null where id = pg_temp.id('b');
set local role authenticated;
select pg_temp.als('ta');
select pg_temp.geweigerd('na vertrek geen inzage meer', format('select public.nood_inzage(%L::uuid)', pg_temp.id('nood5')));
reset role;

-- Anon kan niets
select pg_temp.gelijk('anon kan niet starten, inzien of stoppen',
  (select count(*) from unnest(array['public.start_noodtoegang(uuid,text)', 'public.nood_inzage(uuid)', 'public.stop_noodtoegang(uuid)']) f
    where has_function_privilege('anon', f, 'execute')), 0);
select pg_temp.gelijk('authenticated kan de hulpfunctie niet rechtstreeks aanroepen',
  (select count(*) from unnest(array['public.actieve_noodtoegang(uuid)']) f where has_function_privilege('authenticated', f, 'execute')), 0);

rollback;
