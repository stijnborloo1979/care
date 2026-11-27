-- Terugdraaien van 110_tablet_ontkoppelen.sql
-- Haalt de functie en de trigger weg. Losgekoppelde self-kaarten blijven
-- los: die terugzetten zou een account zonder lidmaatschap weer "de
-- persoon" maken.

drop function if exists public.ontkoppel_tablet(uuid, uuid);

drop trigger if exists membership_person_weg on public.membership;
drop function if exists public.person_lid_weg();
