-- Terugdraaien van 73_zelfkaart.sql
drop trigger if exists person_card_zelf on public.person_card;
drop function if exists public.zelfkaart_controle();
