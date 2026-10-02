-- =====================================================================
--  Uitnodigingen in de app (VEREIST_MIGRATIE 67)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare org uuid; org2 uuid;
begin
  insert into auth.users (email) select m from unnest(array['u-oa@t', 'u-nieuw@t', 'u-ander@t']) m;
  insert into t_ids select replace(replace(email, 'u-', ''), '@t', ''), id from auth.users where email like 'u-%@t';
  insert into public.organisation (name) values ('WZC Een') returning id into org;
  insert into public.organisation (name, active) values ('WZC Dicht', false) returning id into org2;
  insert into t_ids values ('org', org), ('org2', org2);
  insert into public.org_membership (org_id, profile_id, role) values (org, (select v from t_ids where k = 'oa'), 'org_admin');
  insert into public.org_invitation (org_id, email, role, token) values
    (org, 'U-Nieuw@t', 'caregiver', 'tok-open'),
    (org, 'u-nieuw@t', 'caregiver', 'tok-weg'),
    (org, 'u-nieuw@t', 'caregiver', 'tok-oud'),
    (org2, 'u-nieuw@t', 'caregiver', 'tok-dicht');
  update public.org_invitation set revoked_at = now() where token = 'tok-weg';
  update public.org_invitation set expires_at = now() - interval '1 day' where token = 'tok-oud';
  insert into t_ids select 'inv', id from public.org_invitation where token = 'tok-open';
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

-- Iemand anders ziet de uitnodiging niet en kan ze niet aanvaarden
select pg_temp.als('ander');
select pg_temp.gelijk('ander ziet geen uitnodiging', (select count(*) from public.mijn_org_uitnodigingen()), 0::bigint);
select pg_temp.geweigerd('ander aanvaardt niet',
  format('select public.aanvaard_org_uitnodiging_id(%L::uuid)', pg_temp.id('inv')));
select pg_temp.gelijk('ander is geen lid', (select count(*) from public.org_membership where profile_id = pg_temp.id('ander')), 0::bigint);

-- De uitgenodigde ziet alleen de open uitnodiging (hoofdletters maken niet uit)
select pg_temp.als('nieuw');
select pg_temp.gelijk('alleen de open uitnodiging', (select count(*) from public.mijn_org_uitnodigingen()), 1::bigint);
select pg_temp.gelijk('juiste organisatie', (select organisatie from public.mijn_org_uitnodigingen()), 'WZC Een'::text);

-- Het token wordt niet getoond
select pg_temp.gelijk('geen token in het resultaat',
  (select count(*) from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_name = 'mijn_org_uitnodigingen' and p.parameter_name = 'token'), 0::bigint);

-- Aanvaarden maakt lid, één keer
select pg_temp.gelijk('aanvaarden geeft de organisatie', public.aanvaard_org_uitnodiging_id(pg_temp.id('inv')), pg_temp.id('org'));
select pg_temp.gelijk('nu lid als zorgmedewerker',
  (select role::text from public.org_membership where profile_id = pg_temp.id('nieuw') and org_id = pg_temp.id('org')), 'caregiver'::text);
select pg_temp.gelijk('uitnodiging verdwijnt uit de lijst', (select count(*) from public.mijn_org_uitnodigingen()), 0::bigint);
select pg_temp.geweigerd('tweede keer aanvaarden',
  format('select public.aanvaard_org_uitnodiging_id(%L::uuid)', pg_temp.id('inv')));

-- Onbekend id
select pg_temp.geweigerd('onbekende uitnodiging', 'select public.aanvaard_org_uitnodiging_id(gen_random_uuid())');

-- Anoniem: geen toegang
reset role;
set local role anon;
select pg_temp.geweigerd('anoniem lijst', 'select * from public.mijn_org_uitnodigingen()');

rollback;
