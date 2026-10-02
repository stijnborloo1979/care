-- Terugdraaien van 52_stays.sql. Veilig zolang niets deze tabellen
-- gebruikt (tot en met 52). Verblijfsgeschiedenis gaat verloren;
-- household.org_id blijft staan.
drop trigger if exists household_stay_sync on public.household;
drop trigger if exists stay_einde on public.stay;
drop function if exists public.stay_volgt_org();
drop function if exists public.stay_einde_toewijzingen();
drop table if exists public.care_assignment;
drop table if exists public.stay;
drop table if exists public.department_staff;
drop table if exists public.department;
