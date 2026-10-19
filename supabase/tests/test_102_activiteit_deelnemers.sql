-- =====================================================================
--  Test migratie 102: deelnemers uit het verblijf van de afdeling.
--  Draai na 102_activiteit_deelnemers_verblijf.sql. Alles wordt teruggedraaid.
-- =====================================================================
begin;

create temp table resultaat (nr serial, omschrijving text, verwacht int, werkelijk int, ok boolean);
grant select, insert on resultaat to public;
grant usage on sequence resultaat_nr_seq to public;

-- Lokale stub: authenticated mag de tabellen die de functie raakt lezen.
grant select on public.stay, public.activity, public.activity_participant to authenticated;

do $$
declare
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  dep_a1 uuid := gen_random_uuid();
  dep_a2 uuid := gen_random_uuid();
  hh1 uuid := gen_random_uuid();
  hh2 uuid := gen_random_uuid();
  hh3 uuid := gen_random_uuid();   -- op A2, niet op A1
  hh_oud uuid := gen_random_uuid(); -- op A1 maar vertrokken
  u_admin_a uuid := gen_random_uuid();
  u_care_a uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  act_a1 uuid := gen_random_uuid();
  act_b uuid := gen_random_uuid();
  n int;
  ok_fout boolean;
begin
  insert into auth.users (id, email) values
    (u_admin_a, 'admin.a@test.be'), (u_care_a, 'care.a@test.be'), (u_admin_b, 'admin.b@test.be');
  insert into public.organisation (id, name) values (org_a, 'WZC A'), (org_b, 'WZC B');
  insert into public.org_membership (org_id, profile_id, role) values
    (org_a, u_admin_a, 'org_admin'), (org_a, u_care_a, 'caregiver'), (org_b, u_admin_b, 'org_admin');
  insert into public.department (id, org_id, name) values
    (dep_a1, org_a, 'Afd A1'), (dep_a2, org_a, 'Afd A2');
  insert into public.household (id, person_name) values
    (hh1, 'Bewoner 1'), (hh2, 'Bewoner 2'), (hh3, 'Bewoner 3'), (hh_oud, 'Vertrokken');
  insert into public.stay (household_id, org_id, department_id, room, started_at, ended_at) values
    (hh1, org_a, dep_a1, '101', now() - interval '3 days', null),
    (hh2, org_a, dep_a1, '102', now() - interval '1 day', null),
    (hh3, org_a, dep_a2, '201', now() - interval '1 day', null),
    (hh_oud, org_a, dep_a1, '103', now() - interval '9 days', now() - interval '2 days');
  insert into public.activity (id, org_id, department_id, titel, starts_at) values
    (act_a1, org_a, dep_a1, 'Wandeling', now() + interval '1 day'),
    (act_b, org_b, null, 'Andere organisatie', now() + interval '1 day');
  -- Hh2 stond al op "afwezig" en mag die status behouden.
  insert into public.activity_participant (activity_id, household_id, status) values (act_a1, hh2, 'afwezig');

  -- 1. Beheerder A vult de activiteit van A1: alleen hh1 en hh2 komen erbij (hh1 nieuw, hh2 bestaat al): 1 nieuw
  perform set_config('request.jwt.claim.sub', u_admin_a::text, true);
  n := public.activiteit_deelnemers_uit_verblijf(act_a1);
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('eerste keer: 1 nieuwe deelnemer (hh1)', 1, n, n = 1);

  -- 2. Opnieuw aanroepen voegt niets toe: 0
  n := public.activiteit_deelnemers_uit_verblijf(act_a1);
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('tweede keer: idempotent, 0 nieuwe', 0, n, n = 0);

  -- 3. De status van hh2 is niet veranderd: afwezig blijft
  select count(*) into n from public.activity_participant where activity_id = act_a1 and household_id = hh2 and status = 'afwezig';
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('bestaande status blijft staan (afwezig)', 1, n, n = 1);

  -- 4. Vertrokken bewoner komt niet mee: 0
  select count(*) into n from public.activity_participant where activity_id = act_a1 and household_id = hh_oud;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('vertrokken bewoner wordt niet toegevoegd', 0, n, n = 0);

  -- 5. Bewoner van A2 komt niet mee: 0
  select count(*) into n from public.activity_participant where activity_id = act_a1 and household_id = hh3;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('bewoner van andere afdeling wordt niet toegevoegd', 0, n, n = 0);

  -- 6. Medewerker (caregiver) mag het niet: geweigerd
  perform set_config('request.jwt.claim.sub', u_care_a::text, true);
  ok_fout := false;
  begin
    perform public.activiteit_deelnemers_uit_verblijf(act_a1);
  exception when insufficient_privilege then
    ok_fout := true;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('caregiver kan geen deelnemers toevoegen', 1, case when ok_fout then 1 else 0 end, ok_fout);

  -- 7. Beheerder B mag de activiteit van A niet vullen: geweigerd
  perform set_config('request.jwt.claim.sub', u_admin_b::text, true);
  ok_fout := false;
  begin
    perform public.activiteit_deelnemers_uit_verblijf(act_a1);
  exception when insufficient_privilege then
    ok_fout := true;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('beheerder B kan activiteit van A niet vullen', 1, case when ok_fout then 1 else 0 end, ok_fout);

  -- 8. Activiteit zonder afdeling: geweigerd
  perform set_config('request.jwt.claim.sub', u_admin_b::text, true);
  ok_fout := false;
  begin
    perform public.activiteit_deelnemers_uit_verblijf(act_b);
  exception when invalid_parameter_value or others then
    ok_fout := true;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('activiteit zonder afdeling wordt geweigerd', 1, case when ok_fout then 1 else 0 end, ok_fout);
end
$$;

reset role;

select nr, omschrijving, verwacht, werkelijk, ok from resultaat order by nr;

do $$
begin
  if exists (select 1 from resultaat where not ok) then
    raise exception 'Een of meer controles faalden: zie de tabel hierboven';
  end if;
end
$$;

rollback;
