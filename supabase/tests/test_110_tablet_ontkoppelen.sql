-- =====================================================================
--  De tablet ontkoppelen (VEREIST_MIGRATIE 110)
--  Familiebeheerder ontkoppelt; daarna is het tablet-account niemand meer
--  in het huishouden — ook niet via de kaart "Dit ben jij".
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid;
begin
  insert into auth.users (email) select m from unnest(array['o-fa@t', 'o-lid@t', 'o-tab@t', 'o-tab2@t']) m;
  insert into t_ids select replace(replace(email, 'o-', ''), '@t', ''), id from auth.users where email like 'o-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'),  'admin'),
    (hh, (select v from t_ids where k = 'lid'), 'member'),
    (hh, (select v from t_ids where k = 'tab'), 'person');
  insert into public.person_card (household_id, name, relation, kind, profile_id)
  values (hh, 'Rita', 'Jij', 'self', (select v from t_ids where k = 'tab'));
  insert into public.device_pairing (household_id, code) values (hh, '12345678');
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

set local role authenticated;

-- Vooraf: de tablet is de persoon
select pg_temp.als('tab');
select pg_temp.gelijk('tablet is de persoon', public.is_self(pg_temp.id('hh')), true);

-- Een gewoon familielid mag niet ontkoppelen
select pg_temp.als('lid');
select pg_temp.geweigerd('familielid ontkoppelt niet',
  format('select public.ontkoppel_tablet(%L::uuid, %L::uuid)', pg_temp.id('hh'), pg_temp.id('tab')));

-- De tablet ontkoppelt zichzelf niet, en geen beheerder via deze weg
select pg_temp.als('fa');
select pg_temp.geweigerd('alleen een tablet, geen familielid',
  format('select public.ontkoppel_tablet(%L::uuid, %L::uuid)', pg_temp.id('hh'), pg_temp.id('lid')));

-- De beheerder ontkoppelt
select public.ontkoppel_tablet(pg_temp.id('hh'), pg_temp.id('tab'));
select pg_temp.gelijk('lidmaatschap weg',
  (select count(*) from public.membership where household_id = pg_temp.id('hh') and role = 'person'), 0::bigint);
select pg_temp.gelijk('zorglogboek vermeldt het',
  (select count(*) from public.care_log where household_id = pg_temp.id('hh') and title = 'Tablet ontkoppeld'), 1::bigint);
select pg_temp.gelijk('nog twee leden',
  (select count(*) from public.membership where household_id = pg_temp.id('hh')), 2::bigint);
select pg_temp.geweigerd('twee keer ontkoppelen zegt het',
  format('select public.ontkoppel_tablet(%L::uuid, %L::uuid)', pg_temp.id('hh'), pg_temp.id('tab')));

-- Het oude tablet-account is niemand meer
select pg_temp.als('tab');
select pg_temp.gelijk('oude tablet is de persoon niet meer', public.is_self(pg_temp.id('hh')), false);
select pg_temp.gelijk('en kijkt niet meer mee', coalesce(public.mag_meekijken(pg_temp.id('hh')), false), false);

reset role;
select pg_temp.gelijk('self-kaart is los',
  (select profile_id from public.person_card where household_id = pg_temp.id('hh') and kind = 'self'), null::uuid);
select pg_temp.gelijk('open koppelcode vervallen',
  (select expires_at <= now() from public.device_pairing where household_id = pg_temp.id('hh') and code = '12345678'), true);

-- Ook "Toegang weghalen" (rechtstreeks wissen) koppelt de kaart los
insert into public.membership (household_id, profile_id, role) values (pg_temp.id('hh'), pg_temp.id('tab2'), 'person');
update public.person_card set profile_id = pg_temp.id('tab2') where household_id = pg_temp.id('hh') and kind = 'self';
set local role authenticated;
select pg_temp.als('fa');
delete from public.membership where household_id = pg_temp.id('hh') and profile_id = pg_temp.id('tab2');
reset role;
select pg_temp.gelijk('rechtstreeks wissen koppelt ook los',
  (select profile_id from public.person_card where household_id = pg_temp.id('hh') and kind = 'self'), null::uuid);

rollback;
