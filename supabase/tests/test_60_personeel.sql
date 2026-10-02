-- =====================================================================
--  Functies voor de schermen van een WZC (VEREIST_MIGRATIE 60)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;
create temp table t_tekst (k text primary key, v text);
grant all on t_tekst to public;

do $$
declare hh uuid;
begin
  insert into auth.users (email) select m from unnest(array[
    'p-oa@t', 'p-s@t', 'p-s2@t', 'p-tl@t', 'p-fa@t', 'p-fm@t', 'p-x@t', 'p-ander@t']) m;
  insert into t_ids select replace(replace(email, 'p-', ''), '@t', ''), id from auth.users where email like 'p-%@t';
  update public.profile set full_name = 'Sara Zorg' where id = (select v from t_ids where k = 's');
  insert into public.household (person_name, timezone) values ('Rita', 'Europe/Brussels') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'), (hh, (select v from t_ids where k = 'fm'), 'member');
end $$;

create function pg_temp.als(k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select v from t_ids where t_ids.k = als.k), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t_ids where t_ids.k = id.k $$;
create function pg_temp.tekst(k text) returns text language sql stable as $$ select v from t_tekst where t_tekst.k = tekst.k $$;
create function pg_temp.gelijk(wat text, kreeg anyelement, verwacht anyelement) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;
-- Koppelt niet: een fout, of (vanaf 65) null zonder koppeling.
create function pg_temp.koppelt_niet(wat text, hh uuid, code text) returns void language plpgsql as $$
declare
  uit text;
begin
  begin
    uit := public.koppel_met_wzc(hh, code);
  exception when others then
    raise notice 'ok: % (geweigerd: %)', wat, sqlerrm; return;
  end;
  if uit is not null then raise exception 'GEZAKT: % — koppelde toch (%)', wat, uit; end if;
  raise notice 'ok: % (geen koppeling)', wat;
end $$;
create function pg_temp.geweigerd(wat text, sql text) returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then raise notice 'ok: % (geweigerd: %)', wat, sqlerrm; return; end;
  raise exception 'GEZAKT: % — werd niet geweigerd', wat;
end $$;

set local role authenticated;

-- Een WZC registreren
select pg_temp.als('oa');
insert into t_ids select 'org', public.create_organisation('WZC De Linde');
insert into t_tekst select 'code', public.org_koppelcode(pg_temp.id('org'));
select pg_temp.gelijk('koppelcode: 8 tekens, geen verwarrende', (select pg_temp.tekst('code') ~ '^[A-HJ-NP-Z2-9]{8}$'), true);

-- Familie koppelt met de code (in kleine letters, met spaties)
select pg_temp.als('fm');
select pg_temp.geweigerd('familielid (geen beheerder) koppelt niet',
  format('select public.koppel_met_wzc(%L::uuid, %L)', pg_temp.id('hh'), pg_temp.tekst('code')));
select pg_temp.als('fa');
select pg_temp.koppelt_niet('verkeerde code', pg_temp.id('hh'), 'ZZZZZZZZ');
select pg_temp.gelijk('familiebeheerder koppelt met de code',
  public.koppel_met_wzc(pg_temp.id('hh'), lower(substr(pg_temp.tekst('code'), 1, 4)) || ' ' || substr(pg_temp.tekst('code'), 5)), 'WZC De Linde');
select pg_temp.gelijk('familie ziet de naam van het WZC', (select naam from public.mijn_wzc(pg_temp.id('hh'))), 'WZC De Linde');
select pg_temp.als('x');
select pg_temp.gelijk('een vreemde ziet ze niet', (select count(*) from public.mijn_wzc(pg_temp.id('hh'))), 0::bigint);

-- Medewerkers uitnodigen
select pg_temp.als('oa');
insert into t_tekst select 'uit_s', token from public.nodig_medewerker_uit(pg_temp.id('org'), 'P-S@t', 'caregiver');
insert into t_tekst select 'uit_s2', token from public.nodig_medewerker_uit(pg_temp.id('org'), 'p-s2@t', 'caregiver');
insert into t_tekst select 'uit_tl', token from public.nodig_medewerker_uit(pg_temp.id('org'), 'p-tl@t', 'coordinator');
select pg_temp.als('s');
select pg_temp.gelijk('uitnodiging bekijken', (select organisatie || '/' || rol || '/' || status from public.org_uitnodiging_bekijk(pg_temp.tekst('uit_s'))), 'WZC De Linde/caregiver/open');
select pg_temp.geweigerd('een medewerker nodigt niemand uit',
  format('select public.nodig_medewerker_uit(%L::uuid, ''a@b'', ''caregiver'')', pg_temp.id('org')));
select pg_temp.als('ander');
select pg_temp.geweigerd('een doorgestuurde link werkt niet voor een ander adres',
  format('select public.aanvaard_org_uitnodiging(%L)', pg_temp.tekst('uit_s')));
select pg_temp.als('s');
select pg_temp.gelijk('aanvaarden met het juiste adres', public.aanvaard_org_uitnodiging(pg_temp.tekst('uit_s')), pg_temp.id('org'));
select pg_temp.geweigerd('nog eens aanvaarden', format('select public.aanvaard_org_uitnodiging(%L)', pg_temp.tekst('uit_s')));
select pg_temp.als('s2');
select public.aanvaard_org_uitnodiging(pg_temp.tekst('uit_s2'));
select pg_temp.als('tl');
select public.aanvaard_org_uitnodiging(pg_temp.tekst('uit_tl'));

-- Afdelingen en team lead (rechtstreeks, de beheerder mag dat al sinds 52)
select pg_temp.als('oa');
insert into public.department (org_id, name) values (pg_temp.id('org'), 'De Eik');
insert into t_ids select 'dep', id from public.department where name = 'De Eik';
insert into public.department_staff (department_id, profile_id, role) values (pg_temp.id('dep'), pg_temp.id('tl'), 'team_lead');

