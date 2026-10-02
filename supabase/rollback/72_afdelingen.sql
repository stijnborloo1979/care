-- Terugdraaien van 72_afdelingen.sql
-- Weigert zolang er gearchiveerde afdelingen zijn: die zouden anders
-- ongemerkt weer actief worden.
do $$
begin
  if exists (select 1 from public.department where archived_at is not null) then
    raise exception 'Er zijn gearchiveerde afdelingen. Zet ze eerst terug of beslis bewust.';
  end if;
end
$$;
drop trigger if exists department_archief_via_functie on public.department;
drop function if exists public.archief_via_functie();
drop trigger if exists department_staff_archief on public.department_staff;
drop trigger if exists stay_afdeling_archief on public.stay;
drop function if exists public.afdeling_niet_gearchiveerd();
drop function if exists public.herstel_afdeling(uuid);
drop function if exists public.archiveer_afdeling(uuid);
alter table public.department drop column if exists archived_at;
