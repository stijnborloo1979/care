-- Terugdraaien van 108_menu.sql. Verwijdert het weekmenu en het logboek.
-- Gegevens die hierin staan gaan verloren; maak eerst een back-up.

drop function if exists public.menu_van_dag(uuid, date);
drop function if exists public.menu_publiceer(uuid, date, date);
drop function if exists public.menu_bewaar(uuid, date, text, text, text, text, text, text, text);

drop trigger if exists org_menu_log on public.org_menu;
drop trigger if exists org_menu_bewaak on public.org_menu;
drop function if exists public.org_menu_loggen();
drop function if exists public.org_menu_bewaak();

drop table if exists public.org_menu_logboek;
drop table if exists public.org_menu;
