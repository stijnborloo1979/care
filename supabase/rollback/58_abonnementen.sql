-- Terugdraaien van 58_abonnementen.sql. Niets in de app of in de
-- toegangsregels gebruikt dit al; de tabellen gaan weg, met hun inhoud.

drop trigger if exists stay_home_pauze on public.stay;
drop function if exists public.home_pauze_bij_verblijf();
drop function if exists public.actieve_bewoners(uuid, date, date, text);
drop function if exists public.has_entitlement(uuid, text);
drop function if exists public.mijn_entitlements(uuid);
drop function if exists public.entitlements_voor(uuid, timestamptz);
drop table if exists public.subscription;
drop function if exists public.subscription_controle();
drop table if exists public.plan;
drop table if exists public.entitlement;
