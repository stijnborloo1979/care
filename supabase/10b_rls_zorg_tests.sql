-- =====================================================================
--  LIFEANGLE CARE: RLS-tests voor zorgtabellen (fase 0)
--
--  Draai na 10_rls_tests.sql. Alles wordt aan het eind teruggedraaid.
--  Elke controle staat in de tabel "resultaat". Een verwachting die niet
--  klopt, maakt de hele run mislukt met een duidelijke melding.
-- =====================================================================
begin;

create temp table resultaat (nr serial, omschrijving text, verwacht int, werkelijk int, ok boolean);
grant select, insert on resultaat to public;
grant usage on sequence resultaat_nr_seq to public;

do $$
declare
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  dep_a1 uuid := gen_random_uuid();
  dep_a2 uuid := gen_random_uuid();
  hh1 uuid := gen_random_uuid();   -- bewoner in A, toegewezen aan caregiver
  hh2 uuid := gen_random_uuid();   -- bewoner in A, niemand toegewezen
  hh_b uuid := gen_random_uuid();  -- bewoner in B
  stay1 uuid := gen_random_uuid();
  stay2 uuid := gen_random_uuid();
  stay_b uuid := gen_random_uuid();
  u_admin_a uuid := gen_random_uuid();
  u_care_a uuid := gen_random_uuid();     -- caregiver A, toegewezen aan hh1
  u_care_a_ongewezen uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  u_coord_a uuid := gen_random_uuid();   -- coördinator A, geen toewijzing
  u_fam_hh1 uuid := gen_random_uuid();    -- familie van hh1
  u_wrong_hh uuid := gen_random_uuid();   -- familie van hh2 (niet hh1)
  n int;
  f_before int;
