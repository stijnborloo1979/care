-- =====================================================================
--  Registratie van een WZC, gesplitst (VEREIST_MIGRATIE 98)
--  Een WZC ontstaat pas na controle en goedkeuring door twee
--  platformbeheerders; het WZC beheert daarna zijn eigen beheerders,
--  met minstens twee actief.
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;
create temp table t_code (k text primary key, v text);
grant all on t_code to public;

do $$
declare hh uuid; hh2 uuid; org uuid; d uuid;
begin
  insert into auth.users (email)
    select m from unnest(array['r-p1@t', 'r-p2@t', 'r-aanv@t', 'r-vreemd@t', 'r-fa@t',
                               'r-co@t', 'r-c1@t', 'r-oa@t', 'r-oa2@t', 'r-ka1@t', 'r-ka2@t']) m;
  insert into t_ids select replace(replace(email, 'r-', ''), '@t', ''), id from auth.users where email like 'r-%@t';

  -- Bestaand WZC met twee beheerders, een coördinator en een bewoner.
  insert into public.organisation (name) values ('WZC Bestaand') returning id into org;
  insert into t_ids values ('org', org);
  insert into public.org_membership (org_id, profile_id, role)
  select org, v, r::public.org_role from (values ('oa', 'org_admin'), ('oa2', 'org_admin'),
                                                  ('co', 'coordinator'), ('c1', 'caregiver')) x(k, r)
  join t_ids using (k);
  insert into public.household (person_name) values ('Rita') returning id into hh;
  insert into t_ids values ('hh', hh);
  insert into public.membership (household_id, profile_id, role) values (hh, (select v from t_ids where k = 'fa'), 'admin');
  update public.household set org_id = org where id = hh;

  -- Platformbeheerders.
  insert into public.platform_beheerder (profile_id) select v from t_ids where k in ('p1', 'p2');
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

-- Controles op tabellen die voor de gebruiker zelf dicht zijn: lezen als eigenaar.
create function pg_temp.q(sql text) returns text language plpgsql security definer set search_path = public as $$
declare r text;
begin
  execute sql into r;
  return r;
end $$;

set local role authenticated;

-- ---------------------------------------------------------------------
--  A. Aanvragen indienen
-- ---------------------------------------------------------------------
select pg_temp.als('aanv');

do $$
declare x uuid;
begin
  x := public.dien_org_aanvraag('Zonnehof', '0123.456.789', 'ERK-1', 'Straat 1, Gent',
                                'Els Peeters', 'Info@Zonnehof.be', '09 123 45 67');
  insert into t_ids values ('aq', x);
  raise notice 'ok: aanvraag ingediend';
end $$;

select pg_temp.geweigerd('gratis adres geweigerd', $q$select public.dien_org_aanvraag('X', '0111111111', '', 'a', 'b', 'x@gmail.com', '1')$q$);
select pg_temp.geweigerd('negen cijfers geweigerd', $q$select public.dien_org_aanvraag('X', '012345678', '', 'a', 'b', 'x@x.be', '1')$q$);
select pg_temp.geweigerd('leeg veld geweigerd', $q$select public.dien_org_aanvraag('', '0111111111', '', 'a', 'b', 'x@x.be', '1')$q$);
select pg_temp.geweigerd('zonder @ geweigerd', $q$select public.dien_org_aanvraag('X', '0111111111', '', 'a', 'b', 'geen-adres', '1')$q$);
select pg_temp.geweigerd('tweede open aanvraag voor zelfde nummer', $q$select public.dien_org_aanvraag('Dubbel', '0123456789', '', 'a', 'b', 'x@dubbel.be', '1')$q$);

-- Controle en goedkeuring kan de aanvrager zelf niet.
select pg_temp.geweigerd('aanvrager kan niet controleren', $q$select public.controleer_org_aanvraag((select v from t_ids where k = 'aq'))$q$);
select pg_temp.geweigerd('aanvrager ziet geen aanvragen van het platform', $q$select * from public.platform_aanvragen()$q$);
select pg_temp.geweigerd('aanvrager kan geen WZC meer aanmaken', $q$select public.create_organisation('Nep')$q$);

-- Een vreemde gebruiker is ook geen platformbeheerder.
select pg_temp.als('vreemd');
select pg_temp.geweigerd('vreemde kan niet controleren', $q$select public.controleer_org_aanvraag((select v from t_ids where k = 'aq'))$q$);
select pg_temp.geweigerd('vreemde ziet het controleoverzicht niet', $q$select * from public.platform_organisaties_controle()$q$);
select pg_temp.geweigerd('vreemde ziet het logboek niet', $q$select * from public.platform_log_lijst()$q$);

