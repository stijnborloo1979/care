-- =====================================================================
--  THUIS — een vinkje ongedaan maken werkt ook terug
--  Supabase migratie, versie 40
--
--  Draai dit na 38_medicatie_afvinken.sql.
--
--  Sinds 38 vinkt een bevestigd medicijn het item in de tijdlijn mee af. Maar
--  de andere kant op gebeurde er niets: zette zij "Medicatie nemen" weer op
--  ongedaan, dan bleef de kaart ernaast zeggen dat alles genomen was. Dezelfde
--  tegenspraak als voorheen, alleen in spiegelbeeld.
--
--  Waarom deze richting wél mag en de andere niet
--  ---------------------------------------------
--  Ongedaan maken is een uitspraak: "dit is niet gebeurd". Die uitspraak
--  overnemen maakt van "genomen" weer "nog te nemen" — de voorzichtige kant.
--  De app beweert dan niets meer dan wat iemand zelf gezegd heeft.
--
--  Omgekeerd blijft het bij wat 38 al zei: een vinkje zetten in de tijdlijn
--  bevestigt géén medicatie. Anders zou één tik op een algemeen agenda-item
--  in het dossier komen te staan als "medicijn genomen", en dat is precies
--  het soort bewering dat een app niet mag doen.
--
--  Dit stelt geen diagnose en vervangt geen zorg.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Welke doses horen bij dit item
--
--  Dezelfde toewijzing als in 38 — dichtstbijzijnde item, hoogstens vier uur
--  ernaast — maar nu op één plaats, zodat beide richtingen niet uit elkaar
--  kunnen groeien.
-- ---------------------------------------------------------------------

create or replace function public.med_doses_bij(item uuid)
returns table (dosis uuid, genomen timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hh      uuid;
  zone    text;
  dag_van timestamptz;
  dag_tot timestamptz;
begin
  select a.household_id, h.timezone
    into hh, zone
    from public.agenda_event a
    join public.household h on h.id = a.household_id
   where a.id = item and a.kind = 'med';

  if hh is null then
    return;
  end if;

  select date_trunc('day', a.starts_at at time zone zone) at time zone zone
    into dag_van
    from public.agenda_event a where a.id = item;
  dag_tot := dag_van + interval '1 day';

  return query
  with items as (
    select a.id, a.starts_at
      from public.agenda_event a
     where a.household_id = hh
       and a.kind = 'med'
       and a.starts_at >= dag_van
       and a.starts_at < dag_tot
  ),
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
  )
  select d.id, d.taken_at
    from doses d
   where d.item_id = item and d.afstand <= 4 * 3600;
end;
$$;

comment on function public.med_doses_bij(uuid) is
  'De medicijnen die bij dit agenda-item horen: het dichtstbijzijnde item wint, hoogstens vier uur ernaast.';


-- ---------------------------------------------------------------------
--  2. Hetzelfde, maar dan de kant op van 38
--
--  Vervangt de versie uit 38 zodat beide richtingen dezelfde toewijzing
--  gebruiken. Het gedrag blijft ongewijzigd.
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
  aantal  integer := 0;
  r       record;
begin
  select timezone into zone from public.household where id = hh;
  if zone is null then
    return 0;
  end if;

  dag_van := date_trunc('day', moment at time zone zone) at time zone zone;
  dag_tot := dag_van + interval '1 day';

  for r in
    select a.id
      from public.agenda_event a
     where a.household_id = hh
       and a.kind = 'med'
       and a.done_at is null
       and a.starts_at >= dag_van
       and a.starts_at < dag_tot
  loop
    -- Er moet iets te bevestigen zijn geweest, en niets mag nog openstaan.
    if exists (select 1 from public.med_doses_bij(r.id))
       and not exists (select 1 from public.med_doses_bij(r.id) where genomen is null)
    then
      update public.agenda_event set done_at = now() where id = r.id;
      aantal := aantal + 1;
    end if;
  end loop;

  return aantal;
end;
$$;


-- ---------------------------------------------------------------------
--  3. Ongedaan maken werkt terug
--
--  Alleen wanneer het vinkje weggaat. Een vinkje zetten laat de medicatie
--  met rust; zie de kop van dit bestand.
-- ---------------------------------------------------------------------

create or replace function public.med_agenda_ongedaan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'med' and old.done_at is not null and new.done_at is null then
    update public.medication_log m
       set taken_at = null, confirmed_by = null
      from public.med_doses_bij(new.id) d
     where m.id = d.dosis and m.taken_at is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists med_agenda_ongedaan_item on public.agenda_event;
create trigger med_agenda_ongedaan_item
  after update of done_at on public.agenda_event
  for each row execute function public.med_agenda_ongedaan();
