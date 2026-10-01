-- =====================================================================
--  Abonnementen en entitlements, schaduwmodus (VEREIST_MIGRATIE 58)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; org uuid;
begin
  insert into auth.users (email) select m from unnest(array['e-fa@t', 'e-fm@t', 'e-oa@t', 'e-x@t']) m;
  insert into t_ids select replace(replace(email, 'e-', ''), '@t', ''), id from auth.users where email like 'e-%@t';
  insert into public.household (person_name, timezone) values ('Maria', 'Europe/Brussels') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'fm'), 'member');
  insert into public.organisation (name) values ('WZC') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role) values (org, (select v from t_ids where k = 'oa'), 'org_admin');
end $$;

create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t_ids where t_ids.k = id.k $$;
create function pg_temp.gelijk(wat text, kreeg anyelement, verwacht anyelement) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;
create function pg_temp.e(op timestamptz default now()) returns record language sql as $$
  select (e.bron, e.plan_id, e.status, e.alleen_lezen) from public.entitlements_voor(pg_temp.id('hh'), op) e
$$;
create function pg_temp.heeft(k text, op timestamptz default now()) returns boolean language sql as $$
  select k = any (e.entitlements) from public.entitlements_voor(pg_temp.id('hh'), op) e
$$;
create function pg_temp.als(k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select v from t_ids where t_ids.k = als.k), 'role', 'authenticated')::text, true);
end $$;

-- Zoals vandaag: geen abonnement = alles, niets verandert
select pg_temp.gelijk('zonder abonnement: bron bestaand', (select bron from public.entitlements_voor(pg_temp.id('hh'))), 'bestaand');
select pg_temp.gelijk('zonder abonnement: alle functies',
  (select cardinality(entitlements) from public.entitlements_voor(pg_temp.id('hh'))), (select count(*)::int from public.entitlement));
select pg_temp.gelijk('de plannen zijn als voorbeeld gemarkeerd', (select bool_and(voorbeeld) from public.plan), true);

-- Trial: 30 dagen het plan, daarna home_free
insert into public.subscription (household_id, plan_id, status, trial_ends_at)
  values (pg_temp.id('hh'), 'home_ai', 'trial', now() + interval '30 days');
select pg_temp.gelijk('trial: AI-spraak aan', pg_temp.heeft('voice'), true);
select pg_temp.gelijk('trial verlopen: geen AI-spraak meer', pg_temp.heeft('voice', now() + interval '31 days'), false);
select pg_temp.gelijk('trial verlopen: dagboek blijft (core)', pg_temp.heeft('diary', now() + interval '31 days'), true);

-- Past due: 14 dagen alles, daarna alleen lezen
update public.subscription set status = 'active', trial_ends_at = null;
update public.subscription set status = 'past_due', past_due_since = now();
select pg_temp.gelijk('past due, dag 1: niet alleen lezen', (select alleen_lezen from public.entitlements_voor(pg_temp.id('hh'))), false);
select pg_temp.gelijk('past due, dag 15: alleen lezen',
  (select alleen_lezen from public.entitlements_voor(pg_temp.id('hh'), now() + interval '15 days')), true);
select pg_temp.gelijk('past due, dag 15: functies blijven (niets gewist)', pg_temp.heeft('medication', now() + interval '15 days'), true);

-- Opgezegd: terug naar home_free
update public.subscription set status = 'cancelled', past_due_since = null;
select pg_temp.gelijk('opgezegd: home_free', (select plan_id from public.entitlements_voor(pg_temp.id('hh'))), 'home_free');
select pg_temp.gelijk('opgezegd: dagboek blijft (J9)', pg_temp.heeft('diary'), true);
select pg_temp.gelijk('opgezegd: geen medicatiemodule', pg_temp.heeft('medication'), false);

-- Home -> Care: Home pauzeert, het plan van het WZC geldt
update public.subscription set status = 'active';
insert into public.subscription (org_id, plan_id, status, pilot_ends_at, pilot_max_residents)
  values (pg_temp.id('org'), 'care', 'pilot', now() + interval '90 days', 20);
update public.household set org_id = pg_temp.id('org') where id = pg_temp.id('hh');
select pg_temp.gelijk('verblijf start: Home gepauzeerd',
  (select status || '/' || paused_from from public.subscription where household_id = pg_temp.id('hh')), 'paused/active');
select pg_temp.gelijk('verblijf: bron care', (select bron from public.entitlements_voor(pg_temp.id('hh'))), 'care');
select pg_temp.gelijk('verblijf: zorgnotities aan', pg_temp.heeft('care_notes'), true);
select pg_temp.gelijk('pilot voorbij de einddatum telt als past due',
  (select status from public.entitlements_voor(pg_temp.id('hh'), now() + interval '91 days')), 'past_due');
