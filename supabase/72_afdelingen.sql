-- =====================================================================
--  LIFEANGLE Care — afdelingen hernoemen en archiveren
--  Supabase migratie, versie 72
--
--  Draai dit na 71_verblijf_beeindigen.sql.
--  Terugdraaien: supabase/rollback/72_afdelingen.sql
--  Tests: supabase/tests/test_72_afdelingen.sql
--
--  BESTAAND   een afdeling kon alleen aangemaakt worden. Hernoemen kon de
--             beheerder al rechtstreeks (policy department_write, 52), maar
--             er was geen scherm. Wissen kon ook, maar dan verloor de
--             geschiedenis van verblijven haar afdeling.
--  VOORGESTELD archiveren in plaats van wissen: archiveer_afdeling() en
--             herstel_afdeling(), alleen voor de beheerder. Archiveren kan
--             pas als er niemand meer verblijft; de medewerkers van die
--             afdeling (ook de team lead) verliezen hun plaats daar. Op een
--             gearchiveerde afdeling kan niemand nog verblijven of werken.
--  REDEN      gevraagd: afdelingen beheren.
--  RISICO     laag. Nieuwe kolom, nieuwe functies, twee nieuwe triggers die
--             alleen iets weigeren wat naar een gearchiveerde afdeling wijst.
-- =====================================================================

do $$
begin
  if to_regclass('public.department') is null then
    raise exception 'Draai eerst 52_stays.sql';
  end if;
end
$$;

alter table public.department add column if not exists archived_at timestamptz;

create or replace function public.archiveer_afdeling(afdeling uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  d public.department;
  n integer;
begin
  select * into d from public.department where id = afdeling;
  if d.id is null or public.org_role_of(d.org_id) is distinct from 'org_admin' then
    raise exception 'Alleen de beheerder van de organisatie' using errcode = '42501';
  end if;
  select count(*) into n from public.stay where department_id = afdeling and ended_at is null;
  if n > 0 then
    raise exception 'Er verblijven nog % bewoner(s) op deze afdeling. Verhuis hen eerst naar een andere afdeling.', n
      using errcode = '22023';
  end if;
  update public.department_staff
     set valid_until = greatest(valid_from, now())
   where department_id = afdeling and (valid_until is null or valid_until > now());
  update public.department set archived_at = coalesce(archived_at, now()) where id = afdeling;
end;
$$;

create or replace function public.herstel_afdeling(afdeling uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  d public.department;
begin
  select * into d from public.department where id = afdeling;
  if d.id is null or public.org_role_of(d.org_id) is distinct from 'org_admin' then
    raise exception 'Alleen de beheerder van de organisatie' using errcode = '42501';
  end if;
  update public.department set archived_at = null where id = afdeling;
end;
$$;

revoke execute on function public.archiveer_afdeling(uuid) from public, anon;
revoke execute on function public.herstel_afdeling(uuid) from public, anon;
grant execute on function public.archiveer_afdeling(uuid) to authenticated;
grant execute on function public.herstel_afdeling(uuid) to authenticated;

-- Niemand verblijft of werkt op een gearchiveerde afdeling.
create or replace function public.afdeling_niet_gearchiveerd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.department_id is not null
     and exists (select 1 from public.department where id = new.department_id and archived_at is not null) then
    raise exception 'Deze afdeling is gearchiveerd' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.afdeling_niet_gearchiveerd() from public, anon, authenticated;

drop trigger if exists stay_afdeling_archief on public.stay;
create trigger stay_afdeling_archief
  before insert or update of department_id on public.stay
  for each row execute function public.afdeling_niet_gearchiveerd();

drop trigger if exists department_staff_archief on public.department_staff;
create trigger department_staff_archief
  before insert or update of department_id on public.department_staff
  for each row execute function public.afdeling_niet_gearchiveerd();