-- ---------------------------------------------------------------------
--  B. Controle en goedkeuring: twee personen
-- ---------------------------------------------------------------------
select pg_temp.als('p1');
select pg_temp.gelijk('platformbeheerder ziet de aanvragen', (select count(*) > 0 from public.platform_aanvragen()), true);
select public.controleer_org_aanvraag((select v from t_ids where k = 'aq'), 'Telefonisch bevestigd met het nummer uit de KBO.');
select pg_temp.gelijk('na controle: gecontroleerd', pg_temp.q($q$select status from public.org_aanvraag where id = (select v from t_ids where k = 'aq')$q$), 'gecontroleerd');

select pg_temp.geweigerd('dezelfde persoon keurt niet zelf goed', $q$select public.keur_org_aanvraag_goed((select v from t_ids where k = 'aq'))$q$);

select pg_temp.als('p2');
do $$
declare o uuid;
begin
  o := public.keur_org_aanvraag_goed((select v from t_ids where k = 'aq'));
  insert into t_ids values ('aorg', o);
  raise notice 'ok: tweede platformbeheerder keurt goed';
end $$;

select pg_temp.gelijk('nieuwe organisatie is niet actief', pg_temp.q($q$select active::text from public.organisation where id = (select v from t_ids where k = 'aorg')$q$), 'false');
select pg_temp.gelijk('aanvraag is goedgekeurd', pg_temp.q($q$select status from public.org_aanvraag where id = (select v from t_ids where k = 'aq')$q$), 'goedgekeurd');
select pg_temp.gelijk('contactpersoon is uitgenodigd als beheerder',
  pg_temp.q($q$select count(*)::text from public.org_invitation where org_id = (select v from t_ids where k = 'aorg') and role = 'org_admin' and email = 'info@zonnehof.be'$q$), '1');

-- Tweede aanvraag: afwijzen vraagt een reden.
select pg_temp.als('aanv');
do $$
begin
  insert into t_ids values ('aq2', public.dien_org_aanvraag('Tweede', '0300000001', '', 'Weg 2', 'Jan', 'jan@tweede.be', '1'));
  raise notice 'ok: tweede aanvraag ingediend';
end $$;
select pg_temp.als('p1');
select public.controleer_org_aanvraag((select v from t_ids where k = 'aq2'));
select pg_temp.als('p2');
select pg_temp.geweigerd('afwijzen zonder reden geweigerd', $q$select public.wijs_org_aanvraag_af((select v from t_ids where k = 'aq2'), '  ')$q$);
select public.wijs_org_aanvraag_af((select v from t_ids where k = 'aq2'), 'Nummer hoort bij een ander bedrijf');
select pg_temp.gelijk('afgewezen aanvraag', pg_temp.q($q$select status from public.org_aanvraag where id = (select v from t_ids where k = 'aq2')$q$), 'afgewezen');

-- ---------------------------------------------------------------------
--  C. Koppelen aan een niet-actief WZC kan niet
-- ---------------------------------------------------------------------
reset role;
create temp table t_hh2 (k text primary key, v uuid);
grant all on t_hh2 to public;
create temp table t_code2 (k text primary key, v text);
grant all on t_code2 to public;

-- Een familie-beheerder probeert te koppelen vóór activatie: geen match, dus niets.
do $$
declare hh2 uuid;
begin
  insert into public.household (person_name) values ('Jos') returning id into hh2;
  insert into t_hh2 values ('hh2', hh2);
  insert into public.membership (household_id, profile_id, role) values (hh2, (select v from t_ids where k = 'fa'), 'admin');
  insert into t_code2 select 'code', koppelcode from public.organisation where id = (select v from t_ids where k = 'aorg');
end $$;

set local role authenticated;
select pg_temp.als('fa');
select pg_temp.gelijk('koppelen aan niet-actief WZC levert niets op',
  public.koppel_met_wzc((select v from t_hh2 where k = 'hh2'), (select v from t_code2 where k = 'code')), null::text);
reset role;

-- ---------------------------------------------------------------------
--  D. Activeren: twee beheerders en een verwerkersovereenkomst
-- ---------------------------------------------------------------------
insert into public.org_membership (org_id, profile_id, role)
  values ((select v from t_ids where k = 'aorg'), (select v from t_ids where k = 'ka1'), 'org_admin');
insert into public.org_membership (org_id, profile_id, role)
  values ((select v from t_ids where k = 'aorg'), (select v from t_ids where k = 'c1'), 'caregiver');

set local role authenticated;
select pg_temp.als('p1');
select pg_temp.geweigerd('activeren met één beheerder geweigerd',
  $q$select public.activeer_organisatie((select v from t_ids where k = 'aorg'), 'DPA-2026-001')$q$);
reset role;
insert into public.org_membership (org_id, profile_id, role)
  values ((select v from t_ids where k = 'aorg'), (select v from t_ids where k = 'ka2'), 'org_admin');

set local role authenticated;
select pg_temp.geweigerd('activeren zonder verwerkersovereenkomst geweigerd',
  $q$select public.activeer_organisatie((select v from t_ids where k = 'aorg'), '  ')$q$);
