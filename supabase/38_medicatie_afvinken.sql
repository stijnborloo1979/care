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
--  Een agenda-item van het soort 'med' is gedaan zodra elke dosis uit zíjn
--  venster bevestigd is. Dat venster loopt van het einde van het vorige
--  medicatie-item tot een half uur na dit item. Dus:
--
--    - drie momenten op een dag? Het item van 08:30 vinkt af zodra de
--      ochtenddosis bevestigd is, niet pas 's avonds.
--    - een medicijn dat om 08:45 moet en een item van 08:30? Dat halve uur
--      speling vangt dat op — een item dekt de doses tot kort erna.
--    - een gemiste ochtenddosis? Die houdt de avond niet tegen. Elk item
--      staat op zichzelf.
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

  with vensters as (
    -- Elk medicatie-item krijgt zijn eigen venster: vanaf het einde van het
    -- vorige item tot een half uur na dit item. Zo hoort elke dosis bij één
    -- item, en houdt een gemiste ochtenddosis de avond niet tegen.
    --
    -- Dat laatste kwam uit de testen: met "alles van vóór dit tijdstip" bleef
    -- het item van 20:00 openstaan omdat die van 08:30 niet genomen was. Dan
    -- staat er 's avonds opnieuw "dit moet nog" bij iets wat net gebeurd is,
    -- en dat is precies de verwarring die we wilden wegnemen.
    -- Over álle medicatie-items van de dag, ook de al afgevinkte. Namen we
    -- alleen de openstaande, dan rekte het venster van een nieuw item terug
    -- tot het begin van de dag zodra de eerdere items al gedaan waren — en
    -- dan hield een oude dosis het alsnog tegen. Ook dat kwam uit de testen.
    select a.id,
           a.done_at,
           a.starts_at + interval '30 minutes' as tot,
           coalesce(
             lag(a.starts_at) over (order by a.starts_at) + interval '30 minutes',
             dag_van
           ) as vanaf
      from public.agenda_event a
     where a.household_id = hh
       and a.kind = 'med'
       and a.starts_at >= dag_van
       and a.starts_at < dag_tot
  ),
  klaar as (
    select v.id
      from vensters v
     where v.done_at is null
     -- Er moet iets te bevestigen zijn geweest: een item zonder enig
     -- medicijn in zijn venster vinkt niet vanzelf af.
     and exists (
       select 1 from public.medication_log m
        where m.household_id = hh
          and m.due_at >= v.vanaf
          and m.due_at < v.tot
     )
     -- En niets uit dat venster mag nog openstaan.
     and not exists (
       select 1 from public.medication_log m
        where m.household_id = hh
          and m.due_at >= v.vanaf
          and m.due_at < v.tot
          and m.taken_at is null
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
