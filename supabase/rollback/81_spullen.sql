-- Terugdraaien van 81_spullen.sql
-- Weigert zodra er spullen zijn vastgelegd: dat is werk van de familie.
do $$
begin
  if to_regclass('public.bezitting') is not null and exists (select 1 from public.bezitting) then
    raise exception 'Er staan spullen in bezitting. Bewaar of wis ze eerst bewust.';
  end if;
end
$$;
drop function if exists public.kwijt_op_afdeling(uuid);
drop function if exists public.markeer_gevonden(uuid);
drop function if exists public.meld_kwijt(uuid);
drop table if exists public.bezitting;
drop function if exists public.bezitting_check();
drop function if exists public.op_afdeling_van(uuid);
drop function if exists public.beheert_spullen(uuid);
