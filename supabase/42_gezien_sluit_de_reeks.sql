-- =====================================================================
--  THUIS — "gezien" sluit de reeks af
--  Supabase migratie, versie 42
--
--  Draai dit na 39_nogmaals_vragen.sql.
--
--  Sinds 39 telt een herhaalde vraag mee: "Maria vraagt of je eens belt
--  (3e keer)". Dat is bedoeld om aan te geven dat er nog niemand reageerde.
--
--  Maar heeft familie de melding weggeklikt — dus gezien — dan is die reeks
--  afgelopen. Vraagt zij daarna opnieuw, dan is dat een nieuwe vraag, geen
--  derde herhaling van de vorige. "3e keer" zou dan verwijten wat al
--  opgevolgd is, en dat is precies het soort druk dat je niet wil leggen op
--  familie die haar best doet.
--
--  Dus: gezien zet de teller op nul. De uren stilte blijven ook gelden, voor
--  het geval niemand de melding ooit wegklikt.
-- =====================================================================

create or replace function public.vraag_iets(
  hh        uuid,
  sleutel   text,
  niveau    text,
  tekst     text,
  wachttijd interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  vorige public.notification;
  n      integer := 0;
  body   text;
begin
  select * into vorige
    from public.notification
   where household_id = hh and dedupe_key = sleutel
   limit 1;

  -- De reeks loopt door zolang familie niet gereageerd heeft én ze niet al
  -- een uur oud is. Weggeklikt betekent gezien, en dan begint het opnieuw.
  if found
     and vorige.read_at is null
     and vorige.created_at > now() - interval '1 hour'
  then
    n := vorige.herhalingen + 1;
  end if;

  -- Te snel na de vorige melding: de vraag telt mee, maar we sturen niet
  -- opnieuw. Zij hoort op haar scherm hoe dan ook dat het gelukt is.
  --
  -- Was de vorige al gezien, dan telt die wachttijd niet: familie heeft
  -- gereageerd, dus een nieuwe vraag mag meteen door.
  if found
     and vorige.read_at is null
     and vorige.created_at > now() - wachttijd
  then
    update public.notification set herhalingen = n where id = vorige.id;
    return;
  end if;

  body := tekst;
  if n > 0 then
    body := body || ' (' || (n + 1)::text || 'e keer)';
  end if;

  delete from public.notification
   where household_id = hh and dedupe_key = sleutel;

  insert into public.notification (household_id, level, body, target_role, dedupe_key, herhalingen)
  values (hh, niveau, body, null, sleutel, n);
end;
$$;

revoke execute on function public.vraag_iets(uuid, text, text, text, interval) from public, authenticated;

comment on function public.vraag_iets(uuid, text, text, text, interval) is
  'Een vraag van de persoon aan familie. Herhalingen tellen mee zolang niemand reageerde; zodra de melding gezien is, begint de telling opnieuw.';
