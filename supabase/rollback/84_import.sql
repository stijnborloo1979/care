-- Terugdraaien van 84_import.sql (alleen functies; geïmporteerde bewoners blijven)
drop function if exists public.nodig_familie_uit(uuid, text, text);
drop function if exists public.familie_status(uuid);
drop function if exists public.importeer_bewoners(uuid, jsonb, boolean);
drop trigger if exists household_import_org_vast on public.household;
drop function if exists public.import_org_vast();
alter table public.household drop column if exists import_org;