select pg_temp.gelijk('pilot 14 dagen voorbij: alleen lezen',
  (select alleen_lezen from public.entitlements_voor(pg_temp.id('hh'), now() + interval '105 days')), true);

-- Care -> Home: Home hervat
update public.household set org_id = null where id = pg_temp.id('hh');
select pg_temp.gelijk('verblijf eindigt: Home hervat',
  (select status from public.subscription where household_id = pg_temp.id('hh')), 'active');
select pg_temp.gelijk('na het verblijf: bron home', (select bron from public.entitlements_voor(pg_temp.id('hh'))), 'home');

-- Controles op het model
do $$
declare h4 uuid;
begin
  insert into public.household (person_name) values ('Leeg') returning id into h4;
  begin
    insert into public.subscription (household_id, plan_id, status) values (h4, 'care', 'active');
    raise exception 'GEZAKT: Care-plan bij een huishouden';
  exception when raise_exception then
    if sqlerrm like 'GEZAKT%' then raise; end if;
    raise notice 'ok: Care-plan hoort niet bij een huishouden (geweigerd: %)', sqlerrm;
  end;
  begin
    insert into public.subscription (household_id, plan_id, status) values (h4, 'home', 'trial');
    raise exception 'GEZAKT: trial zonder einddatum';
  exception when check_violation then raise notice 'ok: trial vraagt een einddatum (geweigerd)'; end;
  begin
    insert into public.subscription (household_id, org_id, plan_id, status)
      values (h4, (select v from t_ids where k = 'org'), 'home', 'active');
    raise exception 'GEZAKT: huishouden en organisatie tegelijk';
  exception when check_violation or raise_exception then
    if sqlerrm like 'GEZAKT%' then raise; end if;
    raise notice 'ok: nooit huishouden en organisatie tegelijk (geweigerd: %)', sqlerrm;
  end;
end $$;

-- Actieve bewoners per dag (vaste datums in 2020, los van de rest)
do $$
declare h2 uuid; h3 uuid; org uuid := (select v from t_ids where k = 'org');
begin
  insert into public.household (person_name) values ('B') returning id into h2;
  insert into public.household (person_name) values ('C') returning id into h3;
  -- B: van 1 tot en met 3 oktober
  insert into public.stay (household_id, org_id, started_at, ended_at)
    values (h2, org, '2020-10-01 10:00+02', '2020-10-03 15:00+02');
  -- C: overplaatsing op 2 oktober (sluiten en opnieuw openen) = één bewoner
  insert into public.stay (household_id, org_id, started_at, ended_at)
    values (h3, org, '2020-10-01 09:00+02', '2020-10-02 11:00+02');
  insert into public.stay (household_id, org_id, started_at)
    values (h3, org, '2020-10-02 11:00+02');
end $$;
select pg_temp.gelijk('actieve bewoners per dag: tot en met de dag van het einde, overplaatsing telt één keer',
  (select string_agg(aantal::text, ',' order by dag) from public.actieve_bewoners(pg_temp.id('org'), '2020-10-01', '2020-10-04')),
  '2,2,2,1');

-- Wie ziet wat
set local role authenticated;
select pg_temp.als('fa');
select pg_temp.gelijk('familiebeheerder ziet het Home-abonnement', (select count(*) from public.subscription), 1::bigint);
select pg_temp.gelijk('mijn_entitlements werkt voor familie', (select count(*) from public.mijn_entitlements(pg_temp.id('hh'))), 1::bigint);
select pg_temp.als('fm');
select pg_temp.gelijk('familielid ziet geen abonnement', (select count(*) from public.subscription), 0::bigint);
select pg_temp.als('oa');
select pg_temp.gelijk('org admin ziet het Care-abonnement', (select count(*) from public.subscription), 1::bigint);
select pg_temp.gelijk('org admin krijgt de telling', (select count(*) from public.actieve_bewoners(pg_temp.id('org'), '2020-10-01', '2020-10-04')), 4::bigint);
select pg_temp.als('x');
select pg_temp.gelijk('vreemde ziet niets', (select count(*) from public.subscription), 0::bigint);
select pg_temp.gelijk('vreemde krijgt geen telling', (select count(*) from public.actieve_bewoners(pg_temp.id('org'), '2020-10-01', '2020-10-04')), 0::bigint);
select pg_temp.gelijk('vreemde krijgt geen entitlements', (select count(*) from public.mijn_entitlements(pg_temp.id('hh'))), 0::bigint);
do $$ begin
  begin
    update public.subscription set status = 'active';
    raise exception 'GEZAKT: abonnement aangepast door een gebruiker';
  exception when insufficient_privilege then raise notice 'ok: niemand past zelf een abonnement aan'; end;
end $$;
reset role;

rollback;
