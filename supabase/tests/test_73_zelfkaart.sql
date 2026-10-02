-- =====================================================================
--  Niemand maakt zichzelf de persoon (VEREIST_MIGRATIE 73)
--  Zakt zonder 73: een familielid wordt "zelf" en stuurt dan in naam van
--  de bewoner een bericht aan het zorgteam.
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid;
begin
  insert into auth.users (email) select m from unnest(array['z-fa@t', 'z-lid@t']) m;
  insert into t_ids select replace(replace(email, 'z-', ''), '@t', ''), id from auth.users where email like 'z-%@t';
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'), (hh, (select v from t_ids where k = 'lid'), 'member');
  insert into public.person_card (household_id, name, relation, kind) values (hh, 'Jan', 'Zoon', 'family');
  insert into public.person_card (household_id, name, relation, kind) values (hh, 'Rita', 'Jij', 'self');
  insert into public.organisation (name) values ('WZC') returning id into org;
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

set local role authenticated;
select pg_temp.als('lid');

select pg_temp.geweigerd('familielid maakt geen self-kaart naar zichzelf',
  format('insert into public.person_card (household_id, profile_id, name, relation, kind) values (%L::uuid, %L::uuid, ''x'', ''x'', ''self'')', pg_temp.id('hh'), pg_temp.id('lid')));
select pg_temp.geweigerd('familielid maakt geen self-kaart',
  format('insert into public.person_card (household_id, name, relation, kind) values (%L::uuid, ''x'', ''x'', ''self'')', pg_temp.id('hh')));
select pg_temp.geweigerd('familielid zet een kaart niet om naar self',
  format('update public.person_card set kind = ''self'' where household_id = %L::uuid and name = ''Jan''', pg_temp.id('hh')));
select pg_temp.geweigerd('familielid koppelt de self-kaart niet aan zichzelf',
  format('update public.person_card set profile_id = %L::uuid where household_id = %L::uuid and kind = ''self''', pg_temp.id('lid'), pg_temp.id('hh')));
select pg_temp.gelijk('familielid is niet de persoon', public.is_self(pg_temp.id('hh')), false);
select pg_temp.geweigerd('en stuurt geen bericht in naam van de bewoner',
  format('select public.bericht_aan_zorgteam(%L::uuid, ''x'')', pg_temp.id('hh')));

-- Gewoon gebruik blijft werken
insert into public.person_card (household_id, name, relation, kind) values (pg_temp.id('hh'), 'Els', 'Dochter', 'family');
update public.person_card set description = 'Dit ben jij, Rita.' where household_id = pg_temp.id('hh') and kind = 'self';
select pg_temp.gelijk('de eigen kaart beschrijven kan nog',
  (select description from public.person_card where household_id = pg_temp.id('hh') and kind = 'self'), 'Dit ben jij, Rita.'::text);
select pg_temp.gelijk('een familiekaart toevoegen kan nog',
  (select count(*) from public.person_card where household_id = pg_temp.id('hh') and name = 'Els'), 1::bigint);

rollback;
