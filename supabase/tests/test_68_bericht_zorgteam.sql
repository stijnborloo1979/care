-- =====================================================================
--  Berichten van de bewoner aan zijn zorgteam (VEREIST_MIGRATIE 68)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; hh2 uuid; org uuid; d uuid; d2 uuid;
begin
  insert into auth.users (email)
  select m from unnest(array['b-tab@t', 'b-fa@t', 'b-c1@t', 'b-c2@t', 'b-tl@t', 'b-oa@t', 'b-co@t', 'b-x@t']) m;
  insert into t_ids select replace(replace(email, 'b-', ''), '@t', ''), id from auth.users where email like 'b-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into public.household (person_name) values ('Jos') returning id into hh2;
  insert into t_ids values ('hh', hh), ('hh2', hh2);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'tab'), 'person'),
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh2, (select v from t_ids where k = 'x'), 'admin');
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role
    from (values ('c1', 'caregiver'), ('c2', 'caregiver'), ('tl', 'caregiver'), ('oa', 'org_admin'), ('co', 'coordinator')) x(k, r)
    join t_ids using (k);
  insert into public.department (org_id, name) values (org, 'A') returning id into d;
  insert into public.department (org_id, name) values (org, 'B') returning id into d2;
  insert into public.department_staff (department_id, profile_id, role) values
    (d, (select v from t_ids where k = 'tl'), 'team_lead'),
    (d2, (select v from t_ids where k = 'c2'), 'team_lead');
  update public.household set org_id = org where id in (hh, hh2);
  update public.stay set department_id = d where household_id = hh;
  update public.stay set department_id = d2 where household_id = hh2;
  insert into public.care_assignment (stay_id, profile_id)
  select id, (select v from t_ids where k = 'c1') from public.stay where household_id = hh;
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
create function pg_temp.aantal() returns bigint language sql as $$ select count(*) from public.resident_message $$;

create temp table t_bericht (v uuid);
grant all on t_bericht to public;

set local role authenticated;

-- 1. Sturen: alleen de bewoner zelf
select pg_temp.als('tab');
insert into t_bericht select public.bericht_aan_zorgteam(pg_temp.id('hh'), '  Mag ik een extra deken?  ');
select pg_temp.gelijk('de tablet stuurt een bericht', (select count(*) from t_bericht), 1::bigint);
select pg_temp.gelijk('tekst zonder spaties rond', (select body from public.resident_message), 'Mag ik een extra deken?'::text);
select pg_temp.geweigerd('leeg bericht', format('select public.bericht_aan_zorgteam(%L::uuid, %L)', pg_temp.id('hh'), '   '));
select pg_temp.geweigerd('tablet schrijft niet rechtstreeks',
  format('insert into public.resident_message (household_id, stay_id, van, body) values (%L::uuid, public.lopend_verblijf(%L::uuid), ''bewoner'', ''x'')', pg_temp.id('hh'), pg_temp.id('hh')));
select pg_temp.geweigerd('tablet stuurt niet namens een ander huishouden',
  format('select public.bericht_aan_zorgteam(%L::uuid, ''hallo'')', pg_temp.id('hh2')));

select pg_temp.als('fa');
select pg_temp.geweigerd('familie stuurt niet als bewoner', format('select public.bericht_aan_zorgteam(%L::uuid, ''x'')', pg_temp.id('hh')));
select pg_temp.als('c1');
select pg_temp.geweigerd('medewerker stuurt niet als bewoner', format('select public.bericht_aan_zorgteam(%L::uuid, ''x'')', pg_temp.id('hh')));

-- 2. Lezen: het zorgteam van die bewoner, niemand anders
select pg_temp.als('c1');  select pg_temp.gelijk('toegewezen medewerker leest', pg_temp.aantal(), 1::bigint);
select pg_temp.als('tl');  select pg_temp.gelijk('team lead van de afdeling leest', pg_temp.aantal(), 1::bigint);
select pg_temp.als('c2');  select pg_temp.gelijk('team lead van een andere afdeling leest niet', pg_temp.aantal(), 0::bigint);
select pg_temp.als('oa');  select pg_temp.gelijk('beheerder leest niet (J4)', pg_temp.aantal(), 0::bigint);
select pg_temp.als('co');  select pg_temp.gelijk('coördinator zonder toewijzing leest niet', pg_temp.aantal(), 0::bigint);
select pg_temp.als('fa');  select pg_temp.gelijk('familie leest niet', pg_temp.aantal(), 0::bigint);
select pg_temp.als('x');   select pg_temp.gelijk('vreemde leest niet', pg_temp.aantal(), 0::bigint);
select pg_temp.als('x');
select pg_temp.gelijk('vreemde krijgt geen verblijf-id', public.lopend_verblijf(pg_temp.id('hh')), null::uuid);

