-- =====================================================================
--  Test migratie 103: medewerkers vinken alleen af.
--  Draai na 103_zorg_taak_wijzigen.sql. Alles wordt teruggedraaid.
-- =====================================================================
begin;

create temp table resultaat (nr serial, omschrijving text, verwacht int, werkelijk int, ok boolean);
grant select, insert on resultaat to public;
grant usage on sequence resultaat_nr_seq to public;

do $$
declare
  org_a uuid := gen_random_uuid();
  dep_a1 uuid := gen_random_uuid();
  u_admin_a uuid := gen_random_uuid();
  u_care_a1 uuid := gen_random_uuid();
  t_a1 uuid := gen_random_uuid();
  fout boolean;
  n int;
begin
  insert into auth.users (id, email) values (u_admin_a, 'admin@test.be'), (u_care_a1, 'a1@test.be');
  insert into public.organisation (id, name) values (org_a, 'WZC A');
  insert into public.org_membership (org_id, profile_id, role) values
    (org_a, u_admin_a, 'org_admin'), (org_a, u_care_a1, 'caregiver');
  insert into public.department (id, org_id, name) values (dep_a1, org_a, 'Afd A1');
  insert into public.department_staff (department_id, profile_id) values (dep_a1, u_care_a1);
  insert into public.zorg_taak (id, org_id, department_id, title, created_by)
    values (t_a1, org_a, dep_a1, 'Verband verschonen', u_admin_a);

  -- 1. Medewerker vinkt af: toegestaan
  perform set_config('request.jwt.claims', json_build_object('sub', u_care_a1::text, 'role', 'authenticated')::text, true);
  fout := false;
  begin
    update public.zorg_taak set done_at = now(), done_by = u_care_a1 where id = t_a1;
  exception when others then fout := true;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('medewerker vinkt af (done_at)', 0, case when fout then 1 else 0 end, not fout);

  -- 2. Medewerker wijzigt de titel: geweigerd
  fout := false;
  begin
    update public.zorg_taak set title = 'Gewijzigd' where id = t_a1;
  exception when insufficient_privilege then fout := true;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('medewerker wijzigt titel: geweigerd', 1, case when fout then 1 else 0 end, fout);

  -- 3. Medewerker zet de taak weer open (done_at leeg): toegestaan
  fout := false;
  begin
    update public.zorg_taak set done_at = null, done_by = null where id = t_a1;
  exception when others then fout := true;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('medewerker zet taak weer open', 0, case when fout then 1 else 0 end, not fout);

  -- 4. Beheerder wijzigt de titel: toegestaan
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin_a::text, 'role', 'authenticated')::text, true);
  update public.zorg_taak set title = 'Verband verschonen (aangepast)' where id = t_a1;
  get diagnostics n = row_count;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('beheerder wijzigt titel', 1, n, n = 1);
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
