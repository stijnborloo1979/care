-- =====================================================================
--  Meldingen bij noodtoegang (VEREIST_MIGRATIE 57)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid; org2 uuid; dep uuid; dep2 uuid;
begin
  insert into auth.users (email) select m from unnest(array[
    'm-fa@t', 'm-fm@t', 'm-ta@t', 'm-oa@t', 'm-oa2@t']) m;
  insert into t_ids select replace(replace(email, 'm-', ''), '@t', ''), id from auth.users where email like 'm-%@t';

  -- Fase "zelf": gewone zorgmeldingen gaan hier niet als push
  insert into public.household (person_name, timezone, support_level) values ('Maria', 'Europe/Brussels', 'zelf') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'fm'), 'member');
  insert into public.push_subscription (profile_id, household_id, endpoint, p256dh, auth_key) values
    ((select v from t_ids where k = 'fa'), hh, 'https://push/fa', 'p', 'a'),
    ((select v from t_ids where k = 'fm'), hh, 'https://push/fm', 'p', 'a');

  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into public.organisation (name) values ('Ander') returning id into org2;
  insert into public.org_membership (org_id, profile_id, role) values
    (org, (select v from t_ids where k = 'ta'), 'coordinator'),
    (org, (select v from t_ids where k = 'oa'), 'org_admin'),
    (org2, (select v from t_ids where k = 'oa2'), 'org_admin');
  insert into public.department (org_id, name) values (org, 'A') returning id into dep;
  insert into public.department (org_id, name) values (org, 'B') returning id into dep2;
  insert into public.department_staff (department_id, profile_id, role) values (dep, (select v from t_ids where k = 'ta'), 'team_lead');
  update public.household set org_id = org where id = hh;
  update public.stay set department_id = dep2 where household_id = hh;

  -- een gewone dringende melding, als vergelijking
  insert into public.notification (household_id, level, body) values (hh, 'alert', 'Maria vraagt hulp');
end $$;

create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t_ids where t_ids.k = id.k $$;
create function pg_temp.gelijk(wat text, kreeg bigint, verwacht bigint) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;

-- Noodtoegang starten
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('ta'), 'role', 'authenticated')::text, true);
insert into t_ids select 'nood', public.start_noodtoegang(pg_temp.id('hh'), 'Val in de gang, familie niet bereikbaar');
reset role;
insert into t_ids select 'n', id from public.notification where dedupe_key = 'noodtoegang:' || pg_temp.id('nood');

-- Push
select pg_temp.gelijk('noodtoegang: push naar de familiebeheerder, ook in fase zelf',
  (select count(*) from public.pending_pushes(200) p where p.notification_id = pg_temp.id('n') and p.endpoint = 'https://push/fa'), 1);
select pg_temp.gelijk('noodtoegang: geen push naar een familielid (alleen beheerder)',
  (select count(*) from public.pending_pushes(200) p where p.notification_id = pg_temp.id('n') and p.endpoint = 'https://push/fm'), 0);
select pg_temp.gelijk('gewone melding in fase zelf: nog steeds geen push (zoals voorheen)',
  (select count(*) from public.pending_pushes(200) p where p.body = 'Maria vraagt hulp'), 0);

-- Mail
select pg_temp.gelijk('noodtoegang: mail naar familiebeheerder en org admin',
  (select count(*) from public.pending_alerts(100) a where a.notification_id = pg_temp.id('n') and a.kind = 'mail'
      and a.profile_id in (pg_temp.id('fa'), pg_temp.id('oa'))), 2);
select pg_temp.gelijk('noodtoegang: niet naar de org admin van een andere organisatie of een familielid',
  (select count(*) from public.pending_alerts(100) a where a.notification_id = pg_temp.id('n')
      and a.profile_id in (pg_temp.id('oa2'), pg_temp.id('fm'), pg_temp.id('ta'))), 0);
select pg_temp.gelijk('gewone melding: org admin krijgt niets, familie zoals voorheen',
  (select count(*) from public.pending_alerts(100) a where a.body = 'Maria vraagt hulp' and a.profile_id = pg_temp.id('oa')), 0);
select pg_temp.gelijk('gewone melding: beide familieleden per mail (zoals voorheen)',
  (select count(*) from public.pending_alerts(100) a where a.body = 'Maria vraagt hulp' and a.kind = 'mail'), 2);

-- Afvinken werkt ook voor de org admin
select public.mark_alerts(jsonb_build_array(jsonb_build_object(
  'notification_id', pg_temp.id('n'), 'profile_id', pg_temp.id('oa'), 'kind', 'mail')));
select pg_temp.gelijk('na afvinken niet nog eens naar de org admin',
  (select count(*) from public.pending_alerts(100) a where a.notification_id = pg_temp.id('n') and a.profile_id = pg_temp.id('oa')), 0);

-- Een ontslagen org admin krijgt niets meer
update public.org_membership set active = false where profile_id = pg_temp.id('oa');
delete from public.notification_delivery;
select pg_temp.gelijk('inactieve org admin krijgt geen mail',
  (select count(*) from public.pending_alerts(100) a where a.profile_id = pg_temp.id('oa')), 0);

-- Nog steeds alleen voor de service role
select pg_temp.gelijk('authenticated en anon kunnen de lijsten niet opvragen',
  (select count(*) from unnest(array['public.pending_alerts(integer)', 'public.pending_pushes(integer)']) f,
                        unnest(array['anon', 'authenticated']) r
    where has_function_privilege(r, f, 'execute')), 0);

rollback;
