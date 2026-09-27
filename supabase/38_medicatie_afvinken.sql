-- =====================================================================
--  THUIS — bevestigde medicatie vinkt de tijdlijn mee af
--  Supabase migratie, versie 38
--
--  Draai dit na 01_schema.sql.
--
--  Het probleem
--  ------------
--  De medicatiekaart zegt "Alles genomen voor vandaag", en drie centimeter
--  lager staat in de tijdlijn "08:30 Medicatie nemen" nog open. Twee
--  schermen die hetzelfde zouden moeten weten, en die elkaar tegenspreken.
--
--  Voor iemand met geheugenproblemen is dat erger dan een schoonheidsfout:
--  een openstaand vinkje betekent "dit moet nog", en het risico is dat ze
--  haar medicatie een tweede keer neemt.
--
--  De regel
--  --------
--  Een agenda-item van het soort 'med' op tijdstip T is gedaan zodra er van
--  die dag niets meer openstaat dat vóór T plus een half uur moest. Dus:
--
--  Elke dosis van die dag hoort bij het medicatie-item dat er het dichtst bij
--  ligt, en bij maar één. Een item is gedaan zodra elke dosis die erbij hoort
--  bevestigd is. Dus:
--
--    - een item van 08:30 en een medicijn om 10:00? Die horen bij elkaar.
--      Het item uit de routine en het medicijn uit het schema staan zelden op
--      precies hetzelfde uur, en daar mag het niet op stuklopen.
--    - drie momenten op een dag? Het item van 08:30 vinkt af zodra de
--      ochtenddosis bevestigd is, niet pas 's avonds.
--    - een gemiste ochtenddosis? Die houdt de avond niet tegen. Elk item
--      staat op zichzelf.
--    - een dosis die meer dan vier uur van elk item af ligt, hoort bij geen
--      enkel item en houdt er dus ook geen tegen.
--
--  Waarom alleen afvinken en nooit terugdraaien
--  -------------------------------------------
--  Een vinkje dat vanzelf terugspringt is verwarrend, en iemand kan het
--  item ook met de hand afgevinkt hebben. Zet familie een bevestiging
--  ongedaan, dan blijft het agenda-item dus staan; dat is de onschuldige
--  kant van de twee. De medicatiekaart blijft hoe dan ook de waarheid over
--  wat er werkelijk genomen is.
--
--  Dit stelt geen diagnose en vervangt geen zorg: het spiegelt alleen wat
--  familie of de persoon zelf al bevestigd heeft.
-- =====================================================================

create or replace function public.med_agenda_bijwerken(hh uuid, moment timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  zone   text;
  dag_van timestamptz;
  dag_tot timestamptz;
  aantal integer;
begin
  select timezone into zone from public.household where id = hh;
  if zone is null then
    return 0;
  end if;

  -- De dag zoals zij hem beleeft, in haar eigen tijdzone. Een dosis van
  -- 23:00 hoort niet bij de volgende ochtend.
  dag_van := date_trunc('day', moment at time zone zone) at time zone zone;
  dag_tot := dag_van + interval '1 day';

  with items as (
    select a.id, a.done_at, a.starts_at
      from public.agenda_event a
     where a.household_id = hh
       and a.kind = 'med'
       and a.starts_at >= dag_van
       and a.starts_at < dag_tot
  ),
  -- Elke dosis hoort bij het item dat er het dichtst bij ligt, en bij maar
  -- één item. Hoogstens vier uur ernaast: een dosis die daar verder van af
  -- ligt, hoort bij geen enkel item en houdt er dus ook geen tegen.
  --
  -- Dit verving een vaste vensterindeling, en daar was een goede reden voor:
  -- het item "Medicatie nemen" komt uit de routine en het medicijn uit het
  -- schema, en die twee staan zelden op precies hetzelfde uur. Een item van
  -- 08:30 met een medicijn om 10:00 vond zo niets in zijn venster en vinkte
  -- nooit af — terwijl de medicatiekaart "alles genomen" zei.
  doses as (
    select m.id,
           m.taken_at,
           (select i.id
              from items i
             order by abs(extract(epoch from (i.starts_at - m.due_at))), i.starts_at
             limit 1) as item_id,
           (select min(abs(extract(epoch from (i.starts_at - m.due_at))))
              from items i) as afstand
      from public.medication_log m
     where m.household_id = hh
       and m.due_at >= dag_van
       and m.due_at < dag_tot
  ),
  hoort_bij as (
    select id, taken_at, item_id from doses
     where item_id is not null and afstand <= 4 * 3600
  ),
  klaar as (
    select i.id
      from items i
     where i.done_at is null
       and exists (select 1 from hoort_bij d where d.item_id = i.id)
       and not exists (
         select 1 from hoort_bij d where d.item_id = i.id and d.taken_at is null
       )
  )
  update public.agenda_event a
     set done_at = now()
    from klaar k
   where a.id = k.id;

  get diagnostics aantal = row_count;
  return aantal;
end;
$$;

comment on function public.med_agenda_bijwerken(uuid, timestamptz) is
  'Vinkt de agenda-items van het soort med af zodra er die dag niets meer openstaat van voor dat tijdstip. Vinkt nooit iets terug.';


-- ---------------------------------------------------------------------
--  1. Bij het bevestigen van een medicijn
-- ---------------------------------------------------------------------

create or replace function public.med_log_gewijzigd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.taken_at is not null and (tg_op = 'INSERT' or old.taken_at is null) then
    perform public.med_agenda_bijwerken(new.household_id, new.due_at);
  end if;
  return new;
end;
$$;

drop trigger if exists med_log_vinkt_agenda on public.medication_log;
create trigger med_log_vinkt_agenda
  after insert or update of taken_at on public.medication_log
  for each row execute function public.med_log_gewijzigd();


-- ---------------------------------------------------------------------
--  2. Bij het klaarzetten van de dag
--
--  De agenda van morgen wordt 's nachts gemaakt, en een medicijn kan al
--  bevestigd zijn voor het bijbehorende item bestaat — bijvoorbeeld wanneer
--  familie de dag opnieuw laat klaarzetten. Dan moet het nieuwe item meteen
--  in de juiste stand staan.
-- ---------------------------------------------------------------------

create or replace function public.med_agenda_nieuw()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'med' and new.done_at is null then
    perform public.med_agenda_bijwerken(new.household_id, new.starts_at);
  end if;
  return new;
end;
$$;

drop trigger if exists med_agenda_nieuw_item on public.agenda_event;
create trigger med_agenda_nieuw_item
  after insert on public.agenda_event
  for each row execute function public.med_agenda_nieuw();


-- ---------------------------------------------------------------------
--  3. Eenmalig: wat vandaag al openstaat rechtzetten
-- ---------------------------------------------------------------------

do $$
declare
  h record;
begin
  for h in select id from public.household loop
    perform public.med_agenda_bijwerken(h.id, now());
  end loop;
end
$$;
