-- =====================================================================
--  Test migratie 100: alleen de beheerder zet concept_overdracht aan.
--  Draai na 100_overdracht_concept.sql. Alles wordt teruggedraaid.
-- =====================================================================
begin;

-- Lokale stub: authenticated heeft op organisation mogelijk geen update-recht.
-- In Supabase zelf is dat standaard zo; de RLS-policy beslist hier.
grant select, update on public.organisation to authenticated;

create temp table resultaat (nr serial, omschrijving text, verwacht int, werkelijk int, ok boolean);
grant select, insert on resultaat to public;
grant usage on sequence resultaat_nr_seq to public;

do $$
declare
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  u_admin_a uuid := gen_random_uuid();
  u_care_a uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  n int;
  nieuw boolean;
begin
  insert into auth.users (id, email) values
    (u_admin_a, 'admin.a@test.be'), (u_care_a, 'care.a@test.be'), (u_admin_b, 'admin.b@test.be');
  insert into public.organisation (id, name) values (org_a, 'WZC A'), (org_b, 'WZC B');
  insert into public.org_membership (org_id, profile_id, role) values
    (org_a, u_admin_a, 'org_admin'), (org_a, u_care_a, 'caregiver'), (org_b, u_admin_b, 'org_admin');

  -- 1. Beheerder A zet de vlag aan voor A: 1 rij
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_admin_a::text, true);
  update public.organisation set concept_overdracht = true where id = org_a;
  get diagnostics n = row_count;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('beheerder A zet vlag aan voor A', 1, n, n = 1);

  -- 2. Caregiver A probeert de vlag uit te zetten: 0 rijen
  perform set_config('request.jwt.claim.sub', u_care_a::text, true);
  update public.organisation set concept_overdracht = false where id = org_a;
  get diagnostics n = row_count;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('caregiver A kan vlag niet wijzigen', 0, n, n = 0);

  -- 3. Beheerder B probeert de vlag van A te wijzigen: 0 rijen
  perform set_config('request.jwt.claim.sub', u_admin_b::text, true);
  update public.organisation set concept_overdracht = false where id = org_a;
  get diagnostics n = row_count;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('beheerder B kan vlag van A niet wijzigen', 0, n, n = 0);

  -- 4. De vlag van A staat nog steeds aan (controle als de beheerder zelf)
  perform set_config('request.jwt.claim.sub', u_admin_a::text, true);
  select concept_overdracht into nieuw from public.organisation where id = org_a;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('vlag van A staat aan na de pogingen', 1, case when nieuw then 1 else 0 end, nieuw);
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
