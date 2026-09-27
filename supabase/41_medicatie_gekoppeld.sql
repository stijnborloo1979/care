-- =====================================================================
--  THUIS — het medicatieschema maakt zijn eigen items in de tijdlijn
--  Supabase migratie, versie 41
--
--  Draai dit na 38_medicatie_afvinken.sql en 40_medicatie_ongedaan.sql.
--
--  Waarom dit de vorige twee vervangt
--  ----------------------------------
--  38 en 40 koppelden een dosis aan een tijdlijnitem op afstand: het item dat
--  er het dichtst bij lag, hoogstens vier uur ernaast. Dat was een gok, en
--  gokken gaat mis. Bij Maria stond "Medicatie nemen" om 08:30 uit de routine,
--  Ibuprofen om 10:00 en Dafalgan om 14:00 uit het schema. De Ibuprofen werd
--  aan dat ene item gekoppeld en vinkte het af — terwijl er om 14:00 nog iets
--  moest. Het scherm zei "gedaan" bij iets dat nog te gebeuren stond.
--
--  De oorzaak is niet de afstand maar de koppeling zelf: het item kwam uit de
--  routine en het medicijn uit het schema, en die twee wisten niets van
--  elkaar.
--
--  Dus maakt het schema nu zijn eigen items. Eén item per moment, met dat
--  moment erin vastgelegd (agenda_event.med_moment). Dan is er niets meer te
--  raden:
--
--    - staan er drie medicijnen om 08:00, dan is dat één item dat pas afvinkt
--      als alle drie bevestigd zijn;
--    - staan er momenten om 08:00 en om 14:00, dan zijn dat twee items die
--      los van elkaar afvinken;
--    - een item zonder moment (met de hand gezet, of uit een routine) vinkt
--      nooit vanzelf af — de app raadt niet langer waar het over gaat.
--
--  Wat er met het oude routine-item gebeurt
--  ----------------------------------------
--  Zodra er voor een dag een medicatieschema is, verdwijnt een nog niet
--  afgevinkt "Medicatie nemen" dat niet aan een moment hangt. Anders staan er
--  twee kaarten voor hetzelfde, en één ervan werkt niet. Wat al afgevinkt is,
--  blijft staan: dat is geschiedenis.
--
--  Staat dat item in een routine, haal het daar dan weg — anders komt het
--  morgen terug en wordt het opnieuw opgeruimd. Dat werkt, maar het is
--  onnodig heen en weer.
-- =====================================================================

alter table public.agenda_event
  add column if not exists med_moment timestamptz;

comment on column public.agenda_event.med_moment is
  'Het medicatiemoment waar dit item bij hoort. Gevuld door het schema; met de hand gemaakte items hebben dit niet en vinken nooit vanzelf af.';

create unique index if not exists agenda_med_moment_idx
  on public.agenda_event (household_id, med_moment)
  where med_moment is not null;


-- ---------------------------------------------------------------------
--  1. Voor elk medicatiemoment een item
--
--  Idempotent: twee keer draaien maakt geen tweede item. Dat is nodig, want
--  dit wordt aangeroepen vanuit een trigger, vanuit het klaarzetten van de
--  dag, en met de hand.
-- ---------------------------------------------------------------------

create or replace function public.med_items_klaarzetten(hh uuid, moment timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  zone    text;
  dag_van timestamptz;
  dag_tot timestamptz;
  aantal  integer := 0;
begin
  select timezone into zone from public.household where id = hh;
  if zone is null then
    return 0;
  end if;

  dag_van := date_trunc('day', moment at time zone zone) at time zone zone;
  dag_tot := dag_van + interval '1 day';

  -- Eén item per moment waarop er iets te nemen valt.
  insert into public.agenda_event (household_id, starts_at, title, emoji, kind, med_moment)
  select distinct m.household_id, m.due_at, 'Medicatie nemen', '💊', 'med', m.due_at
    from public.medication_log m
   where m.household_id = hh
     and m.due_at >= dag_van
     and m.due_at < dag_tot
  on conflict do nothing;

  get diagnostics aantal = row_count;

  -- Staat er voor deze dag een schema, dan is een los "Medicatie nemen"
  -- zonder moment dubbel. Alleen wat nog openstaat: afgevinkte items zijn
  -- geschiedenis en blijven.
  if exists (
    select 1 from public.medication_log m
     where m.household_id = hh and m.due_at >= dag_van and m.due_at < dag_tot
  ) then
    delete from public.agenda_event a
     where a.household_id = hh
       and a.kind = 'med'
       and a.med_moment is null
       and a.done_at is null
       and a.starts_at >= dag_van
       and a.starts_at < dag_tot;
  end if;

  return aantal;
end;
$$;

grant execute on function public.med_items_klaarzetten(uuid, timestamptz) to authenticated;


-- ---------------------------------------------------------------------
--  2. Afvinken, nu zonder giswerk
--
--  Vervangt de versie uit 40. Een item met een moment vinkt af zodra elk
--  medicijn van dát moment bevestigd is. Een item zonder moment blijft met
--  rust.
-- ---------------------------------------------------------------------

create or replace function public.med_agenda_bijwerken(hh uuid, moment timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  zone    text;
  dag_van timestamptz;
  dag_tot timestamptz;
  aantal  integer;
begin
  select timezone into zone from public.household where id = hh;
  if zone is null then
    return 0;
  end if;

  dag_van := date_trunc('day', moment at time zone zone) at time zone zone;
  dag_tot := dag_van + interval '1 day';

  with klaar as (
    select a.id
      from public.agenda_event a
     where a.household_id = hh
       and a.kind = 'med'
       and a.med_moment is not null
       and a.done_at is null
       and a.med_moment >= dag_van
       and a.med_moment < dag_tot
       and exists (
         select 1 from public.medication_log m
          where m.household_id = hh and m.due_at = a.med_moment
       )
       and not exists (
         select 1 from public.medication_log m
          where m.household_id = hh and m.due_at = a.med_moment and m.taken_at is null
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


-- ---------------------------------------------------------------------
--  3. De doses die bij een item horen — nu een simpele gelijkheid
-- ---------------------------------------------------------------------

create or replace function public.med_doses_bij(item uuid)
returns table (dosis uuid, genomen timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.taken_at
    from public.agenda_event a
    join public.medication_log m
      on m.household_id = a.household_id and m.due_at = a.med_moment
   where a.id = item and a.kind = 'med' and a.med_moment is not null;
$$;


-- ---------------------------------------------------------------------
--  4. Een nieuw medicijn maakt meteen zijn item
-- ---------------------------------------------------------------------

create or replace function public.med_log_gewijzigd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.med_items_klaarzetten(new.household_id, new.due_at);
  end if;

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
--  5. Eenmalig: de bestaande dagen rechtzetten
-- ---------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select distinct household_id, due_at from public.medication_log
     where due_at > now() - interval '2 days'
  loop
    perform public.med_items_klaarzetten(r.household_id, r.due_at);
    perform public.med_agenda_bijwerken(r.household_id, r.due_at);
  end loop;
end
$$;
