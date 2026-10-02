-- Terugdraaien van 70_medewerkers_beheren.sql
-- Beëindigde afdelingsplaatsen en toewijzingen worden niet hersteld.
drop function if exists public.verleng_uitnodiging(uuid);
drop function if exists public.trek_uitnodiging_in(uuid);
drop trigger if exists org_membership_gevolg on public.org_membership;
drop function if exists public.medewerker_gevolg();
