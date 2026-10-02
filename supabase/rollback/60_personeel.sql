-- Terugdraaien van 60_personeel.sql. De koppelcode en openstaande
-- uitnodigingen van medewerkers gaan weg; lidmaatschappen, verblijven en
-- toewijzingen die via deze functies gemaakt zijn, blijven bestaan.

drop function if exists public.aanvaard_org_uitnodiging(text);
drop function if exists public.org_uitnodiging_bekijk(text);
drop function if exists public.nodig_medewerker_uit(uuid, text, text);
drop table if exists public.org_invitation;
drop function if exists public.zet_verblijf(uuid, uuid, text);
drop function if exists public.stop_toewijzing(uuid);
drop function if exists public.wijs_toe(uuid, uuid);
drop function if exists public.mag_toewijzen(uuid);
drop function if exists public.org_medewerkers(uuid);
drop function if exists public.mijn_bewoners(uuid);
drop function if exists public.mijn_organisaties();
drop function if exists public.mijn_wzc(uuid);
drop function if exists public.koppel_met_wzc(uuid, text);
drop function if exists public.nieuwe_koppelcode(uuid);
drop function if exists public.org_koppelcode(uuid);
drop index if exists public.organisation_koppelcode_idx;
alter table public.organisation drop column if exists koppelcode;
drop function if exists public.genereer_koppelcode();
