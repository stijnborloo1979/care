-- Terugdraaien van 48_permissions.sql. Veilig: niets anders gebruikt deze
-- tabellen zolang 50 en later niet gedraaid zijn. Draai eerst de rollback
-- van 49 als die er is.
drop trigger if exists household_consent_sync on public.household;
drop trigger if exists consent_history_log on public.consent;
drop function if exists public.consent_sync_from_household();
drop function if exists public.consent_log_change();
drop table if exists public.consent_history;
drop table if exists public.consent;
drop table if exists public.role_permission;
drop table if exists public.permission;
