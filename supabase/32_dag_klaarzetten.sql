-- =====================================================================
--  THUIS — de dag klaarzetten zonder op de nacht te wachten
--  Supabase migratie, versie 32
--
--  Draai dit na 06_nightly_job.sql en 18_medication.sql.
--
--  De agenda van de persoon wordt 's nachts gemaakt uit de routines, door
--  een job op pg_cron. Staat pg_cron niet aan — en dat moet je apart
--  inschakelen — dan gebeurt er nooit iets. Het gevolg is stil en
--  verwarrend: haar tijdlijn blijft leeg, "Wat nu?" weet niets, en er is
--  geen enkel medicatiemoment om te bevestigen. Niets wijst naar de
--  oorzaak; het lijkt gewoon of de app niets doet.
--
--  Een app die alleen werkt als iemand een databasejob heeft ingesteld, is
--  stuk. Dit laat familie de dag klaarzetten vanuit de app, en laat het
--  scherm van familie dat vanzelf doen zodra het merkt dat het nodig is.
--
--  De nachtjob blijft het beste: die draait ook als niemand de app opent.
--  Dit is het vangnet eronder.
-- =====================================================================

create or replace function public.dag_klaarzetten(hh uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tz       text;
  vandaag  date;
  morgen   date;
  n        integer := 0;
begin
  -- Familie, niet de persoon: dit maakt items op haar scherm aan.
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan de dag klaarzetten';
  end if;

  select timezone into tz from public.household where id = hh;
  if tz is null then
    raise exception 'Onbekend huishouden';
  end if;

  vandaag := (now() at time zone tz)::date;
  morgen  := vandaag + 1;

  n := public.materialise_day(hh, morgen);

  -- Vandaag alleen als er nog niets staat.
  --
  -- materialise_day zegt het zelf: verwijdert familie een item van vandaag,
  -- dan zet een herhaling het terug. Dat mag niet gebeuren omdat iemand
  -- toevallig het dashboard opent. Staat de dag helemaal leeg, dan is er
  -- niets om terug te zetten en is het veilig.
  if not exists (
    select 1 from public.agenda_event ae
     where ae.household_id = hh
       and (ae.starts_at at time zone tz)::date = vandaag
  ) then
    n := n + public.materialise_day(hh, vandaag);
  end if;

  perform public.ensure_medication_log(hh, vandaag);
  perform public.ensure_medication_log(hh, morgen);

  return n;
end;
$$;

grant execute on function public.dag_klaarzetten(uuid) to authenticated;

comment on function public.dag_klaarzetten(uuid) is
  'Zet de agenda en de medicatiemomenten van vandaag en morgen klaar uit de routines. Vandaag alleen als die nog helemaal leeg is. Vangnet voor wie pg_cron niet aan heeft staan.';