select public.activeer_organisatie((select v from t_ids where k = 'aorg'), 'DPA-2026-001');
select pg_temp.gelijk('na activatie: actief', pg_temp.q($q$select active::text from public.organisation where id = (select v from t_ids where k = 'aorg')$q$), 'true');

-- ---------------------------------------------------------------------
--  E. Beheerders binnen het WZC: minstens twee, en alles gelogd
-- ---------------------------------------------------------------------
select pg_temp.als('ka1');
select pg_temp.als('ka1');
select pg_temp.geweigerd('beheerder degradeert de tweede: één beheerder blijft over',
  $q$update public.org_membership set role = 'caregiver' where profile_id = (select v from t_ids where k = 'ka2') and org_id = (select v from t_ids where k = 'aorg')$q$);

-- Promoveren mag: drie beheerders. Daarna mag er één weg.
update public.org_membership set role = 'org_admin'
 where profile_id = (select v from t_ids where k = 'c1') and org_id = (select v from t_ids where k = 'aorg');
update public.org_membership set role = 'caregiver'
 where profile_id = (select v from t_ids where k = 'ka2') and org_id = (select v from t_ids where k = 'aorg');
select pg_temp.gelijk('na promoveren en degraderen: twee beheerders',
  pg_temp.q($q$select count(*)::text from public.org_membership where org_id = (select v from t_ids where k = 'aorg') and role = 'org_admin' and active$q$), '2');
select pg_temp.geweigerd('laatste-maar-één beheerder kan niet weg',
  $q$update public.org_membership set active = false where profile_id = (select v from t_ids where k = 'c1') and org_id = (select v from t_ids where k = 'aorg')$q$);

-- Elke wijziging van een beheerder staat in het platformlogboek.
reset role;
select pg_temp.gelijk('logboek: promotie en degradatie gelogd',
  pg_temp.q($q$select count(*)::text from public.platform_log where org_id = (select v from t_ids where k = 'aorg') and soort = 'beheerder_gewijzigd'$q$), '2');
select pg_temp.gelijk('logboek: beheerder uitgenodigd gelogd',
  pg_temp.q($q$select count(*)::text from public.platform_log where org_id = (select v from t_ids where k = 'aorg') and soort = 'beheerder_uitgenodigd'$q$), '1');

-- ---------------------------------------------------------------------
--  F. Bestaand WZC: dezelfde regels, en alleen de beheerder beëindigt een verblijf
-- ---------------------------------------------------------------------
set local role authenticated;
select pg_temp.als('oa');
select pg_temp.geweigerd('bestaand WZC: één beheerder kan de ander niet verwijderen',
  $q$delete from public.org_membership where profile_id = (select v from t_ids where k = 'oa2') and org_id = (select v from t_ids where k = 'org')$q$);

select pg_temp.als('co');
select pg_temp.geweigerd('coördinator beëindigt geen verblijf',
  $q$select public.beeindig_verblijf((select v from t_ids where k = 'hh'), 'verhuisd')$q$);

select pg_temp.als('oa');
select public.beeindig_verblijf((select v from t_ids where k = 'hh'), 'verhuisd');
select pg_temp.gelijk('beheerder beëindigt het verblijf', (select count(*) from public.stay where household_id = (select v from t_ids where k = 'hh') and ended_at is null), 0::bigint);

-- ---------------------------------------------------------------------
--  G. Aanvragen: de dagelijkse grens (5 per dag)
-- ---------------------------------------------------------------------
select pg_temp.als('aanv');
do $$
begin
  insert into t_ids values ('aq3', public.dien_org_aanvraag('Derde', '0200000001', '', 'Weg 3', 'Jan', 'jan@derde.be', '1'));
  insert into t_ids values ('aq4', public.dien_org_aanvraag('Vierde', '0200000002', '', 'Weg 4', 'Jan', 'jan@vierde.be', '1'));
  insert into t_ids values ('aq5', public.dien_org_aanvraag('Vijfde', '0200000003', '', 'Weg 5', 'Jan', 'jan@vijfde.be', '1'));
  raise notice 'ok: vijf aanvragen vandaag toegestaan';
end $$;
select pg_temp.geweigerd('zesde aanvraag vandaag geweigerd', $q$select public.dien_org_aanvraag('Zesde', '0200000004', '', 'Weg 6', 'Jan', 'jan@zesde.be', '1')$q$);

-- ---------------------------------------------------------------------
--  H. Een aanvrager ziet de eigen status, en niets van anderen
-- ---------------------------------------------------------------------
select pg_temp.gelijk('aanvrager ziet vijf eigen aanvragen', (select count(*) from public.mijn_org_aanvragen()), 5::bigint);
select pg_temp.als('vreemd');
select pg_temp.gelijk('vreemde ziet geen aanvragen', (select count(*) from public.mijn_org_aanvragen()), 0::bigint);

rollback;
