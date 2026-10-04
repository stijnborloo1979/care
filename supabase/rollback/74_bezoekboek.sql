-- Terugdraaien van 74_bezoekboek.sql
-- Weigert zodra er bezoeken zijn vastgelegd: dat zijn herinneringen van de familie.
do $$
begin
  if to_regclass('public.visit_log') is not null and exists (select 1 from public.visit_log) then
    raise exception 'Er staan bezoeken in het bezoekboek. Bewaar of wis ze eerst bewust.';
  end if;
end
$$;
drop table if exists public.visit_log;
drop function if exists public.visit_log_tijd();
