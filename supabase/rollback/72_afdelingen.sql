-- Terugdraaien van 72_afdelingen.sql
drop trigger if exists department_staff_archief on public.department_staff;
drop trigger if exists stay_afdeling_archief on public.stay;
drop function if exists public.afdeling_niet_gearchiveerd();
drop function if exists public.herstel_afdeling(uuid);
drop function if exists public.archiveer_afdeling(uuid);
-- Gearchiveerde afdelingen worden gewone afdelingen; de kolom gaat weg.
alter table public.department drop column if exists archived_at;
