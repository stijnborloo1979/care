-- =====================================================================
--  Test migratie 105: eigen spraak-schakelaar via spraak_aan_zetten.
--  Draai na 104 en 105. Alles wordt teruggedraaid.
-- =====================================================================
begin;

create temp table resultaat (nr serial, omschrijving text, verwacht int, werkelijk int, ok boolean);
grant select, insert on resultaat to public;
grant usage on sequence resultaat_nr_seq to public;
grant select, update on public.org_membership to authenticated;

do $$
declare
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  u_care uuid := gen_random_uuid();
  u_ander uuid := gen_random_uuid();
  r boolean;
  v boolean;
begin
  insert into auth.users (id, email) values (u_care, 'care@test.be'), (u_ander, 'ander@test.be');
  insert into public.organisation (id, name) values (org_a, 'WZC A'), (org_b, 'WZC B');
  insert into public.org_membership (org_id, profile_id, role, active) values
    (org_a, u_care, 'caregiver', true), (org_b, u_ander, 'caregiver', false);

  -- 1. Standaard aan
  select spraak_aan into v from public.org_membership where org_id = org_a and profile_id = u_care;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('standaard: eigen spraak aan', 1, case when v then 1 else 0 end, v);

  -- 2. Eigen spraak uitzetten lukt
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_care::text, true);
  r := public.spraak_aan_zetten(org_a, false);
  reset role;
  select spraak_aan into v from public.org_membership where org_id = org_a and profile_id = u_care;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('eigen spraak uitzetten: gelukt', 0, case when v then 1 else 0 end, r = true and v = false);

  -- 3. Zonder inloggen: geweigerd
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.spraak_aan_zetten(org_a, true);
    v := true;
  exception when insufficient_privilege then
    v := false;
  end;
  reset role;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('zonder login: geweigerd', 0, case when v then 1 else 0 end, v = false);

  -- 4. Geen actief lidmaatschap: niets gewijzigd, false
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_ander::text, true);
  r := public.spraak_aan_zetten(org_b, false);
  reset role;
  select spraak_aan into v from public.org_membership where org_id = org_b and profile_id = u_ander;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('inactief lidmaatschap: niets gewijzigd', 1, case when v then 1 else 0 end, r = false and v = true);

  -- 5. Raakt het andere lidmaatschap van iemand anders niet
  insert into public.org_membership (org_id, profile_id, role, active) values (org_a, u_ander, 'caregiver', true);
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_care::text, true);
  r := public.spraak_aan_zetten(org_a, true);
  reset role;
  select spraak_aan into v from public.org_membership where org_id = org_a and profile_id = u_ander;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('andere medewerker onveranderd', 1, case when v then 1 else 0 end, v = true);
end $$;

select omschrijving, verwacht, werkelijk, ok from resultaat order by nr;
select count(*) filter (where ok) as geslaagd, count(*) as totaal from resultaat;

rollback;
