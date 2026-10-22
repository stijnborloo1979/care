-- =====================================================================
--  Test migratie 107: maaltijden per bewoner en de analyse.
--  Draai na 107_maaltijd_registratie.sql. Alles wordt teruggedraaid.
-- =====================================================================
begin;

create temp table resultaat (nr serial, omschrijving text, verwacht int, werkelijk int, ok boolean);
grant select, insert on resultaat to public;
grant usage on sequence resultaat_nr_seq to public;

-- Lokale stub: de tabellen die de test raakt, leesbaar voor authenticated.
grant select on public.organisation, public.household, public.stay, public.department,
  public.department_staff, public.org_membership, public.afdeling_dag, public.uitstap to authenticated;

do $$
declare
  org uuid := gen_random_uuid();
  dep uuid := gen_random_uuid();
  dep_andere uuid := gen_random_uuid();
  hh uuid := gen_random_uuid();
  u_team uuid := gen_random_uuid();     -- medewerker van de afdeling
  u_andere uuid := gen_random_uuid();   -- medewerker van een andere afdeling
  u_admin uuid := gen_random_uuid();    -- org admin: alleen analyse
  u_buiten uuid := gen_random_uuid();   -- niemand van deze organisatie
  m_ontbijt uuid := gen_random_uuid();  -- maaltijd op de afdeling
  m_rust uuid := gen_random_uuid();     -- geen maaltijd
  n int;
  cijfer int;
  vandaag date := (now() at time zone 'Europe/Brussels')::date;
begin
  insert into auth.users (id, email) values
    (u_team, 'team.107@test.be'), (u_andere, 'andere.107@test.be'), (u_admin, 'admin.107@test.be'), (u_buiten, 'buiten.107@test.be');
  insert into public.organisation (id, name) values (org, 'WZC 107');
  insert into public.org_membership (org_id, profile_id, role) values
    (org, u_team, 'caregiver'), (org, u_andere, 'caregiver'), (org, u_admin, 'org_admin');
  insert into public.department (id, org_id, name) values (dep, org, 'Afd 107'), (dep_andere, org, 'Afd anders');
  insert into public.department_staff (department_id, profile_id) values (dep, u_team), (dep_andere, u_andere);
  insert into public.household (id, person_name) values (hh, 'Bewoner 107');
  insert into public.stay (household_id, org_id, department_id, started_at)
    values (hh, org, dep, now() - interval '30 days');
  insert into public.afdeling_dag (id, org_id, department_id, titel, soort, begint) values
    (m_ontbijt, org, dep, 'Ontbijt', 'maaltijd', '08:00'),
    (m_rust, org, dep, 'Rust', 'rust', '14:00');

  set local role authenticated;

  -- 1. Medewerker van de afdeling registreert een maaltijd van vandaag: 1
  perform set_config('request.jwt.claims', json_build_object('sub', u_team::text, 'role', 'authenticated')::text, true);
  perform public.maaltijd_zet(hh, m_ontbijt, vandaag, 'gegeten', null);
  select count(*) into n from public.maaltijd_registratie where household_id = hh;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('afdelingsmedewerker registreert ontbijt', 1, n, n = 1);

  -- 2. Corrigeren: de laatste keuze telt, nog steeds één rij
  perform public.maaltijd_zet(hh, m_ontbijt, vandaag, 'half', 'Vandaag wat moe');
  select count(*) into n from public.maaltijd_registratie where household_id = hh and status = 'half';
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('correctie vervangt, geen tweede rij', 1, n, n = 1);

  -- 3. Medewerker van een andere afdeling registreert: geweigerd
  perform set_config('request.jwt.claims', json_build_object('sub', u_andere::text, 'role', 'authenticated')::text, true);
  begin
    perform public.maaltijd_zet(hh, m_ontbijt, vandaag, 'niet', null);
    n := 1;
  exception when insufficient_privilege then
    n := 0;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('medewerker van andere afdeling wordt geweigerd', 0, n, n = 0);

  -- 4. Team registreert van twee dagen terug: geweigerd
  perform set_config('request.jwt.claims', json_build_object('sub', u_team::text, 'role', 'authenticated')::text, true);
  begin
    perform public.maaltijd_zet(hh, m_ontbijt, vandaag - 2, 'niet', null);
    n := 1;
  exception when invalid_parameter_value then
    n := 0;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('registratie van twee dagen terug wordt geweigerd', 0, n, n = 0);

  -- 5. Een rust-moment is geen maaltijd: geweigerd
  begin
    perform public.maaltijd_zet(hh, m_rust, vandaag, 'niet', null);
    n := 1;
  exception when invalid_parameter_value then
    n := 0;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('rust-moment is geen maaltijd', 0, n, n = 0);

  -- 6. Team leest de eigen registratie: 1
  select count(*) into n from public.maaltijd_registratie where household_id = hh;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('team leest de registratie', 1, n, n = 1);

  -- 7. Analyse: de org admin ziet één verwachte maaltijd voor vandaag, waarvan één half gegeten
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin::text, 'role', 'authenticated')::text, true);
  select aantal_verwacht into n from public.maaltijd_analyse(org, vandaag, vandaag) where moment_titel = 'Ontbijt';
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('analyse: één verwachte maaltijd vandaag', 1, coalesce(n, -1), n = 1);
  select aantal_half into n from public.maaltijd_analyse(org, vandaag, vandaag) where moment_titel = 'Ontbijt';
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('analyse: die ene is half gegeten', 1, coalesce(n, -1), n = 1);

  -- 8. Analyse over twee dagen: gisteren niet geregistreerd, dus verwacht 2, geregistreerd 1
  select aantal_geregistreerd into n from public.maaltijd_analyse(org, vandaag - 1, vandaag) where moment_titel = 'Ontbijt';
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('analyse: gisteren telt als verwacht, niet als geregistreerd', 1, coalesce(n, -1), n = 1);

  -- 9. Een medewerker zonder org-lidmaatschap krijgt de analyse niet
  perform set_config('request.jwt.claims', json_build_object('sub', u_buiten::text, 'role', 'authenticated')::text, true);
  begin
    perform * from public.maaltijd_analyse(org, vandaag, vandaag);
    n := 1;
  exception when insufficient_privilege then
    n := 0;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('analyse alleen voor org-medewerkers', 0, n, n = 0);

  -- 10. Op uitstap zonder eten mee: de maaltijd telt niet meer als verwacht
  reset role;
  insert into public.uitstap (household_id, met_wie, vertrek, terug, status, eet_mee)
    values (hh, 'Els', now() - interval '2 days', now() + interval '1 day', 'gepland', false);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin::text, 'role', 'authenticated')::text, true);
  select aantal_verwacht into cijfer from public.maaltijd_analyse(org, vandaag - 1, vandaag) where moment_titel = 'Ontbijt';
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('uitstap zonder eten mee: geen verwachte maaltijd', 0, coalesce(cijfer, 0), coalesce(cijfer, 0) = 0);
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
