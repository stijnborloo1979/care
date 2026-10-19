-- =====================================================================
--  Test migratie 101: zorgtaken per afdeling.
--  Draai na 101_zorg_taak.sql. Alles wordt teruggedraaid.
-- =====================================================================
begin;

create temp table resultaat (nr serial, omschrijving text, verwacht int, werkelijk int, ok boolean);
grant select, insert on resultaat to public;
grant usage on sequence resultaat_nr_seq to public;

-- Lokale stub: zorgt dat authenticated de tabellen die de test raakt kan lezen en bewerken.
grant select, update on public.organisation to authenticated;
grant select, insert on public.department, public.department_staff, public.org_membership to authenticated;

do $$
declare
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  dep_a1 uuid := gen_random_uuid();
  dep_a2 uuid := gen_random_uuid();
  dep_b1 uuid := gen_random_uuid();
  u_admin_a uuid := gen_random_uuid();
  u_care_a1 uuid := gen_random_uuid();   -- medewerker op afdeling A1
  u_care_a2 uuid := gen_random_uuid();   -- medewerker op afdeling A2
  u_admin_b uuid := gen_random_uuid();
  t_a1 uuid := gen_random_uuid();
  t_a2 uuid := gen_random_uuid();
  n int;
begin
  insert into auth.users (id, email) values
    (u_admin_a, 'admin.a@test.be'), (u_care_a1, 'a1@test.be'),
    (u_care_a2, 'a2@test.be'), (u_admin_b, 'admin.b@test.be');
  insert into public.organisation (id, name) values (org_a, 'WZC A'), (org_b, 'WZC B');
  insert into public.org_membership (org_id, profile_id, role) values
    (org_a, u_admin_a, 'org_admin'), (org_a, u_care_a1, 'caregiver'),
    (org_a, u_care_a2, 'caregiver'), (org_b, u_admin_b, 'org_admin');
  insert into public.department (id, org_id, name) values
    (dep_a1, org_a, 'Afd A1'), (dep_a2, org_a, 'Afd A2'), (dep_b1, org_b, 'Afd B1');
  insert into public.department_staff (department_id, profile_id) values
    (dep_a1, u_care_a1), (dep_a2, u_care_a2);

  -- Taken aanmaken als beheerder A (in de superuser-context, zodat de test niet van de insert-policy afhangt)
  insert into public.zorg_taak (id, org_id, department_id, title, created_by) values
    (t_a1, org_a, dep_a1, 'Verband verschonen', u_admin_a),
    (t_a2, org_a, dep_a2, 'Medicatie bestellen', u_admin_a);

  set local role authenticated;

  -- 1. Medewerker A1 ziet de taak van A1: 1
  perform set_config('request.jwt.claim.sub', u_care_a1::text, true);
  select count(*) into n from public.zorg_taak where id = t_a1;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('medewerker A1 ziet taak van A1', 1, n, n = 1);

  -- 2. Medewerker A1 ziet de taak van A2 niet: 0
  select count(*) into n from public.zorg_taak where id = t_a2;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('medewerker A1 ziet taak van A2 niet', 0, n, n = 0);

  -- 3. Medewerker A1 vinkt zijn eigen taak af: 1 rij
  update public.zorg_taak set done_at = now(), done_by = u_care_a1 where id = t_a1;
  get diagnostics n = row_count;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('medewerker A1 vinkt eigen taak af', 1, n, n = 1);

  -- 4. Medewerker A1 vinkt taak van A2 niet af: 0 rijen
  update public.zorg_taak set done_at = now(), done_by = u_care_a1 where id = t_a2;
  get diagnostics n = row_count;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('medewerker A1 vinkt taak van A2 niet af', 0, n, n = 0);

  -- 5. Medewerker A1 maakt een taak aan op A2: geweigerd (insert-policy)
  begin
    insert into public.zorg_taak (org_id, department_id, title, created_by)
      values (org_a, dep_a2, 'Mag niet', u_care_a1);
    n := 1;
  exception when insufficient_privilege or others then
    n := 0;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('medewerker A1 maakt taak op A2 niet aan', 0, n, n = 0);

  -- 6. Beheerder A ziet beide taken: 2
  perform set_config('request.jwt.claim.sub', u_admin_a::text, true);
  select count(*) into n from public.zorg_taak where org_id = org_a;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('beheerder A ziet alle taken van A', 2, n, n = 2);

  -- 7. Beheerder B ziet niets van A: 0
  perform set_config('request.jwt.claim.sub', u_admin_b::text, true);
  select count(*) into n from public.zorg_taak where org_id = org_a;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('beheerder B ziet niets van A', 0, n, n = 0);

  -- 8. Taak aanmaken met een afdeling van een andere organisatie: 0
  begin
    insert into public.zorg_taak (org_id, department_id, title, created_by)
      values (org_a, dep_b1, 'Verkeerde afdeling', u_admin_a);
    n := 1;
  exception when others then
    n := 0;
  end;
  perform set_config('request.jwt.claim.sub', u_admin_a::text, true);
  insert into resultaat (omschrijving, verwacht, werkelijk, ok) values ('taak op afdeling van andere organisatie wordt geweigerd', 0, n, n = 0);
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
