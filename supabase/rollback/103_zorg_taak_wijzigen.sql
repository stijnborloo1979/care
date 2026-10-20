-- Terugdraaien van 103_zorg_taak_wijzigen.sql.
drop trigger if exists zorg_taak_alleen_afvinken on public.zorg_taak;
drop function if exists public.zorg_taak_alleen_afvinken();