select pg_temp.als('tl');
select pg_temp.gelijk('mijn organisaties: rol, team lead en afdeling',
  (select rol || '/' || team_lead || '/' || (afdelingen -> 0 ->> 'naam') from public.mijn_organisaties()), 'coordinator/true/De Eik');

-- Verblijf: afdeling en kamer
select pg_temp.als('s');
select pg_temp.geweigerd('een zorgmedewerker past het verblijf niet aan',
  format('select public.zet_verblijf(%L::uuid, %L::uuid, ''12'')', pg_temp.id('hh'), pg_temp.id('dep')));
select pg_temp.als('oa');
select public.zet_verblijf(pg_temp.id('hh'), pg_temp.id('dep'), ' 12 ');
select pg_temp.gelijk('afdeling en kamer gezet', (select afdeling || '/' || kamer from public.mijn_wzc(pg_temp.id('hh'))), null::text);
select pg_temp.als('fa');
select pg_temp.gelijk('familie ziet afdeling en kamer', (select afdeling || '/' || kamer from public.mijn_wzc(pg_temp.id('hh'))), 'De Eik/12');

-- Toewijzen
select pg_temp.als('s');
select pg_temp.geweigerd('een zorgmedewerker wijst niemand toe',
  format('select public.wijs_toe(%L::uuid, %L::uuid)', pg_temp.id('hh'), pg_temp.id('s2')));
select pg_temp.gelijk('nog niet toegewezen: geen bewoners', (select count(*) from public.mijn_bewoners(pg_temp.id('org'))), 0::bigint);
select pg_temp.als('oa');
insert into t_ids select 'toew', public.wijs_toe(pg_temp.id('hh'), pg_temp.id('s'));
select pg_temp.gelijk('nog eens toewijzen geeft dezelfde', public.wijs_toe(pg_temp.id('hh'), pg_temp.id('s')), pg_temp.id('toew'));
select pg_temp.geweigerd('de beheerder wijst zichzelf niet toe',
  format('select public.wijs_toe(%L::uuid, %L::uuid)', pg_temp.id('hh'), pg_temp.id('oa')));
select pg_temp.geweigerd('geen familielid toewijzen',
  format('select public.wijs_toe(%L::uuid, %L::uuid)', pg_temp.id('hh'), pg_temp.id('fa')));
select pg_temp.als('tl');
select pg_temp.gelijk('team lead van de afdeling wijst toe', (select count(*) from (select public.wijs_toe(pg_temp.id('hh'), pg_temp.id('s2'))) x), 1::bigint);
select pg_temp.gelijk('team lead ziet de bewoner via de afdeling', (select via from public.mijn_bewoners(pg_temp.id('org'))), 'afdeling');
select pg_temp.als('s');
select pg_temp.gelijk('medewerker ziet zijn bewoner', (select naam || '/' || via || '/' || kamer from public.mijn_bewoners(pg_temp.id('org'))), 'Rita/toegewezen/12');

-- Collega's
select pg_temp.gelijk('collega''s met naam', (select count(*) from public.org_medewerkers(pg_temp.id('org')) where naam = 'Sara Zorg'), 1::bigint);
select pg_temp.gelijk('een medewerker ziet geen e-mailadressen', (select count(*) from public.org_medewerkers(pg_temp.id('org')) where email is not null), 0::bigint);
select pg_temp.als('oa');
select pg_temp.gelijk('de beheerder wel', (select count(*) from public.org_medewerkers(pg_temp.id('org')) where email is not null), 4::bigint);
select pg_temp.als('x');
select pg_temp.gelijk('een vreemde ziet geen medewerkers', (select count(*) from public.org_medewerkers(pg_temp.id('org'))), 0::bigint);
select pg_temp.gelijk('een vreemde ziet geen code', public.org_koppelcode(pg_temp.id('org')), null::text);

-- Toewijzing stoppen
select pg_temp.als('oa');
select public.stop_toewijzing(pg_temp.id('toew'));
select pg_temp.als('s');
select pg_temp.gelijk('na het stoppen ziet de medewerker de bewoner niet meer', (select count(*) from public.mijn_bewoners(pg_temp.id('org'))), 0::bigint);

-- Nieuwe koppelcode: de oude werkt niet meer
select pg_temp.als('tl');
select pg_temp.geweigerd('een coördinator maakt geen nieuwe code', format('select public.nieuwe_koppelcode(%L::uuid)', pg_temp.id('org')));
select pg_temp.als('oa');
select pg_temp.gelijk('nieuwe code verschilt', public.nieuwe_koppelcode(pg_temp.id('org')) <> pg_temp.tekst('code'), true);
reset role;
insert into public.household (person_name) values ('Jos');
insert into public.membership (household_id, profile_id, role)
  select id, pg_temp.id('x'), 'admin' from public.household where person_name = 'Jos';
set local role authenticated;
select pg_temp.als('x');
select pg_temp.koppelt_niet('de oude code werkt niet meer', (select id from public.household where person_name = 'Jos'), pg_temp.tekst('code'));
reset role;

select pg_temp.gelijk('anon kan geen enkele van deze functies',
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('koppel_met_wzc', 'mijn_wzc', 'mijn_organisaties', 'mijn_bewoners', 'org_medewerkers', 'wijs_toe',
                       'stop_toewijzing', 'zet_verblijf', 'nodig_medewerker_uit', 'aanvaard_org_uitnodiging', 'org_koppelcode',
                       'nieuwe_koppelcode', 'genereer_koppelcode', 'org_uitnodiging_bekijk')
     and has_function_privilege('anon', p.oid, 'execute')), 0::bigint);

rollback;
