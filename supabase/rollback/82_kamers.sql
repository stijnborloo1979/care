-- Terugdraaien van 82_kamers.sql
-- Weigert zodra er kamers zijn ingevoerd: dat is werk van het WZC.
-- stay.room blijft gewoon staan.
do $$
begin
  if to_regclass('public.kamer') is not null and exists (select 1 from public.kamer) then
    raise exception 'Er staan kamers in kamer. Bewaar of wis ze eerst bewust.';
  end if;
end
$$;
drop function if exists public.bezetting(uuid);
drop table if exists public.kamer;
drop function if exists public.kamer_check();
