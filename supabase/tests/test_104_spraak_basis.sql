-- =====================================================================
--  Test migratie 104: spraakbasis. Standaard uit, en alleen loggen als aan.
--  Draai na 104_spraak_basis.sql. Alles wordt teruggedraaid.
-- =====================================================================
begin;

create temp table resultaat (nr serial, omschrijving text, verwacht int, werkelijk int, ok boolean);
grant select, insert on resultaat to public;
grant usage on sequence resultaat_nr_seq to public;

grant select on public.organisation, public.org_membership to authenticated;

do $$
declare
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  u_care uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  r boolean;
  n int;
begin
  insert into auth.users (id, email) values (u_care, 'care@test.be'), (u_admin, 'admin@test.be');
  insert into public.organisation (id, name, spraak_lezen) values (org_a, 'WZC A', false), (org_b, 'WZC B', true);
  insert into public.org_membership (org_id, profile_id, role) values
    (org_a, u_care, 'caregiver'), (org_a, u_admin, 'org_admin'), (org_b, u_care, 'caregiver'), (org_b, u_admin, 'org_admin');

  -- 1. Standaard staat alles uit
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    select 'standaard: organisatie-schakelaar uit', 0, case when spraak_lezen then 1 else 0 end, not spraak_lezen
      from public.organisation where id = org_a;

  -- 2. Organisatie uit: niets vastgelegd
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_care::text, true);
  r := public.spraak_vraag_registreren(org_a, 'planning');
  reset role;
  select count(*) into n from public.spraak_log where org_id = org_a;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('organisatie uit: niets gelogd', 0, n, r = false and n = 0);

  -- 3. Organisatie aan, medewerker aan: wordt gelogd
  set local role authenticated;
  r := public.spraak_vraag_registreren(org_b, 'tijd_dienst');
  reset role;
  select count(*) into n from public.spraak_log where org_id = org_b;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('organisatie aan: vraag gelogd', 1, n, r = true and n = 1);

  -- 4. Medewerker zet eigen spraak uit: niet gelogd
  update public.org_membership set spraak_aan = false where org_id = org_b and profile_id = u_care;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_care::text, true);
  r := public.spraak_vraag_registreren(org_b, 'planning');
  reset role;
  select count(*) into n from public.spraak_log where org_id = org_b;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('medewerker uit: niet gelogd', 1, n, r = false and n = 1);

  -- 5. Ongeldige soort wordt geweigerd
  update public.org_membership set spraak_aan = true where org_id = org_b and profile_id = u_care;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', u_care::text, true);
    perform public.spraak_vraag_registreren(org_b, 'verzonnen');
    reset role;
    n := 1;
  exception when others then
    reset role;
    n := 0;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('ongeldige soort wordt geweigerd', 0, n, n = 0);

  -- 6. Opschonen wist alleen rijen ouder dan 30 dagen
  insert into public.spraak_log (org_id, profile_id, soort, created_at)
    values (org_b, u_care, 'overig', now() - interval '40 days');
  n := public.spraak_log_opschonen();
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('opschonen wist 1 rij van 40 dagen oud', 1, n, n = 1);
  select count(*) into n from public.spraak_log where org_id = org_b;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('recente rij blijft staan', 1, n, n = 1);

  -- 7. Beheerder ziet het auditlog van de eigen organisatie
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_admin::text, true);
  select count(*) into n from public.spraak_log where org_id = org_b;
  reset role;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('beheerder van B ziet eigen auditlog', 1, n, n = 1);
end
$$;

select nr, omschrijving, verwacht, werkelijk, ok from resultaat order by nr;

do $$
begin
  if exists (select 1 from resultaat where not ok) then
    raise exception 'Een of meer controles faalden: zie de tabel hierboven';
  end if;
end
$$;

rollback;