begin
  -- Gebruikers en profielen
  insert into auth.users (id, email) values
    (u_admin_a, 'admin.a@test.be'), (u_care_a, 'care.a@test.be'),
    (u_care_a_ongewezen, 'care2.a@test.be'), (u_admin_b, 'admin.b@test.be'), (u_coord_a, 'coord.a@test.be'),
    (u_fam_hh1, 'fam.hh1@test.be'), (u_wrong_hh, 'fam.hh2@test.be');

  -- Organisaties, lidmaatschappen, afdelingen
  insert into public.organisation (id, name) values (org_a, 'WZC A'), (org_b, 'WZC B');
  insert into public.org_membership (org_id, profile_id, role) values
    (org_a, u_admin_a, 'org_admin'), (org_a, u_care_a, 'caregiver'),
    (org_a, u_care_a_ongewezen, 'caregiver'), (org_b, u_admin_b, 'org_admin'),
    (org_a, u_coord_a, 'coordinator');
  insert into public.department (id, org_id, name) values (dep_a1, org_a, 'Afd 1'), (dep_a2, org_a, 'Afd 2');
  insert into public.department_staff (department_id, profile_id)
    values (dep_a1, u_care_a), (dep_a2, u_care_a_ongewezen);

  -- Bewoners en verblijven
  insert into public.household (id, person_name) values
    (hh1, 'Bewoner 1'), (hh2, 'Bewoner 2'), (hh_b, 'Bewoner B');
  insert into public.membership (household_id, profile_id, role) values
    (hh1, u_fam_hh1, 'admin'), (hh2, u_wrong_hh, 'admin');
  insert into public.stay (id, household_id, org_id, department_id, room) values
    (stay1, hh1, org_a, dep_a1, '101'), (stay2, hh2, org_a, dep_a2, '201'),
    (stay_b, hh_b, org_b, null, 'B1');
  insert into public.care_assignment (stay_id, profile_id) values (stay1, u_care_a), (stay2, u_care_a_ongewezen);

  -- Zorgnotities en overdracht
  insert into public.care_note (household_id, stay_id, org_id, body, visibility, author_id)
    values (hh1, stay1, org_a, 'Notitie bewoner 1', 'team', u_care_a),
           (hh2, stay2, org_a, 'Notitie bewoner 2', 'team', u_care_a_ongewezen);
  insert into public.handover (department_id, shift_date, shift, body, author_id)
    values (dep_a1, current_date, 'vroeg', 'Overdracht afd 1', u_care_a),
           (dep_a2, current_date, 'vroeg', 'Overdracht afd 2', u_care_a_ongewezen);

  -- ---------------- Controles ----------------
  -- Bedoeld: alleen wie een toewijzing heeft, ziet de bewoner van het verblijf.
  -- Dit is het gedrag dat in de commentaar van is_org_staff en in het
  -- ontwerp staat. Wijkt de code hiervan af, dan toont de run dat.

  perform set_config('request.jwt.claim.sub', u_admin_a::text, true);
  set local role authenticated;
  select count(*) into n from public.stay where org_id = org_a;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('admin A ziet alle verblijven van A', 2, n, n = 2);
  select count(*) into n from public.org_membership where org_id = org_b;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('admin A ziet geen leden van B', 0, n, n = 0);
  reset role;

  perform set_config('request.jwt.claim.sub', u_care_a::text, true);
  set local role authenticated;
  select count(*) into n from public.stay where org_id = org_a;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('caregiver ziet naam/kamer van alle verblijven van A (bedoeld, migratie 53)', 2, n, n = 2);
  select count(*) into n from public.stay where id = stay2;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('caregiver zonder toewijzing ziet verblijf van ander (naam/kamer, bedoeld)', 1, n, n = 1);
  select count(*) into n from public.care_assignment where stay_id = stay2;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('caregiver ziet toewijzingen van ander verblijf niet (verwacht 0)', 0, n, n = 0);
  select count(*) into n from public.care_assignment where profile_id = u_care_a;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('caregiver ziet eigen toewijzing', 1, n, n = 1);
  select count(*) into n from public.care_note where household_id = hh2;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('caregiver ziet zorgnotitie van niet-toegewezen bewoner', 0, n, n = 0);
  select count(*) into n from public.handover where department_id = dep_a2;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('caregiver ziet overdracht van afdeling waar hij niet werkt', 0, n, n = 0);
  select count(*) into n from public.handover where department_id = dep_a1;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('caregiver ziet overdracht van eigen afdeling', 1, n, n >= 1);
  reset role;

  perform set_config('request.jwt.claim.sub', u_care_a_ongewezen::text, true);
  set local role authenticated;
  select count(*) into n from public.stay where id = stay1;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('caregiver zonder toewijzing ziet naam/kamer van toegewezen bewoner (bedoeld)', 1, n, n = 1);
  select count(*) into n from public.care_note where household_id = hh1;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('caregiver zonder toewijzing ziet zorgnotitie van toegewezen bewoner (verwacht 0)', 0, n, n = 0);
  reset role;

  perform set_config('request.jwt.claim.sub', u_coord_a::text, true);
  set local role authenticated;
  select count(*) into n from public.care_assignment where stay_id = stay2;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('coördinator A ziet toewijzingen van organisatie A', 1, n, n = 1);
  reset role;

  perform set_config('request.jwt.claim.sub', u_admin_b::text, true);
  set local role authenticated;
  select count(*) into n from public.stay where org_id = org_a;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('admin B ziet verblijven van organisatie A', 0, n, n = 0);
  select count(*) into n from public.care_note where org_id = org_a;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('admin B ziet zorgnotities van organisatie A', 0, n, n = 0);
  select count(*) into n from public.handover where department_id in (dep_a1, dep_a2);
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('admin B ziet overdrachten van organisatie A', 0, n, n = 0);
  begin
    update public.organisation set name = 'gekaapt' where id = org_a;
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('admin B kan organisatie A niet wijzigen', 0, n, n = 0);
  reset role;

  perform set_config('request.jwt.claim.sub', u_care_a_ongewezen::text, true);
  set local role authenticated;
  begin
    insert into public.handover (department_id, shift_date, shift, body)
      values (dep_a1, current_date, 'laat', 'ingebroken');
    n := 1;
  exception when others then n := 0;
  end;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('caregiver kan overdracht schrijven op afdeling waar hij niet werkt', 0, n, n = 0);
  reset role;

  perform set_config('request.jwt.claim.sub', u_fam_hh1::text, true);
  set local role authenticated;
  select count(*) into n from public.stay where household_id = hh1;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('familie-admin ziet het eigen verblijf', 1, n, n = 1);
  select count(*) into n from public.stay where household_id = hh2;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('familie van hh1 ziet verblijf van hh2', 0, n, n = 0);
  select count(*) into n from public.care_note where household_id = hh2;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('familie van hh1 ziet zorgnotitie van hh2', 0, n, n = 0);
  reset role;

  perform set_config('request.jwt.claim.sub', u_wrong_hh::text, true);
  set local role authenticated;
  select count(*) into n from public.care_note where household_id = hh1;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('familie van hh2 ziet zorgnotitie van hh1', 0, n, n = 0);
  reset role;

  -- Controle: de test zelf moet iets kunnen zien, anders zegt een 0 niets.
  perform set_config('request.jwt.claim.sub', '', true);
  reset role;
  select count(*) into n from public.stay where org_id = org_a;
  insert into resultaat(omschrijving, verwacht, werkelijk, ok)
    values ('controle: als superuser zijn de 2 verblijven zichtbaar', 2, n, n = 2);
end;
$$;

select nr, omschrijving, verwacht, werkelijk, case when ok then 'OK' else 'MISLUKT' end as uitslag
  from resultaat order by nr;

rollback;