-- 3. Gezien en antwoorden: alleen het zorgteam
select pg_temp.als('c2');
select pg_temp.geweigerd('ander team markeert niet', format('select public.markeer_bericht_gezien(%L::uuid)', (select v from t_bericht)));
select pg_temp.geweigerd('ander team antwoordt niet', format('select public.antwoord_aan_bewoner(%L::uuid, ''ok'')', (select v from t_bericht)));
select pg_temp.als('oa');
select pg_temp.geweigerd('beheerder antwoordt niet', format('select public.antwoord_aan_bewoner(%L::uuid, ''ok'')', (select v from t_bericht)));
select pg_temp.als('c1');
select pg_temp.geweigerd('medewerker past niet rechtstreeks aan',
  format('update public.resident_message set body = ''x'' where id = %L::uuid', (select v from t_bericht)));
select pg_temp.gelijk('rechtstreeks aanpassen veranderde niets', (select body from public.resident_message where id = (select v from t_bericht)), 'Mag ik een extra deken?'::text);
select public.antwoord_aan_bewoner((select v from t_bericht), 'Ik breng er zo een.');
select pg_temp.gelijk('antwoord maakt het bericht gezien', (select gezien_door from public.resident_message where id = (select v from t_bericht)), pg_temp.id('c1'));
select pg_temp.geweigerd('op een antwoord antwoord je niet',
  format('select public.antwoord_aan_bewoner(%L::uuid, ''x'')', (select id from public.resident_message where van = 'team')));

select pg_temp.als('tab');
select pg_temp.gelijk('bewoner ziet zijn bericht en het antwoord', pg_temp.aantal(), 2::bigint);
select pg_temp.gelijk('bewoner ziet dat het gezien is', (select gezien_at is not null from public.resident_message where van = 'bewoner'), true);

-- 4. Een vangnet tegen een knop die blijft hangen
do $$ begin for i in 1..19 loop perform public.bericht_aan_zorgteam(pg_temp.id('hh'), 'nog eens ' || i); end loop; end $$;
select pg_temp.geweigerd('na 20 berichten per uur', format('select public.bericht_aan_zorgteam(%L::uuid, ''nog'')', pg_temp.id('hh')));

-- 5. Einde verblijf: het team ziet niets meer, de bewoner wel
reset role;
update public.household set org_id = null where id = (select v from t_ids where k = 'hh');
set local role authenticated;
select pg_temp.als('c1');  select pg_temp.gelijk('na het verblijf leest het team niets', pg_temp.aantal(), 0::bigint);
select pg_temp.als('tl');  select pg_temp.gelijk('ook de team lead niet', pg_temp.aantal(), 0::bigint);
select pg_temp.als('tab'); select pg_temp.gelijk('de bewoner houdt zijn berichten', pg_temp.aantal(), 21::bigint);
select pg_temp.geweigerd('zonder verblijf geen bericht', format('select public.bericht_aan_zorgteam(%L::uuid, ''x'')', pg_temp.id('hh')));

-- 6. Opruimen volgens de bewaartermijn van het WZC
reset role;
update public.resident_message set created_at = now() - interval '30 months' where body = 'nog eens 1';
select pg_temp.gelijk('opruimen wist wat ouder is dan de termijn', public.bewonerbericht_opruimen(), 1);
select pg_temp.geweigerd('opruimen niet voor gebruikers', 'set local role authenticated; select public.bewonerbericht_opruimen()');

-- 7. Anoniem: niets
reset role;
set local role anon;
select pg_temp.geweigerd('anoniem leest niet', 'select count(*) from public.resident_message');

rollback;
